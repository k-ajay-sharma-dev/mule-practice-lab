// The flow simulator: runs a design from the Flow Designer against a scenario, the way the Mule runtime would, and
// records what happened at every step.
//
//   simulate(design, scenario, test) → result
//
// scenario  what the outside world holds for one problem (src/sim/scenario.js explains every key):
//           { properties, systems: { http, db, queues, files, objectStore, calls }, defaultTrigger }
// test      one run: { name, trigger | triggers: [...], overrides, expect }
// result    { response, error, logs, trace, effects, runs, limit }
//
// The engine knows scopes, routers and error handling. What each processor does lives in behaviours.js.
import { COMPONENTS } from '../flow/catalog.js'
import { evalScript, evalValue } from './dw/index.js'
import { BEHAVIOURS, sourceEvent } from './behaviours.js'
import { DwError, MuleError, SimUnsupported, SqlError } from './errors.js'
import { allows, matchPath, queryOf, reasonPhrase } from './http.js'
import { brief, copy, isObject } from './values.js'

const START = Date.parse('2026-11-13T10:00:00Z')
const MAX_STEPS = 4000
const MAX_DEPTH = 40
const MAX_FOLLOW_ON = 60

// Which error types also count as a more general one, so a handler for the general type catches them.
function parentsOf(type) {
  const [ns, id] = type.split(':')
  const out = [type]
  if (id === 'CONNECTIVITY') out.push('MULE:CONNECTIVITY')
  if (id === 'RETRY_EXHAUSTED') out.push('MULE:RETRY_EXHAUSTED')
  if (ns === 'VALIDATION') out.push('VALIDATION:VALIDATION', 'MULE:VALIDATION')
  if (['UNAUTHORIZED', 'FORBIDDEN', 'CLIENT_SECURITY'].includes(id)) out.push('MULE:CLIENT_SECURITY', 'MULE:SECURITY')
  if (id === 'SECURITY') out.push('MULE:SECURITY')
  return out
}

// Does a handler's Type setting ("HTTP:CONNECTIVITY, HTTP:TIMEOUT", "ANY", "CONNECTIVITY") cover this error type?
export function handlerCovers(typeSetting, errorType) {
  const listed = String(typeSetting || 'ANY')
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean)
  if (!listed.length || listed.includes('ANY') || listed.includes('MULE:ANY')) return true
  const have = parentsOf(errorType.toUpperCase())
  return listed.some((t) => have.includes(t.includes(':') ? t : `MULE:${t}`))
}

class Stop extends Error {}

class Run {
  constructor(design, scenario, test) {
    this.design = design
    this.scenario = mergeScenario(scenario, test.overrides)
    this.t = 0 // simulated milliseconds since the run started
    this.uuidSeed = 1
    this.steps = 0
    this.logs = []
    this.trace = []
    this.runs = []
    this.pending = [] // messages handed to a queue a flow of this design listens on
    this.later = [] // Async scopes and batch jobs, which run after the flow that started them
    this.effects = { http: [], db: [], sent: [], emails: [], files: {}, objectStore: {}, acks: [], calls: [] }
    this.db = copy(this.scenario.systems?.db ?? { tables: {} })
    this.files = copy(this.scenario.systems?.files ?? {})
    this.stores = copy(this.scenario.systems?.objectStore ?? {})
    this.cache = {}
    this.roundRobin = {}
    this.httpCalls = {} // calls per endpoint, so an endpoint can answer differently on each call
  }

  // ---------- recording ----------

  tick(ms) {
    this.t += Math.max(0, Number(ms) || 0)
  }

  log(level, message, flow, source = 'logger') {
    this.logs.push({ t: this.t, level, message: typeof message === 'string' ? message : brief(message, 400), flow, source })
  }

  record(entry) {
    this.trace.push({ t: this.t, ...entry })
  }

  snapshot(event) {
    return { payload: copy(event.payload), mime: event.mime, attributes: copy(event.attributes), vars: copy(event.vars) }
  }

  // ---------- expressions ----------

  ctx(event, flow) {
    return {
      payload: event.payload,
      attributes: event.attributes,
      vars: event.vars,
      error: event.error ? errorValue(event.error) : undefined,
      correlationId: event.correlationId,
      properties: this.scenario.properties ?? {},
      now: new Date(START + this.t),
      flowName: flow?.name,
      uuidSeed: this.uuidSeed,
    }
  }

  // A setting's value: an expression is run, plain text has its ${property} placeholders filled.
  value(text, event, flow) {
    if (text === undefined || text === null || text === '') return text
    if (typeof text !== 'string') return text
    const ctx = this.ctx(event, flow)
    try {
      return evalValue(text, ctx)
    } catch (e) {
      throw asMuleError(e)
    } finally {
      this.uuidSeed = ctx.uuidSeed
    }
  }

  script(script, event, flow) {
    const ctx = this.ctx(event, flow)
    try {
      return evalScript(script, ctx)
    } catch (e) {
      throw asMuleError(e)
    } finally {
      this.uuidSeed = ctx.uuidSeed
    }
  }

  // ---------- running flows ----------

  flowByName(name) {
    return this.design.flows.find((f) => f.name === name)
  }

  // Runs one flow from its source event, handling errors with the flow's handlers.
  // Returns { event, error } where error is the Mule error the flow ended with, if any.
  runFlow(flow, event, depth = 0) {
    const run = { flow: flow.name, start: this.t, ok: true }
    this.runs.push(run)
    this.record({ kind: 'flow-start', flow: flow.name, depth, text: `Flow ${flow.name} starts`, ...this.snapshot(event) })
    try {
      const out = this.list(flow.steps, event, flow, depth + 1)
      this.record({ kind: 'flow-end', flow: flow.name, depth, text: `Flow ${flow.name} ends`, ...this.snapshot(out) })
      run.end = this.t
      return { event: out }
    } catch (e) {
      if (!(e instanceof MuleError)) throw e
      const handled = this.handle(flow.errorHandlers ?? [], e, flow, depth + 1, flow.kind !== 'sub-flow')
      run.end = this.t
      if (handled.continued) {
        this.record({ kind: 'flow-end', flow: flow.name, depth, text: `Flow ${flow.name} ends as a success (error handled)`, ...this.snapshot(handled.event) })
        return { event: handled.event }
      }
      run.ok = false
      run.error = e.type
      this.record({ kind: 'flow-error', flow: flow.name, depth, text: `Flow ${flow.name} ends with ${e.type}`, error: errorBrief(e), ...this.snapshot(handled.event) })
      return { event: handled.event, error: handled.error }
    }
  }

  // Finds the first handler that covers the error and runs it.
  //   { continued: true, event }   On Error Continue: the error is handled
  //   { event, error }             On Error Propagate, or no handler: the error carries on
  handle(handlers, error, flow, depth, defaultHandler) {
    const failed = { ...error.event, error }
    for (const h of handlers) {
      if (!handlerCovers(h.config?.type, error.type)) continue
      if (h.config?.when && !truthy(this.value(h.config.when, failed, flow))) continue
      const label = COMPONENTS[h.type]?.label ?? h.type
      this.record({ kind: 'handler', id: h.id, type: h.type, flow: flow.name, depth, text: `${label} (${h.config?.type || 'ANY'}) catches ${error.type}`, error: errorBrief(error) })
      let event
      try {
        event = this.list(h.steps ?? [], failed, flow, depth + 1)
      } catch (inner) {
        if (!(inner instanceof MuleError)) throw inner
        // an error inside a handler replaces the one it was handling
        return { event: { ...inner.event, error: inner }, error: inner }
      }
      if (h.type === 'on-error-continue') return { continued: true, event: { ...event, error: undefined } }
      return { event, error: withEvent(error, event) }
    }
    // Mule's default error handler logs the error and lets it carry on
    if (defaultHandler) this.log('ERROR', `Message: ${error.description}\nError type: ${error.type}`, flow.name, 'runtime')
    return { event: failed, error }
  }

  // Runs a list of steps in order; each step gets the event the one before it left.
  list(steps, event, flow, depth) {
    let current = event
    for (const node of steps ?? []) current = this.node(node, current, flow, depth)
    return current
  }

  node(node, event, flow, depth) {
    if (++this.steps > MAX_STEPS) throw new Stop('The run took more than 4,000 steps, so it was stopped. A loop may never end.')
    if (depth > MAX_DEPTH) throw new Stop('Flow References call each other too deeply, so the run was stopped. Two flows may call each other in a loop.')
    const def = COMPONENTS[node.type]
    const label = def?.label ?? node.type
    const base = { id: node.id, type: node.type, flow: flow.name, depth, label }
    const before = this.t
    try {
      const out = this.inner(node, def, event, flow, depth, base)
      return out
    } catch (e) {
      if (e instanceof MuleError) {
        if (!e.event) e.event = event
        if (!e.recorded) {
          e.recorded = true
          this.record({ ...base, kind: 'error', text: `${label} raised ${e.type}`, error: errorBrief(e), ms: this.t - before })
        }
      }
      throw e
    }
  }

  inner(node, def, event, flow, depth, base) {
    const c = node.config ?? {}
    const before = this.t
    const done = (out, text, extra = {}) => {
      this.record({ ...base, kind: 'step', text, ms: this.t - before, ...this.snapshot(out), ...extra })
      return out
    }
    switch (node.type) {
      case 'flow-ref':
        return this.flowRef(node, event, flow, depth, base)
      case 'choice':
        return this.choice(node, event, flow, depth, base)
      case 'scatter-gather':
        return this.scatterGather(node, event, flow, depth, base)
      case 'first-successful':
        return this.firstSuccessful(node, event, flow, depth, base)
      case 'round-robin': {
        const i = (this.roundRobin[node.id] = ((this.roundRobin[node.id] ?? -1) + 1) % Math.max(1, node.routes.length))
        this.record({ ...base, kind: 'route', text: `Round Robin sends this message to route ${i + 1}` })
        return this.list(node.routes[i]?.steps, event, flow, depth + 1)
      }
      case 'foreach':
        return this.forEach(node, event, flow, depth, base)
      case 'parallel-foreach':
        return this.parallelForEach(node, event, flow, depth, base)
      case 'try':
        return this.tryScope(node, event, flow, depth, base)
      case 'until-successful':
        return this.untilSuccessful(node, event, flow, depth, base)
      case 'async': {
        const copyOf = { ...event, vars: copy(event.vars), payload: copy(event.payload) }
        this.later.push({ label: 'Async scope', flow, depth, run: () => this.list(node.steps, copyOf, flow, depth + 1) })
        return done(event, 'Async scope: its steps run on their own after this flow moves on. The flow does not wait for them.')
      }
      case 'cache':
        return this.cacheScope(node, event, flow, depth, base)
      case 'batch-job':
        return this.batchJob(node, event, flow, depth, base)
      default: {
        const behaviour = BEHAVIOURS[node.type]
        if (!behaviour) return done(event, `${base.label}: the simulator passes the message on unchanged, because it does not model this component yet.`, { note: 'not simulated' })
        const result = behaviour({ node, c, event: { ...event, vars: { ...event.vars } }, run: this, flow, label: base.label })
        return done(result.event, result.text, result.extra)
      }
    }
  }

  flowRef(node, event, flow, depth, base) {
    const name = String(this.value(node.config?.name, event, flow) ?? '').trim()
    const target = this.flowByName(name)
    if (!target) throw new MuleError('MULE:ROUTING', `There is no flow or sub-flow named "${name}".`)
    this.record({ ...base, kind: 'step', text: `Flow Reference calls ${target.kind === 'sub-flow' ? 'sub-flow' : 'flow'} ${name}` })
    let out
    if (target.kind === 'sub-flow') out = this.list(target.steps, event, target, depth + 1)
    else {
      const r = this.runFlow(target, event, depth + 1)
      if (r.error) throw withEvent(r.error, r.event)
      out = r.event
    }
    const into = node.config?.target
    if (into) {
      const kept = { ...event, vars: { ...out.vars, [into]: out.payload } }
      this.record({ ...base, kind: 'step', text: `The result of ${name} is kept in vars.${into}; the payload is unchanged`, ...this.snapshot(kept) })
      return kept
    }
    return out
  }

  choice(node, event, flow, depth, base) {
    for (const [i, route] of (node.routes ?? []).entries()) {
      const expr = route.config?.expression
      const pass = truthy(this.value(expr, event, flow))
      if (pass) {
        this.record({ ...base, kind: 'route', text: `Choice takes route ${i + 1}: ${expr} is true` })
        return this.list(route.steps, event, flow, depth + 1)
      }
    }
    this.record({ ...base, kind: 'route', text: 'Choice takes the default route: no condition is true' })
    return this.list(node.otherwise ?? [], event, flow, depth + 1)
  }

  scatterGather(node, event, flow, depth, base) {
    this.record({ ...base, kind: 'route', text: `Scatter-Gather sends a copy of the message down all ${node.routes.length} routes` })
    const results = {}
    const failures = {}
    let vars = { ...event.vars }
    const start = this.t
    let longest = 0
    for (const [i, route] of node.routes.entries()) {
      this.t = start
      try {
        const out = this.list(route.steps, { ...event, vars: { ...event.vars } }, flow, depth + 1)
        results[i] = { payload: out.payload, attributes: out.attributes }
        vars = { ...vars, ...out.vars }
      } catch (e) {
        if (!(e instanceof MuleError)) throw e
        failures[i] = errorValue(e)
      }
      longest = Math.max(longest, this.t - start)
    }
    this.t = start + longest // the routes run at the same time, so the scope takes as long as the slowest
    if (Object.keys(failures).length) {
      throw new MuleError('MULE:COMPOSITE_ROUTING', `Exception(s) were found for route(s): ${Object.keys(failures).join(', ')}`, {
        errorMessage: { payload: { results, failures } },
      })
    }
    const out = { ...event, payload: results, mime: 'application/java', vars }
    this.record({ ...base, kind: 'step', text: 'Scatter-Gather joins the results: payload."0".payload, payload."1".payload, …', ...this.snapshot(out) })
    return out
  }

  firstSuccessful(node, event, flow, depth, base) {
    for (const [i, route] of node.routes.entries()) {
      try {
        this.record({ ...base, kind: 'route', text: `First Successful tries route ${i + 1}` })
        return this.list(route.steps, event, flow, depth + 1)
      } catch (e) {
        if (!(e instanceof MuleError)) throw e
      }
    }
    throw new MuleError('MULE:ROUTING', 'All routes of First Successful failed.')
  }

  forEach(node, event, flow, depth, base) {
    const items = asList(this.value(node.config?.collection || '#[payload]', event, flow))
    const size = Math.max(1, Number(node.config?.batchSize) || 1)
    this.record({ ...base, kind: 'route', text: `For Each runs ${Math.ceil(items.length / size)} time(s)` })
    let vars = { ...event.vars }
    for (let i = 0; i < items.length; i += size) {
      const item = size > 1 ? items.slice(i, i + size) : items[i]
      const out = this.list(node.steps, { ...event, payload: copy(item), vars: { ...vars, counter: i / size + 1, rootMessage: { payload: event.payload, attributes: event.attributes } } }, flow, depth + 1)
      vars = { ...out.vars }
    }
    delete vars.counter
    delete vars.rootMessage
    // after the loop the payload is what it was before; variables changed inside the loop keep their new values
    const out = { ...event, vars }
    this.record({ ...base, kind: 'step', text: 'For Each ends: the payload is back to what it was before the loop', ...this.snapshot(out) })
    return out
  }

  parallelForEach(node, event, flow, depth, base) {
    const items = asList(this.value(node.config?.collection || '#[payload]', event, flow))
    this.record({ ...base, kind: 'route', text: `Parallel For Each runs ${items.length} copies at the same time` })
    const results = []
    const failures = {}
    const start = this.t
    let longest = 0
    items.forEach((item, i) => {
      this.t = start
      try {
        const out = this.list(node.steps, { ...event, payload: copy(item), vars: { ...event.vars } }, flow, depth + 1)
        results.push({ payload: out.payload, attributes: out.attributes })
      } catch (e) {
        if (!(e instanceof MuleError)) throw e
        failures[i] = errorValue(e)
      }
      longest = Math.max(longest, this.t - start)
    })
    this.t = start + longest
    if (Object.keys(failures).length) {
      throw new MuleError('MULE:COMPOSITE_ROUTING', `Exception(s) were found for route(s): ${Object.keys(failures).join(', ')}`, { errorMessage: { payload: { results, failures } } })
    }
    // variables set inside the copies are not kept
    const out = { ...event, payload: results, mime: 'application/java' }
    this.record({ ...base, kind: 'step', text: 'Parallel For Each ends: the payload is the list of results; variables set inside are not kept', ...this.snapshot(out) })
    return out
  }

  tryScope(node, event, flow, depth, base) {
    try {
      return this.list(node.steps, event, flow, depth + 1)
    } catch (e) {
      if (!(e instanceof MuleError)) throw e
      const handled = this.handle(node.errorHandlers ?? [], e, flow, depth + 1, false)
      if (handled.continued) {
        this.record({ ...base, kind: 'step', text: 'Try handled the error, so the flow carries on after the Try', ...this.snapshot(handled.event) })
        return handled.event
      }
      throw withEvent(handled.error, handled.event)
    }
  }

  untilSuccessful(node, event, flow, depth, base) {
    const retries = Math.max(0, Number(node.config?.maxRetries ?? 5))
    const wait = Math.max(0, Number(node.config?.millisBetweenRetries ?? 60000))
    let last
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      try {
        if (attempt > 1) {
          this.tick(wait)
          this.record({ ...base, kind: 'route', text: `Until Successful waits ${wait} ms and tries again (attempt ${attempt} of ${retries + 1})` })
        }
        return this.list(node.steps, event, flow, depth + 1)
      } catch (e) {
        if (!(e instanceof MuleError)) throw e
        last = e
        this.log('ERROR', `Retrying execution of event, attempt ${attempt} of ${retries + 1}. ${e.type}: ${e.description}`, flow.name, 'runtime')
      }
    }
    throw new MuleError('MULE:RETRY_EXHAUSTED', `'until-successful' retries exhausted. Last error: ${last.type}: ${last.description}`, { cause: errorValue(last) })
  }

  cacheScope(node, event, flow, depth, base) {
    const key = `${node.config?.cachingStrategy || 'default'}|${JSON.stringify(event.payload ?? null)}`
    if (this.cache[key]) {
      const hit = { ...event, payload: copy(this.cache[key].payload), mime: this.cache[key].mime }
      this.record({ ...base, kind: 'step', text: 'Cache hit: the steps inside are skipped and the stored answer is used', ...this.snapshot(hit) })
      return hit
    }
    this.record({ ...base, kind: 'route', text: 'Cache miss: the steps inside run and their answer is stored' })
    const out = this.list(node.steps, event, flow, depth + 1)
    this.cache[key] = { payload: copy(out.payload), mime: out.mime }
    return out
  }

  batchJob(node, event, flow, depth, base) {
    const records = asList(event.payload)
    const name = node.config?.jobName || 'batch-job'
    const max = Number(node.config?.maxFailedRecords ?? 0)
    const job = { records, name }
    this.later.push({
      label: `Batch job ${name}`,
      flow,
      depth,
      run: () => {
        const state = records.map((r) => ({ payload: copy(r), vars: { ...event.vars }, failed: null }))
        const stepResults = {}
        let failedCount = 0
        let stopped = false
        this.record({ ...base, kind: 'route', depth, text: `Batch job ${name} loads ${records.length} record(s)` })
        for (const route of node.routes ?? []) {
          const stepName = route.config?.name || 'step'
          const policy = route.config?.acceptPolicy || 'NO_FAILURES'
          const counts = { successfulRecords: 0, failedRecords: 0 }
          for (const rec of state) {
            if (stopped) break
            const accepted = policy === 'ALL' || (policy === 'NO_FAILURES' ? !rec.failed : Boolean(rec.failed))
            if (!accepted) continue
            if (route.config?.acceptExpression && !truthy(this.value(route.config.acceptExpression, { ...event, payload: rec.payload, vars: rec.vars }, flow))) continue
            try {
              const out = this.list(route.steps, { ...event, payload: rec.payload, vars: rec.vars }, flow, depth + 1)
              rec.payload = out.payload
              rec.vars = out.vars
              counts.successfulRecords++
            } catch (e) {
              if (!(e instanceof MuleError)) throw e
              if (!rec.failed) failedCount++
              rec.failed = errorValue(e)
              counts.failedRecords++
              if (max >= 0 && failedCount > max) {
                stopped = true
                this.log('ERROR', `Batch job ${name} stopped: ${failedCount} failed record(s) is more than Max failed records (${max})`, flow.name, 'runtime')
              }
            }
          }
          stepResults[stepName] = counts
        }
        const result = {
          batchJobInstanceId: `${name}-1`,
          totalRecords: records.length,
          loadedRecords: records.length,
          processedRecords: state.filter((r) => r.failed || !stopped).length,
          successfulRecords: state.filter((r) => !r.failed).length,
          failedRecords: failedCount,
          failedOnInputPhase: false,
          failedOnLoadingPhase: false,
          failedOnCompletePhase: false,
          elapsedTimeInMillis: this.t,
          batchStepResults: stepResults,
        }
        this.record({ ...base, kind: 'route', depth, text: `Batch job ${name} On Complete: ${result.successfulRecords} successful, ${result.failedRecords} failed` })
        this.list(node.onComplete ?? [], { ...event, payload: result, mime: 'application/java' }, flow, depth + 1)
      },
    })
    const out = { ...event, payload: { batchJobInstanceId: `${name}-1`, recordCount: job.records.length }, mime: 'application/java' }
    this.record({ ...base, kind: 'step', text: `Batch job ${name} is started for ${records.length} record(s). It runs on its own; the flow does not wait.`, ...this.snapshot(out) })
    return out
  }

  // Runs what was left for later: Async scopes, batch jobs and messages to queues this design listens on.
  drain() {
    let n = 0
    while ((this.later.length || this.pending.length) && n++ < MAX_FOLLOW_ON) {
      if (this.later.length) {
        const job = this.later.shift()
        this.record({ kind: 'flow-start', flow: job.flow.name, depth: job.depth, text: `${job.label} runs now` })
        try {
          job.run()
        } catch (e) {
          if (!(e instanceof MuleError)) throw e
          this.log('ERROR', `${job.label} failed. ${e.type}: ${e.description}`, job.flow.name, 'runtime')
        }
        continue
      }
      const msg = this.pending.shift()
      deliver(this, msg)
    }
  }
}

// ---------- helpers ----------

function mergeScenario(scenario = {}, overrides = {}) {
  const base = copy(scenario) ?? {}
  if (!overrides) return base
  base.properties = { ...(base.properties ?? {}), ...(overrides.properties ?? {}) }
  base.systems = { ...(base.systems ?? {}) }
  const o = overrides.systems ?? overrides
  if (o.http) {
    // an override for an endpoint replaces that endpoint, matched on method and path
    const key = (e) => `${(e.method || '*').toUpperCase()} ${e.path}`
    const kept = (base.systems.http ?? []).filter((e) => !o.http.some((x) => key(x) === key(e) || (!x.method && x.path === e.path)))
    base.systems.http = [...o.http, ...kept]
  }
  for (const k of ['db', 'files', 'objectStore', 'queues', 'calls', 'email']) if (o[k]) base.systems[k] = mergeDeep(base.systems[k], o[k])
  // a file set to null in an override is not there for this test
  if (o.files) for (const [path, content] of Object.entries(o.files)) if (content === null) delete base.systems.files[path]
  return base
}

function mergeDeep(a, b) {
  if (!isObject(a) || !isObject(b)) return copy(b)
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = isObject(v) && isObject(a[k]) && !('rows' in v) ? mergeDeep(a[k], v) : copy(v)
  return out
}

export const truthy = (v) => v === true || v === 'true'

function asList(v) {
  if (v === null || v === undefined) return []
  if (Array.isArray(v)) return v
  if (isObject(v)) return Object.values(v)
  return [v]
}

function asMuleError(e) {
  if (e instanceof MuleError || e instanceof SimUnsupported || e instanceof Stop) return e
  if (e instanceof DwError) return new MuleError('MULE:EXPRESSION', `"${e.message}"`)
  if (e instanceof SqlError) return new MuleError('DB:QUERY_EXECUTION', e.message)
  return e
}

function withEvent(error, event) {
  error.event = event
  return error
}

// The error as DataWeave sees it in a handler: error.errorType, error.description and so on.
export function errorValue(e) {
  const [namespace, identifier] = e.type.split(':')
  return {
    errorType: { namespace, identifier, asString: e.type },
    description: e.description,
    detailedDescription: e.description,
    errorMessage: e.extra?.errorMessage ?? null,
    cause: e.extra?.cause ?? null,
    childErrors: e.extra?.childErrors ?? [],
  }
}

const errorBrief = (e) => ({ type: e.type, description: e.description })

// ---------- triggers ----------

// Hands a message that was put on a queue to the flow of this design that listens on it.
function deliver(run, msg) {
  const flow = run.design.flows.find((f) => f.source && listensOn(f.source, msg))
  if (!flow) return
  const event = sourceEvent(flow.source, { kind: msg.kind, destination: msg.destination, payload: msg.payload, mime: msg.mime, properties: msg.properties }, run)
  const r = run.runFlow(flow, event)
  if (msg.kind === 'vm' && r.error) run.log('ERROR', `The message on ${msg.destination} failed. ${r.error.type}`, flow.name, 'runtime')
}

const SOURCE_KEYS = { 'vm-listener': ['vm', 'queueName'], 'mq-subscriber': ['mq', 'destination'], 'jms-listener': ['jms', 'destination'], 'kafka-listener': ['kafka', 'topic'], 'kafka-batch-listener': ['kafka', 'topic'], 'sqs-receive': ['sqs', 'queueUrl'] }

function listensOn(source, msg) {
  const k = SOURCE_KEYS[source.type]
  return k && k[0] === msg.kind && String(source.config?.[k[1]] ?? '').toLowerCase() === String(msg.destination).toLowerCase()
}

// Finds the flow a trigger starts. Returns { flow, event } or { response } when an HTTP call reaches no flow.
function start(run, trigger) {
  const flows = run.design.flows.filter((f) => f.kind !== 'sub-flow' && f.source)
  if (trigger.http) {
    const { method = 'GET', path } = trigger.http
    let wrongMethod = null
    for (const f of flows.filter((x) => x.source.type === 'http-listener')) {
      const params = matchPath(String(f.source.config?.path ?? ''), path)
      if (!params) continue
      if (!allows(f.source.config?.allowedMethods, method)) {
        wrongMethod = f
        continue
      }
      return { flow: f, event: sourceEvent(f.source, { kind: 'http', ...trigger.http, uriParams: params, queryParams: { ...queryOf(path), ...(trigger.http.query ?? {}) } }, run) }
    }
    if (wrongMethod) return { response: { status: 405, body: `Method not allowed: ${method}`, mime: 'text/plain', note: `A listener has this path, but its Allowed methods do not include ${method}.` } }
    return { response: { status: 404, body: `No listener for endpoint: ${path}`, mime: 'text/plain', note: `No HTTP Listener in your design matches ${method} ${path}.` } }
  }
  if (trigger.message) {
    const m = trigger.message
    const flow = flows.find((f) => listensOn(f.source, m))
    if (!flow) return { missing: `No flow in your design listens on ${m.kind} ${m.destination}.` }
    return { flow, event: sourceEvent(flow.source, m, run) }
  }
  if (trigger.schedule !== undefined) {
    const name = trigger.schedule?.flow
    const flow = flows.find((f) => f.source.type === 'scheduler' && (!name || f.name === name)) ?? flows.find((f) => f.source.type === 'scheduler')
    if (!flow) return { missing: 'No flow in your design starts with a Scheduler.' }
    return { flow, event: sourceEvent(flow.source, { kind: 'schedule' }, run) }
  }
  if (trigger.file) {
    const types = ['file-listener', 'sftp-listener', 'ftp-listener']
    const dir = String(trigger.file.path ?? '').replace(/\/[^/]*$/, '')
    const flow =
      flows.find((f) => types.includes(f.source.type) && String(f.source.config?.directory ?? '').replace(/\/$/, '').toLowerCase() === dir.toLowerCase()) ??
      flows.find((f) => types.includes(f.source.type))
    if (!flow) return { missing: 'No flow in your design starts with a File, SFTP or FTP listener.' }
    return { flow, event: sourceEvent(flow.source, { kind: 'file', ...trigger.file }, run) }
  }
  if (trigger.source) {
    const flow = flows.find((f) => f.source.type === trigger.source)
    if (!flow) return { missing: `No flow in your design starts with ${COMPONENTS[trigger.source]?.label ?? trigger.source}.` }
    return { flow, event: sourceEvent(flow.source, { kind: 'generic', ...trigger }, run) }
  }
  return { missing: 'The test does not say what starts the flow.' }
}

// After the flow: what the listener sends back, and what happens to the message that started it.
function finish(run, trigger, flow, r) {
  if (flow.source.type === 'http-listener') {
    if (r.error) {
      // the listener's error response: status vars.httpStatus default 500, body the payload when a handler built one
      const handlerRan = run.trace.some((t) => t.kind === 'handler' && t.flow === flow.name)
      const status = Number(r.event.vars?.httpStatus) || defaultStatus(r.error)
      const body = handlerRan ? r.event.payload : r.error.description
      return { status, reason: reasonPhrase(status), body: copy(body), mime: handlerRan ? r.event.mime : 'text/plain', error: errorBrief(r.error) }
    }
    const status = Number(r.event.vars?.httpStatus) || 200
    return { status, reason: reasonPhrase(status), body: copy(r.event.payload), mime: r.event.mime }
  }
  const m = trigger.message
  if (m && ['mq-subscriber', 'jms-listener'].includes(flow.source.type)) {
    const mode = flow.source.config?.acknowledgementMode ?? flow.source.config?.ackMode ?? 'AUTO'
    const manual = mode === 'MANUAL'
    const acked = run.effects.acks.some((a) => a.op === 'ack')
    const nacked = run.effects.acks.some((a) => a.op === 'nack')
    let outcome
    if (mode === 'IMMEDIATE') outcome = 'acked'
    else if (manual) outcome = acked ? 'acked' : nacked ? 'returned' : 'not-acked'
    else outcome = r.error ? 'returned' : 'acked'
    run.effects.acks.push({ op: 'outcome', destination: m.destination, outcome })
  }
  return null
}

function defaultStatus(error) {
  const map = { 'APIKIT:BAD_REQUEST': 400, 'APIKIT:NOT_FOUND': 404, 'APIKIT:METHOD_NOT_ALLOWED': 405, 'APIKIT:NOT_ACCEPTABLE': 406, 'APIKIT:UNSUPPORTED_MEDIA_TYPE': 415, 'HTTP:UNAUTHORIZED': 401 }
  return map[error.type] ?? 500
}

// ---------- the public entry ----------

export function simulate(design, scenario = {}, test = {}) {
  const run = new Run(design, scenario, test)
  const triggers = test.triggers ?? [test.trigger ?? scenario.defaultTrigger ?? {}]
  const responses = []
  let lastError = null
  let lastPayload
  let limit = null
  let missing = null
  try {
    for (const trigger of triggers) {
      run.tick(trigger.afterMs ?? 0)
      const s = start(run, trigger)
      if (s.response) {
        responses.push(s.response)
        continue
      }
      if (s.missing) {
        missing = s.missing
        break
      }
      const r = run.runFlow(s.flow, s.event)
      const response = finish(run, trigger, s.flow, r)
      if (response) responses.push(response)
      lastError = r.error ? errorBrief(r.error) : null
      lastPayload = r.event.payload
      run.drain()
    }
  } catch (e) {
    if (e instanceof SimUnsupported) limit = e.message
    else if (e instanceof Stop) limit = e.message
    else if (e instanceof MuleError) lastError = errorBrief(e)
    else limit = `The simulator hit a problem of its own: ${e.message}`
  }
  run.effects.files = run.files
  run.effects.objectStore = run.stores
  run.effects.tables = run.db.tables
  return {
    response: responses[responses.length - 1] ?? null,
    responses,
    error: lastError,
    payload: copy(lastPayload),
    logs: run.logs,
    trace: run.trace,
    effects: run.effects,
    runs: run.runs,
    elapsedMs: run.t,
    limit,
    missing,
  }
}

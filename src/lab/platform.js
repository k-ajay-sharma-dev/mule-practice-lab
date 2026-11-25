// The Anypoint console of the Platform Lab: design, Exchange, Studio, API Manager, Runtime Manager, MQ and Monitoring on
// one virtual clock. Pure: every action takes a state and returns a new one, so a lab can be played again in a check.
import { parseRaml } from '../raml/parse.js'
import { newRuntime, newTopology, send } from './engine.js'
import { defaultSettings } from './policies.js'
import { BACKENDS } from './platform-led.js'
import { info, line as logLine, muleError, warn } from './platform-log.js'
import { packageOf, routeOf } from './platform-packages.js'

export const MINUTE = 60000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR
const BASE = Date.UTC(2026, 10, 2) // Monday 2 November 2026
const MAX_EVENTS = 900
const MAX_LOGS = 120
const MAX_STEP = 8 * DAY

export const ENVS = ['Sandbox', 'Production']
export const REPLICA_SIZES = [0.1, 0.2, 0.5, 1, 1.5, 2]
export const RUNTIME_VERSIONS = { Edge: ['4.10', '4.9'], LTS: ['4.9', '4.6'] } // sample versions
export const TIME_ZONES = { UTC: 0, 'America/New_York': -300, 'Europe/London': 0, 'Asia/Kolkata': 330 } // offsets of November
export const LOG_LEVELS = ['FATAL', 'ERROR', 'WARN', 'INFO', 'DEBUG']
export const OPERATORS = ['Above', 'Below', 'Above or equal to', 'Below or equal to', 'Equal to']
export const APP_METRICS = ['Message Count', 'Message Error Count', 'Average Response Time', 'CPU Utilization', 'Memory Utilization', 'Thread Count']
export const API_METRICS = ['Total Request Count', 'Average Response Time', 'Response Codes', 'Policy Violations']
export const MON_SEVERITIES = ['Low', 'Medium', 'High', 'Critical']
export const API_ALERT_TYPES = ['Policy Violation', 'Request Count', 'Response Code', 'Response Time']
export const API_ALERT_CODES = [400, 401, 403, 404, 408, 500, 502, 503]
export const RM_SEVERITIES = ['Info', 'Warning', 'Critical']
export const RM_CONDITIONS = ['Deployment success', 'Deployment failure']

const pad = (n) => String(n).padStart(2, '0')
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const dateOf = (t) => new Date(BASE + t)
export const timeText = (t) => `${pad(dateOf(t).getUTCHours())}:${pad(dateOf(t).getUTCMinutes())}:${pad(dateOf(t).getUTCSeconds())}`
export const dateText = (t) => `${dateOf(t).getUTCFullYear()}-${pad(dateOf(t).getUTCMonth() + 1)}-${pad(dateOf(t).getUTCDate())}`
export const stamp = (t) => `${dateText(t)} ${timeText(t)}`
export const dayText = (t) => `${DAYS[dateOf(t).getUTCDay()]} ${dateText(t)} ${timeText(t).slice(0, 5)}`

export const at = (days, hours = 0, minutes = 0) => days * DAY + hours * HOUR + minutes * MINUTE

// ---------- state ----------

export const newPlatform = (extra = {}) => ({
  clock: at(1, 9),
  env: 'Sandbox',
  nextId: 1,
  creds: {
    Sandbox: { id: 'sbx-4f1c9a', secret: 'sbx-secret-7d20' },
    Production: { id: 'prd-81b0e2', secret: 'prd-secret-c4aa' },
  },
  projects: [],
  assets: [],
  studio: [],
  apps: [],
  apis: [],
  clients: [],
  queues: [],
  rmAlerts: [],
  monAlerts: [],
  mail: [],
  events: [],
  traffic: [],
  gateways: {},
  seen: {},
  ...extra,
})

const edit = (state, fn) => {
  const s = structuredClone(state)
  fn(s)
  return s
}
const idOf = (s, prefix) => `${prefix}${s.nextId++}`
export const appNamed = (s, name, env = s.env) => s.apps.find((a) => a.name === name && a.env === env)
export const apiById = (s, id) => s.apis.find((a) => a.id === String(id))
export const mark = (state, key) => (state.seen[key] ? state : edit(state, (s) => void (s.seen[key] = s.clock)))

// Logs, properties and schedules a lab needs before it starts
export const newApp = (name, extra = {}) => ({
  name,
  pkg: name,
  jar: `${name}-1.0.0-mule-application.jar`,
  env: 'Sandbox',
  target: 'Shared Space',
  channel: 'LTS',
  version: '4.9',
  java: '17',
  replicas: 1,
  vCores: 0.1,
  model: 'Rolling update',
  cluster: false,
  objectStore: true,
  publicEndpoint: true,
  props: {},
  secrets: {},
  status: 'Running',
  config: 1,
  updated: 0,
  error: null,
  logs: [],
  schedules: schedulesOf(extra.pkg ?? name, 0),
  ...extra,
})
export const replicaName = (app) => `${app.name.slice(0, 18)}-${(app.name.length * 7919 + app.config * 31).toString(16).slice(0, 5)}-x2k9p`
export const endpointOf = (app) => `https://${app.name}-lab1a2.${app.env === 'Sandbox' ? 'sbx' : 'prd'}.usa-e2.cloudhub.example`
// Each application also has an address that only other applications of the network reach
export const internalOf = (app) => `https://${app.name}-lab1a2.internal-${app.env === 'Sandbox' ? 'sbx' : 'prd'}.usa-e2.cloudhub.example/api`
export const propsOf = (app) => ({ ...app.props, ...app.secrets })
const ctxOf = (s, app, extra = {}) => ({ app, props: propsOf(app), ...extra })

function schedulesOf(pkg, now) {
  return (packageOf(pkg)?.schedules ?? []).map((x) => ({ ...x, at: now + (x.type === 'fixed' ? everyMs(x) : 0), busyUntil: 0, last: null }))
}

const log = (s, app, lines, t = s.clock) => {
  for (const l of lines) app.logs.push({ t, level: l.level, text: l.text, logger: l.logger, config: app.config })
  if (app.logs.length > MAX_LOGS) app.logs.splice(0, app.logs.length - MAX_LOGS)
}
const event = (s, e) => {
  s.events.push({ t: s.clock, ...e })
  if (s.events.length > MAX_EVENTS) s.events.splice(0, s.events.length - MAX_EVENTS)
}
const mail = (s, to, subject, body, source) => {
  s.mail.push({ t: s.clock, to, subject, body, source })
  if (s.mail.length > 40) s.mail.shift()
}

// ---------- schedules ----------

const UNITS = { milliseconds: 1, seconds: 1000, minutes: MINUTE, hours: HOUR, days: DAY }
export const UNIT_NAMES = Object.keys(UNITS)
export const everyMs = (x) => Number(x.value) * UNITS[x.unit]

const DOW = { SUN: 1, MON: 2, TUE: 3, WED: 4, THU: 5, FRI: 6, SAT: 7 }
function fieldOk(field, value, min, names = {}) {
  const number = (x) => names[x.toUpperCase()] ?? Number(x)
  return field.split(',').some((part) => {
    if (part === '*' || part === '?') return true
    const [range, step] = part.split('/')
    const [from, to] = range === '*' ? [min, Infinity] : range.includes('-') ? range.split('-').map(number) : [number(range), step ? Infinity : number(range)]
    return value >= from && value <= to && (!step || (value - from) % Number(step) === 0)
  })
}
const PART = /^(\*|\?|[A-Za-z]{3}|\d+)(-([A-Za-z]{3}|\d+))?(\/\d+)?(,(\*|[A-Za-z]{3}|\d+)(-([A-Za-z]{3}|\d+))?(\/\d+)?)*$/
export function cronError(text) {
  const f = String(text).trim().split(/\s+/)
  if (f.length < 6 || f.length > 7) return 'A cron expression has 6 or 7 fields: seconds, minutes, hours, day of month, month, day of week, and an optional year.'
  return f.every((x) => PART.test(x)) ? null : 'This cron expression has a field that cannot be read.'
}
// the lab clock moves in whole minutes, so the seconds field is not read
export function cronMatches(text, tz, t) {
  if (cronError(text)) return false
  const [, min, hour, dom, month, dow] = text.trim().split(/\s+/)
  const d = dateOf(t + (TIME_ZONES[tz] ?? 0) * MINUTE)
  return fieldOk(min, d.getUTCMinutes(), 0) && fieldOk(hour, d.getUTCHours(), 0) && fieldOk(dom, d.getUTCDate(), 1) && fieldOk(month, d.getUTCMonth() + 1, 1) && fieldOk(dow, d.getUTCDay() + 1, 1, DOW)
}
const minuteAfter = (t) => Math.floor(t / MINUTE) * MINUTE + MINUTE
export function nextRun(schedule, now) {
  if (!schedule.enabled) return null
  if (schedule.type === 'fixed') return schedule.at
  for (let t = minuteAfter(now); t <= now + MAX_STEP; t += MINUTE) if (cronMatches(schedule.value, schedule.tz, t)) return t
  return null
}
const EVERY = { '0 * * * * ?': 'Every minute' }
export const scheduleText = (x) => (x.type === 'fixed' ? `Every ${x.value} ${Number(x.value) === 1 ? x.unit.slice(0, -1) : x.unit}` : (EVERY[x.value] ?? `${x.value} (${x.tz})`))

function runJob(s, app, schedule, manual = false) {
  const now = s.clock
  if (schedule.noOverlap && now < schedule.busyUntil) {
    log(s, app, [info(`Flow '${schedule.flow}' is already running and 'disallowConcurrentExecution' is set to 'true'. Execution skipped.`, 'org.mule.runtime.core.internal.construct.FlowBackPressure')])
    schedule.skipped = (schedule.skipped ?? 0) + 1
    event(s, { k: 'skip', app: app.name, env: app.env, fl: schedule.flow })
    return
  }
  const result = packageOf(app.pkg).run[schedule.flow](ctxOf(s, app))
  log(s, app, result.log)
  schedule.busyUntil = now + result.ms
  schedule.last = { t: now, ok: result.ok, manual, error: result.errorType ?? null }
  event(s, { k: 'job', app: app.name, env: app.env, fl: schedule.flow, s: result.ok ? 'ok' : 'failed', ms: result.ms, e: result.errorType, n: result.errors ?? (result.ok ? 0 : 1), hp: result.heap })
  if (result.batch) app.batch = { ...result.batch, t: now }
  if (result.send) for (const body of result.send.bodies) put(s, result.send.queue, body)
  if (result.move) {
    const from = s.queues.find((q) => q.name === result.move.from)
    for (const m of from?.messages.splice(0) ?? []) put(s, result.move.to, m.body)
  }
  if (result.restart) {
    log(s, app, [line('FATAL', 'JVM exited after OutOfMemoryError. The replica is restarted.'), info(`Application ${app.name} started`)])
    app.restarts = (app.restarts ?? 0) + 1
  }
}
const line = (level, text, logger = 'com.mulesoft.cloudhub.runtime') => logLine(level, text, logger)

function put(s, queue, body) {
  const q = s.queues.find((x) => x.name === queue)
  if (q) q.messages.push({ id: idOf(s, 'm-'), body, deliveries: 0, t: s.clock })
}

function consumeQueues(s) {
  for (const app of s.apps.filter((a) => a.status === 'Running' && packageOf(a.pkg)?.consume)) {
    const pkg = packageOf(app.pkg)
    const q = s.queues.find((x) => x.name === propsOf(app)[pkg.consumes])
    if (!q?.messages.length) continue
    // a package with a rate takes that many messages a minute per replica, and the rest waits
    const waiting = q.messages.splice(0)
    const now = pkg.rate ? waiting.splice(0, pkg.rate * app.replicas) : waiting.splice(0)
    q.messages.push(...waiting)
    for (const m of now) {
      let done = false
      while (!done) {
        m.deliveries++
        const result = pkg.consume(ctxOf(s, app, { backend: (id) => backendOf(s, app, id) }), m)
        linked(s, q.name, app.name, app.env, result.ok ? 200 : 500, 120)
        event(s, { k: 'msg', app: app.name, env: app.env, fl: result.flow ?? result.error?.flow ?? 'order-events-flow', s: result.ok ? 'ok' : 'failed', ms: 120, e: result.errorType, n: result.ok ? 0 : 1 })
        if (result.ok) {
          log(s, app, result.log)
          done = true
        } else {
          // the same error ten times would fill the log, so the lab writes the first and the last attempt
          if (m.deliveries === 1 || m.deliveries >= q.attempts) log(s, app, [warn(`Message ${m.id}, delivery attempt ${m.deliveries}`), muleError(result.error)])
          if (m.deliveries >= q.attempts) {
            const dlq = s.queues.find((x) => x.name === q.dlq)
            if (dlq) dlq.messages.push({ ...m, from: q.name, t: s.clock })
            done = true
          }
        }
      }
    }
  }
}

// ---------- API gateway ----------

// What the runtime of an application has agreed with API Manager
export function pairing(s, app) {
  if (!app?.autodiscovery) return { state: 'none' }
  const props = propsOf(app)
  const creds = s.creds[app.env]
  const id = app.autodiscovery.apiId.replace(/^\$\{(.+)\}$/, (_, key) => props[key] ?? '')
  if (props['anypoint.platform.client_id'] !== creds.id || props['anypoint.platform.client_secret'] !== creds.secret)
    return { state: 'credentials', id, text: 'API Manager answered 401 Unauthorized. Check anypoint.platform.client_id and anypoint.platform.client_secret of this environment.' }
  const api = s.apis.find((a) => a.id === id && a.env === app.env)
  if (!api) return { state: 'unknown', id, text: `API ID ${id || '(empty)'} was not found in API Manager for the environment ${app.env}.` }
  return { state: 'paired', id, api }
}

export function apiStatus(s, api) {
  const live = s.apps.some((a) => a.env === api.env && a.status === 'Running' && pairing(s, a).api?.id === api.id)
  return live ? 'Active' : api.seen ? 'Inactive' : 'Unregistered'
}

function gatewayConfig(s, api) {
  const contracts = api.contracts.map((c) => {
    const client = s.clients.find((x) => x.name === c.client)
    return { name: c.client, clientId: client?.clientId ?? '', clientSecret: client?.clientSecret ?? '', tier: c.tier, contract: c.status }
  })
  return { policies: api.policies, automated: [], tiers: api.tiers, apps: contracts, topology: newTopology() }
}

// The last calls between two applications, or an application and a backend, for the Visualizer
function linked(s, from, to, env, status, ms) {
  s.links ??= {}
  const link = (s.links[`${env}|${from}>${to}`] ??= [])
  link.push([s.clock, status, ms])
  if (link.length > 15) link.shift()
}

function backendOf(s, app, id) {
  const be = { up: true, ms: BACKENDS[id].ms, ...s.backends?.[id] }
  linked(s, app.name, id, app.env, be.up ? 200 : 500, be.ms)
  return be
}
export const setBackend = (state, id, patch) => edit(state, (s) => void (s.backends = { ...s.backends, [id]: { ...s.backends?.[id], ...patch, t: s.clock } }))

const ENV_OF = { sbx: 'Sandbox', prd: 'Production' }
// An application calls another one by its address. The answer has an error type, the way the HTTP Request operation has.
function invoke(s, from, key, req, timeout, cid) {
  const url = String(propsOf(from)[key] ?? '')
  const [, name, internal, env] = url.match(/^https?:\/\/([a-z0-9-]+)-lab1a2\.(internal-)?(sbx|prd)\./) ?? []
  const target = name && appNamed(s, name, ENV_OF[env])
  const result = (r) => {
    linked(s, from.name, name ?? url, from.env, r.status ?? 0, r.ms)
    return { url, method: req.method, path: req.path, ...r }
  }
  if (!target) return result({ error: 'HTTP:CONNECTIVITY', text: `Couldn't connect. The host of ${url || key} cannot be resolved`, ms: 30 })
  if (!internal && !target.publicEndpoint) return result({ error: 'HTTP:CONNECTIVITY', text: 'Connection refused. The application has no public endpoint', ms: 30 })
  const client = s.clients.find((c) => c.clientId === req.clientId)?.name
  const r = callApp(s, target, { ...req, client, cid, inside: true })
  if (r.ms > timeout) return result({ error: 'HTTP:TIMEOUT', text: `Timeout exceeded after ${timeout} ms`, ms: timeout, status: 504 })
  if (r.status < 400) return result({ status: r.status, ms: r.ms, body: r.body })
  const names = { 400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 429: 'TOO_MANY_REQUESTS', 500: 'INTERNAL_SERVER_ERROR', 502: 'BAD_GATEWAY', 503: 'SERVICE_UNAVAILABLE', 504: 'GATEWAY_TIMEOUT' }
  const name_ = names[r.status] ?? 'INTERNAL_SERVER_ERROR'
  return result({ error: `HTTP:${name_}`, text: `${name_.toLowerCase().replace(/_/g, ' ')} (${r.status})`, status: r.status, ms: r.ms })
}
const newCid = (s) => `${((s.nextId++ * 2654435761) >>> 0).toString(16).padStart(8, '0')}-c7a1-11f1`

function callApp(s, app, req) {
  const pkg = app && packageOf(app.pkg)
  const cid = pkg?.traced ? (req.cid ?? newCid(s)) : undefined
  if (app && !req.inside && !app.publicEndpoint) return { status: 0, ms: 0, body: 'Connection refused. This application has no public endpoint.', policy: null, trace: [], headers: [], api: null }
  const done = (r) => {
    const api = pairing(s, app).api
    event(s, { k: 'in', app: app?.name, env: app?.env, api: api?.id, m: req.method, p: req.path, s: r.status, ms: r.ms ?? 5, c: req.client ?? '', e: r.error, pol: r.policy, fl: r.flow })
    return { status: r.status, ms: r.ms ?? 5, body: r.body ?? '', policy: r.policy ?? null, trace: r.trace ?? [], headers: [...(r.headers ?? []), ...(cid ? [['X-Correlation-ID', cid]] : [])], api: api?.id ?? null, cid }
  }
  if (!app || app.status !== 'Running') return done({ status: 503, body: '{"error":"Service Unavailable"}', error: 'NO_APPLICATION' })
  const pair = pairing(s, app)
  if (pair.state === 'credentials' || pair.state === 'unknown') return done({ status: 503, body: '{"error":"API is not available. The gateway is waiting for its policies."}', error: 'GATEKEEPER' })
  let extra = {}
  if (pair.state === 'paired') {
    const result = send(gatewayConfig(s, pair.api), s.gateways[pair.api.id] ?? newRuntime(), { method: req.method, ip: req.ip ?? '10.1.2.3', clientId: req.clientId ?? '', clientSecret: req.clientSecret ?? '', basicUser: '', basicPassword: '', token: 'none', scopes: '', authServer: 'ok', path: req.path, headers: [], body: req.body ?? '' }, s.clock + (req.offset ?? 0))
    s.gateways[pair.api.id] = result.runtime
    extra = { trace: result.trace, headers: result.responseHeaders }
    if (!result.reachedBackend) {
      const policy = result.trace.at(-1)?.policy ?? 'Policy'
      return done({ status: result.status, ms: 4, policy, body: `{"error":"${result.status === 429 ? 'Quota has been exceeded' : result.status === 401 ? 'Invalid client id or secret' : 'Request rejected'}"}`, ...extra })
    }
  }
  const perMinute = s.traffic.filter((x) => x.app === app.name && x.env === app.env).reduce((n, x) => n + x.perMinute, 0)
  const lines = []
  const say = (text) => lines.push(info(`event:${cid} ${text}`))
  say(`${req.method} ${req.path} received`)
  const ctx = ctxOf(s, app, {
    perMinute,
    say,
    backend: (id) => backendOf(s, app, id),
    put(queue, body) {
      put(s, queue, body)
      linked(s, app.name, queue, app.env, 200, 5)
    },
    call(key, call, timeout) {
      const a = invoke(s, app, key, { ...call, traced: req.traced, offset: req.offset }, timeout, cid)
      say(`Called ${a.url}${a.path}, ${a.error ?? a.status} in ${a.ms} ms`)
      return a
    },
  })
  const r = pkg.handle?.(ctx, req) ?? { status: 404, ms: 3, body: '' }
  say(`Answered ${r.status} in ${r.ms} ms`)
  // steady traffic that works would fill the log, so its lines are written for failures and for calls of the API client
  if (pkg.traced && (req.traced || r.status >= 500)) log(s, app, lines)
  if (r.log) log(s, app, pkg.traced ? r.log.map((l) => ({ ...l, text: `event:${cid} ${l.text}` })) : r.log)
  return done({ ...r, ...extra })
}

// A request from the API client. `url` is the endpoint of an application, with /api in front of the resource path.
export function callApi(state, { env, app, ...req }) {
  let response
  const next = edit(state, (s) => {
    response = callApp(s, appNamed(s, app, env), { ...req, cid: req.cid || undefined, traced: true })
    s.clock += 100
    s.lastCalls = [...(s.lastCalls ?? []), { t: s.clock, app, env, method: req.method, path: req.path, status: response.status, ms: response.ms, cid: response.cid }].slice(-30)
    checkAlerts(s)
  })
  return { state: next, response }
}

// ---------- deployments ----------

export const NAME_RULE = /^[a-z0-9](?:[a-z0-9-]{1,40})[a-z0-9]$/i

export function deployErrors(state, form, existing) {
  const errors = []
  if (!NAME_RULE.test(form.name)) errors.push('An application name has 3 to 42 letters, digits and dashes.')
  if (!existing && appNamed(state, form.name)) errors.push(`The name ${form.name} is already in use in ${state.env}.`)
  if (!form.pkg) errors.push('Choose an application file.')
  if (!(form.replicas >= 1 && form.replicas <= 8)) errors.push('The replica count is 1 to 8.')
  return errors
}

function boot(s, app) {
  const gone = packageOf(app.pkg).boot?.(ctxOf(s, app)) ?? null
  log(s, app, [info(`Starting replica ${replicaName(app)}`, 'com.mulesoft.cloudhub.runtime'), info(`Initializing app '${app.name}'`, 'org.mule.runtime.deployment')])
  if (gone) {
    log(s, app, [line('ERROR', `Failed to deploy artifact [${app.name}]\norg.mule.runtime.deployment.model.api.DeploymentInitException: ConfigurationPropertiesException: ${gone}`, 'org.mule.runtime.module.deployment')])
    app.status = 'Failed'
    app.error = gone
  } else {
    app.status = 'Running'
    app.error = null
    log(s, app, [info(`Started app '${app.name}'`, 'org.mule.runtime.deployment')])
    const pair = pairing(s, app)
    if (pair.state === 'paired') {
      pair.api.seen = true
      log(s, app, [info(`API ApiKey{id='${pair.id}'} is now unblocked (available). Policies applied.`, 'com.mulesoft.mule.runtime.gw.autodiscovery')])
    } else if (pair.state !== 'none') {
      log(s, app, [line('ERROR', `API ApiKey{id='${pair.id}'} could not be tracked. ${pair.text}`, 'com.mulesoft.mule.runtime.gw.autodiscovery'), warn(`API ApiKey{id='${pair.id}'} is now blocked (unavailable).`, 'com.mulesoft.mule.runtime.gw.gatekeeper')])
    }
  }
  for (const a of s.rmAlerts.filter((x) => x.enabled && x.env === app.env && (x.app === app.name || x.app === 'All'))) {
    const hit = a.condition === (app.status === 'Running' ? 'Deployment success' : 'Deployment failure')
    if (hit) {
      a.fired = [...(a.fired ?? []), s.clock].slice(-20)
      mail(s, a.recipients, a.subject || `${a.severity}: ${a.condition} for ${app.name}`, a.message || `${a.condition}. Application ${app.name}, environment ${app.env}.${app.error ? ` ${app.error}` : ''}`, 'Runtime Manager')
    }
  }
}

// New deployments and Apply Changes. The application is Starting until finishDeploys() is called.
export function deployApp(state, form) {
  const existing = appNamed(state, form.name)
  const errors = deployErrors(state, form, form.editing ? existing : null)
  if (errors.length) return { state, errors }
  const next = edit(state, (s) => {
    const { editing, ...fields } = form
    let app = appNamed(s, form.name)
    if (app && editing) {
      Object.assign(app, fields, { config: app.config + 1, updated: s.clock, status: 'Starting' })
    } else {
      app = newApp(form.name, { ...fields, env: s.env, updated: s.clock, status: 'Starting' })
      app.schedules = schedulesOf(app.pkg, s.clock)
      s.apps.push(app)
    }
    app.logs = app.logs.slice(-MAX_LOGS)
  })
  return { state: next, errors: [] }
}
export const finishDeploys = (state) =>
  state.apps.some((a) => a.status === 'Starting')
    ? edit(state, (s) => {
        for (const app of s.apps) if (app.status === 'Starting') boot(s, app)
        s.clock += 1000
      })
    : state
export const stopApp = (state, name) => edit(state, (s) => void (appNamed(s, name).status = 'Stopped'))
export const startApp = (state, name) => edit(state, (s) => void (appNamed(s, name).status = 'Starting'))
export const deleteApp = (state, name) => edit(state, (s) => void (s.apps = s.apps.filter((a) => a !== appNamed(s, name))))

export const setSchedule = (state, name, flow, patch) =>
  edit(state, (s) => {
    const x = appNamed(s, name).schedules.find((y) => y.flow === flow)
    Object.assign(x, patch)
    if (x.type === 'fixed') x.at = s.clock + everyMs(x)
  })
export const runNow = (state, name, flow) =>
  edit(state, (s) => {
    const app = appNamed(s, name)
    if (app.status !== 'Running') return
    const x = app.schedules.find((y) => y.flow === flow)
    runJob(s, app, x, true)
    if (x.type === 'fixed') x.at = s.clock + everyMs(x) // running it resets the timer
    s.clock += 1000
    checkAlerts(s)
  })

// ---------- time ----------

export function advance(state, ms) {
  return edit(state, (s) => {
    const end = s.clock + Math.min(ms, MAX_STEP)
    for (let t = minuteAfter(s.clock); t <= end; t += MINUTE) {
      s.clock = t
      for (const app of s.apps) {
        if (app.status !== 'Running') continue
        for (const x of app.schedules) {
          if (!x.enabled) continue
          if (x.type === 'cron' ? cronMatches(x.value, x.tz, t) : x.at <= t) {
            runJob(s, app, x)
            if (x.type === 'fixed') x.at = Math.max(x.at, t) + everyMs(x)
          }
        }
      }
      for (const f of s.traffic) {
        // a flow with `every` sends only in every n-th minute
        if (f.every && (t / MINUTE) % f.every !== 0) continue
        const client = s.clients.find((c) => c.name === f.client)
        for (let i = 0; i < f.perMinute; i++) callApp(s, appNamed(s, f.app, f.env), { method: f.method ?? 'GET', path: f.path, body: f.body, ip: f.ip, client: f.client, clientId: f.clientId ?? client?.clientId, clientSecret: f.clientSecret ?? client?.clientSecret, offset: Math.floor((i * MINUTE) / f.perMinute) })
      }
      for (const f of s.queueTraffic ?? []) if (t % (f.everyMinutes * MINUTE) === 0) put(s, f.queue, JSON.stringify({ order: `O-${1000 + s.nextId}`, total: 42 }))
      consumeQueues(s)
      checkAlerts(s)
    }
    s.clock = Math.max(end, s.clock)
  })
}

export function nextJob(state) {
  const times = state.apps.filter((a) => a.status === 'Running').flatMap((a) => a.schedules.map((x) => nextRun(x, state.clock))).filter((t) => t !== null && t > state.clock)
  return times.length ? Math.min(...times) : null
}

// ---------- metrics and alerts ----------

const inRange = (s, from, to, match) => s.events.filter((e) => e.t > from && e.t <= to && match(e))
export const eventsOf = (s, { app, api, env }, from, to) => inRange(s, from, to, (e) => (api ? e.api === api : e.app === app && e.env === env))
const failed = (e) => e.n > 0 || (typeof e.s === 'number' && e.s >= 500)
export const isFailed = failed

export function cpuOf(s, app, from, to) {
  if (app.status !== 'Running') return 0
  const minutes = Math.max(1, (to - from) / MINUTE)
  const seen = eventsOf(s, { app: app.name, env: app.env }, from, to).filter((e) => e.k === 'in').length / minutes
  // the event list is short, so a steady flow of traffic is read from the traffic itself
  const steady = s.traffic.filter((x) => x.app === app.name && x.env === app.env).reduce((n, x) => n + x.perMinute, 0)
  const per = packageOf(app.pkg).cpu ? Math.max(seen, steady) : seen / 8
  return Math.min(99, Math.round(4 + (per / (app.replicas * app.vCores * 60)) * 72))
}
export function heapOf(s, app, from, to) {
  if (app.status !== 'Running') return 0
  const jobs = eventsOf(s, { app: app.name, env: app.env }, from, to).filter((e) => e.hp)
  return jobs.length ? Math.max(...jobs.map((e) => e.hp)) : 34
}

export function metricValue(s, alert, from, to) {
  const target = alert.resource === 'API' ? { api: alert.name_ } : { app: alert.name_, env: alert.env }
  const list = eventsOf(s, target, from, to).filter((e) => e.k !== 'skip')
  const calls = list.filter((e) => e.k === 'in')
  const app = appNamed(s, alert.name_, alert.env)
  switch (alert.metric) {
    case 'Message Count':
      return list.length
    case 'Message Error Count':
      return list.reduce((n, e) => n + (e.n ?? (failed(e) ? 1 : 0)), 0)
    case 'Total Request Count':
      return calls.length
    case 'Average Response Time':
      return calls.length ? Math.round(calls.reduce((n, e) => n + e.ms, 0) / calls.length) : null
    case 'Response Codes':
      return calls.filter((e) => (alert.codes ?? []).includes(e.s)).length
    case 'Policy Violations':
      return calls.filter((e) => e.pol).length
    case 'CPU Utilization':
      return app ? cpuOf(s, app, from, to) : null
    case 'Memory Utilization':
      return app ? heapOf(s, app, from, to) : null
    case 'Thread Count':
      return app ? 62 : null
    default:
      return null
  }
}
export function compare(op, value, threshold) {
  if (value === null) return false
  return { Above: value > threshold, Below: value < threshold, 'Above or equal to': value >= threshold, 'Below or equal to': value <= threshold, 'Equal to': value === threshold }[op]
}

// Monitoring: the condition has to hold in each of the last N consecutive minutes
function breached(s, a) {
  for (let i = 0; i < a.minutes; i++) if (!compare(a.operator, metricValue(s, a, s.clock - (i + 1) * MINUTE, s.clock - i * MINUTE), Number(a.threshold))) return false
  return true
}

function apiAlertHit(s, api, a) {
  const period = a.period * MINUTE
  for (let i = 0; i < a.periods; i++) {
    const list = eventsOf(s, { api: api.id }, s.clock - (i + 1) * period, s.clock - i * period).filter((e) => e.k === 'in')
    const count = {
      'Policy Violation': list.filter((e) => e.pol && (a.policy === 'Any' || !a.policy || e.pol === a.policy)).length,
      'Request Count': list.length,
      'Response Code': list.filter((e) => (a.codes ?? []).includes(e.s)).length,
      'Response Time': list.filter((e) => e.ms > a.ms).length,
    }[a.type]
    if (count < a.atLeast) return false
  }
  return true
}

function checkAlerts(s) {
  for (const a of s.monAlerts) {
    if (!a.enabled) continue
    const hit = breached(s, a)
    if (hit && a.state !== 'Alerting') {
      a.lastAlerted = s.clock
      a.fired = (a.fired ?? 0) + 1
      mail(s, a.recipients, a.subject || `${a.severity}: ${a.title}`, a.message || `${a.metric} of ${a.name_} is ${a.operator.toLowerCase()} ${a.threshold} in ${a.env}.`, 'Anypoint Monitoring')
    }
    a.state = hit ? 'Alerting' : 'OK'
  }
  for (const api of s.apis) {
    for (const a of api.alerts) {
      if (!a.enabled) continue
      const hit = apiAlertHit(s, api, a)
      if (hit && a.state !== 'Alerting') {
        a.fired = (a.fired ?? 0) + 1
        a.lastAlerted = s.clock
        mail(s, a.recipients, `${a.severity}: ${a.name} on ${api.name}`, `${a.type} alert for API ${api.name} ${api.apiVersion} (${api.label || api.id}) in ${api.env}.`, 'API Manager')
      }
      a.state = hit ? 'Alerting' : 'OK'
    }
  }
}

export const addMonAlert = (state, alert) => edit(state, (s) => void s.monAlerts.push({ id: idOf(s, 'al'), enabled: true, created: s.clock, state: 'No data', env: s.env, ...alert }))
export const setMonAlert = (state, id, patch) => edit(state, (s) => void Object.assign(s.monAlerts.find((a) => a.id === id), patch))
export const removeMonAlert = (state, id) => edit(state, (s) => void (s.monAlerts = s.monAlerts.filter((a) => a.id !== id)))
export const addRmAlert = (state, alert) => edit(state, (s) => void s.rmAlerts.push({ id: idOf(s, 'rm'), enabled: true, created: s.clock, env: s.env, ...alert }))
export const setRmAlert = (state, id, patch) => edit(state, (s) => void Object.assign(s.rmAlerts.find((a) => a.id === id), patch))
export const removeRmAlert = (state, id) => edit(state, (s) => void (s.rmAlerts = s.rmAlerts.filter((a) => a.id !== id)))
export const addApiAlert = (state, apiId, alert) => edit(state, (s) => void apiById(s, apiId).alerts.push({ id: idOf(s, 'aa'), enabled: true, state: 'OK', ...alert }))
export const removeApiAlert = (state, apiId, id) =>
  edit(state, (s) => {
    const api = apiById(s, apiId)
    api.alerts = api.alerts.filter((a) => a.id !== id)
  })

// ---------- Design Center and Exchange ----------

export const slug = (text) => text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
export const starterRaml = (name) => `#%RAML 1.0\ntitle: ${name}\n`

export const createProject = (state, name) => edit(state, (s) => void s.projects.push({ id: idOf(s, 'p'), name, raml: starterRaml(name), updated: s.clock, published: null }))
export const saveProject = (state, id, raml) => edit(state, (s) => void Object.assign(s.projects.find((p) => p.id === id), { raml, updated: s.clock }))
export const ramlErrors = (raml) => parseRaml(raml).errors.filter((e) => !e.file)

// The mocking service answers from the first 2xx response of the specification
export function mockCall(raml, method, path) {
  if (ramlErrors(raml).length) return { status: 500, body: 'The specification has errors.' }
  const route = routeOf(raml, method, path)
  return { status: route.status, body: route.error ? JSON.stringify({ message: route.error }) : route.body }
}

const SEMVER = /^\d+\.\d+\.\d+$/
export function publish(state, projectId, form) {
  const project = state.projects.find((p) => p.id === projectId)
  const errors = []
  const lint = ramlErrors(project.raml)
  if (lint.length) errors.push(`The specification has ${lint.length} error${lint.length === 1 ? '' : 's'}. Line ${lint[0].line}: ${lint[0].message}`)
  if (!SEMVER.test(form.version)) errors.push('The asset version needs the form 1.0.0.')
  if (!form.apiVersion.trim()) errors.push('Give the API version, such as v1.')
  if (state.assets.some((a) => a.assetId === form.assetId && a.version === form.version)) errors.push(`Version ${form.version} of ${form.assetId} exists already. A published version cannot be changed.`)
  if (errors.length) return { state, errors }
  return {
    errors,
    state: edit(state, (s) => {
      s.assets.push({ assetId: form.assetId, name: form.name, version: form.version, apiVersion: form.apiVersion, lifecycle: form.lifecycle, raml: project.raml, t: s.clock })
      s.projects.find((p) => p.id === projectId).published = form.version
    }),
  }
}
export const assetGroups = (s) => {
  const groups = new Map()
  for (const a of s.assets) groups.set(a.assetId, [a, ...(groups.get(a.assetId) ?? [])])
  return [...groups.values()]
}
export const latestAsset = (s, assetId) => s.assets.findLast((a) => a.assetId === assetId)

export const createClient = (state, name) =>
  edit(state, (s) => {
    const n = (s.nextId * 7919 + name.length * 104729).toString(16)
    s.clients.push({ name, clientId: `${n}a9c0d4`, clientSecret: `S3c${n}F0b1` })
    s.nextId++
  })
export function requestAccess(state, apiId, client, tier) {
  return edit(state, (s) => {
    const api = apiById(s, apiId)
    const chosen = api.tiers.find((t) => t.name === tier)
    const status = !chosen || chosen.autoApprove ? 'approved' : 'pending'
    const old = api.contracts.find((c) => c.client === client)
    if (old) Object.assign(old, { wanted: tier, status: old.status === 'approved' && status === 'pending' ? 'approved' : status, change: status === 'pending', ...(status === 'approved' && { tier }) })
    else api.contracts.push({ client, tier: tier ?? '', status, t: s.clock })
  })
}
export const setContract = (state, apiId, client, patch) => edit(state, (s) => void Object.assign(apiById(s, apiId).contracts.find((c) => c.client === client), patch))

// ---------- Studio ----------

export function importSpec(state, assetId) {
  const asset = latestAsset(state, assetId)
  return edit(state, (s) => {
    s.studio = s.studio.filter((p) => p.name !== assetId)
    s.studio.push({ name: assetId, assetId, version: asset.version, raml: asset.raml, autodiscovery: null, jar: null })
  })
}
export const setStudio = (state, name, patch) => edit(state, (s) => void Object.assign(s.studio.find((p) => p.name === name), { jar: null, ...patch }))
export const packageJar = (state, name) => edit(state, (s) => void (s.studio.find((p) => p.name === name).jar = `${name}-${s.studio.find((p) => p.name === name).version}-mule-application.jar`))
export const studioFlows = (project) => [
  `${project.name}-main`,
  ...(parseRaml(project.raml).model?.resources ?? []).flatMap((r) => Object.keys(r.methods).map((m) => `${m}:${r.path.replace(/\//g, '\\').replace(/\{(\w+)\}/g, '($1)')}:${project.name}-config`)),
]
// The files the Deploy Application page can choose
export const jarsOf = (s) => [
  ...s.studio.filter((p) => p.jar).map((p) => ({ jar: p.jar, pkg: 'api', project: p.name, raml: p.raml, autodiscovery: p.autodiscovery })),
  // a name, or { pkg, autodiscovery } for an application that is linked to API Manager
  ...(s.jars ?? []).map((j) => (typeof j === 'string' ? { pkg: j } : j)).map((j) => ({ jar: `${j.pkg}-1.0.0-mule-application.jar`, ...j })),
]

// ---------- API Manager ----------

export const newApi = (id, extra = {}) => ({ id: String(id), name: '', assetId: '', version: '1.0.0', apiVersion: 'v1', env: 'Sandbox', label: '', upstream: '', consumer: '', mule4: true, proxy: 'basic', policies: [], tiers: [], contracts: [], alerts: [], seen: false, ...extra })
export function addApi(state, form) {
  return edit(state, (s) => {
    const asset = latestAsset(s, form.assetId)
    const id = String(19400000 + s.nextId * 137)
    s.nextId++
    s.apis.push(newApi(id, { name: asset.name, assetId: asset.assetId, version: form.version ?? asset.version, apiVersion: asset.apiVersion, env: s.env, label: form.label, upstream: form.upstream, consumer: form.consumer, muleVersion: form.muleVersion, t: s.clock }))
    s.lastApi = id
  })
}
export function promoteApi(state, sourceId, include) {
  return edit(state, (s) => {
    const from = apiById(s, sourceId)
    const id = String(19400000 + s.nextId * 137)
    s.nextId++
    const copy = (list) => structuredClone(list)
    s.apis.push(newApi(id, { ...from, id, env: s.env, seen: false, contracts: [], policies: include.policies ? copy(from.policies) : [], tiers: include.tiers ? copy(from.tiers) : [], alerts: include.alerts ? copy(from.alerts).map((a) => ({ ...a, state: 'OK', fired: 0 })) : [], t: s.clock }))
    s.lastApi = id
  })
}
export const setApi = (state, id, patch) => edit(state, (s) => void Object.assign(apiById(s, id), patch))
export const applyPolicy = (state, id, type, settings = {}) => edit(state, (s) => void apiById(s, id).policies.push({ id: idOf(s, 'po'), type, settings: { ...defaultSettings(type), ...settings } }))
export const addTier = (state, id, tier) => edit(state, (s) => void apiById(s, id).tiers.push(tier))
export function reviseApi(state, id, version) {
  return edit(state, (s) => {
    const api = apiById(s, id)
    const asset = s.assets.find((a) => a.assetId === api.assetId && a.version === version)
    Object.assign(api, { version, apiVersion: asset.apiVersion })
  })
}

// ---------- MQ ----------

export const viewMessages = (state, queue) => mark(state, `mq:${queue}`)
export const sendMessage = (state, queue, body) =>
  edit(state, (s) => {
    put(s, queue, body)
    consumeQueues(s)
    checkAlerts(s)
  })
export const purge = (state, queue) => edit(state, (s) => void (s.queues.find((q) => q.name === queue).messages = []))

// ---------- logs ----------

export function searchLogs(app, { text = '', levels = LOG_LEVELS, from = -Infinity, to = Infinity }) {
  const words = text.trim().toLowerCase()
  return app.logs.filter((l) => levels.includes(l.level) && l.t >= from && l.t <= to && (!words || `${l.logger} ${l.text}`.toLowerCase().includes(words)))
}
// Monitoring log search: `priority: ERROR AND "timed out"`. Fields and words, all joined with AND.
export function queryLogs(s, query, env = s.env) {
  const terms = query.split(/\s+AND\s+/).map((x) => x.trim()).filter(Boolean)
  const rows = s.apps.filter((a) => a.env === env).flatMap((a) => a.logs.map((l) => ({ ...l, app: a.name, replica: replicaName(a) })))
  const test = (row, term) => {
    const m = term.match(/^(appId|application|log-level|log level|priority|logger|class|message)\s*:\s*(.+)$/i)
    const want = (m ? m[2] : term).replace(/^"|"$/g, '').toLowerCase()
    const key = m?.[1].toLowerCase()
    const value = (key === 'appid' || key === 'application' ? row.app : /level|priority/.test(key ?? '') ? row.level : /logger|class/.test(key ?? '') ? row.logger : key === 'message' ? row.text : `${row.app} ${row.level} ${row.logger} ${row.text}`).toLowerCase()
    if (!want.includes('*')) return value.includes(want)
    return new RegExp(`^${want.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 's').test(value)
  }
  return rows.filter((row) => terms.every((t) => test(row, t))).sort((a, b) => b.t - a.t)
}

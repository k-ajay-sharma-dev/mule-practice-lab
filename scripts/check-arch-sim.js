// Checks the architecture simulator: its rules on small diagrams, and every problem's simulation (each model answer
// passes its tests, each test is well formed and asks for something, and the text follows the house style).
// Usage: node scripts/check-arch-sim.js [ar-001 uc-003 ...] checks only those problems.
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { NODE_TYPES } from '../src/arch/catalog.js'
import { matches, matcherTypes } from '../src/arch/checks.js'
import { diagram } from '../src/arch/dsl.js'
import { EXPECT_KEYS } from '../src/arch/expect.js'
import { ARCH_SETTINGS } from '../src/arch/settings.js'
import { simulateArch } from '../src/arch/sim.js'
import { runArchTest } from '../src/arch/tests.js'

// ---------- the rules, on small diagrams ----------
let rules = 0
const rule = (name, fn) => {
  try {
    fn()
    rules++
  } catch (e) {
    console.error(`Engine rule failed: ${name}\n  ${e.message}`)
    process.exitCode = 1
  }
}
const run = (d, sim, test) => simulateArch(d, sim, test)
const flow = (r, i = 0) => r.flows[i]
const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol

// web → exp → sys → db
const chain = (cfg = {}) =>
  diagram(
    {
      web: ['web-app', 'Web'],
      exp: ['experience-api', 'exp-api', cfg.exp],
      sys: ['system-api', 'sys-api', cfg.sys],
      db: ['database', 'Orders DB'],
    },
    ['web -> exp', 'exp -> sys', 'sys -> db'],
  )
const read = (rps, extra = {}) => ({ traffic: [{ from: 'web-app', rps, to: 'database', name: 'reads', ...extra }] })

rule('a light load is all answered, and the time adds up along the route', () => {
  const r = run(chain(), {}, read(10))
  assert.ok(near(flow(r).success, 1))
  assert.ok(flow(r).avgMs > 130 && flow(r).avgMs < 160, `avg ${flow(r).avgMs}`)
})
rule('0.1 vCore carries about 50 requests a second; more fails with 503', () => {
  const r = run(chain(), {}, read(100))
  assert.ok(flow(r).success < 0.6 && flow(r).success > 0.4, `success ${flow(r).success}`)
  assert.match(flow(r).reasons[0].text, /over capacity/)
  const big = run(chain({ exp: { vCores: '0.5' }, sys: { vCores: '0.5' } }), {}, read(100))
  assert.ok(near(flow(big).success, 1))
})
rule('replicas add capacity, and vCores are counted per replica and region', () => {
  const d = chain({ exp: { replicas: 2 }, sys: { replicas: 2, regions: '2' } })
  const r = run(d, {}, read(90))
  assert.ok(near(flow(r).success, 1))
  assert.equal(r.vCores, 0.6)
})
rule('a backend with maxRps fails what is over it', () => {
  const r = run(chain({ exp: { vCores: '1' }, sys: { vCores: '1' } }), { systems: [{ match: 'database', maxRps: 20 }] }, read(40))
  assert.ok(near(flow(r).success, 0.5, 0.1), `success ${flow(r).success}`)
})
rule('a rate limit answers 429 to what is over it', () => {
  const r = run(chain({ exp: { rateLimit: 20 } }), {}, read(40))
  assert.ok(near(flow(r).limited, 0.5), `limited ${flow(r).limited}`)
  assert.ok(near(flow(r).success, 0.5))
})
rule('an auth policy refuses callers without credentials, only where the outside comes in', () => {
  const r = run(chain({ exp: { auth: 'client-id' } }), {}, read(10, { auth: 'none' }))
  assert.ok(near(flow(r).refused, 1))
  const inner = run(chain({ sys: { auth: 'client-id' } }), {}, read(10, { auth: 'none' }))
  assert.ok(near(flow(inner).success, 1), 'the System API is called by the Experience API, not the outside')
  const jwt = run(chain({ exp: { auth: 'jwt' } }), {}, read(10, { auth: 'client-id' }))
  assert.ok(near(flow(jwt).refused, 1), 'a client id is not a JWT')
})
rule('oauth2 needs the identity provider; jwt does not', () => {
  const d = (auth) => {
    const x = chain({ exp: { auth } })
    x.nodes.push({ id: 'idp', type: 'identity-provider', label: 'Okta' })
    return x
  }
  const test = { ...read(10), incidents: [{ down: 'identity-provider' }] }
  assert.ok(near(flow(run(d('oauth2'), {}, test)).success, 0))
  assert.ok(near(flow(run(d('jwt'), {}, test)).success, 1))
})
rule('a cache cuts the reads that go further, and answers while the backend is down', () => {
  const d = chain()
  d.nodes.push({ id: 'c', type: 'cache', label: 'cache' })
  d.edges.push({ id: 'ec', from: 'sys', to: 'c', kind: 'sync' })
  const r = run(d, {}, read(40))
  assert.ok(r.nodes.db.peakRps < 10, `db ${r.nodes.db.peakRps}`)
  const down = run(d, {}, { ...read(40), incidents: [{ down: 'database' }] })
  assert.ok(near(flow(down).success, 0.8), `success ${flow(down).success}`)
  const writes = run(d, {}, read(40, { kind: 'write' }))
  assert.ok(near(writes.nodes.db.peakRps, 40, 0.5), 'writes go through')
})
rule('a hanging backend times out; a short timeout and a breaker keep the API answering fast', () => {
  const sim = {}
  const hang = { ...read(10), incidents: [{ hang: 'database' }] }
  const slow = run(chain(), sim, hang)
  assert.ok(near(flow(slow).success, 0))
  assert.ok(slow.nodes.sys.peakUtil > 0.1, 'held threads make the box busy')
  const fast = run(chain({ sys: { timeoutMs: 1000, circuitBreaker: 'on' }, exp: { onFailure: 'partial answer' } }), sim, hang)
  assert.ok(near(flow(fast).success, 1) && near(flow(fast).degraded, 1), `${flow(fast).success} ${flow(fast).degraded}`)
  assert.ok(flow(fast).avgMs < 100, `avg ${flow(fast).avgMs}`)
})
rule('threads run out when calls are slow, even with CPU to spare', () => {
  const r = run(chain({ exp: { vCores: '1' }, sys: { vCores: '1' } }), { systems: [{ match: 'database', latencyMs: 4000 }] }, read(250))
  assert.ok(flow(r).success < 0.5, `success ${flow(r).success}`)
  assert.match(flow(r).reasons[0].text, /threads/)
})
rule('retries help with partial failures, not with a system that is down', () => {
  const errs = { ...read(10), incidents: [{ errors: 'database', rate: 0.3 }] }
  assert.ok(near(flow(run(chain(), {}, errs)).success, 0.7))
  assert.ok(flow(run(chain({ sys: { retries: 2 } }), {}, errs)).success > 0.97)
  const down = { ...read(10), incidents: [{ down: 'database' }] }
  assert.ok(near(flow(run(chain({ sys: { retries: 2 } }), {}, down)).success, 0))
})
rule('calls in parallel take the time of the slowest', () => {
  const d = (calls) =>
    diagram(
      { web: ['web-app', 'Web'], p: ['process-api', 'prc', { calls, vCores: '1' }], a: ['erp', 'SAP'], b: ['crm', 'Salesforce'] },
      ['web -> p', 'p -> a', 'p -> b'],
    )
  const sim = { systems: [{ match: 'erp', latencyMs: 500 }, { match: 'crm', latencyMs: 300 }] }
  const t = { traffic: [{ from: 'web-app', rps: 5, to: ['erp', 'crm'] }] }
  assert.ok(flow(run(d('one after another'), sim, t)).avgMs > 800)
  assert.ok(flow(run(d('in parallel'), sim, t)).avgMs < 560)
})
// web → exp ~> q ~> sys → db: the caller is done at the queue
const queued = (qcfg, extra = [], extraNodes = {}) =>
  diagram(
    { web: ['web-app', 'Web'], exp: ['experience-api', 'exp-api'], q: ['queue', 'orders-q', qcfg], sys: ['system-api', 'sys-api'], db: ['database', 'Orders DB'], ...extraNodes },
    ['web -> exp', 'exp ~> q', 'q ~> sys', 'sys -> db', ...extra],
  )
rule('a queue answers the caller at once and delivers later, holding messages while the backend is down', () => {
  const t = { traffic: [{ from: 'web-app', rps: 10, to: 'database', kind: 'write' }], incidents: [{ down: 'database', at: 2, forMin: 3 }] }
  const r = run(queued(), {}, t)
  assert.ok(near(flow(r).success, 1), 'the caller is answered while the database is down')
  assert.ok(r.queues.q.peak > 1000, `peak ${r.queues.q.peak}`)
  assert.equal(r.queues.q.end, 0, 'the backlog drains once it is back')
  assert.equal(r.lost, 0)
  const direct = run(chain(), {}, t)
  assert.ok(near(flow(direct).success, 0.7), 'without the queue, writes fail while it is down')
})
rule('after Deliveries before the DLQ, a failing message moves to the DLQ, or is lost without one', () => {
  const t = { traffic: [{ from: 'web-app', rps: 10, to: 'database', kind: 'write' }], incidents: [{ down: 'database', at: 2, forMin: 5 }] }
  const withDlq = run(queued({ maxRedelivery: 3 }, ['q ~> dlq'], { dlq: ['dlq', 'orders-dlq'] }), {}, t)
  assert.ok(withDlq.queues.q.dlq > 0 && withDlq.lost === 0, `dlq ${withDlq.queues.q.dlq} lost ${withDlq.lost}`)
  const without = run(queued({ maxRedelivery: 3 }), {}, t)
  assert.ok(without.lost > 0)
  const forever = run(queued(), {}, t)
  assert.ok(forever.lost === 0 && forever.queues.q.dlq === 0)
})
rule('a broker restart loses what a non-persistent queue holds', () => {
  const t = { traffic: [{ from: 'web-app', rps: 10, to: 'database', kind: 'write' }], incidents: [{ down: 'system-api', at: 1, forMin: 4 }, { restart: 'queue', at: 3 }] }
  assert.ok(run(queued({ persistent: 'no' }), {}, t).lost > 0)
  assert.equal(run(queued(), {}, t).lost, 0)
})
rule('a topic gives every subscriber a copy; a queue shares messages between its consumers', () => {
  const d = (type) =>
    diagram(
      { web: ['web-app', 'Web'], exp: ['experience-api', 'exp'], t: [type, 'events'], a: ['system-api', 'sys-a'], b: ['system-api', 'sys-b'], da: ['database', 'A'], db: ['crm', 'B'] },
      ['web -> exp', 'exp ~> t', 't ~> a', 't ~> b', 'a -> da', 'b -> db'],
    )
  const t = { traffic: [{ from: 'web-app', rps: 10, kind: 'write', name: 'events' }] }
  const topic = run(d('topic'), {}, t)
  assert.ok(near(topic.nodes.da.served, 6000, 1) && near(topic.nodes.db.served, 6000, 1), `${topic.nodes.da.served} ${topic.nodes.db.served}`)
  const queue = run(d('queue'), {}, t)
  assert.ok(near(queue.nodes.da.served + queue.nodes.db.served, 6000, 1))
})
rule('a slow subscriber of a topic builds its own backlog', () => {
  const d = diagram(
    { web: ['web-app', 'Web'], exp: ['experience-api', 'exp', { vCores: '1' }], t: ['topic', 'events'], a: ['system-api', 'sys-a'], b: ['system-api', 'sys-b'], da: ['database', 'A'], db: ['crm', 'B'] },
    ['web -> exp', 'exp ~> t', 't ~> a', 't ~> b', 'a -> da', 'b -> db'],
  )
  const r = run(d, { systems: [{ match: 'crm', maxRps: 20 }] }, { traffic: [{ from: 'web-app', rps: 40, kind: 'write' }] })
  assert.ok(r.queues.t.end > 1000, `end ${r.queues.t.end}`)
  assert.ok(near(r.nodes.da.served, 24000, 10))
})
rule('a zone outage stops an API with one replica; two replicas keep going', () => {
  const t = { ...read(10), incidents: [{ zone: true }] }
  assert.ok(near(flow(run(chain(), {}, t)).success, 0))
  assert.ok(near(flow(run(chain({ exp: { replicas: 2 }, sys: { replicas: 2 } }), {}, t)).success, 1))
})
rule('a region outage stops single-region APIs and single-region systems', () => {
  const t = { ...read(10), incidents: [{ region: true }] }
  assert.ok(near(flow(run(chain(), {}, t)).success, 0))
  const two = chain({ exp: { regions: '2' }, sys: { regions: '2' } })
  assert.ok(near(flow(run(two, {}, t)).success, 1))
  assert.ok(near(flow(run(two, { systems: [{ match: 'database', regions: 1 }] }, t)).success, 0))
})
rule('traffic with no route to its target reaches nothing it needs', () => {
  const d = chain()
  d.edges = d.edges.filter((e) => e.to !== 'db')
  const r = run(d, {}, read(10))
  assert.equal(r.nodes.db.arrived, 0)
})
rule('a spike raises the rate for its minutes', () => {
  const r = run(chain({ exp: { vCores: '1' }, sys: { vCores: '1' } }), {}, read(10, { spikes: [{ at: 3, forMin: 2, rps: 200 }] }))
  assert.equal(r.nodes.exp.peakRps, 200)
  assert.ok(near(flow(r).offered, 600 * 8 + 12000 * 2, 1))
})
// web → lb → two copies of an API → db
const balanced = (mode) =>
  diagram(
    { web: ['web-app', 'Web'], lb: ['load-balancer', 'LB', mode ? { mode } : undefined], a: ['experience-api', 'api-a', { vCores: '0.2' }], b: ['experience-api', 'api-b', { vCores: '0.2' }], db: ['database', 'DB'] },
    ['web -> lb', 'lb -> a', 'lb -> b', 'a -> db', 'b -> db'],
  )
rule('a load balancer shares requests between healthy boxes, and skips one that is down', () => {
  const r = run(balanced(), {}, read(100))
  assert.ok(near(r.nodes.a.peakRps, 50, 0.5) && near(r.nodes.db.peakRps, 100, 0.5), `${r.nodes.a.peakRps} ${r.nodes.db.peakRps}`)
  const down = run(balanced(), {}, { ...read(80), incidents: [{ down: { label: 'api-a' } }] })
  assert.ok(near(flow(down).success, 1) && near(down.nodes.b.peakRps, 80, 0.5))
})
rule('a load balancer in failover mode sends everything to the first box until it is down', () => {
  const r = run(balanced('failover'), {}, read(40))
  assert.ok(near(r.nodes.a.peakRps, 40, 0.5) && r.nodes.b.peakRps === 0)
  const down = run(balanced('failover'), {}, { ...read(40), incidents: [{ down: { label: 'api-a' } }] })
  assert.ok(near(down.nodes.b.peakRps, 40, 0.5) && near(flow(down).success, 1))
})
rule('a gateway sends each request to the API the traffic names with via', () => {
  const d = balanced()
  d.nodes.find((n) => n.id === 'lb').type = 'api-gateway'
  const r = run(d, {}, read(40, { via: { label: 'api-b' } }))
  assert.ok(r.nodes.a.peakRps === 0 && near(r.nodes.b.peakRps, 40, 0.5))
})
rule('a request prefers the direct route to its target over one through a broker', () => {
  const d = diagram(
    { web: ['web-app', 'Web'], x: ['experience-api', 'exp'], w: ['system-api', 'sys-write'], r: ['system-api', 'sys-read'], src: ['database', 'Source'], t: ['topic', 'changes'], p: ['process-api', 'projector'], rs: ['database', 'Read store'] },
    ['web -> x', 'x -> w', 'x -> r', 'w -> src', 'src ~> t', 't ~> p', 'p -> rs', 'r -> rs'],
  )
  const r = run(d, {}, { traffic: [{ from: 'web-app', rps: 10, to: { label: 'Read store' } }] })
  assert.equal(r.nodes.w.peakRps, 0, 'reads do not go round through the writer')
  assert.ok(near(r.nodes.r.peakRps, 10, 0.5))
})
rule('a rate limit holds behind a busy box and through a spike', () => {
  const r = run(chain({ exp: { vCores: '0.2' }, sys: { rateLimit: 28 } }), {}, read(20, { spikes: [{ at: 3, forMin: 3, rps: 300 }] }))
  assert.ok(r.nodes.db.peakRps <= 28.5, `db ${r.nodes.db.peakRps}`)
})
rule('requests refused for their credentials do not use up a rate limit', () => {
  const d = chain({ exp: { auth: 'client-id', rateLimit: 30, vCores: '1' } })
  const r = run(d, {}, { traffic: [{ from: 'web-app', rps: 20, to: 'database', name: 'good' }, { from: 'web-app', rps: 200, to: 'database', auth: 'none', name: 'bots' }] })
  assert.ok(near(flow(r, 0).success, 1) && near(flow(r, 1).refused, 1))
})
rule('poison messages fail every time: they reach the DLQ and nothing else stops', () => {
  const t = { traffic: [{ from: 'web-app', rps: 10, to: 'database', kind: 'write', poison: 0.1 }] }
  const r = run(queued({ maxRedelivery: 3 }, ['q ~> dlq'], { dlq: ['dlq', 'orders-dlq'] }), {}, t)
  // 60 poison messages a minute; those of the last two minutes have not used their 3 deliveries yet
  assert.ok(near(r.queues.q.dlq, 480, 1) && r.lost === 0, `dlq ${r.queues.q.dlq}`)
  const stuck = run(queued(), {}, t)
  assert.ok(stuck.queues.q.end > 0 && stuck.queues.q.dlq === 0, 'with no limit they stay in the queue')
})
rule('a message does not go round a loop of queues forever', () => {
  const d = diagram(
    { app: ['experience-api', 'exp'], q1: ['queue', 'in'], p: ['process-api', 'prc'], q2: ['queue', 'out'], db: ['database', 'DB'] },
    ['app ~> q1', 'q1 ~> p', 'p -> db', 'p ~> q2', 'q2 ~> app'],
  )
  const r = run(d, {}, { traffic: [{ from: 'experience-api', rps: 5, kind: 'write', to: 'database' }] })
  assert.ok(near(r.nodes.db.served, 3000, 5), `db ${r.nodes.db.served}`)
})
rule('an API can be given its own processing time by the scenario', () => {
  const r = run(chain(), { systems: [{ match: { label: 'exp-api' }, latencyMs: 2000 }] }, read(5))
  assert.ok(flow(r).avgMs > 2000)
})

rule('expectations read the run', () => {
  const d = chain({ exp: { rateLimit: 20 } })
  const test = { ...read(40), expect: { answers: [{ minSuccess: 0.9 }], peakRps: [{ node: 'database', max: 25 }], vCores: { max: 1 } } }
  const out = runArchTest(d, {}, test)
  assert.equal(out.pass, false)
  assert.deepEqual(out.lines.map((l) => l.ok), [false, true, true])
})

// ---------- every problem's simulation ----------
const FOLDERS = ['architecture', 'use-cases', 'case-studies']
const only = process.argv.slice(2)
const STYLE = [
  [/\s[—–]\s|\s-\s/, 'a dash used as punctuation'],
  [/\b(simply|just|easy|easily)\b/i, 'the words simply, just or easy'],
]
const TRAFFIC_KEYS = new Set(['from', 'rps', 'to', 'kind', 'auth', 'name', 'at', 'forMin', 'spikes', 'via', 'poison'])
const INCIDENT_KEYS = new Set(['down', 'hang', 'slow', 'latencyMs', 'errors', 'rate', 'restart', 'zone', 'region', 'at', 'forMin'])
const SYSTEM_KEYS = new Set(['match', 'latencyMs', 'maxRps', 'errorRate', 'regions', 'hitRatio'])
const AUTHS = new Set(['valid', 'none', 'client-id', 'jwt', 'oauth2', 'mtls'])

let problems = 0
let tests = 0
const errors = []
for (const folder of FOLDERS) {
  for (const file of readdirSync(resolve('src/content', folder)).filter((f) => f.endsWith('.js'))) {
    const id = file.replace(/\.js$/, '')
    if (only.length && !only.includes(id)) continue
    const p = (await import(pathToFileURL(resolve('src/content', folder, file)).href)).default
    const d = p.diagram
    if (!d) continue
    const errs = []
    const ref = d.reference
    // settings on the model answer must be ones its boxes have
    for (const n of ref?.nodes ?? []) {
      for (const [k, v] of Object.entries(n.config ?? {})) {
        const field = (ARCH_SETTINGS[n.type] ?? []).find((f) => f.key === k)
        if (!field) errs.push(`box ${n.id} (${n.type}) has no setting "${k}"`)
        else if (field.type === 'select' && !field.options.includes(String(v))) errs.push(`box ${n.id}: "${v}" is not an option of ${k}`)
        else if (field.type === 'number' && typeof v !== 'number') errs.push(`box ${n.id}: ${k} must be a number`)
      }
    }
    const sim = d.simulation
    if (!sim) {
      if (only.length) errs.push('no simulation')
      if (errs.length) errors.push(`${id}: ${errs.join('; ')}`)
      continue
    }
    problems++
    const typeOk = (m, where) => {
      for (const t of matcherTypes(m)) if (!NODE_TYPES[t]) errs.push(`${where}: unknown box type "${t}"`)
    }
    for (const s of sim.systems ?? []) {
      for (const k of Object.keys(s)) if (!SYSTEM_KEYS.has(k)) errs.push(`system has unknown key "${k}"`)
      typeOk(s.match, 'system')
      if (!ref.nodes.some((n) => matches(n, s.match))) errs.push(`system ${JSON.stringify(s.match)} matches no box of the model answer`)
    }
    const names = new Set()
    for (const t of sim.tests ?? []) {
      tests++
      const where = `test "${t.name}"`
      if (!t.name || names.has(t.name)) errs.push(`a test needs a name of its own (${t.name})`)
      names.add(t.name)
      if (!t.about) errs.push(`${where} has no about`)
      for (const [re, what] of STYLE) for (const text of [t.name, t.about]) if (text && re.test(text)) errs.push(`${where} uses ${what}: ${text}`)
      const traffic = Array.isArray(t.traffic) ? t.traffic : []
      if (!traffic.length) errs.push(`${where} sends no traffic`)
      const flowNames = new Set()
      for (const tr of traffic) {
        for (const k of Object.keys(tr)) if (!TRAFFIC_KEYS.has(k)) errs.push(`${where}: traffic has unknown key "${k}"`)
        if (!(tr.rps > 0)) errs.push(`${where}: traffic needs rps`)
        if (tr.auth && !AUTHS.has(tr.auth)) errs.push(`${where}: unknown auth "${tr.auth}"`)
        if (tr.kind && !['read', 'write'].includes(tr.kind)) errs.push(`${where}: kind is read or write`)
        typeOk(tr.from, where)
        for (const to of [tr.to].flat().filter(Boolean)) {
          typeOk(to, where)
          if (!ref.nodes.some((n) => matches(n, to))) errs.push(`${where}: target ${JSON.stringify(to)} matches no box of the model answer`)
        }
        if (!ref.nodes.some((n) => matches(n, tr.from))) errs.push(`${where}: ${JSON.stringify(tr.from)} matches no box of the model answer`)
        const name = tr.name ?? JSON.stringify(tr.from)
        if (flowNames.has(name)) errs.push(`${where}: two traffic entries share the name ${name}; name them`)
        flowNames.add(name)
      }
      for (const inc of [t.incidents].flat().filter(Boolean)) {
        for (const k of Object.keys(inc)) if (!INCIDENT_KEYS.has(k)) errs.push(`${where}: incident has unknown key "${k}"`)
        for (const k of ['down', 'hang', 'slow', 'errors', 'restart']) if (inc[k]) {
          typeOk(inc[k], where)
          if (!ref.nodes.some((n) => matches(n, inc[k]))) errs.push(`${where}: incident ${k} matches no box of the model answer`)
        }
      }
      const keys = Object.keys(t.expect ?? {})
      if (!keys.length) errs.push(`${where} expects nothing`)
      for (const k of keys) if (!EXPECT_KEYS.includes(k)) errs.push(`${where}: unknown expect key "${k}"`)
      for (const spec of [t.expect?.answers, t.expect?.delivered, t.expect?.notReached, t.expect?.degraded].flat().filter(Boolean)) {
        if (spec.flow !== undefined && !traffic.some((tr) => (tr.name ?? null) === spec.flow)) errs.push(`${where}: expect names traffic "${spec.flow}" that the test does not send`)
      }
      if (t.durationMin !== undefined && !(t.durationMin >= 1 && t.durationMin <= 240)) errs.push(`${where}: durationMin is 1 to 240`)
      // the model answer passes, and an empty canvas does not
      const out = runArchTest(structuredClone(ref), sim, t)
      for (const l of out.lines) if (!l.ok) errs.push(`model answer fails ${where}: ${l.text}`)
      for (const n of out.result.notes) errs.push(`${where} on the model answer: ${n}`)
      if (runArchTest({ nodes: [], edges: [] }, sim, t).pass) errs.push(`${where} passes on an empty canvas`)
      // the defaults alone should not pass every test of a problem, or the settings teach nothing
    }
    const stripped = structuredClone(ref)
    for (const n of stripped.nodes) delete n.config
    if ((sim.tests ?? []).length && (sim.tests ?? []).every((t) => runArchTest(stripped, sim, t).pass)) errs.push('every test passes with no settings on any box; at least one test should need a setting')
    if (errs.length) errors.push(`${id}: ${errs.join('\n    ')}`)
  }
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
}
console.log(`${rules} engine rules pass. ${problems} problems with ${tests} test runs checked${errors.length ? `, ${errors.length} with errors` : ''}.`)

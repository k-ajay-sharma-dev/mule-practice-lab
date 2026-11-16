// Checks the flow simulator (src/sim):
// 1. Engine rules on small designs: handlers, routers, scopes, variables, the HTTP answer.
// 2. Every flow problem with a simulation: its reference design passes every test run, no run hits a simulator
//    limit, and each test says what it expects.
// scripts/check-strict.js separately makes sure every other correct design in scripts/flow-cases still passes the
// test runs too, since they are part of the problem's checks.
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { design, flow, handler, route, router, scope, step, subFlow } from '../src/flow/dsl.js'
import { simulate } from '../src/sim/engine.js'
import { checkExpectations } from '../src/sim/expect.js'

const failures = []
const fail = (msg) => failures.push(msg)
const listener = (path = '/x', methods = '') => step('http-listener', { path, allowedMethods: methods })
const post = (path, body) => ({ trigger: { http: { method: 'POST', path, body } } })

// ---------- 1. engine rules ----------
const cases = []
const rule = (name, fn) => cases.push([name, fn])

rule('a payload set in the flow is the answer, with status 200', () => {
  const r = simulate(design(flow('f', listener('/a'), [step('set-payload', { value: '#[output application/json --- { ok: true }]' })])), {}, post('/a', {}))
  assert.equal(r.response.status, 200)
  assert.deepEqual(r.response.body, { ok: true })
})
rule('vars.httpStatus sets the status', () => {
  const r = simulate(design(flow('f', listener('/a'), [step('set-variable', { variableName: 'httpStatus', value: '201' })])), {}, post('/a', {}))
  assert.equal(r.response.status, 201)
})
rule('no listener for the path answers 404, a wrong method 405', () => {
  const d = design(flow('f', listener('/a', 'GET'), [step('logger', { message: 'x' })]))
  assert.equal(simulate(d, {}, post('/b', {})).response.status, 404)
  assert.equal(simulate(d, {}, post('/a', {})).response.status, 405)
})
rule('a failing call goes to the handler that covers it; On Error Propagate answers with vars.httpStatus', () => {
  const d = design(
    flow('f', listener('/a'), [step('http-request', { method: 'GET', path: '/down' })], [
      handler('on-error-propagate', { type: 'HTTP:NOT_FOUND' }, [step('set-variable', { variableName: 'httpStatus', value: '400' })]),
      handler('on-error-propagate', { type: 'HTTP:CONNECTIVITY' }, [step('set-variable', { variableName: 'httpStatus', value: '503' }), step('set-payload', { value: '#[output application/json --- { e: error.errorType.identifier }]' })]),
    ]),
  )
  const r = simulate(d, { systems: { http: [{ method: 'GET', path: '/down', respond: { fault: 'CONNECTIVITY' } }] } }, post('/a', {}))
  assert.equal(r.response.status, 503)
  assert.deepEqual(r.response.body, { e: 'CONNECTIVITY' })
})
rule('MULE:CONNECTIVITY catches HTTP:CONNECTIVITY', () => {
  const d = design(flow('f', listener('/a'), [step('http-request', { path: '/down' })], [handler('on-error-continue', { type: 'MULE:CONNECTIVITY' }, [step('set-payload', { value: 'fallback' })])]))
  const r = simulate(d, { systems: { http: [{ path: '/down', respond: { fault: 'CONNECTIVITY' } }] } }, post('/a', {}))
  assert.equal(r.response.status, 200)
  assert.equal(r.response.body, 'fallback')
})
rule('an unhandled error answers 500 with the error description, and the runtime logs it', () => {
  const r = simulate(design(flow('f', listener('/a'), [step('raise-error', { type: 'APP:BAD', description: 'Nope' })])), {}, post('/a', {}))
  assert.equal(r.response.status, 500)
  assert.equal(r.response.body, 'Nope')
  assert.ok(r.logs.some((l) => l.source === 'runtime' && l.level === 'ERROR'))
})
rule('a slow answer past the Response timeout raises HTTP:TIMEOUT', () => {
  const d = design(flow('f', listener('/a'), [step('http-request', { path: '/slow', responseTimeout: 1000 })]))
  const r = simulate(d, { systems: { http: [{ path: '/slow', latencyMs: 4000, respond: { status: 200, body: {} } }] } }, post('/a', {}))
  assert.equal(r.response.error.type, 'HTTP:TIMEOUT')
})
rule('Choice takes the first true route, then the default', () => {
  const d = (w) =>
    design(
      flow('f', listener('/a'), [
        router('choice', {}, [route({ expression: '#[payload.w <= 2]' }, [step('set-payload', { value: 'LETTER' })]), route({ expression: '#[payload.w <= 30]' }, [step('set-payload', { value: 'PARCEL' })])], { otherwise: [step('set-payload', { value: 'FREIGHT' })] }),
      ]),
    )
  assert.equal(simulate(d(), {}, post('/a', { w: 1 })).response.body, 'LETTER')
  assert.equal(simulate(d(), {}, post('/a', { w: 12 })).response.body, 'PARCEL')
  assert.equal(simulate(d(), {}, post('/a', { w: 99 })).response.body, 'FREIGHT')
})
rule('For Each gives back the payload it started with and keeps variables', () => {
  const d = design(flow('f', listener('/a'), [scope('foreach', { collection: '#[payload.lines]' }, [step('set-variable', { variableName: 'n', value: '#[vars.counter]' }), step('set-payload', { value: 'changed' })])]))
  const r = simulate(d, {}, post('/a', { lines: [1, 2, 3] }))
  assert.deepEqual(r.response.body, { lines: [1, 2, 3] })
  assert.equal(r.trace.filter((t) => t.type === 'set-payload').length, 3)
})
rule('Until Successful retries, then raises MULE:RETRY_EXHAUSTED', () => {
  const d = design(flow('f', listener('/a'), [scope('until-successful', { maxRetries: 2, millisBetweenRetries: 100 }, [step('http-request', { path: '/flaky' })])]))
  const flaky = (n) => ({ systems: { http: [{ path: '/flaky', responses: [...Array(n).fill({ fault: 'CONNECTIVITY' }), { status: 200, body: 'ok' }] }] } })
  assert.equal(simulate(d, flaky(2), post('/a', {})).response.body, 'ok')
  const r = simulate(d, flaky(5), post('/a', {}))
  assert.equal(r.response.error.type, 'MULE:RETRY_EXHAUSTED')
  assert.equal(r.effects.http.length, 3)
})
rule('Try with On Error Continue lets the flow carry on after it', () => {
  const d = design(flow('f', listener('/a'), [scope('try', {}, [step('http-request', { path: '/x' })], { errorHandlers: [handler('on-error-continue', {}, [step('logger', { level: 'WARN', message: 'skipped' })])] }), step('set-payload', { value: 'after' })]))
  const r = simulate(d, { systems: { http: [{ path: '/x', respond: { status: 500, body: {} } }] } }, post('/a', {}))
  assert.equal(r.response.body, 'after')
  assert.ok(r.logs.some((l) => l.level === 'WARN'))
})
rule('a Flow Reference with a target keeps the payload and fills the variable', () => {
  const d = design(flow('f', listener('/a'), [step('flow-ref', { name: 'look', target: 'found' }), step('set-payload', { value: '#[output application/json --- { p: payload.id, f: vars.found }]' })]), subFlow('look', [step('set-payload', { value: 'X' })]))
  assert.deepEqual(simulate(d, {}, post('/a', { id: 7 })).response.body, { p: 7, f: 'X' })
})
rule('a VM publish starts the flow that listens on the queue, after the first flow', () => {
  const d = design(flow('a', listener('/a'), [step('vm-publish', { queueName: 'q' }), step('set-payload', { value: 'accepted' })]), flow('b', step('vm-listener', { queueName: 'q' }), [step('logger', { message: '#["got " ++ payload.id]' })]))
  const r = simulate(d, {}, post('/a', { id: 'A1' }))
  assert.equal(r.response.body, 'accepted')
  assert.ok(r.logs.some((l) => l.message === 'got A1'))
})
rule('a database insert and select work on the scenario tables, with :params from vars and the payload', () => {
  const d = design(flow('f', listener('/a'), [step('db-insert', { sql: 'INSERT INTO orders (order_id, total) VALUES (:orderId, :total)' }), step('set-variable', { variableName: 'orderId', value: 'A1' }), step('db-select', { sql: 'SELECT * FROM orders WHERE order_id = :orderId' })]))
  const r = simulate(d, { systems: { db: { tables: { orders: { rows: [] } } } } }, post('/a', { orderId: 'A1', total: 5 }))
  assert.equal(r.response.body.length, 1)
  const lines = checkExpectations(r, { status: 200, db: { orders: { count: 1, has: { order_id: 'A1' } } } })
  assert.ok(lines.every((l) => l.ok), JSON.stringify(lines))
})
rule('the Idempotent Message Validator stops the second copy', () => {
  const d = design(flow('f', listener('/a'), [step('idempotent', { idExpression: '#[payload.id]' }), step('set-payload', { value: 'done' })]))
  const r = simulate(d, {}, { triggers: [post('/a', { id: 1 }).trigger, post('/a', { id: 1 }).trigger] })
  assert.equal(r.responses[0].status, 200)
  assert.equal(r.responses[1].error.type, 'MULE:DUPLICATE_MESSAGE')
})
rule('Scatter-Gather joins the results under "0" and "1"', () => {
  const d = design(flow('f', listener('/a'), [router('scatter-gather', {}, [route({}, [step('set-payload', { value: 'A' })]), route({}, [step('set-payload', { value: 'B' })])]), step('set-payload', { value: '#[payload."0".payload ++ payload."1".payload]' })]))
  assert.equal(simulate(d, {}, post('/a', {})).response.body, 'AB')
})
rule('an Async scope does not hold up the answer', () => {
  const d = design(flow('f', listener('/a'), [scope('async', {}, [step('http-request', { path: '/slow' })]), step('set-payload', { value: 'quick' })]))
  const r = simulate(d, { systems: { http: [{ path: '/slow', latencyMs: 3000, respond: { status: 200 } }] } }, post('/a', {}))
  assert.equal(r.response.body, 'quick')
  assert.ok(checkExpectations(r, { maxMs: 500, calls: [{ path: '/slow', count: 1 }] }).every((l) => l.ok))
})

for (const [name, fn] of cases) {
  try {
    fn()
  } catch (e) {
    fail(`engine: ${name}: ${e.message.split('\n')[0]}`)
  }
}

// ---------- 2. problems with a simulation ----------
const dir = resolve('src/content/flows')
let withSim = 0
let testRuns = 0
for (const file of readdirSync(dir).filter((f) => /^fl-\d+\.js$/.test(f)).sort()) {
  const p = (await import(pathToFileURL(join(dir, file)).href)).default
  const sim = p.simulation
  if (!sim) continue
  withSim++
  if (!sim.tests?.length) fail(`${p.id}: simulation has no tests`)
  const names = new Set()
  for (const t of sim.tests ?? []) {
    testRuns++
    if (!t.name) fail(`${p.id}: a test has no name`)
    if (names.has(t.name)) fail(`${p.id}: two tests are named "${t.name}"`)
    names.add(t.name)
    if (!t.expect || !Object.keys(t.expect).length) fail(`${p.id} "${t.name}": the test expects nothing`)
    const r = simulate(p.referenceFlow, sim, t)
    if (r.limit) fail(`${p.id} "${t.name}": the reference hit a simulator limit: ${r.limit}`)
    const lines = checkExpectations(r, t.expect)
    for (const l of lines.filter((x) => !x.ok)) fail(`${p.id} "${t.name}": the reference fails: ${l.text}`)
  }
  // the style rules the site's writing follows
  for (const t of sim.tests ?? []) {
    for (const text of [t.name, t.about].filter(Boolean)) {
      if (/ — | – |—/.test(text)) fail(`${p.id} "${t.name}": a dash used as punctuation`)
      if (/\b(simply|just|easy|easily)\b/i.test(text)) fail(`${p.id} "${t.name}": simply, just or easy`)
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log(`Simulator checks pass (${cases.length} engine rules; ${withSim} problems with ${testRuns} test runs, every reference passes).`)

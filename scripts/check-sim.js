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

rule('database Input parameters give the :names their values, and a Target variable keeps the payload', () => {
  const d = design(flow('f', listener('/a'), [step('db-insert', { sql: 'INSERT INTO t (id, name) VALUES (:id, :name)', inputParameters: '#[{ id: 7, name: payload.n }]', target: 'res' })]))
  const r = simulate(d, { systems: { db: { tables: { t: { rows: [] } } } } }, post('/a', { n: 'Ann' }))
  assert.deepEqual(r.response.body, { n: 'Ann' })
  assert.ok(checkExpectations(r, { db: { t: { has: { id: 7, name: 'Ann' } } } }).every((l) => l.ok))
})
rule('an HTTP trigger can carry the authentication an API policy would set', () => {
  const d = design(flow('f', listener('/a'), [step('set-payload', { value: '#[authentication.properties.claims.scope]' })]))
  const r = simulate(d, {}, { trigger: { http: { method: 'GET', path: '/a', authentication: { principal: 'b-1', properties: { claims: { scope: 'read' } } } } } })
  assert.equal(r.response.body, 'read')
})
rule('connector calls can be checked by their settings, and files by a name pattern', () => {
  const d = design(flow('f', listener('/a'), [step('file-write', { path: '#["/archive/orders-" ++ payload.id ++ ".csv"]' }), step('s3-put', { bucket: '#[payload.bucket]', key: 'x' })]))
  const r = simulate(d, {}, post('/a', { bucket: 'invoices', id: 'A1' }))
  const lines = checkExpectations(r, { connector: [{ type: 's3-put', settings: { bucket: 'invoices' }, count: 1 }], files: { '/archive/orders-*.csv': { count: 1 } } })
  assert.ok(lines.every((l) => l.ok), JSON.stringify(lines))
})
rule('a Try that begins a transaction undoes its database writes when the error propagates, and keeps them on Continue', () => {
  const body = (handlerType) =>
    design(
      flow('f', listener('/a'), [
        scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [step('db-insert', { sql: 'INSERT INTO t (id) VALUES (:id)' }), step('jms-publish', { destination: 'out' }), step('raise-error', { type: 'APP:BAD', description: 'x' })], {
          errorHandlers: [handler(handlerType, {}, [step('logger', { message: 'failed' })])],
        }),
      ]),
    )
  const sc = { systems: { db: { tables: { t: { key: 'id', rows: [] } } } } }
  // a Try's LOCAL transaction is bound to the first resource it used (the database here), so the JMS message stays
  const rolled = simulate(body('on-error-propagate'), sc, post('/a', { id: 1 }))
  assert.ok(checkExpectations(rolled, { db: { t: { count: 0 } }, sent: [{ destination: 'out', count: 1 }] }).every((l) => l.ok))
  // a transacted JMS listener: XA undoes the database and the publish; LOCAL undoes the publish only
  const listenerTx = (type) =>
    design(flow('l', step('jms-listener', { destination: 'in', transactionalAction: 'ALWAYS_BEGIN', transactionType: type }), [step('db-insert', { sql: 'INSERT INTO t (id) VALUES (:id)' }), step('jms-publish', { destination: 'out' }), step('raise-error', { type: 'APP:BAD' })]))
  const msg = { trigger: { message: { kind: 'jms', destination: 'in', payload: { id: 1 } } } }
  assert.ok(checkExpectations(simulate(listenerTx('XA'), sc, msg), { db: { t: { count: 0 } }, notSent: ['out'], ack: 'returned' }).every((l) => l.ok))
  assert.ok(checkExpectations(simulate(listenerTx('LOCAL'), sc, msg), { db: { t: { count: 1 } }, notSent: ['out'], ack: 'returned' }).every((l) => l.ok))
  // db.failWhen fails one statement only
  const two = design(flow('f', listener('/a'), [step('db-insert', { sql: 'INSERT INTO t (id) VALUES (:id)' }), step('db-delete', { sql: 'DELETE FROM t WHERE id = 99' })]))
  const half = simulate(two, { systems: { db: { tables: { t: { key: 'id', rows: [] } }, failWhen: [{ match: 'DELETE FROM t' }] } } }, post('/a', { id: 1 }))
  assert.equal(half.error?.type, 'DB:QUERY_EXECUTION')
  assert.ok(checkExpectations(half, { db: { t: { count: 1 } } }).every((l) => l.ok))
  const kept = simulate(body('on-error-continue'), sc, post('/a', { id: 1 }))
  assert.ok(checkExpectations(kept, { db: { t: { count: 1 } }, sent: [{ destination: 'out', count: 1 }] }).every((l) => l.ok))
})
rule('a duplicate key raises DB:QUERY_EXECUTION with the database text', () => {
  const d = design(flow('f', listener('/a'), [step('db-insert', { database: 'Oracle', sql: 'INSERT INTO t (id) VALUES (:id)' })]))
  const r = simulate(d, { systems: { db: { tables: { t: { key: 'id', rows: [{ id: 1 }] } } } } }, post('/a', { id: 1 }))
  assert.equal(r.error?.type, 'DB:QUERY_EXECUTION')
  assert.match(r.response.body, /ORA-00001/)
})
rule('Success status codes let a 422 through as an answer', () => {
  const d = design(flow('f', listener('/a'), [step('http-request', { method: 'POST', path: '/psp', successStatusCodes: '200..299,422' }), step('set-payload', { value: '#[attributes.statusCode]' })]))
  const r = simulate(d, { systems: { http: [{ method: 'POST', path: '/psp', respond: { status: 422, body: { declined: true } } }] } }, post('/a', {}))
  assert.equal(r.response.body, 422)
})
rule('a Batch Aggregator gets the records in groups of its size', () => {
  const d = design(
    flow('f', listener('/a'), [
      scope('batch-job', { jobName: 'j' }, [], { routes: [route({ name: 's1' }, [step('logger', { message: '#[payload.id]' }), scope('batch-aggregator', { size: 2 }, [step('logger', { message: '#["group " ++ sizeOf(payload)]' })])])] }),
    ]),
  )
  const r = simulate(d, {}, post('/a', [{ id: 1 }, { id: 2 }, { id: 3 }]))
  const groups = r.logs.filter((l) => /^group/.test(l.message)).map((l) => l.message)
  assert.deepEqual(groups, ['group 2', 'group 1'])
})
rule('Validate schema checks the payload against the scenario schema', () => {
  const d = design(flow('f', listener('/a'), [step('validation', { check: 'json-schema', expression: 'schemas/order.json' }), step('set-payload', { value: 'ok' })]))
  const sc = { systems: { schemas: { 'order.json': { type: 'object', required: ['orderId'], properties: { qty: { type: 'integer', minimum: 1 } } } } } }
  assert.equal(simulate(d, sc, post('/a', { orderId: 'A', qty: 2 })).response.body, 'ok')
  assert.equal(simulate(d, sc, post('/a', { qty: 0 })).error?.type, 'JSON:SCHEMA_NOT_HONOURED')
})
rule('payload.^raw is the text the message arrived as, and an XML file is read as XML', () => {
  const d = design(flow('f', listener('/a'), [step('set-payload', { value: '#[payload.^raw]' })]))
  assert.equal(simulate(d, {}, { trigger: { http: { method: 'POST', path: '/a', body: { a: 1 }, rawBody: '{ "a": 1 }' } } }).response.body, '{ "a": 1 }')
  const f = design(flow('f', step('file-listener', { directory: '/in' }), [step('logger', { message: '#[payload.order.id]' })]))
  const r = simulate(f, {}, { trigger: { file: { path: '/in/o.xml', content: '<order><id>A-1</id></order>' } } })
  assert.ok(r.logs.some((l) => l.message === 'A-1'), JSON.stringify(r.logs))
})
rule('a Transform writer option stays with the payload when it is written to a file', () => {
  const d = design(flow('f', listener('/a'), [step('transform', { script: '%dw 2.0\noutput application/csv separator="|", header=false\n---\npayload' }), step('file-write', { path: '/out/x.txt' })]))
  const r = simulate(d, {}, post('/a', [{ a: 1, b: 2 }]))
  assert.ok(checkExpectations(r, { files: { '/out/x.txt': { has: '1|2' } } }).every((l) => l.ok), JSON.stringify(r.effects.files))
})
rule('an Anypoint MQ exchange copies the message to its bound queues; Parse Template fills its template', () => {
  const d = design(
    flow('a', listener('/a'), [step('mq-publish', { destination: 'ex' })]),
    flow('b', step('mq-subscriber', { destination: 'q1' }), [step('parse-template', { location: 'templates/t.txt' }), step('logger', { message: '#[payload]' })]),
    flow('c', step('mq-subscriber', { destination: 'q2' }), [step('logger', { message: '#["q2 " ++ payload.id]' })]),
  )
  const r = simulate(d, { systems: { exchanges: { ex: ['q1', 'q2'] }, templates: { 't.txt': 'Hi #[payload.id]' } } }, post('/a', { id: 'X' }))
  assert.ok(r.logs.some((l) => l.message === 'Hi X') && r.logs.some((l) => l.message === 'q2 X'), JSON.stringify(r.logs.map((l) => l.message)))
})
rule('a Kafka MANUAL listener commits only with a Commit; Scatter-Gather timeout and Parallel For Each concurrency count', () => {
  const k = (steps) => design(flow('k', step('kafka-listener', { topic: 't', ackMode: 'MANUAL' }), steps))
  const msg = { trigger: { message: { kind: 'kafka', destination: 't', payload: { a: 1 } } } }
  assert.ok(checkExpectations(simulate(k([step('kafka-commit', { consumerCommitKey: '#[attributes.consumerCommitKey]' })]), {}, msg), { ack: 'acked' }).every((l) => l.ok))
  assert.ok(checkExpectations(simulate(k([step('logger', { message: 'x' })]), {}, msg), { ack: 'not-acked' }).every((l) => l.ok))
  const sg = design(flow('f', listener('/a'), [router('scatter-gather', { timeout: 1000 }, [route({}, [step('http-request', { path: '/slow' })]), route({}, [step('set-payload', { value: 'B' })])])]))
  const slow = { systems: { http: [{ path: '/slow', latencyMs: 3000, respond: { status: 200 } }] } }
  const r = simulate(sg, slow, post('/a', {}))
  assert.equal(r.response.error.type, 'MULE:COMPOSITE_ROUTING')
  assert.ok(r.elapsedMs <= 1100, String(r.elapsedMs))
  const pf = design(flow('f', listener('/a'), [scope('parallel-foreach', { collection: '#[payload]', maxConcurrency: 2 }, [step('http-request', { path: '/s' })])]))
  const r2 = simulate(pf, { systems: { http: [{ path: '/s', latencyMs: 100, respond: { status: 200 } }] } }, post('/a', [1, 2, 3, 4]))
  assert.equal(r2.elapsedMs, 200)
})
rule('XML attributes survive a For Each, and readUrl reads a scenario file', () => {
  const d = design(
    flow('f', step('file-listener', { directory: '/in' }), [
      scope('foreach', { collection: '#[payload.sales.*sale]' }, [step('logger', { message: '#[payload.@region ++ " " ++ payload.id]' })]),
      step('logger', { message: '#[readUrl("classpath://regions.json", "application/json").EMEA]' }),
    ]),
  )
  const r = simulate(d, { systems: { files: { 'regions.json': '{"EMEA":"Europe"}' } } }, { trigger: { file: { path: '/in/s.xml', content: '<sales><sale region="EMEA"><id>S-1</id></sale><sale region="APAC"><id>S-2</id></sale></sales>' } } })
  const lines = r.logs.map((l) => l.message)
  assert.deepEqual(lines, ['EMEA S-1', 'APAC S-2', 'Europe'], JSON.stringify(lines))
})
rule('stored and notStored read the Object Store after the run', () => {
  const d = design(flow('f', listener('/a'), [step('os-store', { key: 'watermark', value: '#[payload.at]' })]))
  const r = simulate(d, {}, post('/a', { at: '2026-11-13' }))
  assert.ok(checkExpectations(r, { stored: [{ key: 'watermark', value: '2026-11-13' }], notStored: ['other'] }).every((l) => l.ok))
})
rule('the APIkit Router picks the flow for the method and resource, with the URI parameters', () => {
  const d = design(
    flow('api-main', listener('/api/*'), [step('apikit-router', { config: 'cfg' })], [
      handler('on-error-propagate', { type: 'APIKIT:NOT_FOUND' }, [step('set-variable', { variableName: 'httpStatus', value: '404' })]),
      handler('on-error-propagate', { type: 'APIKIT:METHOD_NOT_ALLOWED' }, [step('set-variable', { variableName: 'httpStatus', value: '405' })]),
    ]),
    flow('get:\\orders\\(orderId):cfg', null, [step('set-payload', { value: '#[attributes.uriParams.orderId]' })]),
    flow('post:\\orders:application\\json:cfg', null, [step('set-payload', { value: 'created' })]),
  )
  const get = (path, method = 'GET') => simulate(d, {}, { trigger: { http: { method, path } } }).response
  assert.equal(get('/api/orders/A-7').body, 'A-7')
  assert.equal(get('/api/orders', 'POST').body, 'created')
  assert.equal(get('/api/orders/A-7', 'DELETE').status, 405)
  assert.equal(get('/api/nothing').status, 404)
})

for (const [name, fn] of cases) {
  try {
    fn()
  } catch (e) {
    fail(`engine: ${name}: ${e.message.split('\n')[0]}`)
  }
}

// ---------- 2. problems with a simulation ----------
// Usage: node scripts/check-sim.js [fl-012 fl-013 ...] checks only those problems.
const dir = resolve('src/content/flows')
const onlyProblems = process.argv.slice(2)
let withSim = 0
let testRuns = 0
for (const file of readdirSync(dir).filter((f) => /^fl-\d+\.js$/.test(f)).sort()) {
  if (onlyProblems.length && !onlyProblems.includes(file.replace(/\.js$/, ''))) continue
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

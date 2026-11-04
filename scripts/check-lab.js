// Checks the Platform Lab engine against the examples and status codes on the Mule Gateway policy pages.
import assert from 'node:assert/strict'
import { ipMatches, jsonViolation, newRuntime, send } from '../src/lab/engine.js'
import { GUIDED_LABS, runCheck } from '../src/lab/labs.js'
import { defaultSettings } from '../src/lab/policies.js'
import {
  advance,
  appStatus,
  deploy,
  deploymentStatus,
  keepProtected,
  MASK,
  maskProtected,
  newConfig,
  newState,
  parseProperties,
  remove,
  rollback,
  settle,
  start,
  stop,
  usedVCores,
  validate,
} from '../src/lab/runtime.js'

const healthy = (extra = {}) => ({
  ...newConfig(),
  properties: { 'db.host': 'db.lab', 'db.user': 'lab' },
  protectedProperties: { 'db.password': 'secret-value' },
  ...extra,
})
// deploys and plays the deployment to its end
function shipped(state, config) {
  const result = deploy(state, config)
  assert.deepEqual(result.errors, [])
  return settle(result.state)
}
const appIn = (state, name = 'orders-api') => state.apps.find((a) => a.name === name)
const replicaStatuses = (state, name) => appIn(state, name).replicas.map((r) => r.status)

const policy = (type, settings = {}, id = type) => ({ id, type, settings: { ...defaultSettings(type), ...settings } })
const app = { name: 'Mobile', clientId: 'id-1', clientSecret: 'secret-1', contract: 'approved', tier: 'Gold' }
const base = { apps: [app], tiers: [{ name: 'Gold', requests: 2, periodMs: 10000 }] }
const request = (extra = {}) => ({ method: 'GET', ip: '10.1.2.3', clientId: 'id-1', clientSecret: 'secret-1', token: 'none', headers: [], ...extra })

// runs requests at the given times and returns each result
function run(policies, times, extra = {}, config = base) {
  let runtime = newRuntime()
  return times.map((at) => {
    const result = send({ ...config, policies }, runtime, request(extra), at)
    runtime = result.runtime
    return result
  })
}
const statuses = (results) => results.map((r) => r.status)

const tests = {
  'Client ID Enforcement: 401 for unknown, missing and wrong secret, 200 for valid'() {
    const p = [policy('client-id')]
    assert.equal(run(p, [0])[0].status, 200)
    assert.equal(run(p, [0], { clientId: 'nope' })[0].status, 401)
    assert.equal(run(p, [0], { clientId: '' })[0].status, 401)
    assert.equal(run(p, [0], { clientSecret: 'wrong' })[0].status, 401)
    assert.equal(run([policy('client-id', { secret: 'Not checked' })], [0], { clientSecret: 'wrong' })[0].status, 200)
  },
  'Client ID Enforcement: a contract that is not approved is rejected, and flagged as assumed'() {
    const config = { ...base, apps: [{ ...app, contract: 'pending' }] }
    const [r] = run([policy('client-id')], [0], {}, config)
    assert.equal(r.status, 401)
    assert.equal(r.trace[0].basis, 'assumed')
  },
  'Rate Limiting: docs example, 3 requests every 10 seconds, blocked until the window closes'() {
    const p = [policy('rate-limit', { requests: 3, periodMs: 10000 })]
    assert.deepEqual(statuses(run(p, [0, 1000, 2000, 3000, 9999, 10000])), [200, 200, 200, 429, 429, 200])
  },
  'Rate Limiting: each identifier group has its own quota'() {
    const p = [policy('rate-limit', { requests: 1, identifier: '#[attributes.method]' })]
    let runtime = newRuntime()
    const go = (method) => {
      const r = send({ ...base, policies: p }, runtime, request({ method }), 0)
      runtime = r.runtime
      return r.status
    }
    assert.deepEqual([go('GET'), go('POST'), go('GET')], [200, 200, 429])
  },
  'Rate Limiting: headers are off by default and report remaining, limit and reset when exposed'() {
    assert.deepEqual(run([policy('rate-limit')], [0])[0].responseHeaders, [])
    const [, second] = run([policy('rate-limit', { expose: 'Yes' })], [0, 4000])
    assert.deepEqual(second.responseHeaders, [['X-Ratelimit-Remaining', '1'], ['X-Ratelimit-Limit', '3'], ['X-Ratelimit-Reset', '6000']])
  },
  'Rate Limiting SLA: quota comes from the tier, invalid credentials return 401'() {
    const p = [policy('rate-limit-sla')]
    assert.deepEqual(statuses(run(p, [0, 1, 2, 10000])), [200, 200, 429, 200])
    assert.equal(run(p, [0], { clientId: 'nope' })[0].status, 401)
  },
  'Spike Control: docs timeline, request 3 is accepted after its delay and request 4 is rejected'() {
    const p = [policy('spike', { requests: 2, periodMs: 1000, delayMs: 499, attempts: 1, queueLimit: 5 })]
    const results = run(p, [0, 300, 600, 700])
    assert.deepEqual(statuses(results), [200, 200, 200, 429])
    assert.equal(results[2].latency, 499)
  },
  'IP Allowlist and Blocklist: 403, CIDR ranges, and the x-forwarded-for expression'() {
    assert.ok(ipMatches('10.1.2.3', '10.0.0.0/8'))
    assert.ok(!ipMatches('11.1.2.3', '10.0.0.0/8'))
    assert.ok(ipMatches('192.168.1.1', '192.168.1.1'))
    assert.equal(run([policy('ip-allow')], [0])[0].status, 200)
    assert.equal(run([policy('ip-allow')], [0], { ip: '8.8.8.8' })[0].status, 403)
    assert.equal(run([policy('ip-block')], [0], { ip: '203.0.113.9' })[0].status, 403)
    const forwarded = [policy('ip-allow', { expression: "#[attributes.headers['x-forwarded-for']]" })]
    assert.equal(run(forwarded, [0], { ip: '8.8.8.8', headers: [['X-Forwarded-For', '10.9.9.9, 8.8.8.8']] })[0].status, 200)
    assert.equal(run(forwarded, [0], { ip: '10.9.9.9' })[0].status, 403)
  },
  'Basic Authentication: Simple returns 401 for wrong credentials'() {
    const p = [policy('basic-auth')]
    assert.equal(run(p, [0], { basicUser: 'lab-user', basicPassword: 'lab-password' })[0].status, 200)
    assert.equal(run(p, [0], { basicUser: 'lab-user', basicPassword: 'x' })[0].status, 401)
  },
  'JWT Validation: 400 with no token, 401 for bad tokens, 200 when valid'() {
    const p = [policy('jwt')]
    assert.equal(run(p, [0], { token: 'none' })[0].status, 400)
    for (const token of ['expired', 'bad-signature', 'missing-claim', 'malformed']) assert.equal(run(p, [0], { token })[0].status, 401)
    assert.equal(run(p, [0], { token: 'valid' })[0].status, 200)
  },
  'JSON Threat Protection: docs example passes at its stated limits and fails one below each'() {
    const body = { Players: [{ Name: 'x', Email: 'sachin.tendulkar@example.com' }, {}, {}, {}] }
    const limits = { depth: 3, stringLength: 28, nameLength: 7, entries: 2, elements: 4 }
    assert.equal(jsonViolation(body, limits), null)
    assert.equal(jsonViolation(body, { ...limits, depth: 2 }), 'Maximum Container Depth')
    assert.equal(jsonViolation(body, { ...limits, stringLength: 27 }), 'Maximum String Value Length')
    assert.equal(jsonViolation(body, { ...limits, nameLength: 6 }), 'Maximum Object Entry Name Length')
    assert.equal(jsonViolation(body, { ...limits, entries: 1 }), 'Maximum Object Entry Count')
    assert.equal(jsonViolation(body, { ...limits, elements: 3 }), 'Maximum Array Element Count')
    assert.equal(jsonViolation(body, { depth: -1, stringLength: -1, nameLength: -1, entries: -1, elements: -1 }), null)
    assert.equal(run([policy('json-threat', { depth: 1 })], [0], { body: JSON.stringify(body) })[0].status, 400)
  },
  'Header Injection keeps a value the client sent, and Header Removal before it strips the spoofed one'() {
    const spoof = { headers: [['x-tenant', 'spoofed']] }
    const injected = run([policy('header-inject')], [0], spoof)[0]
    assert.deepEqual(injected.backendHeaders, [['x-tenant', 'spoofed'], ['x-tenant', 'internal']])
    const cleaned = run([policy('header-remove'), policy('header-inject')], [0], spoof)[0]
    assert.deepEqual(cleaned.backendHeaders, [['x-tenant', 'internal']])
  },
  'Order matters: rate limiting first lets rejected clients spend the quota, client ID first does not'() {
    const limitFirst = [policy('rate-limit', { requests: 1 }), policy('client-id')]
    const clientFirst = [policy('client-id'), policy('rate-limit', { requests: 1 })]
    const sequence = (policies) => {
      let runtime = newRuntime()
      return [{ clientId: 'nope' }, {}].map((extra) => {
        const r = send({ ...base, policies }, runtime, request(extra), 0)
        runtime = r.runtime
        return r.status
      })
    }
    assert.deepEqual(sequence(limitFirst), [401, 429])
    assert.deepEqual(sequence(clientFirst), [401, 200])
  },
  'A rejected request does not reach the backend and stops the chain'() {
    const r = run([policy('client-id'), policy('jwt')], [0], { clientId: 'nope' })[0]
    assert.equal(r.reachedBackend, false)
    assert.equal(r.trace.length, 1)
  },
  'send() leaves the runtime it was given untouched'() {
    const runtime = newRuntime()
    send({ ...base, policies: [policy('rate-limit')] }, runtime, request(), 0)
    assert.deepEqual(runtime, newRuntime())
  },
  'Runtime: application names follow the docs rules'() {
    const fields = (name) => validate({ ...newConfig(), name }).map((e) => e.field)
    assert.deepEqual(fields('my-app-1'), [])
    for (const bad of ['ab', 'a'.repeat(43), '1app', '-app', 'app-', 'my app', 'my_app']) assert.ok(fields(bad).includes('name'), bad)
    assert.deepEqual(fields('a'.repeat(42)), [])
  },
  'Runtime: replica count, size and clustering limits come from the docs'() {
    const fields = (extra) => validate({ ...newConfig(), ...extra }).map((e) => e.field)
    assert.deepEqual(fields({ replicas: 8 }), [])
    assert.deepEqual(fields({ replicas: 9 }), ['replicas'])
    assert.deepEqual(fields({ replicas: 0 }), ['replicas'])
    assert.deepEqual(fields({ vCores: 5 }), ['vCores'])
    assert.deepEqual(fields({ clustered: true, replicas: 1 }), ['clustered'])
    assert.deepEqual(fields({ clustered: true, replicas: 2 }), [])
    const { state, errors } = deploy(newState(), { ...newConfig(), replicas: 9 })
    assert.equal(errors.length, 1)
    assert.deepEqual(state.apps, [])
  },
  'Runtime: a healthy deployment moves Pending, Starting, Started on the clock'() {
    let state = deploy(newState(), healthy({ replicas: 2 })).state
    assert.deepEqual(replicaStatuses(state), ['Pending', 'Pending'])
    assert.equal(appStatus(appIn(state)), 'Not running')
    assert.equal(deploymentStatus(appIn(state)), 'Applying')
    state = advance(state, 2000)
    assert.deepEqual(replicaStatuses(state), ['Starting', 'Starting'])
    state = advance(state, 3000)
    assert.deepEqual(replicaStatuses(state), ['Started', 'Started'])
    assert.equal(appStatus(appIn(state)), 'Running')
    assert.equal(deploymentStatus(appIn(state)), 'Applied')
    assert.equal(appIn(state).history[0].status, 'Applied')
  },
  'Runtime: a missing property fails with a log line, and is flagged as assumed, then a fix and redeploy works'() {
    let state = shipped(newState(), newConfig())
    const app = appIn(state)
    assert.deepEqual(replicaStatuses(state), ['Failed'])
    assert.equal(deploymentStatus(app), 'Failed')
    assert.equal(appStatus(app), 'Not running')
    assert.equal(app.outcome.kind, 'property')
    assert.equal(app.outcome.basis, 'assumed')
    assert.ok(app.logs.some((l) => l.level === 'ERROR' && l.text.includes('${db.password}')))
    state = shipped(state, healthy())
    assert.equal(appStatus(appIn(state)), 'Running')
    assert.equal(appIn(state).outcome, null)
    assert.deepEqual(appIn(state).history.map((h) => h.status), ['Applied', 'Failed'])
  },
  'Runtime: too little heap fails at startup and a larger replica fixes it'() {
    const config = { ...newConfig(), name: 'inventory', packageId: 'inventory-sync', properties: { 'sftp.host': 'sftp.lab' }, vCores: 0.5 }
    let state = shipped(newState(), config)
    assert.equal(appIn(state, 'inventory').outcome.kind, 'memory')
    assert.equal(appIn(state, 'inventory').outcome.basis, 'docs')
    state = shipped(state, { ...config, vCores: 1 })
    assert.equal(appStatus(appIn(state, 'inventory')), 'Running')
  },
  'Runtime: a runtime older than the application needs fails, flagged as assumed'() {
    const config = { ...newConfig(), name: 'inventory', packageId: 'inventory-sync', properties: { 'sftp.host': 'x' }, vCores: 1, runtime: '4.6' }
    const state = shipped(newState(), config)
    assert.equal(appIn(state, 'inventory').outcome.kind, 'runtime')
    assert.equal(appIn(state, 'inventory').outcome.basis, 'assumed')
    assert.equal(appStatus(appIn(shipped(state, { ...config, runtime: '4.10' }), 'inventory')), 'Running')
  },
  'Runtime: without enough vCores the app waits in Pending and starts once another app stops'() {
    const hello = (name, vCores) => ({ ...newConfig(), name, packageId: 'hello-api', target: 'private', vCores })
    let state = shipped(newState(), hello('first', 1.5))
    assert.equal(usedVCores(state, 'private'), 1.5)
    state = shipped(state, hello('second', 1))
    assert.deepEqual(replicaStatuses(state, 'second'), ['Pending'])
    assert.equal(deploymentStatus(appIn(state, 'second')), 'Pending')
    assert.equal(appIn(state, 'second').outcome.kind, 'capacity')
    assert.equal(usedVCores(state, 'private'), 1.5)
    state = settle(stop(state, 'first'))
    assert.deepEqual(replicaStatuses(state, 'first'), ['Stopped'])
    assert.deepEqual(replicaStatuses(state, 'second'), ['Started'])
    assert.equal(usedVCores(state, 'private'), 1)
    assert.equal(deploymentStatus(appIn(state, 'second')), 'Applied')
  },
  'Runtime: deleting an app also frees capacity, and a waiting app can be fixed by a smaller redeploy'() {
    const hello = (name, vCores) => ({ ...newConfig(), name, packageId: 'hello-api', target: 'private', vCores })
    const waiting = shipped(shipped(newState(), hello('first', 1.5)), hello('second', 1))
    assert.deepEqual(replicaStatuses(settle(remove(waiting, 'first')), 'second'), ['Started'])
    assert.deepEqual(replicaStatuses(shipped(waiting, hello('second', 0.5)), 'second'), ['Started'])
  },
  'Runtime: a rolling update keeps serving at every step and replaces each replica'() {
    let state = shipped(newState(), healthy({ replicas: 2 }))
    const before = appIn(state).applied
    state = deploy(state, healthy({ replicas: 2, runtime: '4.10' })).state
    for (let i = 0; i < 30 && appIn(state).queue.length; i++) {
      assert.equal(appStatus(appIn(state)), 'Running')
      state = advance(state, 500)
    }
    const app = appIn(state)
    assert.equal(app.replicas.length, 2)
    assert.ok(app.replicas.every((r) => r.status === 'Started' && r.configId === app.applied))
    assert.notEqual(app.applied, before)
  },
  'Runtime: a failed rolling update keeps the old replicas serving and reports Update failed'() {
    let state = shipped(newState(), healthy({ replicas: 2 }))
    const good = appIn(state).applied
    state = deploy(state, { ...healthy({ replicas: 2 }), properties: { 'db.user': 'lab' } }).state
    for (let i = 0; i < 30 && appIn(state).queue.length; i++) {
      assert.equal(appStatus(appIn(state)), 'Running')
      state = advance(state, 500)
    }
    const app = appIn(state)
    assert.equal(deploymentStatus(app), 'Update failed')
    assert.equal(app.applied, good)
    assert.deepEqual(replicaStatuses(state), ['Started', 'Started'])
    assert.equal(app.history[0].status, 'Update failed')
    assert.equal(app.config.properties['db.host'], 'db.lab')
  },
  'Runtime: recreate has downtime, and a failed recreate rolls back to the last good configuration'() {
    const recreate = { model: 'Recreate' }
    let state = shipped(newState(), healthy(recreate))
    let outage = false
    state = deploy(state, healthy({ ...recreate, runtime: '4.10' })).state
    while (appIn(state).queue.length) {
      outage ||= appStatus(appIn(state)) === 'Not running'
      state = advance(state, 500)
    }
    assert.ok(outage)
    assert.equal(appStatus(appIn(state)), 'Running')
    const good = appIn(state).applied
    state = shipped(state, { ...healthy(recreate), properties: {} })
    assert.equal(deploymentStatus(appIn(state)), 'Update failed')
    assert.equal(appIn(state).applied, good)
    assert.deepEqual(replicaStatuses(state), ['Started'])
  },
  'Runtime: roll back deploys an earlier successful configuration, and refuses a failed one'() {
    let state = shipped(shipped(newState(), healthy({ runtime: '4.9' })), healthy({ runtime: '4.10' }))
    const [latest, earlier] = appIn(state).history
    assert.equal(appIn(state).config.runtime, '4.10')
    const result = rollback(state, 'orders-api', earlier.id)
    assert.deepEqual(result.errors, [])
    state = settle(result.state)
    assert.equal(appIn(state).config.runtime, '4.9')
    assert.equal(appIn(state).history.length, 3)
    assert.notEqual(appIn(state).applied, latest.id)
    const failed = shipped(newState(), newConfig())
    assert.equal(rollback(failed, 'orders-api', appIn(failed).history[0].id).errors.length, 1)
  },
  'Runtime: history keeps the last 10 configurations, and a stopped app starts again'() {
    let state = newState()
    for (let i = 0; i < 12; i++) state = shipped(state, healthy())
    assert.equal(appIn(state).history.length, 10)
    state = settle(stop(state, 'orders-api'))
    assert.equal(appStatus(appIn(state)), 'Not running')
    assert.equal(deploymentStatus(appIn(state)), 'Stopped')
    state = settle(start(state, 'orders-api'))
    assert.equal(appStatus(appIn(state)), 'Running')
    assert.equal(appIn(state).history.length, 10)
  },
  'Runtime: protected values stay out of the logs and survive a masked redeploy'() {
    const state = shipped(newState(), healthy())
    assert.ok(!JSON.stringify(appIn(state).logs).includes('secret-value'))
    assert.deepEqual(maskProtected({ a: 'x' }), { a: MASK })
    assert.deepEqual(keepProtected({ a: MASK, b: 'new' }, { a: 'old' }), { a: 'old', b: 'new' })
    assert.deepEqual(parseProperties('a=1\n\nb = x=y\nnot a pair'), { a: '1', b: 'x=y' })
  },
  'Runtime: a change during a deployment is refused, actions leave the given state untouched'() {
    const state = deploy(newState(), healthy()).state
    const copy = structuredClone(state)
    assert.equal(deploy(state, healthy()).errors.length, 1)
    assert.equal(stop(state, 'orders-api'), state)
    advance(state, 5000)
    assert.deepEqual(state, copy)
  },
  'Guided labs: there are at least 6, with unique ids and a full brief'() {
    assert.ok(GUIDED_LABS.length >= 6)
    assert.equal(new Set(GUIDED_LABS.map((l) => l.id)).size, GUIDED_LABS.length)
    for (const lab of GUIDED_LABS) {
      for (const key of ['title', 'scenario', 'goal', 'solution', 'why', 'docs']) assert.ok(lab[key], `${lab.id} ${key}`)
      assert.ok(lab.hints.length > 0, lab.id)
    }
  },
  'Guided labs: every starting setup fails its check and its solution passes'() {
    for (const lab of GUIDED_LABS) {
      const before = runCheck(lab, lab.start())
      assert.equal(before.passed, false, `${lab.id} should fail at the start`)
      const after = runCheck(lab, lab.solve(lab.start()))
      assert.equal(after.passed, true, `${lab.id} solution: ${after.items.filter((i) => !i.ok).map((i) => `${i.label} saw ${i.seen}`).join('; ')}`)
    }
  },
  'Guided labs: deleting every policy does not pass any lab'() {
    for (const lab of GUIDED_LABS) assert.equal(runCheck(lab, { ...lab.solve(lab.start()), policies: [] }).passed, false, lab.id)
  },
  'Guided labs: tempting wrong answers do not pass'() {
    const byId = (id) => GUIDED_LABS.find((l) => l.id === id)
    const spoof = byId('spoofed-header')
    const late = spoof.solve(spoof.start())
    assert.equal(runCheck(spoof, { ...late, policies: [...late.policies].reverse() }).passed, false, 'removal after injection')
    const sla = byId('sla-approval')
    const everyone = { ...sla.start(), apps: sla.start().apps.map((a) => ({ ...a, contract: 'approved' })) }
    assert.equal(runCheck(sla, everyone).passed, false, 'approving the revoked app')
    const gold = sla.solve(sla.start())
    assert.equal(runCheck(sla, { ...gold, apps: gold.apps.map((a) => ({ ...a, tier: 'Gold' })) }).passed, false, 'moving the partner to Gold')
    const spike = byId('smooth-a-burst')
    const raised = spike.start()
    raised.policies[0].settings.requests = 4
    assert.equal(runCheck(spike, raised).passed, false, 'raising the quota')
    const lb = byId('allowlist-load-balancer')
    const half = lb.start()
    half.policies[0].settings.list = '198.51.100.0/24'
    assert.equal(runCheck(lb, half).passed, false, 'list changed but expression not')
  },
}

let failed = 0
for (const [name, test] of Object.entries(tests)) {
  try {
    test()
    console.log(`PASS  ${name}`)
  } catch (error) {
    failed++
    console.log(`FAIL  ${name}\n      ${error.message.split('\n').slice(0, 6).join('\n      ')}`)
  }
}
console.log(failed ? `\n${failed} failed.` : `\nAll ${Object.keys(tests).length} lab checks pass.`)
process.exit(failed ? 1 : 0)

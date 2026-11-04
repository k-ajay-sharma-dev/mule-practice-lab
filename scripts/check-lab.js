// Checks the Platform Lab engine against the examples and status codes on the Mule Gateway policy pages.
import assert from 'node:assert/strict'
import { ipMatches, jsonViolation, newRuntime, send } from '../src/lab/engine.js'
import { defaultSettings } from '../src/lab/policies.js'

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

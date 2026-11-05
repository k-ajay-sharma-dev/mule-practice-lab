// Checks the Platform Lab engine against the examples and status codes on the Mule Gateway policy pages.
import assert from 'node:assert/strict'
import { conditionsMatch, effectivePolicies, ipMatches, jsonViolation, ldapFind, newRuntime, nodeNotes, quotaView, send, XML_MALFORMED, xmlViolation } from '../src/lab/engine.js'
import { GUIDED_LABS, runCheck } from '../src/lab/labs.js'
import { defaultSettings, POLICIES } from '../src/lab/policies.js'
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
  PACKAGES,
  parseProperties,
  remove,
  REPLICA_SIZES,
  rollback,
  rollingNeed,
  RUNTIME_VERSIONS_BASIS,
  settle,
  start,
  stop,
  usedVCores,
  validate,
} from '../src/lab/runtime.js'

const editType = (config, type, patch) => ({ ...config, policies: config.policies.map((p) => (p.type === type ? { ...p, settings: { ...p.settings, ...patch } } : p)) })
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
// spreads `count` requests over the nodes by round robin, all at time 0
function burst(config, count, extra = {}) {
  let runtime = newRuntime()
  const results = Array.from({ length: count }, () => {
    const r = send(config, runtime, request(extra), 0)
    runtime = r.runtime
    return r
  })
  return { results, runtime }
}
const accepted = (results) => results.filter((r) => r.status === 200).length
const header = (result, name) => result.responseHeaders.find(([k]) => k === name)?.[1]
const CORS_GROUP = { publicResource: 'No', origins: 'https://portal.example.com', methods: 'GET, POST', headers: 'client_id' }
const ORIGIN = [['Origin', 'https://portal.example.com']]
const emptied = (lab, config) => (lab.kind === 'runtime' ? { ...config, apps: [] } : { ...config, policies: [], automated: [], apps: [], tiers: [] })

const tests = {
  'Client ID Enforcement: 401 for unknown, missing and wrong secret, 200 for valid'() {
    const p = [policy('client-id')]
    assert.equal(run(p, [0])[0].status, 200)
    assert.equal(run(p, [0], { clientId: 'nope' })[0].status, 401)
    assert.equal(run(p, [0], { clientId: '' })[0].status, 401)
    assert.equal(run(p, [0], { clientSecret: 'wrong' })[0].status, 401)
    assert.equal(run([policy('client-id', { secret: 'Not checked' })], [0], { clientSecret: 'wrong' })[0].status, 200)
  },
  'Client ID Enforcement: a contract that is not approved gets the documented 401'() {
    const config = { ...base, apps: [{ ...app, contract: 'pending' }] }
    const [r] = run([policy('client-id')], [0], {}, config)
    assert.equal(r.status, 401)
    assert.equal(r.trace[0].basis, 'docs')
    assert.equal(r.trace[0].assumption, undefined)
  },
  'Client ID Enforcement: a rejection carries the WWW-Authenticate header of its credentials mode'() {
    assert.equal(header(run([policy('client-id')], [0], { clientId: 'nope' })[0], 'WWW-Authenticate'), 'Client-ID-Enforcement')
    const basic = policy('client-id', { origin: 'HTTP Basic Authentication Header' })
    assert.equal(header(run([basic], [0], { basicUser: 'nope' })[0], 'WWW-Authenticate'), 'Basic realm="mule-realm"')
    assert.equal(header(run([policy('client-id')], [0])[0], 'WWW-Authenticate'), undefined)
  },
  'Rate-Limiting SLA: a client without a contract is rejected, and only the 401 is the lab reading'() {
    const config = { ...base, apps: [{ ...app, contract: 'revoked' }] }
    const [r] = run([policy('rate-limit-sla')], [0], {}, config)
    assert.equal(r.status, 401)
    assert.equal(r.trace[0].basis, 'docs')
    assert.ok(r.trace[0].assumption)
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
    assert.equal(results[3].latency, 499, 'a rejected request was held for its delay attempts first')
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
  'IP Allowlist: leading octets state a range, as on the page'() {
    assert.ok(ipMatches('192.168.0.0', '192.168'))
    assert.ok(ipMatches('192.168.255.255', '192.168'))
    assert.ok(!ipMatches('192.169.0.1', '192.168'))
    assert.ok(!ipMatches('', '192.168'))
    assert.ok(ipMatches('192.168.3.3', '192.168.3.1/30'))
    assert.ok(!ipMatches('192.168.3.4', '192.168.3.1/30'))
  },
  'Basic Authentication: Simple returns 401 for wrong credentials'() {
    const p = [policy('basic-auth')]
    assert.equal(run(p, [0], { basicUser: 'lab-user', basicPassword: 'lab-password' })[0].status, 200)
    const [bad] = run(p, [0], { basicUser: 'lab-user', basicPassword: 'x' })
    assert.equal(bad.status, 401)
    assert.ok(header(bad, 'WWW-Authenticate'), 'the page says the header is returned')
    assert.ok(bad.trace[0].assumption, 'its value is not on the page')
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
  'Header Injection: the four restricted headers are overwritten, not doubled'() {
    const sent = { headers: [['Content-Type', 'text/plain']] }
    const [inbound] = run([policy('header-inject', { inbound: 'content-type: application/json' })], [0], sent)
    assert.deepEqual(inbound.backendHeaders, [['content-type', 'application/json']])
    const [outbound] = run([policy('cors'), policy('header-inject', { inbound: '', outbound: 'Access-Control-Allow-Origin: https://fixed.example.com' })], [0], { headers: ORIGIN })
    assert.deepEqual(outbound.responseHeaders.filter(([k]) => k.toLowerCase() === 'access-control-allow-origin').map(([, v]) => v), ['https://fixed.example.com'])
  },
  'Header Removal: the headers the page lists may not be removed'() {
    const sent = { headers: [['Host', 'a'], ['User-Agent', 'b'], ['Cache-Control', 'c'], ['Date', 'd']] }
    const [r] = run([policy('header-remove', { inbound: '.*' })], [0], sent)
    assert.deepEqual(r.backendHeaders, [['Host', 'a'], ['User-Agent', 'b'], ['Date', 'd']])
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
  'CORS: it always runs first, whatever the saved order, and has no reorder position'() {
    const { chain } = effectivePolicies({ policies: [policy('client-id'), policy('cors')], automated: [policy('jwt', {}, 'auto')] })
    assert.deepEqual(chain.map((p) => p.type), ['cors', 'jwt', 'client-id'])
    const automatedCors = effectivePolicies({ policies: [policy('client-id')], automated: [policy('jwt', {}, 'a'), policy('cors', {}, 'b')] })
    assert.deepEqual(automatedCors.chain.map((p) => p.type), ['cors', 'jwt', 'client-id'])
    assert.equal(POLICIES.find((p) => p.type === 'cors').pinned, true)
  },
  'CORS: every OPTIONS request is answered by the policy, reaches nothing else, and uses no quota'() {
    const config = { ...base, policies: [policy('rate-limit', { requests: 1 }), policy('client-id'), policy('cors')] }
    const { results } = burst(config, 3, { method: 'OPTIONS', clientId: '', headers: ORIGIN })
    assert.deepEqual(statuses(results), [200, 200, 200])
    assert.ok(results.every((r) => !r.reachedBackend && r.trace.length === 1))
    assert.equal(results[0].statusBasis, 'assumed')
    assert.ok(results[0].trace[0].assumption, 'skipping later policies is the lab reading')
    assert.equal(run(config.policies, [0])[0].status, 200)
    const [noOrigin] = run([policy('cors')], [0], { method: 'OPTIONS' })
    assert.match(noOrigin.trace[0].detail, /no Origin header/)
  },
  'CORS: a browser does not hold POST to Access-Control-Allow-Methods, but does hold PUT'() {
    const asking = (method) => [...ORIGIN, ['Access-Control-Request-Method', method], ['Access-Control-Request-Headers', 'client_id']]
    const p = [policy('cors', { ...CORS_GROUP, methods: 'GET' })]
    assert.equal(run(p, [0], { method: 'OPTIONS', headers: asking('POST') })[0].browser, 'allowed')
    assert.equal(run(p, [0], { method: 'OPTIONS', headers: asking('PUT') })[0].browser, 'blocked')
  },
  'CORS: a public resource mirrors the preflight, a group returns its own lists'() {
    const asking = [...ORIGIN, ['Access-Control-Request-Method', 'PUT'], ['Access-Control-Request-Headers', 'x-a']]
    const open = run([policy('cors')], [0], { method: 'OPTIONS', headers: asking })[0]
    assert.equal(header(open, 'Access-Control-Allow-Origin'), 'https://portal.example.com')
    assert.equal(header(open, 'Access-Control-Allow-Methods'), 'PUT')
    assert.equal(header(open, 'Access-Control-Allow-Headers'), 'x-a')
    assert.equal(open.browser, 'allowed')
    const group = run([policy('cors', CORS_GROUP)], [0], { method: 'OPTIONS', headers: asking })[0]
    assert.equal(header(group, 'Access-Control-Allow-Methods'), 'GET, POST')
    assert.equal(group.browser, 'blocked')
  },
  'CORS: it never rejects. An unlisted origin gets no headers, and origins must match exactly'() {
    const p = [policy('cors', CORS_GROUP)]
    for (const origin of ['https://other.example.com', 'http://portal.example.com', 'https://portal.example.com:8443']) {
      const [r] = run(p, [0], { headers: [['Origin', origin]] })
      assert.equal(r.status, 200, origin)
      assert.equal(header(r, 'Access-Control-Allow-Origin'), undefined, origin)
      assert.equal(r.browser, 'blocked', origin)
    }
    const star = run([policy('cors', { ...CORS_GROUP, origins: '*' })], [0], { headers: [['Origin', 'https://any.example.com']] })[0]
    assert.equal(star.browser, 'allowed')
  },
  'CORS: no Origin header means no CORS headers, and support credentials adds its header'() {
    const [plain] = run([policy('cors')], [0])
    assert.deepEqual(plain.responseHeaders, [])
    assert.equal(plain.browser, null)
    const [withCookies] = run([policy('cors', { credentials: 'Yes' })], [0], { headers: ORIGIN })
    assert.equal(header(withCookies, 'Access-Control-Allow-Credentials'), 'true')
  },
  'CORS: a later rejection keeps the CORS headers, so the page can read the error'() {
    const [r] = run([policy('client-id'), policy('cors')], [0], { clientId: 'nope', headers: ORIGIN })
    assert.equal(r.status, 401)
    assert.equal(r.browser, 'allowed')
  },
  'Automated: they run before API level policies, which cannot be placed above them'() {
    const config = { ...base, policies: [policy('client-id')], automated: [policy('rate-limit', { requests: 1 }, 'auto-limit')] }
    const { results } = burst(config, 2, { clientId: 'nope' })
    assert.deepEqual(statuses(results), [401, 429])
    assert.equal(results[1].trace[0].level, 'automated')
    assert.equal(results[1].trace.length, 1)
  },
  'Automated: an API level policy of the same type stays disabled, and returns when the automated one goes'() {
    const local = policy('ip-allow', { list: '198.51.100.0/24' })
    const config = { ...base, policies: [local], automated: [policy('ip-allow', { list: '10.0.0.0/8' }, 'auto-ip')] }
    assert.deepEqual(effectivePolicies(config).overridden, [local])
    const [r] = burst(config, 1, { ip: '198.51.100.7' }).results
    assert.equal(r.status, 403)
    assert.equal(r.trace[0].outcome, 'skip')
    assert.equal(burst({ ...config, automated: [] }, 1, { ip: '198.51.100.7' }).results[0].status, 200)
  },
  'A setup saved before these features still runs: no automated list, no nodes, no conditions, no limits array'() {
    const saved = { ...base, policies: [{ id: 'old', type: 'rate-limit', settings: { requests: 1, periodMs: 1000, identifier: '(not configured)', expose: 'No' } }] }
    assert.deepEqual(statuses(burst(saved, 2).results), [200, 429])
    assert.deepEqual(nodeNotes(saved), [])
  },
  'Conditions: a policy runs only for matching methods and resources, and others skip it without counting'() {
    const limited = { ...policy('rate-limit', { requests: 1 }), conditions: [{ methods: ['POST'], resource: '/orders.*' }] }
    assert.ok(conditionsMatch(limited, { method: 'POST', path: '/orders/7' }))
    assert.ok(!conditionsMatch(limited, { method: 'GET', path: '/orders/7' }))
    assert.ok(!conditionsMatch(limited, { method: 'POST', path: '/users' }))
    assert.ok(!conditionsMatch(limited, { method: 'POST', path: '/v2/orders' }), 'the regular expression covers the whole path')
    let runtime = newRuntime()
    const go = (extra) => {
      const r = send({ ...base, policies: [limited] }, runtime, request(extra), 0)
      runtime = r.runtime
      return r
    }
    assert.equal(go({ method: 'GET', path: '/orders' }).trace[0].outcome, 'skip')
    assert.deepEqual([{ method: 'POST', path: '/orders' }, { method: 'POST', path: '/orders' }].map((x) => go(x).status), [200, 429])
    assert.equal(go({ method: 'GET', path: '/orders' }).status, 200)
  },
  'Conditions: several conditions match on any of them, and CORS ignores conditions'() {
    const two = { ...policy('client-id'), conditions: [{ methods: ['POST'], resource: '/a' }, { methods: ['GET'], resource: '/b' }] }
    assert.ok(conditionsMatch(two, { method: 'GET', path: '/b' }))
    assert.ok(!conditionsMatch(two, { method: 'GET', path: '/a' }))
    const cors = { ...policy('cors'), conditions: [{ methods: ['POST'], resource: '/a' }] }
    assert.ok(conditionsMatch(cors, { method: 'GET', path: '/b' }))
    assert.ok(!conditionsMatch({ ...two, conditions: [{ methods: [], resource: '(' }] }, { method: 'GET', path: '/a' }), 'a broken expression matches nothing')
  },
  'Rate Limiting: with several limits every one must have quota, and each keeps its own window'() {
    const p = [policy('rate-limit', { requests: 2, periodMs: 1000, extraLimits: [{ requests: 3, periodMs: 10000 }] })]
    assert.deepEqual(statuses(run(p, [0, 100, 200, 1000, 1100, 9999, 10000])), [200, 200, 429, 200, 429, 429, 200])
  },
  'Rate Limiting: the 429 with several limits is documented, not counting it on the others is flagged'() {
    const p = [policy('rate-limit', { requests: 1, periodMs: 1000, extraLimits: [{ requests: 2, periodMs: 10000 }] })]
    const results = run(p, [0, 100, 200, 1000])
    assert.deepEqual(statuses(results), [200, 429, 429, 200])
    assert.equal(results[1].trace[0].basis, 'docs')
    assert.match(results[1].trace[0].assumption, /do not count/)
  },
  'Rate Limiting: Distributed is on by default, as the Mule 4 overview states'() {
    assert.equal(defaultSettings('rate-limit').distributed, 'Yes')
  },
  'Rate Limiting: exposed headers report the limit closest to running out'() {
    const p = [policy('rate-limit', { requests: 5, periodMs: 1000, extraLimits: [{ requests: 2, periodMs: 10000 }], expose: 'Yes' })]
    const [first] = run(p, [0])
    assert.equal(header(first, 'X-Ratelimit-Limit'), '2')
    assert.equal(header(first, 'X-Ratelimit-Remaining'), '1')
    assert.ok(first.trace[0].assumption, 'the page does not say which limit the headers report')
  },
  'Basic Authentication: LDAP: one level, subtree, the filter, and the WWW-Authenticate header'() {
    const oneLevel = defaultSettings('basic-ldap')
    assert.equal(ldapFind(oneLevel, 'jane')?.uid, 'jane')
    assert.equal(ldapFind(oneLevel, 'omar'), null)
    assert.equal(ldapFind({ ...oneLevel, subtree: 'Yes' }, 'omar')?.uid, 'omar')
    assert.equal(ldapFind({ ...oneLevel, filter: '(sAMAccountName={0})' }, 'jane'), null)
    const p = [policy('basic-ldap')]
    assert.equal(run(p, [0], { basicUser: 'jane', basicPassword: 'jane-password' })[0].status, 200)
    const [bad] = run(p, [0], { basicUser: 'jane', basicPassword: 'x' })
    assert.equal(bad.status, 401)
    assert.equal(header(bad, 'WWW-Authenticate'), 'Basic realm="mule-realm"')
    assert.equal(run(p, [0])[0].status, 401)
  },
  'OpenID Connect: status codes from the page, with the unstated ones flagged as assumed'() {
    const p = [policy('oidc')]
    const go = (extra) => run(p, [0], { token: 'valid', ...extra })[0]
    assert.equal(go({}).status, 200)
    assert.equal(go({ token: 'expired' }).status, 400)
    assert.equal(go({ authServer: 'down' }).status, 401)
    assert.equal(go({ authServer: 'bad' }).status, 500)
    assert.equal(go({ clientId: 'nope' }).status, 403)
    assert.equal(go({ clientId: 'nope' }).trace[0].basis, 'docs')
    assert.equal(go({ token: 'none' }).status, 401)
    assert.equal(go({ token: 'none' }).trace[0].basis, 'assumed')
    assert.equal(run([policy('oidc', { skipClient: 'Yes' })], [0], { token: 'valid', clientId: 'nope' })[0].status, 200)
  },
  'OpenID Connect: scopes, criteria, and no validation when no scopes are defined'() {
    const go = (settings, scopes) => run([policy('oidc', settings)], [0], { token: 'valid', scopes })[0]
    assert.equal(go({}, '').status, 200)
    assert.equal(go({ scopes: 'READ WRITE' }, 'READ WRITE').status, 200)
    assert.equal(go({ scopes: 'READ WRITE' }, 'READ').status, 403)
    assert.equal(go({ scopes: 'READ WRITE' }, 'READ').trace[0].basis, 'assumed')
    assert.equal(go({ scopes: 'READ WRITE', criteria: 'Contains any scope' }, 'READ').status, 200)
    assert.equal(go({ scopes: 'READ WRITE', criteria: 'Contains any scope' }, 'ADMIN').status, 403)
  },
  'OpenID Connect: Expose Headers sends X-AGW- headers, and SLA can use the token principal'() {
    const [exposed] = run([policy('oidc', { expose: 'Yes' })], [0], { token: 'valid' })
    assert.ok(exposed.backendHeaders.some(([k]) => k === 'X-AGW-token_type'))
    const sla = policy('rate-limit-sla', { clientIdExpression: '#[authentication.principal]', secret: 'Not checked' })
    assert.equal(run([policy('oidc'), sla], [0], { token: 'valid', clientSecret: '' })[0].status, 200)
    assert.equal(run([sla], [0])[0].status, 401)
  },
  'XML Threat Protection: each limit, and -1 means no limit'() {
    const xml = '<a xmlns:x="u" one="12345" two="2"><!-- 12345 --><b>12345</b><c/><d><e/></d></a>'
    const limits = { depth: 3, attributes: 2, children: 3, textLength: 5, attributeLength: 5, commentLength: 7 }
    assert.equal(xmlViolation(xml, limits), null)
    assert.equal(xmlViolation(xml, { ...limits, depth: 2 }), 'Maximum Node Depth')
    assert.equal(xmlViolation(xml, { ...limits, attributes: 1 }), 'Maximum Attribute Count Per Element')
    assert.equal(xmlViolation(xml, { ...limits, children: 2 }), 'Maximum Child Count')
    assert.equal(xmlViolation(xml, { ...limits, textLength: 4 }), 'Maximum Text Length')
    assert.equal(xmlViolation(xml, { ...limits, attributeLength: 4 }), 'Maximum Attribute Length')
    assert.equal(xmlViolation(xml, { ...limits, commentLength: 6 }), 'Maximum Comment Length')
    assert.equal(xmlViolation(xml, defaultSettings('xml-threat')), null)
    assert.equal(xmlViolation('<a><b></a>', defaultSettings('xml-threat')), XML_MALFORMED)
    assert.equal(xmlViolation('<?xml version="1.0"?><a/>', defaultSettings('xml-threat')), null)
  },
  'XML Threat Protection: 400 when over a limit, and a non XML body is not checked'() {
    const p = [policy('xml-threat', { depth: 1 })]
    assert.equal(run(p, [0], { body: '<a><b/></a>' })[0].status, 400)
    assert.equal(run(p, [0], { body: '<a/>' })[0].status, 200)
    const [json] = run(p, [0], { body: '{"a":1}' })
    assert.equal(json.status, 200)
    assert.equal(json.trace[0].basis, 'assumed')
    assert.ok(run(p, [0], { body: '<a/>' })[0].trace[0].assumption, 'a pass at a set limit depends on how the lab counts')
    assert.equal(run([policy('xml-threat')], [0], { body: '<a/>' })[0].trace[0].assumption, undefined)
  },
  'Message Logging: never stops a request, and only logs when the request reaches it'() {
    const log = policy('message-log', { message: '#[attributes.requestPath]', category: 'audit' })
    const [before] = run([log, policy('client-id')], [0], { clientId: 'nope', path: '/orders' })
    assert.equal(before.status, 401)
    assert.deepEqual(before.appLog.map((l) => l.text), ['INFO audit: /orders'])
    assert.deepEqual(run([policy('client-id'), log], [0], { clientId: 'nope' })[0].appLog, [])
  },
  'Message Logging: conditional, default category, and after the API call'() {
    const onlyPost = policy('message-log', { conditional: "#[attributes.method == 'POST']" }, 'p1')
    assert.deepEqual(run([onlyPost], [0], { method: 'GET' })[0].appLog, [])
    assert.ok(run([onlyPost], [0], { method: 'POST' })[0].appLog[0].text.startsWith('INFO org.mule.runtime.logging.policy-p1: '))
    const [both] = run([policy('message-log', { after: 'Yes' })], [0])
    assert.deepEqual(both.appLog.map((l) => l.phase), ['Before calling API', 'After calling API'])
    assert.equal(run([onlyPost], [0], { method: 'GET' })[0].trace[0].basis, 'docs')
    assert.equal(run([policy('message-log', { level: 'DEBUG' })], [0])[0].trace[0].basis, 'assumed')
  },
  'Distributed: 3 separate nodes accept the quota once each, even with Distributed ticked (inc-101)'() {
    const config = { ...base, policies: [policy('rate-limit', { requests: 3, distributed: 'Yes' })], topology: { nodes: 3, mode: 'separate' } }
    const { results, runtime } = burst(config, 12)
    assert.equal(accepted(results), 9)
    assert.deepEqual(results.slice(0, 3).map((r) => r.node), [1, 2, 3])
    const [view] = quotaView(config, runtime, 0)
    assert.equal(view.shared, false)
    assert.deepEqual(view.rows[0].used, [3, 3, 3])
    assert.equal(view.rows[0].ceiling, 9)
    assert.ok(nodeNotes(config)[0].text.includes('no effect'))
  },
  'Distributed: a Mule HA cluster with Distributed on accepts the quota once in total'() {
    const config = { ...base, policies: [policy('rate-limit', { requests: 3, distributed: 'Yes', periodMs: 120000 })], topology: { nodes: 2, mode: 'cluster' } }
    const { results, runtime } = burst(config, 6)
    assert.equal(accepted(results), 3)
    const [view] = quotaView(config, runtime, 0)
    assert.equal(view.shared, true)
    assert.deepEqual(view.rows[0].used, [3])
    assert.equal(view.rows[0].ceiling, 3)
    assert.deepEqual(nodeNotes(config), [])
  },
  'Distributed: the docs example, a 2 node cluster with it turned off accepts six'() {
    const config = { ...base, policies: [policy('rate-limit', { requests: 3, distributed: 'No' })], topology: { nodes: 2, mode: 'cluster' } }
    assert.equal(accepted(burst(config, 8).results), 6)
    assert.ok(nodeNotes(config)[0].text.includes('once per node'))
  },
  'Distributed: Rate Limiting SLA counts per client on each node, or once across a cluster'() {
    const sla = policy('rate-limit-sla', { distributed: 'Yes' })
    const separate = { ...base, policies: [sla], topology: { nodes: 3, mode: 'separate' } }
    assert.equal(accepted(burst(separate, 9).results), 6)
    assert.equal(accepted(burst({ ...separate, topology: { nodes: 3, mode: 'cluster' } }, 9).results), 2)
  },
  'Distributed: exposed headers differ by node on separate nodes, and a short window in a cluster gets the advice'() {
    const p = policy('rate-limit', { requests: 3, expose: 'Yes', distributed: 'Yes' })
    const { results } = burst({ ...base, policies: [p], topology: { nodes: 2, mode: 'separate' } }, 3)
    assert.deepEqual(results.map((r) => header(r, 'X-Ratelimit-Remaining')), ['2', '2', '1'])
    const notes = nodeNotes({ ...base, policies: [p], topology: { nodes: 2, mode: 'cluster' } })
    assert.ok(notes[0].text.includes('longer than one minute'))
  },
  'Distributed: Spike Control always works per node, even in a cluster'() {
    const config = { ...base, policies: [policy('spike', { requests: 1, attempts: 0 })], topology: { nodes: 2, mode: 'cluster' } }
    assert.equal(accepted(burst(config, 4).results), 2)
    assert.ok(nodeNotes(config)[0].text.includes('cannot be clustered'))
  },
  'Distributed: a request can be pinned to one node, and one node behaves as before'() {
    const config = { ...base, policies: [policy('rate-limit', { requests: 1 })], topology: { nodes: 2, mode: 'separate' } }
    assert.equal(accepted(burst(config, 3, { node: 2 }).results), 1)
    assert.equal(accepted(burst({ ...config, topology: { nodes: 1, mode: 'separate' } }, 3).results), 1)
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
  'Runtime: a rolling update needs one additional replica, and Recreate needs none'() {
    const config = healthy({ replicas: 2, vCores: 1, target: 'private', runtime: '4.9' })
    assert.equal(rollingNeed(newState(), config), null)
    const state = shipped(newState(), config)
    assert.deepEqual(rollingNeed(state, config), { peak: 3, steady: 2, extra: 1 })
    assert.equal(rollingNeed(state, { ...config, model: 'Recreate' }), null)
    assert.deepEqual(rollingNeed(state, { ...config, vCores: 0.5 }), { peak: 2.5, steady: 1, extra: 1.5 })
  },
  'Runtime: the replicas really peak at the figure rollingNeed gives'() {
    const config = healthy({ replicas: 3, vCores: 0.5 })
    let state = shipped(newState(), config)
    const { peak } = rollingNeed(state, config)
    state = deploy(state, { ...config, runtime: '4.10' }).state
    let highest = 0
    for (let i = 0; i < 60 && appIn(state).queue.length; i++) {
      highest = Math.max(highest, usedVCores(state, 'shared'))
      state = advance(state, 500)
    }
    assert.equal(highest, peak)
  },
  'Runtime: without room for the extra replica the update waits, the old version serves, and freeing vCores finishes it'() {
    const config = healthy({ replicas: 2, vCores: 1, target: 'private', runtime: '4.9' })
    const stuck = shipped(shipped(newState(), config), { ...config, runtime: '4.10' })
    const app = appIn(stuck)
    assert.equal(deploymentStatus(app), 'Pending')
    assert.equal(appStatus(app), 'Running')
    assert.equal(app.outcome.kind, 'capacity')
    assert.equal(app.outcome.basis, 'docs')
    assert.ok(app.outcome.assumption)
    const recreated = shipped(stuck, { ...config, runtime: '4.10', model: 'Recreate' })
    assert.equal(deploymentStatus(appIn(recreated)), 'Applied')
    assert.equal(appIn(recreated).config.runtime, '4.10')
    assert.deepEqual(appIn(recreated).history.map((h) => h.status), ['Applied', 'Superseded', 'Applied'])
  },
  'Runtime: replica sizes show the heap of the architecture table'() {
    const table = { 0.1: '480 MB', 0.2: '1 GB', 0.5: '1.3 GB', 1: '2 GB', 1.5: '3 GB', 2: '4 GB', 2.5: '4.75 GB', 3: '5.5 GB', 3.5: '6.5 GB', 4: '7.5 GB' }
    assert.deepEqual(Object.fromEntries(REPLICA_SIZES.map((s) => [s.vCores, s.heap])), table)
    const failed = shipped(newState(), healthy({ name: 'inventory', packageId: 'inventory-sync', properties: { 'sftp.host': 'a' } }))
    assert.match(appIn(failed, 'inventory').outcome.cause, /has 1\.3 GB/)
    assert.ok(appIn(failed, 'inventory').outcome.assumption, 'what the sample needs is a lab value')
  },
  'Runtime: sample packages, the version list and all log wording are tagged as assumed'() {
    assert.ok(PACKAGES.every((p) => p.basis === 'assumed'))
    assert.equal(RUNTIME_VERSIONS_BASIS, 'assumed')
    const failed = shipped(shipped(newState(), healthy()), { ...healthy(), properties: {} })
    const waiting = shipped(shipped(newState(), healthy({ vCores: 2, target: 'private' })), healthy({ vCores: 1, name: 'other', target: 'private' }))
    const logs = [...appIn(failed).logs, ...appIn(waiting, 'other').logs]
    assert.ok(logs.length > 3)
    assert.ok(logs.every((l) => l.basis === 'assumed'))
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
  'Runtime: roll back moves the configuration to the top with a new date and its original identifier'() {
    let state = shipped(shipped(newState(), healthy({ runtime: '4.9' })), healthy({ runtime: '4.10' }))
    const [latest, earlier] = appIn(state).history
    assert.equal(appIn(state).config.runtime, '4.10')
    const result = rollback(state, 'orders-api', earlier.id)
    assert.deepEqual(result.errors, [])
    state = settle(result.state)
    assert.equal(appIn(state).config.runtime, '4.9')
    assert.deepEqual(appIn(state).history.map((h) => h.id), [earlier.id, latest.id])
    assert.equal(appIn(state).applied, earlier.id)
    assert.equal(appIn(state).history[0].status, 'Applied')
    assert.ok(appIn(state).history[0].at > earlier.at, 'it shows the new deployment date')
    assert.ok(appIn(state).replicas.every((r) => r.configId === earlier.id))
    assert.equal(state.configSerial, 2, 'no new configuration was created')
    const failed = shipped(newState(), newConfig())
    assert.equal(rollback(failed, 'orders-api', appIn(failed).history[0].id).errors.length, 1)
  },
  'Runtime: a rollback that fails leaves the running configuration in place'() {
    let state = shipped(shipped(newState(), healthy({ packageId: 'hello-api', runtime: '4.9' })), healthy({ packageId: 'hello-api', runtime: '4.10' }))
    const [latest, earlier] = appIn(state).history
    const broken = structuredClone(state)
    appIn(broken).history.find((h) => h.id === earlier.id).config.packageId = 'orders-api'
    appIn(broken).history.find((h) => h.id === earlier.id).config.properties = {}
    state = settle(rollback(broken, 'orders-api', earlier.id).state)
    assert.equal(deploymentStatus(appIn(state)), 'Update failed')
    assert.equal(appIn(state).applied, latest.id)
    assert.equal(appIn(state).current, latest.id)
    assert.equal(appStatus(appIn(state)), 'Running')
  },
  'Runtime: a rollback waits its turn while a change is in progress'() {
    const settled = shipped(shipped(newState(), healthy({ runtime: '4.9' })), healthy({ runtime: '4.10' }))
    const earlier = appIn(settled).history[1]
    const busy = deploy(settled, healthy({ runtime: '4.10' })).state
    assert.equal(rollback(busy, 'orders-api', earlier.id).errors.length, 1)
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
  'Guided labs: there are at least 16, at least 4 on Runtime Manager, with unique ids and a full brief'() {
    assert.ok(GUIDED_LABS.length >= 16)
    assert.ok(GUIDED_LABS.filter((l) => l.kind === 'runtime').length >= 4)
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
  'Guided labs: deleting everything does not pass any lab, from the start or from the solution'() {
    for (const lab of GUIDED_LABS) {
      assert.equal(runCheck(lab, emptied(lab, lab.start())).passed, false, `${lab.id} emptied start`)
      assert.equal(runCheck(lab, emptied(lab, lab.solve(lab.start()))).passed, false, `${lab.id} emptied solution`)
    }
  },
  'Guided labs: deleting only the policies does not pass any API Manager lab'() {
    for (const lab of GUIDED_LABS.filter((l) => l.kind !== 'runtime')) {
      assert.equal(runCheck(lab, { ...lab.solve(lab.start()), policies: [], automated: [] }).passed, false, lab.id)
    }
  },
  'Guided labs: a Runtime Manager check plays a deployment still in progress to its end'() {
    const lab = GUIDED_LABS.find((l) => l.id === 'rm-missing-property')
    const before = lab.start()
    const config = { ...before.apps[0].config, protectedProperties: { 'db.password': 'x' } }
    assert.equal(runCheck(lab, deploy(before, config).state).passed, true)
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
    const cors = byId('cors-preflight')
    const open = cors.solve(cors.start())
    assert.equal(runCheck(cors, editType(open, 'cors', { publicResource: 'Yes' })).passed, false, 'a public resource accepts any origin')
    assert.equal(runCheck(cors, editType(open, 'cors', { headers: 'x-other' })).passed, false, 'client_id not allowed')
    const auto = byId('automated-priority')
    assert.equal(runCheck(auto, { ...auto.start(), automated: [] }).passed, false, 'removing the automated policy')
    const writes = byId('write-only-auth')
    const exact = writes.solve(writes.start())
    exact.policies[0].conditions = [{ methods: ['POST', 'DELETE'], resource: '/orders' }]
    assert.equal(runCheck(writes, exact).passed, false, 'a resource that misses /orders/7')
    const oidc = byId('oidc-scopes')
    const any = oidc.solve(oidc.start())
    assert.equal(runCheck(oidc, editType(any, 'oidc', { criteria: 'Contains any scope' })).passed, false, 'any scope')
    assert.equal(runCheck(oidc, editType(any, 'oidc', { skipClient: 'Yes' })).passed, false, 'contract check skipped')
    const ldap = byId('ldap-subtree')
    assert.equal(runCheck(ldap, editType(ldap.start(), 'basic-ldap', { searchBase: 'ou=partners,ou=people,dc=lab,dc=example' })).passed, false, 'moving the search base')
    const cluster = byId('distributed-cluster')
    const solved = cluster.solve(cluster.start())
    assert.equal(runCheck(cluster, editType(solved, 'rate-limit-sla', { distributed: 'No' })).passed, false, 'cluster with Distributed off')
    assert.equal(runCheck(cluster, { ...solved, topology: { nodes: 1, mode: 'cluster' } }).passed, false, 'dropping to one node')
    const memory = byId('rm-out-of-memory')
    const start = memory.start()
    const redeploy = (extra) => settle(deploy(start, { ...start.apps[0].config, ...extra }).state)
    assert.equal(runCheck(memory, redeploy({ replicas: 3 })).passed, false, 'more replicas')
    assert.equal(runCheck(memory, redeploy({ vCores: 2 })).passed, false, 'over budget')
    const property = byId('rm-missing-property')
    const plain = property.start()
    const inClear = { ...plain.apps[0].config, properties: { ...plain.apps[0].config.properties, 'db.password': 'x' } }
    assert.equal(runCheck(property, settle(deploy(plain, inClear).state)).passed, false, 'password as a plain property')
    const vCores = byId('rm-not-enough-vcores')
    assert.equal(runCheck(vCores, settle(stop(vCores.start(), 'reporting'))).passed, false, 'stopping reporting')
  },
  'Guided labs: the vCores lab has a second valid answer, moving to the shared space'() {
    const lab = GUIDED_LABS.find((l) => l.id === 'rm-not-enough-vcores')
    const state = lab.start()
    const app = state.apps.find((a) => a.name === 'orders-api')
    assert.equal(deploymentStatus(app), 'Pending')
    assert.equal(runCheck(lab, settle(deploy(state, { ...app.config, target: 'shared' }).state)).passed, true)
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

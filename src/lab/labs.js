// Guided labs for the API Manager and Runtime Manager simulators. Each one has a broken starting setup and a goal.
// An API Manager check sends real requests through send(). A Runtime Manager lab has kind: 'runtime', its setup is a
// runtime state, and its check plays every deployment to the end. Either way, any setup that behaves correctly passes.
import { newRuntime, send } from './engine.js'
import { defaultSettings } from './policies.js'
import { appStatus, deploy, deploymentStatus, newConfig, newState, rollback, settle } from './runtime.js'

const FORWARDED = "#[attributes.headers['x-forwarded-for']]"
const CLIENT_ID = "#[attributes.headers['client_id']]"

const applied = (type, settings = {}) => ({ id: `lab-${type}`, type, settings: { ...defaultSettings(type), ...settings } })

const MOBILE = { name: 'Mobile App', clientId: 'lab-mobile-id', clientSecret: 'lab-mobile-secret', tier: 'Gold', contract: 'approved' }
const PARTNER = { name: 'Partner Portal', clientId: 'lab-partner-id', clientSecret: 'lab-partner-secret', tier: 'Silver', contract: 'approved' }
const KIOSK = { name: 'Old Kiosk', clientId: 'lab-kiosk-id', clientSecret: 'lab-kiosk-secret', tier: 'Silver', contract: 'revoked' }
const TIERS = [
  { name: 'Gold', requests: 5, periodMs: 10000, autoApprove: true },
  { name: 'Silver', requests: 2, periodMs: 10000, autoApprove: false },
]

const setup = (policies, apps = [MOBILE, PARTNER], extra = {}) => ({ policies, tiers: structuredClone(TIERS), apps: structuredClone(apps), automated: [], ...extra })

const as = (app, extra = {}) => ({
  method: 'GET',
  ip: '10.1.2.3',
  clientId: app.clientId,
  clientSecret: app.clientSecret,
  basicUser: '',
  basicPassword: '',
  token: 'none',
  scopes: '',
  authServer: 'ok',
  path: '/orders',
  headers: [],
  body: '',
  ...extra,
})
const STRANGER = { clientId: 'unknown-client', clientSecret: 'guess' }
const NOBODY = { clientId: '', clientSecret: '' }

// Sends the requests in order on one runtime. Each request can set `at`, the virtual time it arrives.
function play(config, requests) {
  let runtime = newRuntime()
  return requests.map(({ at = 0, ...request }) => {
    const result = send(config, runtime, request, at)
    runtime = result.runtime
    return result
  })
}

const basisOf = (results) => (results.some((r) => r.statusBasis === 'assumed' || r.trace.some((step) => step.basis === 'assumed' || step.assumption)) ? 'assumed' : 'docs')
const item = (label, ok, results) => ({ label, ok: Boolean(ok), basis: basisOf(results), seen: results.map((r) => r.status).join(', ') || 'no request' })
const fact = (label, ok, seen, basis = 'docs') => ({ label, ok: Boolean(ok), basis, seen })
const times = (count, request) => Array.from({ length: count }, () => request)
const allStatus = (results, status) => results.every((r) => r.status === status)
const backendValues = (result, name) => result.backendHeaders.filter(([k]) => k.toLowerCase() === name).map(([, v]) => v)
const movePolicy = (config, type, index) => {
  const moved = config.policies.find((p) => p.type === type)
  const rest = config.policies.filter((p) => p !== moved)
  rest.splice(index, 0, moved)
  return { ...config, policies: rest }
}
const editPolicy = (config, type, patch) => ({
  ...config,
  policies: config.policies.map((p) => (p.type === type ? { ...p, settings: { ...p.settings, ...patch } } : p)),
})
const editAutomated = (config, type, patch) => ({
  ...config,
  automated: config.automated.map((p) => (p.type === type ? { ...p, settings: { ...p.settings, ...patch } } : p)),
})
const responseValue = (result, name) => result.responseHeaders.find(([k]) => k.toLowerCase() === name)?.[1]

const shipped = (state, config) => settle(deploy(state, config).state)
const appNamed = (state, name) => state.apps.find((a) => a.name === name)
const statusOf = (app) => (app ? `${appStatus(app)}, ${deploymentStatus(app)}` : 'no application')
const healthy = (app) => Boolean(app) && appStatus(app) === 'Running' && deploymentStatus(app) === 'Applied'
const ORDERS = {
  ...newConfig(),
  properties: { 'db.host': 'db.lab', 'db.user': 'lab' },
  protectedProperties: { 'db.password': 'lab-secret' },
}
const INVENTORY = { ...newConfig(), name: 'inventory-sync', packageId: 'inventory-sync', properties: { 'sftp.host': 'sftp.lab' } }
const REPORTING = { ...newConfig(), name: 'reporting', packageId: 'hello-api', target: 'private', vCores: 1.5 }
const CH2 = 'https://docs.mulesoft.com/cloudhub-2/'

export const GUIDED_LABS = [
  {
    id: 'rate-limit-order',
    title: 'Rate limit order',
    scenario:
      'Unknown callers are hammering the API with made-up client IDs. They are rejected, yet the Mobile App still gets 429 right after the flood. Rate Limiting runs first, so rejected callers spend the quota.',
    goal: 'Unknown clients get 401 every time and use none of the quota. The Mobile App still gets its 3 requests per window and a fourth returns 429.',
    hints: ['Policies run from top to bottom, and the first to reject stops the request.', 'A policy that never runs cannot count the request.'],
    solution: 'Move Client ID Enforcement above Rate Limiting.',
    why: 'Authentication first means only known clients reach the counter. The same quota now protects the backend without letting strangers lock out real clients.',
    docs: 'https://docs.mulesoft.com/mule-gateway/policies-included-rate-limiting',
    start: () => setup([applied('rate-limit', { requests: 3, periodMs: 10000 }), applied('client-id')]),
    solve: (config) => movePolicy(config, 'client-id', 0),
    check(config) {
      const results = play(config, [...times(5, as(STRANGER)), ...times(4, as(MOBILE))])
      const flood = results.slice(0, 5)
      const real = results.slice(5)
      return [
        item('Five unknown clients all get 401', allStatus(flood, 401), flood),
        item('The Mobile App gets 200 for its first 3 requests', allStatus(real.slice(0, 3), 200), real.slice(0, 3)),
        item('Its fourth request in the window gets 429', real[3].status === 429, real.slice(3)),
      ]
    },
  },
  {
    id: 'spoofed-header',
    title: 'Spoofed header',
    scenario:
      'The backend trusts x-tenant, and the gateway injects x-tenant: internal. A caller found that sending their own x-tenant still reaches the backend, because Header Injection keeps a value that is already there.',
    goal: 'The backend receives exactly one x-tenant, with the value internal, whatever the caller sends. Client ID Enforcement stays in place.',
    hints: ['Injection adds, it does not replace.', 'Header Removal takes a name or a regular expression, and it must run before the injection.'],
    solution: 'Apply Header Removal with x-tenant in Inbound Header Map, and place it above Header Injection.',
    why: 'Removing first gives the gateway a clean slate. If removal ran after the injection, it would also strip the trusted value.',
    docs: 'https://docs.mulesoft.com/mule-gateway/policies-included-header-removal',
    start: () => setup([applied('client-id'), applied('header-inject', { inbound: 'x-tenant: internal' })]),
    solve: (config) => ({ ...config, policies: [applied('header-remove', { inbound: 'x-tenant' }), ...config.policies] }),
    check(config) {
      const [spoofed, shouting, honest, stranger] = play(config, [
        as(MOBILE, { headers: [['x-tenant', 'admin']] }),
        as(MOBILE, { headers: [['X-Tenant', 'admin']] }),
        as(MOBILE),
        as(STRANGER),
      ])
      const clean = (r) => r.status === 200 && backendValues(r, 'x-tenant').join() === 'internal'
      return [
        item('A spoofed x-tenant is replaced by internal', clean(spoofed), [spoofed]),
        item('The same header in another case is replaced too', clean(shouting), [shouting]),
        item('A normal request still gets x-tenant: internal', clean(honest), [honest]),
        item('An unknown client is still rejected with 401', stranger.status === 401, [stranger]),
      ]
    },
  },
  {
    id: 'sla-approval',
    title: 'SLA tier approval',
    scenario:
      'Partner Portal requested access on the Silver tier, which has no automatic approval, so its contract is pending and its calls fail. Old Kiosk was revoked on purpose and must stay out.',
    goal: 'Partner Portal can call the API on the Silver quota, 2 requests per window. Old Kiosk stays rejected and the Mobile App keeps its Gold quota of 5.',
    hints: ['Open Client Applications. Tiers without automatic approval wait for a person.', 'Moving Partner Portal to Gold would break the quota in the goal.'],
    solution: 'Approve the Partner Portal contract on Client Applications. Change nothing else.',
    why: 'Rate-Limiting SLA reads the quota from the contract tier, so approving the contract is what turns the tier on for that client. The page says a client without a contract is rejected. It does not give the status for that case, so the 401 for Old Kiosk is the lab reading.',
    docs: 'https://docs.mulesoft.com/mule-gateway/policies-included-rate-limiting-sla',
    start: () => setup([applied('rate-limit-sla')], [MOBILE, { ...PARTNER, contract: 'pending' }, KIOSK]),
    solve: (config) => ({ ...config, apps: config.apps.map((a) => (a.name === PARTNER.name ? { ...a, contract: 'approved' } : a)) }),
    check(config) {
      const partner = play(config, times(3, as(PARTNER)))
      const kiosk = play(config, [as(KIOSK)])
      const gold = play(config, times(6, as(MOBILE)))
      return [
        item('Partner Portal gets 200 twice', allStatus(partner.slice(0, 2), 200), partner.slice(0, 2)),
        item('Its third request gets 429, the Silver limit', partner[2].status === 429, partner.slice(2)),
        item('Old Kiosk stays rejected with 401', kiosk[0].status === 401, kiosk),
        item('The Mobile App keeps 5 requests, and the sixth gets 429', allStatus(gold.slice(0, 5), 200) && gold[5].status === 429, gold),
      ]
    },
  },
  {
    id: 'allowlist-load-balancer',
    title: 'Allowlist behind a load balancer',
    scenario:
      'A load balancer at 10.0.0.5 now sits in front of the API, so every request has that source address and the allowlist of 10.0.0.0/8 lets everyone in. Partner offices use 198.51.100.0/24, and the balancer appends the caller to x-forwarded-for.',
    goal: 'Callers from 198.51.100.0/24 get through. Other callers get 403, including the balancer itself when no x-forwarded-for arrives.',
    hints: ['Which address does the policy read now, and which one do you need?', 'Change the IP expression and the list together.'],
    solution: "Set IP expression to #[attributes.headers['x-forwarded-for']] and the Allowlist to 198.51.100.0/24.",
    why: 'Behind a proxy the connection address is the proxy. A client can also send this header itself, so only rely on it when the balancer controls the value.',
    docs: 'https://docs.mulesoft.com/mule-gateway/policies-included-ip-allowlist',
    start: () => setup([applied('ip-allow', { list: '10.0.0.0/8' })]),
    solve: (config) => editPolicy(config, 'ip-allow', { expression: FORWARDED, list: '198.51.100.0/24' }),
    check(config) {
      const via = (client) => as(MOBILE, { ip: '10.0.0.5', headers: client ? [['x-forwarded-for', `${client}, 10.0.0.5`]] : [] })
      const [office, outsider, direct] = play(config, [via('198.51.100.7'), via('203.0.113.9'), via()])
      return [
        item('A partner office caller gets 200', office.status === 200, [office]),
        item('A caller from another network gets 403', outsider.status === 403, [outsider]),
        item('A request with no x-forwarded-for gets 403', direct.status === 403, [direct]),
      ]
    },
  },
  {
    id: 'per-client-quota',
    title: 'One quota per client',
    scenario: 'Both applications share one Rate Limiting counter, so a busy Mobile App starves Partner Portal. Partner Portal also wants to see its remaining quota.',
    goal: 'Each client ID has its own quota of 3 requests per window, and responses carry the X-Ratelimit headers.',
    hints: ['Look at the Identifier field.', 'Expose Headers is off by default.'],
    solution: "Set Identifier to #[attributes.headers['client_id']] and Expose Headers to Yes.",
    why: 'The identifier splits one policy into a separate quota per value. Without it, all requests share a single counter.',
    docs: 'https://docs.mulesoft.com/mule-gateway/policies-included-rate-limiting',
    start: () => setup([applied('client-id'), applied('rate-limit', { requests: 3, periodMs: 10000 })]),
    solve: (config) => editPolicy(config, 'rate-limit', { identifier: CLIENT_ID, expose: 'Yes' }),
    check(config) {
      const results = play(config, [...times(4, as(MOBILE)), as(PARTNER)])
      const partner = results[4]
      return [
        item('The Mobile App gets 3 requests, and the fourth gets 429', allStatus(results.slice(0, 3), 200) && results[3].status === 429, results.slice(0, 4)),
        item('Partner Portal still gets 200 after that', partner.status === 200, [partner]),
        item('The response reports X-Ratelimit-Limit: 3', partner.responseHeaders.some(([k, v]) => k === 'X-Ratelimit-Limit' && v === '3'), [partner]),
      ]
    },
  },
  {
    id: 'smooth-a-burst',
    title: 'Smooth a burst',
    scenario: 'A batch client sends 4 requests within 300 ms. The backend can take 2 per second, and Spike Control rejects the extra requests because it gives up after one delay.',
    goal: 'All 4 requests of the burst reach the backend, and the third and fourth are delayed, so the rate stays at 2 per second.',
    hints: ['Raising Number of Reqs would pass the requests but overload the backend.', 'Each delay attempt waits Delay Time before trying again.'],
    solution: 'Keep 2 requests per 1000 ms and raise Delay Attempts to 2 or more.',
    why: 'Spike Control trades latency for success: queued requests wait for quota instead of failing, up to Delay Attempts times Delay Time.',
    docs: 'https://docs.mulesoft.com/mule-gateway/policies-included-spike-control',
    start: () => setup([applied('spike', { requests: 2, periodMs: 1000, delayMs: 499, attempts: 1, queueLimit: 5 })]),
    solve: (config) => editPolicy(config, 'spike', { attempts: 2 }),
    check(config) {
      const results = play(
        config,
        [0, 100, 200, 300].map((at) => ({ ...as(MOBILE), at })),
      )
      return [
        item('All 4 requests get 200', allStatus(results, 200), results),
        item('The first 2 are not delayed', results[0].latency === 0 && results[1].latency === 0, results.slice(0, 2)),
        item('The third and fourth are delayed', results[2].latency > 0 && results[3].latency > 0, results.slice(2)),
      ]
    },
  },
  {
    id: 'json-limits',
    title: 'JSON limits for orders',
    scenario: 'JSON Threat Protection is applied with every limit at -1, so it checks nothing. A real order nests three containers deep and has up to 10 items. Hostile bodies go far beyond that.',
    goal: 'A normal order gets through. A body nested 6 deep and an array of 50 items both get 400.',
    hints: ['A limit of -1 turns that check off.', 'Count containers: the object, the items array and each item object make 3.'],
    solution: 'Set Maximum Container Depth to 3 and Maximum Array Element Count to 10.',
    why: 'Limits close to the real payload shape reject oversized bodies at the gateway, before the backend spends time parsing them.',
    docs: 'https://docs.mulesoft.com/mule-gateway/policies-included-json-threat-protection',
    start: () => setup([applied('json-threat')]),
    solve: (config) => editPolicy(config, 'json-threat', { depth: 3, elements: 10 }),
    check(config) {
      const order = { id: 7, items: Array.from({ length: 10 }, (_, i) => ({ sku: `A-${i}`, quantity: 1 })) }
      const deep = { a: { b: { c: { d: { e: { f: 1 } } } } } }
      const wide = { id: 8, items: Array.from({ length: 50 }, () => 1) }
      const [good, nested, long] = play(config, [order, deep, wide].map((body) => as(MOBILE, { method: 'POST', body: JSON.stringify(body) })))
      return [
        item('A normal order of 10 items gets 200', good.status === 200, [good]),
        item('A body nested 6 deep gets 400', nested.status === 400, [nested]),
        item('An array of 50 items gets 400', long.status === 400, [long]),
      ]
    },
  },
  {
    id: 'cors-preflight',
    title: 'CORS preflight',
    scenario:
      'A web portal at https://portal.example.com calls this API from the browser. Before each POST the browser sends an OPTIONS preflight, which carries no client credentials, so Client ID Enforcement rejects it and the POST is never sent.',
    goal: 'The browser accepts a preflight from the portal, and POST calls from the portal work. A page on any other origin is blocked by the browser. Unknown clients still get 401.',
    hints: ['CORS always runs first, wherever you add it.', 'A public resource mirrors any origin, which is too open here. Clear Public resource and list the origin.', 'The preflight asks for the client_id header, so it must be allowed.'],
    solution: 'Apply the CORS policy with Public resource set to No, Origins https://portal.example.com, Allowed methods including POST, and Allowed headers including client_id.',
    why: 'The gateway applies CORS before any other policy and treats every OPTIONS request as a preflight, and the page says such a request does not reach the protected resource. That Client ID Enforcement never sees it, and the 200 status, are the lab reading. CORS does not reject anything: the browser enforces it when the response has no Access-Control-Allow-Origin.',
    docs: 'https://docs.mulesoft.com/mule-gateway/policies-included-cors',
    start: () => setup([applied('client-id')]),
    solve: (config) => ({ ...config, policies: [...config.policies, applied('cors', { publicResource: 'No', origins: 'https://portal.example.com', methods: 'GET, POST', headers: 'client_id, client_secret' })] }),
    check(config) {
      const fromPortal = [['Origin', 'https://portal.example.com']]
      const asking = [['Access-Control-Request-Method', 'POST'], ['Access-Control-Request-Headers', 'client_id']]
      const [preflight, real, outsider, stranger] = play(config, [
        as(NOBODY, { method: 'OPTIONS', headers: [...fromPortal, ...asking] }),
        as(MOBILE, { method: 'POST', headers: fromPortal }),
        as(NOBODY, { method: 'OPTIONS', headers: [['Origin', 'https://other.example.com'], ...asking] }),
        as(STRANGER, { method: 'POST', headers: fromPortal }),
      ])
      return [
        item('The browser accepts the preflight, and it stops at the gateway', preflight.browser === 'allowed' && !preflight.reachedBackend, [preflight]),
        item('A POST from the portal gets 200 with Access-Control-Allow-Origin', real.status === 200 && responseValue(real, 'access-control-allow-origin') === 'https://portal.example.com', [real]),
        item('The browser blocks a page on another origin', outsider.browser === 'blocked', [outsider]),
        item('An unknown client still gets 401', stranger.status === 401, [stranger]),
      ]
    },
  },
  {
    id: 'automated-priority',
    title: 'Automated policy wins',
    scenario:
      'The platform team applied an automated IP Allowlist of 10.0.0.0/8 to every API. This API has its own IP Allowlist that adds the partner offices, 198.51.100.0/24, yet partners still get 403.',
    goal: 'Internal callers and partner offices get through, anyone else gets 403, and the allowlist stays in place as an automated policy.',
    hints: ['Open the Policies tab. One of the two IP Allowlist policies is marked as disabled.', 'An automated policy has priority over an API level policy of the same type.'],
    solution: 'Add 198.51.100.0/24 to the list on the automated IP Allowlist. Editing the API level policy changes nothing while the automated one exists.',
    why: 'Automated policies have priority over the same type applied to an API, so the API level policy stays disabled. It comes back only if the automated policy is removed.',
    docs: 'https://docs.mulesoft.com/mule-gateway/policies-automated-overview',
    start: () =>
      setup([applied('ip-allow', { list: '10.0.0.0/8, 198.51.100.0/24' })], [MOBILE], {
        automated: [{ ...applied('ip-allow', { list: '10.0.0.0/8' }), id: 'lab-automated-ip-allow' }],
      }),
    solve: (config) => editAutomated(config, 'ip-allow', { list: '10.0.0.0/8, 198.51.100.0/24' }),
    check(config) {
      const [internal, office, outsider] = play(config, ['10.1.2.3', '198.51.100.7', '203.0.113.9'].map((ip) => as(MOBILE, { ip })))
      const kept = (config.automated ?? []).some((p) => p.type === 'ip-allow')
      return [
        item('An internal caller gets 200', internal.status === 200, [internal]),
        item('A partner office caller gets 200', office.status === 200, [office]),
        item('Any other caller gets 403', outsider.status === 403, [outsider]),
        fact('The IP Allowlist is still an automated policy', kept, kept ? 'applied' : 'removed'),
      ]
    },
  },
  {
    id: 'write-only-auth',
    title: 'Protect only the writes',
    scenario: 'Anyone may read orders, but Client ID Enforcement applies to the whole API, so anonymous GET requests get 401. Writes under /orders must stay protected.',
    goal: 'GET /orders needs no credentials. POST /orders and DELETE /orders/7 need a known client, and return 401 otherwise.',
    hints: ['Open the policy and look at Method & Resource conditions.', 'The resource is a regular expression, and it has to match /orders/7 as well as /orders.'],
    solution: 'On Client ID Enforcement, apply the configuration to specific methods and resources: POST, PUT and DELETE on /orders.*',
    why: 'A resource-level policy runs only for requests that match its conditions. Any other request skips it and carries on down the chain. On a real API the regular expression must include the base path, unless ignoreBasePath is set. The lab API has no base path, and matches the expression against the whole path.',
    docs: 'https://docs.mulesoft.com/mule-gateway/policies-resource-level-overview',
    start: () => setup([applied('client-id')]),
    solve: (config) => ({ ...config, policies: config.policies.map((p) => ({ ...p, conditions: [{ methods: ['POST', 'PUT', 'DELETE'], resource: '/orders.*' }] })) }),
    check(config) {
      const [read, readOne, write, remove, signed] = play(config, [
        as(NOBODY),
        as(NOBODY, { path: '/orders/7' }),
        as(NOBODY, { method: 'POST' }),
        as(NOBODY, { method: 'DELETE', path: '/orders/7' }),
        as(MOBILE, { method: 'POST' }),
      ])
      return [
        item('An anonymous GET on /orders and /orders/7 gets 200', read.status === 200 && readOne.status === 200, [read, readOne]),
        item('An anonymous POST on /orders gets 401', write.status === 401, [write]),
        item('An anonymous DELETE on /orders/7 gets 401', remove.status === 401, [remove]),
        item('A POST from a known client gets 200', signed.status === 200, [signed]),
      ]
    },
  },
  {
    id: 'oidc-scopes',
    title: 'Token scopes and contracts',
    scenario:
      'OpenID Connect token enforcement protects this API, but it was set up in a hurry: no scopes are listed, and Skip Client Id Validation is on. A read-only token can write, and Old Kiosk, whose contract was revoked, still gets in.',
    goal: 'Only tokens with both READ and WRITE get through. A READ token gets 403, and so does Old Kiosk with a good token. No token gets 401 and an expired token gets 400. The page does not give a status for a failed scope check or a missing token, so those two codes are the lab assumption.',
    hints: ['With no Scopes the policy does not validate scopes at all.', 'Contains any scope would let a READ token through.', 'Which step of the policy looks at the contract?'],
    solution: 'Set Scopes to READ WRITE, Scope Validation Criteria to Contains all scopes, and Skip Client Id Validation to No.',
    why: 'The validation endpoint proves that the token is genuine. Scopes and the contract check decide whether this client may use this API.',
    docs: 'https://docs.mulesoft.com/mule-gateway/policies-included-openid-token-enforcement',
    start: () => setup([applied('oidc', { skipClient: 'Yes' })], [MOBILE, KIOSK]),
    solve: (config) => editPolicy(config, 'oidc', { scopes: 'READ WRITE', criteria: 'Contains all scopes', skipClient: 'No' }),
    check(config) {
      const full = { method: 'POST', token: 'valid', scopes: 'READ WRITE' }
      const [good, readOnly, kiosk, none, expired] = play(config, [
        as(MOBILE, full),
        as(MOBILE, { ...full, scopes: 'READ' }),
        as(KIOSK, full),
        as(MOBILE, { ...full, token: 'none' }),
        as(MOBILE, { ...full, token: 'expired' }),
      ])
      return [
        item('A token with READ and WRITE gets 200', good.status === 200, [good]),
        item('A token with only READ gets 403', readOnly.status === 403, [readOnly]),
        item('Old Kiosk gets 403 with a good token', kiosk.status === 403, [kiosk]),
        item('No token gets 401', none.status === 401, [none]),
        item('An expired token gets 400', expired.status === 400, [expired]),
      ]
    },
  },
  {
    id: 'ldap-subtree',
    title: 'LDAP search scope',
    scenario:
      'Basic Authentication: LDAP was applied with the search base ou=people. Staff such as jane sign in, but partner users such as omar sit one level lower, under ou=partners, and always get 401.',
    goal: 'jane and omar both sign in with their passwords. A wrong password and an unknown user get 401 with a WWW-Authenticate header.',
    hints: ['One level looks only at the entries directly under the search base.', 'Moving the search base to ou=partners would lock jane out.'],
    solution: 'Set LDAP Search in subtree to Yes.',
    why: 'A subtree search covers the base and everything below it. It finds more users, and the page warns that it is slower than one level.',
    docs: 'https://docs.mulesoft.com/mule-gateway/policies-included-basic-auth-ldap',
    start: () => setup([applied('basic-ldap')]),
    solve: (config) => editPolicy(config, 'basic-ldap', { subtree: 'Yes' }),
    check(config) {
      const user = (basicUser, basicPassword) => as(MOBILE, { basicUser, basicPassword })
      const [jane, omar, wrong, unknown] = play(config, [user('jane', 'jane-password'), user('omar', 'omar-password'), user('jane', 'guess'), user('nobody', 'guess')])
      const challenged = (r) => r.status === 401 && responseValue(r, 'www-authenticate') === 'Basic realm="mule-realm"'
      return [
        item('jane gets 200', jane.status === 200, [jane]),
        item('omar gets 200', omar.status === 200, [omar]),
        item('A wrong password gets 401 with WWW-Authenticate', challenged(wrong), [wrong]),
        item('An unknown user gets 401 with WWW-Authenticate', challenged(unknown), [unknown]),
      ]
    },
  },
  {
    id: 'xml-limits',
    title: 'XML limits for orders',
    scenario: 'XML Threat Protection is applied with every limit at -1, so it checks nothing. A real order has 4 levels of nodes and up to 10 items. Hostile bodies go far beyond that.',
    goal: 'A normal order gets through. A body nested 12 deep and an order with 50 items both get 400.',
    hints: ['A value of -1 means no limit.', 'Count the levels: order, items, item, qty. The page does not define the count, so taking the root as level 1 is the lab reading.'],
    solution: 'Set Maximum Node Depth to 4 and Maximum Child Count to 10.',
    why: 'Attacks on XML inflate elements, attributes and nesting to use up memory. Limits close to the real payload stop them at the gateway. The page does not define how depth and children are counted, so test exact limits on a real gateway.',
    docs: 'https://docs.mulesoft.com/mule-gateway/policies-included-xml-threat-protection',
    start: () => setup([applied('xml-threat')]),
    solve: (config) => editPolicy(config, 'xml-threat', { depth: 4, children: 10 }),
    check(config) {
      const order = (count) => `<order id="7"><items>${'<item sku="A"><qty>1</qty></item>'.repeat(count)}</items></order>`
      const deep = `${'<a>'.repeat(12)}x${'</a>'.repeat(12)}`
      const [good, nested, wide] = play(config, [order(10), deep, order(50)].map((body) => as(MOBILE, { method: 'POST', body })))
      return [
        item('A normal order of 10 items gets 200', good.status === 200, [good]),
        item('A body nested 12 deep gets 400', nested.status === 400, [nested]),
        item('An order of 50 items gets 400', wide.status === 400, [wide]),
      ]
    },
  },
  {
    id: 'distributed-cluster',
    title: 'Distributed across nodes',
    scenario:
      'The API runs on 3 separate nodes behind a load balancer. Rate-Limiting SLA has Distributed ticked, and Mobile App has a Gold quota of 5 per 2 minutes, yet the client gets 15 requests through, three times the contract.',
    goal: 'Mobile App gets 5 requests per window across all 3 nodes. The API stays on 3 nodes.',
    hints: ['Open the Nodes tab and read the note under the node count.', 'Distributed shares the quota only in one kind of deployment.'],
    solution: 'On the Nodes tab, change the deployment to Mule HA cluster and leave Distributed on.',
    why: 'Distributed has no effect unless the runtime runs in a Mule HA cluster, so each separate node kept its own quota. In a cluster the whole cluster accepts the quota once. The page recommends windows longer than one minute there, and a Mule cluster is not available on CloudHub.',
    docs: 'https://docs.mulesoft.com/mule-gateway/policies-included-rate-limiting-sla',
    start: () =>
      setup([applied('rate-limit-sla', { distributed: 'Yes' })], [MOBILE], {
        topology: { nodes: 3, mode: 'separate' },
        tiers: [{ name: 'Gold', requests: 5, periodMs: 120000, autoApprove: true }],
      }),
    solve: (config) => ({ ...config, topology: { ...config.topology, mode: 'cluster' } }),
    check(config) {
      const results = play(config, times(15, as(MOBILE)))
      const accepted = results.filter((r) => r.status === 200).length
      const nodes = config.topology?.nodes ?? 1
      return [
        fact('The client gets exactly 5 of 15 requests through', accepted === 5, `${accepted} accepted`, basisOf(results)),
        item('The other 10 get 429', results.slice(5).every((r) => r.status === 429), results.slice(5)),
        fact('The API still runs on 3 nodes', nodes === 3, `${nodes} node(s)`),
      ]
    },
  },
  {
    id: 'rm-missing-property',
    kind: 'runtime',
    title: 'Missing property',
    scenario: 'orders-api failed to start. The deployment has db.host and db.user, but the logs complain about a property that was never supplied.',
    goal: 'orders-api is Running and Applied, and the database password is a protected property, so its value is hidden after deployment.',
    hints: ['Read the ERROR lines in the logs.', 'A password belongs in the Protected properties box, not in Properties.'],
    solution: 'Use Edit in form, add db.password=any-value under Protected properties, and deploy again.',
    why: 'A failed first deployment has no earlier configuration to fall back on, so the application stays failed until a new configuration works. The sample application and the way it fails on a missing property are lab inventions.',
    docs: `${CH2}ch2-manage-props`,
    start: () => shipped(newState(), { ...ORDERS, protectedProperties: {} }),
    solve: (state) => shipped(state, { ...appNamed(state, 'orders-api').config, protectedProperties: { 'db.password': 'lab-secret' } }),
    check(state) {
      const app = appNamed(settle(state), 'orders-api')
      const secret = Boolean(app?.config.protectedProperties['db.password']) && !app?.config.properties['db.password']
      return [
        fact('orders-api is Running and Applied', healthy(app), statusOf(app), 'assumed'),
        fact('db.password is a protected property', secret, secret ? 'protected' : 'not protected'),
      ]
    },
  },
  {
    id: 'rm-out-of-memory',
    kind: 'runtime',
    title: 'Out of memory',
    scenario: 'inventory-sync loads a large catalogue at startup. On a 0.5 vCore replica it stops with an OutOfMemoryError and never reaches Started.',
    goal: 'inventory-sync is Running and Applied on replicas of 1 vCore or less. Budget rules out anything larger.',
    hints: ['Adding replicas does not help: each one has the same heap.', 'The form shows the heap of each replica size.'],
    solution: 'Use Edit in form, set the replica size to 1 vCore, and deploy again.',
    why: 'Heap comes with the replica size, as the architecture table shows. Scaling out adds copies, while only a larger replica gives one copy more memory. The 1.6 GB this sample needs is a lab value.',
    docs: `${CH2}ch2-architecture`,
    start: () => shipped(newState(), INVENTORY),
    solve: (state) => shipped(state, { ...appNamed(state, 'inventory-sync').config, vCores: 1 }),
    check(state) {
      const app = appNamed(settle(state), 'inventory-sync')
      return [
        fact('inventory-sync is Running and Applied', healthy(app), statusOf(app), 'assumed'),
        fact('Its replicas are 1 vCore or less', app && app.config.vCores <= 1, app ? `${app.config.vCores} vCore` : 'no application'),
      ]
    },
  },
  {
    id: 'rm-not-enough-vcores',
    kind: 'runtime',
    focus: 'orders-api',
    title: 'Not enough vCores',
    scenario:
      'The private space has 2 vCores, all in use: reporting has 1.5 and orders-api has 0.5. An update of orders-api to Mule 4.10 is stuck in Pending, because a rolling update needs room for one more replica.',
    goal: 'orders-api runs on Mule 4.10 and shows Applied, and reporting keeps running.',
    hints: ['Read the cause under the application: what does a rolling update require?', 'One deployment model needs no additional resources. What does it cost?'],
    solution: 'Use Edit in form on orders-api, set the deployment model to Recreate, and deploy again. Moving orders-api to the shared space also works.',
    why: 'A rolling update requires one additional replica of resources because old and new replicas run side by side. Recreate terminates first, so it needs none, at the price of downtime. Mule 4.10 and the vCores of each space are lab sample values.',
    docs: `${CH2}ch2-deploy-maven`,
    start: () => {
      const base = { ...ORDERS, target: 'private' }
      return shipped(shipped(shipped(newState(), REPORTING), base), { ...base, runtime: '4.10' })
    },
    solve: (state) => shipped(state, { ...appNamed(state, 'orders-api').config, model: 'Recreate' }),
    check(state) {
      const settled = settle(state)
      const app = appNamed(settled, 'orders-api')
      const reporting = appNamed(settled, 'reporting')
      return [
        fact('orders-api is Running and Applied', healthy(app), statusOf(app)),
        fact('orders-api runs on Mule 4.10', app?.config.runtime === '4.10', app?.config.runtime ?? 'no application', 'assumed'),
        fact('reporting is still running', reporting && appStatus(reporting) === 'Running', statusOf(reporting)),
      ]
    },
  },
  {
    id: 'rm-rollback',
    kind: 'runtime',
    title: 'Roll back a bad change',
    scenario: 'The latest orders-api configuration deployed cleanly, but it points db.host at db-old.lab, an out of date copy of the database. Customers see stale orders, and the earlier configuration was fine.',
    goal: 'orders-api is Running and Applied with db.host set to db.lab again, as in the previous successful configuration.',
    hints: ['A clean deployment can still be a bad one: Applied says nothing about the data.', 'Look at Configuration history.'],
    solution: 'In Configuration history, choose Roll back on the earlier configuration.',
    why: 'Rolling back deploys a previous successful configuration. It moves to the top of the history with a new deployment date and keeps its original identifying hash, so no new entry appears. Only configurations that were applied successfully can be chosen.',
    docs: `${CH2}ch2-update-apps`,
    start: () => shipped(shipped(newState(), ORDERS), { ...ORDERS, properties: { ...ORDERS.properties, 'db.host': 'db-old.lab' } }),
    solve(state) {
      const app = appNamed(state, 'orders-api')
      const earlier = app.history.find((h) => h.status === 'Applied' && h.config.properties['db.host'] === 'db.lab')
      return settle(rollback(state, 'orders-api', earlier.id).state)
    },
    check(state) {
      const app = appNamed(settle(state), 'orders-api')
      const host = app?.config.properties['db.host']
      return [
        fact('orders-api is Running and Applied', healthy(app), statusOf(app)),
        fact('db.host is db.lab again', host === 'db.lab', host ?? 'no application'),
      ]
    },
  },
]

export const labById = new Map(GUIDED_LABS.map((lab) => [lab.id, lab]))

export function runCheck(lab, config) {
  const items = lab.check(config)
  return { passed: items.every((i) => i.ok), items }
}

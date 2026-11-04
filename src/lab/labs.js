// Guided labs for the API Manager simulator. Each one has a broken starting setup and a goal.
// A check is a list of real requests through send(), so any setup that behaves correctly passes.
import { newRuntime, send } from './engine.js'
import { defaultSettings } from './policies.js'

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

const setup = (policies, apps = [MOBILE, PARTNER]) => ({ policies, tiers: structuredClone(TIERS), apps: structuredClone(apps) })

const as = (app, extra = {}) => ({
  method: 'GET',
  ip: '10.1.2.3',
  clientId: app.clientId,
  clientSecret: app.clientSecret,
  basicUser: '',
  basicPassword: '',
  token: 'none',
  headers: [],
  body: '',
  ...extra,
})
const STRANGER = { clientId: 'unknown-client', clientSecret: 'guess' }

// Sends the requests in order on one runtime. Each request can set `at`, the virtual time it arrives.
function play(config, requests) {
  let runtime = newRuntime()
  return requests.map(({ at = 0, ...request }) => {
    const result = send(config, runtime, request, at)
    runtime = result.runtime
    return result
  })
}

const basisOf = (results) => (results.some((r) => r.trace.some((step) => step.basis === 'assumed')) ? 'assumed' : 'docs')
const item = (label, ok, results) => ({ label, ok: Boolean(ok), basis: basisOf(results), seen: results.map((r) => r.status).join(', ') || 'no request' })
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
    why: 'Rate Limiting SLA reads the quota from the contract tier, so approving the contract is what turns the tier on for that client.',
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
]

export const labById = new Map(GUIDED_LABS.map((lab) => [lab.id, lab]))

export function runCheck(lab, config) {
  const items = lab.check(config)
  return { passed: items.every((i) => i.ok), items }
}

// Anypoint Flex Gateway in the Platform Lab: self-managed gateways in the data center of Brightmart, their replicas, the API
// Manager instances whose runtime is Flex Gateway, and the policies they enforce. Pure and import free. Lives in state.flex.
//
// What is modelled (Sources: gateway/latest flex-conn-reg-run, flex-local-reg-run, flex-review-prerequisites):
//   - a gateway in Connected Mode registers with flexctl and then calls the control plane outbound on 443. It polls API
//     Manager for its APIs and policies and sends a heartbeat, so Runtime Manager shows it Connected with a last seen time.
//   - a gateway that cannot reach the control plane keeps serving with the configuration it applied last. Changes made in
//     API Manager meanwhile wait in the control plane until it reconnects.
//   - a request passes the policies in their order, then goes to the upstream. The policy decisions come from the policy
//     engine of the lab (engine.js send), which the caller passes in, so this file stays free of imports.
//   - upstream failures answer the way Envoy does: 503 UF, 504 UT and 502 UPE with Envoy's response text.
//
// state.flex = {
//   created,
//   gateways:  { [name]: { name, env, mode, platform, version, service, status, since, lastSeen, replicas, egress, applied, log } }
//     replicas   [{ id, ip, seen }]
//     egress     the outbound rules of the data center firewall for the gateway hosts, first match wins, then deny:
//                [{ dest: 'any' | host | '*.domain', port: number | 'any', action: 'Allow' | 'Deny', note }]
//     applied    { [apiId]: { v, sig, t, policies, apps } } the configuration the gateway runs
//     log        the gateway agent log, newest last
//   latest:    { [apiId]: { v, sig, t } } the configuration version in the control plane
//   upstreams: { [url]: { state: 'up' | 'refused' | 'slow' | 'protocol', ms } } lab made services behind the gateway
//   traffic:   [{ api, n, every, ip, client, jwt, path, method, ua }] calls the lab sends each lab minute
//   calls:     the access log, compact records, newest last; maxCalls keeps it shorter in the practice console
//   runtimes:  { [apiId]: policy engine runtime (rate limit windows) }
// }
// An API on a gateway is an API Manager instance with runtime 'Flex Gateway', gateway, basePath, port and upstream.

const MINUTE = 60000
const BASE = Date.UTC(2026, 10, 2) // the epoch of the lab clock, the same as platform.js
const MAX_CALLS = 300
const MAX_LOG = 40

export const FLEX = 'brightmart-flex-dc'
export const FLEX_VERSION = '1.9.3' // a sample 1.x version
export const FLEX_RUNTIME = 'Flex Gateway'
export const CONF_DIR = '/usr/local/share/mulesoft/flex-gateway/conf.d'
export const FLEX_ORG = '5d3f8a2e-91c4-4b7a-8e06-3c2b1a9f7d40' // lab value
export const FLEX_TOKEN = 'lab-flex-registration-token-sbx' // lab value, not a real token
// Lab made short list of what a Connected Mode gateway calls on port 443. The real list for the US control plane is
// longer and is on the Flex Gateway prerequisites page.
export const CONTROL_HOSTS = ['anypoint.mulesoft.com', 'runtime-manager.anypoint.mulesoft.com', 'analytics-ingest.anypoint.mulesoft.com']
// The policies of the Flex catalog the lab models, with the names of their policy definitions in a local configuration
export const FLEX_CATALOG = { 'rate-limit': 'rate-limiting-flex', 'client-id': 'client-id-enforcement-flex', jwt: 'jwt-validation-flex', 'ip-allow': 'ip-allowlist-flex', 'header-inject': 'header-injection-flex', cors: 'cors-flex', spike: 'spike-control-flex' }

// Identity providers of Brightmart and the key IDs their JWKS endpoints publish (lab made)
export const IDP = 'https://login.brightmart-id.example'
export const OLD_IDP = 'https://sso-legacy.brightmart-id.example'
export const JWKS = {
  [`${IDP}/oauth2/v1/keys`]: ['hid-2026-11'],
  [`${OLD_IDP}/oauth2/keys`]: ['legacy-2024-03'],
}
// The tokens the lab callers send. A request names one by its key.
export const JWTS = {
  partner: { iss: IDP, aud: 'api://partner-shipments', kid: 'hid-2026-11', sub: 'par-5e90' },
}

// The settings of the JWT Validation policy on Flex Gateway, shown on the policy form of a Flex API in API Manager.
// The lab keeps the key and audience settings that decide the outcome. Source: gateway/latest policies-included-jwt-validation
export const FLEX_JWT_FIELDS = [
  { key: 'origin', label: 'JWT origin', type: 'select', options: ['Bearer Authentication Header', 'Custom Expression'], value: 'Bearer Authentication Header' },
  { key: 'signingMethod', label: 'JWT Signing Method', type: 'select', options: ['RSA', 'ES', 'HMAC'], value: 'RSA' },
  { key: 'keyOrigin', label: 'JWT Key origin', type: 'select', options: ['JWKS', 'Text'], value: 'JWKS' },
  { key: 'jwksUrl', label: 'JWKS Url', type: 'text', value: '', hint: 'The URL of the key set of the identity provider' },
  { key: 'jwksTtl', label: 'JWKS Service time to live (minutes)', type: 'number', value: 60 },
  { key: 'validateAud', label: 'Validate Audience Claim', type: 'select', options: ['Yes', 'No'], value: 'Yes' },
  { key: 'audiences', label: 'Audience Claim Values', type: 'text', value: '', hint: 'Comma separated' },
  { key: 'expMandatory', label: 'Expiration Claim Mandatory', type: 'select', options: ['Yes', 'No'], value: 'Yes' },
]
// API Manager hook: the policy definition the form shows for one API
export const flexFields = (api, policy) =>
  api?.runtime === FLEX_RUNTIME && policy?.type === 'jwt'
    ? { ...policy, summary: 'Flex Gateway: checks the signature of the token with the keys of the JWKS Url, then the claims. No token returns 400, a failed signature or claim returns 401.', fields: FLEX_JWT_FIELDS }
    : policy

// ---------- state ----------

export const defaultFlex = (now) => ({ created: now })

export const newGateway = (name, extra = {}) => ({
  name,
  env: 'Sandbox',
  mode: 'Connected',
  platform: 'Linux',
  version: FLEX_VERSION,
  service: 'active',
  status: 'Connected',
  since: 0,
  lastSeen: 0,
  replicas: [
    { id: `${name}-01`, ip: '10.20.4.21', seen: 0 },
    { id: `${name}-02`, ip: '10.20.4.22', seen: 0 },
  ],
  egress: [{ dest: 'any', port: 443, action: 'Allow', note: 'HTTPS out from the DMZ' }, { dest: '*.brightmart.local', port: 'any', action: 'Allow', note: 'Internal services' }],
  applied: {},
  log: [],
  ...extra,
})

export const newFlex = (extra = {}) => ({ created: 0, gateways: {}, latest: {}, upstreams: {}, traffic: [], calls: [], runtimes: {}, ...extra })

// An API Manager instance on a gateway, in the shape of newApi in platform.js
export const flexApi = (id, extra = {}) => ({
  id: String(id), name: '', assetId: '', version: '1.0.0', apiVersion: 'v1', env: 'Sandbox', label: '', upstream: '', consumer: '', mule4: true, proxy: 'basic',
  policies: [], tiers: [], contracts: [], alerts: [], seen: false, runtime: FLEX_RUNTIME, gateway: FLEX, basePath: '/', port: 8081, ...extra,
})

// The console of the lab: brightmart-flex-dc with one API. It is filled on first use, so the saved console stays small.
const OPEN_API = '19600101'
function consoleFlex(now) {
  return newFlex({
    created: now,
    gateways: { [FLEX]: newGateway(FLEX, { since: now, lastSeen: now }) },
    traffic: [{ api: OPEN_API, n: 1, every: 2, ip: '198.51.100.7', client: 'Partner Portal', path: '/rates?zip=10001', ua: 'brightmart-partner-portal/2.1' }],
    // the practice console runs for weeks, so it keeps a shorter access log than a lab
    maxCalls: 60,
  })
}
const consoleApi = (now) =>
  flexApi(OPEN_API, {
    name: 'Carrier Rates API', assetId: 'carrier-rates-api', label: 'flex', upstream: 'http://carrier-rates.brightmart.local:8080/api', consumer: 'https://flex-dc.brightmart.example/carrier-rates', basePath: '/carrier-rates', t: now,
    policies: [
      { id: 'flex-po-1', type: 'client-id', settings: { origin: 'Custom Expression', secret: 'Required' } },
      { id: 'flex-po-2', type: 'rate-limit', settings: { requests: 100, periodMs: 60000, extraLimits: [], identifier: '(not configured)', distributed: 'Yes', expose: 'No' } },
    ],
    contracts: [{ client: 'Partner Portal', tier: '', status: 'approved', t: now }],
  })

export const isPlaceholder = (f) => Boolean(f) && !f.gateways
// A console saved while this file was a placeholder gets the gateway on first use. Returns a new state.
export function upgradeFlex(state) {
  if (!isPlaceholder(state?.flex)) return state
  const s = structuredClone(state)
  s.flex = { ...consoleFlex(s.clock), created: state.flex.created ?? s.clock }
  if (!s.apis.some((a) => a.id === OPEN_API)) s.apis.push(consoleApi(s.clock))
  syncAll(s)
  return s
}
// What a screen shows for a state without Flex Gateway: the console defaults, read only
export function previewFlex(state) {
  const s = structuredClone({ ...state, flex: { created: state.clock } })
  return upgradeFlex(s)
}

const edit = (state, fn) => {
  const s = structuredClone(state)
  fn(s)
  return s
}

// ---------- reads ----------

export const gatewaysOf = (s, env = s.env) => Object.values(s.flex?.gateways ?? {}).filter((g) => g.env === env)
export const gatewayOf = (s, name) => s.flex?.gateways?.[name] ?? null
export const apisOn = (s, name) => (s.apis ?? []).filter((a) => a.runtime === FLEX_RUNTIME && a.gateway === name)
export const apiOf = (s, id) => (s.apis ?? []).find((a) => a.id === String(id))

// a short hash of what the control plane would send for an API: its policies in order, upstream and contracts
const hash = (text) => {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0
  return h.toString(36)
}
const appsOf = (s, api) =>
  api.contracts.map((c) => {
    const client = (s.clients ?? []).find((x) => x.name === c.client)
    return { name: c.client, clientId: client?.clientId ?? '', clientSecret: client?.clientSecret ?? '', tier: c.tier, contract: c.status }
  })
const sigOf = (s, api) => hash(JSON.stringify([api.policies.map((p) => [p.id, p.type, p.settings]), api.upstream, api.basePath, api.port, appsOf(s, api)]))

// The configuration version in the control plane. A change in API Manager is a new version at once.
export function latestOf(s, api) {
  const l = s.flex?.latest?.[api.id]
  if (!l) return { v: 1, sig: sigOf(s, api), t: s.clock }
  const sig = sigOf(s, api)
  return sig === l.sig ? l : { v: l.v + 1, sig, t: s.clock }
}
export const appliedOf = (s, gw, api) => gatewayOf(s, gw)?.applied?.[api.id] ?? null
export const inSync = (s, api) => {
  const a = appliedOf(s, api.gateway, api)
  return Boolean(a) && a.sig === latestOf(s, api).sig
}

// API Manager hook: the status of an instance whose runtime is Flex Gateway
export function flexApiStatus(s, api) {
  const gw = gatewayOf(s, api.gateway)
  if (!gw?.applied?.[api.id]) return api.seen ? 'Inactive' : 'Unregistered'
  return gw.status === 'Connected' ? 'Active' : 'Inactive'
}

const hostMatch = (pattern, host) => {
  const p = String(pattern ?? '').trim().toLowerCase()
  const h = host.toLowerCase()
  return p === 'any' || p === h || (p.startsWith('*.') && h.endsWith(p.slice(1)))
}
const portMatch = (rule, port) => rule.port === 'any' || String(rule.port).trim().toLowerCase() === 'any' || Number(rule.port) === Number(port)
// What the data center firewall does with one outbound connection of the gateway hosts
export function egressVerdict(gw, host, port) {
  const i = (gw?.egress ?? []).findIndex((r) => hostMatch(r.dest, host) && portMatch(r, port))
  if (i < 0) return { allowed: false, rule: null, text: 'No rule matches. The default rule denies it.' }
  const r = gw.egress[i]
  return { allowed: r.action === 'Allow', rule: i, text: `Rule ${i + 1}: ${r.action} ${r.dest}:${r.port}` }
}
export const controlChecks = (gw) => CONTROL_HOSTS.map((host) => ({ host, port: 443, ...egressVerdict(gw, host, 443) }))
export const reachesControlPlane = (gw) => gw.service === 'active' && controlChecks(gw).every((c) => c.allowed)

const urlParts = (url) => {
  const m = String(url ?? '').match(/^(https?):\/\/([^/:]+)(?::(\d+))?(\/.*)?$/)
  return m ? { scheme: m[1], host: m[2], port: Number(m[3] ?? (m[1] === 'https' ? 443 : 80)), path: m[4] ?? '' } : null
}

// ---------- the agent: heartbeat and configuration sync ----------

const say = (gw, now, level, text) => {
  gw.log.push({ t: now, level, text })
  if (gw.log.length > MAX_LOG) gw.log.splice(0, gw.log.length - MAX_LOG)
}

// the control plane side: every change in API Manager is a new version
function bumpLatest(s) {
  s.flex.latest ??= {}
  for (const api of (s.apis ?? []).filter((a) => a.runtime === FLEX_RUNTIME)) s.flex.latest[api.id] = latestOf(s, api)
}

function pull(s, gw) {
  for (const api of apisOn(s, gw.name)) {
    const l = s.flex.latest[api.id]
    const had = gw.applied[api.id]
    if (had?.sig === l.sig) continue
    gw.applied[api.id] = { v: l.v, sig: l.sig, t: s.clock, policies: structuredClone(api.policies), apps: appsOf(s, api), upstream: api.upstream, basePath: api.basePath, port: api.port }
    say(gw, s.clock, 'info', `[flex-gateway-agent][info] Applied configuration version ${l.v} of API ${api.name} (${api.id}): ${api.policies.length} polic${api.policies.length === 1 ? 'y' : 'ies'}.`)
  }
}

// One heartbeat of a gateway: connect, or stay disconnected with the last configuration
function beat(s, gw, now, force) {
  if (gw.mode !== 'Connected') return
  if (reachesControlPlane(gw)) {
    if (gw.status !== 'Connected') {
      gw.status = 'Connected'
      gw.since = now
      say(gw, now, 'info', `[flex-gateway-agent][info] Connected to the Anypoint control plane at ${CONTROL_HOSTS[0]}:443. Gateway ${gw.name} is registered in ${gw.env}.`)
    }
    gw.lastSeen = now
    for (const r of gw.replicas) r.seen = now
    pull(s, gw)
    return
  }
  const blocked = controlChecks(gw).find((c) => !c.allowed)
  const why = gw.service !== 'active' ? 'the flex-gateway service is stopped' : `dial tcp ${blocked.host}:443: i/o timeout`
  if (gw.status === 'Connected') {
    gw.status = 'Disconnected'
    gw.since = now
    say(gw, now, 'error', `[flex-gateway-agent][error] Lost the connection to the control plane: ${why}. Serving with the last applied configuration.`)
  } else if (force || (now - gw.since) % (10 * MINUTE) === 0) {
    say(gw, now, 'warn', `[flex-gateway-agent][warn] Failed to connect to the control plane: ${why}. Retrying. Configuration changes are not received.`)
  }
}

function syncAll(s, force = false) {
  bumpLatest(s)
  for (const gw of Object.values(s.flex.gateways)) beat(s, gw, s.clock, force)
}

// ---------- requests ----------

const iso = (t) => new Date(BASE + t).toISOString()
const listOf = (text) => String(text ?? '').split(',').map((x) => x.trim()).filter(Boolean)

// What the JWT Validation policy of Flex makes of a token, as a token kind of the policy engine and a reason
export function jwtVerdict(settings, jwt) {
  const tok = typeof jwt === 'string' ? JWTS[jwt] : jwt
  if (!tok) return { token: 'none' }
  const url = String(settings?.jwksUrl ?? '').trim()
  const keys = JWKS[url]
  if (!keys) return { token: 'bad-signature', why: `jwks:${url || '(empty)'}` }
  if (!keys.includes(tok.kid)) return { token: 'bad-signature', why: `kid:${tok.kid}` }
  // lab made: the engine has no audience case, so a wrong audience is its failed claim (401 as well)
  if (settings.validateAud !== 'No' && !listOf(settings.audiences).includes(tok.aud)) return { token: 'missing-claim', why: `aud:${tok.aud}` }
  return { token: 'valid' }
}
export const WHY_TEXT = (why, settings) => {
  const [kind, value] = String(why ?? '').split(/:(.*)/)
  if (kind === 'jwks') return `jwt-validation-flex: could not get a key set from JWKS Url ${value}. The token signature cannot be checked.`
  if (kind === 'kid') return `jwt-validation-flex: JWT signature validation failed. No key with kid "${value}" in the key set of ${settings?.jwksUrl ?? 'the JWKS Url'}.`
  if (kind === 'aud') return `jwt-validation-flex: JWT claim validation failed. aud "${value}" is not one of the Audience Claim Values (${settings?.audiences || 'none'}).`
  return ''
}
const ENVOY = {
  refused: { status: 503, flag: 'UF', body: 'upstream connect error or disconnect/reset before headers. reset reason: connection failure' },
  firewall: { status: 503, flag: 'UF', body: 'upstream connect error or disconnect/reset before headers. reset reason: connection failure' },
  slow: { status: 504, flag: 'UT', body: 'upstream request timeout' },
  protocol: { status: 502, flag: 'UPE', body: 'upstream connect error or disconnect/reset before headers. reset reason: protocol error' },
}
const REJECT_BODY = { 400: '{"error":"Bad Request","message":"Token was not provided"}', 401: '{"error":"Unauthorized"}', 403: '{"error":"Forbidden"}', 429: '{"error":"Too Many Requests"}' }
const newRuntime = () => ({ windows: {}, spike: {}, served: 0 })

// One request through a gateway. send is the policy engine's send(config, runtime, request, now).
function serve(s, send, gw, api, req, now) {
  const done = (r) => {
    s.flex.calls.push({ t: now, g: gw.name, a: api.id, m: req.method ?? 'GET', p: `${api.basePath}${req.path ?? '/'}`.replace(/\/\//g, '/'), s: r.status, f: r.flag ?? '-', ms: r.ms ?? 2, ip: req.ip ?? '10.20.1.50', c: req.client ?? '', ...(r.pol && { pol: r.pol }), ...(r.why && { why: r.why }), ...(req.ua && { ua: req.ua }) })
    const max = s.flex.maxCalls ?? MAX_CALLS
    if (s.flex.calls.length > max) s.flex.calls.splice(0, s.flex.calls.length - max)
    return { status: r.status, body: r.body ?? '', flag: r.flag ?? '-', trace: r.trace ?? [], headers: r.headers ?? [], why: r.why ? WHY_TEXT(r.why, r.jwtSettings) : '', applied: gw.applied[api.id]?.v ?? null }
  }
  if (gw.service !== 'active') return done({ status: 0, body: 'Connection refused. The flex-gateway service is not running.', flag: 'DOWN' })
  const ap = gw.applied[api.id]
  if (!ap) return done({ status: 404, flag: 'NR', body: '' })
  const jwtPolicy = ap.policies.find((p) => p.type === 'jwt')
  const verdict = jwtPolicy ? jwtVerdict(jwtPolicy.settings, req.jwt) : { token: 'none' }
  const config = { policies: ap.policies, automated: [], tiers: [], apps: ap.apps, topology: { nodes: 1, mode: 'separate' } }
  const runtime = s.flex.runtimes?.[api.id] ?? newRuntime()
  const result = send(config, runtime, { method: req.method ?? 'GET', ip: req.ip ?? '10.20.1.50', clientId: req.clientId ?? '', clientSecret: req.clientSecret ?? '', basicUser: '', basicPassword: '', token: verdict.token, scopes: '', authServer: 'ok', path: req.path ?? '/', headers: req.headers ?? [], body: req.body ?? '' }, now)
  // the spike window of the engine keeps every accepted time; the lab keeps the last minute only
  for (const x of Object.values(result.runtime.spike ?? {})) x.accepted = x.accepted.filter((t) => t > now - MINUTE)
  s.flex.runtimes = { ...s.flex.runtimes, [api.id]: result.runtime }
  if (!result.reachedBackend) {
    const step = result.trace.at(-1)
    const jwtFailed = step?.policy === 'JWT Validation' && verdict.why
    return done({ status: result.status, body: REJECT_BODY[result.status] ?? '', pol: step?.policy, why: jwtFailed ? verdict.why : undefined, jwtSettings: jwtPolicy?.settings, trace: result.trace, headers: result.responseHeaders, ms: 1 })
  }
  const target = urlParts(ap.upstream)
  const up = s.flex.upstreams?.[ap.upstream] ?? { state: 'up', ms: 30 }
  const failure = !target ? 'refused' : !egressVerdict(gw, target.host, target.port).allowed ? 'firewall' : up.state !== 'up' ? up.state : null
  if (failure) return done({ ...ENVOY[failure], trace: result.trace, ms: failure === 'slow' ? 15000 : 3 })
  return done({ status: 200, body: `{"api":"${api.name}","path":"${req.path ?? '/'}","served_by":"${target.host}"}`, trace: result.trace, headers: result.responseHeaders, ms: (up.ms ?? 30) + 2 })
}

const findApi = (s, req) => apiOf(s, req.api) ?? apisOn(s, req.gateway ?? FLEX).find((a) => a.name === req.api)

// The test request of the Flex Gateway screen: { api, path, method, ip, clientId, clientSecret, client, jwt }
export function flexCall(state, send, req) {
  let response
  const next = edit(state, (s) => {
    const api = findApi(s, req)
    const gw = api && gatewayOf(s, api.gateway)
    response = gw ? serve(s, send, gw, api, req, s.clock) : { status: 0, body: 'No such API on a gateway.', flag: '-', trace: [], headers: [], why: '' }
    s.clock += 100
  })
  return { state: next, response }
}

// ---------- the minute tick ----------

// runs once a lab minute while state.flex exists; a placeholder does nothing until the console fills it
export function flexTick(s, send) {
  if (!s.flex?.gateways) return s
  syncAll(s)
  if (!send) return s
  const t = s.clock
  const calls = []
  for (const f of s.flex.traffic ?? []) {
    if (f.every && (t / MINUTE) % f.every !== 0) continue
    const client = (s.clients ?? []).find((c) => c.name === f.client)
    for (let i = 0; i < f.n; i++) calls.push({ at: Math.floor((i * MINUTE) / f.n), f, client })
  }
  calls.sort((a, b) => a.at - b.at)
  for (const { at, f, client } of calls) {
    const api = apiOf(s, f.api)
    const gw = api && gatewayOf(s, api.gateway)
    if (gw) serve(s, send, gw, api, { method: f.method ?? 'GET', path: f.path ?? '/', ip: f.ip, client: f.client ?? '', clientId: client?.clientId ?? f.clientId ?? '', clientSecret: client?.clientSecret ?? '', jwt: f.jwt, ua: f.ua }, t + at)
  }
  return s
}

// ---------- actions ----------

export const DEST_RULE = /^(any|\*\.[a-z0-9.-]+|[a-z0-9.-]+)$/i
export function addEgressRule(state, name, rule) {
  const errors = []
  const dest = String(rule.dest ?? '').trim()
  const port = String(rule.port ?? '').trim().toLowerCase()
  if (!DEST_RULE.test(dest)) errors.push('Destination must be any, a host name or *.domain.')
  if (!(port === 'any' || (/^\d+$/.test(port) && Number(port) > 0 && Number(port) < 65536))) errors.push('Port must be a number from 1 to 65535, or any.')
  if (!['Allow', 'Deny'].includes(rule.action)) errors.push('Action must be Allow or Deny.')
  if (errors.length) return { state, errors }
  return {
    errors,
    state: edit(state, (s) => {
      const gw = s.flex.gateways[name]
      const r = { dest: dest.toLowerCase(), port: port === 'any' ? 'any' : Number(port), action: rule.action, note: String(rule.note ?? '').trim(), t: s.clock }
      if (rule.top) gw.egress.unshift(r)
      else gw.egress.push(r)
    }),
  }
}
export const removeEgressRule = (state, name, index) => edit(state, (s) => void s.flex.gateways[name].egress.splice(index, 1))

// sudo systemctl restart flex-gateway on every replica. The agent connects at once if it can.
export const restartGateway = (state, name) =>
  edit(state, (s) => {
    const gw = s.flex.gateways[name]
    gw.service = 'active'
    say(gw, s.clock, 'info', `[flex-gateway-agent][info] flex-gateway ${gw.version} started on ${gw.replicas.map((r) => r.id).join(', ')}.`)
    bumpLatest(s)
    beat(s, gw, s.clock, true)
  })
export const stopGateway = (state, name) =>
  edit(state, (s) => {
    const gw = s.flex.gateways[name]
    gw.service = 'inactive'
    say(gw, s.clock, 'warn', `[flex-gateway-agent][warn] flex-gateway stopped on ${gw.replicas.map((r) => r.id).join(', ')}. Listeners closed.`)
  })
export const setUpstream = (state, url, patch) => edit(state, (s) => void (s.flex.upstreams = { ...s.flex.upstreams, [url]: { state: 'up', ms: 30, ...s.flex.upstreams?.[url], ...patch } }))

// ---------- what the screen prints ----------

const reqId = (c) => `${parseInt(hash(`${c.t}${c.p}${c.ip}`), 36).toString(16).padStart(8, '0').slice(0, 8)}-4c1e-4a2f-9b7d-${c.t.toString(16).padStart(12, '0').slice(-12)}`
// Envoy's default access log format, one line per request (lab: bytes are estimates)
export function accessLine(s, c) {
  const api = apiOf(s, c.a)
  const up = urlParts(api?.upstream)
  const reached = c.f === '-' && c.s === 200
  return `[${iso(c.t)}] "${c.m} ${c.p} HTTP/1.1" ${c.s} ${c.f} 0 ${c.s === 200 ? 96 : c.s >= 500 ? 91 : 24} ${c.ms} ${reached ? c.ms - 2 : '-'} "${c.ip}" "${c.ua ?? 'Java-http-client/17'}" "${reqId(c)}" "${api?.consumer ? urlParts(api.consumer)?.host : 'flex-dc.brightmart.example'}:${api?.port ?? 8081}" "${reached && up ? `${up.host}:${up.port}` : '-'}"`
}
// The lines of the Logs panel, newest first: access lines, the policy messages behind them, and the agent log
export function logLines(s, name, { kind = 'all', limit = 80 } = {}) {
  const gw = gatewayOf(s, name)
  if (!gw) return []
  const lines = []
  if (kind !== 'agent')
    for (const c of s.flex.calls.filter((x) => x.g === name)) {
      if (c.why) lines.push({ t: c.t, level: 'warn', text: `[flex-gateway-envoy][warn] ${WHY_TEXT(c.why, gw.applied[c.a]?.policies.find((p) => p.type === 'jwt')?.settings)}` })
      if (c.f !== '-' && c.f !== 'NR') lines.push({ t: c.t, level: 'error', text: `[flex-gateway-envoy][error] ${ENVOY[c.f === 'UT' ? 'slow' : c.f === 'UPE' ? 'protocol' : 'refused'].body}` })
      lines.push({ t: c.t, level: c.s >= 500 ? 'error' : c.s >= 400 ? 'warn' : 'info', text: accessLine(s, c), access: true })
    }
  if (kind !== 'access') lines.push(...gw.log)
  return lines.sort((a, b) => b.t - a.t).slice(0, limit)
}
export const callsOf = (s, apiId, from = -Infinity) => (s.flex?.calls ?? []).filter((c) => c.a === String(apiId) && c.t >= from)

export const installCommands = (name, platform) =>
  platform === 'Docker'
    ? [
        'docker pull mulesoft/flex-gateway',
        `docker run --entrypoint flexctl -u $UID \\\n  -v "$(pwd)":/registration mulesoft/flex-gateway \\\n  registration create --organization=${FLEX_ORG} \\\n  --token=${FLEX_TOKEN} \\\n  --output-directory=/registration \\\n  --connected=true \\\n  ${name}`,
        `docker run --rm \\\n  -v "$(pwd)":${CONF_DIR} \\\n  -p 8081:8081 \\\n  mulesoft/flex-gateway`,
      ]
    : [
        'curl -XGET https://flex-packages.anypoint.mulesoft.com/ubuntu/pubkey.gpg | sudo apt-key add -',
        'echo "deb https://flex-packages.anypoint.mulesoft.com/ubuntu $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/mulesoft.list',
        'sudo apt update && sudo apt install -y flex-gateway',
        `sudo flexctl registration create --organization=${FLEX_ORG} \\\n  --token=${FLEX_TOKEN} \\\n  --connected=true \\\n  --output-directory=${CONF_DIR} \\\n  ${name}`,
        'sudo systemctl start flex-gateway',
      ]

// The same API in Local Mode: declarative files in conf.d instead of API Manager (lab sketch of the policy config keys)
export function localYaml(api) {
  const name = (api.assetId || api.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const cfg = (p) => {
    const x = p.settings ?? {}
    if (p.type === 'rate-limit') return [`rateLimits:`, `  - maximumRequests: ${x.requests}`, `    timePeriodInMilliseconds: ${x.periodMs}`, `keySelector: "${x.identifier === '(not configured)' ? '' : x.identifier}"`]
    if (p.type === 'jwt') return [`jwtOrigin: bearerAuthenticationHeader`, `signingMethod: rsa`, `jwtKeyOrigin: jwks`, `jwksUrl: ${x.jwksUrl || '""'}`, `validateAudClaim: ${x.validateAud !== 'No'}`, `audClaimValues: [${listOf(x.audiences).map((a) => `"${a}"`).join(', ')}]`]
    if (p.type === 'client-id') return [`credentialsOriginHasHttpBasicAuthenticationHeader: customExpression`, `clientIdExpression: "#[attributes.headers['client_id']]"`, `clientSecretExpression: "#[attributes.headers['client_secret']]"`]
    if (p.type === 'ip-allow') return [`ipExpression: "#[attributes.headers['x-forwarded-for']]"`, `ips: [${listOf(x.list).map((a) => `"${a}"`).join(', ')}]`]
    return [`# settings as in API Manager`]
  }
  const head = [
    'apiVersion: gateway.mulesoft.com/v1alpha1',
    'kind: ApiInstance',
    'metadata:',
    `  name: ${name}`,
    'spec:',
    `  address: http://0.0.0.0:${api.port}${api.basePath}`,
    '  services:',
    '    upstream:',
    `      address: ${api.upstream}`,
  ]
  const bindings = api.policies.map((p, i) =>
    [
      '---',
      'apiVersion: gateway.mulesoft.com/v1alpha1',
      'kind: PolicyBinding',
      'metadata:',
      `  name: ${name}-${FLEX_CATALOG[p.type] ?? p.type}`,
      'spec:',
      '  targetRef:',
      '    kind: ApiInstance',
      `    name: ${name}`,
      '  policyRef:',
      '    kind: Extension',
      `    name: ${FLEX_CATALOG[p.type] ?? p.type}`,
      `  order: ${i + 1}`,
      '  config:',
      ...cfg(p).map((l) => `    ${l}`),
    ].join('\n'),
  )
  return [head.join('\n'), ...bindings].join('\n')
}

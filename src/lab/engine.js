// Runs one simulated request through an API instance's policies, in order, on a virtual clock.
// Pure: send() returns the outcome and a new runtime, so the same input always gives the same result.
import { LDAP_DIRECTORY, policyByType } from './policies.js'

export const MAX_NODES = 4 // a lab limit, enough to show the effect
export const newRuntime = () => ({ windows: {}, spike: {}, served: 0 })
export const newTopology = () => ({ nodes: 1, mode: 'separate' })

// A step can be documented while one part of it is the lab's reading: that part goes in `assumption`.
const docs = (policy, outcome, detail, assumption) => ({ policy, outcome, detail, basis: 'docs', ...(assumption ? { assumption } : {}) })
const assumed = (policy, outcome, detail) => ({ policy, outcome, detail, basis: 'assumed' })

const splitList = (value) =>
  String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

function parseHeaders(value) {
  return splitList(value).flatMap((pair) => {
    const at = pair.indexOf(':')
    return at > 0 ? [[pair.slice(0, at).trim(), pair.slice(at + 1).trim()]] : []
  })
}

function ipToNumber(ip) {
  const parts = String(ip).trim().split('.')
  if (parts.length !== 4) return null
  const nums = parts.map(Number)
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null
  return nums.reduce((total, n) => total * 256 + n, 0)
}

export function ipMatches(ip, entry) {
  const [base, bits = '32'] = entry.split('/')
  const octets = base.split('.')
  // "192.168" states the leading octets of a range, as the IP Allowlist page shows
  if (!entry.includes('/') && octets.length < 4) return String(ip).trim().split('.').slice(0, octets.length).join('.') === base.trim()
  const a = ipToNumber(ip)
  const b = ipToNumber(base)
  const size = Number(bits)
  if (a === null || b === null || !Number.isInteger(size) || size < 0 || size > 32) return false
  const block = 2 ** (32 - size)
  return Math.floor(a / block) === Math.floor(b / block)
}

const headerValue = (headers, name) => headers.find(([k]) => k.toLowerCase() === name)?.[1]

function sourceIp(settings, request, headers) {
  if (settings.expression.includes('x-forwarded-for')) return (headerValue(headers, 'x-forwarded-for') ?? '').split(',')[0].trim()
  return request.ip
}

// Depth counts nested containers, matching the worked example on the JSON Threat Protection page.
export function jsonViolation(value, limits, depth = 1) {
  const over = (limit, actual) => limit >= 0 && actual > limit
  if (typeof value === 'string') return over(limits.stringLength, value.length) ? 'Maximum String Value Length' : null
  if (value === null || typeof value !== 'object') return null
  if (over(limits.depth, depth)) return 'Maximum Container Depth'
  if (Array.isArray(value)) {
    if (over(limits.elements, value.length)) return 'Maximum Array Element Count'
    for (const item of value) {
      const found = jsonViolation(item, limits, depth + 1)
      if (found) return found
    }
    return null
  }
  const entries = Object.entries(value)
  if (over(limits.entries, entries.length)) return 'Maximum Object Entry Count'
  for (const [key, item] of entries) {
    if (over(limits.nameLength, key.length)) return 'Maximum Object Entry Name Length'
    const found = jsonViolation(item, limits, depth + 1)
    if (found) return found
  }
  return null
}

export const XML_MALFORMED = 'malformed'
const XML_TAG = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/y
const XML_ATTRIBUTE = /([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

// Returns the name of the first limit broken, XML_MALFORMED, or null. The root element is depth 1, children are child
// elements, text is counted without surrounding space, and each comment on its own: the page does not define these.
export function xmlViolation(text, limits) {
  const over = (limit, actual) => limit >= 0 && actual > limit
  const open = []
  let at = 0
  let rootSeen = false
  const textNode = (value) => (over(limits.textLength, value.length) ? 'Maximum Text Length' : null)

  while (at < text.length) {
    if (text.startsWith('<!--', at)) {
      const end = text.indexOf('-->', at)
      if (end < 0) return XML_MALFORMED
      if (over(limits.commentLength, end - at - 4)) return 'Maximum Comment Length'
      at = end + 3
    } else if (text.startsWith('<![CDATA[', at)) {
      const end = text.indexOf(']]>', at)
      if (end < 0 || open.length === 0) return XML_MALFORMED
      const found = textNode(text.slice(at + 9, end))
      if (found) return found
      at = end + 3
    } else if (text.startsWith('<?', at) || text.startsWith('<!', at)) {
      const end = text.indexOf('>', at)
      if (end < 0) return XML_MALFORMED
      at = end + 1
    } else if (text[at] === '<') {
      XML_TAG.lastIndex = at
      const tag = XML_TAG.exec(text)
      if (!tag) return XML_MALFORMED
      const [whole, closing, name, attributeText, selfClosing] = tag
      at += whole.length
      if (closing) {
        if (open.pop()?.name !== name) return XML_MALFORMED
        continue
      }
      if (open.length === 0 && rootSeen) return XML_MALFORMED
      rootSeen = true
      if (over(limits.depth, open.length + 1)) return 'Maximum Node Depth'
      const parent = open.at(-1)
      if (parent && over(limits.children, ++parent.children)) return 'Maximum Child Count'
      const attributes = [...attributeText.matchAll(XML_ATTRIBUTE)].filter(([, key]) => key !== 'xmlns' && !key.startsWith('xmlns:'))
      if (over(limits.attributes, attributes.length)) return 'Maximum Attribute Count Per Element'
      if (attributes.some(([, , double, single]) => over(limits.attributeLength, (double ?? single).length))) return 'Maximum Attribute Length'
      if (!selfClosing) open.push({ name, children: 0 })
    } else {
      const next = text.indexOf('<', at)
      const value = text.slice(at, next < 0 ? text.length : next).trim()
      at = next < 0 ? text.length : next
      if (value && open.length === 0) return XML_MALFORMED
      const found = textNode(value)
      if (found) return found
    }
  }
  return rootSeen && open.length === 0 ? null : XML_MALFORMED
}

// One level means entries directly under the base. Subtree also covers the base level and everything below.
export function ldapFind(settings, username) {
  const base = String(settings.searchBase ?? '').trim().toLowerCase()
  const inScope = ({ dn }) => {
    const name = dn.toLowerCase()
    if (settings.subtree === 'Yes') return name === base || name.endsWith(`,${base}`)
    return name.slice(name.indexOf(',') + 1) === base
  }
  if (settings.filter !== '(uid={0})') return null // the sample directory has no sAMAccountName attribute
  return LDAP_DIRECTORY.find((entry) => entry.uid === username && inScope(entry)) ?? null
}

export const topologyOf = (config) => {
  const { nodes, mode } = { ...newTopology(), ...config.topology }
  return { nodes: Math.min(Math.max(Math.trunc(nodes) || 1, 1), MAX_NODES), mode }
}

// The order on Mule Gateway: CORS first, then automated policies, then API level policies.
// An automated policy has priority over an API level policy of the same type, which stays disabled while it exists.
export function effectivePolicies(config) {
  const automated = (config.automated ?? []).map((p) => ({ ...p, level: 'automated' }))
  const types = new Set(automated.map((p) => p.type))
  const live = config.policies.filter((p) => !types.has(p.type)).map((p) => ({ ...p, level: 'api' }))
  const all = [...automated, ...live]
  return {
    chain: [...all.filter((p) => p.type === 'cors'), ...all.filter((p) => p.type !== 'cors')],
    overridden: config.policies.filter((p) => types.has(p.type)),
  }
}

function resourceMatches(path, resource) {
  if (!String(resource ?? '').trim()) return true
  try {
    return new RegExp(`^(?:${resource})$`).test(path)
  } catch {
    return false
  }
}

// No conditions means the whole API. CORS is the one policy that is never resource-level.
export function conditionsMatch(applied, request) {
  const conditions = applied.conditions ?? []
  if (conditions.length === 0 || policyByType.get(applied.type).resourceLevel === false) return true
  return conditions.some((c) => (c.methods.length === 0 || c.methods.includes(request.method)) && resourceMatches(request.path ?? '/', c.resource))
}

function credentials(settings, request) {
  return settings.origin === 'HTTP Basic Authentication Header'
    ? { id: request.basicUser, secret: request.basicPassword }
    : { id: request.clientId, secret: request.clientSecret }
}

// Returns { contract } or { reject: step } for the credentials sent.
function findContract(name, settings, config, id, secret, contractNote) {
  if (!id) return { reject: docs(name, 'reject', 'No client ID in the request.') }
  const app = config.apps.find((a) => a.clientId === id)
  if (!app) return { reject: docs(name, 'reject', `Client ID ${id} is not a known client application.`) }
  if (settings.secret === 'Required' && app.clientSecret !== secret) {
    return { reject: docs(name, 'reject', 'The client secret does not match.') }
  }
  if (app.contract !== 'approved') {
    return { reject: docs(name, 'reject', `${app.name} has no approved contract (${app.contract}).`, contractNote) }
  }
  return { app }
}

export const limitsOf = (settings) => [{ requests: settings.requests, periodMs: settings.periodMs }, ...(settings.extraLimits ?? [])]

// With several limits a request needs quota in all of them. Only an accepted request is counted.
function consume(ctx, applied, group, limits) {
  const shared = ctx.shared(applied.settings)
  const prefix = `${applied.id}:${shared ? 'shared' : `n${ctx.node}`}:${group}`
  const states = limits.map((limit, index) => {
    const key = `${prefix}#${index}`
    const current = ctx.runtime.windows[key]
    const live = current && ctx.now < current.start + limit.periodMs
    const win = live ? current : { start: ctx.now, used: 0, policy: applied.id, node: shared ? null : ctx.node, group, index, ...limit }
    ctx.runtime.windows[key] = win
    return { limit, win }
  })
  const blocked = states.find(({ limit, win }) => win.used >= limit.requests)
  if (!blocked) states.forEach(({ win }) => win.used++)
  const left = ({ limit, win }) => limit.requests - win.used
  const shown = blocked ?? states.reduce((tightest, state) => (left(state) < left(tightest) ? state : tightest))
  return {
    allowed: !blocked,
    several: limits.length > 1,
    limit: shown.limit.requests,
    remaining: left(shown),
    resetMs: shown.win.start + shown.limit.periodMs - ctx.now,
    periodMs: shown.limit.periodMs,
  }
}

const nodeNote = (ctx, settings) => (ctx.nodes > 1 ? `Node ${ctx.node}, ${ctx.shared(settings) ? 'quota shared by the cluster' : 'this node only'}: ` : '')

function limitHeaders(expose, limit, win) {
  return expose === 'Yes'
    ? [
        ['X-Ratelimit-Remaining', String(win.remaining)],
        ['X-Ratelimit-Limit', String(limit)],
        ['X-Ratelimit-Reset', String(win.resetMs)],
      ]
    : []
}

function spikeControl(runtime, id, settings, now) {
  const state = (runtime.spike[id] ??= { accepted: [], queued: [] })
  state.queued = state.queued.filter((at) => at > now)
  const hasQuota = (at) => state.accepted.filter((t) => t > at - settings.periodMs).length < settings.requests
  if (hasQuota(now)) {
    state.accepted.push(now)
    return { delay: 0 }
  }
  if (state.queued.length >= settings.queueLimit) return { queueFull: true }
  for (let attempt = 1; attempt <= settings.attempts; attempt++) {
    const at = now + attempt * settings.delayMs
    if (hasQuota(at)) {
      state.accepted.push(at)
      state.queued.push(at)
      return { delay: at - now }
    }
  }
  state.queued.push(now + settings.attempts * settings.delayMs)
  return { rejected: true, delay: settings.attempts * settings.delayMs }
}

function corsHeaders(settings, request, origin, requested) {
  const isPublic = settings.publicResource !== 'No'
  const origins = splitList(settings.origins)
  if (!origin || (!isPublic && !origins.includes('*') && !origins.includes(origin))) return []
  const credentialsHeader = settings.credentials === 'Yes' ? [['Access-Control-Allow-Credentials', 'true']] : []
  const allowOrigin = [['Access-Control-Allow-Origin', origin], ...credentialsHeader]
  if (request.method !== 'OPTIONS') {
    return settings.expose && !isPublic ? [...allowOrigin, ['Access-Control-Expose-Headers', settings.expose]] : allowOrigin
  }
  const listed = (name, value) => (value ? [[name, value]] : [])
  if (isPublic) {
    return [...allowOrigin, ...listed('Access-Control-Allow-Methods', requested.method), ...listed('Access-Control-Allow-Headers', requested.headers)]
  }
  return [
    ...allowOrigin,
    ...listed('Access-Control-Allow-Methods', settings.methods),
    ...listed('Access-Control-Allow-Headers', settings.headers),
    ...listed('Access-Control-Max-Age', String(settings.maxAge ?? '')),
  ]
}

// The Fetch standard the CORS page cites: a browser does not check these against Access-Control-Allow-Methods.
const SAFELISTED_METHODS = ['get', 'head', 'post']

// What a browser does with the answer. The policy never rejects: the browser is what enforces CORS.
function browserVerdict(request, sent, responseHeaders) {
  const origin = headerValue(sent, 'origin')
  if (!origin) return null
  const allowed = (name) => splitList(headerValue(responseHeaders, name)).map((v) => v.toLowerCase())
  if (!headerValue(responseHeaders, 'access-control-allow-origin')) return 'blocked'
  if (request.method !== 'OPTIONS') return 'allowed'
  const method = headerValue(sent, 'access-control-request-method')?.toLowerCase()
  const headers = splitList(headerValue(sent, 'access-control-request-headers'))
  const methods = allowed('access-control-allow-methods')
  const names = allowed('access-control-allow-headers')
  if (method && !SAFELISTED_METHODS.includes(method) && !methods.includes(method)) return 'blocked'
  return names.includes('*') || headers.every((h) => names.includes(h.toLowerCase())) ? 'allowed' : 'blocked'
}

const LOG_VALUES = {
  '#[attributes.method]': (ctx) => ctx.request.method,
  '#[attributes.requestPath]': (ctx) => ctx.request.path ?? '/',
  '#[attributes.remoteAddress]': (ctx) => ctx.request.ip,
  '#[attributes.headers]': (ctx) => ctx.headers.map(([k, v]) => `${k}=${v}`).join(', ') || '(no headers)',
}

function logConditionMet(settings, request) {
  if (settings.conditional === "#[attributes.method == 'POST']") return request.method === 'POST'
  if (settings.conditional === "#[attributes.method != 'GET']") return request.method !== 'GET'
  return true
}

// Mule format without the date and thread name: <level> <category>: <message>
function writeLog(ctx, applied, phase, basis) {
  const { settings, id } = applied
  if (!logConditionMet(settings, ctx.request) || settings.level === 'DEBUG') return false
  const category = settings.category?.trim() || `org.mule.runtime.logging.policy-${id}`
  ctx.appLog.push({ phase, basis, text: `${settings.level} ${category}: ${LOG_VALUES[settings.message](ctx)}` })
  return true
}

// Headers the Header Injection page says are overwritten instead of gaining a second value.
const OVERWRITTEN_HEADERS = new Set(['access-control-allow-origin', 'content-type', 'content-length', 'transfer-encoding'])
// Headers the Header Removal page says may not be removed.
const FIXED_HEADERS = new Set(['user-agent', 'accept', 'host', 'content-type', 'content-length', 'date', 'transfer-encoding', 'connection'])

function injectHeaders(headers, added) {
  const replaced = new Set(added.map(([k]) => k.toLowerCase()).filter((k) => OVERWRITTEN_HEADERS.has(k)))
  return [...headers.filter(([k]) => !replaced.has(k.toLowerCase())), ...added]
}

const XML_COUNTING = 'The page does not define the counting. The lab takes the root element as depth 1, counts child elements only, and measures each comment and text node on its own.'

const JWT_FAILURES = {
  expired: ['The exp claim failed validation.', 'docs'],
  'bad-signature': ['The signature was not validated.', 'docs'],
  'missing-claim': ['A required claim is not present.', 'docs'],
  malformed: ['The token could not be parsed.', 'docs'],
}

function runPolicy(applied, ctx) {
  const { config, request, now, runtime } = ctx
  const { id, type, settings } = applied
  const name = policyByType.get(type).name

  switch (type) {
    case 'cors': {
      const origin = headerValue(ctx.headers, 'origin')
      const requested = { method: headerValue(ctx.headers, 'access-control-request-method'), headers: headerValue(ctx.headers, 'access-control-request-headers') }
      const added = corsHeaders(settings, request, origin, requested)
      ctx.responseHeaders.push(...added)
      if (request.method === 'OPTIONS') {
        ctx.statusBasis = 'assumed'
        const answer = added.length ? 'with CORS headers' : `without CORS headers, because ${origin ? 'the origin is not accepted' : 'there is no Origin header'}`
        return { status: 200, step: docs(name, 'pass', `Every OPTIONS request is a preflight, so it does not reach the protected resource. Answered ${answer}.`, 'The lab also stops every later policy here, so none of them sees the preflight.') }
      }
      if (!origin) return { step: docs(name, 'pass', 'No Origin header, so no CORS headers are added.') }
      if (added.length) return { step: docs(name, 'pass', `Origin ${origin} is accepted. CORS headers are added to the response.`) }
      return { step: assumed(name, 'pass', `Origin ${origin} is not accepted. The request carries on, and the response has no CORS headers.`) }
    }
    case 'client-id': {
      const { id: clientId, secret } = credentials(settings, request)
      const found = findContract(name, settings, config, clientId, secret)
      if (found.reject) {
        ctx.responseHeaders.push(['WWW-Authenticate', settings.origin === 'HTTP Basic Authentication Header' ? 'Basic realm="mule-realm"' : 'Client-ID-Enforcement'])
        return { status: 401, step: found.reject }
      }
      return { step: docs(name, 'pass', `${found.app.name} is allowed.`) }
    }
    case 'rate-limit': {
      const group = { '#[attributes.method]': request.method, "#[attributes.headers['client_id']]": request.clientId ?? '' }[settings.identifier] ?? ''
      const win = consume(ctx, applied, group, limitsOf(settings))
      ctx.responseHeaders.push(...limitHeaders(settings.expose, win.limit, win))
      const label = group ? `group "${group}"` : settings.identifier === '(not configured)' ? 'all requests' : 'the empty group, which has its own quota'
      const note = nodeNote(ctx, settings)
      const within = win.several ? ` on the limit of ${win.limit} per ${win.periodMs} ms` : ''
      if (!win.allowed) {
        const detail = `${note}Quota used for ${label}${within}. New window in ${win.resetMs} ms.`
        return { status: 429, step: docs(name, 'reject', detail, win.several ? 'The other limits do not count a rejected request.' : undefined) }
      }
      const shownLimit = win.several && settings.expose === 'Yes' ? 'With several limits, the X-Ratelimit headers report the one closest to running out.' : undefined
      return { step: docs(name, 'pass', `${note}${win.remaining} of ${win.limit} left for ${label}${within}.`, shownLimit) }
    }
    case 'rate-limit-sla': {
      const clientId = settings.clientIdExpression === '#[authentication.principal]' ? ctx.principal : request.clientId
      const found = findContract(name, settings, config, clientId, request.clientSecret, 'The page says a client without a contract is rejected. It does not give the status for that case, so the 401 is the lab reading.')
      if (found.reject) return { status: 401, step: found.reject }
      const tier = config.tiers.find((t) => t.name === found.app.tier)
      if (!tier) return { status: 401, step: assumed(name, 'reject', `${found.app.name} has no SLA tier.`) }
      const win = consume(ctx, applied, found.app.clientId, [{ requests: tier.requests, periodMs: tier.periodMs }])
      ctx.responseHeaders.push(...limitHeaders(settings.expose, tier.requests, win))
      const note = nodeNote(ctx, settings)
      if (!win.allowed) return { status: 429, step: docs(name, 'reject', `${note}${tier.name} tier quota used. New window in ${win.resetMs} ms.`) }
      return { step: docs(name, 'pass', `${note}${win.remaining} of ${tier.requests} left on the ${tier.name} tier.`) }
    }
    case 'spike': {
      // the policy protects one gateway instance, so each node has its own window
      const result = spikeControl(runtime, ctx.nodes > 1 ? `${id}:n${ctx.node}` : id, settings, now)
      if (result.queueFull) return { status: 429, step: assumed(name, 'reject', 'The queue is at its Queuing Limit.') }
      ctx.latency += result.delay ?? 0
      if (result.rejected) return { status: 429, step: docs(name, 'reject', `Still no quota after ${settings.attempts} delay attempt(s).`) }
      return { step: docs(name, 'pass', result.delay ? `Queued ${result.delay} ms, then accepted.` : 'Quota available, no delay.') }
    }
    case 'ip-allow':
    case 'ip-block': {
      const ip = sourceIp(settings, request, ctx.headers)
      const listed = splitList(settings.list).some((entry) => ipMatches(ip, entry))
      const blocked = type === 'ip-allow' ? !listed : listed
      const shown = ip || 'no address'
      if (blocked) return { status: 403, step: docs(name, 'reject', `${shown} is rejected.`) }
      return { step: docs(name, 'pass', `${shown} is accepted.`) }
    }
    case 'basic-auth': {
      if (request.basicUser === settings.username && request.basicPassword === settings.password) {
        return { step: docs(name, 'pass', 'The username and password match.') }
      }
      ctx.responseHeaders.push(['WWW-Authenticate', 'Basic realm="mule-realm"'])
      return { status: 401, step: docs(name, 'reject', 'Missing or wrong username or password.', 'The page says a WWW-Authenticate header is returned. The value is taken from the LDAP page.') }
    }
    case 'basic-ldap': {
      const entry = request.basicUser ? ldapFind(settings, request.basicUser) : null
      if (entry && entry.password === request.basicPassword) return { step: docs(name, 'pass', `Found ${entry.dn} and the password matches.`) }
      ctx.responseHeaders.push(['WWW-Authenticate', 'Basic realm="mule-realm"'])
      const scope = settings.subtree === 'Yes' ? 'the subtree' : 'one level'
      const reason = !request.basicUser ? 'No credentials in the Authorization header.' : entry ? 'The password does not match.' : `No entry found searching ${scope} of ${settings.searchBase}.`
      return { status: 401, step: docs(name, 'reject', reason) }
    }
    case 'oidc': {
      if (request.token === 'none') return { status: 401, step: assumed(name, 'reject', 'No access token in the request.') }
      if (request.authServer === 'down') return { status: 401, step: docs(name, 'reject', 'Error when connecting to the authorization server.') }
      if (request.authServer === 'bad') return { status: 500, step: docs(name, 'reject', 'Bad response from the authorization server.') }
      if (request.token !== 'valid') return { status: 400, step: docs(name, 'reject', 'The validation endpoint reports an invalid token.') }
      const required = String(settings.scopes ?? '').split(/\s+/).filter(Boolean)
      const held = String(request.scopes ?? '').split(/\s+/).filter(Boolean)
      const scopesOk = required.length === 0 || (settings.criteria === 'Contains any scope' ? required.some((s) => held.includes(s)) : required.every((s) => held.includes(s)))
      if (!scopesOk) return { status: 403, step: assumed(name, 'reject', `The token has scopes "${held.join(' ')}" and the policy needs ${settings.criteria === 'Contains any scope' ? 'one of' : 'all of'} "${required.join(' ')}".`) }
      if (settings.skipClient !== 'Yes') {
        const app = config.apps.find((a) => a.clientId === request.clientId)
        if (app?.contract !== 'approved') return { status: 403, step: docs(name, 'reject', `Client ${request.clientId || '(none)'} has no contract for this API.`) }
      }
      ctx.principal = request.clientId
      if (settings.expose === 'Yes') ctx.headers.push(['X-AGW-uid', 'lab-user'], ['X-AGW-token_type', 'Bearer'])
      return { step: docs(name, 'pass', settings.skipClient === 'Yes' ? 'The token is valid. The contract check is skipped.' : 'The token is valid and its client application has a contract.') }
    }
    case 'jwt': {
      if (request.token === 'none') return { status: 400, step: docs(name, 'reject', 'Token was not provided in the request.') }
      const failure = JWT_FAILURES[request.token]
      if (failure) return { status: 401, step: docs(name, 'reject', failure[0]) }
      return { step: docs(name, 'pass', 'Signature and claims are valid.') }
    }
    case 'json-threat': {
      if (!request.body?.trim()) return { step: assumed(name, 'pass', 'No body to inspect.') }
      let parsed
      try {
        parsed = JSON.parse(request.body)
      } catch {
        return { step: assumed(name, 'pass', 'The body is not JSON, so no limit was checked.') }
      }
      const limit = jsonViolation(parsed, settings)
      if (limit) return { status: 400, step: docs(name, 'reject', `Over ${limit}.`) }
      return { step: docs(name, 'pass', 'The body is inside every limit.') }
    }
    case 'xml-threat': {
      const body = request.body?.trim()
      if (!body) return { step: assumed(name, 'pass', 'No body to inspect.') }
      if (!body.startsWith('<')) return { step: assumed(name, 'pass', 'The body is not XML, so no limit was checked.') }
      const limit = xmlViolation(body, settings)
      if (limit === XML_MALFORMED) return { status: 400, step: assumed(name, 'reject', 'The body is not well-formed XML.') }
      if (limit) return { status: 400, step: docs(name, 'reject', `Over ${limit}.`) }
      const limited = Object.values(settings).some((value) => value >= 0)
      return { step: docs(name, 'pass', 'The body is inside every limit.', limited ? XML_COUNTING : undefined) }
    }
    case 'message-log': {
      if (settings.before !== 'Yes') return { step: docs(name, 'pass', 'Not set to log before the API call.') }
      if (!logConditionMet(settings, request)) return { step: docs(name, 'pass', 'Nothing logged: the Conditional is not met.') }
      const logged = writeLog(ctx, applied, 'Before calling API', 'docs')
      return { step: logged ? docs(name, 'pass', 'Logged a message before the API call.') : assumed(name, 'pass', 'Nothing logged: DEBUG is below the INFO logger the lab assumes.') }
    }
    case 'header-inject': {
      const added = parseHeaders(settings.inbound)
      ctx.headers = injectHeaders(ctx.headers, added)
      const overwrites = added.some(([k]) => OVERWRITTEN_HEADERS.has(k.toLowerCase()))
      return { step: docs(name, 'pass', added.length ? `Added ${added.map(([k]) => k).join(', ')}. ${overwrites ? 'A header of this kind is overwritten, not added to.' : 'Existing values are kept.'}` : 'No inbound headers set.') }
    }
    case 'header-remove': {
      const patterns = splitList(settings.inbound)
      const before = ctx.headers.length
      ctx.headers = ctx.headers.filter(([k]) => !removable(k, patterns))
      return { step: docs(name, 'pass', `Removed ${before - ctx.headers.length} inbound header(s).`) }
    }
    default:
      return { step: assumed(name, 'pass', 'Not simulated.') }
  }
}

function matchesAny(header, patterns) {
  return patterns.some((p) => {
    try {
      return new RegExp(`^${p}$`, 'i').test(header)
    } catch {
      return p.toLowerCase() === header.toLowerCase()
    }
  })
}

const removable = (header, patterns) => !FIXED_HEADERS.has(header.toLowerCase()) && matchesAny(header, patterns)

// Response processing passes back through the policies that ran, last one first: <A1> → <B1> → <F1> → <B2> → <A2> on the custom policy page.
function applyOutbound(ran, ctx) {
  for (const applied of [...ran].reverse()) {
    if (applied.type === 'message-log' && applied.settings.after === 'Yes') writeLog(ctx, applied, 'After calling API', ctx.rejected ? 'assumed' : 'docs')
    if (applied.type === 'header-inject') ctx.responseHeaders = injectHeaders(ctx.responseHeaders, parseHeaders(applied.settings.outbound))
    if (applied.type === 'header-remove') {
      const patterns = splitList(applied.settings.outbound)
      ctx.responseHeaders = ctx.responseHeaders.filter(([k]) => !removable(k, patterns))
    }
  }
}

const skipped = (policy, detail) => ({ policy, outcome: 'skip', detail, basis: 'docs' })

export function send(config, runtime, request, now) {
  const { nodes, mode } = topologyOf(config)
  const next = structuredClone(runtime)
  const node = Math.min(request.node ?? (next.served % nodes) + 1, nodes)
  next.served++
  const ctx = {
    config,
    request,
    now,
    node,
    nodes,
    runtime: next,
    shared: (settings) => nodes === 1 || (mode === 'cluster' && settings.distributed === 'Yes'),
    headers: [...(request.headers ?? [])],
    responseHeaders: [],
    appLog: [],
    statusBasis: 'docs',
    latency: 0,
  }
  const sent = [...ctx.headers]
  const { chain, overridden } = effectivePolicies(config)
  const trace = overridden.map((p) => skipped(policyByType.get(p.type).name, 'Disabled: an automated policy of this type has priority.'))
  const ran = []
  let status = null
  for (const applied of chain) {
    if (!conditionsMatch(applied, request)) {
      trace.push({ ...skipped(policyByType.get(applied.type).name, 'Not applied: the request does not match its method and resource conditions.'), level: applied.level })
      continue
    }
    ran.push(applied)
    const result = runPolicy(applied, ctx)
    trace.push({ ...result.step, level: applied.level })
    if (result.status) {
      status = result.status
      break
    }
  }
  const reachedBackend = status === null
  if (reachedBackend) status = 200
  ctx.rejected = status >= 400
  applyOutbound(ran, ctx)
  return {
    status,
    statusBasis: ctx.statusBasis,
    trace,
    node,
    reachedBackend,
    latency: ctx.latency,
    backendHeaders: reachedBackend ? ctx.headers : [],
    responseHeaders: ctx.responseHeaders,
    browser: browserVerdict(request, sent, ctx.responseHeaders),
    appLog: ctx.appLog,
    runtime: ctx.runtime,
  }
}

const RATE_TYPES = new Set(['rate-limit', 'rate-limit-sla'])

// What each node has counted, for every rate limiting policy that is in force.
export function quotaView(config, runtime, now) {
  const { nodes, mode } = topologyOf(config)
  const windows = Object.values(runtime.windows)
  return effectivePolicies(config)
    .chain.filter((p) => RATE_TYPES.has(p.type))
    .map((applied) => {
      const shared = nodes === 1 || (mode === 'cluster' && applied.settings.distributed === 'Yes')
      const scopes = shared ? [null] : Array.from({ length: nodes }, (_, i) => i + 1)
      const mine = windows.filter((w) => w.policy === applied.id)
      const seen = new Map(mine.map((w) => [`${w.group}#${w.index}`, w]))
      if (seen.size === 0 && applied.type === 'rate-limit') {
        limitsOf(applied.settings).forEach((limit, index) => seen.set(`#${index}`, { ...limit, group: '', index }))
      }
      const rows = [...seen.values()].map(({ group, index, requests, periodMs }) => {
        const used = scopes.map((node) => {
          const win = mine.find((w) => w.group === group && w.index === index && w.node === node)
          return win && now < win.start + win.periodMs ? win.used : 0
        })
        return { group, requests, periodMs, used, total: used.reduce((a, b) => a + b, 0), ceiling: requests * scopes.length }
      })
      return { id: applied.id, policy: policyByType.get(applied.type).name, shared, scopes, rows }
    })
}

// Advice for the chosen nodes, taken from the Rate Limiting, Rate-Limiting SLA and Spike Control pages.
export function nodeNotes(config) {
  const { nodes, mode } = topologyOf(config)
  const { chain } = effectivePolicies(config)
  if (nodes === 1) return []
  const notes = []
  const add = (text) => notes.push({ text, basis: 'docs' })
  for (const applied of chain.filter((p) => RATE_TYPES.has(p.type))) {
    const name = policyByType.get(applied.type).name
    const on = applied.settings.distributed === 'Yes'
    if (on && mode !== 'cluster') add(`${name}: Distributed has no effect, because these nodes are not a Mule HA cluster. Each node enforces the quota on its own.`)
    if (!on && mode === 'cluster') add(`${name}: Distributed is off, so the cluster accepts the quota once per node.`)
    const periods = applied.type === 'rate-limit' ? limitsOf(applied.settings).map((l) => l.periodMs) : config.tiers.map((t) => t.periodMs)
    if (on && mode === 'cluster' && periods.some((ms) => ms <= 60000)) add(`${name}: use windows longer than one minute in a cluster. Sharing the count between nodes can add latency, and a small window suffers most.`)
  }
  if (chain.some((p) => p.type === 'spike')) add('Spike Control cannot be clustered. It protects one gateway instance, so each node has its own window.')
  return notes
}

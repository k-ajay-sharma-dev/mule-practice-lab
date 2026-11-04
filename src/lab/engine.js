// Runs one simulated request through an API instance's policies, in order, on a virtual clock.
// Pure: send() returns the outcome and a new runtime, so the same input always gives the same result.
import { policyByType } from './policies.js'

export const newRuntime = () => ({ windows: {}, spike: {} })

const docs = (policy, outcome, detail) => ({ policy, outcome, detail, basis: 'docs' })
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

function credentials(settings, request) {
  return settings.origin === 'HTTP Basic Authentication Header'
    ? { id: request.basicUser, secret: request.basicPassword }
    : { id: request.clientId, secret: request.clientSecret }
}

// Returns { contract } or { reject: step } for the credentials sent.
function findContract(name, settings, config, id, secret) {
  if (!id) return { reject: docs(name, 'reject', 'No client ID in the request.') }
  const app = config.apps.find((a) => a.clientId === id)
  if (!app) return { reject: docs(name, 'reject', `Client ID ${id} is not a known client application.`) }
  if (settings.secret === 'Required' && app.clientSecret !== secret) {
    return { reject: docs(name, 'reject', 'The client secret does not match.') }
  }
  if (app.contract !== 'approved') {
    return { reject: assumed(name, 'reject', `${app.name} has no approved contract (${app.contract}).`) }
  }
  return { app }
}

function fixedWindow(runtime, key, limit, periodMs, now) {
  const current = runtime.windows[key]
  const win = current && now < current.start + periodMs ? current : { start: now, used: 0 }
  runtime.windows[key] = win
  const allowed = win.used < limit
  if (allowed) win.used++
  return { allowed, remaining: limit - win.used, resetMs: win.start + periodMs - now }
}

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
  return { rejected: true }
}

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
    case 'client-id': {
      const { id: clientId, secret } = credentials(settings, request)
      const found = findContract(name, settings, config, clientId, secret)
      if (found.reject) return { status: 401, step: found.reject }
      return { step: docs(name, 'pass', `${found.app.name} is allowed.`) }
    }
    case 'rate-limit': {
      const group = { '#[attributes.method]': request.method, "#[attributes.headers['client_id']]": request.clientId ?? '' }[settings.identifier] ?? ''
      const win = fixedWindow(runtime, `${id}:${group}`, settings.requests, settings.periodMs, now)
      ctx.responseHeaders.push(...limitHeaders(settings.expose, settings.requests, win))
      const label = group ? `group "${group}"` : settings.identifier === '(not configured)' ? 'all requests' : 'the empty group, which has its own quota'
      if (!win.allowed) return { status: 429, step: docs(name, 'reject', `Quota used for ${label}. New window in ${win.resetMs} ms.`) }
      return { step: docs(name, 'pass', `${win.remaining} of ${settings.requests} left for ${label}.`) }
    }
    case 'rate-limit-sla': {
      const found = findContract(name, settings, config, request.clientId, request.clientSecret)
      if (found.reject) return { status: 401, step: found.reject }
      const tier = config.tiers.find((t) => t.name === found.app.tier)
      if (!tier) return { status: 401, step: assumed(name, 'reject', `${found.app.name} has no SLA tier.`) }
      const win = fixedWindow(runtime, `${id}:${found.app.clientId}`, tier.requests, tier.periodMs, now)
      ctx.responseHeaders.push(...limitHeaders(settings.expose, tier.requests, win))
      if (!win.allowed) return { status: 429, step: docs(name, 'reject', `${tier.name} tier quota used. New window in ${win.resetMs} ms.`) }
      return { step: docs(name, 'pass', `${win.remaining} of ${tier.requests} left on the ${tier.name} tier.`) }
    }
    case 'spike': {
      const result = spikeControl(runtime, id, settings, now)
      if (result.queueFull) return { status: 429, step: assumed(name, 'reject', 'The queue is at its Queuing Limit.') }
      if (result.rejected) return { status: 429, step: docs(name, 'reject', `Still no quota after ${settings.attempts} delay attempt(s).`) }
      ctx.latency += result.delay
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
      return { status: 401, step: docs(name, 'reject', 'Missing or wrong username or password.') }
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
    case 'header-inject': {
      const added = parseHeaders(settings.inbound)
      ctx.headers.push(...added)
      return { step: docs(name, 'pass', added.length ? `Added ${added.map(([k]) => k).join(', ')}. Existing values are kept.` : 'No inbound headers set.') }
    }
    case 'header-remove': {
      const patterns = splitList(settings.inbound)
      const before = ctx.headers.length
      ctx.headers = ctx.headers.filter(([k]) => !matchesAny(k, patterns))
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

// Response headers pass back through the policies that ran, last one first. The pages do not spell this order out.
function applyOutbound(ran, ctx) {
  for (const applied of [...ran].reverse()) {
    if (applied.type === 'header-inject') ctx.responseHeaders.push(...parseHeaders(applied.settings.outbound))
    if (applied.type === 'header-remove') {
      const patterns = splitList(applied.settings.outbound)
      ctx.responseHeaders = ctx.responseHeaders.filter(([k]) => !matchesAny(k, patterns))
    }
  }
}

export function send(config, runtime, request, now) {
  const ctx = {
    config,
    request,
    now,
    runtime: structuredClone(runtime),
    headers: [...(request.headers ?? [])],
    responseHeaders: [],
    latency: 0,
  }
  const trace = []
  const ran = []
  let status = null
  for (const applied of config.policies) {
    ran.push(applied)
    const result = runPolicy(applied, ctx)
    trace.push(result.step)
    if (result.status) {
      status = result.status
      break
    }
  }
  const reachedBackend = status === null
  if (reachedBackend) status = 200
  applyOutbound(ran, ctx)
  return {
    status,
    trace,
    reachedBackend,
    latency: ctx.latency,
    backendHeaders: reachedBackend ? ctx.headers : [],
    responseHeaders: ctx.responseHeaders,
    runtime: ctx.runtime,
  }
}

// HTTP details the simulator needs on both sides: matching a path to a listener or an endpoint, and the error type
// the HTTP Request operation raises for a status it does not accept.

// Splits "/orders/{id}?x=1" into its path segments, without the query string.
const segments = (path) =>
  String(path ?? '')
    .split('?')[0]
    .split('/')
    .filter(Boolean)

// Does a path template match an actual path? {name} matches one segment and a trailing * matches the rest.
// Returns the URI parameters it found, or null.
export function matchPath(template, actual) {
  const want = segments(template)
  const have = segments(actual)
  const params = {}
  for (let i = 0; i < want.length; i++) {
    const w = want[i]
    if (w === '*' && i === want.length - 1) return params
    if (i >= have.length) return null
    const m = w.match(/^\{(.+)\}$/) || w.match(/^\((.+)\)$/)
    if (m) params[m[1]] = decodeURIComponent(have[i])
    else if (w.toLowerCase() !== have[i].toLowerCase()) return null
  }
  return have.length === want.length ? params : null
}

// "GET, POST" or "" (every method) → does it allow this method?
export function allows(allowedMethods, method) {
  const list = String(allowedMethods ?? '')
    .split(/[,\s]+/)
    .map((m) => m.trim().toUpperCase())
    .filter(Boolean)
  return !list.length || list.includes(String(method).toUpperCase())
}

export function queryOf(path) {
  const q = String(path ?? '').split('?')[1]
  if (!q) return {}
  return Object.fromEntries(q.split('&').filter(Boolean).map((p) => p.split('=').map(decodeURIComponent)))
}

const REASONS = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  409: 'Conflict',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
}
export const reasonPhrase = (status) => REASONS[status] ?? ''

// The error type the HTTP Request operation raises for a failed status, as the HTTP connector names them.
const STATUS_ERRORS = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  406: 'NOT_ACCEPTABLE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_SERVER_ERROR',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
  504: 'GATEWAY_TIMEOUT',
}
export function statusErrorType(status) {
  if (STATUS_ERRORS[status]) return `HTTP:${STATUS_ERRORS[status]}`
  return status >= 500 ? 'HTTP:INTERNAL_SERVER_ERROR' : 'HTTP:BAD_REQUEST'
}

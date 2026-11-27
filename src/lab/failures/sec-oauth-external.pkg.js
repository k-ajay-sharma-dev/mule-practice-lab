// The sample application of the sec-oauth-external lab. Imports only platform-log.js, so the engine can load it without a cycle.
//
// The gateway of the lab sends no token to its OAuth and JWT policies, so supplier-invoices-api checks the access token
// itself, with properties named after fields of the JWT Validation policy: JWT Key Origin, JWKS URL, Validate Audience
// Claim, Validate Expiration Claim. The scope check for writes is a check in the flow. The API client of the lab has no
// Authorization header, so each client application stands for a caller that got its own token from the provider with the
// client credentials grant. Tokens, keys and the provider are fictional.
import { info, warn } from '../platform-log.js'

const MINUTE = 60000
const HOUR = 60 * MINUTE
const BASE = Date.UTC(2026, 10, 2) // the lab clock starts on Monday 2 November 2026, as in platform.js
const iso = (t) => new Date(BASE + t).toISOString().replace('.000', '')

export const ISSUER = 'https://auth.cobalt-id.lab'
export const TOKEN_URL = `${ISSUER}/oauth2/token`
export const JWKS_URL = `${ISSUER}/.well-known/jwks.json`
export const AUDIENCE = 'api://supplier-invoices'
export const READ = 'invoices:read'
export const WRITE = 'invoices:write'

export const CALLERS = {
  LEDGER: { name: 'Ledger Sync', clientId: 'ldg-61e0', clientSecret: 'ldg-secret-21' },
  REPORTING: { name: 'Reporting Job', clientId: 'rpt-3a7f', clientSecret: 'rpt-secret-58' },
  PAYMENTS: { name: 'Payments Bot', clientId: 'pay-8c12', clientSecret: 'pay-secret-90' },
  OLD: { name: 'Old Batch', clientId: 'old-05b9', clientSecret: 'old-secret-33' },
}

// The token each caller sends at a time: client credentials tokens that live one hour
export function tokenOf(client, now) {
  const iat = Math.floor(now / HOUR) * HOUR
  const fresh = { iss: ISSUER, iat, exp: iat + HOUR }
  switch (client) {
    case CALLERS.LEDGER.name:
      return { ...fresh, sub: CALLERS.LEDGER.clientId, aud: AUDIENCE, scope: `${READ} ${WRITE}` }
    case CALLERS.REPORTING.name:
      return { ...fresh, sub: CALLERS.REPORTING.clientId, aud: AUDIENCE, scope: READ }
    case CALLERS.PAYMENTS.name:
      // a token the provider issued for the payments API, not for this one
      return { ...fresh, sub: CALLERS.PAYMENTS.clientId, aud: 'api://payments', scope: 'payments:write' }
    case CALLERS.OLD.name:
      // a token kept in a file since Monday morning
      return { iss: ISSUER, iat: 8 * HOUR, exp: 9 * HOUR, sub: CALLERS.OLD.clientId, aud: AUDIENCE, scope: READ }
    default:
      return null
  }
}

const on = (v) => String(v ?? '').trim().toLowerCase() === 'true'
// The messages are the ones the JWT Validation policy page lists for 400 and 401
export const NO_TOKEN = 'Token was not provided in the request.'
export const BAD_CLAIMS = 'Some of the required claims are not present or their validation failed.'
const LOGGER = 'brightmart.security.oauth'

const claimsText = (t) => `sub=${t.sub} aud=${t.aud} scope="${t.scope}" exp=${iso(t.exp)}`

export const PACKAGES = {
  'supplier-invoices-api': {
    note: 'The supplier invoices API of Brightmart. It validates access tokens of the external provider itself, with properties named after the JWT Validation policy fields.',
    sample: { method: 'GET', path: '/invoices' },
    boot({ props }) {
      if (String(props['jwt.keyOrigin'] ?? '').trim().toUpperCase() !== 'JWKS') return 'jwt.keyOrigin must be JWKS: the provider publishes its keys at a JWKS URL.'
      if (String(props['jwt.jwksUrl'] ?? '').trim() !== JWKS_URL) return `Could not read the JWKS from '${props['jwt.jwksUrl'] || '(empty)'}'. The lab provider serves its key set at ${JWKS_URL}.`
      if (on(props['jwt.validateAudience']) && !String(props['jwt.audience'] ?? '').trim()) return 'jwt.validateAudience is true, but jwt.audience is empty.'
      return null
    },
    handle({ props, now }, req) {
      const path = String(req.path).split('?')[0]
      if (!/^\/invoices(\/INV-\d+)?$/.test(path)) return { status: 404, ms: 5, error: 'APIKIT:NOT_FOUND', flow: 'supplier-invoices-api-main', body: '{"message":"Resource not found"}' }
      const token = tokenOf(req.client, now)
      const reject = (status, message, detail, headers = []) => ({ status, ms: 4, error: 'SECURITY:UNAUTHORIZED', flow: 'supplier-invoices-api-main', headers, body: JSON.stringify({ error: message }), log: [warn(`Rejected with ${status}: ${message} ${detail}`, LOGGER)] })
      if (!token) return reject(400, NO_TOKEN, `Caller ${req.client || '(none)'} sent no Authorization header.`)
      const who = `Caller ${req.client}, ${claimsText(token)}.`
      if (on(props['jwt.validateExpiration'] ?? 'true') && now >= token.exp) return reject(401, BAD_CLAIMS, `${who} Claim exp is before the time of the request ${iso(now)}.`)
      const audience = String(props['jwt.audience'] ?? '').trim()
      if (on(props['jwt.validateAudience']) && token.aud !== audience) return reject(401, BAD_CLAIMS, `${who} Claim aud is not ${audience}.`)
      const write = !['GET', 'HEAD'].includes(req.method)
      const needed = String(props[write ? 'scope.write' : 'scope.read'] ?? '').trim()
      if (needed && !token.scope.split(' ').includes(needed)) {
        return { ...reject(403, 'insufficient_scope', `${who} ${req.method} needs scope ${needed}.`, [['WWW-Authenticate', `Bearer error="insufficient_scope", scope="${needed}"`]]), error: 'APP:FORBIDDEN' }
      }
      const log = [info(`Token accepted for ${req.method} ${path}. ${who}`, LOGGER)]
      if (req.method === 'POST') return { status: 201, ms: 70, flow: 'post:\\invoices:application\\json:supplier-invoices-api-config', body: '{"invoiceId":"INV-20419","status":"RECEIVED"}', log }
      if (write) return { status: 405, ms: 5, error: 'APIKIT:METHOD_NOT_ALLOWED', flow: 'supplier-invoices-api-main', body: '{"message":"Method not allowed"}', log }
      return { status: 200, ms: 60, flow: 'get:\\invoices:supplier-invoices-api-config', body: '[{"invoiceId":"INV-20411","supplier":"Bayline Produce","total":1840.5,"status":"APPROVED"}]', log }
    },
  },
}

// The sample application of the jwt-key-rotation lab. Imports only platform-log.js, so the engine can load it without a cycle.
//
// The JWT Validation policy of the lab's API Manager has no settings, so delivery-api checks the bearer token itself, with
// properties named after the fields of the real policy: JWT Signing Method, JWT Signing Key Length, JWT Key Origin (Text
// or JWKS), JWT Key, JWKS URL and JWKS Caching Time To Live. The API client of the lab has no Authorization header, so each
// client application stands for a caller that sends its own token. Keys and tokens here are fictional placeholders.
import { warn } from '../platform-log.js'

const MINUTE = 60000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const at = (days, hours = 0, minutes = 0) => days * DAY + hours * HOUR + minutes * MINUTE
const BASE = Date.UTC(2026, 10, 2) // the lab clock starts on Monday 2 November 2026, as in platform.js
const iso = (t) => new Date(BASE + t).toISOString().replace('.000', '')

export const OLD_KID = 'hf-2026-08'
export const NEW_KID = 'hf-2026-11'
// The identity provider published the new key in its JWKS on Monday 07:00 and signs with it from Tuesday 07:00
export const PUBLISHED = at(0, 7)
export const ROTATED = at(1, 7)
export const JWKS_URL = 'https://idp.brightmart.lab/.well-known/jwks.json'
// What a team pasted into the JWT Key field: the RSA public key without header and footer. A placeholder, not a key.
export const OLD_KEY_TEXT = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA.lab.placeholder.not.a.real.key.hf0812'
export const NEW_KEY_TEXT = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA.lab.placeholder.not.a.real.key.hf1126'
const KID_OF_TEXT = { [OLD_KEY_TEXT]: OLD_KID, [NEW_KEY_TEXT]: NEW_KID }

export const CALLERS = {
  DRIVER: { name: 'Driver App', clientId: 'drv-30a1', clientSecret: 'drv-secret-08' },
  KIOSK: { name: 'Store Kiosk', clientId: 'ksk-77d4', clientSecret: 'ksk-secret-31' },
  OLD: { name: 'Old Test Script', clientId: 'tst-0c19', clientSecret: 'tst-secret-52' },
  FORGED: { name: 'Unknown Signer', clientId: 'unk-9b6e', clientSecret: 'unk-secret-70' },
}

const kidAt = (iat) => (iat >= ROTATED ? NEW_KID : OLD_KID)
// The token each caller sends at a time. signer is the key that really signed it.
export function tokenOf(client, now) {
  switch (client) {
    case CALLERS.DRIVER.name: {
      // asks for a new token every hour, valid for one hour
      const iat = Math.floor(now / HOUR) * HOUR
      return { kid: kidAt(iat), signer: kidAt(iat), iat, exp: iat + HOUR }
    }
    case CALLERS.KIOSK.name: {
      // keeps a token for four hours: 02:30, 06:30, 10:30 and so on
      const iat = Math.floor((now - 2.5 * HOUR) / (4 * HOUR)) * 4 * HOUR + 2.5 * HOUR
      return { kid: kidAt(iat), signer: kidAt(iat), iat, exp: iat + 4 * HOUR }
    }
    case CALLERS.OLD.name:
      return { kid: OLD_KID, signer: OLD_KID, iat: at(0, 9), exp: at(0, 10) }
    case CALLERS.FORGED.name: {
      const iat = Math.floor(now / HOUR) * HOUR
      return { kid: NEW_KID, signer: 'not-brightmart', iat, exp: iat + HOUR }
    }
    default:
      return null
  }
}

const jwks = (props) => String(props['jwt.keyOrigin'] ?? '').trim().toUpperCase() === 'JWKS'
const ttlOf = (props) => Number(props['jwt.jwksTtl'])
// The key set the provider serves at a time
const keySetAt = (t) => (t >= PUBLISHED ? [OLD_KID, NEW_KID] : [OLD_KID])

// The messages are the ones the JWT Validation policy page lists for 400 and 401
export const NO_TOKEN = 'Token was not provided in the request.'
export const BAD_SIGNATURE = 'Signature was not validated, or is invalid.'
export const BAD_CLAIMS = 'Some of the required claims are not present or their validation failed.'

const LOGGER = 'brightmart.security.jwt'

export const PACKAGES = {
  'delivery-api': {
    note: 'The delivery API of Brightmart. It checks the bearer token itself, with properties named after the JWT Validation policy fields.',
    sample: { method: 'GET', path: '/deliveries' },
    boot({ props }) {
      const missing = ['jwt.signingMethod', 'jwt.keyLength', 'jwt.keyOrigin'].find((k) => !String(props[k] ?? '').trim())
      if (missing) return `Couldn't find configuration property value for key \${${missing}} from properties provider "Environment properties"`
      if (!jwks(props)) return String(props['jwt.key'] ?? '').trim() ? null : 'JWT Key Origin is Text, but jwt.key is empty.'
      if (!(ttlOf(props) > 0)) return 'JWKS Caching Time To Live (jwt.jwksTtl) must be a number of minutes above 0.'
      const url = String(props['jwt.jwksUrl'] ?? '').trim()
      return url === JWKS_URL ? null : `Could not read the JWKS from '${url || '(empty)'}'. The lab provider serves its key set at one address only.`
    },
    handle({ app, props, now }, req) {
      if (!/^\/deliveries(\/[\w-]+)?$/.test(String(req.path).split('?')[0])) return { status: 404, ms: 6, error: 'APIKIT:NOT_FOUND', flow: 'delivery-api-main', body: '{"message":"Resource not found"}' }
      const token = tokenOf(req.client, now)
      const reject = (status, message, detail) => ({
        status,
        ms: 4,
        error: 'JWT:REJECTED',
        flow: 'delivery-api-main',
        body: JSON.stringify({ error: message }),
        log: [warn(`JWT rejected with ${status}: ${message} ${detail}`, LOGGER)],
      })
      if (!token) return reject(400, NO_TOKEN, `Caller ${req.client || '(none)'} sent no Authorization header.`)
      const header = `Token header {"alg":"RS256","typ":"JWT","kid":"${token.kid}"}.`
      const rs256 = String(props['jwt.signingMethod']).trim().toUpperCase() === 'RSA' && String(props['jwt.keyLength']).trim() === '256'
      let signed
      let origin
      if (jwks(props)) {
        // the key set is read at start and read again each time the cache time to live has passed
        const ttl = ttlOf(props) * MINUTE
        const fetched = app.updated + Math.floor(Math.max(0, now - app.updated) / ttl) * ttl
        const set = keySetAt(fetched)
        signed = rs256 && set.includes(token.kid) && token.signer === token.kid
        origin = `Key origin JWKS, key set read at ${iso(fetched)} with kid ${set.join(', ')}.`
      } else {
        const kid = KID_OF_TEXT[String(props['jwt.key'] ?? '').trim()]
        signed = rs256 && Boolean(kid) && token.signer === kid
        origin = 'Key origin Text: one RSA public key pasted in jwt.key. The kid of the token is not used to choose a key.'
      }
      if (!signed) return reject(401, BAD_SIGNATURE, `Caller ${req.client}. ${header} ${origin}`)
      if (now >= token.exp) return reject(401, BAD_CLAIMS, `Caller ${req.client}. ${header} Claim exp ${iso(token.exp)} is before the time of the request ${iso(now)}.`)
      return { status: 200, ms: 85, flow: 'get:\\deliveries:delivery-api-config', body: '[{"id":"D-4410","stop":"Brightmart Pier 3","status":"OUT_FOR_DELIVERY"}]' }
    },
  },
}

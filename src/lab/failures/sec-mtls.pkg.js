// The sample applications of the sec-mtls lab. Imports only platform-log.js, so the engine can load it without a cycle.
//
// The lab has no TLS model, so the two applications play the handshakes from their properties. The key stores and trust
// stores are files packed in the applications, listed below with the entries they hold. In this lab a listener with a
// trust store asks every client for a certificate and refuses a client without one. A failed handshake has no HTTP
// answer, so the partner side gets status 0. On the internal hop b2b-orders-sapi answers 495 or 496 to tell b2b-orders-papi that
// the handshake failed, and b2b-orders-papi turns that into HTTP:CONNECTIVITY. Certificates, CAs and passwords are fictional.
import { info, line, muleError, warn } from '../platform-log.js'

const store = (password, entries) => ({ password, entries })
const entry = (alias, cn, issuer, key = false) => ({ alias, cn, issuer, key })

export const STORES = {
  'orders-papi-server.jks': store('Papi-Server-26', [entry('b2b-orders-papi', 'orders-papi.brightmart.lab', 'Brightmart Internal CA', true)]),
  'orders-sapi-server.jks': store('Sapi-Server-26', [entry('b2b-orders-sapi', 'orders-sapi.brightmart.lab', 'Brightmart Internal CA', true)]),
  'orders-papi-client.jks': store('Papi-Client-26', [entry('orders-papi-client-2025', 'orders-papi-client', 'Brightmart Old Internal CA', true), entry('orders-papi-client', 'orders-papi-client', 'Brightmart Internal CA', true)]),
  'partners-2025.jks': store('Partners-Lab-25', [entry('brightmart-partner-ca', 'Brightmart Partner CA', 'Brightmart Partner CA')]),
  'partners-2026.jks': store('Partners-Lab-26', [entry('brightmart-partner-ca', 'Brightmart Partner CA', 'Brightmart Partner CA'), entry('bayline-root-ca', 'Bayline Root CA', 'Bayline Root CA')]),
  'internal-ca.jks': store('Internal-Lab-26', [entry('brightmart-internal-ca', 'Brightmart Internal CA', 'Brightmart Internal CA')]),
}

// The client certificate each partner sends, with the chain up to its root
export const PARTNERS = {
  COASTAL: { name: 'Coastal Grocers', clientId: 'cst-11a4', clientSecret: 'cst-secret-36', cert: { cn: 'coastal-grocers-b2b', chain: ['Brightmart Partner CA'] } },
  BAYLINE: { name: 'Bayline Logistics', clientId: 'bay-72d0', clientSecret: 'bay-secret-85', cert: { cn: 'bayline-orders', chain: ['Bayline Issuing CA G2', 'Bayline Root CA'] } },
  NONE: { name: 'No Certificate Tester', clientId: 'tst-9e31', clientSecret: 'tst-secret-02', cert: null },
}
const CERT_OF = Object.fromEntries(Object.values(PARTNERS).map((p) => [p.name, p.cert]))

const text = (v) => String(v ?? '').trim()
const trusted = (file, chain) => STORES[file].entries.some((e) => chain.includes(e.cn))
const cas = (file) => STORES[file].entries.map((e) => `${e.alias} (CN=${e.cn})`).join(', ')
const LOGGER = 'brightmart.lab.tls'

// Checks one store property and its password at start, the way a TLS context fails to load
function storeError(props, key, { alias } = {}) {
  const file = text(props[key])
  if (!file) return null
  if (!STORES[file]) return `Could not initialize TLS context: resource ${file} could not be found (property ${key}).`
  if (text(props[`${key}.password`]) !== STORES[file].password) return `Could not initialize TLS context: Keystore was tampered with, or password was incorrect (${file}, property ${key}.password).`
  if (alias && !STORES[file].entries.some((e) => e.key && e.alias === text(props[alias]))) return `Could not initialize TLS context: no private key with alias '${text(props[alias]) || '(empty)'}' in ${file} (property ${alias}).`
  return null
}
const firstError = (...list) => list.find(Boolean) ?? null

// The certificate b2b-orders-papi presents to b2b-orders-sapi, from its client key store and alias
export function clientCertOf(props) {
  const file = text(props['sapi.tls.keystore'])
  if (!file) return null
  const key = STORES[file].entries.find((e) => e.alias === text(props['sapi.tls.keyAlias']))
  return { cn: key.cn, chain: [key.issuer] }
}

// no HTTP answer: the connection ends during the handshake
const handshake = () => ({ status: 0, ms: 15, error: 'TLS:HANDSHAKE', flow: 'https-listener', body: '' })

export const PACKAGES = {
  'b2b-orders-papi': {
    note: 'The order Process API of Brightmart. Partners call it with a client certificate, and it calls b2b-orders-sapi over TLS.',
    sample: { method: 'GET', path: '/orders/O-5521' },
    boot: ({ props }) =>
      firstError(
        !text(props['tls.keystore']) && 'tls.keystore is empty. The HTTPS listener needs a key store with its server certificate.',
        storeError(props, 'tls.keystore'),
        storeError(props, 'tls.truststore'),
        !text(props['sapi.url']) && "Couldn't find configuration property value for key ${sapi.url} from properties provider \"Environment properties\"",
        storeError(props, 'sapi.tls.truststore'),
        storeError(props, 'sapi.tls.keystore', { alias: 'sapi.tls.keyAlias' }),
      ),
    handle({ props, call }, req) {
      const trust = text(props['tls.truststore'])
      const cert = CERT_OF[req.client] ?? null
      const who = req.client || 'a caller without a client application'
      if (trust) {
        if (!cert) {
          return { ...handshake(), log: [warn(`TLS handshake with ${who} failed on listener orders-listener-tls: javax.net.ssl.SSLHandshakeException: Empty client certificate chain. The trust store ${trust} asks every client for a certificate.`, LOGGER)] }
        }
        if (!trusted(trust, cert.chain)) {
          return {
            ...handshake(),
            log: [warn(`TLS handshake with ${who} failed on listener orders-listener-tls: javax.net.ssl.SSLHandshakeException: PKIX path building failed: unable to find valid certification path to requested target. Client certificate CN=${cert.cn}, chain ${cert.chain.map((c) => `CN=${c}`).join(' > ')}. Trust store ${trust} holds ${cas(trust)}.`, LOGGER)],
          }
        }
      }
      const path = String(req.path).split('?')[0]
      if (!/^\/orders\/O-\d+$/.test(path) || req.method !== 'GET') return { status: 404, ms: 5, error: 'APIKIT:NOT_FOUND', flow: 'b2b-orders-papi-main', body: '{"message":"Resource not found"}' }
      const r = call('sapi.url', { method: 'GET', path, clientCert: clientCertOf(props) }, 5000)
      if (r.status === 495 || r.status === 496) {
        const why = r.status === 496 ? 'Received fatal alert: certificate_required. b2b-orders-sapi asked for a client certificate and the request configuration has no key store.' : 'Received fatal alert: certificate_unknown. b2b-orders-sapi does not trust the client certificate.'
        return {
          status: 500,
          ms: r.ms + 20,
          error: 'HTTP:CONNECTIVITY',
          flow: 'b2b-orders-papi-main',
          body: '{"error":"Internal server error"}',
          log: [muleError({ message: `Remote host terminated the handshake. ${why}`, type: 'HTTP:CONNECTIVITY', flow: 'get:\\orders\\(orderId):b2b-orders-papi-config', file: 'b2b-orders-papi', at: 1, name: 'Get order from System API', dsl: '<http:request method="GET" doc:name="Get order from System API" config-ref="Orders_SAPI_Request" path="/orders/{orderId}">' })],
        }
      }
      if (r.error) return { status: 502, ms: r.ms + 10, error: r.error, flow: 'b2b-orders-papi-main', body: '{"error":"Bad gateway"}' }
      const log = req.traced ? [info(`Handshake with ${who} done: client certificate CN=${cert?.cn ?? '(none)'}. Called b2b-orders-sapi with client certificate ${clientCertOf(props) ? `CN=${clientCertOf(props).cn}` : '(none)'}.`, LOGGER)] : undefined
      return { status: 200, ms: r.ms + 30, flow: 'get:\\orders\\(orderId):b2b-orders-papi-config', body: r.body, log }
    },
  },
  'b2b-orders-sapi': {
    note: 'The order System API of Brightmart. Only applications of the network reach it.',
    sample: { method: 'GET', path: '/orders/O-5521' },
    boot: ({ props }) =>
      firstError(!text(props['tls.keystore']) && 'tls.keystore is empty. The HTTPS listener needs a key store with its server certificate.', storeError(props, 'tls.keystore'), storeError(props, 'tls.truststore')),
    handle({ props }, req) {
      const trust = text(props['tls.truststore'])
      const cert = req.clientCert ?? null
      if (trust && !cert) return { status: 496, ms: 10, error: 'TLS:HANDSHAKE', flow: 'https-listener', body: '', log: [warn(`TLS handshake failed on listener sapi-listener-tls: javax.net.ssl.SSLHandshakeException: Empty client certificate chain. The trust store ${trust} asks every client for a certificate.`, LOGGER)] }
      if (trust && !trusted(trust, cert.chain)) return { status: 495, ms: 10, error: 'TLS:HANDSHAKE', flow: 'https-listener', body: '', log: [warn(`TLS handshake failed on listener sapi-listener-tls: PKIX path building failed for client certificate CN=${cert.cn} issued by CN=${cert.chain[0]}. Trust store ${trust} holds ${cas(trust)}.`, LOGGER)] }
      const id = String(req.path).split('/').pop()
      const log = req.traced ? [line('INFO', `GET ${req.path} over ${trust ? `mutual TLS, client certificate CN=${cert.cn} issued by CN=${cert.chain[0]}` : 'one way TLS, no client certificate asked'}.`, LOGGER)] : undefined
      return { status: 200, ms: 35, flow: 'get:\\orders\\(orderId):b2b-orders-sapi-config', body: `{"orderId":"${id}","status":"SHIPPED","lines":3}`, log }
    },
  },
}

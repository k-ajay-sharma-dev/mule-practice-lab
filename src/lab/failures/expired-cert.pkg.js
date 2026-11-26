// The sample application of the expired-cert lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, muleError, needs } from '../platform-log.js'

// the truststore files packed in the application, with their practice passwords
const STORES = { 'bank-2025.jks': 'Trust-Lab-2025', 'bank-2026.jks': 'Trust-Lab-2026' }
// the bank now sends a chain that only the 2026 file trusts
const TRUSTED = 'bank-2026.jks'

export const PACKAGES = {
  'payments-sapi': {
    note: 'A payments API that calls the bank over HTTPS. Its TLS context reads the truststore from tls.truststore.',
    sample: { method: 'POST', path: '/payments' },
    boot: needs('bank.url', 'tls.truststore', 'tls.truststore.password'),
    handle({ props }, req) {
      if (!/^\/payments(\/[\w-]+)?$/.test(req.path.split('?')[0])) return { status: 404, ms: 10, error: 'APIKIT:NOT_FOUND', flow: 'payments-main', body: '{"message":"Resource not found"}' }
      const flow = `${req.method.toLowerCase()}:\\payments`
      const at = { flow, file: 'payments-sapi', at: 2, name: 'Call bank', dsl: '<http:request method="POST" doc:name="Call bank" config-ref="Bank_HTTPS_Config" path="/v1/payments">', type: 'HTTP:CONNECTIVITY' }
      const url = `${props['bank.url']}/v1/payments`
      const failed = (message, ms) => {
        const error = { ...at, message: `HTTP POST on resource '${url}' failed: ${message}` }
        return { status: 500, ms, error: error.type, flow, log: [info(`Calling the bank for ${req.method} ${req.path}`), muleError(error)], body: '{"message":"Internal server error"}' }
      }
      const ok = () => ({ status: 200, ms: 320, flow, log: [info(`Payment accepted by ${props['bank.url']}`)], body: '{"paymentId":"PAY-20261103-0042","status":"ACCEPTED"}' })
      // insecure="true" on the trust store skips certificate validation, so the call goes through whatever the bank sends
      if (String(props['tls.insecure']).trim() === 'true') return ok()
      const store = String(props['tls.truststore'] ?? '').trim()
      if (!(store in STORES)) return failed(`javax.net.ssl.SSLException: The trust store file ${store} was not found in the application.`, 40)
      if (props['tls.truststore.password'] !== STORES[store]) return failed('java.io.IOException: Keystore was tampered with, or password was incorrect', 60)
      if (store !== TRUSTED)
        return failed('javax.net.ssl.SSLHandshakeException: PKIX path building failed: sun.security.provider.certpath.SunCertPathBuilderException: unable to find valid certification path to requested target', 480)
      return ok()
    },
  },
}

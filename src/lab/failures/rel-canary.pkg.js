// The sample applications of the rel-canary lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { muleError } from '../platform-log.js'

export const STABLE_PKG = 'rel-pricing-3-4-2'
export const CANARY_PKG = 'rel-pricing-3-5-0'
export const FIX_PKG = 'rel-pricing-3-5-1'
export const STABLE_JAR = 'pricing-engine-3.4.2-mule-application.jar'
export const CANARY_JAR = 'pricing-engine-3.5.0-mule-application.jar'
export const FIX_JAR = 'pricing-engine-3.5.1-mule-application.jar'
const MINUTE = 60000
const json = (x) => JSON.stringify(x)
const FLOW = 'get:\\prices:pricing-engine-config'
// ISO 4217 minor units: JPY has none, so a yen price is a whole number
const LIST = { USD: 24.99, EUR: 22.95, JPY: 3790 }

const query = (path) => Object.fromEntries((path.split('?')[1] ?? '').split('&').filter(Boolean).map((kv) => kv.split('=').map(decodeURIComponent)))

// 3.4.2 calls the old price cache, which times out now and then (lab-made: the first USD request of one minute in 15).
// 3.5.0 is the new pricing engine. It rounds every price to two decimals with BigDecimal.setScale(2, UNNECESSARY) after
// the currency conversion, which throws for a yen amount that it first scales to the zero minor units of JPY.
// 3.5.1 takes the scale from the minor units of the currency.
const pricing = (version) => ({
  note: `Pricing engine ${version}. GET /prices?sku=H-100&currency=USD answers the price of a SKU in a currency.`,
  sample: { method: 'GET', path: '/prices?sku=H-100&currency=JPY' },
  handle(ctx, req) {
    const [path] = req.path.split('?')
    if (req.method !== 'GET' || path !== '/prices') return { status: 404, ms: 3, error: 'APIKIT:NOT_FOUND', flow: 'pricing-engine-main', body: json({ message: 'Resource not found' }) }
    const q = query(req.path)
    const currency = q.currency ?? 'USD'
    if (!LIST[currency]) return { status: 400, ms: 4, error: 'APIKIT:BAD_REQUEST', flow: FLOW, body: json({ message: `Unknown currency ${currency}` }) }
    if (version === '3.4.2' && currency === 'USD' && (req.offset ?? 0) === 0 && Math.floor(ctx.now / MINUTE) % 15 === 5)
      return { status: 504, ms: 3000, flow: FLOW, error: 'HTTP:TIMEOUT', body: json({ message: 'Gateway timeout' }) }
    if (version === '3.5.0' && currency === 'JPY') {
      const error = { flow: FLOW, file: 'pricing-engine', at: 4, name: 'Round to currency', dsl: '<java:invoke-static doc:name="Round to currency" class="com.brightmart.pricing.Money" method="round(java.math.BigDecimal, java.lang.String)">', type: 'JAVA:INVOCATION', message: 'Invocation of static Method \'round(java.math.BigDecimal, java.lang.String)\' from Class \'com.brightmart.pricing.Money\' with arguments [java.math.BigDecimal value: 3790.4, java.lang.String currency: JPY] resulted in an error.\nCause: java.lang.ArithmeticException - Rounding necessary' }
      return { status: 500, ms: 30, flow: FLOW, error: 'JAVA:INVOCATION', body: json({ message: 'Internal server error' }), log: [muleError(error)] }
    }
    return { status: 200, ms: version === '3.4.2' ? 60 : 35, flow: FLOW, body: json({ sku: q.sku ?? 'H-100', currency, price: LIST[currency], engine: version }) }
  },
  boot: () => null,
})

export const PACKAGES = {
  [STABLE_PKG]: pricing('3.4.2'),
  [CANARY_PKG]: pricing('3.5.0'),
  [FIX_PKG]: pricing('3.5.1'),
}

// The sample applications of the rel-blue-green lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { muleError } from '../platform-log.js'

export const BLUE_PKG = 'rel-orders-prc-2-2'
export const GREEN_PKG = 'rel-orders-prc-2-3'
export const BLUE_JAR = 'orders-prc-api-2.2.0-mule-application.jar'
export const GREEN_JAR = 'orders-prc-api-2.3.0-mule-application.jar'
const json = (x) => JSON.stringify(x)
const FLOW = 'post:\\orders:orders-prc-api-config'

const bodyOf = (req) => {
  try {
    return JSON.parse(req.body || '{}')
  } catch {
    return null
  }
}
const ordered = (n, extra = {}) => ({ status: 201, ms: 140, flow: FLOW, body: json({ orderId: `O-${2000 + (n % 900)}`, status: 'CONFIRMED', ...extra }) })

// Release 2.3 adds promo codes to the checkout. Its new DataWeave reads the discount of the code from a lookup that has
// no entry for codes of the evening campaign, so it multiplies null. Orders without a promo code work, so the smoke test
// passes and the defect shows only under real traffic.
const orders = (version) => ({
  note: `Orders Process API ${version}. POST /orders takes an order. ${version === '2.3.0' ? 'Adds promo code discounts.' : 'The release in Production now.'}`,
  sample: { method: 'POST', path: '/orders' },
  handle(ctx, req) {
    if (req.method !== 'POST' || req.path.split('?')[0] !== '/orders') return { status: 404, ms: 3, error: 'APIKIT:NOT_FOUND', flow: 'orders-prc-api-main', body: json({ message: 'Resource not found' }) }
    const b = bodyOf(req)
    if (!b) return { status: 400, ms: 4, error: 'APIKIT:BAD_REQUEST', flow: FLOW, body: json({ message: 'Invalid JSON' }) }
    const n = Math.floor(ctx.now / 1000) + (req.offset ?? 0)
    if (version === '2.3.0' && b.promoCode) {
      const error = {
        flow: FLOW,
        file: 'orders-prc-api',
        at: 3,
        name: 'Apply promo discount',
        dsl: '<ee:transform doc:name="Apply promo discount">',
        type: 'MULE:EXPRESSION',
        message: `"You called the function '*' with these arguments:\n  1: Null (null)\n  2: Number (${b.total ?? 59.9})\n\nTrace:\n  at * (line: 4, column: 28)" evaluating expression: "vars.promo.discount * payload.total". Promo code ${b.promoCode}.`,
      }
      return { status: 500, ms: 90, flow: FLOW, error: 'MULE:EXPRESSION', body: json({ message: 'Internal server error' }), log: [muleError(error)] }
    }
    return ordered(n, b.promoCode ? { promoCode: b.promoCode } : {})
  },
  boot: () => null,
})

export const PACKAGES = {
  [BLUE_PKG]: orders('2.2.0'),
  [GREEN_PKG]: orders('2.3.0'),
}

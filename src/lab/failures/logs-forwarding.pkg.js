// The sample application of the logs-forwarding lab. Imports only platform-log.js, so the engine can load it without
// a cycle. Where its logs go is not up to the package: the engine reads app.log4j and app.disableChLogs (see
// platform-observability.js).
import { info, muleError } from '../platform-log.js'

export const NAME = 'order-capture-papi'
const FLOW = 'post:\\orders:order-capture-config'
const json = (x) => JSON.stringify(x)

export const PACKAGES = {
  [NAME]: {
    layer: 'Process',
    traced: true,
    note: 'Takes the orders of the web shop. POST /orders checks the payment with the payment gateway and books the order. A payment the gateway does not answer in time fails with HTTP:TIMEOUT and an ERROR line. Its log4j2.xml decides where the logs go.',
    sample: { method: 'POST', path: '/orders', body: '{"basket":"B-1001","payment":"card"}' },
    handle(ctx, req) {
      if (req.path.split('?')[0] !== '/orders' || req.method !== 'POST') return { status: 404, ms: 4, error: 'APIKIT:NOT_FOUND', flow: `${NAME}-main`, body: json({ message: 'Resource not found' }) }
      const id = `O-${7000 + (Math.floor(ctx.now / 60000) % 2000)}`
      // lab made: the shop marks the orders whose payment gateway call will time out
      if (/PAY-TIMEOUT/.test(req.body ?? '')) {
        return {
          status: 500,
          ms: 10040,
          error: 'HTTP:TIMEOUT',
          flow: FLOW,
          body: json({ message: 'Payment check failed' }),
          log: [muleError({ message: `HTTP POST on resource 'https://payments.brightmart.lab/v2/authorizations' failed: Timeout exceeded after 10000 ms. Order ${id} was not booked.`, type: 'HTTP:TIMEOUT', flow: FLOW, file: NAME, at: 2, name: 'Authorize payment', dsl: '<http:request method="POST" doc:name="Authorize payment" config-ref="Payments_HTTP" path="/v2/authorizations">' })],
        }
      }
      return { status: 201, ms: 180, flow: FLOW, body: json({ orderId: id, status: 'BOOKED' }), log: [info(`Order ${id} booked`)] }
    },
  },
}

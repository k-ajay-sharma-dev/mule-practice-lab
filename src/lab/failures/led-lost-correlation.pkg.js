// The sample applications of the led-lost-correlation lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
import { info, muleError } from '../platform-log.js'
import { LED_PACKAGES } from '../platform-led.js'

export const BROKEN_PAPI = 'order-fulfilment-papi-1-1-0'
export const FIXED_PAPI = 'order-fulfilment-papi-1-1-1'
export const ORDERS_ROW = 'orders-sapi-bad-row'
export const BAD_ORDER = 'O-1077'

const papi = LED_PACKAGES['order-fulfilment-papi']
const orders = LED_PACKAGES['orders-sapi']

// Release 1.1.0 put sendCorrelationId="NEVER" on the request config of the System APIs. The engine passes the ID on
// for every traced application, so this package is not traced and writes its own lines with the ID it received.
// Its outbound calls then carry no ID, and each System API starts a new one, as a Mule listener does.
function untraced(ctx, req) {
  const lines = []
  const note = (text) => lines.push(info(`event:${req.cid} ${text}`))
  note(`${req.method} ${req.path} received`)
  const call = (key, request, timeout) => {
    const a = ctx.call(key, request, timeout)
    note(`Called ${a.url}${a.path}, ${a.error ?? a.status} in ${a.ms} ms`)
    return a
  }
  const r = papi.handle({ ...ctx, say: note, call }, req)
  note(`Answered ${r.status} in ${r.ms} ms`)
  const own = req.traced || r.status >= 500 ? lines : []
  return { ...r, log: [...own, ...(r.log ?? []).map((l) => ({ ...l, text: `event:${req.cid} ${l.text}` }))] }
}

export const PACKAGES = {
  [BROKEN_PAPI]: {
    ...papi,
    note: 'Release 1.1.0 of the Process API. The request config of the System APIs got new timeouts and sendCorrelationId="NEVER".',
    traced: false,
    handle: untraced,
  },
  [FIXED_PAPI]: {
    ...papi,
    note: 'Release 1.1.1 of the Process API. The new timeouts stay, and sendCorrelationId is back to AUTO, the default.',
  },
  [ORDERS_ROW]: {
    ...orders,
    note: 'System API in front of Oracle.',
    handle(ctx, req) {
      const path = req.path.split('?')[0]
      if (req.method !== 'GET' || path !== `/orders/${BAD_ORDER}`) return orders.handle(ctx, req)
      ctx.backend('oracle')
      const flow = 'get:\\orders\\(orderId)'
      const error = { flow, file: 'orders-sapi', at: 1, name: 'Database call', dsl: '<db:select doc:name="Database call" config-ref="Database_Config">', type: 'DB:QUERY_EXECUTION', message: `ORA-01722: invalid number. The row of order ${BAD_ORDER} holds a value the query cannot convert.` }
      return { status: 500, ms: 90, flow, error: error.type, log: [muleError(error)], body: '{"message":"Internal server error"}' }
    },
  },
}

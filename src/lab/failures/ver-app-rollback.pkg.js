// The sample applications of the ver-app-rollback lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
import { LED_PACKAGES } from '../platform-led.js'
import { muleError } from '../platform-log.js'

export const PKG = {
  orders141: 'ver-rollback-orders-sapi-1-4-1',
  orders142: 'ver-rollback-orders-sapi-1-4-2',
}

const orders = LED_PACKAGES['orders-sapi']
const FLOW = 'get:\\orders\\(orderId)'

// Release 1.4.1 reads the order lines with a new query. An order with more than one line comes back as a list, and
// the mapping that expects one object fails. Order O-1001 has one line, order O-1002 has three.
const buggy = {
  ...orders,
  note: 'Release 1.4.1 of the Orders System API. A faster query for the order lines. Same RAML, same API version v1.',
  handle(ctx, req) {
    const r = orders.handle(ctx, req)
    if (req.method !== 'GET' || r.status !== 200 || !/\/orders\/O-1002$/.test(req.path.split('?')[0])) return r
    const error = {
      flow: FLOW, file: 'orders-sapi', at: 3, name: 'Map order', dsl: '<ee:transform doc:name="Map order">', type: 'MULE:EXPRESSION',
      message: '"Cannot coerce Array ([{sku: "H-100", qty: 2}, {sku: "H-210", qty: 1}, ...]) to Object"\n\n5| line: payload.lines.line',
    }
    return { status: 500, ms: r.ms + 5, flow: FLOW, error: 'MULE:EXPRESSION', log: [muleError(error)], body: JSON.stringify({ message: 'Internal server error' }) }
  },
}

export const PACKAGES = {
  [PKG.orders141]: buggy,
  [PKG.orders142]: { ...orders, note: 'Release 1.4.2 of the Orders System API. The faster query of 1.4.1, and the mapping reads one line or many. Same RAML, same API version v1.' },
}

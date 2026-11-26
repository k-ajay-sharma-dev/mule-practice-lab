// The sample applications of the ver-side-by-side lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
import { muleError, needs } from '../platform-log.js'
import { LED_PACKAGES } from '../platform-led.js'

export const PKG = {
  inventory2: 'inventory-sapi-v2-onhand',
  process: 'order-fulfilment-papi-typed',
  store: 'store-stock-eapi',
}

const json = (value) => JSON.stringify(value)
const inventory = LED_PACKAGES['inventory-sapi']
const papi = LED_PACKAGES['order-fulfilment-papi']

// The Process API reads the stock with payload.available as Number, the way its DataWeave transform does.
// A field that is not there is null, and null cannot be coerced to a Number, so the call fails.
function typed() {
  return {
    ...papi,
    note: 'Process API. Joins customers, orders and inventory. Reads the stock as available, a Number, from the Inventory System API v1.',
    handle(ctx, req) {
      let stock
      const r = papi.handle(
        {
          ...ctx,
          call: (key, ...rest) => {
            const a = ctx.call(key, ...rest)
            if (key === 'inventory.url' && !a.error && a.body) stock = JSON.parse(a.body)
            return a
          },
        },
        req,
      )
      if (!stock || typeof stock.available === 'number') return r
      const flow = req.method === 'POST' ? 'post:\\orders' : 'get:\\orders\\(orderId)\\status'
      ctx.store.nullStock = (ctx.store.nullStock ?? 0) + 1
      const error = {
        flow, file: 'order-fulfilment-papi', at: 4, name: 'Map the order',
        dsl: '<ee:transform doc:name="Map the order">',
        type: 'MULE:EXPRESSION',
        message: '"Cannot coerce Null (null) to Number\n\n5| stock: vars.inventory.available as Number\n           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^" evaluating expression: "%dw 2.0 output application/json ..."',
      }
      return { status: 500, ms: r.ms, flow, error: error.type, log: [muleError(error)], body: json({ message: 'Internal server error' }) }
    },
  }
}

export const PACKAGES = {
  // Release 2.0.0: the field available is now onHand, so the contract is not the same
  [PKG.inventory2]: {
    ...inventory,
    note: 'Release 2.0.0 of the Inventory System API, API version v2. The stock is in onHand instead of available.',
    handle(ctx, req) {
      const r = inventory.handle(ctx, req)
      if (r.status !== 200 || !r.body) return r
      const { available, ...rest } = JSON.parse(r.body)
      return { ...r, body: json({ ...rest, onHand: available }) }
    },
  },
  [PKG.process]: typed(),
  // A new consumer that needs v2. It calls the Inventory System API v2 with its own client ID.
  [PKG.store]: {
    note: 'Experience API for the store tablets. Reads onHand from the Inventory System API v2.',
    layer: 'Experience',
    sample: { method: 'GET', path: '/store-stock/H-100' },
    traced: true,
    calls: ['inventory.url'],
    boot: needs('inventory.url', 'sapi.client_id', 'sapi.client_secret'),
    handle(ctx, req) {
      const sku = req.method === 'GET' && req.path.split('?')[0].match(/^\/store-stock\/([\w-]+)$/)?.[1]
      const flow = 'get:\\store-stock\\(sku)'
      if (!sku) return { status: 404, ms: 3, flow: 'store-stock-eapi-main', error: 'APIKIT:NOT_FOUND', body: json({ message: 'Resource not found' }) }
      const { props, call } = ctx
      const r = call('inventory.url', { method: 'GET', path: `/inventory/${sku}`, clientId: props['sapi.client_id'], clientSecret: props['sapi.client_secret'] }, 5000)
      if (r.error) {
        const status = r.error === 'HTTP:CONNECTIVITY' ? 503 : 502
        const error = { flow, file: 'store-stock-eapi', at: 2, name: 'Inventory API', dsl: `<http:request method="GET" doc:name="Inventory API" config-ref="Inventory_API_Config" path="/inventory/${sku}">`, type: r.error, message: `HTTP GET on resource '${r.url}/inventory/${sku}' failed: ${r.text}.` }
        return { status, ms: r.ms + 10, flow, error: r.error, log: [muleError(error)], body: json({ message: 'The stock is not available' }) }
      }
      const item = JSON.parse(r.body)
      return { status: 200, ms: r.ms + 10, flow, body: json({ sku: item.sku, onHand: item.onHand ?? null }) }
    },
  },
}

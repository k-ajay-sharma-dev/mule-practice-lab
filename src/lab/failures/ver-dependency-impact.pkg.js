// The sample applications of the ver-dependency-impact lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
import { LED_PACKAGES } from '../platform-led.js'

export const PKG = {
  inventory2: 'ver-impact-inventory-sapi-2-0-0',
  process11: 'ver-impact-order-fulfilment-papi-1-1-0',
}

const json = (value) => JSON.stringify(value)
const inventory = LED_PACKAGES['inventory-sapi']
const papi = LED_PACKAGES['order-fulfilment-papi']
// the 24 pieces of v1, split over the two warehouses of Brightmart
const split = (available) => [{ id: 'W1', available: Math.ceil((available * 2) / 3) }, { id: 'W2', available: available - Math.ceil((available * 2) / 3) }]

// Inventory System API v2: the stock per warehouse instead of one number
const inventoryV2 = {
  ...inventory,
  note: 'Release 2.0.0 of the Inventory System API, API version v2. The answer has warehouses, a list of the stock per warehouse, instead of available.',
  handle(ctx, req) {
    const r = inventory.handle(ctx, req)
    if (r.status !== 200 || !r.body) return r
    const { sku, available } = JSON.parse(r.body)
    return { ...r, body: json({ sku, warehouses: split(available) }) }
  },
}

// Order Fulfilment 1.1.0 reads v2: it adds up the warehouses, so its own answer keeps the field stock.
// An answer without warehouses (v1) fails the mapping.
const processV2 = {
  ...papi,
  note: 'Release 1.1.0 of the Order Fulfilment Process API. Reads the Inventory System API v2 and adds up the warehouses. Its own answer does not change.',
  handle(ctx, req) {
    const call = (key, request, timeout) => {
      const r = ctx.call(key, request, timeout)
      if (key !== 'inventory.url' || r.error || !r.body) return r
      const body = JSON.parse(r.body)
      if (!Array.isArray(body.warehouses)) return { ...r, status: 500, error: 'MULE:EXPRESSION', text: 'the answer has no warehouses. "Cannot coerce Null (null) to Array". Release 1.1.0 expects the Inventory System API v2' }
      return { ...r, body: json({ sku: body.sku, available: body.warehouses.reduce((n, w) => n + w.available, 0) }) }
    }
    return papi.handle({ ...ctx, call }, req)
  },
}

export const PACKAGES = {
  [PKG.inventory2]: inventoryV2,
  [PKG.process11]: processV2,
}

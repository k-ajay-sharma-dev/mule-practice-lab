// The sample application of the ch2-replica-state lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, warn } from '../platform-log.js'

export const CART_API = 'brightmart-cart-eapi'
const MINUTE = 60000
// lab-made shoppers: every minute each of 6 shoppers does one thing in the web shop, in an order that changes each
// minute. Over 4 minutes a shopper adds 3 items and then checks out, and the next 4 minutes start a new cart.
export const SHOPPERS = 6
export const CYCLE = 4
export const ITEMS = 3
export const SKUS = ['SKU-2201 kettle', 'SKU-3417 mug set', 'SKU-5120 toaster', 'SKU-6008 coffee beans', 'SKU-7745 tea tray']

export const persistentOf = (props) => String(props['cart.persistent'] ?? '').trim() === 'true'
// a persistent store is shared by the replicas only with Object Store V2. Without it the store of each replica is kept
// on that replica (lab-made: CloudHub 2.0 gives a replica no lasting disk, so it behaves like memory).
export const sharedOf = (app, props) => persistentOf(props) && app.objectStore !== false

// the shoppers of minute m, in a shuffled order
function orderOf(m) {
  const out = Array.from({ length: SHOPPERS }, (_, i) => i)
  let x = (m * 2654435761) >>> 0
  for (let i = out.length - 1; i > 0; i--) {
    x = (x * 1103515245 + 12345) >>> 0
    const j = (x >>> 8) % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
export const cartIdOf = (cycle, shopper) => `CART-${1000 + ((cycle * SHOPPERS + shopper) % 9000)}`
const keyOf = (id) => `cart:${id}`

export const PACKAGES = {
  [CART_API]: {
    note: 'The cart Experience API of the Brightmart web shop. It keeps each shopping cart in an object store named cartStore. The property cart.persistent sets the persistent attribute of os:object-store: false keeps the store in the memory of the replica.',
    handle(ctx, req) {
      const { app, props, now, replica } = ctx
      const shared = sharedOf(app, props)
      // the store of this request: Object Store V2 is app.store, shared; otherwise the memory of the replica that answers
      const st = shared ? ctx.store : ctx.memory()
      const where = shared ? 'Object Store V2' : persistentOf(props) ? `the local store of replica ${replica}` : `the memory of replica ${replica}`
      const m = Math.floor(now / MINUTE)
      const cycle = Math.floor(m / CYCLE)
      // abandoned carts expire after one cycle (lab-made TTL), so the stores stay small
      for (const k of Object.keys(st)) if (k.startsWith('cart:') && st[k].c < cycle - 1) delete st[k]
      const one = req.path.match(/^\/carts\/(CART-\d+)$/)
      if (req.method === 'GET' && one) {
        const cart = st[keyOf(one[1])]
        return cart ? { status: 200, ms: 25, body: JSON.stringify({ id: one[1], items: cart.items }), flow: 'get-cart-flow' } : { status: 404, ms: 20, body: `{"error":"Cart ${one[1]} not found"}`, flow: 'get-cart-flow' }
      }
      if (req.method !== 'POST' || req.path !== '/carts') return { status: 404, ms: 3, body: '' }
      // lab-made: each call of the steady traffic is the next action of one shopper
      const i = Math.min(SHOPPERS - 1, Math.round(((req.offset ?? 0) * SHOPPERS) / MINUTE))
      const shopper = orderOf(m)[i]
      const step = m % CYCLE
      const id = cartIdOf(cycle, shopper)
      const cart = st[keyOf(id)]
      if (step < ITEMS) {
        const items = [...(cart?.items ?? []), SKUS[(shopper + step) % SKUS.length]]
        st[keyOf(id)] = { items, c: cycle }
        return { status: cart ? 200 : 201, ms: 45, body: JSON.stringify({ id, items }), flow: 'add-item-flow' }
      }
      // checkout: the web shop sends the number of items it shows the shopper in X-Cart-Items (lab-made)
      delete st[keyOf(id)]
      if (!cart) return { status: 404, ms: 30, flow: 'checkout-flow', body: `{"error":"Cart ${id} not found"}`, log: [warn(`checkout-flow: cart ${id} not found in ${where}. X-Cart-Items was ${ITEMS}. Answered 404.`)] }
      if (cart.items.length < ITEMS) return { status: 409, ms: 35, flow: 'checkout-flow', body: `{"error":"Cart ${id} has ${cart.items.length} of ${ITEMS} items"}`, log: [warn(`checkout-flow: cart ${id} in ${where} has ${cart.items.length} item${cart.items.length === 1 ? '' : 's'}, X-Cart-Items was ${ITEMS}. Answered 409.`)] }
      return { status: 200, ms: 140, flow: 'checkout-flow', body: JSON.stringify({ id, order: `SO-${70000 + (m % 9000)}`, items: cart.items }), log: [info(`checkout-flow: order placed for cart ${id}, ${ITEMS} items`)] }
    },
  },
}

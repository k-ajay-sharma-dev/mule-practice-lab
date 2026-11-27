// The sample applications of the end to end lab of Shopify. Imports only platform-log.js and the import free Shopify
// engine, so the engine can load them without a cycle.
//
// shopify-order-sync takes the orders/create webhooks of the Brightmart web store, checks X-Shopify-Hmac-Sha256 with
// the API secret key, maps the order in DataWeave and puts it on the Anypoint MQ queue of the order system. Its Store
// Stock API (PUT /stock/{sku}) sets the available quantity in Shopify with the GraphQL mutation inventorySetQuantities.
// brightmart-oms-orders is the order system of Brightmart: it takes the orders from the queue and refuses an order with
// a SKU its item master does not know, so the message goes to the dead letter queue after its delivery attempts.
import { info, muleError, needs, warn } from '../platform-log.js'
import { gid, headerOf, SHOP, verifyWebhook } from '../platform-shopify.js'

export const NAME = 'shopify-order-sync'
export const OMS = 'brightmart-oms-orders'
export const ASSET = 'store-stock-api'
export const MAIN = 'store-stock-api-main'
export const WEBHOOK_FLOW = 'shopify-order-webhook-flow'
export const WEBHOOK_PATH = '/webhooks/orders'
const PUT_FLOW = 'put:\\stock\\(sku):application\\json:store-stock-api-config'
const word = (v) => String(v ?? '').trim()
const json = (x) => JSON.stringify(x)
const keep = (list, item, n = 60) => [...(list ?? []), item].slice(-n)
const cfgOf = (p) => ({ shop: word(p['shopify.shop']), accessToken: word(p['shopify.accessToken']), apiVersion: word(p['shopify.apiVersion']) })
// the DataWeave of the lab: the Shopify order payload as the order of the order system
export const toOmsOrder = (o) => ({ source: 'shopify', orderRef: o.name, shopifyId: o.id, email: o.email, total: Number(o.total_price), currency: o.currency, lines: (o.line_items ?? []).map((l) => ({ sku: l.sku, qty: l.quantity, price: Number(l.price) })), test: Boolean(o.test) })
const SET = `mutation setStock($input: InventorySetQuantitiesInput!) {
  inventorySetQuantities(input: $input) {
    inventoryAdjustmentGroup { createdAt reason changes { name delta quantityAfterChange } }
    userErrors { code field message }
  }
}`
const el = {
  verify: { flow: WEBHOOK_FLOW, file: NAME, at: 2, name: 'Reject webhook', dsl: '<raise-error doc:name="Reject webhook" type="APP:UNAUTHORIZED" description="HMAC mismatch"/>' },
  set: { flow: PUT_FLOW, file: NAME, at: 3, name: 'Set stock', dsl: '<http:request doc:name="Set stock" config-ref="Shopify_Admin_API" method="POST" path="/admin/api/${shopify.apiVersion}/graphql.json">' },
}

// checks one webhook and turns it into the message for the order system
function take(ctx, { id, topic, headers, body }) {
  const store = (ctx.app.store ??= {})
  if (!verifyWebhook(word(ctx.props['shopify.apiSecret']), body, headerOf(headers, 'X-Shopify-Hmac-Sha256'))) return { status: 401, ms: 20, log: [warn(`Webhook ${id} ${topic} rejected with 401: HMAC mismatch`), muleError({ ...el.verify, type: 'APP:UNAUTHORIZED', message: `The X-Shopify-Hmac-Sha256 of webhook ${id} does not match the HMAC of the raw body` })] }
  // Shopify may deliver a webhook more than once: the X-Shopify-Webhook-Id is the idempotency key
  if ((store.seen ?? []).includes(id)) return { status: 200, ms: 10, log: [info(`Webhook ${id} was taken before, skipped`)] }
  let o
  try {
    o = JSON.parse(body)
  } catch {
    return { status: 400, ms: 10, log: [warn(`Webhook ${id}: the body is not JSON`)] }
  }
  store.seen = keep(store.seen, id)
  store.taken = keep(store.taken, o.name)
  return { status: 200, ms: 40, message: json(toOmsOrder(o)), log: [info(`Webhook ${id.slice(0, 8)} ${topic}: order ${o.name} (${(o.line_items ?? []).map((l) => `${l.sku} x${l.quantity}`).join(', ')}) put on ${word(ctx.props['oms.queue'])}`)] }
}

export const PACKAGES = {
  [NAME]: {
    note: `Store Stock API and the Shopify order webhooks, built in Studio on the spec of Exchange. ${WEBHOOK_FLOW} is the HTTPS listener of POST /api${WEBHOOK_PATH} for orders/create: it checks X-Shopify-Hmac-Sha256 with shopify.apiSecret, skips a webhook ID it has taken, answers 200 at once and puts the mapped order on the queue in oms.queue. PUT /stock/{sku} with {"available"} finds the inventory item of the SKU and sets its available quantity at shopify.locationId with inventorySetQuantities. Properties: shopify.shop, shopify.apiVersion, shopify.locationId, shopify.accessToken and shopify.apiSecret (both protected), oms.queue, api.id and the environment client ID and secret.`,
    sample: { method: 'PUT', path: '/stock/H-1250', body: '{"available":40}' },
    traced: true,
    boot: needs('shopify.shop', 'shopify.apiVersion', 'shopify.locationId', 'shopify.accessToken', 'shopify.apiSecret', 'oms.queue'),
    schedules: [{ flow: WEBHOOK_FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    handle(ctx, req) {
      const m = req.path.split('?')[0].match(/^\/stock\/([\w-]+)$/)
      if (req.method !== 'PUT' || !m) return { status: 404, ms: 4, error: 'APIKIT:NOT_FOUND', flow: MAIN, body: json({ message: 'Resource not found' }) }
      let b
      try {
        b = JSON.parse(req.body || 'null')
      } catch {
        b = null
      }
      if (!b || !Number.isInteger(b.available) || b.available < 0) return { status: 400, ms: 5, flow: PUT_FLOW, error: 'APIKIT:BAD_REQUEST', body: json({ message: 'Bad request: available must be a whole number of 0 or more' }) }
      const cfg = cfgOf(ctx.props)
      const fail = (r) => {
        const text = r.error ?? (typeof r.body?.errors === 'string' ? r.body.errors : r.body?.errors?.[0]?.message) ?? `HTTP ${r.status}`
        const type = r.status === 401 ? 'HTTP:UNAUTHORIZED' : r.status === 0 ? 'HTTP:CONNECTIVITY' : 'APP:SHOPIFY_ERROR' // lab-made error type for GraphQL errors
        return { status: 502, ms: (r.ms ?? 0) + 10, flow: PUT_FLOW, error: type, log: [muleError({ ...el.set, type, message: text })], body: json({ message: 'Shopify refused the update', shopify: text }) }
      }
      const q = ctx.shopify.graphql(cfg, `{ inventoryItems(first: 1, query: "sku:${m[1]}") { nodes { id sku } } }`)
      if (q.status !== 200 || q.body?.errors) return fail(q)
      const item = q.body.data.inventoryItems.nodes[0]
      if (!item) return { status: 404, ms: q.ms + 10, flow: PUT_FLOW, body: json({ message: `No product variant in Shopify has SKU ${m[1]}` }) }
      const input = { name: 'available', reason: 'correction', ignoreCompareQuantity: true, referenceDocumentUri: `logistics://brightmart.example/stock/${m[1]}`, quantities: [{ inventoryItemId: item.id, locationId: gid('Location', word(ctx.props['shopify.locationId'])), quantity: b.available }] }
      const r = ctx.shopify.graphql(cfg, SET, { input })
      if (r.status !== 200 || r.body?.errors) return fail(r)
      const out = r.body.data.inventorySetQuantities
      if (out.userErrors.length) return { status: 422, ms: q.ms + r.ms, flow: PUT_FLOW, log: [warn(`Stock of ${m[1]} not set: ${out.userErrors.map((e) => `${e.code} ${e.message}`).join('; ')}`)], body: json({ message: out.userErrors[0].message, code: out.userErrors[0].code }) }
      const c = out.inventoryAdjustmentGroup.changes[0]
      return { status: 200, ms: q.ms + r.ms, flow: PUT_FLOW, log: [info(`Stock of ${m[1]} set to ${c.quantityAfterChange} available at location ${word(ctx.props['shopify.locationId'])} (delta ${c.delta}) with inventorySetQuantities`)], body: json({ sku: m[1], available: c.quantityAfterChange, delta: c.delta }) }
    },
    run: {
      [WEBHOOK_FLOW]: (ctx) => {
        // lab: the live store is not part of this lab, so the app in Production with another shop only says what it would do
        if (ctx.app.env === 'Production' && word(ctx.props['shopify.shop']) !== SHOP) return { ok: true, ms: 5, log: ctx.app.logs.some((l) => /lab: the live store/.test(l.text)) ? [] : [info(`lab: the live store ${word(ctx.props['shopify.shop'])} is not part of this lab. Here the listener takes its orders/create webhooks and puts them on ${word(ctx.props['oms.queue'])}.`)] }
        const log = []
        const bodies = []
        let bad = 0
        ctx.shopify.webhooks({ paths: [WEBHOOK_PATH] }, (d) => {
          const x = take(ctx, d)
          log.push(...x.log)
          if (x.status >= 400) bad++
          if (x.message) bodies.push(x.message)
          return x
        })
        return { ok: bad === 0, ms: Math.max(10, ctx.shopify.elapsed()), errorType: bad ? 'APP:UNAUTHORIZED' : null, errors: bad, log, ...(bodies.length && { send: { queue: word(ctx.props['oms.queue']), bodies } }) }
      },
    },
  },
  [OMS]: {
    note: 'The order system of Brightmart. Its Subscriber takes the orders on the Anypoint MQ queue in oms.queue. An order with a SKU the item master does not know fails with OMS:UNKNOWN_ITEM, so the queue delivers it again and then reroutes it to its dead letter queue. GET /orders lists the orders, POST /items with {"sku"} adds a SKU to the item master.',
    sample: { method: 'GET', path: '/orders' },
    boot: needs('oms.queue'),
    consumes: 'oms.queue',
    handle(ctx, req) {
      const store = (ctx.app.store ??= {})
      const path = req.path.split('?')[0]
      if (req.method === 'GET' && path === '/orders') return { status: 200, ms: 12, body: json((store.orders ?? []).map((o) => ({ orderRef: o.orderRef, source: o.source, total: o.total, lines: o.lines.length }))) }
      if (req.method === 'POST' && path === '/items') {
        let b
        try {
          b = JSON.parse(req.body || 'null')
        } catch {
          b = null
        }
        const sku = word(b?.sku)
        if (!sku) return { status: 400, ms: 5, body: json({ message: 'sku is required' }) }
        store.items = [...new Set([...(store.items ?? []), sku])]
        return { status: 201, ms: 20, log: [info(`Item ${sku} added to the item master`)], body: json({ sku, status: 'ACTIVE' }) }
      }
      return { status: 404, ms: 3, body: json({ message: 'Resource not found' }) }
    },
    consume(ctx, message) {
      const store = (ctx.app.store ??= {})
      const at = { flow: 'oms-order-subscriber-flow', file: OMS, at: 2, name: 'Check items', dsl: '<validation:is-true doc:name="Check items" expression="#[vars.unknown isEmpty]"/>' }
      let o
      try {
        o = JSON.parse(message.body)
      } catch {
        return { ok: false, flow: at.flow, errorType: 'MULE:EXPRESSION', error: { ...at, type: 'MULE:EXPRESSION', message: `Message ${message.id} is not JSON` } }
      }
      const unknown = (o.lines ?? []).map((l) => l.sku).filter((sku) => !(store.items ?? []).includes(sku))
      if (unknown.length) store.failed = keep(store.failed, { orderRef: o.orderRef, skus: unknown, t: ctx.now }, 20)
      if (unknown.length) return { ok: false, flow: at.flow, errorType: 'OMS:UNKNOWN_ITEM', error: { ...at, type: 'OMS:UNKNOWN_ITEM', message: `Order ${o.orderRef}: item ${unknown.join(', ')} is not in the item master` } } // lab-made error type
      if ((store.orders ?? []).some((x) => x.orderRef === o.orderRef)) return { ok: true, flow: at.flow, log: [info(`Order ${o.orderRef} is stored already`)] }
      store.orders = keep(store.orders, o, 80)
      return { ok: true, flow: at.flow, log: [info(`Order ${o.orderRef} stored from ${o.source}: ${o.lines.map((l) => `${l.sku} x${l.qty}`).join(', ')}, total ${o.total} ${o.currency}`)] }
    },
  },
}

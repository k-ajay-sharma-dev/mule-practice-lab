// The sample applications of the shopify-setup lab. Imports only platform-log.js and the import free Shopify engine, so
// the engine can load it without a cycle.
//
// brightmart-shp-order-bridge takes the orders/create webhooks of the Brightmart web store on POST /api/webhooks/shopify,
// checks X-Shopify-Hmac-Sha256 with the API secret key, answers at once and puts the order on the Anypoint MQ queue in
// orders.queue. brightmart-shp-order-api is the Brightmart order API: it takes the orders from that queue.
import { info, muleError, needs, warn } from '../platform-log.js'
import { headerOf, verifyWebhook } from '../platform-shopify.js'

export const BRIDGE = 'brightmart-shp-order-bridge'
export const BRIDGE_JAR = `${BRIDGE}-1.0.0-mule-application.jar`
export const ORDER_API = 'brightmart-shp-order-api'
export const BRIDGE_FLOW = 'shopify-webhook-flow'
export const BRIDGE_PATH = '/webhooks/shopify'
const word = (v) => String(v ?? '').trim()
const keep = (list, item, n = 100) => [...(list ?? []), item].slice(-n)
const cfgOf = (p) => ({ shop: word(p['shopify.shop']), accessToken: word(p['shopify.accessToken']), apiVersion: word(p['shopify.apiVersion']) })
const verifyEl = { flow: BRIDGE_FLOW, file: BRIDGE, at: 2, name: 'Reject webhook', dsl: '<raise-error doc:name="Reject webhook" type="APP:UNAUTHORIZED" description="HMAC mismatch"/>' }

// checks one webhook and turns it into the message for the order API
function take(ctx, { id, topic, headers, body }) {
  const store = (ctx.app.store ??= {})
  if (!verifyWebhook(word(ctx.props['shopify.apiSecret']), body, headerOf(headers, 'X-Shopify-Hmac-Sha256'))) {
    store.rejected = (store.rejected ?? 0) + 1
    return { status: 401, ms: 20, log: [warn(`Webhook ${id} ${topic} rejected with 401: HMAC mismatch`), muleError({ ...verifyEl, type: 'APP:UNAUTHORIZED', message: `The X-Shopify-Hmac-Sha256 of webhook ${id} does not match the HMAC of the raw body` })] }
  }
  if ((store.seen ?? []).includes(id)) return { status: 200, ms: 10, log: [info(`Webhook ${id} was taken before, skipped`)] }
  let o
  try {
    o = JSON.parse(body)
  } catch {
    return { status: 400, ms: 10, log: [warn(`Webhook ${id}: the body is not JSON`)] }
  }
  store.seen = keep(store.seen, id)
  store.taken = keep(store.taken, o.name)
  const message = JSON.stringify({ source: 'shopify', order: o.name, shopifyId: o.id, email: o.email, total: Number(o.total_price), currency: o.currency, lines: (o.line_items ?? []).map((l) => ({ sku: l.sku, qty: l.quantity })), test: Boolean(o.test) })
  return { status: 200, ms: 40, message, log: [info(`Order ${o.name} from ${topic} put on ${word(ctx.props['orders.queue'])} (webhook ${id.slice(0, 8)})`)] }
}

export const PACKAGES = {
  [BRIDGE]: {
    note: `The Shopify order bridge. POST /api${BRIDGE_PATH} takes orders/create webhooks, checks X-Shopify-Hmac-Sha256 with shopify.apiSecret, answers 200 at once and puts the order on the queue in orders.queue for the order API. A wrong signature gets 401. GET /health calls the Admin GraphQL API of shopify.shop with shopify.accessToken and shopify.apiVersion.`,
    sample: { method: 'GET', path: '/health' },
    boot: needs('shopify.shop', 'shopify.apiVersion', 'shopify.accessToken', 'shopify.apiSecret', 'orders.queue'),
    schedules: [{ flow: BRIDGE_FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    handle(ctx, req) {
      const path = req.path.split('?')[0]
      if (req.method === 'GET' && path === '/health') {
        const r = ctx.shopify.graphql(cfgOf(ctx.props), '{ shop { name myshopifyDomain } }')
        if (r.status !== 200 || r.body?.errors) {
          const text = r.error ?? (typeof r.body?.errors === 'string' ? r.body.errors : r.body?.errors?.[0]?.message) ?? `HTTP ${r.status}`
          return { status: 502, ms: r.ms + 10, error: r.status === 401 ? 'HTTP:UNAUTHORIZED' : 'HTTP:CONNECTIVITY', log: [muleError({ flow: 'get:\\health', file: BRIDGE, at: 1, name: 'Shop query', dsl: '<http:request doc:name="Shop query" config-ref="Shopify_Admin_API" method="POST" path="/admin/api/${shopify.apiVersion}/graphql.json">', type: r.status === 401 ? 'HTTP:UNAUTHORIZED' : 'HTTP:CONNECTIVITY', message: text })], body: JSON.stringify({ status: 'DOWN', shopify: text }) }
        }
        return { status: 200, ms: r.ms + 10, log: [info(`Health check: connected to ${r.body.data.shop.myshopifyDomain} (${r.body.data.shop.name}), API version ${word(ctx.props['shopify.apiVersion'])}`)], body: JSON.stringify({ status: 'UP', shop: r.body.data.shop.myshopifyDomain, apiVersion: word(ctx.props['shopify.apiVersion']) }) }
      }
      if (req.method === 'POST' && path === BRIDGE_PATH) {
        const x = take(ctx, { id: headerOf(req.headers, 'X-Shopify-Webhook-Id') || 'no-webhook-id', topic: headerOf(req.headers, 'X-Shopify-Topic') || 'orders/create', headers: req.headers, body: req.body ?? '' })
        if (x.message) ctx.put(word(ctx.props['orders.queue']), x.message)
        return { status: x.status, ms: x.ms, log: x.log, ...(x.status === 401 && { error: 'APP:UNAUTHORIZED' }), body: x.status === 401 ? '{"error":"Unauthorized"}' : '' }
      }
      return { status: 404, ms: 3, body: '{"message":"Resource not found"}' }
    },
    run: {
      [BRIDGE_FLOW]: (ctx) => {
        const log = []
        const bodies = []
        let bad = 0
        ctx.shopify.webhooks({ paths: [BRIDGE_PATH] }, (d) => {
          const x = take(ctx, d)
          log.push(...x.log)
          if (x.status >= 400) bad++
          if (x.message) bodies.push(x.message)
          return x
        })
        return { ok: bad === 0, ms: Math.max(10, ctx.shopify.elapsed()), errorType: bad ? 'APP:UNAUTHORIZED' : null, errors: bad, log, ...(bodies.length && { send: { queue: word(ctx.props['orders.queue']), bodies } }) }
      },
    },
  },
  [ORDER_API]: {
    note: 'The Brightmart order API. Its Subscriber takes the orders on the Anypoint MQ queue in mq.queue and stores them. GET /orders lists the orders, GET /orders/{name} reads one, such as /orders/1001 for #1001.',
    sample: { method: 'GET', path: '/orders' },
    boot: needs('mq.queue'),
    consumes: 'mq.queue',
    handle(ctx, req) {
      const list = ctx.app.store?.orders ?? []
      const path = req.path.split('?')[0]
      if (req.method === 'GET' && path === '/orders') return { status: 200, ms: 15, body: JSON.stringify(list.map((o) => ({ order: o.order, source: o.source, total: o.total, test: o.test }))) }
      const one = req.method === 'GET' && path.match(/^\/orders\/#?(\d+)$/)
      if (one) {
        const o = list.find((x) => x.order === `#${one[1]}`)
        return o ? { status: 200, ms: 15, body: JSON.stringify(o) } : { status: 404, ms: 5, body: '{"message":"Order not found"}' }
      }
      return { status: 404, ms: 3, body: '{"message":"Resource not found"}' }
    },
    consume(ctx, message) {
      const store = (ctx.app.store ??= {})
      let o
      try {
        o = JSON.parse(message.body)
      } catch {
        return { ok: false, flow: 'order-subscriber-flow', errorType: 'MULE:EXPRESSION', error: { flow: 'order-subscriber-flow', file: ORDER_API, at: 1, name: 'Read order', dsl: '<ee:transform doc:name="Read order">', type: 'MULE:EXPRESSION', message: `Message ${message.id} is not JSON` } }
      }
      if ((store.orders ?? []).some((x) => x.order === o.order)) return { ok: true, flow: 'order-subscriber-flow', log: [info(`Order ${o.order} is stored already`)] }
      store.orders = keep(store.orders, o, 80)
      return { ok: true, flow: 'order-subscriber-flow', log: [info(`Order ${o.order} stored from ${o.source}, ${o.lines?.length ?? 0} lines`)] }
    },
  },
}

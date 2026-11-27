// The sample application of the shopify-hmac lab. Imports only platform-log.js and the import free Shopify engine, so
// the engine can load it without a cycle.
//
// harbor-shp-erp-receiver takes the orders/create webhooks of the Harbor web store and books each order in the ERP.
// It checks X-Shopify-Hmac-Sha256 first. webhook.hmacInput says what it hashes: parsed (the body parsed and written
// again, the bug) or raw (the bytes as they came). shopify.webhookSecret is the key it hashes with.
import { info, muleError, needs, warn } from '../platform-log.js'
import { hmacBase64, headerOf, safeEqual } from '../platform-shopify.js'

export const RECEIVER = 'harbor-shp-erp-receiver'
export const RECEIVER_FLOW = 'shopify-webhook-flow'
export const RECEIVER_PATH = '/webhooks/orders'
const keep = (list, item, n = 200) => [...(list ?? []), item].slice(-n)
const word = (v) => String(v ?? '').trim()
const short = (v) => `${String(v ?? '').slice(0, 10)}...`

// what the listener does with one webhook: check the signature, then book the order
export function receiveOrder(ctx, { id, topic, headers, body }) {
  const store = (ctx.app.store ??= {})
  const p = ctx.props
  const secret = word(p['shopify.webhookSecret'])
  let input = body
  if (word(p['webhook.hmacInput']) !== 'raw') {
    try {
      input = JSON.stringify(JSON.parse(body))
    } catch {
      input = body
    }
  }
  const header = headerOf(headers, 'X-Shopify-Hmac-Sha256')
  const computed = hmacBase64(secret, input)
  if (!safeEqual(computed, header)) {
    store.rejected = (store.rejected ?? 0) + 1
    return { status: 401, ms: 25, log: [warn(`Webhook ${id} ${topic} rejected with 401: HMAC mismatch. X-Shopify-Hmac-Sha256 ${short(header)} computed ${short(computed)} over the ${input === body ? 'raw' : 'parsed and written again'} body`)] }
  }
  if ((store.seen ?? []).includes(id)) return { status: 200, ms: 15, log: [info(`Webhook ${id} was booked before, skipped`)] }
  let order
  try {
    order = JSON.parse(body)
  } catch {
    return { status: 400, ms: 10, log: [warn(`Webhook ${id}: the body is not JSON`)] }
  }
  store.seen = keep(store.seen, id, 120)
  store.erp = keep(store.erp, order.name)
  return { status: 200, ms: 140, log: [info(`Order ${order.name} booked in the ERP (webhook ${id})`)] }
}

export const PACKAGES = {
  [RECEIVER]: {
    note: `Takes the orders/create webhooks of ${'harbor-goods.myshopify.com'} on POST /api${RECEIVER_PATH}, checks X-Shopify-Hmac-Sha256 and books each order in the ERP. webhook.hmacInput is parsed or raw: what the HMAC is computed over. shopify.webhookSecret is the key. GET /erp/orders lists the booked orders.`,
    sample: { method: 'GET', path: '/erp/orders' },
    boot: needs('shopify.shop', 'shopify.webhookSecret'),
    schedules: [{ flow: RECEIVER_FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    handle(ctx, req) {
      const path = req.path.split('?')[0]
      if (req.method === 'GET' && path === '/erp/orders') return { status: 200, ms: 20, body: JSON.stringify({ booked: ctx.app.store?.erp ?? [] }) }
      if (req.method === 'POST' && path === RECEIVER_PATH) {
        const r = receiveOrder(ctx, { id: headerOf(req.headers, 'X-Shopify-Webhook-Id') || 'manual', topic: headerOf(req.headers, 'X-Shopify-Topic') || 'orders/create', headers: req.headers, body: req.body ?? '' })
        return { status: r.status, ms: r.ms, log: r.log, body: r.status === 200 ? '' : '{"error":"Unauthorized"}' }
      }
      return { status: 404, ms: 3, body: '{"message":"Resource not found"}' }
    },
    run: {
      [RECEIVER_FLOW]: (ctx) => {
        const log = []
        let bad = 0
        const r = ctx.shopify.webhooks({ paths: [RECEIVER_PATH] }, (d) => {
          const x = receiveOrder(ctx, d)
          log.push(...x.log)
          if (x.status >= 400) bad++
          return x
        })
        if (bad) log.push(muleError({ message: `${bad} of ${r.count} webhooks failed the HMAC check and were answered with 401`, type: 'APP:UNAUTHORIZED', flow: RECEIVER_FLOW, file: RECEIVER, at: 2, name: 'Reject webhook', dsl: '<raise-error doc:name="Reject webhook" type="APP:UNAUTHORIZED" description="HMAC mismatch"/>' }))
        return { ok: bad === 0, ms: Math.max(10, ctx.shopify.elapsed()), errorType: bad ? 'APP:UNAUTHORIZED' : null, errors: bad, log }
      },
    },
  },
}

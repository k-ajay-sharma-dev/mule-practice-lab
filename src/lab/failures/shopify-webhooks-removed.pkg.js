// The sample application of the shopify-webhooks-removed lab. Imports only platform-log.js and the import free Shopify
// engine, so the engine can load it without a cycle.
//
// harbor-shp-orders-sync copies each new web order of the Harbor store to the order hub. It takes orders/create webhooks
// and, on POST /reconcile or in reconcile-flow, reads the orders updated since its watermark with the REST Admin API,
// plus the transactions of each order it did not have. On 429 it waits for Retry-After.
import { info, muleError, needs, warn } from '../platform-log.js'
import { fromIso, headerOf, iso, verifyWebhook } from '../platform-shopify.js'

export const SYNC = 'harbor-shp-orders-sync'
export const SYNC_FLOW = 'shopify-webhook-flow'
export const RECONCILE_FLOW = 'reconcile-flow'
export const SYNC_PATH = '/webhooks/orders'
const word = (v) => String(v ?? '').trim()
const keep = (list, items, n = 400) => [...(list ?? []), ...items].slice(-n)
const cfgOf = (p) => ({ shop: word(p['shopify.shop']), accessToken: word(p['shopify.accessToken']), apiVersion: word(p['shopify.apiVersion']) })

function receiveOrder(ctx, { id, topic, headers, body }) {
  const store = (ctx.app.store ??= {})
  if (!verifyWebhook(word(ctx.props['shopify.apiSecret']), body, headerOf(headers, 'X-Shopify-Hmac-Sha256'))) return { status: 401, ms: 20, log: [warn(`Webhook ${id} rejected with 401: HMAC mismatch`)] }
  const o = JSON.parse(body)
  if ((store.orders ?? []).includes(o.name)) return { status: 200, ms: 15, log: [info(`Order ${o.name} is in the order hub already (webhook ${id.slice(0, 8)})`)] }
  store.orders = keep(store.orders, [o.name])
  // the watermark moves only in a reconcile, so a webhook that comes in after a gap does not hide the gap
  store.byWebhook = keep(store.byWebhook, [o.name], 60)
  return { status: 200, ms: 120, log: [info(`Order ${o.name} sent to the order hub (${topic}, webhook ${id.slice(0, 8)})`)] }
}

// reads what the webhooks missed: orders updated since the watermark, page by page, and the transactions of each new one
export function reconcileOrders(ctx) {
  const store = (ctx.app.store ??= {})
  const cfg = cfgOf(ctx.props)
  const v = cfg.apiVersion || '2026-10'
  const since = iso((store.watermark ?? ctx.now) - 5 * 60000)
  const have = new Set(store.orders ?? [])
  const added = []
  let calls = 0
  let limited = 0
  const get = (path) => {
    for (let i = 0; i < 20; i++) {
      calls++
      const r = ctx.shopify.rest(cfg, 'GET', path)
      if (r.status !== 429) return r
      limited++
      ctx.shopify.wait(Math.ceil(Number(r.headers['Retry-After'] ?? 2) * 1000))
    }
    return { ok: false, status: 429, body: {} }
  }
  let path = `/admin/api/${v}/orders.json?status=any&limit=50&updated_at_min=${encodeURIComponent(since)}`
  let newest = store.watermark ?? 0
  while (path) {
    const r = get(path)
    if (!r.ok) return { ok: false, text: r.error ?? `GET orders.json answered ${r.status}: ${JSON.stringify(r.body?.errors ?? '')}`, calls, limited }
    for (const o of r.body.orders) {
      newest = Math.max(newest, fromIso(o.updated_at) ?? 0)
      if (have.has(o.name)) continue
      const tx = get(`/admin/api/${v}/orders/${o.id}/transactions.json`)
      if (!tx.ok) return { ok: false, text: `GET transactions.json of ${o.name} answered ${tx.status}`, calls, limited }
      have.add(o.name)
      added.push(o.name)
    }
    const next = String(r.headers.Link ?? '').match(/<https:\/\/[^/]+(\/admin\/api\/[^>]+)>; rel="next"/)
    path = next ? next[1] : null
  }
  store.orders = keep(store.orders, added)
  store.watermark = newest
  store.reconciled = ctx.now
  return { ok: true, added, calls, limited }
}
const reconcileLog = (r) => [info(`Reconcile read the orders since the watermark in ${r.calls} REST calls and added ${r.added.length} orders${r.added.length ? `: ${r.added.slice(0, 8).join(', ')}${r.added.length > 8 ? ' and more' : ''}` : ''}`), ...(r.limited ? [warn(`Shopify answered 429 Too Many Requests ${r.limited} times. The app waited for Retry-After each time`)] : [])]
const reconcileError = (text) => muleError({ message: text, type: 'APP:SHOPIFY_ERROR', flow: RECONCILE_FLOW, file: SYNC, at: 1, name: 'Read orders', dsl: '<http:request doc:name="Read orders" config-ref="Shopify_Admin_API" method="GET" path="/admin/api/${shopify.apiVersion}/orders.json">' })

export const PACKAGES = {
  [SYNC]: {
    note: `Copies each new web order of harbor-goods.myshopify.com to the order hub. Takes orders/create webhooks on POST /api${SYNC_PATH} and checks the HMAC with shopify.apiSecret. POST /reconcile, and the flow ${RECONCILE_FLOW} when it is enabled, read the orders updated since the watermark with the REST Admin API and shopify.accessToken. GET /orders/count answers how many orders the hub has.`,
    sample: { method: 'POST', path: '/reconcile' },
    boot: needs('shopify.shop', 'shopify.apiVersion', 'shopify.accessToken', 'shopify.apiSecret'),
    schedules: [
      { flow: SYNC_FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true },
      { flow: RECONCILE_FLOW, type: 'fixed', value: '60', unit: 'minutes', enabled: false },
    ],
    handle(ctx, req) {
      const path = req.path.split('?')[0]
      if (req.method === 'GET' && path === '/orders/count') return { status: 200, ms: 10, body: JSON.stringify({ count: (ctx.app.store?.orders ?? []).length, watermark: iso(ctx.app.store?.watermark ?? 0) }) }
      if (req.method === 'POST' && path === '/reconcile') {
        const r = reconcileOrders(ctx)
        if (!r.ok) return { status: 502, ms: 300, error: 'APP:SHOPIFY_ERROR', log: [reconcileError(r.text)], body: JSON.stringify({ error: r.text }) }
        return { status: 200, ms: Math.max(50, ctx.shopify.elapsed()), log: reconcileLog(r), body: JSON.stringify({ added: r.added.length, calls: r.calls, throttled: r.limited }) }
      }
      return { status: 404, ms: 3, body: '{"message":"Resource not found"}' }
    },
    run: {
      [SYNC_FLOW]: (ctx) => {
        const log = []
        let bad = 0
        ctx.shopify.webhooks({ paths: [SYNC_PATH] }, (d) => {
          const x = receiveOrder(ctx, d)
          log.push(...x.log)
          if (x.status >= 400) bad++
          return x
        })
        return { ok: bad === 0, ms: Math.max(10, ctx.shopify.elapsed()), errorType: bad ? 'APP:UNAUTHORIZED' : null, errors: bad, log }
      },
      [RECONCILE_FLOW]: (ctx) => {
        const r = reconcileOrders(ctx)
        if (!r.ok) return { ok: false, ms: 300, errorType: 'APP:SHOPIFY_ERROR', log: [reconcileError(r.text)] }
        return { ok: true, ms: Math.max(50, ctx.shopify.elapsed()), log: reconcileLog(r) }
      },
    },
  },
}

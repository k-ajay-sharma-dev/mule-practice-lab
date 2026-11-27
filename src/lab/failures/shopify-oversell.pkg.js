// The sample application of the shopify-oversell lab. Imports only platform-log.js and the import free Shopify engine,
// so the engine can load it without a cycle.
//
// harbor-shp-stock-sync keeps the stock of the Harbor Warehouse that the marketplace channel sells from. It takes the
// inventory_levels/update webhooks of the web store and writes the available quantity of each inventory item.
// stock.staleCheck is none (the bug: the last webhook to arrive wins) or updated_at (an update older than the one
// stored is dropped). POST /stock/reconcile reads every level with the Admin GraphQL API.
import { info, muleError, needs, warn } from '../platform-log.js'
import { fromIso, headerOf, verifyWebhook, WAREHOUSE } from '../platform-shopify.js'

export const STOCK = 'harbor-shp-stock-sync'
export const STOCK_FLOW = 'shopify-webhook-flow'
export const STOCK_PATH = '/webhooks/inventory'
const word = (v) => String(v ?? '').trim()
const cfgOf = (p) => ({ shop: word(p['shopify.shop']), accessToken: word(p['shopify.accessToken']), apiVersion: word(p['shopify.apiVersion']) })
const clock = (t) => new Date(Date.UTC(2026, 10, 2) + t).toISOString().slice(11, 19)
export const LEVELS_QUERY = `{ inventoryItems(first: 20) { edges { node { id sku inventoryLevels(first: 5) { edges { node { location { id name } quantities(names: ["available"]) { name quantity } updatedAt } } } } } } }`

function receiveLevel(ctx, { id, headers, body }) {
  const store = (ctx.app.store ??= {})
  if (!verifyWebhook(word(ctx.props['shopify.apiSecret']), body, headerOf(headers, 'X-Shopify-Hmac-Sha256'))) return { status: 401, ms: 20, log: [warn(`Webhook ${id} rejected with 401: HMAC mismatch`)] }
  const p = JSON.parse(body)
  if (p.location_id !== WAREHOUSE) return { status: 200, ms: 15, log: [] }
  const stock = (store.stock ??= {})
  const cur = stock[p.inventory_item_id]
  const t = fromIso(p.updated_at)
  const sku = cur?.sku ?? String(p.inventory_item_id)
  if (word(ctx.props['stock.staleCheck']) === 'updated_at' && cur && t < cur.at) {
    store.dropped = (store.dropped ?? 0) + 1
    return { status: 200, ms: 20, log: [info(`Dropped an older update for ${sku}: updated_at ${clock(t)} is before ${clock(cur.at)}, the stock stays ${cur.available}`)] }
  }
  stock[p.inventory_item_id] = { sku, available: p.available, at: t }
  store.applied = (store.applied ?? 0) + 1
  return { status: 200, ms: 60, log: [info(`Stock of ${sku} set to ${p.available} (updated_at ${clock(t)}, webhook ${id.slice(0, 8)})`)] }
}

// reads every level of the warehouse and writes the stock again
export function reconcile(ctx) {
  const store = (ctx.app.store ??= {})
  const r = ctx.shopify.graphql(cfgOf(ctx.props), LEVELS_QUERY)
  const e = r.body?.errors
  if (r.status !== 200 || e) return { ok: false, text: r.error ?? (typeof e === 'string' ? e : e?.[0]?.message) ?? `HTTP ${r.status}` }
  const stock = {}
  for (const { node } of r.body.data.inventoryItems.edges) {
    const lv = node.inventoryLevels.edges.map((x) => x.node).find((x) => x.location.id === `gid://shopify/Location/${WAREHOUSE}`)
    if (lv) stock[Number(node.id.split('/').pop())] = { sku: node.sku, available: lv.quantities.find((q) => q.name === 'available')?.quantity ?? 0, at: fromIso(lv.updatedAt) }
  }
  store.stock = stock
  store.reconciledAt = ctx.now
  return { ok: true, count: Object.keys(stock).length }
}

export const PACKAGES = {
  [STOCK]: {
    note: `Keeps the warehouse stock the marketplace channel sells from. Takes inventory_levels/update webhooks on POST /api${STOCK_PATH}, checks the HMAC with shopify.apiSecret and writes the available quantity per inventory item. stock.staleCheck is none or updated_at. GET /stock/{sku} answers what the marketplace sees, POST /stock/reconcile reads every level from the Admin GraphQL API with shopify.accessToken.`,
    sample: { method: 'GET', path: '/stock/H-2000' },
    boot: needs('shopify.shop', 'shopify.apiVersion', 'shopify.accessToken', 'shopify.apiSecret'),
    schedules: [{ flow: STOCK_FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    handle(ctx, req) {
      const path = req.path.split('?')[0]
      const stock = ctx.app.store?.stock ?? {}
      if (req.method === 'GET' && path === '/stock') return { status: 200, ms: 15, body: JSON.stringify(Object.values(stock).map((x) => ({ sku: x.sku, available: x.available }))) }
      const one = req.method === 'GET' && path.match(/^\/stock\/([\w-]+)$/)
      if (one) {
        const x = Object.values(stock).find((z) => z.sku === one[1])
        return x ? { status: 200, ms: 15, body: JSON.stringify({ sku: x.sku, available: x.available, updatedAt: new Date(Date.UTC(2026, 10, 2) + x.at).toISOString() }) } : { status: 404, ms: 5, body: '{"message":"Unknown SKU"}' }
      }
      if (req.method === 'POST' && path === '/stock/reconcile') {
        const r = reconcile(ctx)
        if (!r.ok) return { status: 502, ms: 400, error: 'APP:SHOPIFY_ERROR', log: [muleError({ message: r.text, type: 'APP:SHOPIFY_ERROR', flow: 'post:\\stock\\reconcile', file: STOCK, at: 1, name: 'Read inventory levels', dsl: '<http:request doc:name="Read inventory levels" config-ref="Shopify_Admin_API" method="POST">' })], body: JSON.stringify({ error: r.text }) }
        return { status: 200, ms: 400, log: [info(`Reconciled ${r.count} inventory items from Shopify`)], body: JSON.stringify({ reconciled: r.count }) }
      }
      return { status: 404, ms: 3, body: '{"message":"Resource not found"}' }
    },
    run: {
      [STOCK_FLOW]: (ctx) => {
        const log = []
        let bad = 0
        ctx.shopify.webhooks({ paths: [STOCK_PATH] }, (d) => {
          const x = receiveLevel(ctx, d)
          log.push(...x.log)
          if (x.status >= 400) bad++
          return x
        })
        return { ok: bad === 0, ms: Math.max(10, ctx.shopify.elapsed()), errorType: bad ? 'APP:UNAUTHORIZED' : null, errors: bad, log }
      },
    },
  },
}

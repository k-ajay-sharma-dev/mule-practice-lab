// The sample application of the shopify-cost lab. Imports only platform-log.js and the import free Shopify engine, so
// the engine can load it without a cycle.
//
// brightmart-shp-order-export copies every order of the Brightmart web store to the data warehouse each night at 02:00 UTC.
// export.mode paged reads orders with the Admin GraphQL API, export.pageSize orders a page. export.onThrottle says what
// it does on THROTTLED: fail (the bug) or wait (it reads throttleStatus and waits until the bucket holds the cost).
// export.mode bulk runs bulkOperationRunQuery, polls currentBulkOperation and reads the JSONL file.
import { info, muleError, needs, warn } from '../platform-log.js'

export const EXPORTER = 'brightmart-shp-order-export'
export const EXPORT_FLOW = 'order-export-flow'
const word = (v) => String(v ?? '').trim()
const cfgOf = (p) => ({ shop: word(p['shopify.shop']), accessToken: word(p['shopify.accessToken']), apiVersion: word(p['shopify.apiVersion']) })
export const pageQuery = (n) => `query Orders($after: String) { orders(first: ${n}, after: $after) { edges { node { id name createdAt lineItems(first: 10) { edges { node { sku quantity } } } } } pageInfo { hasNextPage endCursor } } }`
export const BULK_QUERY = '{ orders { edges { node { id name createdAt totalPriceSet { shopMoney { amount } } lineItems { edges { node { sku quantity } } } } } } }'
const err = (message, type, at = 1, name = 'Read orders page') => muleError({ message, type, flow: EXPORT_FLOW, file: EXPORTER, at, name, dsl: `<http:request doc:name="${name}" config-ref="Shopify_Admin_API" method="POST" path="/admin/api/\${shopify.apiVersion}/graphql.json">` })
const failed = (ctx, log, message, type) => ({ ok: false, ms: Math.max(10, ctx.shopify.elapsed()), errorType: type, log: [...log, err(message, type)] })

function paged(ctx, log) {
  const p = ctx.props
  const size = Math.max(1, Math.floor(Number(p['export.pageSize']) || 50))
  const wait = word(p['export.onThrottle']) === 'wait'
  let after = null
  let count = 0
  let pages = 0
  let waited = 0
  for (let guard = 0; guard < 3000; guard++) {
    const r = ctx.shopify.graphql(cfgOf(p), pageQuery(size), { after })
    if (r.status !== 200) return failed(ctx, log, r.error ?? `HTTP POST on resource graphql.json failed: unauthorized (401). ${JSON.stringify(r.body?.errors ?? '')}`, r.status === 0 ? 'HTTP:CONNECTIVITY' : 'HTTP:UNAUTHORIZED')
    const e = r.body.errors?.[0]
    const cost = r.body.extensions?.cost
    if (e?.extensions?.code === 'THROTTLED') {
      const st = cost.throttleStatus
      if (!wait) return failed(ctx, log, `Shopify answered THROTTLED on page ${pages + 1}: requestedQueryCost ${cost.requestedQueryCost}, currentlyAvailable ${st.currentlyAvailable} of ${st.maximumAvailable}, restoreRate ${st.restoreRate} a second`, 'APP:SHOPIFY_THROTTLED')
      const ms = Math.ceil(((cost.requestedQueryCost - st.currentlyAvailable) / st.restoreRate) * 1000) + 50
      waited += ms
      ctx.shopify.wait(ms)
      continue
    }
    if (e) return failed(ctx, log, `Shopify answered ${e.extensions?.code ?? 'an error'}: ${e.message}`, e.extensions?.code === 'MAX_COST_EXCEEDED' ? 'APP:SHOPIFY_QUERY_COST' : 'APP:SHOPIFY_ERROR')
    const page = r.body.data.orders
    count += page.edges.length
    pages++
    if (pages === 1) log.push(info(`Page 1: ${page.edges.length} orders, requestedQueryCost ${cost.requestedQueryCost}, actualQueryCost ${cost.actualQueryCost}, currentlyAvailable ${cost.throttleStatus.currentlyAvailable}`))
    if (!page.pageInfo.hasNextPage) break
    after = page.pageInfo.endCursor
  }
  if (waited) log.push(info(`Waited ${(waited / 1000).toFixed(1)} s in all for the bucket to restore`))
  return { count, pages }
}

function bulk(ctx, log) {
  const cfg = cfgOf(ctx.props)
  const m = ctx.shopify.graphql(cfg, `mutation { bulkOperationRunQuery(query: """${BULK_QUERY}""") { bulkOperation { id status } userErrors { field message } } }`)
  if (m.status !== 200) return failed(ctx, log, m.error ?? 'HTTP POST on resource graphql.json failed: unauthorized (401).', m.status === 0 ? 'HTTP:CONNECTIVITY' : 'HTTP:UNAUTHORIZED')
  const run = m.body.data?.bulkOperationRunQuery
  if (!run || run.userErrors.length) return failed(ctx, log, `bulkOperationRunQuery: ${run?.userErrors[0]?.message ?? m.body.errors?.[0]?.message}`, 'APP:SHOPIFY_ERROR')
  log.push(info(`Bulk operation ${run.bulkOperation.id} created`))
  for (let i = 0; i < 120; i++) {
    ctx.shopify.wait(5000)
    const r = ctx.shopify.graphql(cfg, '{ currentBulkOperation { id status objectCount url } }')
    const op = r.body?.data?.currentBulkOperation
    if (op?.status === 'COMPLETED') {
      const file = ctx.shopify.download(op.url)
      if (!file.ok) return failed(ctx, log, `Download of the bulk file failed: ${file.body}`, 'HTTP:FORBIDDEN')
      const rows = file.body.split('\n').filter(Boolean).map((x) => JSON.parse(x))
      log.push(info(`Bulk operation COMPLETED: ${op.objectCount} objects in the JSONL file`))
      return { count: rows.filter((x) => !x.__parentId).length, pages: 1 }
    }
    if (op && op.status !== 'RUNNING' && op.status !== 'CREATED') return failed(ctx, log, `Bulk operation ${op.id} ended with ${op.status}`, 'APP:SHOPIFY_ERROR')
  }
  return failed(ctx, log, 'The bulk operation did not finish within 10 minutes', 'APP:SHOPIFY_ERROR')
}

export const PACKAGES = {
  [EXPORTER]: {
    note: 'Copies every order of brightmart-goods.myshopify.com to the data warehouse each night at 02:00 UTC through the Admin GraphQL API. export.mode is paged or bulk. With paged, export.pageSize orders come in each call and export.onThrottle is fail or wait. shopify.accessToken is the Admin API access token. GET /export/status shows the last run.',
    sample: { method: 'GET', path: '/export/status' },
    boot: needs('shopify.shop', 'shopify.apiVersion', 'shopify.accessToken', 'export.mode'),
    schedules: [{ flow: EXPORT_FLOW, type: 'cron', value: '0 0 2 * * ?', tz: 'UTC', enabled: true }],
    handle(ctx, req) {
      if (req.method === 'GET' && req.path.split('?')[0] === '/export/status') return { status: 200, ms: 10, body: JSON.stringify({ lastOk: ctx.app.store?.lastOk ?? null, exported: ctx.app.store?.exported ?? 0 }) }
      return { status: 404, ms: 3, body: '{"message":"Resource not found"}' }
    },
    run: {
      [EXPORT_FLOW]: (ctx) => {
        const mode = word(ctx.props['export.mode'])
        const log = [info(`Order export started, mode ${mode}`)]
        const r = mode === 'bulk' ? bulk(ctx, log) : paged(ctx, log)
        if (r.ok === false) return r
        const ms = ctx.shopify.elapsed()
        log.push(info(`Exported ${r.count} orders in ${r.pages} ${r.pages === 1 ? 'request' : 'pages'}, ${(ms / 1000).toFixed(1)} s`))
        if (ms > 15 * 60000) log.push(warn('The export took more than 15 minutes'))
        return { ok: true, ms: Math.max(10, ms), log, store: { exported: r.count, lastOk: ctx.now, mode } }
      },
    },
  },
}

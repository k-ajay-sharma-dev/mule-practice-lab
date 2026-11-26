// The sample applications of the led-chatty-calls lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
// A partner endpoint lists the lines of an order with the stock of each line. Release 1.4.0 of the Process API reads the
// stock in a For Each, one call per line. The property inventory.lookup stands for the code of the release: for-each,
// parallel (Parallel For Each with inventory.maxConcurrency and a cache of inventory.cache.ttlSeconds) or bulk (one call
// to the bulk endpoint of inventory-sapi 1.1.0).
import { info, muleError, needs, warn } from '../platform-log.js'
import { LED_PACKAGES } from '../platform-led.js'

export const LOOKUPS = ['for-each', 'parallel', 'bulk']
export const BULK_MAX = 200 // SKUs the bulk endpoint takes in one call
const json = (value) => JSON.stringify(value)
const number = (value, fallback) => (Number(value) > 0 ? Math.floor(Number(value)) : fallback)
const STATUS_OF = { 'HTTP:TIMEOUT': 504, 'HTTP:GATEWAY_TIMEOUT': 504, 'HTTP:CONNECTIVITY': 503, 'HTTP:SERVICE_UNAVAILABLE': 503, 'HTTP:TOO_MANY_REQUESTS': 503 }
const MESSAGE = { 504: 'A system did not answer in time', 503: 'A system is not available' }

// O-2040 has 40 lines, O-2003 has 3. Other orders have 2.
export const linesOf = (orderId) => {
  const n = Number(String(orderId).match(/^O-20(\d\d)$/)?.[1]) || 2
  return Array.from({ length: n }, (_, i) => ({ line: i + 1, sku: `H-${101 + i}`, qty: 1 + (i % 4) }))
}
export const lookupOf = (props) => (LOOKUPS.includes(props['inventory.lookup']) ? props['inventory.lookup'] : 'for-each')
export const parallelOf = (props) => ({ max: number(props['inventory.maxConcurrency'], 0), ttl: number(props['inventory.cache.ttlSeconds'], 0) })

const failed = (r, ms, flow, file, name, extra) => {
  const status = STATUS_OF[r.error] ?? 500
  const error = { flow, file, at: 2, name, dsl: `<http:request method="GET" doc:name="${name}" config-ref="${name.replace(/\W+/g, '_')}_Config" path="${r.path}">`, type: r.error, message: `HTTP GET on resource '${r.url}${r.path}' failed: ${r.text}.${extra ? ` ${extra}` : ''}` }
  return { status, ms, flow, error: r.error, log: [muleError(error)], body: json({ message: MESSAGE[status] ?? 'Internal server error' }) }
}

function readLines(ctx, req, id) {
  const { props, call } = ctx
  const file = 'order-fulfilment-papi'
  const flow = 'get:\\orders\\(orderId)\\lines'
  const auth = { clientId: props['sapi.client_id'], clientSecret: props['sapi.client_secret'] }
  const limit = number(props['http.timeout'], 10000)
  const timeout = number(props['inventory.timeout'], limit)
  const order = call('orders.url', { method: 'GET', path: `/orders/${id}`, ...auth }, limit)
  if (order.status === 404) return { status: 404, ms: order.ms + 20, flow, error: order.error, body: json({ message: 'Order not found' }) }
  if (order.error) return failed(order, order.ms + 20, flow, file, 'Orders API')
  const o = JSON.parse(order.body)
  const lines = linesOf(id)
  const stock = (sku) => call('inventory.url', { method: 'GET', path: `/inventory/${sku}`, ...auth }, timeout)
  const done = (ms, available, log) => ({ status: 200, ms, flow, body: json({ orderId: o.orderId, status: o.status, lines: lines.map((l) => ({ ...l, available: available[l.sku] })) }), log })
  const mode = lookupOf(props)
  let ms = order.ms + 20

  if (mode === 'bulk') {
    const r = call('inventory.url', { method: 'GET', path: `/inventory?skus=${lines.map((l) => l.sku).join(',')}`, ...auth }, timeout)
    ms += r.ms
    if (r.error) return failed(r, ms + 10, flow, file, 'Inventory API', r.error === 'HTTP:NOT_FOUND' ? 'The bulk resource GET /inventory?skus= is not in this release of the Inventory System API.' : '')
    const available = Object.fromEntries(JSON.parse(r.body).items.map((x) => [x.sku, x.available]))
    return done(ms + 15, available, [info(`Stock of ${lines.length} order lines read with 1 bulk call to the Inventory API in ${r.ms} ms`)])
  }

  if (mode === 'parallel') {
    const { max, ttl } = parallelOf(props)
    const store = (ctx.app.store ??= {})
    const cache = (store.stockCache ??= {})
    const available = {}
    const misses = []
    for (const l of lines) {
      const hit = cache[l.sku]
      if (ttl && hit && ctx.now - hit.t < ttl * 1000) available[l.sku] = hit.available
      else misses.push(l.sku)
    }
    const width = max || misses.length || 1 // without maxConcurrency every route runs at once
    const results = misses.map((sku) => [sku, stock(sku)])
    let slowest = 0
    for (let i = 0; i < results.length; i += width) slowest += Math.max(...results.slice(i, i + width).map(([, r]) => r.ms))
    ms += slowest
    const errors = results.filter(([, r]) => r.error)
    for (const [sku, r] of results) {
      if (r.error) continue
      available[sku] = JSON.parse(r.body).available
      if (ttl) cache[sku] = { available: available[sku], t: ctx.now }
    }
    const summary = `Parallel For Each over ${lines.length} order lines: ${lines.length - misses.length} from the cache, ${misses.length} calls to the Inventory API, ${max ? `at most ${max}` : 'all'} at a time, ${slowest} ms`
    if (errors.length) {
      const [, first] = errors[0]
      const error = { flow, file, at: 2, name: 'Stock of each line', dsl: `<parallel-foreach doc:name="Stock of each line" collection="#[vars.lines]" maxConcurrency="\${inventory.maxConcurrency}">`, type: 'MULE:COMPOSITE_ROUTING', message: `${errors.length} of ${results.length} routes failed. The first: HTTP GET on resource '${first.url}${first.path}' failed: ${first.text}.` }
      return { status: 500, ms: ms + 10, flow, error: 'MULE:COMPOSITE_ROUTING', log: [warn(summary), muleError(error)], body: json({ message: 'Internal server error' }) }
    }
    return done(ms + 15, available, [info(summary)])
  }

  // for-each: one call per line, one after the other. The first error stops the scope.
  const available = {}
  let calls = 0
  for (const l of lines) {
    const r = stock(l.sku)
    calls++
    ms += r.ms
    if (r.error) {
      const out = failed(r, ms + 10, flow, file, 'Inventory API', `For Each stopped at line ${l.line} of ${lines.length}, after ${calls} calls.`)
      return { ...out, log: [warn(`For Each over ${lines.length} order lines: ${calls} calls to the Inventory API in ${ms - order.ms - 20} ms, then ${r.error}`), ...out.log] }
    }
    available[l.sku] = JSON.parse(r.body).available
  }
  return done(ms + 15, available, [info(`For Each over ${lines.length} order lines: ${calls} calls to the Inventory API, one after the other, in ${ms - order.ms - 20} ms`)])
}

const papi = LED_PACKAGES['order-fulfilment-papi']
const eapi = LED_PACKAGES['partner-orders-eapi']
const inventory = LED_PACKAGES['inventory-sapi']

export const PACKAGES = {
  'order-fulfilment-papi-lines': {
    ...papi,
    note: 'Release 1.4.0 of the Process API. Adds GET /orders/{orderId}/lines: the lines of an order with the stock of each line. inventory.lookup is for-each, parallel or bulk.',
    boot(ctx) {
      const gone = needs('customers.url', 'orders.url', 'inventory.url', 'sapi.client_id', 'sapi.client_secret')(ctx)
      if (gone) return gone
      const value = ctx.props['inventory.lookup']
      return value && !LOOKUPS.includes(value) ? `inventory.lookup is "${value}". Use one of ${LOOKUPS.join(', ')}.` : null
    },
    volatileStore: () => true, // the cache lives in memory, so a restart empties it
    handle(ctx, req) {
      const id = req.method === 'GET' && req.path.split('?')[0].match(/^\/orders\/([\w-]+)\/lines$/)?.[1]
      return id ? readLines(ctx, req, id) : papi.handle(ctx, req)
    },
  },
  'partner-orders-eapi-lines': {
    ...eapi,
    note: 'Release 1.2.0 of the partner Experience API. Adds GET /partner-orders/{orderId}/lines.',
    handle(ctx, req) {
      const id = req.method === 'GET' && req.path.split('?')[0].match(/^\/partner-orders\/([\w-]+)\/lines$/)?.[1]
      if (!id) return eapi.handle(ctx, req)
      const { props, call } = ctx
      const flow = 'get:\\partner-orders\\(orderId)\\lines'
      const r = call('papi.url', { method: 'GET', path: `/orders/${id}/lines`, clientId: props['papi.client_id'], clientSecret: props['papi.client_secret'] }, number(props['http.timeout'], 10000))
      if (!r.error) return { status: 200, ms: r.ms + 15, flow, body: r.body }
      if (r.status === 404) return { status: 404, ms: r.ms + 15, flow, error: r.error, body: json({ message: 'Order not found' }) }
      const status = STATUS_OF[r.error] ?? 502
      const error = { flow, file: 'partner-orders-eapi', at: 2, name: 'Order Fulfilment API', dsl: `<http:request method="GET" doc:name="Order Fulfilment API" config-ref="Order_Fulfilment_API_Config" path="${r.path}">`, type: r.error, message: `HTTP GET on resource '${r.url}${r.path}' failed: ${r.text}.` }
      return { status, ms: r.ms + 15, flow, error: r.error, log: [muleError(error)], body: json({ message: MESSAGE[status] ?? 'Internal server error' }) }
    },
  },
  'inventory-sapi-bulk': {
    ...inventory,
    note: `Release 1.1.0 of the Inventory System API. Adds GET /inventory?skus=H-101,H-102: the stock of up to ${BULK_MAX} products in one call, read from one stock file.`,
    handle(ctx, req) {
      const [path, query = ''] = req.path.split('?')
      if (req.method !== 'GET' || path !== '/inventory') return inventory.handle(ctx, req)
      const flow = 'get:\\inventory'
      const skus = (new URLSearchParams(query).get('skus') ?? '').split(',').map((x) => x.trim()).filter(Boolean)
      if (!skus.length || skus.length > BULK_MAX) return { status: 400, ms: 8, flow, error: 'APIKIT:BAD_REQUEST', body: json({ message: `Give 1 to ${BULK_MAX} SKUs in skus` }) }
      const be = ctx.backend('sftp')
      if (!be.up || ctx.props['sftp.host'] !== 'sftp.harbor.lab') {
        const error = { flow, file: 'inventory-sapi', at: 1, name: 'Read stock file', dsl: '<sftp:read doc:name="Read stock file" config-ref="SFTP_Config">', type: 'SFTP:CONNECTIVITY', message: `Could not establish SFTP connection with host ${ctx.props['sftp.host']} at port 22: Connection refused` }
        return { status: 500, ms: 3000, flow, error: 'SFTP:CONNECTIVITY', log: [muleError(error)], body: json({ message: 'Internal server error' }) }
      }
      ctx.say(`SFTP server answered in ${be.ms} ms. ${skus.length} SKUs read from one stock file.`)
      return { status: 200, ms: be.ms + 20 + skus.length, flow, body: json({ items: skus.map((sku) => ({ sku, available: 24 })) }) }
    },
  },
}

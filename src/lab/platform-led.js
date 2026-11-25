// The API-led project of the Anypoint console: two Experience APIs, one Process API, three System APIs and a consumer.
// An application calls another one through ctx.call(), so a failure or a delay in one layer shows up in the layers above.
import { muleError, needs, warn } from './platform-log.js'

export const LAYERS = ['Experience', 'Process', 'System']
export const LAYER_PROPERTY = 'anypoint.platform.visualizer.layer'

// What the System APIs stand in front of. A lab or the Backends page can stop one or make it slow.
export const BACKENDS = {
  sqlserver: { name: 'SQL Server', ms: 40 },
  oracle: { name: 'Oracle', ms: 60 },
  postgres: { name: 'PostgreSQL', ms: 45 },
  sftp: { name: 'SFTP server', ms: 120 },
}

const CUSTOMER = { id: 'C-7', name: 'Harbor Deli', email: 'orders@harbordeli.example' }
const json = (value) => JSON.stringify(value)
const answer = (status, ms, flow, value) => ({ status, ms, flow, body: json(value) })
const notFound = (flow, ms = 10) => ({ status: 404, ms, flow, error: 'APIKIT:NOT_FOUND', body: json({ message: 'Resource not found' }) })

function backendError(id, host, flow, file) {
  const at = { flow, file, at: 1 }
  if (id === 'sftp') return { ...at, name: 'Read stock file', dsl: '<sftp:read doc:name="Read stock file" config-ref="SFTP_Config">', type: 'SFTP:CONNECTIVITY', message: `Could not establish SFTP connection with host ${host} at port 22: Connection refused` }
  const text = { sqlserver: `Cannot get connection for URL jdbc:sqlserver://${host}:1433: The TCP/IP connection to the host has failed.`, oracle: `Cannot get connection for URL jdbc:oracle:thin:@${host}:1521/ORDERS: ORA-12541: TNS:no listener`, postgres: `Cannot get connection for URL jdbc:postgresql://${host}:5432/orders: Connection refused` }[id]
  return { ...at, name: 'Database call', dsl: '<db:select doc:name="Database call" config-ref="Database_Config">', type: 'DB:CONNECTIVITY', message: text }
}

// A System API: one backend, one property with its host
function system({ backend, hostKey, host, file, sample, routes }) {
  return {
    layer: 'System',
    sample,
    traced: true,
    backend,
    boot: needs(hostKey),
    handle(ctx, req) {
      const path = req.path.split('?')[0]
      const route = routes.find((r) => r.method === req.method && r.path.test(path))
      if (!route) return notFound(`${file}-main`)
      const be = ctx.backend(backend)
      if (!be.up || ctx.props[hostKey] !== host) {
        const error = backendError(backend, ctx.props[hostKey], route.flow, file)
        return { status: 500, ms: 3000, flow: route.flow, error: error.type, log: [muleError(error)], body: json({ message: 'Internal server error' }) }
      }
      ctx.say(`${BACKENDS[backend].name} answered in ${be.ms} ms`)
      return route.run(path.split('/').at(-1), be.ms + 20, route.flow, req)
    },
  }
}

const OUTCOME = { 'HTTP:NOT_FOUND': 404, 'HTTP:TIMEOUT': 504, 'HTTP:GATEWAY_TIMEOUT': 504, 'HTTP:CONNECTIVITY': 503, 'HTTP:SERVICE_UNAVAILABLE': 503, 'HTTP:TOO_MANY_REQUESTS': 503, 'HTTP:INTERNAL_SERVER_ERROR': 502, 'HTTP:BAD_GATEWAY': 502 }
// What a caller answers when a call to the layer below failed. A rejected credential is a fault of the caller, so it is 500.
function relay(r, ms, flow, file, name) {
  const status = OUTCOME[r.error] ?? 500
  const error = { flow, file, at: 2, name, dsl: `<http:request method="${r.method}" doc:name="${name}" config-ref="${name.replace(/\W+/g, '_')}_Config" path="${r.path}">`, type: r.error, message: `HTTP ${r.method} on resource '${r.url}${r.path}' failed: ${r.text}.` }
  return { status, ms, flow, error: r.error, log: status === 404 ? undefined : [muleError(error)], body: json({ message: status === 404 ? 'Order not found' : { 504: 'A system did not answer in time', 503: 'A system is not available' }[status] ?? 'Internal server error' }) }
}
const number = (value, fallback) => (Number(value) > 0 ? Number(value) : fallback)

function experience({ file, path, sample, shape }) {
  return {
    layer: 'Experience',
    sample,
    traced: true,
    calls: ['papi.url'],
    boot: needs('papi.url', 'papi.client_id', 'papi.client_secret'),
    handle(ctx, req) {
      const { props, call } = ctx
      const id = req.path.split('?')[0].match(path)
      if (!id || !['GET', 'POST'].includes(req.method) || (req.method === 'GET') === !id[1]) return notFound(`${file}-main`)
      const flow = id[1] ? `get:${sample.path.split('/').slice(0, 2).join('\\')}\\(orderId)` : `post:\\${sample.path.split('/')[1]}`
      const r = call('papi.url', { method: req.method, path: id[1] ? `/orders/${id[1]}/status` : '/orders', body: req.body, clientId: props['papi.client_id'], clientSecret: props['papi.client_secret'] }, number(props['http.timeout'], 10000))
      if (r.error) return relay(r, r.ms + 15, flow, file, 'Order Fulfilment API')
      return answer(r.status, r.ms + 15, flow, shape(JSON.parse(r.body)))
    },
  }
}

export const LED_PACKAGES = {
  'mobile-orders-eapi': {
    note: 'Experience API for the mobile app. Short answers.',
    ...experience({ file: 'mobile-orders-eapi', path: /^\/my-orders(?:\/([\w-]+))?$/, sample: { method: 'GET', path: '/my-orders/O-1001' }, shape: (o) => ({ id: o.orderId, status: o.status, inStock: o.stock === 'unknown' ? 'unknown' : o.stock > 0 }) }),
  },
  'partner-orders-eapi': {
    note: 'Experience API for partners. Fuller answers.',
    ...experience({ file: 'partner-orders-eapi', path: /^\/partner-orders(?:\/([\w-]+))?$/, sample: { method: 'GET', path: '/partner-orders/O-1001' }, shape: (o) => o }),
  },
  'order-fulfilment-papi': {
    note: 'Process API. Joins customers, orders and inventory, creates orders and sends an event to a queue.',
    layer: 'Process',
    sample: { method: 'GET', path: '/orders/O-1001/status' },
    traced: true,
    calls: ['customers.url', 'orders.url', 'inventory.url'],
    boot: needs('customers.url', 'orders.url', 'inventory.url', 'sapi.client_id', 'sapi.client_secret'),
    handle(ctx, req) {
      const { props, call } = ctx
      const file = 'order-fulfilment-papi'
      const path = req.path.split('?')[0]
      const auth = { clientId: props['sapi.client_id'], clientSecret: props['sapi.client_secret'] }
      const limit = number(props['http.timeout'], 10000)
      const get = (key, at, timeout = limit) => call(key, { method: 'GET', path: at, ...auth }, timeout)
      const stock = () => get('inventory.url', '/inventory/H-100', number(props['inventory.timeout'], limit))
      const id = req.method === 'GET' && path.match(/^\/orders\/([\w-]+)\/status$/)?.[1]
      if (id) {
        const flow = 'get:\\orders\\(orderId)\\status'
        const order = get('orders.url', `/orders/${id}`)
        if (order.error) return relay(order, order.ms + 20, flow, file, 'Orders API')
        const o = JSON.parse(order.body)
        // a Scatter-Gather: the two calls run side by side, so the slower one sets the time
        const [customer, items] = [get('customers.url', `/customers/${o.customerId}`), stock()]
        const ms = order.ms + Math.max(customer.ms, items.ms) + 25
        if (customer.error) return relay(customer, ms, flow, file, 'Customers API')
        if (items.error && props['inventory.fallback'] !== 'true') return relay(items, ms, flow, file, 'Inventory API')
        const extra = items.error ? [warn(`Inventory API failed with ${items.error}. Answering without the stock.`)] : undefined
        return { ...answer(200, ms, flow, { orderId: o.orderId, status: o.status, customer: JSON.parse(customer.body), stock: items.error ? 'unknown' : JSON.parse(items.body).available }), log: extra }
      }
      if (req.method === 'POST' && path === '/orders') {
        const flow = 'post:\\orders'
        const customer = get('customers.url', `/customers/${CUSTOMER.id}`)
        if (customer.error) return relay(customer, customer.ms + 20, flow, file, 'Customers API')
        const items = stock()
        if (items.error && props['inventory.fallback'] !== 'true') return relay(items, customer.ms + items.ms + 20, flow, file, 'Inventory API')
        const made = call('orders.url', { method: 'POST', path: '/orders', body: req.body, ...auth }, limit)
        if (made.error) return relay(made, customer.ms + items.ms + made.ms + 20, flow, file, 'Orders API')
        const { orderId } = JSON.parse(made.body)
        if (props['events.queue']) ctx.put(props['events.queue'], json({ event: 'OrderCreated', orderId }))
        return answer(201, customer.ms + items.ms + made.ms + 45, flow, { orderId })
      }
      return notFound(`${file}-main`)
    },
  },
  'customers-sapi': {
    note: 'System API in front of SQL Server.',
    ...system({ backend: 'sqlserver', hostKey: 'db.host', host: 'sql01.harbor.lab', file: 'customers-sapi', sample: { method: 'GET', path: '/customers/C-7' }, routes: [{ method: 'GET', path: /^\/customers\/[\w-]+$/, flow: 'get:\\customers\\(customerId)', run: (id, ms, flow) => (id === 'C-999' ? notFound(flow, ms) : answer(200, ms, flow, { ...CUSTOMER, id })) }] }),
  },
  'inventory-sapi': {
    note: 'System API that reads stock files over SFTP.',
    ...system({ backend: 'sftp', hostKey: 'sftp.host', host: 'sftp.harbor.lab', file: 'inventory-sapi', sample: { method: 'GET', path: '/inventory/H-100' }, routes: [{ method: 'GET', path: /^\/inventory\/[\w-]+$/, flow: 'get:\\inventory\\(sku)', run: (sku, ms, flow) => answer(200, ms, flow, { sku, available: 24 }) }] }),
  },
  'warehouse-consumer': {
    note: 'Takes order events from a queue, 10 a minute per replica, and writes them for the warehouse over SFTP.',
    layer: 'Process',
    boot: needs('queue.name'),
    consumes: 'queue.name',
    rate: 10,
    consume(ctx, message) {
      if (ctx.backend('sftp').up) return { ok: true, flow: 'warehouse-flow', log: [] }
      return { ok: false, flow: 'warehouse-flow', errorType: 'SFTP:CONNECTIVITY', error: { ...backendError('sftp', 'sftp.harbor.lab', 'warehouse-flow', 'warehouse-consumer'), message: `Could not write ${message.id}: SFTP connection refused` } }
    },
  },
}
// Two releases of the same API: the contract stays, the database behind it changes
const orders = (backend, host) =>
  system({
    backend, hostKey: 'db.host', host, file: 'orders-sapi', sample: { method: 'GET', path: '/orders/O-1001' },
    routes: [
      { method: 'GET', path: /^\/orders\/[\w-]+$/, flow: 'get:\\orders\\(orderId)', run: (id, ms, flow) => (/^O-9/.test(id) ? { status: 404, ms, flow, error: 'ORDERS:NOT_FOUND', body: json({ message: 'Order not found' }) } : answer(200, ms, flow, { orderId: id, status: 'PACKED', customerId: CUSTOMER.id })) },
      { method: 'POST', path: /^\/orders$/, flow: 'post:\\orders', run: (_, ms, flow) => answer(201, ms, flow, { orderId: 'O-1050' }) },
    ],
  })
LED_PACKAGES['orders-sapi'] = { note: 'System API in front of Oracle.', ...orders('oracle', 'ora01.harbor.lab') }
LED_PACKAGES['orders-sapi-v2'] = { note: 'Release 2.0.0 of the Orders System API, in front of PostgreSQL. The contract is the same.', ...orders('postgres', 'pg01.harbor.lab') }

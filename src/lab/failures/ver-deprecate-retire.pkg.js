// The sample applications of the ver-deprecate-retire lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
import { LAYER_PROPERTY, LED_PACKAGES } from '../platform-led.js'
import { muleError, needs } from '../platform-log.js'

export { LAYER_PROPERTY }

export const PKG = {
  customers2: 'ver-retire-customers-sapi-2-0-0',
  process11: 'ver-retire-order-fulfilment-papi-1-1-0',
  returns12: 'ver-retire-returns-papi-1-2-0',
  returns13: 'ver-retire-returns-papi-1-3-0',
}

const json = (value) => JSON.stringify(value)
const customers = LED_PACKAGES['customers-sapi']
const papi = LED_PACKAGES['order-fulfilment-papi']

// Customers System API v2: the field email is called contactEmail
const customersV2 = {
  ...customers,
  note: 'Release 2.0.0 of the Customers System API, API version v2. The customer has contactEmail instead of email.',
  handle(ctx, req) {
    const r = customers.handle(ctx, req)
    if (r.status !== 200 || !r.body) return r
    const { email, ...rest } = JSON.parse(r.body)
    return { ...r, body: json({ ...rest, contactEmail: email }) }
  },
}

// The Process API since last week: it calls v2 and maps contactEmail back to email for its own callers
const processV2 = {
  ...papi,
  note: 'Release 1.1.0 of the Order Fulfilment Process API. Calls the Customers System API v2 and maps contactEmail to email.',
  handle(ctx, req) {
    const r = papi.handle(ctx, req)
    if (r.status !== 200 || !r.body) return r
    const o = JSON.parse(r.body)
    if (!o.customer) return r
    const c = o.customer
    return { ...r, body: json({ ...o, customer: { id: c.id ?? null, name: c.name ?? null, email: c.contactEmail ?? c.email ?? null } }) }
  },
}

const STATUS = { 'HTTP:CONNECTIVITY': 503, 'HTTP:SERVICE_UNAVAILABLE': 503, 'HTTP:TIMEOUT': 504, 'HTTP:GATEWAY_TIMEOUT': 504, 'HTTP:NOT_FOUND': 404 }
// The Returns Process API of the Returns team. It reads the customer of a return from the Customers System API.
function returns(field, note) {
  const file = 'returns-papi'
  return {
    layer: 'Process',
    note,
    traced: true,
    sample: { method: 'GET', path: '/returns/R-501' },
    calls: ['customers.url'],
    boot: needs('customers.url', 'sapi.client_id', 'sapi.client_secret'),
    handle(ctx, req) {
      const { props } = ctx
      const id = req.method === 'GET' && req.path.split('?')[0].match(/^\/returns\/([\w-]+)$/)?.[1]
      if (!id) return { status: 404, ms: 5, flow: `${file}-main`, error: 'APIKIT:NOT_FOUND', body: json({ message: 'Resource not found' }) }
      const flow = 'get:\\returns\\(returnId)'
      const r = ctx.call('customers.url', { method: 'GET', path: '/customers/C-7', clientId: props['sapi.client_id'], clientSecret: props['sapi.client_secret'] }, Number(props['http.timeout']) || 10000)
      if (r.error) {
        const status = STATUS[r.error] ?? 500
        const error = { flow, file, at: 2, name: 'Customers API', dsl: `<http:request method="GET" doc:name="Customers API" config-ref="Customers_API_Config" path="${r.path}">`, type: r.error, message: `HTTP GET on resource '${r.url}${r.path}' failed: ${r.text}.` }
        return { status, ms: r.ms + 15, flow, error: r.error, log: [muleError(error)], body: json({ message: status === 503 ? 'A system is not available' : 'Internal server error' }) }
      }
      const c = JSON.parse(r.body)
      return { status: 200, ms: r.ms + 15, flow, body: json({ returnId: id, status: 'RECEIVED', customer: { id: c.id ?? null, name: c.name ?? null, email: c[field] ?? null } }) }
    },
  }
}

export const PACKAGES = {
  [PKG.customers2]: customersV2,
  [PKG.process11]: processV2,
  [PKG.returns12]: returns('email', 'Release 1.2.0 of the Returns Process API. Reads email from the Customers System API v1.'),
  [PKG.returns13]: returns('contactEmail', 'Release 1.3.0 of the Returns Process API. Reads contactEmail from the Customers System API v2.'),
}

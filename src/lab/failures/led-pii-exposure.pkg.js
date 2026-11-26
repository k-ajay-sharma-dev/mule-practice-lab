// The sample applications of the led-pii-exposure lab. Imports only platform-log.js and platform-led.js, so the engine can load them without a cycle.
// Three newer releases of the API-led project: a Customers System API that returns more fields, a Process API that can keep
// only some customer fields (customer.fields), and a partner Experience API that can shape its answer by an allow list
// (response.fields) or a deny list (response.exclude).
import { info } from '../platform-log.js'
import { LED_PACKAGES } from '../platform-led.js'

// The fields release 1.3.0 of customers-sapi added. All values are fake.
export const EXTRA_FIELDS = { phone: '+1 555 0100 077', dateOfBirth: '1900-01-01', loyaltyCard: 'HL-0000-0000-0007', creditLimit: 25000 }
// What the Process API joins for O-1001 when nothing is filtered
export const SAMPLE_ANSWER = { orderId: 'O-1001', status: 'PACKED', customer: { id: 'C-7', name: 'Harbor Deli', email: 'orders@harbordeli.example', ...EXTRA_FIELDS }, stock: 24 }

export const listOf = (value) => String(value ?? '').split(',').map((x) => x.trim()).filter(Boolean)

// keeps only the given paths, like customer.name
export function pick(value, paths) {
  const out = {}
  for (const path of paths) {
    const parts = path.split('.')
    let from = value
    for (const p of parts) from = from && typeof from === 'object' ? from[p] : undefined
    if (from === undefined) continue
    let to = out
    parts.slice(0, -1).forEach((p) => (to = to[p] = to[p] && typeof to[p] === 'object' ? to[p] : {}))
    to[parts.at(-1)] = structuredClone(from)
  }
  return out
}
// removes the given paths and keeps the rest
export function omit(value, paths) {
  const out = structuredClone(value)
  for (const path of paths) {
    const parts = path.split('.')
    let at = out
    for (const p of parts.slice(0, -1)) at = at && typeof at === 'object' ? at[p] : undefined
    if (at && typeof at === 'object') delete at[parts.at(-1)]
  }
  return out
}
// every field of an answer as a path, for the log lines and the checks of the lab
export const pathsOf = (value, prefix = '') =>
  Object.entries(value ?? {}).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? pathsOf(v, `${prefix}${k}.`) : [`${prefix}${k}`]))

// The DataWeave of the partner answer: an allow list when response.fields is set, then the deny list response.exclude
export function shapePartner(props, answer) {
  const allow = listOf(props['response.fields'])
  const deny = listOf(props['response.exclude'])
  const kept = allow.length ? pick(answer, allow) : answer
  return deny.length ? omit(kept, deny) : kept
}
// The Process API keeps only customer.fields of the customer, or all of it when the property is empty
export function processCustomer(props, customer) {
  const keep = listOf(props['customer.fields'])
  return keep.length ? pick(customer, keep) : customer
}

const reshape = (r, fn) => (r.status >= 200 && r.status < 300 && r.body ? { ...r, body: JSON.stringify(fn(JSON.parse(r.body))) } : r)
const fieldsLine = (label, value) => info(`${label}: ${pathsOf(value).join(', ')}`)

const base = {
  customers: LED_PACKAGES['customers-sapi'],
  process: LED_PACKAGES['order-fulfilment-papi'],
  partner: LED_PACKAGES['partner-orders-eapi'],
}

export const PACKAGES = {
  'customers-sapi-1.3': {
    ...base.customers,
    note: 'Release 1.3.0 of the Customers System API. It returns every column of the customer table, now with phone, date of birth, loyalty card and credit limit.',
    handle(ctx, req) {
      const r = reshape(base.customers.handle(ctx, req), (c) => ({ ...c, ...EXTRA_FIELDS }))
      return r.status === 200 && req.traced ? { ...r, log: [...(r.log ?? []), fieldsLine('Customer answered with the fields', JSON.parse(r.body))] } : r
    },
  },
  'order-fulfilment-papi-1.2': {
    ...base.process,
    note: 'Release 1.2.0 of the Order Fulfilment Process API. The property customer.fields lists the customer fields it passes on. Empty means all of them.',
    handle(ctx, req) {
      const r = reshape(base.process.handle(ctx, req), (o) => (o.customer ? { ...o, customer: processCustomer(ctx.props, o.customer) } : o))
      if (!(r.status === 200 && isStatusRead(req) && req.traced)) return r
      return { ...r, log: [...(r.log ?? []), fieldsLine('Order status answered with the fields', JSON.parse(r.body))] }
    },
  },
  'partner-orders-eapi-1.2': {
    ...base.partner,
    note: 'Release 1.2.0 of the Partner Orders Experience API. response.fields is the allow list of the answer, response.exclude a deny list. With neither, the Process API answer goes out as it is.',
    handle(ctx, req) {
      const r = reshape(base.partner.handle(ctx, req), (o) => shapePartner(ctx.props, o))
      return r.status === 200 && req.traced ? { ...r, log: [...(r.log ?? []), fieldsLine('Partner answer sent with the fields', JSON.parse(r.body))] } : r
    },
  },
}
function isStatusRead(req) {
  return req.method === 'GET' && /\/status$/.test(req.path.split('?')[0])
}

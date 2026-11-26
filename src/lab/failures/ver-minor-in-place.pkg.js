// The sample applications of the ver-minor-in-place lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
import { LED_PACKAGES } from '../platform-led.js'

export const PKG = {
  customers11: 'customers-sapi-phone-1-1',
  process: 'order-fulfilment-papi-tolerant',
}

const json = (value) => JSON.stringify(value)
const customers = LED_PACKAGES['customers-sapi']
const papi = LED_PACKAGES['order-fulfilment-papi']

export const PACKAGES = {
  // Release 1.1.0 adds an optional field. Every field of 1.0.0 is still there.
  [PKG.customers11]: {
    ...customers,
    note: 'Release 1.1.0 of the Customers System API, API version v1. The customer has a new optional field phone.',
    handle(ctx, req) {
      const r = customers.handle(ctx, req)
      if (r.status !== 200 || !r.body) return r
      return { ...r, body: json({ ...JSON.parse(r.body), phone: '+1 555 0100' }) }
    },
  },
  // A tolerant reader: the Process API takes id, name and email of the customer and ignores any other field
  [PKG.process]: {
    ...papi,
    note: 'Process API. Maps id, name and email of the customer, field by field, and ignores the fields it does not know.',
    handle(ctx, req) {
      const r = papi.handle(ctx, req)
      if (r.status !== 200 || !r.body) return r
      const o = JSON.parse(r.body)
      if (!o.customer) return r
      const { id = null, name = null, email = null } = o.customer
      return { ...r, body: json({ ...o, customer: { id, name, email } }) }
    },
  },
}

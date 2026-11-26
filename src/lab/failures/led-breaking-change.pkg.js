// The sample applications of the led-breaking-change lab. They wrap the API-led packages of platform-led.js, so the
// engine can load them without a cycle.
import { LED_PACKAGES } from '../platform-led.js'

export const PKG = {
  customers11: 'customers-sapi-contact-1-1',
  customers2: 'customers-sapi-contact-2',
  process10: 'order-fulfilment-papi-mapped-1-0',
  process11: 'order-fulfilment-papi-mapped-1-1',
  mobile: 'mobile-orders-eapi-notify',
}

const json = (value) => JSON.stringify(value)
const customers = LED_PACKAGES['customers-sapi']
const papi = LED_PACKAGES['order-fulfilment-papi']
const mobile = LED_PACKAGES['mobile-orders-eapi']

// The Customers System API with the field email renamed to contactEmail
const renamed = (note) => ({
  ...customers,
  note,
  handle(ctx, req) {
    const r = customers.handle(ctx, req)
    if (r.status !== 200 || !r.body) return r
    const { email, ...rest } = JSON.parse(r.body)
    return { ...r, body: json({ ...rest, contactEmail: email }) }
  },
})

// The Process API maps the customer field by field, the way a DataWeave transform does. A field that is not there maps to null.
const mapped = (field, note) => ({
  ...papi,
  note,
  handle(ctx, req) {
    const r = papi.handle(ctx, req)
    if (r.status !== 200 || !r.body) return r
    const o = JSON.parse(r.body)
    if (!o.customer) return r
    const c = o.customer
    return { ...r, body: json({ ...o, customer: { id: c.id ?? null, name: c.name ?? null, email: c[field] ?? null } }) }
  },
})

export const PACKAGES = {
  [PKG.customers11]: renamed('Release 1.1.0 of the Customers System API. The field email is now called contactEmail.'),
  [PKG.customers2]: renamed('Release 2.0.0 of the Customers System API, API version v2. The customer has contactEmail instead of email.'),
  [PKG.process10]: mapped('email', 'Release 1.0.0 of the Process API. Maps id, name and email of the customer from the Customers System API v1.'),
  [PKG.process11]: mapped('contactEmail', 'Release 1.1.0 of the Process API. Calls the Customers System API v2 and maps its contactEmail to email, so the answer to its own callers stays the same.'),
  [PKG.mobile]: {
    ...mobile,
    note: 'Experience API for the mobile app. Short answers, with notifyEmail where the app sends the order confirmation.',
    handle(ctx, req) {
      let below
      const r = mobile.handle({ ...ctx, call: (...args) => (below = ctx.call(...args)) }, req)
      if (r.status !== 200 || req.method !== 'GET' || !below?.body) return r
      const email = JSON.parse(below.body).customer?.email ?? null
      return { ...r, body: json({ ...JSON.parse(r.body), notifyEmail: email }) }
    },
  },
}

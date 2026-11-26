// The sample applications of the led-stale-cache lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
// The Process API keeps the customers it reads in a Cache scope. The engine keeps no store for an HTTP call, so the content of
// the cache is worked out from time: the entry of a key is loaded when the cache starts empty (a deploy, or Invalidate Key),
// and again each time its entryTtl runs out. Its value is the record as it was at that moment.
import { info, needs } from '../platform-log.js'
import { LED_PACKAGES } from '../platform-led.js'

const MINUTE = 60000
const HOUR = 60 * MINUTE
const at = (days, hours = 0, minutes = 0) => days * 24 * HOUR + hours * HOUR + minutes * MINUTE
const BASE = Date.UTC(2026, 10, 2) // the lab clock starts on Monday 2 November 2026, as in platform.js
const stampOf = (t) => new Date(BASE + t).toISOString().slice(0, 16).replace('T', ' ')

export const CUSTOMER_ID = 'C-7'
export const CHANGES_QUEUE = 'customer-changes'
export const CACHE_KEY = `customer:${CUSTOMER_ID}`
export const OLD_ADDRESS = '12 Old Pier Road, Bay City'
// What the customer changed in the CRM, and when. SQL Server, behind the Customers System API, has each change at once.
export const CHANGES = [
  { t: at(1, 7, 10), address: '4 Harbor Street, Bay City' },
  { t: at(1, 12), address: '4 Harbor Street, Unit 2, Bay City' },
  { t: at(1, 15), address: '4 Harbor Street, Unit 2, Gate B, Bay City' },
  { t: at(2, 9), address: '4 Harbor Street, Unit 2, Gate C, Bay City' },
  { t: at(2, 14), address: '4 Harbor Street, Unit 3, Gate C, Bay City' },
]
export const addressAt = (t) => CHANGES.filter((c) => c.t <= t).at(-1)?.address ?? OLD_ADDRESS
export const lastChangeAt = (t) => CHANGES.filter((c) => c.t <= t).at(-1)

// entryTtl and entryTtlUnit of the private object store of the caching strategy. Without entryTtl an entry never expires.
const UNITS = { MILLISECONDS: 1, SECONDS: 1000, MINUTES: MINUTE, HOURS: HOUR, DAYS: 24 * HOUR }
export function ttlOf(props) {
  const value = Number(props['customers.cache.entryTtl'])
  const unit = UNITS[String(props['customers.cache.entryTtlUnit'] || 'SECONDS').trim().toUpperCase()]
  return value > 0 && unit ? value * unit : null
}
const ttlText = (props) => (ttlOf(props) ? `${props['customers.cache.entryTtl']} ${String(props['customers.cache.entryTtlUnit'] || 'SECONDS').toUpperCase()}` : 'none, entries never expire')

const INVALIDATED = `Invalidate Key removed ${CACHE_KEY} from Customer_Caching_Strategy`
const customer = (address) => ({ id: CUSTOMER_ID, name: 'Harbor Deli', email: 'orders@harbordeli.example', deliveryAddress: address })

// When the entry of C-7 was loaded. The cache is in memory, so a deploy starts it empty. A CustomerChanged event that the
// listener flow consumed removes the key. With steady traffic the next call after an empty or expired key loads it again.
function loadedAt(ctx) {
  const { app, now, props } = ctx
  const removed = (app.logs ?? []).filter((l) => l.config === app.config && l.t >= app.updated && l.t <= now && l.text.includes(INVALIDATED)).map((l) => l.t)
  const start = Math.max(app.updated ?? 0, ...removed)
  const ttl = ttlOf(props)
  return ttl ? start + Math.floor((now - start) / ttl) * ttl : start
}

const papi = LED_PACKAGES['order-fulfilment-papi']
const sapi = LED_PACKAGES['customers-sapi']

export const PACKAGES = {
  'order-fulfilment-papi-cache': {
    ...papi,
    note: 'Release 1.4.0 of the Process API. A Cache scope around the call to the Customers API, with a caching strategy keyed on the customer ID and an in memory private object store. A listener flow can remove a key when a CustomerChanged event comes in.',
    consumes: 'customers.cache.invalidation.queue',
    consume(ctx, message) {
      const id = (() => {
        try {
          return JSON.parse(message.body).customerId
        } catch {
          return null
        }
      })()
      if (!id) return { ok: true, flow: 'customer-changes-listener', log: [info('Message without a customerId. Nothing to invalidate.')] }
      return { ok: true, flow: 'customer-changes-listener', log: [info(`CustomerChanged ${id} received. Invalidate Key removed customer:${id} from Customer_Caching_Strategy`)] }
    },
    handle(ctx, req) {
      const cached = {
        ...ctx,
        call(key, request, timeout) {
          const path = request.path.split('?')[0]
          if (key !== 'customers.url' || path !== `/customers/${CUSTOMER_ID}`) return ctx.call(key, request, timeout)
          const loaded = loadedAt(ctx)
          // the call that loads the entry, and the calls of the same minute, go to the System API
          if (ctx.now - loaded < MINUTE) {
            ctx.say(`Cache miss for key ${CACHE_KEY}. Calling the Customers API and storing the answer (entryTtl ${ttlText(ctx.props)})`)
            const r = ctx.call(key, request, timeout)
            if (!r.error) ctx.say(`Delivery address of ${CUSTOMER_ID} in the answer: ${JSON.parse(r.body).deliveryAddress}`)
            return r
          }
          const address = addressAt(loaded)
          ctx.say(`Cache hit for key ${CACHE_KEY}. Entry stored ${stampOf(loaded)} (entryTtl ${ttlText(ctx.props)}). The Customers API was not called`)
          ctx.say(`Delivery address of ${CUSTOMER_ID} in the answer: ${address}`)
          return { url: ctx.props['customers.url'], method: request.method, path: request.path, status: 200, ms: 1, body: JSON.stringify(customer(address)) }
        },
      }
      return papi.handle(cached, req)
    },
  },
  'customers-sapi-crm': {
    ...sapi,
    note: 'Release 1.2.0 of the Customers System API. Reads the customer with its delivery address from SQL Server, where the CRM writes each change.',
    handle(ctx, req) {
      const r = sapi.handle(ctx, req)
      if (r.status !== 200) return r
      const body = JSON.parse(r.body)
      return { ...r, body: JSON.stringify(body.id === CUSTOMER_ID ? customer(addressAt(ctx.now)) : { ...body, deliveryAddress: OLD_ADDRESS }) }
    },
  },
  'customer-change-relay': {
    note: 'Every 5 minutes reads the change table of the CRM and publishes a CustomerChanged event for each changed customer to an Anypoint MQ queue.',
    schedules: [{ flow: 'relay-flow', type: 'cron', value: '0 0/5 * * * ?', tz: 'UTC', enabled: true }],
    boot: needs('mq.queue'),
    run: {
      'relay-flow': ({ props, now, store }) => {
        const from = store.through ?? now - 5 * MINUTE
        const found = CHANGES.filter((c) => c.t > from && c.t <= now)
        const bodies = found.map((c) => JSON.stringify({ event: 'CustomerChanged', customerId: CUSTOMER_ID, fields: ['deliveryAddress'], changedAt: stampOf(c.t) }))
        return {
          ok: true,
          ms: 400,
          store: { through: now },
          send: { queue: props['mq.queue'], bodies },
          log: found.length ? [info(`Published ${found.length} CustomerChanged event for ${CUSTOMER_ID} to ${props['mq.queue']}`)] : [],
        }
      },
    },
  },
}

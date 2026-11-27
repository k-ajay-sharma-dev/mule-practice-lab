// The sample application of the sf-composite lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, muleError, needs, warn } from '../platform-log.js'

export const NAME = 'sf-webshop-order-sync'
export const FLOW = 'webshop-order-sync'
export const PER_RUN = 10
export const SUBS_PER_ORDER = 3 // Account, Contact and Order
const word = (v) => String(v ?? '').trim().toLowerCase()
const yes = (v) => word(v) === 'true'
const BASE = Date.UTC(2026, 10, 2) // the BASE of platform.js (copied, the package imports no engine)
const dayOf = (now) => new Date(BASE + now).toISOString().slice(0, 10)

const FIRST = ['Ingrid', 'Tomas', 'Sanna', 'Erik', 'Lea', 'Nils', 'Maja', 'Jonas', 'Freya', 'Aksel', 'Vera']
const LAST = ['Holm', 'Dahl', 'Lind', 'Vik', 'Strand', 'Berg', 'Moe', 'Sand', 'Fjell', 'Brekke', 'Nygaard', 'Lund', 'Haug']
const COUNTRY = ['Norway', 'Denmark', 'Sweden']

// the new webshop orders of run n. A guest checkout every seventh order gives neither email nor phone, which the
// Email_Or_Phone validation rule on Contact refuses.
export function ordersOf(n) {
  return Array.from({ length: PER_RUN }, (_, k) => {
    const i = (n - 1) * PER_RUN + k + 1
    const first = FIRST[i % FIRST.length]
    const last = LAST[i % LAST.length]
    const guest = i % 7 === 3
    return { order: `W-${50000 + i}`, customer: `WEB-${70000 + i}`, contact: `WEB-C-${70000 + i}`, first, last, email: guest ? null : `${first}.${last}${i}@mail.example`.toLowerCase(), country: COUNTRY[i % 3], total: 40 + ((i * 37) % 260) }
  })
}
const account = (o) => ({ Name: `${o.first} ${o.last} (webshop)`, Type: 'Customer', BillingCountry: o.country })
const contact = (o) => ({ FirstName: o.first, LastName: o.last, Email: o.email })
const order = (o, now) => ({ EffectiveDate: dayOf(now), Status: 'Draft', TotalAmount: o.total })
const firstError = (body) => (Array.isArray(body) ? body[0] : null) ?? {}

const el = {
  query: { at: 2, name: 'Find customer', dsl: '<salesforce:query doc:name="Find customer" config-ref="Salesforce_Config">' },
  account: { at: 3, name: 'Create account', dsl: '<salesforce:create doc:name="Create account" config-ref="Salesforce_Config" type="Account">' },
  contact: { at: 4, name: 'Create contact', dsl: '<salesforce:create doc:name="Create contact" config-ref="Salesforce_Config" type="Contact">' },
  order: { at: 5, name: 'Create order', dsl: '<salesforce:create doc:name="Create order" config-ref="Salesforce_Config" type="Order">' },
  composite: { at: 3, name: 'Execute composite request', dsl: '<salesforce:composite-request doc:name="Execute composite request" config-ref="Salesforce_Config">' },
}
const block = (where, type, message) => muleError({ flow: FLOW, file: NAME, ...el[where], type, message })

// one order at a time: a query, then Account, Contact and Order in three separate create calls
function perRecord(sf, orders, now) {
  const log = []
  const errors = []
  let ok = 0
  for (const o of orders) {
    const found = sf.query(`SELECT Id FROM Account WHERE Harbor_Customer_Id__c = '${o.customer}'`)
    if (!found.ok) {
      errors.push(found.type)
      log.push(block('query', found.type, found.error))
      continue
    }
    let accId = found.records[0]?.Id
    if (!accId) {
      const a = sf.rest('POST', '/services/data/v61.0/sobjects/Account', { ...account(o), Harbor_Customer_Id__c: o.customer })
      if (a.status >= 400) {
        errors.push('SALESFORCE:INVALID_INPUT')
        log.push(block('account', 'SALESFORCE:INVALID_INPUT', `${firstError(a.body).errorCode}: ${firstError(a.body).message}`))
        continue
      }
      accId = a.body.id
    }
    const c = sf.rest('POST', '/services/data/v61.0/sobjects/Contact', { ...contact(o), Harbor_Contact_Id__c: o.contact, AccountId: accId })
    if (c.status >= 400) {
      errors.push('SALESFORCE:INVALID_INPUT')
      log.push(block('contact', 'SALESFORCE:INVALID_INPUT', `${firstError(c.body).errorCode}: ${firstError(c.body).message} Order ${o.order} was not created. Account ${accId} (${o.customer}) was already saved and stays without a contact.`))
      continue
    }
    const r = sf.rest('POST', '/services/data/v61.0/sobjects/Order', { ...order(o, now), Harbor_Order_Id__c: o.order, AccountId: accId })
    if (r.status >= 400) {
      errors.push('SALESFORCE:INVALID_INPUT')
      log.push(block('order', 'SALESFORCE:INVALID_INPUT', `${firstError(r.body).errorCode}: ${firstError(r.body).message}`))
      continue
    }
    ok++
  }
  log.unshift(info(`${orders.length} new webshop orders: query, create Account, create Contact and create Order for each, one REST call per step. ${ok} saved.`))
  return { errors, log }
}

// the subrequests of a group of orders: upsert Account, Contact and Order on their External IDs; the Contact and the
// Order point at the Account with @{acc_k.id}
function subrequests(orders, now) {
  return orders.flatMap((o, k) => [
    { method: 'PATCH', url: `/services/data/v61.0/sobjects/Account/Harbor_Customer_Id__c/${o.customer}`, referenceId: `acc_${k}`, body: account(o) },
    { method: 'PATCH', url: `/services/data/v61.0/sobjects/Contact/Harbor_Contact_Id__c/${o.contact}`, referenceId: `con_${k}`, body: { ...contact(o), AccountId: `@{acc_${k}.id}` } },
    { method: 'PATCH', url: `/services/data/v61.0/sobjects/Order/Harbor_Order_Id__c/${o.order}`, referenceId: `ord_${k}`, body: { ...order(o, now), AccountId: `@{acc_${k}.id}` } },
  ])
}

// one composite request per group; with allOrNone, a group that fails is sent again once without the orders that
// had a real error (the others came back PROCESSING_HALTED: rolled back, not wrong)
function composite(sf, orders, props, now) {
  const log = []
  const errors = []
  const size = Math.floor(Number(props['composite.ordersPerRequest']))
  const allOrNone = yes(props['composite.allOrNone'])
  const per = size > 0 ? size : orders.length
  const groups = []
  for (let k = 0; k < orders.length; k += per) groups.push(orders.slice(k, k + per))
  let requests = 0
  let saved = 0
  const rejected = []
  const send = (group, again) => {
    const subs = subrequests(group, now)
    requests++
    const r = sf.compositeRequest({ allOrNone, compositeRequest: subs })
    if (!r.ok) {
      errors.push(r.type)
      log.push(block('composite', r.type, `${r.error} (${group.length} orders x ${SUBS_PER_ORDER} subrequests)`))
      return
    }
    const res = r.compositeResponse
    const bad = group.filter((o, k) => res.slice(k * SUBS_PER_ORDER, k * SUBS_PER_ORDER + SUBS_PER_ORDER).some((x) => x.httpStatusCode >= 400 && firstError(x.body).errorCode !== 'PROCESSING_HALTED'))
    const halted = res.filter((x) => firstError(x.body).errorCode === 'PROCESSING_HALTED').length
    for (const o of bad) {
      const k = group.indexOf(o)
      const x = res.slice(k * SUBS_PER_ORDER, k * SUBS_PER_ORDER + SUBS_PER_ORDER).find((y) => y.httpStatusCode >= 400 && firstError(y.body).errorCode !== 'PROCESSING_HALTED')
      rejected.push(o.order)
      log.push(warn(`Order ${o.order}: ${x.referenceId} failed with ${firstError(x.body).errorCode}: ${firstError(x.body).message}${allOrNone ? ' Nothing of this order was saved. It goes to the webshop-order-errors queue.' : ` The other subrequests of this order were saved anyway.`}`))
    }
    if (!bad.length || !allOrNone) {
      saved += group.length - bad.length
      return
    }
    log.push(warn(`Composite request rolled back (allOrNone true): ${halted} subrequests came back PROCESSING_HALTED.${again ? '' : ` Sending the other ${group.length - bad.length} order${group.length - bad.length === 1 ? '' : 's'} again.`}`))
    if (!again && group.length > bad.length) send(group.filter((o) => !bad.includes(o)), true)
  }
  for (const g of groups) send(g, false)
  log.unshift(info(`${orders.length} new webshop orders in ${requests} composite request${requests === 1 ? '' : 's'} (POST /composite, allOrNone ${allOrNone}, up to ${per} orders each). ${saved} saved, ${rejected.length} rejected.`))
  return { errors, log, requests }
}

export const PACKAGES = {
  [NAME]: {
    note:
      'Every 15 minutes takes the new orders of the Harbor webshop and saves each as an Account, a Contact and an Order in Salesforce. sync.mode per-record looks the customer up with a query and then makes one REST create call for the Account, the Contact and the Order. sync.mode composite sends POST /composite with three upsert subrequests per order: the Contact and the Order point at the new Account with @{acc_k.id}. composite.ordersPerRequest is how many orders go in one composite request, and composite.allOrNone true rolls back the whole request when one subrequest fails. Then the flow sends the orders that came back PROCESSING_HALTED again once, without the failed order, which goes to an error queue.',
    boot: needs('salesforce.url', 'salesforce.username', 'salesforce.password', 'salesforce.securityToken'),
    schedules: [{ flow: FLOW, type: 'fixed', value: '15', unit: 'minutes', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { props, store, now } = ctx
        const sf = ctx.salesforce
        const n = (store.n ?? 0) + 1
        const orders = ordersOf(n)
        const batched = word(props['sync.mode']) === 'composite'
        const r = batched ? composite(sf, orders, props, now) : perRecord(sf, orders, now)
        // runs in a row that saved the orders all or nothing with at most one API request per two orders
        const good = batched && yes(props['composite.allOrNone']) && r.errors.length === 0 && r.requests * 2 <= orders.length
        return { ok: r.errors.length === 0, ms: 300 + orders.length * 120, errorType: r.errors[0] ?? null, errors: r.errors.length, log: r.log, store: { n, orders: (store.orders ?? 0) + orders.length, streak: good ? (store.streak ?? 0) + 1 : 0 } }
      },
    },
  },
}

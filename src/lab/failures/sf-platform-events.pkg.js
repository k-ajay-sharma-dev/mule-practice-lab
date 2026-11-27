// The sample applications of the sf-platform-events lab. Imports only platform-log.js and the import free Salesforce engine.
import { info, muleError, needs, warn } from '../platform-log.js'
import { iso } from '../platform-salesforce.js'

export const WEB = 'sf-pe-web-orders'
export const NAME = 'sf-pe-wms-dispatch'
export const FLOW = 'order-placed-listener'
export const WEB_FLOW = 'web-order-intake'
export const EVENT = 'Order_Placed__e'
export const CHANNEL = `/event/${EVENT}`
const word = (v) => String(v ?? '').trim()
const yes = (v) => word(v).toLowerCase() === 'true'
const MIN = 60000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

// the web shop takes an order every 10 minutes from 08:00 to 18:00; order number n of the week
export const orderAt = (now) => {
  const m = Math.floor((now % DAY) / MIN)
  if (m % 10 || m < 8 * 60 || m >= 18 * 60) return null
  return Math.floor(now / DAY) * 60 + (m - 8 * 60) / 10 + 1
}
export const orderId = (n) => `W-${1000 + n}`
// lab made: every seventh order has a card the payment service declines
export const declined = (n) => n % 7 === 3

const el = {
  source: { at: 0, name: 'Replay channel listener', dsl: '<salesforce:replay-channel-listener doc:name="Replay channel listener" config-ref="Salesforce_Config" streamingChannel="/event/Order_Placed__e" replayOption="${sf.replayOption}" replayId="${sf.replayId}" autoReplay="${sf.resumeFromLastReplayId}">' },
  verify: { at: 1, name: 'Query order in Salesforce', dsl: '<salesforce:query doc:name="Query order in Salesforce" config-ref="Salesforce_Config">' },
  apex: { at: 0, name: 'Call HarborOrders Apex REST', dsl: '<http:request doc:name="Call HarborOrders Apex REST" method="POST" config-ref="Salesforce_REST" path="/services/apexrest/HarborOrders/">' },
}
const block = (flow, file, where, type, message) => muleError({ flow, file, ...el[where], type, message })

export const PACKAGES = {
  // The Salesforce side of the order. In the real org the web shop calls the Apex REST class HarborOrders: it inserts the
  // Order and publishes Order_Placed__e with EventBus.publish, then checks the payment in the same transaction. A declined
  // payment throws and the transaction rolls back. Lab made: this app plays that Apex class, so it creates the Order only
  // when the payment is accepted and publishes the event with { rollback: true } when it is declined.
  [WEB]: {
    note: 'Plays the web shop and the Apex REST class HarborOrders. Every 10 minutes in shop hours it sends one order. The Apex class inserts the Order, publishes Order_Placed__e and then checks the payment in the same transaction. A declined payment throws PAYMENT_DECLINED and the transaction rolls back, so the Order is not saved.',
    boot: needs('salesforce.url', 'salesforce.username', 'salesforce.password', 'salesforce.securityToken'),
    schedules: [{ flow: WEB_FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    run: {
      [WEB_FLOW]: (ctx) => {
        const n = orderAt(ctx.now)
        if (!n) return { ok: true, ms: 5, log: [] }
        const sf = ctx.salesforce
        const store = { ...ctx.store }
        if (!store.accounts) {
          const q = sf.query('SELECT Id FROM Account ORDER BY Name')
          if (!q.ok) return { ok: false, ms: 400, errorType: q.type, log: [block(WEB_FLOW, WEB, 'apex', q.type, q.error)] }
          store.accounts = q.records.map((r) => r.Id)
        }
        const id = orderId(n)
        const fields = { Order_Id__c: id, Account_Id__c: store.accounts[n % store.accounts.length], Total__c: 40 + ((n * 37) % 300), Channel__c: 'Web' }
        if (declined(n)) {
          const p = sf.publishEvent(EVENT, fields, { rollback: true })
          if (!p.ok) return { ok: false, ms: 300, errorType: p.type, log: [block(WEB_FLOW, WEB, 'apex', p.type, p.error)] }
          store.declined = [...(store.declined ?? []).slice(-60), { id, t: ctx.now, published: Boolean(p.published) }]
          return { ok: true, ms: 300, store, log: [warn(`POST /services/apexrest/HarborOrders/ ${id}: 400 [{"errorCode":"PAYMENT_DECLINED","message":"Card declined by the payment service. Transaction rolled back."}]`)] }
        }
        const r = sf.create('Order', [{ AccountId: fields.Account_Id__c, EffectiveDate: iso(ctx.now).slice(0, 10), Status: 'Draft', TotalAmount: fields.Total__c, Harbor_Order_Id__c: id }])
        if (!r.ok) return { ok: false, ms: 300, errorType: r.type, log: [block(WEB_FLOW, WEB, 'apex', r.type, r.error)] }
        if (!r.items[0].success) return { ok: false, ms: 300, errorType: 'SALESFORCE:INVALID_INPUT', log: [block(WEB_FLOW, WEB, 'apex', 'SALESFORCE:INVALID_INPUT', `${id}: ${r.items[0].errors.map((e) => `${e.statusCode}: ${e.message}`).join('; ')}`)] }
        const p = sf.publishEvent(EVENT, fields)
        if (!p.ok) return { ok: false, ms: 300, errorType: p.type, log: [block(WEB_FLOW, WEB, 'apex', p.type, p.error)] }
        return { ok: true, ms: 300, store, log: [info(`POST /services/apexrest/HarborOrders/ ${id}: 201 Order ${r.items[0].id} created`)] }
      },
    },
  },
  [NAME]: {
    note: 'Listens to the platform event channel /event/Order_Placed__e and sends a pick request to the warehouse for each order. On start the Replay channel listener subscribes: with sf.resumeFromLastReplayId true it resumes after the last replay ID it processed, kept in a persistent Object Store. Otherwise it uses sf.replayOption: ONLY_NEW (replay ID -1), ALL (-2, every retained event) or FROM_REPLAY_ID (the events after sf.replayId). wms.verifyOrder true queries the Order by its External ID Harbor_Order_Id__c before a pick, and on start cancels the picks whose order does not exist. wms.idempotent true skips an order that already has a pick.',
    boot: needs('salesforce.url', 'salesforce.username', 'salesforce.password', 'salesforce.securityToken', 'sf.replayOption'),
    schedules: [{ flow: FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { props } = ctx
        const sf = ctx.salesforce
        const store = { ...ctx.store, picks: { ...ctx.store.picks } }
        const log = []
        const verify = yes(props['wms.verifyOrder'])
        const idem = yes(props['wms.idempotent'])
        // a new configuration or a restart subscribes again (the listener keeps its position only while it runs)
        const boot = `${ctx.app.config}:${ctx.app.started ?? 0}`
        const fresh = store.boot !== boot
        const exists = (ids) => {
          const list = ids.map((x) => `'${x}'`).join(', ')
          const q = sf.query(`SELECT Id, Harbor_Order_Id__c FROM Order WHERE Harbor_Order_Id__c IN (${list})`)
          return q.ok ? { ok: true, ids: new Set(q.records.map((r) => r.Harbor_Order_Id__c)) } : q
        }
        if (fresh && verify) {
          const open = Object.keys(store.picks).filter((k) => !store.picks[k].cancelled)
          if (open.length) {
            const q = exists(open)
            if (!q.ok) return { ok: false, ms: 600, errorType: q.type, log: [block(FLOW, NAME, 'verify', q.type, q.error)] }
            const ghosts = open.filter((k) => !q.ids.has(k))
            for (const k of ghosts) store.picks[k] = { ...store.picks[k], cancelled: ctx.now }
            log.push(info(`Reconcile: ${open.length} open picks checked, ${ghosts.length} cancelled because Salesforce has no such Order${ghosts.length ? `: ${ghosts.join(', ')}` : ''}`))
          }
        }
        let from
        if (fresh) {
          const opt = word(props['sf.replayOption']).toUpperCase()
          const resume = yes(props['sf.resumeFromLastReplayId']) && store.replayId
          from = resume ? store.replayId : opt === 'ALL' ? -2 : opt === 'FROM_REPLAY_ID' ? Number(word(props['sf.replayId']) || NaN) : -1
          if (!resume && !['ALL', 'ONLY_NEW', 'FROM_REPLAY_ID'].includes(opt)) return { ok: false, ms: 50, errorType: 'MULE:EXPRESSION', log: [block(FLOW, NAME, 'source', 'MULE:EXPRESSION', `sf.replayOption '${word(props['sf.replayOption'])}' is not ONLY_NEW, ALL or FROM_REPLAY_ID`)] }
        } else from = store.replayId
        const r = sf.subscribe(CHANNEL, from)
        if (!r.ok) return { ok: false, ms: 1000, errorType: r.type, log: [...log, block(FLOW, NAME, 'source', r.type, `Subscription to ${CHANNEL} failed: ${r.error}`)] }
        if (fresh) log.push(info(`Subscribed to ${CHANNEL} with replay ID ${from}`))
        let known = null
        if (verify && r.events.length) {
          const q = exists([...new Set(r.events.map((e) => e.payload.Order_Id__c))])
          if (!q.ok) return { ok: false, ms: 600, errorType: q.type, log: [...log, block(FLOW, NAME, 'verify', q.type, q.error)] }
          known = q.ids
        }
        for (const e of r.events) {
          const id = e.payload.Order_Id__c
          const had = store.picks[id]
          if (idem && had) {
            log.push(info(`replayId ${e.replayId} ${id} skipped: the warehouse already has a pick for it`))
            continue
          }
          if (known && !known.has(id)) {
            log.push(warn(`replayId ${e.replayId} ${id} skipped: no Order with Harbor_Order_Id__c ${id} in Salesforce`))
            continue
          }
          if (had) {
            store.dupPicks = [...(store.dupPicks ?? []).slice(-20), { id, t: ctx.now }]
            log.push(warn(`Pick request for ${id} sent again: the warehouse picks the order twice`))
          }
          store.picks[id] = { t: ctx.now, replayId: e.replayId, n: (had?.n ?? 0) + 1 }
          log.push(info(`replayId ${e.replayId} ${id} created ${e.payload.CreatedDate}: pick request sent to the warehouse`))
        }
        return { ok: true, ms: 200 + r.events.length * 20, log, store: { ...store, replayId: r.lastReplayId, boot, lastAt: ctx.now } }
      },
    },
  },
}

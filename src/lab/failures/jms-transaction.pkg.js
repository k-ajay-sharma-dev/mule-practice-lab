// The sample applications of the jms-transaction lab. Imports only platform-log.js and the import free JMS engine.
import { info, muleError, needs, warn } from '../platform-log.js'
import { connOf } from '../platform-jms.js'

export const FEED = 'web-order-feed'
export const WRITER = 'order-ledger-writer'
export const RELAY = 'order-confirm-relay'
export const IN = 'ORDERS.IN'
export const REPLY = 'ORDERS.REPLY'
// orders the web shop sends in a minute
export const PER_MINUTE = 3
const JMS_LOG = 'org.mule.extensions.jms.internal.source.JmsListener'

const clean = (v) => String(v ?? '').trim()
const keep = (list, item, n = 200) => [...(list ?? []), item].slice(-n)
export const transacted = (props) => clean(props['jms.transactionalAction']).toUpperCase() === 'ALWAYS_BEGIN'
export const propagates = (props) => clean(props['onError.publish']).toLowerCase() === 'propagate'
export const skipsExisting = (props) => clean(props['order.skipExisting']).toLowerCase() === 'true'
export const maxRedelivery = (props) => connOf(props).maxRedelivery
const ackMode = (props) => (['AUTO', 'MANUAL', 'DUPS_OK', 'IMMEDIATE'].includes(clean(props['jms.ackMode']).toUpperCase()) ? clean(props['jms.ackMode']).toUpperCase() : 'AUTO')
const read = (body) => {
  try {
    const o = JSON.parse(body)
    return o?.orderId ? o : null
  } catch {
    return null
  }
}

const listenerDsl = (props) => `<jms:listener config-ref="AMQ_Config" destination="${IN}" ackMode="${ackMode(props)}" transactionalAction="${transacted(props) ? 'ALWAYS_BEGIN' : 'NONE'}">`
const parseError = (id) => ({ flow: 'order-ledger-flow', file: WRITER, at: 1, name: 'Read order', dsl: '<ee:transform doc:name="Read order">', type: 'MULE:EXPRESSION', message: `Unexpected character in the payload of message ${id}. The order cannot be read.` })
const publishError = (text) => ({ flow: 'order-ledger-flow', file: WRITER, at: 3, name: 'Publish reply', dsl: `<jms:publish config-ref="AMQ_Config" destination="\${jms.replyQueue}" doc:name="Publish reply">`, type: 'JMS:PUBLISHING', message: text })

export const PACKAGES = {
  [FEED]: {
    note: `The web shop. Every minute it publishes ${PER_MINUTE} new orders to ORDERS.IN, PERSISTENT, with the order ID as the JMSCorrelationID and ORDERS.REPLY as the JMSReplyTo.`,
    boot: needs('jms.url', 'jms.user', 'jms.password'),
    schedules: [{ flow: 'publish-orders-flow', type: 'cron', value: '0 * * * * ?', tz: 'UTC', enabled: true }],
    run: {
      'publish-orders-flow': ({ props, store, now, jms }) => {
        const cfg = connOf(props)
        let next = store.next ?? 5001
        for (let i = 0; i < PER_MINUTE; i++) {
          const orderId = `WO-${next}`
          const r = jms.publish(cfg, IN, { orderId, customer: `C-${200 + (next % 37)}`, total: 18 + (next % 9) * 6.5 }, { correlationId: orderId, replyTo: REPLY })
          if (!r.ok) return { ok: false, ms: 200, errorType: r.muleType, log: [muleError({ flow: 'publish-orders-flow', file: FEED, at: 1, name: 'Publish order', dsl: `<jms:publish config-ref="AMQ_Config" destination="${IN}">`, type: r.muleType ?? 'JMS:PUBLISHING', message: r.text })], store: { ...store, next } }
          store.sent = keep(store.sent, { id: orderId, t: now })
          next++
        }
        return { ok: true, ms: 300, log: [info(`Published orders WO-${next - PER_MINUTE} to WO-${next - 1} to ${IN}`)], store: { ...store, next } }
      },
    },
  },
  [WRITER]: {
    note: 'Takes orders from ORDERS.IN with a JMS listener, inserts a row in the orders database and publishes a confirmation to jms.replyQueue. jms.ackMode is the ackMode of the listener (AUTO, MANUAL, DUPS_OK, IMMEDIATE). jms.transactionalAction is NONE or ALWAYS_BEGIN, with jms.transactionType LOCAL or XA. jms.maxRedelivery is maxRedelivery of the ActiveMQ factory configuration: -1 means no limit. onError.publish is the error handler around the publish: continue logs the failure and lets the flow end with success, propagate fails the flow. order.skipExisting true makes the flow look up the order first and skip the insert when the row exists.',
    boot: needs('jms.url', 'jms.user', 'jms.password', 'jms.replyQueue', 'onError.publish'),
    schedules: [{ flow: 'order-ledger-flow', type: 'cron', value: '0 * * * * ?', tz: 'UTC', enabled: true }],
    run: {
      'order-ledger-flow': ({ props, store, now, jms }) => {
        const cfg = connOf(props)
        const log = []
        store.rows ??= {}
        store.errs ??= {}
        const res = jms.listen(cfg, IN, { ackMode: ackMode(props), transactionalAction: transacted(props) ? 'ALWAYS_BEGIN' : 'NONE', max: 30 }, (m, api) => {
          const lines = []
          const o = read(m.body)
          if (!o) return { ok: false, errorType: 'MULE:EXPRESSION', error: parseError(m.id) }
          // the orders database: one row per order. It is not part of the JMS transaction (lab: the rows live in the app store).
          if (skipsExisting(props) && store.rows[o.orderId]) lines.push(info(`Order ${o.orderId} has a row already, Delivery Count ${m.deliveryCount}. Insert skipped.`))
          else {
            store.rows[o.orderId] = (store.rows[o.orderId] ?? 0) + 1
            if (store.rows[o.orderId] > 1) store.dupes = keep(store.dupes, { id: o.orderId, t: now })
          }
          const p = api.publish(clean(props['jms.replyQueue']), { orderId: o.orderId, status: 'BOOKED' }, { correlationId: o.orderId })
          if (p.ok) return { ok: true, order: o.orderId, lines }
          if (!propagates(props)) {
            store.noReply = keep(store.noReply, { id: o.orderId, t: now })
            lines.push(warn(`Order ${o.orderId}: ${p.muleType} when publishing the reply. on-error-continue logged it and the flow ended with success. ${p.text}`))
            return { ok: true, order: o.orderId, noReply: true, lines }
          }
          return { ok: false, errorType: p.muleType, error: publishError(p.text), order: o.orderId, lines }
        })
        if (!res.ok) return { ok: false, ms: 200, errorType: res.muleType, log: [muleError({ flow: 'order-ledger-flow', file: WRITER, at: 0, name: 'Listener', dsl: listenerDsl(props), type: res.muleType, message: res.text })], store }
        let errors = 0
        for (const r of res.results) {
          const x = r.result ?? {}
          log.push(...(x.lines ?? []))
          if (r.ok) {
            if (!x.noReply) log.push(info(`Order ${x.order} booked and the reply sent${transacted(props) ? ', transaction committed' : ''}. Delivery Count ${r.deliveryCount}`))
            continue
          }
          errors++
          if (!store.errs[r.id] || r.outcome === 'dlq') log.push(muleError(x.error ?? parseError(r.id)))
          store.errs[r.id] = (store.errs[r.id] ?? 0) + 1
          if (r.outcome === 'dlq') log.push(warn(`Message ${r.id}: Delivery Count ${r.deliveryCount} is over maxRedelivery ${maxRedelivery(props)}. The ActiveMQ client sent a poison ack and the broker moved the message to ${r.to}.`, JMS_LOG))
          else if (r.outcome === 'rolled back') log.push(info(`Message ${r.id}: transaction rolled back. The broker delivers it again with JMSRedelivered=true.`, JMS_LOG))
          else if (r.outcome === 'redelivery') log.push(info(`Message ${r.id}: the session was recovered and the message comes again.`, JMS_LOG))
        }
        if (res.stuck) log.push(warn(`Message ${res.stuck} failed ${store.errs[res.stuck]} times and maxRedelivery is ${maxRedelivery(props) ?? 6}. The listener keeps redelivering it and the orders behind it wait.`, JMS_LOG))
        // the error map only needs the messages of the last hour
        store.errs = Object.fromEntries(Object.entries(store.errs).slice(-60))
        return { ok: errors === 0, ms: 400, errorType: errors ? 'JMS:PUBLISHING' : undefined, errors, log, store }
      },
    },
  },
  [RELAY]: {
    note: 'Takes the confirmations from ORDERS.REPLY and mails them to the customers. It keeps the order IDs it sent.',
    boot: needs('jms.url', 'jms.user', 'jms.password'),
    schedules: [{ flow: 'confirm-relay-flow', type: 'cron', value: '0 * * * * ?', tz: 'UTC', enabled: true }],
    run: {
      'confirm-relay-flow': ({ props, store, now, jms }) => {
        const res = jms.listen(connOf(props), REPLY, { ackMode: 'AUTO', max: 100 }, (m) => {
          store.replied = { ...(store.replied ?? {}), [m.correlationId]: (store.replied?.[m.correlationId] ?? 0) + 1 }
          return { ok: true }
        })
        if (!res.ok) return { ok: false, ms: 100, errorType: res.muleType, log: [muleError({ flow: 'confirm-relay-flow', file: RELAY, at: 0, name: 'Listener', dsl: `<jms:listener config-ref="AMQ_Config" destination="${REPLY}">`, type: res.muleType, message: res.text })], store }
        const n = res.results.length
        store.last = now
        return { ok: true, ms: 100, log: n ? [info(`Mailed ${n} order confirmation${n > 1 ? 's' : ''}`)] : [], store }
      },
    },
  },
}

// The sample applications of the amq-store-full lab. Imports only platform-log.js and the import free JMS engine.
import { info, muleError, needs, warn } from '../platform-log.js'
import { connOf } from '../platform-jms.js'

export const API = 'order-intake-api'
export const LOADER = 'store-ledger-loader'
export const WATCH = 'amq-depth-watch'
export const IN = 'ORDERS.IN'
export const AUDIT = 'ORDERS.AUDIT'
// lab-made: an order carries its scanned delivery note, about 4 MB
export const ORDER_BYTES = 4 * 1024 * 1024
const HOUR = 3600000

const clean = (v) => String(v ?? '').trim()
const keep = (list, item, n = 120) => [...(list ?? []), item].slice(-n)
export const copiesToAudit = (props) => clean(props['audit.copy']).toLowerCase() === 'true'
export const alertDepth = (props) => {
  const v = clean(props['dlq.alertDepth'])
  return v !== '' && Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null
}
const publishDsl = (dest) => `<jms:publish config-ref="AMQ_Config" destination="${dest}" doc:name="Publish order">`

export const PACKAGES = {
  [API]: {
    note: `POST /orders takes an order and publishes it to ${IN}, PERSISTENT. With audit.copy true it also publishes a copy to ${AUDIT} for the audit archive.`,
    boot: needs('jms.url', 'jms.user', 'jms.password'),
    handle({ props, store, now, jms }, req) {
      if (req.method !== 'POST' || req.path !== '/orders') return { status: 404, ms: 3, body: '' }
      store.n = (store.n ?? 0) + 1
      const orderId = `SO-${3000 + store.n}`
      for (const dest of copiesToAudit(props) ? [IN, AUDIT] : [IN]) {
        const r = jms.publish(connOf(props), dest, { orderId, lines: 3 + (store.n % 4) }, { correlationId: orderId, size: ORDER_BYTES })
        if (r.ok) continue
        if (r.blocked) {
          store.blocked = keep(store.blocked, { t: now })
          return { status: 504, ms: 30000, body: '{"error":"Gateway Timeout"}', log: [warn(`Order ${orderId}: the publish to ${dest} is blocked by producer flow control. ${r.text}`)] }
        }
        return { status: 503, ms: 40, body: '{"error":"Order queue unavailable"}', log: [muleError({ flow: 'post-orders-flow', file: API, at: 2, name: 'Publish order', dsl: publishDsl(dest), type: r.muleType, message: r.text })] }
      }
      return { status: 201, ms: 60, body: `{"orderId":"${orderId}"}`, log: [] }
    },
  },
  [LOADER]: {
    note: `Takes the orders from ${IN} and loads them into the store ledger.`,
    boot: needs('jms.url', 'jms.user', 'jms.password'),
    schedules: [{ flow: 'ledger-load-flow', type: 'cron', value: '0 * * * * ?', tz: 'UTC', enabled: true }],
    run: {
      'ledger-load-flow': ({ props, store, jms }) => {
        const res = jms.listen(connOf(props), IN, { ackMode: 'AUTO', max: 50 }, () => ({ ok: true }))
        if (!res.ok) return { ok: false, ms: 100, errorType: res.muleType, log: [muleError({ flow: 'ledger-load-flow', file: LOADER, at: 0, name: 'Listener', dsl: `<jms:listener config-ref="AMQ_Config" destination="${IN}">`, type: res.muleType, message: res.text })], store }
        store.loaded = (store.loaded ?? 0) + res.results.length
        return { ok: true, ms: 200, log: res.results.length ? [info(`Loaded ${res.results.length} orders into the ledger`)] : [], store }
      },
    },
  },
  [WATCH]: {
    note: 'Every minute it reads QueueSize of the queues in watch.queues over Jolokia and mails alert.to when one is above dlq.alertDepth. Empty dlq.alertDepth means no alert. It mails at most once an hour per queue.',
    boot: needs('jms.url', 'watch.queues', 'alert.to'),
    schedules: [{ flow: 'depth-watch-flow', type: 'cron', value: '0 * * * * ?', tz: 'UTC', enabled: true }],
    run: {
      'depth-watch-flow': ({ props, store, now, jms }) => {
        const limit = alertDepth(props)
        const mail = []
        const log = []
        for (const q of clean(props['watch.queues']).split(',').map((x) => x.trim()).filter(Boolean)) {
          const st = jms.stats(connOf(props), q)
          if (!st.ok) continue
          store.depth = { ...(store.depth ?? {}), [q]: st.QueueSize }
          if (limit === null || st.QueueSize <= limit || now - (store.mailed?.[q] ?? -Infinity) < HOUR) continue
          store.mailed = { ...(store.mailed ?? {}), [q]: now }
          mail.push({ to: clean(props['alert.to']), subject: `ActiveMQ: ${q} has ${st.QueueSize} messages`, body: `${q} on harbor-amq has ${st.QueueSize} messages, above the limit of ${limit}. The store is ${st.storePercentUsage}% used. Look at the messages before they fill the broker.` })
          log.push(warn(`${q} has ${st.QueueSize} messages, above ${limit}. Alert mailed.`))
        }
        return { ok: true, ms: 100, log, store, ...(mail.length && { mail }) }
      },
    },
  },
}

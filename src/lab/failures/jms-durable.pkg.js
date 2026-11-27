// The sample applications of the jms-durable lab. Imports only platform-log.js and the import free JMS engine.
import { info, muleError, needs, warn } from '../platform-log.js'
import { connOf } from '../platform-jms.js'

export const FEED = 'stock-level-feed'
export const SYNC = 'warehouse-stock-sync'
export const TOPIC = 'STOCK.EVENTS'
export const PER_MINUTE = 3

const clean = (v) => String(v ?? '').trim()
const yes = (v) => clean(v).toLowerCase() === 'true'
const keep = (list, item, n = 240) => [...(list ?? []), item].slice(-n)
export const durable = (props) => yes(props['jms.durable'])
export const shared = (props) => yes(props['jms.shared'])
export const subName = (props) => clean(props['jms.subscriptionName'])
export const clientIdOf = (props) => clean(props['jms.clientId'])
const consumerXml = (props) => `<jms:topic-consumer durable="${durable(props)}" shared="${shared(props)}"${subName(props) ? ` subscriptionName="${subName(props)}"` : ''} />`

export const PACKAGES = {
  [FEED]: {
    note: `The stock system. Every minute it publishes ${PER_MINUTE} stock changes to the topic ${TOPIC} on Artemis, PERSISTENT.`,
    boot: needs('jms.url', 'jms.user', 'jms.password'),
    schedules: [{ flow: 'publish-stock-flow', type: 'cron', value: '0 * * * * ?', tz: 'UTC', enabled: true }],
    run: {
      'publish-stock-flow': ({ props, store, now, jms }) => {
        let next = store.next ?? 9001
        for (let i = 0; i < PER_MINUTE; i++) {
          const eventId = `SE-${next}`
          const r = jms.publish(connOf(props), TOPIC, { eventId, sku: `SKU-${300 + (next % 11)}`, delta: (next % 5) - 2 }, { type: 'topic', correlationId: eventId })
          if (!r.ok) return { ok: false, ms: 200, errorType: r.muleType, log: [muleError({ flow: 'publish-stock-flow', file: FEED, at: 1, name: 'Publish stock change', dsl: `<jms:publish config-ref="Artemis_Config" destination="${TOPIC}" destinationType="TOPIC">`, type: r.muleType ?? 'JMS:PUBLISHING', message: r.text })], store: { ...store, next } }
          store.sent = keep(store.sent, { id: eventId, t: now })
          next++
        }
        return { ok: true, ms: 200, log: [info(`Published stock changes SE-${next - PER_MINUTE} to SE-${next - 1} to ${TOPIC}`)], store: { ...store, next } }
      },
    },
  },
  [SYNC]: {
    note: `Keeps the stock of the warehouse system in step with ${TOPIC}. Each replica has a JMS listener on the topic. jms.durable, jms.shared and jms.subscriptionName set the topic consumer; jms.clientId is the clientId of the connection; jms.specification is JMS_1_1 or JMS_2_0.`,
    boot: needs('jms.url', 'jms.user', 'jms.password'),
    schedules: [{ flow: 'stock-sync-flow', type: 'cron', value: '0 * * * * ?', tz: 'UTC', enabled: true }],
    run: {
      'stock-sync-flow': ({ app, props, store, now, jms }) => {
        const log = []
        store.got ??= {}
        let errors = 0
        for (let r = 1; r <= (app.replicas ?? 1); r++) {
          const res = jms.listen(connOf(props, r), TOPIC, { type: 'topic', durable: durable(props), shared: shared(props), subscriptionName: subName(props), ackMode: 'AUTO', max: 200 }, (m) => {
            const e = JSON.parse(m.body)
            store.got[e.eventId] = (store.got[e.eventId] ?? 0) + 1
            return { ok: true }
          })
          if (!res.ok) {
            errors++
            const key = `${app.config}:${r}`
            store.refused = keep(store.refused, { t: now, replica: r, text: res.text }, 20)
            if (store.errKey?.[key] !== res.text) {
              log.push(muleError({ flow: 'stock-sync-flow', file: SYNC, at: 0, name: `Listener (replica ${r})`, dsl: `<jms:listener config-ref="Artemis_Config" destination="${TOPIC}">${consumerXml(props)}`, type: res.muleType, message: res.text }))
              store.errKey = { ...(store.errKey ?? {}), [key]: res.text }
            }
            continue
          }
          const n = res.results.length
          if (n) log.push(info(`Replica ${r}: applied ${n} stock change${n > 1 ? 's' : ''} to the warehouse system`))
        }
        // keep the event map to the last few hours
        const ids = Object.keys(store.got)
        if (ids.length > 600) store.got = Object.fromEntries(ids.slice(-500).map((k) => [k, store.got[k]]))
        if (errors) log.push(warn(`${errors} of ${app.replicas ?? 1} replicas have no working listener on ${TOPIC}.`))
        return { ok: errors === 0, ms: 300, errorType: errors ? 'JMS:CONNECTIVITY' : undefined, log, store }
      },
    },
  },
}

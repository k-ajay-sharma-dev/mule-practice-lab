// The sample applications of the amq-failover lab. Imports only platform-log.js and the import free JMS engine.
import { info, muleError, needs } from '../platform-log.js'
import { connOf } from '../platform-jms.js'

export const FEED = 'parcel-scan-feed'
export const TRACKER = 'parcel-tracking-sync'
export const QUEUE = 'PARCEL.EVENTS'
const HOUR = 3600000
const keep = (list, item, n = 200) => [...(list ?? []), item].slice(-n)

export const PACKAGES = {
  [FEED]: {
    note: `The depot scanners. Every minute it publishes 2 parcel scans (PERSISTENT) and 1 location ping (NON_PERSISTENT, time to live 30 minutes) to ${QUEUE}.`,
    boot: needs('jms.url', 'jms.user', 'jms.password'),
    schedules: [{ flow: 'publish-scans-flow', type: 'cron', value: '0 * * * * ?', tz: 'UTC', enabled: true }],
    run: {
      'publish-scans-flow': ({ props, store, jms }) => {
        let next = store.next ?? 88001
        const sends = [
          [{ parcel: `P-${next}`, event: 'SCANNED' }, {}],
          [{ parcel: `P-${next + 1}`, event: 'SCANNED' }, {}],
          [{ van: `V-${next % 17}`, event: 'PING' }, { persistent: false, ttl: 30 * 60000, msgType: 'ping' }],
        ]
        for (const [body, o] of sends) {
          const r = jms.publish(connOf(props), QUEUE, body, o)
          if (!r.ok) return { ok: false, ms: 200, errorType: r.muleType, log: [muleError({ flow: 'publish-scans-flow', file: FEED, at: 1, name: 'Publish scan', dsl: `<jms:publish config-ref="AMQ_Config" destination="${QUEUE}">`, type: r.muleType ?? 'JMS:PUBLISHING', message: r.text })], store: { ...store, next } }
        }
        next += 2
        return { ok: true, ms: 100, log: [], store: { ...store, next } }
      },
    },
  },
  [TRACKER]: {
    note: `A JMS listener on ${QUEUE} that writes each scan to the tracking database. jms.reconnect is the reconnection strategy of the JMS config: forever (reconnect-forever) or none. Between 05:00 and 06:00 the nightly backup of the tracking database slows it to 2 messages a minute.`,
    boot: needs('jms.url', 'jms.user', 'jms.password'),
    schedules: [{ flow: 'tracking-sync-flow', type: 'cron', value: '0 * * * * ?', tz: 'UTC', enabled: true }],
    run: {
      'tracking-sync-flow': ({ app, props, store, now, jms }) => {
        const slow = Math.floor((now % (24 * HOUR)) / HOUR) === 5
        const res = jms.listen(connOf(props), QUEUE, { ackMode: 'AUTO', max: slow ? 2 : 30 }, (m) => {
          store.handled = keep(store.handled, { t: now, ping: m.type === 'ping' })
          return { ok: true }
        })
        if (!res.ok) {
          const key = `${app.config}:${res.text}`
          if (store.logged === key) return { ok: false, ms: 10, errorType: res.muleType, log: [], store }
          store.logged = key
          return { ok: false, ms: 10, errorType: res.muleType, log: [muleError({ flow: 'tracking-sync-flow', file: TRACKER, at: 0, name: 'Listener', dsl: `<jms:listener config-ref="AMQ_Config" destination="${QUEUE}">`, type: res.muleType, message: res.text })], store }
        }
        const n = res.results.length
        return { ok: true, ms: 200, log: n ? [info(`Wrote ${n} parcel events to the tracking database, connected to ${res.node}`)] : [], store }
      },
    },
  },
}

// The sample applications of the amq-prefetch lab. Imports only platform-log.js and the import free JMS engine.
import { info, muleError, needs, warn } from '../platform-log.js'
import { connOf, parseUrl } from '../platform-jms.js'

export const INVOICER = 'month-end-invoicer'
export const RENDERER = 'invoice-pdf-renderer'
export const QUEUE = 'INVOICES.RENDER'
export const BATCH = 200
// each PDF takes about 30 seconds, so one consumer renders 2 a minute
export const PER_MINUTE = 2
const MINUTE = 60000

const keep = (list, item, n = 400) => [...(list ?? []), item].slice(-n)
export const prefetchOf = (props) => {
  const p = parseUrl(props['jms.url']).params
  const v = p['jms.prefetchPolicy.queuePrefetch'] ?? p['jms.prefetchPolicy.all']
  return v !== undefined && v !== '' && Number.isInteger(Number(v)) ? Number(v) : 1000
}

export const PACKAGES = {
  [INVOICER]: {
    note: `At 06:00 on the last day of the month it puts one render job per customer invoice on ${QUEUE}, ${BATCH} jobs.`,
    boot: needs('jms.url', 'jms.user', 'jms.password'),
    schedules: [{ flow: 'month-end-flow', type: 'cron', value: '0 0 6 * * ?', tz: 'UTC', enabled: true }],
    run: {
      'month-end-flow': ({ props, store, jms }) => {
        let next = store.next ?? 70001
        for (let i = 0; i < BATCH; i++, next++) {
          const r = jms.publish(connOf(props), QUEUE, { invoice: `INV-${next}` }, { correlationId: `INV-${next}` })
          if (!r.ok) return { ok: false, ms: 900, errorType: r.muleType, log: [muleError({ flow: 'month-end-flow', file: INVOICER, at: 2, name: 'Publish render job', dsl: `<jms:publish config-ref="AMQ_Config" destination="${QUEUE}">`, type: r.muleType ?? 'JMS:PUBLISHING', message: r.text })], store: { ...store, next } }
        }
        return { ok: true, ms: 1800, log: [info(`Queued ${BATCH} invoice render jobs on ${QUEUE}`)], store: { ...store, next } }
      },
    },
  },
  [RENDERER]: {
    note: `Each replica has a JMS listener on ${QUEUE} (numberOfConsumers 1) and renders one invoice PDF in about 30 seconds. The prefetch of the ActiveMQ client comes from the broker URL in jms.url, for example ?jms.prefetchPolicy.queuePrefetch=1; the default is 1000.`,
    boot: needs('jms.url', 'jms.user', 'jms.password'),
    schedules: [{ flow: 'render-invoice-flow', type: 'cron', value: '0 * * * * ?', tz: 'UTC', enabled: true }],
    run: {
      'render-invoice-flow': ({ app, props, store, now, jms }) => {
        const log = []
        for (let r = 1; r <= (app.replicas ?? 1); r++) {
          // lab-made: the replicas of a deploy are ready one after the other, two minutes apart
          if (now < (app.started ?? 0) + (r - 1) * 2 * MINUTE) continue
          const res = jms.listen(connOf(props, r), QUEUE, { ackMode: 'AUTO', max: PER_MINUTE }, (m) => {
            store.done = keep(store.done, { id: JSON.parse(m.body).invoice, r, t: now, n: m.deliveryCount })
            return { ok: true }
          })
          if (!res.ok) {
            log.push(muleError({ flow: 'render-invoice-flow', file: RENDERER, at: 0, name: 'Listener', dsl: `<jms:listener config-ref="AMQ_Config" destination="${QUEUE}" numberOfConsumers="1">`, type: res.muleType, message: res.text }))
            continue
          }
          const n = res.results.length
          if (n) log.push(info(`Replica ${r}: rendered ${n} invoice PDF${n > 1 ? 's' : ''}, ${n * 30} s of work`))
          else if (!store.idle?.[`${app.config}:${r}`]) {
            log.push(warn(`Replica ${r}: the listener on ${QUEUE} is connected and gets no messages.`))
            store.idle = { ...(store.idle ?? {}), [`${app.config}:${r}`]: now }
          }
        }
        return { ok: true, ms: 30000, log, store }
      },
    },
  },
}

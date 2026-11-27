// The sample application of the setup-activemq lab. Imports only platform-log.js and the import free JMS engine.
//
// amq-refund-ledger-app books refunds in the finance ledger. The returns system sends one JMS message per refund to an
// ActiveMQ Classic queue; the app's listener takes each one and books it. POST /refunds/test sends test refunds.
import { info, muleError, needs, warn } from '../platform-log.js'
import { connOf, parseUrl } from '../platform-jms.js'

export const APP = 'amq-refund-ledger-app'
export const QUEUE = 'RETURNS.REFUNDS'
export const USER = 'mule-refunds'
export const GROUP = 'refunds'
const FLOW = 'refund-ledger-flow'

const clean = (v) => String(v ?? '').trim()
const keep = (list, item, n = 300) => [...(list ?? []), item].slice(-n)
const intOf = (v) => (clean(v) !== '' && Number.isInteger(Number(v)) ? Number(v) : null)
export const prefetchOf = (props) => {
  const p = parseUrl(props['jms.url']).params
  return intOf(p['jms.prefetchPolicy.queuePrefetch'] ?? p['jms.prefetchPolicy.all']) ?? 1000
}
// the RedeliveryPolicy of the client: maximumRedeliveries on the broker URL wins over maxRedelivery of the factory
export const redeliveriesOf = (props) => intOf(parseUrl(props['jms.url']).params['jms.redeliveryPolicy.maximumRedeliveries']) ?? intOf(props['jms.maxRedelivery']) ?? 6
export const transacted = (props) => clean(props['jms.transactionalAction']).toUpperCase() === 'ALWAYS_BEGIN'
export function readRefund(body) {
  try {
    const r = JSON.parse(body)
    return r && typeof r.refundId === 'string' && r.refundId && Number(r.amount) > 0 ? r : null
  } catch {
    return null
  }
}
const countOf = (path) => Math.max(1, Math.min(100, Number((path.match(/[?&]count=(\d+)/) ?? [])[1] ?? 20)))
const listenDsl = '<jms:listener config-ref="AMQ_Config" destination="${jms.queue}" transactionalAction="${jms.transactionalAction}" transactionType="LOCAL">'
const parseError = (id) => ({ flow: FLOW, file: APP, at: 1, name: 'Read refund', dsl: '<ee:transform doc:name="Read refund">', type: 'MULE:EXPRESSION', message: `Unable to read the refund in message ${id}: it is not JSON with a refundId and an amount above 0.` })

export const PACKAGES = {
  [APP]: {
    note: 'A JMS listener on jms.queue (ActiveMQ Classic, active-mq-connection) books each refund in the ledger in about 2 seconds. jms.url is the broker URL: a failover: list and options such as jms.prefetchPolicy.queuePrefetch go there. jms.maxRedelivery is the maxRedelivery of the factory configuration (the RedeliveryPolicy of the client, 6 by default). jms.transactionalAction is NONE (the default) or ALWAYS_BEGIN for a local JMS transaction per message. GET /health opens a connection. POST /refunds/test?count=20 sends that many test refunds to the queue.',
    boot: needs('jms.url', 'jms.user', 'jms.password', 'jms.queue'),
    schedules: [{ flow: FLOW, type: 'cron', value: '0 * * * * ?', tz: 'UTC', enabled: true }],
    handle({ app, props, now, jms }, req) {
      const store = (app.store ??= {})
      const cfg = connOf(props)
      const queue = clean(props['jms.queue'])
      if (req.method === 'GET' && req.path === '/health') {
        const c = jms.connect(cfg)
        if (!c.ok) return { status: 503, ms: 1200, body: JSON.stringify({ status: 'DOWN', jms: c.text }), log: [muleError({ flow: 'health-flow', file: APP, at: 1, name: 'Connect', dsl: '<jms:config name="AMQ_Config">', type: c.muleType ?? 'JMS:CONNECTIVITY', message: c.text })] }
        return { status: 200, ms: 30, body: JSON.stringify({ status: 'UP', jms: { broker: c.broker, connectedTo: c.host, failover: c.failover, connectionId: c.connectionId, user: cfg.user } }), log: [info(`Health check: connected to ${c.broker} on ${c.host}${c.failover ? ' through the failover transport' : ''} as ${cfg.user}`, 'org.apache.activemq.transport.failover.FailoverTransport')] }
      }
      if (req.method === 'POST' && req.path.startsWith('/refunds/test')) {
        const n = countOf(req.path)
        let next = store.next ?? 7101
        for (let i = 0; i < n; i++, next++) {
          const refundId = `RF-${next}`
          const r = jms.publish(cfg, queue, { refundId, returnId: `R-${next - 2700}`, amount: 9 + (next % 6) * 5.5, currency: 'EUR', at: now }, { correlationId: refundId, persistent: true })
          if (!r.ok) {
            store.next = next
            return { status: 500, ms: 400, body: JSON.stringify({ sent: i, error: r.text }), log: [muleError({ flow: 'test-refunds-flow', file: APP, at: 2, name: 'Publish refund', dsl: '<jms:publish config-ref="AMQ_Config" destination="${jms.queue}">', type: r.muleType ?? 'JMS:PUBLISHING', message: r.text })] }
          }
          store.test = keep(store.test, refundId)
        }
        store.next = next
        return { status: 202, ms: 15 * n, body: JSON.stringify({ sent: n, queue }), log: [info(`Sent ${n} test refunds to ${queue}`)] }
      }
      return { status: 404, ms: 3, body: '' }
    },
    run: {
      [FLOW]: ({ props, store, jms }) => {
        const queue = clean(props['jms.queue'])
        const res = jms.listen(connOf(props), queue, { ackMode: 'AUTO', transactionalAction: transacted(props) ? 'ALWAYS_BEGIN' : 'NONE', max: 60, consumer: 1 }, (m) => {
          const r = readRefund(m.body)
          if (!r) return { ok: false, error: parseError(m.id) }
          if (!(store.done ?? []).includes(r.refundId)) store.done = keep(store.done, r.refundId)
          return { ok: true }
        })
        if (!res.ok) return { ok: false, ms: 500, errorType: res.muleType, log: [muleError({ flow: FLOW, file: APP, at: 0, name: 'Listener', dsl: listenDsl, type: res.muleType ?? 'JMS:CONNECTIVITY', message: res.text })], store }
        const log = []
        const good = res.results.filter((x) => x.ok).length
        const bad = res.results.filter((x) => !x.ok)
        for (const x of bad.filter((y) => y.deliveryCount === 1)) log.push(muleError(parseError(x.id)))
        for (const x of bad.filter((y) => y.outcome === 'dlq')) log.push(warn(`Message ${x.id} failed on delivery ${x.deliveryCount}, past maximumRedeliveries ${redeliveriesOf(props)}. The client sent a poison ack and the broker moved it to ${x.to}.`, 'org.apache.activemq.ActiveMQMessageConsumer'))
        if (good) log.push(info(`Booked ${good} refund${good > 1 ? 's' : ''} in the ledger${transacted(props) ? ', each in its own JMS transaction' : ''}. Connected to ${res.node}.`))
        return { ok: !bad.length, ms: Math.min(55000, 2000 * Math.max(1, good)), errorType: bad.length ? 'MULE:EXPRESSION' : undefined, log, store }
      },
    },
  },
}

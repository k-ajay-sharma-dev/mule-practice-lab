// The sample application of the setup-anypoint-mq lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
//
// mq-returns-refund-app takes return requests from the returns portal and puts them on an Anypoint MQ queue. Its
// Subscriber takes each one and books the refund. A request it cannot read fails, and the queue sends it to its dead
// letter queue after the set number of deliveries.
import { info, needs, warn } from '../platform-log.js'

export const APP = 'mq-returns-refund-app'
export const QUEUE = 'returns-refunds'
export const DLQ = 'returns-refunds-dlq'
export const CLIENT = 'returns-refund-sbx'
export const MQ_URL = 'https://mq-us-east-1.anypoint.mulesoft.com/api/v1'
const FLOW = 'refund-subscriber-flow'

const clean = (v) => String(v ?? '').trim()
const keep = (list, item, n = 300) => [...(list ?? []), item].slice(-n)
const BROKER = /^https:\/\/mq-[a-z]{2}-[a-z]+-\d\.anypoint\.mulesoft\.com\/api\/v1\/?$/
export function readReturn(body) {
  try {
    const r = JSON.parse(body)
    return r && typeof r.returnId === 'string' && r.returnId && Number(r.amount) > 0 ? r : null
  } catch {
    return null
  }
}
const countOf = (path) => Math.max(1, Math.min(100, Number((path.match(/[?&]count=(\d+)/) ?? [])[1] ?? 10)))
const parseError = (id) => ({ flow: FLOW, file: APP, at: 1, name: 'Read return request', dsl: '<ee:transform doc:name="Read return request">', type: 'MULE:EXPRESSION', message: `Unable to parse the return request of message ${id}: it is not JSON with a returnId and an amount above 0.` })

export const PACKAGES = {
  [APP]: {
    note: 'POST /returns/test?count=10 publishes that many sample return requests to the queue in mq.queue, a smoke test for the go-live. GET /health answers with the broker URL and the queue. The Subscriber on mq.queue (acknowledgementMode AUTO) books one refund per request; a request it cannot read raises MULE:EXPRESSION, so the message is nacked and delivered again. mq.url is the broker URL of the region, mq.clientId and mq.clientSecret the client app.',
    boot: (ctx) => {
      const gone = needs('mq.url', 'mq.clientId', 'mq.clientSecret', 'mq.queue')(ctx)
      if (gone) return gone
      return BROKER.test(clean(ctx.props['mq.url'])) ? null : `Anypoint MQ Connector: the broker URL ${clean(ctx.props['mq.url'])} is not valid. Use https://mq-<region>.anypoint.mulesoft.com/api/v1`
    },
    consumes: 'mq.queue',
    handle({ app, props, now, put }, req) {
      const store = (app.store ??= {})
      const queue = clean(props['mq.queue'])
      if (req.method === 'GET' && req.path === '/health') {
        const id = clean(props['mq.clientId'])
        return { status: 200, ms: 60, body: JSON.stringify({ status: 'UP', mq: { url: clean(props['mq.url']), queue, clientId: `${id.slice(0, 4)}...${id.slice(-4)}` } }), log: [info(`Health check: Anypoint MQ broker ${clean(props['mq.url'])}, queue ${queue}, client ${id.slice(0, 4)}...`)] }
      }
      if (req.method === 'POST' && req.path.startsWith('/returns/test')) {
        const n = countOf(req.path)
        let next = store.next ?? 4401
        for (let i = 0; i < n; i++, next++) {
          const returnId = `R-${next}`
          put(queue, JSON.stringify({ returnId, orderId: `O-${next - 2000}`, amount: 12 + (next % 7) * 3.5, reason: 'damaged', at: now }))
          store.test = keep(store.test, returnId)
        }
        store.next = next
        return { status: 202, ms: 25 * n, body: JSON.stringify({ published: n, queue }), log: [info(`Published ${n} test return requests to ${queue}`)] }
      }
      return { status: 404, ms: 3, body: '' }
    },
    consume(ctx, message) {
      const store = (ctx.app.store ??= {})
      const r = readReturn(message.body)
      if (!r) return { ok: false, flow: FLOW, errorType: 'MULE:EXPRESSION', error: parseError(message.id) }
      if ((store.done ?? []).includes(r.returnId)) return { ok: true, flow: FLOW, log: [warn(`Return ${r.returnId} was refunded already. Acknowledged without a second refund. Delivery ${message.deliveries}`)] }
      store.done = keep(store.done, r.returnId)
      return { ok: true, flow: FLOW, log: [info(`Refund of ${Number(r.amount).toFixed(2)} booked for ${r.returnId} (order ${r.orderId}). Message ${message.id} acknowledged.`)] }
    },
  },
}


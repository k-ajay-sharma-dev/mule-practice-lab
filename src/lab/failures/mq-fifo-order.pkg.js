// The sample applications of the mq-fifo-order lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
import { info, needs, warn } from '../platform-log.js'

export const STANDARD_QUEUE = 'order-status'
export const FIFO_QUEUE = 'order-status.fifo'
export const FIRST_ORDER = 5101
// The order of the events the order system sends for one order
export const SEQUENCE = { created: 1, paid: 2, shipped: 3 }

const json = (value) => JSON.stringify(value)
const read = (body) => {
  try {
    const e = JSON.parse(body)
    return e && e.orderId && SEQUENCE[e.status] ? e : null
  } catch {
    return null
  }
}
export const sequenceCheck = (props) => String(props['status.sequenceCheck']).trim() === 'true'
// A Message Group ID per order, such as #[payload.orderId]
export const groupPerOrder = (props) => /orderId/.test(String(props['mq.messageGroupId'] ?? ''))
// the status the order system holds: the event with the highest sequence
export const truth = (order) => order.latest
export const wrongOrders = (orders = {}) => Object.entries(orders).filter(([, o]) => o.latest && o.status !== o.latest).map(([id]) => id)

const write = (store, e, replica, log, check) => {
  const o = (store.orders[e.orderId] ??= { status: null, sequence: 0, latest: null, top: 0, history: [] })
  if (e.sequence > o.top) Object.assign(o, { top: e.sequence, latest: e.status })
  if (check && e.sequence <= o.sequence) {
    log.push(info(`Skipped ${e.status} of ${e.orderId}: sequence ${e.sequence} is not newer than the stored sequence ${o.sequence} (${o.status}) (${replica})`))
    return
  }
  const was = o.status
  Object.assign(o, { status: e.status, sequence: e.sequence })
  o.history = [...o.history, e.status].slice(-6)
  log.push(was && SEQUENCE[was] > e.sequence ? warn(`Order ${e.orderId} status set to ${e.status} (was ${was}) (${replica})`) : info(`Order ${e.orderId} status set to ${e.status} (${replica})`))
}

export const PACKAGES = {
  'order-status-publisher': {
    note: 'The order system side. Every 2 minutes it publishes the status events of one click and collect order (created, paid, shipped) to the queue in queue.name. mq.messageGroupId is the Message Group ID of the Publish operation, used by a FIFO queue.',
    boot: needs('queue.name'),
    schedules: [{ flow: 'publish-status-flow', type: 'fixed', value: 2, unit: 'minutes', enabled: true }],
    run: {
      'publish-status-flow': ({ props, store }) => {
        const n = store.next ?? FIRST_ORDER
        const orderId = `O-${n}`
        const queue = props['queue.name']
        const bodies = Object.entries(SEQUENCE).map(([status, sequence]) => json({ orderId, status, sequence }))
        const group = String(props['mq.messageGroupId'] ?? '').trim()
        const groupText = queue === FIFO_QUEUE ? (groupPerOrder(props) ? `, message group ${orderId}` : ', no Message Group ID, so every message shares one default group') : ''
        return { ok: true, ms: 400, log: [info(`Published created, paid and shipped of ${orderId} to ${queue}${groupText}${group && queue !== FIFO_QUEUE ? '. A standard queue ignores the Message Group ID' : ''}`)], send: { queue, bodies }, store: { next: n + 1 } }
      },
    },
  },
  'order-status-consumer': {
    note: 'Takes order status events from the queue in queue.name (Subscriber, AUTO) and writes the status of each order to the order database. Several messages are processed at the same time. status.sequenceCheck true skips an event whose sequence is not newer than the stored one. GET /orders/{orderId} shows what is stored.',
    boot: needs('queue.name', 'status.sequenceCheck'),
    sample: { method: 'GET', path: '/orders/O-5102' },
    schedules: [{ flow: 'resync-status-flow', type: 'fixed', value: 1, unit: 'days', enabled: false }],
    consumes: 'queue.name',
    consume(ctx, message) {
      const e = read(message.body)
      if (!e) return { ok: true, flow: 'order-status-flow', log: [warn(`Message ${message.id} is not an order status event. Ignored.`)] }
      const store = ctx.store
      store.orders ??= {}
      store.held ??= {}
      const check = sequenceCheck(ctx.props)
      const fifo = ctx.props['queue.name'] === FIFO_QUEUE
      const two = ctx.app.replicas > 1 ? 'replica 2' : 'thread 2'
      const one = ctx.app.replicas > 1 ? 'replica 1' : 'thread 1'
      const log = [info(`Message received. Message Id ${message.id}, ${e.orderId} ${e.status}, sequence ${e.sequence}`)]
      // On a standard queue the events of one order are taken by different consumers at the same time. For an even order
      // number the payment lookup in the paid flow is slow, so its write lands after the shipped write.
      if (!fifo && e.status === 'paid' && Number(e.orderId.slice(2)) % 2 === 0) {
        store.held[e.orderId] = e
        log.push(info(`${e.orderId} paid: payment lookup is slow today, about 2.4 s (${two})`))
        return { ok: true, flow: 'order-status-flow', log }
      }
      write(store, e, one, log, check)
      const late = store.held[e.orderId]
      if (late) {
        delete store.held[e.orderId]
        write(store, late, two, log, check)
      }
      return { ok: true, flow: 'order-status-flow', log }
    },
    handle(ctx, req) {
      const path = req.path.split('?')[0]
      const id = path.match(/^\/orders\/([\w-]+)$/)?.[1]
      const orders = ctx.store.orders ?? {}
      if (req.method === 'GET' && path === '/orders') return { status: 200, ms: 12, flow: 'get:\\orders', body: json(Object.entries(orders).map(([orderId, o]) => ({ orderId, status: o.status }))) }
      if (req.method !== 'GET' || !id) return { status: 404, ms: 3, body: json({ message: 'Resource not found' }) }
      const o = orders[id]
      if (!o) return { status: 404, ms: 8, flow: 'get:\\orders\\(orderId)', body: json({ message: `Order ${id} not found` }) }
      return { status: 200, ms: 9, flow: 'get:\\orders\\(orderId)', body: json({ orderId: id, status: o.status, sequence: o.sequence, writes: o.history, statusInOrderSystem: o.latest }) }
    },
    run: {
      'resync-status-flow': ({ store }) => {
        const orders = structuredClone(store.orders ?? {})
        const wrong = wrongOrders(orders)
        for (const id of wrong) Object.assign(orders[id], { status: orders[id].latest, sequence: orders[id].top, history: [...orders[id].history, `${orders[id].latest} (resync)`].slice(-6) })
        return {
          ok: true,
          ms: 2000,
          log: [info('Starting resync-status-flow'), info(`Compared ${Object.keys(orders).length} orders with the order system. Corrected ${wrong.length}${wrong.length ? `: ${wrong.join(', ')}` : ''}`)],
          store: { orders },
        }
      },
    },
  },
}

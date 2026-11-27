// The sample application of the b2b-setup lab: the order API that the new partner's inbound 850 flow delivers to.
// Imports only platform-log.js, so the engine can load it without a cycle.
import { info } from '../platform-log.js'

export const NAME = 'harbor-b2b-order-api'
export const FLOW = 'b2b-order-api-flow'

export const PACKAGES = {
  [NAME]: {
    note: 'The order API of Harbor for EDI partners. Every minute it takes the purchase orders that any Partner Manager flow delivered to it as JSON and creates an order for each one. It does not see the X12: validation and the 997 happen in Partner Manager.',
    schedules: [{ flow: FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { store, now } = ctx
        const docs = ctx.b2b.receive()
        if (!docs.length) return { ok: true, ms: 60, log: [], store }
        store.orders ??= {}
        const log = []
        for (const d of docs) {
          store.orders[d.orderNumber] = { t: now, partner: d.partner, lines: d.lines.length }
          log.push(info(`POST /api/orders: created order ${d.orderNumber} for ${d.partner} with ${d.lines.length} lines (${d.lines.map((l) => `${l.qty} ${l.unit} ${l.item}`).join(', ')})`))
        }
        const keys = Object.keys(store.orders)
        for (const k of keys.slice(0, Math.max(0, keys.length - 30))) delete store.orders[k]
        return { ok: true, ms: 250, log, store }
      },
    },
  },
}

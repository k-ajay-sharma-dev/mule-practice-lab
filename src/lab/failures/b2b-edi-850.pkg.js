// The sample application of the b2b-edi-850 lab: the target of the Partner Manager flow that turns Northwind's 850
// purchase orders into orders. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, muleError, needs, warn } from '../platform-log.js'

export const NAME = 'harbor-edi-order-intake'
export const FLOW = 'edi-order-intake-flow'
export const PM_FLOW = 'nw-850-in'
const HOUR = 3600000
const keep = (list, item, n = 40) => [...(list ?? []), item].slice(-n)

export const PACKAGES = {
  [NAME]: {
    note:
      'The Order API behind the Partner Manager message flow b2b.flow. Every minute it takes the purchase orders the flow mapped to JSON, creates an order for each one and answers the partner with an 855 purchase order acknowledgment. It never sees the X12: validation and the 997 happen in Partner Manager. When no order came for an hour it writes a warning.',
    boot: needs('b2b.flow'),
    schedules: [{ flow: FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { props, store, now } = ctx
        const docs = ctx.b2b.receive(props['b2b.flow'])
        store.orders ??= {}
        if (!docs.length) {
          const last = store.lastOrder ?? 0
          if (now - Math.max(last, store.lastWarn ?? 0, store.since ?? (store.since = now)) < HOUR) return { ok: true, ms: 80, log: [], store }
          store.lastWarn = now
          return { ok: true, ms: 80, log: [warn(`No purchase order arrived from Partner Manager flow ${props['b2b.flow']} in the last 60 minutes.${store.lastPo ? ` The last one was ${store.lastPo}.` : ' None arrived since the app started.'}`)], store }
        }
        const log = []
        let errors = 0
        for (const d of docs) {
          store.orders[d.orderNumber] = { t: now, lines: d.lines.length, units: d.lines.map((l) => l.unit) }
          const keys = Object.keys(store.orders)
          if (keys.length > 40) delete store.orders[keys[0]]
          store.lastOrder = now
          store.lastPo = d.orderNumber
          store.created = keep(store.created, { po: d.orderNumber, t: now })
          log.push(info(`Created order ${d.orderNumber} for ${d.partner}: ${d.lines.map((l) => `${l.qty} ${l.unit} ${l.item}`).join(', ')}`))
          const r = ctx.b2b.ack(d.id, 'AC')
          if (r.ok) log.push(info(`855 for ${d.orderNumber} sent to ${d.partner} as interchange ${r.isa}`))
          else {
            errors++
            log.push(muleError({ flow: FLOW, file: NAME, at: 3, name: 'Send 855', dsl: '<http:request method="POST" doc:name="Send 855" config-ref="Partner_Manager" path="/855">', type: r.type, message: r.error }))
          }
        }
        return { ok: errors === 0, ms: 300, errors, log, store }
      },
    },
  },
}

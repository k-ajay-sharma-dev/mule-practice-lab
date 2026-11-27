// The sample application of the b2b-997-missing lab: it sends an 856 ship notice to Bayline Logistics for each truck
// that leaves the warehouse. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, muleError } from '../platform-log.js'

export const NAME = 'brightmart-asn-dispatch'
export const FLOW = 'asn-dispatch-flow'
const keep = (list, item, n = 30) => [...(list ?? []), item].slice(-n)

export const PACKAGES = {
  [NAME]: {
    note:
      'Every 15 minutes a truck leaves the Brightmart warehouse. The app builds the ship notice and hands it to Partner Manager with the outbound flow Ship notice 856 to Bayline. When Partner Manager answers that the AS2 message was sent, the app marks the shipment as notified. It never looks at the MDN or the 997.',
    schedules: [{ flow: FLOW, type: 'fixed', value: '15', unit: 'minutes', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { store, now } = ctx
        const n = (store.n = (store.n ?? 0) + 1)
        const shipment = `SH-${70400 + n}`
        const po = `PO-${88100 + n}`
        const r = ctx.b2b.sendDocument('Bayline Logistics', '856', { shipment, po, bol: `BOL-${5100 + n}`, shipTo: 'Bayline Hub North', shipToCode: 'BH01', lines: [{ part: 'H-100', qty: 24, uom: 'EA' }, { part: 'H-300', qty: 10, uom: 'BX' }] })
        if (!r.ok) return { ok: false, ms: 400, errorType: r.type, log: [muleError({ flow: FLOW, file: NAME, at: 2, name: 'Send ASN', dsl: '<http:request method="POST" doc:name="Send ASN" config-ref="Partner_Manager" path="/856">', type: r.type, message: r.error })], store }
        store.notified = keep(store.notified, { shipment, po, isa: r.isa, t: now })
        return { ok: true, ms: 350, log: [info(`ASN ${shipment} for ${po} handed to Partner Manager: interchange ${r.isa}, AS2 HTTP 200. Shipment marked as notified.`)], store }
      },
    },
  },
}

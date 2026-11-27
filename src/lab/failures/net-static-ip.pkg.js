// The sample application of the net-static-ip lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, muleError, needs, warn } from '../platform-log.js'

export const NAME = 'larkspur-booking-sync'
export const FLOW = 'booking-push-flow'
export const PARTNER = 'api.larkspur-freight.example'

const el = { at: 3, name: 'Post bookings to Larkspur', dsl: '<http:request method="POST" config-ref="Larkspur_HTTPS" path="${partner.path}">' }

export const PACKAGES = {
  [NAME]: {
    note: 'Every 5 minutes it posts the new freight bookings of Brightmart to the booking API of Larkspur Freight at https://partner.host + partner.path. Larkspur lets in only the IP addresses on its allowlist.',
    boot: needs('partner.host', 'partner.path'),
    schedules: [{ flow: FLOW, type: 'fixed', value: '5', unit: 'minutes', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { props, store } = ctx
        const waiting = (store.waiting ?? 0) + 3 // three new bookings every 5 minutes
        const r = ctx.network.request(props['partner.host'], { method: 'POST', path: props['partner.path'] })
        const log = [info(`Posting ${waiting} bookings to ${props['partner.host']}`)]
        if (!r.ok) {
          log.push(muleError({ flow: FLOW, file: NAME, ...el, type: r.type, message: r.message }))
          if (waiting > 3) log.push(warn(`${waiting} bookings wait for Larkspur now. They are sent again on the next run.`))
          return { ok: false, ms: r.kind === 'forbidden' ? 300 : 30000, errorType: r.type, log, store: { waiting } }
        }
        log.push(info(`Larkspur answered ${r.status} Created for ${waiting} bookings`))
        return { ok: true, ms: 400, log, store: { waiting: 0, sent: (store.sent ?? 0) + waiting } }
      },
    },
  },
}

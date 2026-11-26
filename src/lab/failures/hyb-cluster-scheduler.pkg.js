// The sample applications of the hyb-cluster-scheduler lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
import { info, needs } from '../platform-log.js'

const BASE = Date.UTC(2026, 10, 2) // the same day zero as the lab clock
const INVOICES = 86
const dayOf = (now) => new Date(BASE + now).toISOString().slice(0, 10)

export const PACKAGES = {
  'hyb-invoice-mailer': {
    note: 'An invoice API, plus a scheduler that emails the open invoices to customers every night at 01:00.',
    sample: { method: 'GET', path: '/invoices' },
    boot: needs('smtp.host'),
    schedules: [{ flow: 'invoice-mail-flow', type: 'cron', value: '0 0 1 * * ?', tz: 'UTC', enabled: true }],
    handle: () => ({ status: 200, ms: 70, flow: 'get:\\invoices', body: '[{"invoice":"INV-3107","status":"OPEN"}]' }),
    run: {
      // The engine calls this once per server that runs the schedule, with ctx.node. The store of the lab is one per
      // application, so it only records the runs of one night here. It is not used to stop a second run, because the
      // servers of a server group share nothing.
      'invoice-mail-flow': ({ props, now, node, store }) => {
        const day = dayOf(now)
        const same = store.lastRun?.t === now
        const nodes = [...(same ? store.lastRun.nodes : []), node ?? 'replica']
        return {
          ok: true,
          ms: 30000,
          log: [info(`Starting invoice-mail-flow on ${node ?? 'the replica'}`), info(`Read ${INVOICES} open invoices for ${day}`), info(`Sent ${INVOICES} invoice mails through ${props['smtp.host']}. Job finished.`)],
          store: { lastRun: { t: now, day, nodes, invoices: INVOICES, mails: nodes.length * INVOICES } },
        }
      },
    },
  },
}

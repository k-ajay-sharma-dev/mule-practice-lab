// The sample application of the scheduler-twice lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info } from '../platform-log.js'

const BASE = Date.UTC(2026, 10, 2) // the same day zero as the lab clock
const INVOICES = 120
const SUFFIXES = ['x2k9p', 'm7q4d', 'c8v1n', 'r3t6w', 'h5j2s', 'p9b4k', 'f1z8g', 'w6y3e']
// the first name is the one the platform writes when the replica starts
const replicaOf = (app, i) => `${app.name.slice(0, 18)}-${(app.name.length * 7919 + app.config * 31).toString(16).slice(0, 5)}-${SUFFIXES[i % SUFFIXES.length]}`
const dayOf = (now) => new Date(BASE + now).toISOString().slice(0, 10)

export const PACKAGES = {
  'invoice-mailer': {
    note: 'An invoice API, plus a scheduler that emails the open invoices to customers every night at 01:00.',
    sample: { method: 'GET', path: '/invoices' },
    boot: ({ props }) => (String(props['smtp.host'] ?? '').trim() ? null : 'Couldn\'t find configuration property value for key ${smtp.host} from properties provider "Environment properties"'),
    schedules: [{ flow: 'invoice-mail-flow', type: 'cron', value: '0 0 1 * * ?', tz: 'UTC', enabled: true }],
    handle: () => ({ status: 200, ms: 90, flow: 'get:\\invoices', body: '[{"invoice":"INV-2041","status":"OPEN"}]' }),
    run: {
      // The engine calls a schedule once. Without clustering every replica is its own Mule runtime with its own
      // scheduler, so the lab writes the run of each replica into this one result.
      'invoice-mail-flow': ({ app, props, now }) => {
        const copies = app.cluster || app.replicas < 2 ? 1 : app.replicas
        const day = dayOf(now)
        const log = []
        for (let i = 0; i < copies; i++) {
          const replica = replicaOf(app, i)
          log.push(info(`[${replica}] Starting invoice-mail-flow`))
          log.push(info(`[${replica}] Read ${INVOICES} open invoices for ${day}`))
          log.push(info(`[${replica}] Sent ${INVOICES} invoice mails through ${props['smtp.host']}. Job finished.`))
        }
        return { ok: true, ms: 40000, log, store: { lastRun: { t: now, day, copies, invoices: INVOICES, mails: copies * INVOICES } } }
      },
    },
  },
}

// The sample application of the duplicate-orders lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { info, needs } from '../platform-log.js'

const MINUTE = 60000
const DAY = 24 * 60 * MINUTE
// The SQL Server table gets one new order every 10 minutes. Order n is created at n * 10 minutes of the lab clock.
export const ORDER_EVERY = 10 * MINUTE
export const ORDER_BASE = 50000
export const orderId = (n) => `SO-${ORDER_BASE + n}`
export const orderNumber = (id) => {
  const m = String(id ?? '').trim().match(/(\d+)$/)
  return m ? Number(m[1]) - ORDER_BASE : null
}
const persistent = (props) => String(props['watermark.persistent']).trim() === 'true'
const guarded = (props) => String(props['idempotency.enabled']).trim() === 'true'

export const PACKAGES = {
  'order-sync-poll': {
    note: 'Polls new orders from SQL Server every 5 minutes and creates them in the ERP. The last order ID sent is the watermark, kept in an object store.',
    boot: needs('db.host', 'erp.baseUrl', 'watermark.persistent'),
    // persistent false: the object store is held in the memory of the replica, so a restart or redeploy empties it
    volatileStore: ({ props }) => !persistent(props),
    schedules: [{ flow: 'order-sync-flow', type: 'fixed', value: 5, unit: 'minutes', enabled: true }],
    run: {
      'order-sync-flow': ({ props, now, store }) => {
        const kind = persistent(props) ? 'persistent' : 'memory'
        // a store of the other kind is a different store: the new one starts empty
        const own = store.kind === kind ? store : {}
        const log = [info('Starting order-sync-flow')]
        let after = orderNumber(own.watermark)
        if (after !== null) log.push(info(`Watermark ${orderId(after)} found in the object store`))
        else if (orderNumber(props['watermark.initial']) !== null) {
          after = orderNumber(props['watermark.initial'])
          log.push(info(`No watermark in the object store. Reading after watermark.initial ${orderId(after)}`))
        } else {
          after = Math.floor(now / DAY) * (DAY / ORDER_EVERY) - 1
          log.push(info('No watermark in the object store. Reading all orders since 00:00 today'))
        }
        const last = Math.floor(now / ORDER_EVERY)
        const read = []
        for (let n = after + 1; n <= last; n++) read.push(n)
        log.push(info(`Read ${read.length} order${read.length === 1 ? '' : 's'} from SQL Server with order_id after ${orderId(after)}`))
        let sent = read
        let seen = own.sent ?? []
        if (guarded(props)) {
          const before = new Set(seen)
          sent = read.filter((n) => !before.has(n))
          const skipped = read.length - sent.length
          if (skipped) log.push(info(`Idempotent Message Validator found ${skipped} orders that were already processed (MULE:DUPLICATE_MESSAGE). On Error Continue skipped them.`))
          seen = [...seen, ...sent].slice(-400)
        }
        log.push(sent.length ? info(`Sent ${sent.length} order${sent.length === 1 ? '' : 's'} to the ERP: ${orderId(sent[0])} to ${orderId(sent.at(-1))}`) : info('No new orders. Nothing sent.'))
        const mark = Math.max(after, last)
        log.push(info(`Watermark is now ${orderId(mark)}. Job finished.`))
        return { ok: true, ms: 2000 + sent.length * 150, log, store: { kind, watermark: orderId(mark), sent: guarded(props) ? seen : [] } }
      },
    },
  },
}

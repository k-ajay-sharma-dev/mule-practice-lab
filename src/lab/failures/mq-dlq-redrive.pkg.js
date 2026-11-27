// The sample application of the mq-dlq-redrive lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
import { info, muleError, needs, warn } from '../platform-log.js'

export const MERGED_FROM = 'C-0417'
export const MERGED_INTO = 'C-0471'

const json = (value) => JSON.stringify(value)
export const idempotent = (props) => String(props['idempotency.enabled']).trim() === 'true'
// billing.customerMap: pairs such as C-0417=C-0471, separated by commas
export const customerMap = (props) =>
  Object.fromEntries(
    String(props['billing.customerMap'] ?? '')
      .split(',')
      .map((pair) => pair.split(/[=:]/).map((x) => x.trim().toUpperCase()))
      .filter(([from, to]) => from && to),
  )
const read = (body) => {
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

// What the log of the consumer held from the outage: the first and the last delivery of a few invoices
export function outageLogs(times, host, invoices) {
  const lines = []
  invoices.forEach((invoice, i) => {
    const error = muleError({
      flow: 'invoice-sync-flow',
      file: 'invoice-sync-consumer',
      at: 3,
      name: 'Create invoice',
      dsl: '<http:request method="POST" path="/invoices" config-ref="Billing_Config" doc:name="Create invoice">',
      type: 'HTTP:SERVICE_UNAVAILABLE',
      message: `HTTP POST on resource 'https://${host}/invoices' failed: service unavailable (503). Invoice ${invoice}. Billing is down for its upgrade.`,
    })
    for (const n of [1, 5]) lines.push({ t: times[i], ...warn(`Message m-${i + 1}, delivery attempt ${n}`) }, { t: times[i], ...error })
  })
  return lines.map((l) => ({ ...l, config: 1 }))
}
export const PACKAGES = {
  'invoice-sync-consumer': {
    note: 'Takes invoice events from the queue in queue.name (Subscriber, AUTO), 30 a minute per replica, and creates each invoice in the billing system at billing.host. idempotency.enabled looks the invoice number up in billing first and skips one that exists. billing.customerMap maps old customer numbers to new ones. redrive-dlq-flow moves the messages of dlq.name back to queue.name. GET /health asks billing for its status.',
    boot: needs('billing.host', 'queue.name', 'dlq.name', 'idempotency.enabled'),
    sample: { method: 'GET', path: '/health' },
    schedules: [{ flow: 'redrive-dlq-flow', type: 'fixed', value: 1, unit: 'days', enabled: false }],
    consumes: 'queue.name',
    rate: 30,
    consume(ctx, message) {
      const e = read(message.body)
      const store = ctx.store
      store.billing ??= {}
      if (!e?.invoice) return { ok: true, flow: 'invoice-sync-flow', log: [warn(`Message ${message.id} is not an invoice event. Ignored.`)] }
      const customer = customerMap(ctx.props)[e.customer] ?? e.customer
      if (customer === MERGED_FROM) {
        return {
          ok: false,
          flow: 'invoice-sync-flow',
          errorType: 'HTTP:BAD_REQUEST',
          error: {
            flow: 'invoice-sync-flow',
            file: 'invoice-sync-consumer',
            at: 3,
            name: 'Create invoice',
            dsl: '<http:request method="POST" path="/invoices" config-ref="Billing_Config" doc:name="Create invoice">',
            type: 'HTTP:BAD_REQUEST',
            message: `HTTP POST on resource 'https://${ctx.props['billing.host']}/invoices' failed: bad request (400). Invoice ${e.invoice}: customer ${MERGED_FROM} is closed. It was merged into ${MERGED_INTO}.`,
          },
        }
      }
      if (idempotent(ctx.props) && store.billing[e.invoice]) return { ok: true, flow: 'invoice-sync-flow', log: [info(`Invoice ${e.invoice} already exists in billing. Skipped. Message Id ${message.id}`)] }
      store.billing[e.invoice] = (store.billing[e.invoice] ?? 0) + 1
      const n = store.billing[e.invoice]
      return {
        ok: true,
        flow: 'invoice-sync-flow',
        log: [n > 1 ? warn(`Invoice ${e.invoice} created in billing for ${customer}, amount ${e.amount}. Billing now holds ${n} invoices with this number. Message Id ${message.id}`) : info(`Invoice ${e.invoice} created in billing for ${customer}, amount ${e.amount}. Message Id ${message.id}`)],
      }
    },
    handle(ctx, req) {
      if (req.method !== 'GET' || req.path.split('?')[0] !== '/health') return { status: 404, ms: 3, body: json({ message: 'Resource not found' }) }
      return {
        status: 200,
        ms: 140,
        flow: 'get:\\health',
        body: json({ billing: 'UP', host: ctx.props['billing.host'], release: 'Billing 7.2', upgrade: 'Completed at 10:00', notes: `Duplicate customer accounts were merged during the upgrade: ${MERGED_FROM} into ${MERGED_INTO}` }),
      }
    },
    run: {
      'redrive-dlq-flow': ({ props }) => ({
        ok: true,
        ms: 4000,
        log: [info('Starting redrive-dlq-flow'), info(`Moved the messages of ${props['dlq.name']} back to ${props['queue.name']}. Each one is published again as a new message.`)],
        move: { from: props['dlq.name'], to: props['queue.name'] },
      }),
    },
  },
}

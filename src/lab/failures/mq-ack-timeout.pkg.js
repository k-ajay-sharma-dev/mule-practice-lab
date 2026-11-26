// The sample application of the mq-ack-timeout lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
import { info, needs } from '../platform-log.js'

// How long one capture takes at the payment gateway since its release of this week
export const CAPTURE_MS = 95000
// The rest of the flow (validate, map, log) after the capture call
export const REST_MS = 5000
// Without acknowledgementTimeout the connector uses the lock of at least two minutes
export const DEFAULT_ACK_MS = 120000
const UNITS = { MILLISECONDS: 1, SECONDS: 1000, MINUTES: 60000, HOURS: 3600000, DAYS: 86400000 }

const whole = (value) => (String(value ?? '').trim() !== '' && Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : null)
// acknowledgementTimeout with acknowledgementTimeoutUnit, in ms. The unit defaults to MILLISECONDS.
export const ackMs = (props) => {
  const n = whole(props['mq.ackTimeout'])
  if (n === null) return DEFAULT_ACK_MS
  return n * (UNITS[String(props['mq.ackTimeoutUnit'] ?? '').trim().toUpperCase()] ?? 1)
}
// responseTimeout of the capture call in ms. 0 or empty: no limit of its own.
export const callLimit = (props) => whole(props['gateway.responseTimeout']) || Infinity
export const idempotent = (props) => String(props['idempotency.enabled']).trim() === 'true'

const seconds = (ms) => `${Math.round(ms / 100) / 10} s`

export const PACKAGES = {
  'payment-capture-consumer': {
    note: 'Takes payment messages from an Anypoint MQ queue (Subscriber, acknowledgementMode AUTO, acknowledgementTimeout from mq.ackTimeout and mq.ackTimeoutUnit) and captures each payment at the payment gateway. gateway.responseTimeout limits the capture call. idempotency.enabled skips a payment ID that was already captured.',
    boot: needs('gateway.host', 'queue.name', 'dlq.name', 'gateway.responseTimeout', 'idempotency.enabled'),
    schedules: [{ flow: 'replay-dlq-flow', type: 'fixed', value: 1, unit: 'days', enabled: false }],
    consumes: 'queue.name',
    consume(ctx, message) {
      const lock = ackMs(ctx.props)
      const limit = callLimit(ctx.props)
      const order = String(message.body).match(/O-(\d+)/)?.[1]
      const payment = order ? `PAY-${order}` : message.id
      const other = ctx.app.replicas > 1 ? 2 : 1
      const received = (count, replica) => info(`Message received. Message Id ${message.id}, payment ${payment}, Delivery Count ${count} (replica ${replica})`)
      const captured = (n, replica) => info(`Payment ${payment} captured at the gateway in ${seconds(CAPTURE_MS)}. Capture ID CAP-${order ?? message.id}-${n} (replica ${replica})`)
      if (limit <= CAPTURE_MS) {
        return {
          ok: false,
          flow: 'payment-capture-flow',
          errorType: 'HTTP:TIMEOUT',
          error: {
            flow: 'payment-capture-flow',
            file: 'payment-capture-consumer',
            at: 2,
            name: 'Capture payment',
            dsl: '<http:request method="POST" path="/captures" config-ref="Gateway_Config" responseTimeout="${gateway.responseTimeout}" doc:name="Capture payment">',
            type: 'HTTP:TIMEOUT',
            message: `HTTP POST on resource 'https://${ctx.props['gateway.host']}/captures' failed: Timeout exceeded after ${limit} ms. Payment ${payment}. The gateway needs about ${seconds(CAPTURE_MS)} for a capture.`,
          },
        }
      }
      const log = [received(message.deliveries, 1)]
      // the lock ends while replica 1 still waits for the gateway, so the message is visible again and is taken a second time
      if (CAPTURE_MS + REST_MS > lock) {
        log.push(received(message.deliveries + 1, other), captured(1, 1))
        log.push(idempotent(ctx.props) ? info(`Payment ${payment} was already captured. The idempotency check skipped the capture (replica ${other})`) : captured(2, other))
      } else log.push(captured(1, 1))
      return { ok: true, flow: 'payment-capture-flow', log }
    },
    run: {
      'replay-dlq-flow': ({ props }) => ({ ok: true, ms: 3000, log: [info('Starting replay-dlq-flow'), info(`Moved the messages of ${props['dlq.name']} back to ${props['queue.name']}`)], move: { from: props['dlq.name'], to: props['queue.name'] } }),
    },
  },
}

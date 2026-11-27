// The sample applications of the sb-dead-letter lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
import { info, muleError, needs, warn } from '../platform-log.js'

export const INTAKE = 'sb-payment-intake'
export const SETTLER = 'sb-card-settlement-worker'
export const QUEUE = 'payments'
// a card charge at the gateway takes this long
export const CHARGE_MS = 45000
// concurrent message receivers in each replica (lab: the listener's number of consumers)
export const THREADS = 4
const SKIP_MS = 2000
const SB_LOG = 'com.azure.messaging.servicebus.ServiceBusReceiverAsyncClient'

const clean = (v) => String(v ?? '').trim().toLowerCase()
const keep = (list, item, n = 60) => [...(list ?? []), item].slice(-n)
export const receiveMode = (props) => (clean(props['sb.receiveMode']) === 'receiveanddelete' ? 'ReceiveAndDelete' : 'PeekLock')
// lab made property: the listener renews the message lock while the flow runs, like the Azure SDK's auto lock renewal
export const renews = (props) => clean(props['sb.autoLockRenewal']) === 'true'
export const skipsCharged = (props) => clean(props['payment.skipCharged']) === 'true'
const dsl = '<azure-service-bus:message-listener config-ref="Service_Bus_Config" destinationName="${sb.queue}" receiveMode="${sb.receiveMode}">'

export const PACKAGES = {
  [INTAKE]: {
    note: 'Every minute it sends one card payment from the web shop to the Service Bus queue in sb.queue, with the payment ID as the MessageId. sb.connectionString is a SAS connection string with Send.',
    boot: needs('sb.connectionString', 'sb.queue'),
    schedules: [{ flow: 'send-payment-flow', type: 'cron', value: '0 * * * * ?', tz: 'UTC', enabled: true }],
    run: {
      'send-payment-flow': ({ props, store, serviceBus }) => {
        const n = store.next ?? 8801
        const id = `PAY-${n}`
        const body = { paymentId: id, order: `O-${n - 2600}`, amount: 20 + (n % 9) * 4.5, currency: 'EUR', card: `tok_${(n * 7919).toString(36)}` }
        const r = serviceBus.send(props['sb.connectionString'], props['sb.queue'], { body: JSON.stringify(body), messageId: id, contentType: 'application/json', subject: 'PaymentRequested', properties: { channel: 'web' } })
        if (!r.ok)
          return { ok: false, ms: 300, errorType: r.muleType, log: [muleError({ flow: 'send-payment-flow', file: INTAKE, at: 2, name: 'Send payment', dsl: '<azure-service-bus:send config-ref="Service_Bus_Config" destinationName="${sb.queue}">', type: r.muleType, message: r.text })], store: { next: n } }
        return { ok: true, ms: 300, log: [info(`Payment ${id} sent to ${props['sb.queue']}, sequence number ${r.sequenceNumber}`)], store: { next: n + 1 } }
      },
    },
  },
  [SETTLER]: {
    note: `Takes card payments from the queue in sb.queue and charges each card at the payment gateway, which takes about 45 seconds, then completes the message. Each replica runs ${THREADS} receivers at once. sb.receiveMode is PeekLock or ReceiveAndDelete. sb.autoLockRenewal true renews the message lock while the flow runs (lab made property). payment.skipCharged true makes the flow look up the payment ID in the settlement records first and complete a payment that was charged already without charging it again.`,
    boot: needs('sb.connectionString', 'sb.queue', 'gateway.host'),
    schedules: [{ flow: 'card-settlement-flow', type: 'cron', value: '0 * * * * ?', tz: 'UTC', enabled: true }],
    run: {
      'card-settlement-flow': ({ app, props, store, now, serviceBus }) => {
        const conn = props['sb.connectionString']
        const queue = props['sb.queue']
        const mode = receiveMode(props)
        const charges = { ...store.charges }
        let { done, dupes, lockLost } = store
        const log = []
        for (let r = 1; r <= Math.max(1, app.replicas ?? 1); r++)
          for (let k = 1; k <= THREADS; k++) {
            const receiver = `${app.name}-replica-${r}-${k}`
            const got = serviceBus.receive(conn, queue, { max: 1, mode, receiver })
            if (!got.ok) return { ok: false, ms: 300, errorType: got.muleType, log: [...log, muleError({ flow: 'card-settlement-flow', file: SETTLER, at: 1, name: 'Message listener', dsl, type: got.muleType, message: got.text })], store: { charges, done, dupes, lockLost } }
            const m = got.messages[0]
            if (!m) continue
            const p = JSON.parse(m.body)
            let took = CHARGE_MS
            if (skipsCharged(props) && charges[p.paymentId]) {
              took = SKIP_MS
              log.push(info(`Payment ${p.paymentId} was charged already. Not charged again. Delivery count ${m.deliveryCount}`))
            } else {
              charges[p.paymentId] = (charges[p.paymentId] ?? 0) + 1
              if (charges[p.paymentId] > 1) dupes = keep(dupes, { id: p.paymentId, t: now })
              log.push((charges[p.paymentId] > 1 ? warn : info)(`Card charged ${p.amount.toFixed(2)} ${p.currency} for ${p.paymentId} in 45 s, delivery count ${m.deliveryCount}${charges[p.paymentId] > 1 ? `. This payment is now charged ${charges[p.paymentId]} times` : ''}`))
            }
            if (mode === 'ReceiveAndDelete') {
              done = keep(done, { id: p.paymentId, t: now }, 200)
              continue
            }
            if (renews(props)) for (let at = 20000; at < took; at += 20000) serviceBus.renewLock(conn, queue, m.lockToken, { elapsedMs: at })
            const c = serviceBus.complete(conn, queue, m.lockToken, { elapsedMs: took })
            if (c.ok) done = keep(done, { id: p.paymentId, t: now }, 200)
            else {
              lockLost = keep(lockLost, { id: p.paymentId, t: now }, 30)
              log.push(warn(`Complete of ${p.paymentId} failed after ${took / 1000} s: ${c.text}`, SB_LOG))
            }
          }
        // lab: the settlement records of the gateway live in the application store
        const ids = Object.keys(charges).slice(-300)
        return { ok: true, ms: CHARGE_MS, log, store: { charges: Object.fromEntries(ids.map((k) => [k, charges[k]])), done, dupes, lockLost } }
      },
    },
  },
}

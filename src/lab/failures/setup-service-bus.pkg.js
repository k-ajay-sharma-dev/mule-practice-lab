// The sample application of the setup-service-bus lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
//
// sb-store-pickup-app tells a click and collect customer that the order is ready. Its API flow sends one message per
// pickup to an Azure Service Bus queue; its listener flow takes each message, sends the SMS and marks the pickup in
// the store system, which takes about 40 seconds, then completes the message.
import { info, muleError, needs, warn } from '../platform-log.js'

export const APP = 'sb-store-pickup-app'
export const QUEUE = 'pickup-ready'
export const SEND_POLICY = 'pickup-send'
export const LISTEN_POLICY = 'pickup-listen'
// sending the SMS and updating the store system
export const WORK_MS = 40000
const FLOW = 'pickup-notice-flow'
const SB_LOG = 'com.azure.messaging.servicebus.ServiceBusReceiverAsyncClient'

const clean = (v) => String(v ?? '').trim()
const keep = (list, item, n = 300) => [...(list ?? []), item].slice(-n)
export function readPickup(body) {
  try {
    const p = JSON.parse(body)
    return p && typeof p.pickupId === 'string' && p.pickupId && typeof p.store === 'string' ? p : null
  } catch {
    return null
  }
}
const countOf = (path) => Math.max(1, Math.min(50, Number((path.match(/[?&]count=(\d+)/) ?? [])[1] ?? 10)))
const listenDsl = '<azure-service-bus:message-listener config-ref="Listen_Config" destinationName="${sb.queue}" receiveMode="PEEK_LOCK">'
const sendDsl = '<azure-service-bus:send config-ref="Send_Config" destinationName="${sb.queue}">'
const fail = (flow, at, name, dsl, r) => muleError({ flow, file: APP, at, name, dsl, type: r.muleType ?? 'AZURE-SERVICE-BUS:CONNECTIVITY', message: r.text })

export const PACKAGES = {
  [APP]: {
    note: 'POST /pickups/test?count=10 sends the test pickups PU-T-1 to PU-T-10 to the queue in sb.queue, each with its pickup ID as the MessageId, so a second call sends the same IDs again. GET /health opens a sender link with sb.sendConnectionString and a receiver link with sb.listenConnectionString. The listener (PEEK_LOCK) sends one SMS per pickup and marks it in the store system, about 40 seconds, then completes the message. A message it cannot read is abandoned, so it comes again until the max delivery count of the queue.',
    boot: needs('sb.queue', 'sb.sendConnectionString', 'sb.listenConnectionString'),
    schedules: [{ flow: FLOW, type: 'cron', value: '0 * * * * ?', tz: 'UTC', enabled: true }],
    handle({ app, props, now, serviceBus }, req) {
      const store = (app.store ??= {})
      const queue = clean(props['sb.queue'])
      const send = props['sb.sendConnectionString']
      if (req.method === 'GET' && req.path === '/health') {
        const a = serviceBus.check(send, queue, 'Send')
        const b = serviceBus.check(props['sb.listenConnectionString'], queue, 'Listen')
        const log = [...(a.ok ? [] : [fail('health-flow', 1, 'Open sender', sendDsl, a)]), ...(b.ok ? [] : [fail('health-flow', 2, 'Open receiver', listenDsl, b)])]
        if (!a.ok || !b.ok) return { status: 503, ms: 800, body: JSON.stringify({ status: 'DOWN', sender: a.ok ? 'UP' : a.text, receiver: b.ok ? 'UP' : b.text }), log }
        return { status: 200, ms: 70, body: JSON.stringify({ status: 'UP', serviceBus: { namespace: serviceBus.parse(send).host, queue, sender: 'UP', receiver: 'UP' } }), log: [info(`Health check: sender and receiver links to ${queue} are open`)] }
      }
      if (req.method === 'POST' && req.path.startsWith('/pickups/test')) {
        const n = countOf(req.path)
        let sent = 0
        let dupes = 0
        for (let i = 1; i <= n; i++) {
          const pickupId = `PU-T-${i}`
          const r = serviceBus.send(send, queue, { body: JSON.stringify({ pickupId, orderId: `O-${8100 + i}`, store: `S-${10 + (i % 4)}`, phone: '+1 555 0100', at: now }), messageId: pickupId, contentType: 'application/json', subject: 'PickupReady' })
          if (!r.ok) return { status: 500, ms: 300, body: JSON.stringify({ sent, error: r.text }), log: [fail('test-pickups-flow', 2, 'Send pickup', sendDsl, r)] }
          if (r.duplicate) dupes++
          else sent++
          store.test = [...new Set([...(store.test ?? []), pickupId])]
        }
        store.duplicates = (store.duplicates ?? 0) + dupes
        const log = [info(`Sent ${n} test pickups to ${queue}${dupes ? `. ${dupes} had a MessageId the queue saw inside its duplicate detection window, and the broker dropped them` : ''}`)]
        return { status: 202, ms: 30 * n, body: JSON.stringify({ sent: n, accepted: sent, droppedAsDuplicate: dupes }), log }
      }
      return { status: 404, ms: 3, body: '' }
    },
    run: {
      [FLOW]: ({ app, props, store, now, serviceBus }) => {
        const conn = props['sb.listenConnectionString']
        const queue = clean(props['sb.queue'])
        const notified = { ...store.notified }
        const log = []
        let errorType = null
        for (let i = 0; i < 30; i++) {
          const receiver = `${app.name}-${(i % 4) + 1}`
          const got = serviceBus.receive(conn, queue, { max: 1, mode: 'PeekLock', receiver })
          if (!got.ok) {
            errorType = got.muleType
            log.push(fail(FLOW, 0, 'Message listener', listenDsl, got))
            break
          }
          const m = got.messages[0]
          if (!m) break
          const p = readPickup(m.body)
          if (!p) {
            errorType = 'MULE:EXPRESSION'
            if (m.deliveryCount === 1) log.push(muleError({ flow: FLOW, file: APP, at: 1, name: 'Read pickup', dsl: '<ee:transform doc:name="Read pickup">', type: 'MULE:EXPRESSION', message: `Message ${m.messageId} is not a pickup: JSON with a pickupId and a store.` }))
            serviceBus.abandon(conn, queue, m.lockToken, { elapsedMs: 200 })
            if (m.deliveryCount >= 2) log.push(warn(`Message ${m.messageId} abandoned, delivery count ${m.deliveryCount}`, SB_LOG))
            continue
          }
          notified[p.pickupId] = (notified[p.pickupId] ?? 0) + 1
          const c = serviceBus.complete(conn, queue, m.lockToken, { elapsedMs: WORK_MS })
          if (notified[p.pickupId] > 1) log.push(warn(`SMS for ${p.pickupId} sent again: the customer now has ${notified[p.pickupId]} messages. Delivery count ${m.deliveryCount}`))
          else log.push(info(`SMS sent for ${p.pickupId} at store ${p.store}, delivery count ${m.deliveryCount}`))
          if (!c.ok) {
            errorType = c.muleType
            log.push(warn(`Complete of ${p.pickupId} failed after ${WORK_MS / 1000} s: ${c.text}`, SB_LOG))
          } else store.done = keep(store.done, p.pickupId)
        }
        const ids = Object.keys(notified).slice(-300)
        return { ok: !errorType, ms: WORK_MS, errorType, log, store: { ...store, notified: Object.fromEntries(ids.map((k) => [k, notified[k]])) } }
      },
    },
  },
}

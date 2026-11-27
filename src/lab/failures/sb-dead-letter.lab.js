// The guided lab sb-dead-letter. See platform-labs.js for the shape of a lab.
import { advance, at, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, until } from '../platform-kit.js'
import { connectionString, countsOf, defaultServiceBus, NAMESPACE, namespaceOf, resendDeadLetters, updateEntity } from '../platform-servicebus.js'
import { CHARGE_MS, INTAKE, QUEUE, receiveMode, renews, SETTLER, skipsCharged } from './sb-dead-letter.pkg.js'

const props = (s) => ({ ...app(s, SETTLER)?.props, ...app(s, SETTLER)?.secrets })
const running = (s) => app(s, SETTLER)?.status === 'Running'
const queue = (s) => namespaceOf(s, NAMESPACE)?.queues?.[QUEUE]
const peekLock = (s) => running(s) && receiveMode(props(s)) === 'PeekLock'
const lockOk = (s) => peekLock(s) && ((queue(s)?.lockMs ?? 0) > CHARGE_MS || renews(props(s)))
const safeOk = (s) => peekLock(s) && skipsCharged(props(s))
const resent = (s) => queue(s)?.resent ?? []
const lastResend = (s) => Math.max(0, ...resent(s).map((x) => x.t))
const resubmitted = (s) => lockOk(s) && safeOk(s) && resent(s).length > 0 && countsOf(queue(s)).deadLetter === 0 && lastResend(s) >= Math.max(app(s, SETTLER).updated, queue(s).updated)
const since = (list, t) => (list ?? []).filter((x) => x.t > t)

const lab = {
  id: 'p-sb-dead-letter',
  group: 'Azure Service Bus',
  title: 'Payments charged twice and parked in the dead letter queue',
  minutes: 25,
  scenario: `${INTAKE} sends every card payment of the web shop to the Azure Service Bus queue ${QUEUE}. ${SETTLER} takes each one with PeekLock, charges the card at the payment gateway, which takes about 45 seconds, and completes the message. Since 08:00 customers write that they were charged twice or more for one order, and many orders never got a payment confirmation. Find out why, stop the double charges, and get the payments that were parked back through without charging anyone again.`,
  start() {
    let s = newPlatform({ clock: at(1, 7, 59), nextId: 10 })
    s.serviceBus = defaultServiceBus(at(1, 6))
    const secrets = (policy) => ({ 'sb.connectionString': connectionString(s, NAMESPACE, policy) })
    s.apps = [
      newApp(INTAKE, { props: { 'sb.queue': QUEUE }, secrets: secrets('app-send'), store: {} }),
      newApp(SETTLER, { replicas: 2, props: { 'sb.queue': QUEUE, 'sb.receiveMode': 'PeekLock', 'sb.autoLockRenewal': 'false', 'payment.skipCharged': 'false', 'gateway.host': 'cards.paygate.lab' }, secrets: secrets('app-listen'), store: {} }),
    ]
    s = until(s, at(1, 9))
    const many = Object.entries(app(s, SETTLER).store.charges ?? {}).filter(([, n]) => n > 1)
    s.mail.push({
      t: at(1, 8, 50),
      to: OPS,
      subject: 'Customers charged several times',
      body: `Customer care has calls from customers who were charged two or more times for one order, for example ${many.slice(0, 3).map(([id, n]) => `${id} (${n} times)`).join(', ')}. Many orders still show as not paid in the shop and got no confirmation. We are refunding by hand. Please stop it and make sure the payments that are stuck go through once.`,
      source: 'Harbor Foods Customer Care',
    })
    return s
  },
  steps: [
    { title: 'Read the mail of Customer Care', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Read the logs and the dead letter queue',
      how: `Runtime Manager, ${SETTLER}, Logs: find MessageLockLost and a payment with a rising delivery count. Then Azure Service Bus, harbor-bus, Queues, ${QUEUE}: the counts on the Overview, then Service Bus Explorer, Dead-letter tab, Peek from start. Open a message and read DeadLetterReason.`,
      done: (s) => Boolean(s.seen[`logs:${SETTLER}`]) && Boolean(s.seen[`sb-dlq:${QUEUE}`]),
    },
    ask(
      'Why lock lost and why twice',
      `${QUEUE} has a lock duration of 30 seconds and a max delivery count of 10. A charge takes 45 seconds. What happens?`,
      [
        'The gateway sends each charge twice',
        'The lock ends after 30 seconds while the flow still works. The message is free again, another receiver gets it with a higher delivery count and charges the card again, and the first Complete fails with MessageLockLost. After 10 deliveries Service Bus moves the message to the dead letter queue with MaxDeliveryCountExceeded',
        'Duplicate detection on the queue copies the message',
        'Service Bus delivers each message to both replicas by design',
      ],
      1,
      'PeekLock gives the receiver a lock for the lock duration. Settling after the lock ended fails with MessageLockLost, and the message was already delivered again. Each delivery raises the delivery count, and at the max delivery count the message is dead lettered. The charge itself is outside the queue, so every delivery charges again.',
    ),
    ask(
      'ReceiveAndDelete instead',
      'A colleague wants to switch the listener to ReceiveAndDelete, since there is no lock to lose then. What is the catch?',
      [
        'ReceiveAndDelete is slower than PeekLock',
        'Nothing, it is the safe choice for payments',
        'The message is deleted the moment it is received. If the replica stops or the charge fails, the payment is gone and nobody is charged or told. It is at most once delivery. PeekLock is at least once, so keep it and make the work safe to repeat',
        'ReceiveAndDelete does not work with duplicate detection',
      ],
      2,
      'ReceiveAndDelete trades duplicates for losses. For payments a lost message means an order that is never charged and never confirmed. PeekLock keeps the message until the receiver completes it, so a failure leads to a redelivery, and an idempotent receiver makes the redelivery harmless.',
    ),
    {
      title: 'Hold the lock as long as the work',
      how: `Azure Service Bus, harbor-bus, Queues, ${QUEUE}, Properties: set Message lock duration above 45 seconds, such as 2 minutes (the most is 5 minutes), and Save changes. Or set sb.autoLockRenewal to true on ${SETTLER} so the listener renews the lock while the flow runs. Keep sb.receiveMode at PeekLock.`,
      done: lockOk,
    },
    {
      title: 'Make the charge safe to repeat',
      how: `Runtime Manager, ${SETTLER}, Settings, Properties: set payment.skipCharged to true and Apply Changes. The flow then looks up the payment ID in the settlement records and completes a payment that is charged already without charging it again. A lock can still end, a replica can still stop, so a redelivery must do no harm.`,
      done: safeOk,
    },
    ask(
      'Compared with ActiveMQ',
      'In ActiveMQ a message that kept failing ended up in ActiveMQ.DLQ. How does the Service Bus dead letter queue differ?',
      [
        'It is the same: one shared queue for the whole broker',
        'Service Bus deletes dead letters after 10 minutes',
        `Each queue and subscription has its own dead letter queue, such as ${QUEUE}/$DeadLetterQueue, and each message carries DeadLetterReason and DeadLetterErrorDescription. ActiveMQ redelivers by the redelivery policy of the client, 6 times by default, and then sends the message to the shared ActiveMQ.DLQ unless a per destination policy is set`,
        'Service Bus has no dead letter queue on the Standard tier',
      ],
      2,
      'In ActiveMQ Classic the consumer redelivery policy sets maximumRedeliveries, 6 by default, and the broker then moves the poison message to ActiveMQ.DLQ, or to a queue per destination with an individual dead letter strategy. Service Bus counts deliveries on the broker, uses max delivery count 10 by default, and keeps a dead letter queue per entity that never expires on its own. Nothing processes a dead letter queue by itself: a person or a repair flow has to look at it.',
    ),
    {
      title: 'Re-send the dead letters',
      how: `After the two fixes: Azure Service Bus, ${QUEUE}, Service Bus Explorer, Dead-letter tab, Peek from start, select all messages and choose Re-send selected messages. Copies go back to ${QUEUE} with their MessageId and a delivery count of 0. In Azure the originals stay in the dead letter queue until you receive or delete them; in the lab the re-send also takes them out, so the dead letter count goes to 0. A message that was still locked under the old lock can land there a minute later; re-send it too.`,
      done: resubmitted,
    },
    {
      title: 'Watch them go through once',
      how: 'Move the clock 8 minutes after the re-send. The log shows the re-sent payments completed with "charged already, not charged again", new payments charged once in 45 s, no MessageLockLost and nothing new in the dead letter queue.',
      done: (s) => {
        if (!resubmitted(s)) return false
        const t = Math.max(lastResend(s), app(s, SETTLER).updated, queue(s).updated)
        if (s.clock < t + 8 * MINUTE) return false
        const st = app(s, SETTLER).store ?? {}
        const doneIds = new Set(since(st.done, lastResend(s) - 1).map((x) => x.id))
        return since(st.lockLost, t).length === 0 && since(st.dupes, t).length === 0 && resent(s).every((x) => doneIds.has(x.messageId)) && since(st.done, t).length > resent(s).length
      },
    },
  ],
  why: 'PeekLock locks a message for the lock duration of the queue. When the work takes longer, the lock ends, the message is delivered again with a higher delivery count, and the late Complete fails with MessageLockLost. At the max delivery count Service Bus moves the message to the dead letter queue of the entity with DeadLetterReason MaxDeliveryCountExceeded. Set the lock duration above the time the work takes, up to 5 minutes, or renew the lock while the work runs. Since delivery is at least once anyway, make the receiver idempotent by a business key such as the payment ID. ReceiveAndDelete removes the lock and also the safety: a failure loses the message. Once the cause is fixed, re-send the dead letters to their queue and let the idempotent receiver finish them. In the lab the gateway records live in the application store, and the lab Re-send also removes the messages from the dead letter queue.',
  docs: 'https://learn.microsoft.com/azure/service-bus-messaging/message-transfers-locks-settlement',
  solve(start) {
    let s = mark(mark(mark(start, 'inbox'), `logs:${SETTLER}`), `sb-dlq:${QUEUE}`)
    s = updateEntity(s, NAMESPACE, QUEUE, { lockMs: 2 * MINUTE })
    s = change(s, SETTLER, { props: { ...app(s, SETTLER).props, 'payment.skipCharged': 'true' } })
    // the deploy is done at once in the lab; a minute later the old locks have ended and the dead letters are final
    s = advance(s, MINUTE)
    s = resendDeadLetters(s, NAMESPACE, QUEUE, null).state
    return advance(s, 9 * MINUTE)
  },
  answers: { 2: 1, 3: 2, 6: 2 },
}

export const LABS = [lab]

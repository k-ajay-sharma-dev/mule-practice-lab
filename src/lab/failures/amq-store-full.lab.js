// The guided lab amq-store-full. See platform-labs.js for the shape of a lab.
import { advance, at, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, until } from '../platform-kit.js'
import { AMQ, AMQ_FAILOVER, brokerOf, defaultJms, purgeQueue, restartBroker, sendTo, setConfig, usageOf } from '../platform-jms.js'
import { alertDepth, API, AUDIT, copiesToAudit, LOADER, ORDER_BYTES, WATCH } from './amq-store-full.pkg.js'

const DLQ = 'ActiveMQ.DLQ'
const LOGIN = { 'jms.url': AMQ_FAILOVER, 'jms.user': 'mule-orders', 'jms.password': 'orders-lab-1' }
const DAY = 24 * 60 * MINUTE
const broker = (s) => brokerOf(s, AMQ)
const apiProps = (s) => ({ ...app(s, API)?.props, ...app(s, API)?.secrets })
const depth = (s, q) => broker(s)?.queues[q]?.messages.length ?? 0
const expiryOn = (s) => (broker(s)?.config.dlqExpiration ?? 0) > 0

const lab = {
  id: 'p-amq-store-full',
  group: 'ActiveMQ',
  title: 'The order API hangs on a full broker',
  minutes: 25,
  scenario: `${API} takes web orders and publishes each one to ORDERS.IN on the ActiveMQ Classic broker brightmart-amq, where ${LOADER} picks it up. Since about 08:40 every POST /orders waits 30 seconds and ends in a gateway timeout, and no order gets through. Nothing was deployed today. Find what fills the broker, free it without losing anything that matters, and make sure you hear about it before it happens again.`,
  start() {
    const clock = at(1, 8)
    let s = newPlatform({
      clock,
      apps: [
        newApp(API, { props: { ...LOGIN, 'audit.copy': 'true' }, store: {} }),
        newApp(LOADER, { props: { ...LOGIN }, store: {} }),
        newApp(WATCH, { props: { 'jms.url': AMQ_FAILOVER, 'jms.user': 'admin', 'jms.password': 'admin-lab', 'watch.queues': `${DLQ},ORDERS.DLQ`, 'alert.to': OPS, 'dlq.alertDepth': '' }, store: {} }),
      ],
      traffic: [{ app: API, env: 'Sandbox', perMinute: 2, method: 'POST', path: '/orders', body: '{"lines":3}' }],
      jms: defaultJms(clock),
    })
    // last spring the old parcel system failed messages into the shared DLQ, and nobody drained it (lab-made sizes)
    s = sendTo(s, AMQ, { dest: DLQ, body: '{"parcel":"P-55120","event":"SCANNED"}', count: 60, size: 10 * 1024 * 1024 }).state
    // the audit archive app was retired three weeks ago; the API still copies every order to its queue
    s = sendTo(s, AMQ, { dest: AUDIT, body: '{"orderId":"SO-2100","lines":4}', count: 95, size: ORDER_BYTES }).state
    const b = broker(s)
    b.queues[DLQ].messages.forEach((m, i) => Object.assign(m, { ts: clock - (200 - i) * DAY, origin: 'queue://PARCEL.EVENTS', producer: 'parcel-gateway', props: { dlqDeliveryFailureCause: 'java.lang.Throwable: Delivery[7] exceeds redelivery policy limit:RedeliveryPolicy {maximumRedeliveries = 6, initialRedeliveryDelay = 1000}' } }))
    b.queues[AUDIT].messages.forEach((m, i) => Object.assign(m, { ts: clock - (95 - i) * 5 * 60 * MINUTE, producer: API }))
    Object.assign(b.queues[DLQ], { enqueued: 0, dequeued: 0 })
    Object.assign(b.queues[AUDIT], { enqueued: 0, dequeued: 0 })
    const later = until(s, at(1, 8, 55))
    later.mail.push({
      t: at(1, 8, 55),
      to: OPS,
      subject: 'No web orders since 08:40',
      body: 'Every order on the web shop fails after a long wait since about 08:40. The shop shows "please try again". We lose sales every minute. Please help.',
      source: 'Brightmart Web Shop',
    })
    return until(later, at(1, 9))
  },
  steps: [
    { title: 'Read the mail of the web shop', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Open the Home page of brightmart-amq',
      how: 'ActiveMQ, brightmart-amq, Home. Read Store percent used and Memory percent used. Then read the logs of order-intake-api.',
      done: (s) => Boolean(s.seen[`jms:${AMQ}`]),
    },
    ask(
      'Why the API hangs',
      'The log says: Persistent store is Full, 100% of 1073741824. Stopping producer ... to prevent flooding queue://ORDERS.IN. Why does the API wait 30 seconds instead of failing at once?',
      [
        'The broker is down',
        'Producer flow control: when the store limit is reached, the broker stops acknowledging persistent sends, and the send blocks until there is space. sendFailIfNoSpace="true" in systemUsage would make the send fail at once with a ResourceAllocationException instead',
        'The loader holds a lock on ORDERS.IN',
        'The API has a sleep in its flow',
      ],
      1,
      'Blocking protects the broker from running out of disk, but every producer thread waits, so an HTTP API in front of it stalls and timeouts pile up. Failing fast lets the API answer 503 and retry later. Either way the real fix is to find what fills the store.',
    ),
    {
      title: 'Find what fills the store',
      how: `ActiveMQ, brightmart-amq, Queues. Look for queues with many pending messages and no consumers. Browse ${AUDIT} and ${DLQ} and look at the dates and the senders of the messages.`,
      done: (s) => Boolean(s.seen[`jms-dest:${AUDIT}`]) && Boolean(s.seen[`jms-dest:${DLQ}`]),
    },
    {
      title: `Stop the copy to ${AUDIT} and empty it`,
      how: `${AUDIT} has no consumer since the audit archive was retired, but ${API} still copies every order there. Runtime Manager, ${API}, Settings, Properties: set audit.copy to false and Apply Changes. Then ActiveMQ, Queues, ${AUDIT}: Purge.`,
      done: (s) => !copiesToAudit(apiProps(s)) && depth(s, AUDIT) < 3,
    },
    ask(
      `What to do with ${DLQ}`,
      `${DLQ} holds 60 large messages from PARCEL.EVENTS, all from last spring. What is the right move?`,
      [
        'Leave them, a DLQ must never be touched',
        'Look first: the parcel system that sent them is gone, so nothing will replay them. Keep a copy if audit needs one, then purge. Give DLQ messages an expiration so a DLQ cannot grow for ever, and alert on its depth',
        'Move them all back to PARCEL.EVENTS',
        'Raise storeUsage until they fit',
      ],
      1,
      'A dead letter queue is a place for a person to look, not a store. Messages there count against the store limit like any other. Retry or move what still matters, purge the rest, and set a limit on how long they stay. Raising the limit only moves the date of the next outage.',
    ),
    {
      title: 'Clean the DLQ and limit how long messages stay',
      how: `Purge ${DLQ}. Then Broker config: set the DLQ message expiration (the expiration attribute of the dead letter strategy), for example 7 days, and Save. It applies to messages that reach the DLQ from then on. Classic reads activemq.xml at start, so restart the broker on Home. The slave takes over at once, and the apps reconnect through their failover URL.`,
      done: (s) => depth(s, DLQ) < 3 && expiryOn(s),
    },
    {
      title: 'Alert on DLQ depth',
      how: `Runtime Manager, ${WATCH}, Settings, Properties. It already reads the depth of ${DLQ} and ORDERS.DLQ every minute; set dlq.alertDepth to a number such as 10 and Apply Changes. A per destination memoryLimit and storeUsageHighWaterMark in a policyEntry of activemq.xml are the other guard against one queue taking the whole broker.`,
      done: (s) => app(s, WATCH)?.status === 'Running' && alertDepth({ ...app(s, WATCH).props }) !== null,
    },
    {
      title: 'Check that orders go through',
      how: 'Move the clock 5 minutes. Every POST /orders answers 201 in a few milliseconds, and Home shows the store far below its limit.',
      done: (s) => {
        const t = Math.max(app(s, API).updated, broker(s)?.lastRestart?.t ?? 0)
        const calls = (s.events ?? []).filter((e) => e.k === 'in' && e.app === API && e.t > t + MINUTE)
        return expiryOn(s) && calls.length >= 6 && calls.every((e) => e.s === 201) && usageOf(broker(s)).storePct < 50
      },
    },
  ],
  why: 'ActiveMQ Classic limits memory, store and temp space in systemUsage. The store holds persistent messages in KahaDB, and temp holds non persistent messages that the broker spools to disk. When the store limit is reached, producer flow control blocks persistent sends, so every producer stalls; with sendFailIfNoSpace the send fails at once instead. The usual cause is a queue nobody reads: a consumer that was retired, or a dead letter queue nobody drains. Find it on the Queues page by pending count and consumer count, stop what feeds it, and purge what nobody needs. Give DLQ messages an expiration, set per destination limits where one queue could take over, and alert on DLQ depth and store percent. In the lab the sizes are made small and the broker config change applies on restart.',
  docs: 'https://activemq.apache.org/components/classic/',
  solve(start) {
    let s = mark(mark(mark(mark(start, 'inbox'), `jms:${AMQ}`), `jms-dest:${AUDIT}`), `jms-dest:${DLQ}`)
    s = change(s, API, { props: { ...app(s, API).props, 'audit.copy': 'false' } })
    s = purgeQueue(s, AMQ, AUDIT).state
    s = purgeQueue(s, AMQ, DLQ).state
    s = setConfig(s, AMQ, { dlqExpiration: 7 * DAY }).state
    s = restartBroker(s, AMQ, 3).state
    s = change(s, WATCH, { props: { ...app(s, WATCH).props, 'dlq.alertDepth': '10' } })
    return advance(s, 6 * MINUTE)
  },
  answers: { 2: 1, 5: 1 },
}

export const LABS = [lab]

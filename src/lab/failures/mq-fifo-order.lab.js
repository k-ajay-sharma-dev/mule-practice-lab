// The guided lab mq-fifo-order. See platform-labs.js for the shape of a lab.
import { advance, at, MINUTE, mark, newApp, newPlatform, runNow } from '../platform.js'
import { app, ask, call, called, change, OPS, sawLogs, until } from '../platform-kit.js'
import { FIFO_QUEUE, groupPerOrder, sequenceCheck, STANDARD_QUEUE, wrongOrders } from './mq-fifo-order.pkg.js'

const PUB = 'order-status-publisher'
const CON = 'order-status-consumer'

const propsOf = (s, name) => ({ ...app(s, name)?.props, ...app(s, name)?.secrets })
const running = (s, name) => app(s, name)?.status === 'Running'
const both = (s) => running(s, PUB) && running(s, CON)
// FIFO: publisher and consumer on the FIFO queue, with a message group per order
const fifoOk = (s) => both(s) && propsOf(s, PUB)['queue.name'] === FIFO_QUEUE && propsOf(s, CON)['queue.name'] === FIFO_QUEUE && groupPerOrder(propsOf(s, PUB))
// or a consumer that skips an event older than what it has stored
const sequenceOk = (s) => both(s) && sequenceCheck(propsOf(s, CON)) && propsOf(s, PUB)['queue.name'] === propsOf(s, CON)['queue.name']
const fixed = (s) => fifoOk(s) || sequenceOk(s)
const fixedAt = (s) => Math.max(app(s, PUB)?.updated ?? 0, app(s, CON)?.updated ?? 0)
const resync = (s) => app(s, CON)?.schedules.find((x) => x.flow === 'resync-status-flow')?.last
const resynced = (s) => fixed(s) && Boolean(resync(s)?.ok) && resync(s).t >= fixedAt(s)

const lab = {
  id: 'p-mq-fifo-order',
  group: 'Databases and queues',
  title: 'Orders that went back to paid after they shipped',
  minutes: 20,
  scenario:
    'The order system of Brightmart publishes three status events for each click and collect order: created, paid and shipped. They go to the standard Anypoint MQ queue order-status. order-status-consumer runs on 2 replicas and writes the status of each order to the order database. Customer service says orders that were collected yesterday show as paid in the customer portal. Monitoring shows no errors. Find out why, stop it, and repair the orders that are wrong.',
  start() {
    const s = newPlatform({
      clock: at(1, 8),
      apps: [
        newApp(PUB, { props: { 'queue.name': STANDARD_QUEUE, 'mq.messageGroupId': '' } }),
        newApp(CON, { replicas: 2, props: { 'queue.name': STANDARD_QUEUE, 'status.sequenceCheck': 'false' }, store: { orders: {} } }),
      ],
      queues: [
        { name: STANDARD_QUEUE, type: 'Standard queue', dlq: '', attempts: 10, messages: [] },
        { name: FIFO_QUEUE, type: 'FIFO queue', dlq: '', attempts: 10, messages: [] },
      ],
      mail: [
        {
          t: at(1, 8, 50),
          to: OPS,
          subject: 'Collected orders show as paid',
          body: 'Order O-5102 was collected by the customer this morning, and the shop scanned it as shipped. The customer portal still says paid, so the customer called us. It is not only this one. About half of the orders of today look the same. The order system itself shows shipped for all of them.',
          source: 'Brightmart Customer Service',
        },
      ],
    })
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Read the mail of Customer Service', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Look at order O-5102 in the data',
      how: `API client, application ${CON}, GET /orders/O-5102. Compare status with statusInOrderSystem, and read the list of writes. GET /orders lists every order the consumer has stored.`,
      done: (s) => called(s, CON, 200, 'GET', /^\/orders\/O-\d+/),
    },
    sawLogs(CON),
    ask(
      'Why paid lands after shipped',
      'The log shows paid of O-5102 taken by replica 2 with a slow payment lookup, and shipped taken by replica 1 at the same time. Then the status is set to paid, with a WARN that it was shipped. What happened?',
      [
        'The order system published the events in the wrong order',
        'A standard queue does not guarantee order, and two consumers work on the events of one order at the same time. The slower write lands last and wins',
        'The queue lost the shipped event',
        'Replica 2 read an old copy from the dead letter queue',
      ],
      1,
      'The publisher sent created, paid and shipped in order. A standard queue gives no order guarantee and delivers at least once. Each consumer takes the next message it can get, so paid and shipped of one order run at the same time. The write that finishes last decides the status. No step fails, so Monitoring shows nothing.',
    ),
    ask(
      'Would one replica fix it',
      'A colleague wants to scale order-status-consumer down to 1 replica. Does that keep the events of an order in order?',
      [
        'Yes, one consumer always reads a queue in order',
        'No. A standard queue does not promise any order, and one replica still processes several messages at the same time on its own threads',
        'Yes, but only with the IMMEDIATE acknowledgement mode',
        'No, because the replica count cannot be lowered',
      ],
      1,
      'Fewer consumers make the race rarer, not gone. A standard queue does not guarantee order at all, and the Subscriber of one replica processes messages in parallel. You also lose throughput for nothing.',
    ),
    ask(
      'What a FIFO queue costs',
      `There is a FIFO queue named ${FIFO_QUEUE}. Which statement about Anypoint MQ FIFO queues is right?`,
      [
        'A FIFO queue keeps order across all messages, with no limits',
        'Order holds within a message group. Only one consumer at a time reads a group, a group has at most 10 messages in flight, and a FIFO queue handles about 300 transactions per second',
        'A FIFO queue can have a standard queue as its dead letter queue',
        'Any consumer can take any message of a group at the same time',
      ],
      1,
      'FIFO keeps order inside a message group, not across groups. Only one consumer at a time reads a group, so a single group for everything means one consumer for everything. Give each order its own group, such as the order ID, and different orders still run in parallel. FIFO queues are limited to about 300 TPS. A dead letter queue of a FIFO queue must also be FIFO, and assigning one means in order processing within a group is no longer guaranteed.',
    ),
    {
      title: 'Keep the events of an order in order',
      how: `Two ways, either one is accepted. FIFO: in Runtime Manager set queue.name of ${PUB} to ${FIFO_QUEUE} and mq.messageGroupId to #[payload.orderId], then set queue.name of ${CON} to ${FIFO_QUEUE}. Apply Changes on both. Or a sequence check: every event carries a sequence (created 1, paid 2, shipped 3). Set status.sequenceCheck of ${CON} to true and Apply Changes. The consumer then skips an event that is not newer than what it stored. The check also protects against a redelivery that comes late.`,
      done: fixed,
    },
    {
      title: 'Repair the orders that are wrong',
      how: `The fix protects new orders only. Schedules of ${CON}, select resync-status-flow, Run. It reads the status of each stored order from the order system and corrects the ones that differ. Run it after the fix, or new orders go wrong again.`,
      done: resynced,
    },
    {
      title: 'Prove that every order has the right status',
      how: `Move the clock 10 minutes after the last change. Then GET /orders on ${CON} again: every order, old and new, has the status of the order system.`,
      done: (s) => {
        if (!resynced(s) || s.clock < fixedAt(s) + 10 * MINUTE) return false
        const since = s.events.filter((e) => e.k === 'msg' && e.app === CON && e.t > fixedAt(s))
        return since.length >= 9 && wrongOrders(app(s, CON).store?.orders).length === 0
      },
    },
  ],
  why: 'A standard Anypoint MQ queue does not guarantee order and delivers at least once. With more than one consumer, or one consumer with several threads, events of the same entity can be processed out of order, and the last write wins with no error. A FIFO queue keeps order within a message group, so publish with a group per entity, such as the order ID. That costs throughput: about 300 TPS for a FIFO queue, one consumer at a time per group, and at most 10 messages in flight per group. The other way is a version or sequence check in the consumer, which keeps a standard queue and also protects against late redeliveries. After the fix, repair the data that is already wrong. In the lab the race is the same each time: the paid event of an even order number is slow. The FIFO queue exists already, and the Message Group ID is a property of the publisher.',
  docs: 'https://docs.mulesoft.com/mq/mq-queues',
  solve(start) {
    let s = mark(mark(start, 'inbox'), `logs:${CON}`)
    s = call(s, CON, null, '/orders/O-5102').state
    s = change(s, PUB, { props: { ...app(s, PUB).props, 'queue.name': FIFO_QUEUE, 'mq.messageGroupId': '#[payload.orderId]' } })
    s = change(s, CON, { props: { ...app(s, CON).props, 'queue.name': FIFO_QUEUE } })
    s = runNow(s, CON, 'resync-status-flow')
    return advance(s, 11 * MINUTE)
  },
  answers: { 3: 1, 4: 1, 5: 1 },
}

export const LABS = [lab]

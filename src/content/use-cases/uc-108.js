import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-108',
  category: 'use-cases',
  title: 'Food Delivery Order Events on Kafka with Three Consumer Groups',
  level: 'INTERMEDIATE',
  tags: ['kafka', 'consumer-groups', 'partitions', 'offsets', 'event-driven', 'dlq'],
  estMinutes: 30,
  diagram: {
    task: 'draw the order event stream: the app and order service that publish, the Kafka topic, the three consumer apps (restaurant notifications, finance ledger, analytics) each in its own consumer group, what each one calls, and the dead-letter topic for the ledger.',
    checks: [
      { label: 'The order service publishes events to the Kafka topic', rule: { type: 'edge', from: 'process-api', to: 'event-stream', kind: 'async' } },
      { label: 'At least three consumer apps read the same topic', rule: { type: 'each', of: 'event-stream', edgeTo: ['process-api', 'batch-job'], kind: 'async', count: 3, some: true } },
      { label: 'Placing an order never waits on a consumer', rule: { type: 'no-path', from: 'experience-api', to: ['erp', 'data-warehouse', 'notification'], kind: 'sync' } },
      { label: 'The ledger is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Ledger events that keep failing go to a dead-letter topic', rule: { type: 'path', from: 'event-stream', to: 'dlq' } },
      { label: 'Analytics loads events into the warehouse', rule: { type: 'path', from: 'event-stream', to: 'data-warehouse' } },
      { label: 'Every line into or out of Kafka is async', rule: { type: 'lines', touching: 'event-stream', kind: 'async' } },
    ],
    reference: diagram(
      {
        app: ['mobile-app', 'Customer app'],
        exp: ['experience-api', 'exp-orders-api'],
        prc: ['process-api', 'prc-order-service'],
        db: ['database', 'Orders DB'],
        k: ['event-stream', 'Kafka orders.v1 (24 partitions, key orderId)'],
        c1: ['process-api', 'prc-restaurant-notify (group restaurant-notify)'],
        c2: ['process-api', 'prc-ledger (group finance-ledger)'],
        c3: ['process-api', 'prc-analytics-loader (group analytics)'],
        push: ['notification', 'Restaurant tablet push'],
        sl: ['system-api', 'sys-ledger-api'],
        erp: ['erp', 'Finance ledger (ERP)'],
        dw: ['data-warehouse', 'Snowflake'],
        dlt: ['dlq', 'orders.v1.finance-ledger.DLT'],
      },
      [
        'app -> exp', 'exp -> prc', 'prc -> db', 'prc ~> k', 'k ~> c1', 'k ~> c2', 'k ~> c3',
        'c1 -> push', 'c2 -> sl', 'sl -> erp', 'c3 -> dw', 'c2 ~> dlt',
      ],
    ),
  },
  description: `
A food delivery platform publishes the **lifecycle of every order** (placed, accepted, picked up, delivered, cancelled, refunded) to Apache Kafka. Three teams need these events, each with its own Mule application:

- **Restaurant notifications**: push new and cancelled orders to the restaurant tablet within 5 seconds.
- **Finance ledger**: post each delivered or refunded order to the ERP ledger through \`sys-ledger-api\` (the ERP allows 30 calls per second).
- **Analytics**: load every event into Snowflake in micro-batches.

Facts:
- **1.2 million orders per day**, about 6 events per order, peaks of 400 events per second at dinner time.
- The topic \`orders.v1\` has **24 partitions** and 7 days of retention. The key is \`orderId\`.
- Events of one order must be applied **in order** by every consumer (a refund must not reach the ledger before the delivery).
- The ERP is down for 1 hour every Sunday for maintenance. Notifications must not stop during that hour.
- Mule 4 apps on CloudHub 2.0 use the **Apache Kafka connector**.

**Describe your solution:**
- How do the three apps each receive every event, and how do they scale?
- How is ordering per order kept?
- What happens to the ledger consumer when the ERP is down, and to a single bad event?
- When are offsets committed?
`,
  answerTemplate: `## Topic and keys

## Consumer groups

## Ordering and scaling

## Offsets and failures

## Operations
`,
  keyPoints: [
    'One topic, three consumer groups: each group receives every event, and the partitions are shared among the replicas of that group.',
    'Key orderId sends every event of one order to one partition, so each group sees them in order; parallelism is capped at 24 consumers per group.',
    'Each app commits offsets only after its own work succeeds, so a crash replays events and the consumers must be idempotent.',
    'An ERP outage pauses only the ledger group; its lag grows and catches up later while notifications carry on.',
    'A poison event goes to a per-group dead-letter topic after a few retries, so it does not block its partition for ever.',
  ],
  solution: `
\`\`\`
 app -> exp-orders-api -> prc-order-service -> Orders DB
                                          ~> Kafka orders.v1 (24 partitions, key orderId)
     ~> prc-restaurant-notify  (group restaurant-notify) -> tablet push
     ~> prc-ledger             (group finance-ledger)    -> sys-ledger-api -> ERP
                                                         ~> orders.v1.finance-ledger.DLT
     ~> prc-analytics-loader   (group analytics)         -> Snowflake
\`\`\`

**Consumer groups.** Kafka delivers each event once **per consumer group**. Each Mule app uses its own \`groupId\`, so all three apps get every event and none of them takes events from another. Inside a group, Kafka assigns each partition to one consumer. With 24 partitions a group can use up to 24 consumers in parallel; more replicas than that sit idle.

**Ordering and scaling.** Key = \`orderId\`, so all events of one order land in one partition and are read in order by one consumer of each group. Scale by replicas and by the connector's consumer count, keeping the total at or below 24. If the ledger needs more throughput later, add partitions with care: the key to partition mapping changes for new events.

**Offsets.** Use manual commit (Message Listener with \`ackMode\` MANUAL, then the Commit operation) after the work succeeds. Committing first would lose events on a crash. Committing after means a crash replays a few events, so:
- the ledger posts with an idempotency key \`orderId + eventType\`;
- the analytics loader upserts by \`eventId\`;
- the notifier ignores a repeat within 10 minutes.

**ERP down.** The ledger consumer retries with backoff. If the ERP is still down it stops consuming (stop the flow or pause and retry later). Its lag grows, but 7 days of retention cover it. The notification and analytics groups have their own offsets and carry on.

**Poison events.** An event that fails validation or fails 3 times for a data reason is written to \`orders.v1.finance-ledger.DLT\` with the error, then its offset is committed. Otherwise one bad event would block the whole partition.

**Operations.** Watch **consumer lag per group** (the real SLA signal), DLT size, and rebalances. Rebalances during deployments pause consumption briefly; rolling restarts and static membership reduce them.
`,
  followUps: [
    { q: 'What happens if two Mule apps use the same group ID by mistake?', a: 'They split the partitions between them, so each app sees only part of the events. Every app needs its own group ID.' },
    { q: 'Why does adding replicas beyond 24 not help?', a: 'A partition is read by one consumer per group. With 24 partitions the extra consumers stay idle.' },
    { q: 'How do you replay a day of events for the analytics team only?', a: 'Reset the offsets of the analytics group to a timestamp. The other groups keep their own offsets and are not affected.' },
    { q: 'Why commit offsets after processing and not before?', a: 'Committing before loses events when the app crashes. Committing after can replay some events, which idempotent consumers handle.' },
  ],
}

import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-138',
  category: 'architecture',
  title: 'Commands on Anypoint MQ, Facts on Kafka: Two Brokers in One Fulfilment Platform',
  level: 'ADVANCED',
  tags: ['anypoint-mq', 'kafka', 'messaging', 'event-driven', 'broker-selection', 'dlq', 'wms'],
  estMinutes: 40,
  diagram: {
    task: 'draw the fulfilment platform: checkout reaches an order Process API, which sends a fulfil command to an Anypoint MQ queue with a dead-letter queue. One fulfilment worker takes commands from the queue, updates the WMS through a System API and publishes fulfilment events to a Kafka topic. At least two consumers read the Kafka topic, and one of them sends customer notifications.',
    checks: [
      { label: 'Checkout reaches the order Process API through an Experience API', rule: { type: 'path', from: 'web-app', via: 'experience-api', to: 'process-api', kind: 'sync' } },
      { label: 'Fulfil commands go from a Process API to an Anypoint MQ queue as async messages', rule: { type: 'edge', from: 'process-api', to: 'queue', kind: 'async' } },
      { label: 'The command queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      {
        label: 'Each command queue is read by exactly one kind of worker, so a command is done once',
        rule: { type: 'each', of: 'queue', edgeTo: 'process-api', kind: 'async', count: 1, max: 1 },
      },
      { label: 'The WMS is reached only through a System API', rule: { type: 'only-via', target: 'wms', from: 'system-api' } },
      { label: 'The fulfilment worker calls the WMS System API', rule: { type: 'edge', from: { type: 'process-api', label: ['fulfil', 'worker'] }, to: 'system-api', kind: 'sync' } },
      {
        label: 'Only the fulfilment worker publishes to Kafka, so commands never travel on the event topic',
        rule: { type: 'only-via', target: 'event-stream', from: { type: 'process-api', label: ['fulfil', 'worker'] } },
      },
      { label: 'At least two consumers read the Kafka topic', rule: { type: 'each', of: 'event-stream', edgeTo: ['process-api', 'data-warehouse', 'batch-job'], kind: 'async', count: 2 } },
      { label: 'Customer notifications are sent by a consumer of the Kafka topic', rule: { type: 'path', from: 'event-stream', to: 'notification' } },
      {
        label: 'The worker never calls the notification consumer directly, so a slow email cannot hold up fulfilment',
        rule: { type: 'no-path', from: { type: 'process-api', label: ['fulfil', 'worker'] }, to: 'notification', kind: 'sync' },
      },
      { label: 'The Experience API does not write to a broker itself', rule: { type: 'no-edge', from: 'experience-api', to: ['queue', 'event-stream'] } },
      { label: 'Every line to or from a broker is an async message', rule: { type: 'lines', touching: ['queue', 'dlq', 'event-stream'], kind: 'async' } },
      { label: 'APIs call each other with sync calls', rule: { type: 'lines', from: ['experience-api', 'process-api'], to: ['process-api', 'system-api'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Checkout web app'],
        exp: ['experience-api', 'exp-checkout'],
        prc: ['process-api', 'prc-order'],
        cmd: ['queue', 'fulfil-order commands (Anypoint MQ)'],
        dlq: ['dlq', 'fulfil-order DLQ'],
        wrk: ['process-api', 'prc-fulfilment worker'],
        sys: ['system-api', 'sys-wms'],
        wms: ['wms', 'Warehouse management system'],
        topic: ['event-stream', 'order-fulfilment-events (Kafka, key orderId)'],
        ntf: ['process-api', 'prc-customer-notifications'],
        msg: ['notification', 'Email and SMS'],
        lake: ['data-warehouse', 'Analytics lake (Kafka sink connector)'],
      },
      [
        'web -> exp', 'exp -> prc', 'prc ~> cmd', 'cmd ~> wrk', 'cmd ~> dlq', 'wrk -> sys', 'sys -> wms',
        'wrk ~> topic', 'topic ~> ntf', 'ntf -> msg', 'topic ~> lake',
      ],
    ),
  },
  description: `
An online furniture retailer is rebuilding fulfilment. The architecture board must decide where **Anypoint MQ** and where **Kafka** fit. Both are already licensed: Anypoint MQ for the Mule estate, and a managed Kafka cluster that the data team uses.

Two kinds of messages:

**1. Fulfil commands.** "Fulfil order 81723 from warehouse Leeds."
- About **12,000 a day**, with peaks of **40 a second** during sales.
- Each command must be done **once**, by one worker. Several worker replicas share the load.
- A command that fails five times must be set aside for a person to look at, without blocking the others.

**2. Fulfilment events.** "Order 81723 was picked", "...was shipped".
- About **60,000 a day**.
- Read by customer notifications, the analytics lake, and next year a returns service that does not exist yet.
- Events for one order must be read **in order**.
- The analytics team wants to **replay the last 7 days** after a bug fix.

A developer proposes putting everything on Kafka, "because it is faster". Another proposes everything on Anypoint MQ, "because the Mule team knows it".

**Questions:**
- Draw the platform.
- Which broker carries which message, and why?
- How is each command done once, and what happens to one that keeps failing?
- How are events kept in order per order, and how does a new consumer get history?
- What breaks in each of the two proposals?
`,
  answerTemplate: `## Platform diagram

## Commands on Anypoint MQ

## Events on Kafka

## Ordering and replay

## Failure handling

## Why not one broker
`,
  keyPoints: [
    'A command asks one service to do something once. A queue with competing consumers fits: each message goes to one consumer.',
    'An event states a fact for anyone who is interested. A log that many consumer groups read on their own fits, with retention for replay.',
    'Anypoint MQ gives per-message acknowledgement, redelivery, a maximum delivery count and a dead-letter queue, which suit commands.',
    'Kafka keeps events for a retention period, so a new consumer group can read from the start, and a team can replay after a fix.',
    'Kafka keeps order within a partition. Using the order ID as the key puts all events for one order in one partition.',
    'Kafka has no per-message acknowledgement or built-in dead-letter queue. A poison message must be handled by the consumer.',
    'Anypoint MQ deletes a message once it is acknowledged, so it cannot replay history to a new consumer.',
    'The worker publishes events after the WMS update. Notifications read the events, so a slow email never holds up fulfilment.',
  ],
  solution: `
**Platform**
\`\`\`
Checkout ─► exp-checkout ─► prc-order ~► fulfil-order queue (Anypoint MQ) ~► prc-fulfilment worker ─► sys-wms ─► WMS
                                               └~► DLQ                          └~► order-fulfilment-events (Kafka)
                                                                                      ├~► prc-customer-notifications ─► Email / SMS
                                                                                      └~► Analytics lake
\`\`\`

**Commands on Anypoint MQ.** \`prc-order\` publishes a fulfil command and answers checkout at once. The worker runs several replicas, all subscribed to the same queue, so each command goes to one of them. The worker acknowledges after the WMS confirms. The queue has a dead-letter queue and a maximum delivery count of 5, so a failing command moves aside and the rest keep flowing. Make the worker idempotent on the order ID, because a lost acknowledgement means one more delivery.

**Events on Kafka.** The worker publishes \`OrderPicked\` and \`OrderShipped\` to \`order-fulfilment-events\` with the order ID as the key. Each consumer has its own consumer group and its own offsets. Retention is at least 7 days. A new consumer, such as the returns service, starts from the earliest offset, and the analytics team resets its group offset to replay.

**Ordering.** All events with one key land in one partition, which Kafka reads in order. Choose enough partitions for the peak, because changing the count later changes which partition a key maps to.

**What breaks with everything on Kafka.** Work sharing exists, but the unit is the partition, not the message. A slow or failing command blocks every command behind it in that partition. Retries and a dead-letter topic must be built by hand, and offsets are committed per partition, not per message.

**What breaks with everything on Anypoint MQ.** Each consumer needs its own queue bound to an exchange, and a new consumer gets nothing from before it was bound. There is no replay of the last 7 days. Order per order needs FIFO queues, which have a lower throughput.

**Publishing safely.** The worker updates the WMS and then publishes. If it crashes in between, the command is delivered again, the idempotent WMS call does nothing new, and the event is published. Consumers must accept a repeated event.
`,
  followUps: [
    {
      q: 'Why does prc-order not call the worker directly over HTTP?',
      a: 'Checkout would then wait for the warehouse, and a worker outage would stop orders. The queue takes the order at once and holds it until a worker is free.',
    },
    {
      q: 'The returns service needs every shipped order from the last two years. Can Kafka hold that?',
      a: 'Only with long retention or a compacted topic, which costs storage. A better source for two years of history is the analytics lake or the order database.',
    },
    {
      q: 'How does a Mule app read Kafka with the right order and no lost events?',
      a: 'Use the Kafka Connector listener with a consumer group, process each record, and commit the offset after processing. Records from one partition are handled in order.',
    },
    {
      q: 'Could one message be both a command and an event?',
      a: 'Mixing them causes confusion about who must act. Keep the command on the queue and publish a separate event once the work is done.',
    },
  ],
}

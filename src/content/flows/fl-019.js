import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

// One subscriber flow per consuming team: own queue bound to the exchange, manual ack, dedupe on eventId.
const subscriber = (team, steps) =>
  flow(
    `${team}-order-events-subscriber`,
    source('mq-subscriber', { destination: `order-events.${team}`, acknowledgementMode: 'MANUAL' }),
    [
      step('set-variable', { variableName: 'ackToken', value: '#[attributes.ackToken]' }),
      step('set-variable', { variableName: 'eventId', value: '#[payload.eventId]' }),
      step('idempotent', { idExpression: '#[vars.eventId]', objectStore: `${team}-processed-events` }),
      ...steps,
      step('mq-ack', { ackToken: '#[vars.ackToken]' }),
    ],
    [
      handler('on-error-continue', { type: 'MULE:DUPLICATE_MESSAGE' }, [step('mq-ack', { ackToken: '#[vars.ackToken]' })]),
      handler('on-error-continue', { type: 'ANY' }, [
        step('logger', { level: 'ERROR', message: '#["Event " ++ (vars.eventId default "") ++ " failed: " ++ error.description]' }),
        // Without this the redelivery is acked as a duplicate and the event is lost.
        step('os-remove', { key: '#[vars.eventId]', objectStore: `${team}-processed-events` }),
        step('mq-nack', { ackToken: '#[vars.ackToken]' }),
      ]),
    ],
  )

export default {
  id: 'fl-019',
  category: 'flows',
  title: 'Order Event Fan-out with an Anypoint MQ Exchange',
  level: 'ADVANCED',
  tags: ['anypoint-mq', 'pub-sub', 'exchange', 'event-driven', 'fan-out'],
  estMinutes: 60,
  flowChecks: [
    { label: 'The publisher publishes the order event to Anypoint MQ (an exchange)', rule: { type: 'exists', component: 'mq-publish' } },
    {
      label: 'The publisher builds a canonical event with DataWeave before publishing',
      rule: { type: 'before', first: 'transform', then: 'mq-publish' },
    },
    {
      label: 'Each of the four consumers has its own MQ Subscriber flow (one queue per consumer)',
      rule: { type: 'exists', component: 'mq-subscriber', min: 4 },
    },
    {
      label: 'Subscribers use manual acknowledgement',
      rule: { type: 'exists', component: 'mq-subscriber', where: { acknowledgementMode: 'MANUAL' } },
    },
    { label: 'Messages are acknowledged after successful processing', rule: { type: 'exists', component: 'mq-ack' } },
    {
      label: 'Failed messages are returned to the queue (Nack) from an error handler',
      rule: { type: 'inside', component: 'mq-nack', within: ['on-error-continue', 'on-error-propagate'] },
    },
    { label: 'The analytics subscriber filters out orders under the threshold', rule: { type: 'exists', component: ['choice', 'validation'] } },
    { label: 'Consumers deduplicate events on eventId', rule: { type: 'exists', component: ['idempotent', 'os-retrieve'] } },
  ],
  referenceFlow: design(
    flow(
      'order-confirmation-publisher',
      source('http-listener', { path: '/orders/{orderId}/confirm', allowedMethods: 'POST' }),
      [
        // Database Update replaces the payload with its statement result, so keep the order.
        step('set-variable', { variableName: 'order', value: '#[payload]' }),
        step('db-update', { sql: "UPDATE orders SET status = 'CONFIRMED' WHERE id = :orderId" }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{\n  eventId: uuid(),\n  eventType: "OrderConfirmed",\n  version: "1.0",\n  occurredAt: now(),\n  data: vars.order\n}',
        }),
        step('mq-publish', { destination: 'order-events' }),
        step('logger', { level: 'INFO', message: '#["OrderConfirmed published"]' }),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Publish failed: " ++ error.description]' }),
        ]),
      ],
    ),
    subscriber('warehouse', [step('http-request', { method: 'POST', path: '/warehouse/pick-requests', responseTimeout: 10000 })]),
    subscriber('loyalty', [step('http-request', { method: 'POST', path: '/loyalty/points', responseTimeout: 30000 })]),
    subscriber('analytics', [
      router(
        'choice',
        {},
        [
          route({ expression: '#[(attributes.properties.totalAmount as Number default 0) > 100]' }, [
            step('http-request', { method: 'POST', path: '/analytics/orders' }),
          ]),
        ],
        { otherwise: [step('logger', { level: 'DEBUG', message: '#["Order below 100 EUR ignored"]' })] },
      ),
    ]),
    subscriber('email', [
      step('set-variable', { variableName: 'customerEmail', value: '#[payload.data.customerEmail]' }),
      step('transform', {
        script:
          '%dw 2.0\noutput text/plain\n---\n"Thank you! Your order " ++ (payload.data.orderId as String) ++ " is confirmed."',
      }),
      step('email-send', { toAddresses: '#[vars.customerEmail]', subject: 'Your order is confirmed' }),
    ]),
  ),
  description: `
When an order is **confirmed**, four independent teams must react:
- **Warehouse** (picking) — must get every event, within 30 s.
- **Loyalty** (points) — tolerates hours of delay.
- **Analytics** — only needs orders over €100.
- **Email** (confirmation to customer).

New subscribers (e.g. a fraud team) will be added next quarter **without changing the publisher**. Each consumer is a separately deployed Mule app with its own release cycle. Peak: 80 orders/s.

**Design the flow(s):** publisher, broker topology, subscribers, filtering, failure isolation, and event contract/versioning.
`,
  answerTemplate: `## Publisher

## Broker topology

## Subscriber flows

## Filtering (orders over €100)

## Failure isolation

## Event contract and versioning
`,
  keyPoints: [
    'Publisher sends one event to an Anypoint MQ message exchange; it does not know the subscribers.',
    'Each consumer has its own queue bound to the exchange, with its own DLQ and delivery settings.',
    'A slow or failing consumer only grows its own queue; others are unaffected.',
    'Filtering for analytics is done via message properties (exchange routing rules if available) or by the consumer discarding events below the threshold.',
    'Events carry an id, type, version and timestamp in a canonical schema so subscribers can be idempotent and evolve independently.',
  ],
  solution: `
1. **Publisher (Order Process API):** after the order is committed, DataWeave builds a canonical event \`{ eventId, eventType: "OrderConfirmed", version: "1.0", occurredAt, data: {...} }\` → **Anypoint MQ Publish** to exchange \`order-events\` with message properties \`eventType\`, \`totalAmount\`, \`country\` and the correlation ID. If publishing must be guaranteed with the DB commit, use an outbox table + a relay flow.
2. **Topology:** exchange \`order-events\` bound to queues \`order-events.warehouse\`, \`.loyalty\`, \`.analytics\`, \`.email\`. Each queue has its own **DLQ** and max-delivery count. Adding the fraud team = new queue + binding, no publisher change.
3. **Subscribers:** each app has an **Anypoint MQ Subscriber** on its own queue with **MANUAL** ack: process → Ack; transient error → Nack; permanent → park + Ack. Concurrency sized per consumer (warehouse higher, loyalty low).
4. **Filtering:** where supported, routing rules on the exchange binding can filter on message properties (e.g. \`totalAmount > 100\`); otherwise the analytics subscriber checks the property in a Choice and simply Acks events it doesn't need.
5. **Failure isolation:** the loyalty system being down for 4 hours only builds a backlog on its queue; set message TTL long enough. Monitor queue depth and DLQ counts per consumer.
6. **Contract:** publish the event schema (JSON Schema / AsyncAPI) to Exchange. Additive changes stay at v1; breaking changes publish v2 alongside v1 (separate \`eventType\`/\`version\` property) until consumers migrate. Consumers dedupe on \`eventId\`.
`,
  followUps: [
    { q: 'Why not have the publisher call the four systems directly?', a: 'That couples the publisher to every consumer\'s availability and release cycle, and adding one means changing and redeploying the publisher. Pub/sub decouples them.' },
    { q: 'Do subscribers get messages in order?', a: 'Standard queues do not guarantee strict ordering; if a consumer needs it, use a FIFO queue (lower throughput) or design with versions/timestamps to discard stale updates.' },
    { q: 'How would you replay last week\'s events for a new subscriber?', a: 'Brokers like Anypoint MQ are not an event store; keep an event log (DB or archive queue bound to the exchange) and build a replay flow that republishes to the new subscriber\'s queue.' },
  ],
}

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

const ORDER_EVENT = {
  eventId: 'EV-7001',
  eventType: 'OrderConfirmed',
  version: '1.0',
  occurredAt: '2026-11-13T09:59:40Z',
  data: { orderId: 'O-1001', totalAmount: 250, customerEmail: 'ana.silva@example.com' },
}

export default {
  id: 'fl-019',
  category: 'flows',
  title: 'Order Event Fan-out with an Anypoint MQ Exchange',
  level: 'ADVANCED',
  tags: ['myproject', 'anypoint-mq', 'pub-sub', 'exchange', 'event-driven', 'fan-out'],
  estMinutes: 60,
  flowChecks: [
    { label: 'The publisher publishes the order event to Anypoint MQ (an exchange)', rule: { type: 'exists', component: 'mq-publish' } },
    {
      label: 'The publisher builds a canonical event with DataWeave before publishing',
      rule: { type: 'before', first: 'transform', then: 'mq-publish' },
    },
    {
      label: 'The publisher sends one event to the exchange, not one message per team',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'mq-publish' },
          { type: 'absent', component: 'mq-publish', where: { destination: { oneOf: ['warehouse', 'loyalty', 'analytics', 'email'] } } },
        ],
      },
    },
    {
      label: 'Each of the four consumers has its own MQ Subscriber flow (one queue per consumer)',
      rule: { type: 'exists', component: 'mq-subscriber', min: 4 },
    },
    {
      label: 'Subscribers use manual acknowledgement',
      rule: { type: 'exists', component: 'mq-subscriber', where: { acknowledgementMode: 'MANUAL' } },
    },
    {
      label: 'No subscriber acknowledges an event as soon as it arrives (IMMEDIATE)',
      rule: {
        type: 'all',
        rules: [
          { type: 'source', component: 'mq-subscriber' },
          { type: 'absent', component: 'mq-subscriber', where: { acknowledgementMode: 'IMMEDIATE' } },
        ],
      },
    },
    {
      label: 'Messages are acknowledged after successful processing',
      rule: { type: 'before', first: ['http-request', 'email-send'], then: 'mq-ack', outside: true },
    },
    {
      label: 'Every subscriber acks a processed event and also a duplicate, so neither stays on its queue',
      rule: { type: 'exists', component: 'mq-ack', min: 8 },
    },
    {
      label: 'Every subscriber returns a failed message to its queue (Nack) from an error handler',
      rule: { type: 'inside', component: 'mq-nack', within: ['on-error-continue', 'on-error-propagate'], min: 4 },
    },
    {
      label: 'The analytics subscriber only forwards orders over 100',
      rule: {
        type: 'any',
        rules: [
          { type: 'inside', component: ['http-request', 'flow-ref'], within: 'choice', routeWhere: { expression: '100' } },
          { type: 'exists', component: 'validation', where: { expression: '100' } },
        ],
      },
    },
    {
      label: 'Every consumer deduplicates events on eventId',
      rule: {
        type: 'any',
        rules: [
          { type: 'exists', component: 'idempotent', where: { idExpression: 'eventId' }, min: 4 },
          { type: 'exists', component: 'os-retrieve', where: { key: 'eventId' }, min: 4 },
        ],
      },
    },
    {
      label: 'A failed event has its id removed from the dedupe store, so the redelivery is processed',
      rule: {
        type: 'any',
        rules: [
          { type: 'inside', component: 'os-remove', within: ['on-error-continue', 'on-error-propagate'], min: 4 },
          // An id stored only after success (Retrieve first, Store at the end) needs no cleanup.
          { type: 'all', rules: [{ type: 'exists', component: 'os-store' }, { type: 'absent', component: 'idempotent' }] },
        ],
      },
    },
  ],
  // Message properties set on a publish are not simulated, so the analytics filter is tested from its own queue.
  simulation: {
    systems: {
      exchanges: { 'order-events': ['order-events.warehouse', 'order-events.loyalty', 'order-events.analytics', 'order-events.email'] },
      db: { tables: { orders: { columns: ['id', 'status'], key: 'id', rows: [{ id: 'O-1001', status: 'PLACED' }] } } },
      http: [
        { method: 'POST', path: '/warehouse/pick-requests', latencyMs: 200, respond: { status: 201, body: { pickId: 'PK-501' } } },
        { method: 'POST', path: '/loyalty/points', respond: { status: 200, body: { points: 25 } } },
        { method: 'POST', path: '/analytics/orders', respond: { status: 202, body: null } },
      ],
    },
    tests: [
      {
        name: 'An order is confirmed',
        about: 'The publisher sends one event to the exchange. The exchange copies it to every team, and each team acts on it.',
        trigger: { http: { method: 'POST', path: '/orders/O-1001/confirm', body: { orderId: 'O-1001', totalAmount: 250, customerEmail: 'ana.silva@example.com' } } },
        expect: {
          status: 200,
          sent: [{ destination: 'order-events', count: 1 }],
          notSent: ['order-events.warehouse', 'order-events.loyalty', 'order-events.analytics', 'order-events.email'],
          calls: [
            { method: 'POST', path: '/warehouse/pick-requests', count: 1 },
            { method: 'POST', path: '/loyalty/points', count: 1 },
          ],
          emails: [{ to: 'ana.silva@example.com', count: 1 }],
        },
      },
      {
        name: 'The warehouse gets the event',
        about: 'The pick request is created, then the event is acknowledged.',
        trigger: { message: { kind: 'mq', destination: 'order-events.warehouse', payload: ORDER_EVENT, properties: { totalAmount: '250' } } },
        expect: { calls: [{ method: 'POST', path: '/warehouse/pick-requests', count: 1 }], ack: 'acked' },
      },
      {
        name: 'The warehouse is down once',
        about: 'The first delivery fails and goes back to the queue. The redelivery must still be processed, not dropped as a duplicate.',
        triggers: [
          { message: { kind: 'mq', destination: 'order-events.warehouse', payload: ORDER_EVENT, properties: { totalAmount: '250' } } },
          { message: { kind: 'mq', destination: 'order-events.warehouse', payload: ORDER_EVENT, properties: { totalAmount: '250' }, deliveryCount: 2 }, afterMs: 30000 },
        ],
        overrides: { systems: { http: [{ method: 'POST', path: '/warehouse/pick-requests', responses: [{ fault: 'CONNECTIVITY' }, { status: 201, body: { pickId: 'PK-502' } }] }] } },
        expect: { calls: [{ method: 'POST', path: '/warehouse/pick-requests', count: 2 }], ack: ['returned', 'acked'] },
      },
      {
        name: 'The same event arrives twice',
        about: 'The broker delivers the event again. The customer still gets one email, and the copy is acknowledged so it leaves the queue.',
        triggers: [
          { message: { kind: 'mq', destination: 'order-events.email', payload: ORDER_EVENT, properties: { totalAmount: '250' } } },
          { message: { kind: 'mq', destination: 'order-events.email', payload: ORDER_EVENT, properties: { totalAmount: '250' } }, afterMs: 5000 },
        ],
        expect: { emails: [{ to: 'ana.silva@example.com', count: 1 }], ack: ['acked', 'acked'] },
      },
      {
        name: 'A small order reaches analytics',
        about: 'The order is 60 EUR, so analytics does not forward it, but the event is still acknowledged.',
        trigger: {
          message: { kind: 'mq', destination: 'order-events.analytics', payload: { ...ORDER_EVENT, eventId: 'EV-7002', data: { ...ORDER_EVENT.data, orderId: 'O-1002', totalAmount: 60 } }, properties: { totalAmount: '60' } },
        },
        expect: { calls: [{ method: 'POST', path: '/analytics/orders', count: 0 }], ack: 'acked' },
      },
    ],
  },
  optionalSteps: [
    {
      type: 'on-error-propagate',
      flow: 'order-confirmation-publisher',
      why: 'This handler only logs the error and passes it on, which Mule does by default.',
    },
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
- **Warehouse** (picking): must get every event, within 30 s. Call \`POST /warehouse/pick-requests\`.
- **Loyalty** (points): tolerates hours of delay. Call \`POST /loyalty/points\`.
- **Analytics**: only needs orders over €100. Call \`POST /analytics/orders\`.
- **Email**: send the confirmation to the customer's \`customerEmail\`.

New subscribers (e.g. a fraud team) will be added next quarter **without changing the publisher**. Each consumer is a separately deployed Mule app with its own release cycle. Peak: 80 orders/s.

**Facts**
- Every order event has a unique \`eventId\`.
- A broker may deliver the same event more than once. No consumer may lose an event if it crashes while processing it.
- The order system confirms an order with \`POST /orders/{orderId}/confirm\` on the publisher app, with \`{ orderId, totalAmount, customerEmail }\`. The publisher sets the order's status to \`CONFIRMED\` in the \`orders\` table and publishes the event, with the order under \`data\`.
- The exchange is \`order-events\`. Each team's queue is named after it: \`order-events.warehouse\`, \`order-events.loyalty\`, \`order-events.analytics\` and \`order-events.email\`.
- The publisher sets the message property \`totalAmount\` on every event.
- The team standard is MANUAL acknowledgement on every subscriber, with an explicit Ack or Nack in each outcome (processed, duplicate, failed).

**What each system sends back**
- Each Anypoint MQ Subscriber gets the event as the payload:
\`\`\`json
{ "eventId": "EV-7001", "eventType": "OrderConfirmed", "version": "1.0", "occurredAt": "2026-11-13T09:59:40Z",
  "data": { "orderId": "O-1001", "totalAmount": 250, "customerEmail": "ana.silva@example.com" } }
\`\`\`
  The message properties are in \`attributes.properties\` (for example \`attributes.properties.totalAmount\`, which is text such as \`"250"\`). The token to Ack or Nack is \`attributes.ackToken\`. An HTTP Request replaces the attributes, so keep the token in a variable.
- The Database Update answers with the number of changed rows, which replaces the payload.
- The warehouse answers 201 with \`{ "pickId": "PK-501" }\`, loyalty answers 200 with \`{ "points": 25 }\`, and analytics answers 202 with no body.

**What failures look like**
- The warehouse cannot be reached: the HTTP Request raises \`HTTP:CONNECTIVITY\`. Nack the event so it comes back, and make sure the redelivery is not dropped as a duplicate.
- An event that was already processed makes the Idempotent Message Validator raise \`MULE:DUPLICATE_MESSAGE\`. Ack it so it leaves the queue.

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
4. **Filtering:** where supported, routing rules on the exchange binding can filter on message properties (e.g. \`totalAmount > 100\`); otherwise the analytics subscriber checks the property in a Choice and Acks events it doesn't need.
5. **Failure isolation:** the loyalty system being down for 4 hours only builds a backlog on its queue; set message TTL long enough. Monitor queue depth and DLQ counts per consumer.
6. **Contract:** publish the event schema (JSON Schema / AsyncAPI) to Exchange. Additive changes stay at v1; breaking changes publish v2 alongside v1 (separate \`eventType\`/\`version\` property) until consumers migrate. Consumers dedupe on \`eventId\`.
`,
  followUps: [
    { q: 'Why not have the publisher call the four systems directly?', a: 'That couples the publisher to every consumer\'s availability and release cycle, and adding one means changing and redeploying the publisher. Pub/sub decouples them.' },
    { q: 'Do subscribers get messages in order?', a: 'Standard queues do not guarantee strict ordering; if a consumer needs it, use a FIFO queue (lower throughput) or design with versions/timestamps to discard stale updates.' },
    { q: 'How would you replay last week\'s events for a new subscriber?', a: 'Brokers like Anypoint MQ are not an event store; keep an event log (DB or archive queue bound to the exchange) and build a replay flow that republishes to the new subscriber\'s queue.' },
  ],
}

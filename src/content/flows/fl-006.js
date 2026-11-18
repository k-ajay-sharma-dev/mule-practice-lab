import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'
import { HANDLERS, handlerStatus } from '../../flow/rules.js'

export default {
  id: 'fl-006',
  category: 'flows',
  title: 'Async Order Hand-off with Anypoint MQ and DLQ Reprocessing',
  level: 'EXPERT',
  tags: ['myproject', 'anypoint-mq', 'async', 'dlq', 'reliability', 'idempotency'],
  estMinutes: 40,
  flowChecks: [
    {
      label: 'The website posts orders to an HTTP Listener front door',
      rule: { type: 'source', component: 'http-listener', where: { path: { is: '/orders' }, allowedMethods: 'POST' } },
    },
    {
      label: 'The front door hands the order to Anypoint MQ and never calls SAP itself',
      rule: {
        type: 'all',
        rules: [
          { type: 'before', first: 'http-listener', firstWhere: { path: { is: '/orders' } }, then: 'mq-publish' },
          { type: 'before', first: 'mq-publish', then: ['set-payload', 'transform'] },
          {
            type: 'absent',
            component: 'http-request',
            inFlowWith: { component: 'http-listener', where: { path: { oneOf: ['/orders'], not: 'replay' } } },
          },
        ],
      },
    },
    {
      label: 'A separate consumer subscribes to the orders queue with MANUAL acknowledgement',
      rule: { type: 'source', component: 'mq-subscriber', where: { acknowledgementMode: 'MANUAL' } },
    },
    {
      label: 'The message is acknowledged only after both SAP and WMS succeed',
      rule: {
        type: 'all',
        rules: [
          { type: 'before', first: 'http-request', then: 'mq-ack', outside: true },
          { type: 'before', first: 'http-request', then: 'mq-ack', every: true },
        ],
      },
    },
    {
      label: 'If the order cannot be put on the queue, the front door returns 503',
      rule: handlerStatus({ oneOf: ['ANYPOINT-MQ', 'ANY'] }, '503'),
    },
    {
      label: 'Transient errors Nack the message so it is redelivered (and eventually dead-lettered)',
      rule: {
        type: 'inside',
        component: 'mq-nack',
        within: HANDLERS,
        withinWhere: { type: { oneOf: ['TIMEOUT', 'CONNECTIVITY', 'SERVICE_UNAVAILABLE', 'RETRY_EXHAUSTED', 'ANY'] } },
      },
    },
    {
      label: 'Permanent errors park the order on a separate queue and ack it, so it leaves the main queue',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'mq-publish', within: HANDLERS },
          { type: 'inside', component: 'mq-ack', within: HANDLERS },
        ],
      },
    },
    {
      label: 'Ops have a replay flow that re-publishes fixed orders to the main queue',
      rule: { type: 'flows', kind: 'flow', min: 3 },
    },
    {
      label: 'A replayed order cannot create a duplicate in SAP',
      rule: {
        type: 'any',
        rules: [
          { type: 'before', first: 'http-request', firstWhere: { method: 'GET' }, then: 'http-request', thenWhere: { method: 'POST' } },
          { type: 'exists', component: 'idempotent' },
          { type: 'exists', component: 'os-retrieve' },
        ],
      },
    },
  ],
  simulation: {
    systems: {
      http: [
        { method: 'GET', path: '/sap/orders', latencyMs: 150, respond: { status: 200, body: [] } },
        { method: 'POST', path: '/sap/orders', latencyMs: 450, respond: { status: 201, body: { sapOrderId: '4500017321', externalRef: 'ORD-90001' } } },
        { method: 'POST', path: '/wms/confirmations', latencyMs: 120, respond: { status: 200, body: { confirmed: true } } },
      ],
    },
    tests: [
      {
        name: 'An order is accepted',
        about: 'The website gets 202 with a tracking ID at once. The consumer then creates the order in SAP and confirms it to the WMS.',
        trigger: {
          http: { method: 'POST', path: '/orders', body: { orderId: 'ORD-90001', customerId: 'CUST-3301', items: [{ material: 'MAT-100', quantity: 2 }] } },
        },
        expect: {
          status: 202,
          bodyHas: { trackingId: 'ORD-90001' },
          maxMs: 300,
          sent: [{ destination: 'orders.create', count: 1, has: { orderId: 'ORD-90001' } }],
          calls: [
            { method: 'POST', path: '/sap/orders', count: 1, has: { orderId: 'ORD-90001', items: [{ material: 'MAT-100' }] } },
            { method: 'POST', path: '/wms/confirmations', count: 1 },
          ],
        },
      },
      {
        name: 'The queue cannot be reached',
        about: 'Anypoint MQ refuses the publish. The order is not accepted, so the website gets 503 and can try again.',
        trigger: {
          http: { method: 'POST', path: '/orders', body: { orderId: 'ORD-90002', customerId: 'CUST-3301', items: [{ material: 'MAT-100', quantity: 1 }] } },
        },
        overrides: { systems: { queues: { 'orders.create': { fault: true } } } },
        expect: { status: 503, bodyLacks: { trackingId: 'ORD-90002' }, notSent: ['orders.create'], calls: [{ path: '/sap/orders', count: 0 }] },
      },
      {
        name: 'SAP is in its maintenance window',
        about: 'SAP answers 503. The message goes back to the queue to be tried again, and the WMS is not told anything.',
        trigger: { message: { kind: 'mq', destination: 'orders.create', payload: { orderId: 'ORD-90003', customerId: 'CUST-3302', items: [{ material: 'MAT-200', quantity: 1 }] } } },
        overrides: {
          systems: {
            http: [
              { method: 'GET', path: '/sap/orders', respond: { status: 503, body: { message: 'System maintenance' } } },
              { method: 'POST', path: '/sap/orders', respond: { status: 503, body: { message: 'System maintenance' } } },
            ],
          },
        },
        expect: { ack: 'returned', calls: [{ method: 'POST', path: '/wms/confirmations', count: 0 }], notSent: ['orders.parked'] },
      },
      {
        name: 'An invalid material number',
        about: 'SAP rejects the order with 400. Retrying will not help, so it is parked and leaves the main queue.',
        trigger: { message: { kind: 'mq', destination: 'orders.create', payload: { orderId: 'ORD-90004', customerId: 'CUST-3303', items: [{ material: 'MAT-XXX', quantity: 1 }] } } },
        overrides: { systems: { http: [{ method: 'POST', path: '/sap/orders', respond: { status: 400, body: { message: 'Material MAT-XXX does not exist' } } }] } },
        expect: { ack: 'acked', sent: [{ destination: 'orders.parked', count: 1 }], notSent: ['orders.create'], calls: [{ method: 'POST', path: '/wms/confirmations', count: 0 }] },
      },
      {
        name: 'A redelivered order is already in SAP',
        about: 'The order was created in SAP before a crash, then delivered again. No second SAP order is created.',
        trigger: {
          message: { kind: 'mq', destination: 'orders.create', deliveryCount: 2, payload: { orderId: 'ORD-90005', customerId: 'CUST-3304', items: [{ material: 'MAT-100', quantity: 3 }] } },
        },
        overrides: { systems: { http: [{ method: 'GET', path: '/sap/orders', respond: { status: 200, body: [{ sapOrderId: '4500017399', externalRef: 'ORD-90005' }] } }] } },
        expect: {
          ack: 'acked',
          calls: [
            { method: 'POST', path: '/sap/orders', count: 0 },
            { method: 'POST', path: '/wms/confirmations', count: 1 },
          ],
        },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'orders-front-door',
      source('http-listener', { path: '/orders', allowedMethods: 'POST' }),
      [
        step('validation', { check: 'is-not-empty-collection', expression: '#[payload.items]', message: 'An order needs at least one item' }),
        step('set-variable', { variableName: 'orderId', value: '#[payload.orderId default uuid()]' }),
        step('mq-publish', { destination: 'orders.create' }),
        step('set-variable', { variableName: 'httpStatus', value: '202' }),
        step('set-payload', { value: '#[output application/json --- { trackingId: vars.orderId }]' }),
      ],
      [
        handler('on-error-propagate', { type: 'ANYPOINT-MQ:CONNECTIVITY, ANYPOINT-MQ:PUBLISHING' }, [
          step('set-variable', { variableName: 'httpStatus', value: '503' }),
          step('set-payload', { value: '#[output application/json --- { code: "ORDER_NOT_ACCEPTED", correlationId: correlationId }]' }),
        ]),
      ],
    ),
    flow(
      'orders-consumer',
      source('mq-subscriber', { destination: 'orders.create', acknowledgementMode: 'MANUAL' }),
      [
        step('set-variable', { variableName: 'ackToken', value: '#[attributes.ackToken]' }),
        step('set-variable', { variableName: 'orderId', value: '#[payload.orderId]' }),
        // the lookup's answer replaces the payload, so the order is kept for the create and for parking
        step('set-variable', { variableName: 'order', value: '#[payload]' }),
        step('http-request', { method: 'GET', path: '/sap/orders?externalRef={orderId}', responseTimeout: 5000 }),
        router('choice', {}, [
          route({ expression: '#[isEmpty(payload)]' }, [
            step('set-payload', { value: '#[vars.order]' }),
            step('http-request', { method: 'POST', path: '/sap/orders', responseTimeout: 10000 }),
          ]),
        ], {
          otherwise: [step('logger', { level: 'INFO', message: '#["Order " ++ vars.orderId ++ " already in SAP, skipping create"]' })],
        }),
        step('http-request', { method: 'POST', path: '/wms/confirmations', responseTimeout: 5000 }),
        step('mq-ack', { ackToken: '#[vars.ackToken]' }),
      ],
      [
        handler('on-error-continue', { type: 'HTTP:BAD_REQUEST, APP:INVALID_MATERIAL' }, [
          step('transform', {
            script: '%dw 2.0\noutput application/json\n---\n{ order: vars.order, error: { type: error.errorType.asString, description: error.description } }',
          }),
          step('mq-publish', { destination: 'orders.parked' }),
          step('mq-ack', { ackToken: '#[vars.ackToken]' }),
        ]),
        handler('on-error-continue', { type: 'HTTP:TIMEOUT, HTTP:SERVICE_UNAVAILABLE, HTTP:CONNECTIVITY' }, [
          step('logger', { level: 'WARN', message: '#["Transient error, nacking: " ++ error.description]' }),
          step('mq-nack', { ackToken: '#[vars.ackToken]' }),
        ]),
      ],
    ),
    flow(
      'orders-replay',
      source('http-listener', { path: '/admin/orders/replay', allowedMethods: 'POST' }),
      [
        router('choice', {}, [
          route({ expression: '#[(attributes.queryParams.replayCount default 0) as Number >= 3]' }, [
            step('mq-publish', { destination: 'orders.parked' }),
            step('email-send', { toAddresses: 'ops@example.com', subject: 'Order replay limit reached' }),
          ]),
        ], {
          otherwise: [step('mq-publish', { destination: 'orders.create' })],
        }),
        step('set-payload', { value: '#[output application/json --- { replayed: true }]' }),
      ],
    ),
  ),
  description: `
An e-commerce site posts orders to \`POST /orders\` (peak **150 orders/s** on sale days). Each order must be created in **SAP** (via an SAP System API that handles ~40 req/s and has a nightly 20-minute maintenance window) and then confirmed to the **WMS**.

**Requirements**
- The website must get a response in **< 300 ms** and must never lose an accepted order.
- Transient failures (SAP maintenance, timeouts) are retried automatically; poison messages (e.g. invalid material number) must not block other orders.
- Ops needs to **inspect, fix and replay** failed orders without redeploying, and replays must not create duplicate SAP orders.
- Orders for the same customer should not overtake each other where possible, but throughput matters more.

**Design the solution:**
- The synchronous front door and what it returns.
- Queue topology (main queue, DLQ) and settings that matter.
- The consumer flow: acknowledgement mode, concurrency, what happens on transient vs permanent errors.
- The DLQ reprocessing flow.
- Idempotency, and why VM queues alone wouldn't satisfy the requirements.
`,
  answerTemplate: `## Front door

## Queue topology

## Consumer flow

## Transient vs permanent errors

## DLQ reprocessing

## Idempotency

## Why not VM queues alone
`,
  keyPoints: [
    'Front door validates, publishes to Anypoint MQ and returns 202 Accepted with a tracking ID — no SAP call in the request path.',
    'Main queue has a DLQ assigned with a max delivery attempts value; messages exceeding it move to the DLQ automatically.',
    'Subscriber uses MANUAL acknowledgement: Ack after SAP + WMS succeed, Nack (redeliver) on transient errors; permanent errors are routed to an error/parking queue and acked so they stop redelivering.',
    'Consumer concurrency (and prefetch) sized to SAP capacity (~40 req/s), not to the 150/s peak — the queue absorbs the backlog, including the 20-minute maintenance window.',
    'Reprocessing flow reads the DLQ (on demand or scheduled), lets ops fix/replay, republishes to the main queue with a replay count, and acks the DLQ message.',
    'Idempotency key (order ID) used for SAP (check-then-create or external reference) and/or an Idempotent Message Validator so redeliveries and replays do not duplicate orders; VM queues alone lack a broker-side DLQ and ops replay tooling.',
  ],
  solution: `
**Front door (Experience/Process API)**
HTTP Listener → schema validation (APIkit) → enrich with \`orderId\` / \`correlationId\` → **Anypoint MQ Publish** to \`orders.create\` (message ID = orderId, correlation ID propagated, customer ID as a property) → **202 Accepted** \`{ trackingId }\`. If the publish fails, return 503 so the website can retry — an order is only "accepted" once it is on the queue.

**Queue topology**
- \`orders.create\` — standard queue (FIFO queues preserve order but have much lower throughput; the requirement favours throughput). Assign DLQ \`orders.create.dlq\` with a **max deliveries** value (e.g. 10).
- \`orders.parked\` — explicit parking queue for permanent/business errors.
- Set message TTL long enough to survive the maintenance window plus an outage buffer.

**Consumer flow**
- **Anypoint MQ Subscriber** on \`orders.create\`, \`acknowledgementMode="MANUAL"\`, an acknowledgement timeout longer than the worst-case processing time, and concurrency sized so total throughput ≈ SAP capacity (e.g. 2 replicas × ~10 concurrent × ~0.5 s ≈ 40/s).
- Process: SAP create (with orderId as external reference) → WMS confirm → **Ack** (\`ackToken\` from attributes).
- Keep the order in a variable first. Each HTTP Request replaces the payload with its answer, so after the SAP lookup the payload is the lookup result, not the order. Set the payload back from the variable before the create, and park the order from the variable too.
- During the SAP maintenance window the backlog simply grows on the queue; optionally use the subscriber's circuit-breaker capability or a pause to avoid burning deliveries.

**Transient vs permanent errors**
- Transient (\`HTTP:TIMEOUT\`, \`HTTP:SERVICE_UNAVAILABLE\`, \`HTTP:CONNECTIVITY\`): **Nack** → redelivered (redelivery count increases). After the max, the broker moves it to the DLQ.
- Permanent (\`HTTP:BAD_REQUEST\`, custom \`APP:INVALID_MATERIAL\`): publish to \`orders.parked\` with the error details, then **Ack** — no point retrying, and it must not block others.

**DLQ reprocessing**
- A separate flow (HTTP-triggered "replay" endpoint for ops, plus an optional Scheduler) uses **Consume** on the DLQ (or parked queue). It optionally filters by orderId and lets ops supply a corrected body. Then it calls **Publish** back to \`orders.create\` with a \`replayCount\` property and acks the DLQ message.
- Guard against infinite loops: if \`replayCount\` exceeds a limit, keep it parked and alert.
- Expose counts via monitoring (queue depth alerts on the DLQ).

**Idempotency**
Redelivery happens (Nack, ack timeout, replica crash after SAP succeeded but before Ack). So:
- Pass \`orderId\` as SAP's external/customer reference and check-before-create, or rely on SAP rejecting duplicates on that reference.
- Optionally an Idempotent Message Validator on \`orderId\` with a persistent Object Store — but remove the key on failure so retries still go through.

**Ordering:** a standard queue with concurrent consumers does not guarantee per-customer order. If needed, version/timestamp updates per customer in SAP and reject stale ones, rather than giving up throughput with FIFO.

**Why not VM queues alone:** VM queues live inside the Mule app (persistent VM queues are tied to the app/runtime). They have no broker-side DLQ, inspection or replay tooling for ops. They also can't decouple separately deployed producer and consumer apps. Anypoint MQ is an external, durable broker with DLQs, delivery counts and a console.
`,
}

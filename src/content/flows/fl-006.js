import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-006',
  category: 'flows',
  title: 'Async Order Hand-off with Anypoint MQ and DLQ Reprocessing',
  level: 'EXPERT',
  tags: ['anypoint-mq', 'async', 'dlq', 'reliability', 'idempotency'],
  estMinutes: 40,
  flowChecks: [
    { label: 'The website posts orders to an HTTP Listener front door', rule: { type: 'source', component: 'http-listener' } },
    {
      label: 'The front door hands the order to Anypoint MQ before responding',
      rule: { type: 'before', first: 'mq-publish', then: ['set-payload', 'transform'] },
    },
    {
      label: 'A separate consumer subscribes to the orders queue with MANUAL acknowledgement',
      rule: { type: 'source', component: 'mq-subscriber', where: { acknowledgementMode: 'MANUAL' } },
    },
    {
      label: 'The message is acknowledged only after SAP and WMS succeed',
      rule: { type: 'before', first: 'http-request', then: 'mq-ack' },
    },
    {
      label: 'Transient errors Nack the message so it is redelivered (and eventually dead-lettered)',
      rule: { type: 'inside', component: 'mq-nack', within: ['on-error-continue', 'on-error-propagate'] },
    },
    {
      label: 'Permanent errors park the order on a separate queue instead of retrying',
      rule: { type: 'inside', component: 'mq-publish', within: ['on-error-continue', 'on-error-propagate'] },
    },
    {
      label: 'Ops have a replay flow that re-publishes fixed orders to the main queue',
      rule: { type: 'flows', kind: 'flow', min: 3 },
    },
  ],
  referenceFlow: design(
    flow(
      'orders-front-door',
      source('http-listener', { path: '/orders', allowedMethods: 'POST' }),
      [
        step('validation', { check: 'json-schema', expression: '#[payload]', message: 'Order does not match schema' }),
        step('set-variable', { variableName: 'orderId', value: '#[payload.orderId default uuid()]' }),
        step('mq-publish', { destination: 'orders.create' }),
        step('set-variable', { variableName: 'httpStatus', value: '202' }),
        step('set-payload', { value: '#[{ trackingId: vars.orderId }]' }),
      ],
      [
        handler('on-error-propagate', { type: 'ANYPOINT-MQ:CONNECTIVITY, ANYPOINT-MQ:PUBLISHING' }, [
          step('set-variable', { variableName: 'httpStatus', value: '503' }),
          step('set-payload', { value: '#[{ code: "ORDER_NOT_ACCEPTED", correlationId: correlationId }]' }),
        ]),
      ],
    ),
    flow(
      'orders-consumer',
      source('mq-subscriber', { destination: 'orders.create', acknowledgementMode: 'MANUAL' }),
      [
        step('set-variable', { variableName: 'ackToken', value: '#[attributes.ackToken]' }),
        step('set-variable', { variableName: 'orderId', value: '#[payload.orderId]' }),
        step('http-request', { method: 'GET', path: '/sap/orders?externalRef={orderId}', responseTimeout: 5000 }),
        router('choice', {}, [
          route({ expression: '#[isEmpty(payload)]' }, [
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
        step('set-payload', { value: '#[{ replayed: true }]' }),
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
- During the SAP maintenance window the backlog simply grows on the queue; optionally use the subscriber's circuit-breaker capability or a pause to avoid burning deliveries.

**Transient vs permanent errors**
- Transient (\`HTTP:TIMEOUT\`, \`HTTP:SERVICE_UNAVAILABLE\`, \`HTTP:CONNECTIVITY\`): **Nack** → redelivered (redelivery count increases). After the max, the broker moves it to the DLQ.
- Permanent (\`HTTP:BAD_REQUEST\`, custom \`APP:INVALID_MATERIAL\`): publish to \`orders.parked\` with the error details, then **Ack** — no point retrying, and it must not block others.

**DLQ reprocessing**
- A separate flow (HTTP-triggered "replay" endpoint for ops, plus an optional Scheduler) uses **Consume** on the DLQ (or parked queue), optionally filters by orderId, lets ops supply a corrected body, then **Publish** back to \`orders.create\` with a \`replayCount\` property and acks the DLQ message.
- Guard against infinite loops: if \`replayCount\` exceeds a limit, keep it parked and alert.
- Expose counts via monitoring (queue depth alerts on the DLQ).

**Idempotency**
Redelivery happens (Nack, ack timeout, replica crash after SAP succeeded but before Ack). So:
- Pass \`orderId\` as SAP's external/customer reference and check-before-create, or rely on SAP rejecting duplicates on that reference.
- Optionally an Idempotent Message Validator on \`orderId\` with a persistent Object Store — but remove the key on failure so retries still go through.

**Ordering:** a standard queue with concurrent consumers does not guarantee per-customer order. If needed, version/timestamp updates per customer in SAP and reject stale ones, rather than giving up throughput with FIFO.

**Why not VM queues alone:** VM queues live inside the Mule app (persistent VM queues are tied to the app/runtime), have no broker-side DLQ, inspection or replay tooling for ops, and can't decouple separately deployed producer and consumer apps. Anypoint MQ is an external, durable broker with DLQs, delivery counts and a console.
`,
}

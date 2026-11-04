import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-008',
  category: 'case-studies',
  title: 'Food Delivery Platform Sending Orders to Restaurants',
  level: 'BEGINNER',
  tags: ['async', 'anypoint-mq', 'webhooks', 'retail', 'idempotency'],
  estMinutes: 25,
  diagram: {
    task: 'draw the order submission and status design: the app, the Orders API that answers 202 fast, the queue, one adapter per POS vendor, the idempotency store, and the webhook path that brings status back.',
    checks: [
      { label: 'The mobile app calls an Orders Experience API', rule: { type: 'each', of: 'mobile-app', edgeTo: 'experience-api' } },
      { label: 'The order is published to a queue asynchronously (checkout answers 202 without waiting for the POS)', rule: { type: 'edge', from: ['experience-api', 'process-api'], to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'A routing flow sends orders to one adapter per POS vendor (at least three)', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 3 } },
      { label: 'POS vendor APIs are reached only through adapter System APIs', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'The app never calls a POS vendor directly', rule: { type: 'no-edge', from: 'mobile-app', to: 'external-api' } },
      { label: '"Delivered" markers are kept in a store so redeliveries are skipped', rule: { type: 'edge', from: ['process-api', 'system-api'], to: ['cache', 'database'] } },
      { label: 'POS webhooks come in through a callbacks API and status is published as an event', rule: { type: 'path', from: 'partner', to: ['topic', 'queue', 'event-stream'], via: 'experience-api' } },
      { label: 'Orders that keep failing go to a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Customer app'],
        vend: ['partner', 'POS vendor webhooks'],
        eord: ['experience-api', 'orders-eapi (202 Accepted)'],
        ecb: ['experience-api', 'pos-callbacks-eapi'],
        route: ['process-api', 'prc-order-routing'],
        stat: ['process-api', 'prc-order-status'],
        q: ['queue', 'order-placed'],
        top: ['topic', 'order-status'],
        dlq: ['dlq', 'order-placed-dlq'],
        sa: ['system-api', 'pos-vendorA-sapi'],
        sb: ['system-api', 'pos-vendorB-sapi'],
        sc: ['system-api', 'pos-vendorC-sapi'],
        os: ['cache', 'Delivered markers (Object Store)'],
        pa: ['external-api', 'POS vendor A'],
        pb: ['external-api', 'POS vendor B'],
        pc: ['external-api', 'POS vendor C'],
        push: ['notification', 'Push to app'],
      },
      [
        'mob -> eord', 'eord ~> q', 'q ~> route', 'q ~> dlq', 'route -> os',
        'route -> sa', 'route -> sb', 'route -> sc', 'sa -> pa', 'sb -> pb', 'sc -> pc',
        'vend -> ecb', 'ecb ~> top', 'top ~> stat', 'stat -> push',
      ],
    ),
  },
  description: `
**Context.** A regional food delivery start-up takes orders in its mobile app. Orders must reach restaurants, which use three different tablet/POS vendors (each with its own REST API or webhook), and the courier dispatch service. Today the app backend calls each POS directly; when a POS vendor is slow, the customer's checkout spins for 30 seconds and sometimes the order is sent twice.

**Goals**
- Checkout responds in under 2 seconds regardless of POS speed.
- Restaurants receive each order exactly once (from their point of view).
- Adding a fourth POS vendor should not require app changes.

**Constraints**
- Lunch and dinner peaks: ~300 orders per minute.
- POS vendors occasionally go down for minutes at a time.
- Order status updates (accepted, ready, picked up) must flow back to the app.

**Your task.** Propose an integration design using MuleSoft for order submission and status updates.
`,
  answerTemplate: `## Order submission flow

## Integrating different POS vendors

## Status updates back to the app

## Handling failures and duplicates

## Risks
`,
  keyPoints: [
    'The app calls an Orders API that validates, stores/acknowledges and returns quickly (e.g. 202 Accepted with an order ID); delivery to the POS happens asynchronously.',
    'A queue (e.g. Anypoint MQ) decouples order acceptance from POS delivery so a slow POS does not slow checkout.',
    'One adapter (System API or flow) per POS vendor translates a canonical order format to the vendor format — adding a vendor means adding an adapter only.',
    'An idempotency key (order ID) is sent to the POS and checked on retries so restaurants do not get duplicate orders.',
    'Status updates arrive via vendor webhooks/polling into a status API that normalises them and pushes to the app (push notification or event).',
    'Failed deliveries retry with backoff, then go to a dead-letter queue with an alert so operations can phone the restaurant.',
  ],
  solution: `
**Submission.** \`orders-eapi\` (\`POST /orders\`) validates the payload, persists the order (or forwards to the order service), publishes an \`OrderPlaced\` message to Anypoint MQ and returns **202** with the order ID. Checkout no longer waits for the POS.

**POS adapters.** A routing flow reads the restaurant's POS vendor from configuration (or a lookup API) and sends the message to \`pos-vendorA-sapi\`, \`pos-vendorB-sapi\`, etc. Each adapter maps a **canonical order** (DataWeave) to the vendor's API. A new vendor = new adapter + a config entry.

**Exactly-once from the restaurant's view.** True exactly-once delivery is not possible over HTTP, so aim for at-least-once delivery plus idempotency: send the order ID as the vendor's reference/idempotency key where supported, and keep a "delivered" marker in Object Store so a redelivered message is skipped.

**Status updates.** Vendors call a webhook (\`pos-callbacks-eapi\`, secured with client ID or a shared secret / signature check) or are polled. Updates are normalised to \`ACCEPTED / READY / PICKED_UP\` and published to a topic consumed by the app backend and courier dispatch.

**Failures.** MQ redelivery with backoff; after the max attempts, move to a DLQ and alert the operations desk. Monitor queue depth during peaks.

**Risks.** Vendor API limits at peak (throttle per vendor), webhook security, and ordering of status events (include a timestamp/sequence and ignore older states).
`,
  followUps: [
    { q: 'Why return 202 instead of 201 to the app?', a: 'The order is accepted but not yet confirmed by the restaurant; 202 signals asynchronous processing and the app tracks status via updates instead of waiting.' },
    { q: 'What happens if a POS is down for 20 minutes during dinner?', a: 'Messages stay in its queue and retry; other vendors are unaffected. After a threshold the operations desk is alerted to call the restaurant, and the app can show a delay message.' },
    { q: 'How do you measure success?', a: 'Checkout p95 latency, orders delivered to POS within N seconds, duplicate-order complaints, and time to onboard a new POS vendor.' },
  ],
}

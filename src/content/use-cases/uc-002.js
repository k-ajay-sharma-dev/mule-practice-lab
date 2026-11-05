import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-002',
  category: 'use-cases',
  title: 'Payment Gateway Webhooks',
  level: 'INTERMEDIATE',
  tags: ['webhooks', 'hmac', 'retries', 'anypoint-mq'],
  estMinutes: 15,
  diagram: {
    task: 'draw the webhook flow: the endpoint the gateway calls, the queue that lets you acknowledge fast, the consumer with its de-duplication store, the order DB, the ticket email and the dead-letter queue.',
    checks: [
      { label: 'The payment gateway calls a webhook API you expose', rule: { type: 'edge', from: 'payment', to: ['experience-api', 'process-api', 'system-api', 'api-gateway'] } },
      { label: 'The webhook API hands events to a queue asynchronously (fast 200)', rule: { type: 'edge', from: ['experience-api', 'system-api', 'process-api'], to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'A consumer reads the queue and does the slow work', rule: { type: 'edge', from: ['queue', 'topic', 'event-stream'], to: ['process-api', 'system-api', 'batch-job'] } },
      { label: 'Event IDs are de-duplicated in a persistent store', rule: { type: 'edge', from: ['process-api', 'system-api', 'experience-api'], to: { type: ['cache', 'database'], label: ['idempot', 'dedup', 'processed', 'event', 'object store'] } } },
      { label: 'The order DB is reached only through a System API', rule: { type: 'only-via', target: { type: 'database', label: 'order' }, from: 'system-api' } },
      { label: 'Poison events end in a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
      { label: 'A webhook leads all the way to the ticket email', rule: { type: 'path', from: 'payment', to: 'notification' } },
    ],
    reference: diagram(
      {
        pg: ['payment', 'Payment gateway (webhooks)'],
        wh: ['experience-api', 'exp-payment-webhook-api (HMAC check)'],
        q: ['queue', 'payment-events-q'],
        dlq: ['dlq', 'payment-events-dlq'],
        prc: ['process-api', 'prc-payment-events'],
        idem: ['cache', 'Processed event IDs (Object Store)'],
        sdb: ['system-api', 'sys-order-db-api'],
        db: ['database', 'Order DB'],
        mail: ['notification', 'Ticket email'],
      },
      ['pg -> wh', 'wh ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> idem', 'prc -> sdb', 'sdb -> db', 'prc -> mail'],
    ),
  },
  description: `
An online ticket shop uses a payment gateway (Stripe-like). When a payment succeeds, fails or is refunded, the gateway sends a **webhook** (HTTP POST, JSON) to your Mule app.

Gateway behaviour:
- Each request carries a header with an **HMAC-SHA256 signature** computed over the **raw request body** using a shared secret.
- The gateway expects a **2xx response within 10 seconds**; otherwise it retries with backoff for up to 3 days. Retries can also arrive after a success (network blips).
- Each event has a unique \`event.id\`.

Your job: update the order in the **order DB** and trigger the ticket email. The order DB sometimes takes 5+ seconds under load.

**Describe your solution:**
- How do you verify that a webhook really comes from the gateway?
- What do you do inside the 10-second window, and what later?
- How do you avoid processing the same event twice?
- What happens when processing fails?
`,
  answerTemplate: `## Verifying the signature

## Fast acknowledgement

## Duplicates

## Failure handling
`,
  keyPoints: [
    'Signature recomputed with HMAC-SHA256 over the raw body bytes (before any parsing) using the shared secret from secure properties, and compared to the header; mismatch → 401/400, no processing.',
    'Timestamp checked (if provided) to reject old replayed requests.',
    'After verification the event is put on a queue (e.g. Anypoint MQ) and the endpoint returns 200 quickly; slow DB work happens asynchronously.',
    'Deduplication on event.id (idempotent message validator with persistent Object Store, or a unique DB column).',
    'Consumer retries transient failures and sends poison events to a DLQ; the gateway\'s own retries are a safety net, not the main retry mechanism.',
  ],
  solution: `
**Verify the signature.** Configure the HTTP Listener so you can access the **raw body** (don't transform it before verifying — re-serialised JSON produces a different signature). Compute HMAC-SHA256 over the raw bytes (plus timestamp, if the gateway signs \`timestamp.body\`) with the secret from **secure properties** — e.g. DataWeave \`dw::Crypto::HMACWith\` — and compare with the header. Mismatch → respond 400/401 and log, no further processing. If a timestamp is included, reject events older than ~5 minutes to prevent replays.

**Acknowledge fast.** After verification, publish the event to an **Anypoint MQ** queue and immediately return **200**. The webhook endpoint does no DB work, so the 10-second limit is never at risk even when the order DB is slow.

**Duplicates.** A consumer flow reads the queue and uses an **Idempotent Message Validator** on \`event.id\` with a **persistent Object Store** (TTL ≥ the gateway's 3-day retry window). Alternatively, it stores processed event IDs in a DB column with a unique constraint. Duplicates are acked and dropped. Updates are written so repeating them is harmless (e.g. set status = PAID).

**Failure handling.** The consumer acks only after the DB update and email trigger succeed. Transient errors → message redelivered (with backoff); after N attempts it moves to a **dead letter queue** and an alert is raised. If publishing to MQ itself fails, return 5xx so the gateway retries later.
`,
}

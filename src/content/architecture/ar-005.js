import { diagram } from '../../arch/dsl.js'

const STORE = ['database', 'oracle-db', 'sql-server', 'cache']
const BROKER = ['queue', 'topic', 'cloud-queue', 'event-stream']
const BACKEND = ['payment', 'external-api', 'database', 'oracle-db', 'sql-server', 'erp', 'saas', 'notification']

export default {
  id: 'ar-005',
  category: 'architecture',
  title: 'End-to-End Idempotency for Payments',
  level: 'ADVANCED',
  tags: ['idempotency', 'duplicates', 'object-store', 'retries'],
  estMinutes: 45,
  diagram: {
    task: 'draw the payment chain from the mobile app to the payment provider and the billing DB, and the receipts consumer behind the queue. Show the store where each Process API keeps its idempotency keys.',
    checks: [
      { label: 'The mobile app reaches the Payments Experience API', rule: { type: 'path', from: 'mobile-app', to: 'experience-api' } },
      { label: 'The mobile app never skips the Experience API', rule: { type: 'no-path', from: 'mobile-app', to: 'process-api', unless: 'experience-api' } },
      { label: 'The Experience API passes the key on to the Payments Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'The Process API calls the Payment Provider and Billing System APIs', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 2 } },
      { label: 'The payment provider is reached only through a System API', rule: { type: 'only-via', target: 'payment', from: 'system-api' } },
      { label: 'Every System API is called by a Process API', rule: { type: 'each', of: 'system-api', edgeFrom: 'process-api' } },
      { label: 'Every System API connects to its backend', rule: { type: 'each', of: 'system-api', edgeTo: BACKEND } },
      { label: 'The Experience API never calls System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Both the payments API and the receipts consumer keep their keys in a shared store', rule: { type: 'each', of: 'process-api', min: 2, edgeTo: STORE } },
      { label: 'The Process API publishes PaymentCompleted as an async message', rule: { type: 'edge', from: 'process-api', to: BROKER, kind: 'async' } },
      { label: 'The receipts consumer reads PaymentCompleted from the queue', rule: { type: 'edge', from: BROKER, to: 'process-api', kind: 'async' } },
      { label: 'PaymentCompleted leads on to the email provider', rule: { type: 'path', from: BROKER, to: 'notification' } },
      { label: 'No chain of sync calls joins the Experience API to the email provider', rule: { type: 'no-path', from: 'experience-api', to: 'notification', kind: 'sync' } },
      { label: 'Calls between APIs and to the provider, billing, stores and email are sync calls', rule: { type: 'lines', from: ['mobile-app', 'experience-api', 'process-api', 'system-api'], to: ['experience-api', 'process-api', 'system-api', ...BACKEND, 'cache'], kind: 'sync' } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: [...BROKER, 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Mobile app (one Idempotency-Key per payment)'],
        exp: ['experience-api', 'exp-payments-api (requires the key)', { replicas: 2, vCores: '0.2' }],
        prc: ['process-api', 'prc-payments-api (2 replicas)', { replicas: 2, vCores: '0.2' }],
        keys: ['cache', 'Idempotency records (persistent Object Store v2, 48 h)'],
        spay: ['system-api', 'sys-payment-provider-api', { replicas: 2, vCores: '0.2' }],
        prov: ['payment', 'Payment provider (Idempotency-Key, 24 h)'],
        sbil: ['system-api', 'sys-billing-api', { replicas: 2, vCores: '0.2' }],
        bdb: ['database', 'Billing DB (conditional update)'],
        q: ['queue', 'PaymentCompleted (Anypoint MQ)'],
        rc: ['process-api', 'prc-receipts (consumer)', { replicas: 2 }],
        seen: ['cache', 'Processed paymentIds (persistent Object Store)'],
        mail: ['notification', 'Email provider'],
      },
      ['mob -> exp', 'exp -> prc', 'prc -> keys', 'prc -> spay', 'spay -> prov', 'prc -> sbil', 'sbil -> bdb', 'prc ~> q', 'q ~> rc', 'rc -> seen', 'rc -> mail'],
    ),
    simulation: {
      systems: [
        { match: 'payment', latencyMs: 2000 },
        { match: 'database', latencyMs: 50 },
        { match: 'notification', latencyMs: 500 },
      ],
      tests: [
        {
          name: 'Due date peak',
          about: 'On the bill due date customers make 40 payments a second for ten minutes. Every payment is answered, and the APIs stay inside the 2.5 vCore budget.',
          traffic: [{ name: 'payments', from: 'mobile-app', rps: 40, kind: 'write', to: ['payment', 'database', 'notification'] }],
          expect: { answers: [{ minSuccess: 0.99, maxMs: 3500 }], vCores: { max: 2.5 } },
        },
        {
          name: 'One availability zone goes down',
          about: 'A zone is lost for the whole run while customers pay 40 times a second. Each API keeps a replica in another zone, so payments are still answered.',
          traffic: [{ name: 'payments', from: 'mobile-app', rps: 40, kind: 'write', to: ['payment', 'database', 'notification'] }],
          incidents: [{ zone: true }],
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
        {
          name: 'The email provider is down',
          about: 'The email provider is down for five minutes. Payments are still answered, the receipts wait in the queue, and every receipt is sent once it is back.',
          traffic: [{ name: 'payments', from: 'mobile-app', rps: 40, kind: 'write', to: ['payment', 'database', 'notification'] }],
          incidents: [{ down: 'notification', at: 2, forMin: 5 }],
          durationMin: 15,
          expect: {
            answers: [{ minSuccess: 0.99 }],
            delivered: [{ to: 'notification', min: 0.99 }],
            backlog: [{ queue: BROKER, minPeak: 1000, maxEnd: 0 }],
            lost: { max: 0 },
          },
        },
      ],
    },
  },
  quiz: [
    {
      type: 'single',
      prompt: 'Who should create the idempotency key for a bill payment, and when?',
      options: [
        'The mobile app, once per payment intent, reusing the same key on every retry of that payment',
        'The Experience API, once per incoming HTTP request, storing a fresh UUID with each call it receives',
        'The Process API, from a hash of account, payee and amount, so that equal requests share one key',
        'The payment provider, which returns a key after the first charge that the app reuses on retries',
      ],
      answer: 0,
      explain: 'Only the client knows that two requests are the **same** payment. A key generated per request on the server side would differ for a retry, so duplicates would never be detected.',
    },
    {
      type: 'single',
      prompt: 'The Process API runs on 2 replicas. Where must the idempotency records live?',
      options: [
        'In an in-memory Object Store in each replica, which is fast and keeps the keys until the next restart',
        'In a DB table with a unique constraint on the key, which both replicas write to',
        'In a non-persistent Object Store, because CloudHub 2.0 shares non-persistent stores across replicas',
        'In the payment provider, which already stores each Idempotency-Key and returns the first result',
      ],
      answer: 1,
      explain: 'A retry can land on the other replica, so the record must be in a store both replicas share, such as a DB table with a unique key or a persistent Object Store v2. A per-replica in-memory store would not see the first request. A non-persistent store is not shared across replicas. The provider dedupes the charge, but the Process API still needs its own record to know a payment is `IN_PROGRESS` and to keep the stored response for retries.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'A second request with the same key arrives while the first is still `IN_PROGRESS`. What should the Process API do?',
      options: [
        'Call the provider again with the same key, since the provider dedupes on it',
        'Return 409 Conflict and leave the provider call to the first attempt',
        'Return 200 with the stored record, so the app shows the payment as accepted',
        'Return 500, because the insert of the key hit the unique constraint',
      ],
      answer: 1,
      explain: 'The atomic insert of the key failed, so a first attempt owns the payment. The duplicate reports that the payment is in progress (409, or 202) and does not call the provider. A second provider call races the first one, and a provider may reject a key that is still in flight. A 200 tells the app the payment is done when it is not. A 500 tells the app the server broke, so it retries with no idea that a payment is running.',
    },
    {
      type: 'single',
      prompt: 'The provider call timed out after 35 s. What is the right interpretation and next step?',
      options: [
        'The payment failed; release the invoice lock, return a 504 to the app and ask the user to submit the payment again',
        'The outcome is unknown; retry with the same Idempotency-Key or query the payment status, and tell the user "payment pending"',
        'The payment succeeded, because the provider only times out after the charge is committed; mark the invoice paid',
        'The outcome is unknown; retry with a new Idempotency-Key, so the provider does not reject the retry as a duplicate',
      ],
      answer: 1,
      explain: 'A timeout means "unknown", not "failed". Retrying with the same key is safe because the provider returns the original result instead of charging twice. A new key would cause the double charge.',
    },
    {
      type: 'single',
      prompt: 'A consumer reads `PaymentCompleted` messages from Anypoint MQ and emails a receipt. MQ delivery is at-least-once, so the same message can arrive twice. How should the consumer stop duplicate emails?',
      options: [
        'Set the subscriber acknowledgement mode to `IMMEDIATE`, so each message is acked on receipt',
        'Use an Idempotent Message Validator on `paymentId` with a persistent Object Store',
        'Use an Idempotent Message Validator on `paymentId` with an in-memory store per replica',
        'Use an Idempotent Message Validator on the MQ message ID with a persistent Object Store',
      ],
      answer: 1,
      explain: 'Anypoint MQ is at-least-once, so the consumer must dedupe itself on a stable business key such as `paymentId`, in a store that does not depend on one replica. It acks only after the email is sent. Across an external email system you can only reach *effectively-once*, so a rare duplicate is still possible in a tiny window. Acking on receipt trades duplicates for lost receipts when the flow fails, and does not stop a producer that publishes twice. An in-memory store per replica misses a redelivery that lands on the other replica. A producer retry publishes a new message with a new message ID, so deduping on that ID lets the duplicate through.',
    },
    {
      type: 'match',
      prompt: 'Match each situation to the response the Process API returns.',
      pairs: [
        ['Same key, status COMPLETED', 'The stored original response (same status and body)'],
        ['Same key, status IN_PROGRESS', '409 Conflict or 202 still processing'],
        ['Same key, different request body hash', '422: a client bug'],
        ['New key', 'Insert IN_PROGRESS and process the payment'],
      ],
      explain: 'Storing the body hash and the final response with the key lets every retry get a consistent answer, and catches clients that reuse a key for a different payment.',
    },
  ],
  description: `
A utility company lets customers pay bills from a mobile app. Flow:

\`\`\`
Mobile app → Payments Experience API → Payments Process API
   → Payment Provider System API (card charge, external REST)
   → Billing System API (marks invoice paid in the billing DB)
   → publishes PaymentCompleted to Anypoint MQ → receipts/email consumer
\`\`\`

Incidents in the last quarter:
- Customers on bad mobile networks **tapped "Pay" twice** or the app retried after a timeout → **charged twice**.
- The Process API timed out waiting for the provider (it took 35 s), retried, and the provider had actually succeeded the first time.
- Receipts were sometimes **emailed 2 to 3 times**.

The Process API runs on **2 replicas** on CloudHub 2.0. The payment provider supports an \`Idempotency-Key\` request header (keys kept 24 h).

Numbers for sizing:
- On the bill due date customers make up to **40 payments a second**.
- The payment provider answers in about **2 s**, the billing DB in 50 ms, and the email provider in 500 ms.
- Every app must survive the loss of one **availability zone**, and the email provider can be down for a few minutes. No receipt may be lost. A queued message that fails is tried again about once a minute.
- The budget for all the Mule apps is **2.5 vCores**.

**Design idempotency end to end:**
- Where is the idempotency key created, and how does it flow through every hop?
- How does the Process API detect a duplicate, including one that arrives **while the first request is still in flight**?
- What do you store, where, and for how long? Why must it be shared across replicas?
- How do you handle the "timed out but actually succeeded" case?
- How do you stop duplicate receipts?
`,
  answerTemplate: `## Key generation and propagation

## Duplicate detection in the Process API

## Storage and TTL

## Unknown outcome (timeouts)

## Downstream consumers
`,
  keyPoints: [
    'The client generates one idempotency key (UUID) per payment intent and resends the same key on every retry; it is propagated as a header through all layers.',
    'The Process API records the key in a shared store (persistent Object Store v2 or DB with unique constraint) before calling the provider; a per-replica in-memory store is not enough.',
    'Concurrent duplicates handled by an atomic insert/lock on the key (state IN_PROGRESS); a second request gets 409/202 or waits, and does not call the provider again.',
    'Completed results are stored with the key so a retry returns the original response (same status and body) instead of reprocessing.',
    'The same key is passed to the provider as Idempotency-Key, so a retry after a timeout cannot double-charge; unknown outcomes are resolved by retry-with-same-key or a status query.',
    'The billing update and receipts consumer are idempotent too (conditional update on invoice; dedupe on paymentId with the idempotent message validator) because MQ is at-least-once.',
    'Sizing: every app runs 2 replicas so a zone outage leaves one, with 0.2 vCore for the payment chain because each request holds a thread for the 2 s provider call. Receipts go through the queue, so an email outage never fails a payment.',
  ],
  solution: `
**Key generation and propagation.** The mobile app creates an \`Idempotency-Key\` (UUID v4) when the user confirms a payment and **reuses it on every retry** of that payment. The Experience API requires the header (400 if missing) and passes it unchanged to the Process API. The Process API derives keys for downstream calls from it (e.g. the same value to the provider, \`paymentId\` to billing). Also log it as part of the correlation ID for traceability.

**Duplicate detection in the Process API.**
1. Atomically **insert** the key with status \`IN_PROGRESS\` plus a hash of the request body. Use a store shared by both replicas: a DB table with a **unique constraint** on the key, or **Object Store v2 (persistent)** using a store operation that fails if the key exists. An in-memory store per replica would miss duplicates hitting the other replica.
2. If the insert fails because the key exists:
   - status \`COMPLETED\` → return the **stored original response** (same HTTP status and body).
   - status \`IN_PROGRESS\` → return **409 Conflict** (or 202 "still processing"), never call the provider again.
   - same key but a different body hash → **422**, it is a client bug.
3. On completion, update the record to \`COMPLETED\` with the response; on a definite failure, mark \`FAILED\` (or delete) so the user can retry.

**Storage and TTL.** Keep the record at least as long as clients may retry and ≥ the provider's 24 h window (e.g. 48 h). Add a timeout for stale \`IN_PROGRESS\` rows (crashed worker) that triggers reconciliation rather than blind reprocessing.

**Unknown outcome.** A timeout means "unknown", not "failed". Because the provider receives the **same \`Idempotency-Key\`**, the Process API can safely retry (until-successful with backoff): the provider returns the original result instead of charging again. If retries are exhausted, leave the record \`IN_PROGRESS\`/\`UNKNOWN\` and resolve it by querying the provider's payment status or via a reconciliation job; tell the user "payment pending", not "failed". Also set the HTTP timeout to match the provider's realistic latency.

**Downstream consumers.**
- *Billing:* conditional update: \`UPDATE invoice SET status='PAID', payment_id=:id WHERE id=:inv AND status<>'PAID'\`; re-running it is harmless.
- *Receipts:* Anypoint MQ is at-least-once, so the consumer uses an **Idempotent Message Validator** on \`paymentId\` with a persistent Object Store (TTL of a few days). It acks only after the email is sent. Accept that the tiny window between "email sent" and "key stored" can still produce a rare duplicate; exactly-once across an external email system is not achievable, only effectively-once.

**Sizing and failure handling.**
- Each payment holds a thread in the Experience, Process and provider System APIs for about 2 s. At 40 payments a second, 0.2 vCore per replica gives enough threads. The billing System API gets 0.2 vCore too.
- Every app runs **2 replicas**, so losing one availability zone still leaves a replica that can carry the full load on its own. That is about 1.8 vCores in total, inside the 2.5 vCore budget.
- Receipts are not sent inside the payment request. When the email provider is down, payments are still answered and the receipts wait in the queue. Leave Deliveries before the DLQ at no limit here (or add a DLQ), so an outage of a few minutes loses no receipt. The receipts consumer also runs 2 replicas, which gives it spare capacity to clear the backlog once email is back.
`,
}

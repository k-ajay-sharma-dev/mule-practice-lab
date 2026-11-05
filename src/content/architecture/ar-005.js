export default {
  id: 'ar-005',
  category: 'architecture',
  title: 'End-to-End Idempotency for Payments',
  level: 'ADVANCED',
  tags: ['idempotency', 'duplicates', 'object-store', 'retries'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'Who should create the idempotency key for a bill payment, and when?',
      options: [
        'The mobile app, once per payment intent, reusing the same key on every retry of that payment',
        'The Experience API, generating a new UUID for each incoming request',
        'The Process API, by hashing the timestamp of the request',
        'The payment provider, returned after the first charge',
      ],
      answer: 0,
      explain: 'Only the client knows that two requests are the **same** payment. A key generated per request on the server side would differ for a retry, so duplicates would never be detected.',
    },
    {
      type: 'single',
      prompt: 'The Process API runs on 2 replicas. Where must the idempotency records live?',
      options: [
        'In an in-memory Object Store in each replica',
        'In a store shared by both replicas, such as a DB table with a unique key or a persistent Object Store v2',
        'In a flow variable, because the request stays on one replica',
        'In the HTTP session of the mobile app',
      ],
      answer: 1,
      explain: 'A retry can land on the other replica. A per-replica in-memory store would not see the first request, so the duplicate would be charged again.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'A second request with the same key arrives while the first is still `IN_PROGRESS`. What should the Process API do?',
      options: [
        'Call the provider again, since the provider dedupes anyway',
        'Return 409 Conflict (or 202 "still processing") without calling the provider',
        'Wait for the first request and then charge again to be safe',
        'Delete the record and treat the new request as fresh',
      ],
      answer: 1,
      explain: 'The atomic insert of the key failed, so a first attempt owns the payment. The duplicate must not call the provider; it reports that the payment is in progress.',
    },
    {
      type: 'single',
      prompt: 'The provider call timed out after 35 s. What is the right interpretation and next step?',
      options: [
        'The payment failed; tell the user to pay again',
        'The outcome is unknown; retry with the same Idempotency-Key or query the payment status, and tell the user "payment pending"',
        'The payment succeeded; mark the invoice paid',
        'Retry with a new Idempotency-Key so the provider treats it as a fresh request',
      ],
      answer: 1,
      explain: 'A timeout means "unknown", not "failed". Retrying with the same key is safe because the provider returns the original result instead of charging twice. A new key would cause the double charge.',
    },
    {
      type: 'single',
      prompt: 'A consumer reads `PaymentCompleted` messages from Anypoint MQ and emails a receipt. MQ delivery is at-least-once, so the same message can arrive twice. How should the consumer stop duplicate emails?',
      options: [
        'Turn on exactly-once delivery in the Anypoint MQ settings',
        'Use an Idempotent Message Validator on `paymentId` with a persistent Object Store',
        'Use an Idempotent Message Validator on `paymentId` with an in-memory store per replica',
        'Dedupe on a new UUID that the consumer generates for each delivery',
      ],
      answer: 1,
      explain: 'Anypoint MQ is at-least-once, so the consumer must dedupe itself on a stable key such as `paymentId`, in a store that does not depend on one replica. It acks only after the email is sent. Across an external email system you can only reach *effectively-once*, so accept that a rare duplicate is still possible in a tiny window. There is no exactly-once switch to turn on.',
    },
    {
      type: 'match',
      prompt: 'Match each situation to the response the Process API returns.',
      pairs: [
        ['Same key, status COMPLETED', 'The stored original response (same status and body)'],
        ['Same key, status IN_PROGRESS', '409 Conflict or 202 still processing'],
        ['Same key, different request body hash', '422 — a client bug'],
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
- Receipts were sometimes **emailed 2–3 times**.

The Process API runs on **2 replicas** on CloudHub 2.0. The payment provider supports an \`Idempotency-Key\` request header (keys kept 24 h).

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

**Unknown outcome.** A timeout means "unknown", not "failed". Because the provider receives the **same \`Idempotency-Key\`**, the Process API can safely retry (until-successful with backoff) — the provider returns the original result instead of charging again. If retries are exhausted, leave the record \`IN_PROGRESS\`/\`UNKNOWN\` and resolve it by querying the provider's payment status or via a reconciliation job; tell the user "payment pending", not "failed". Also set the HTTP timeout to match the provider's realistic latency.

**Downstream consumers.**
- *Billing:* conditional update — \`UPDATE invoice SET status='PAID', payment_id=:id WHERE id=:inv AND status<>'PAID'\`; re-running it is harmless.
- *Receipts:* Anypoint MQ is at-least-once, so the consumer uses an **Idempotent Message Validator** on \`paymentId\` with a persistent Object Store (TTL of a few days). It acks only after the email is sent. Accept that the tiny window between "email sent" and "key stored" can still produce a rare duplicate; exactly-once across an external email system is not achievable, only effectively-once.
`,
}

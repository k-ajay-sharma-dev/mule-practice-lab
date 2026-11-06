import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-061',
  category: 'architecture',
  title: 'Consistency Across Layers: Where the Saga Lives',
  level: 'ADVANCED',
  tags: ['api-led', 'saga', 'consistency', 'compensation', 'idempotency'],
  estMinutes: 30,
  diagram: {
    task: 'draw the account-opening saga: where it lives, the System APIs it orchestrates, where its state is kept, and how the slow card step is completed asynchronously.',
    checks: [
      { label: 'The mobile channel calls an Experience API, which calls the saga Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'The Experience API never coordinates System APIs itself', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'The Process API orchestrates the CRM and core-banking System APIs', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 2 } },
      { label: 'Saga state is persisted outside memory (database or persistent store)', rule: { type: 'edge', from: ['process-api', 'batch-job'], to: ['database', 'cache'] } },
      { label: 'The slow card issuance is handed off asynchronously through a queue', rule: { type: 'edge', from: 'process-api', to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'Card requests that keep failing end up in a dead-letter queue', rule: { type: 'edge', from: ['queue', 'topic', 'event-stream'], to: 'dlq' } },
      { label: 'The card processor is reached only through its System API', rule: { type: 'only-via', target: ['external-api', 'saas', 'payment'], from: 'system-api' } },
      { label: 'System APIs never call each other — they stay unaware of the saga', rule: { type: 'no-edge', from: 'system-api', to: 'system-api' } },
      { label: 'The mobile channel calls every Experience API', rule: { type: 'each', of: 'experience-api', edgeFrom: 'mobile-app' } },
      { label: 'The card step reaches the card processor through the queue', rule: { type: 'path', from: 'process-api', via: ['queue', 'topic', 'event-stream'], to: ['external-api', 'saas', 'payment'] } },
      { label: 'No chain of sync calls joins the mobile request to the slow card processor', rule: { type: 'no-path', from: 'experience-api', to: ['external-api', 'saas', 'payment'], kind: 'sync' } },
      { label: 'CRM and core banking are reached only through System APIs', rule: { type: 'only-via', target: ['crm', 'legacy'], from: 'system-api' } },
      { label: 'Every System API is called by a Process API', rule: { type: 'each', of: 'system-api', edgeFrom: 'process-api' } },
      { label: 'Every System API connects to its backend', rule: { type: 'each', of: 'system-api', edgeTo: ['crm', 'legacy', 'erp', 'database', 'external-api', 'saas', 'payment'] } },
      { label: 'APIs call each other with sync calls. Async work goes through a broker', rule: { type: 'lines', from: ['mobile-app', 'experience-api', 'process-api'], to: ['experience-api', 'process-api', 'system-api'], kind: 'sync' } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: ['queue', 'topic', 'event-stream', 'cloud-queue', 'dlq'], kind: 'async' } },
      { label: 'Reads and writes to a data store are sync calls', rule: { type: 'lines', to: ['database', 'cache'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Mobile app'],
        exp: ['experience-api', 'exp-onboarding-api (201: cardStatus PENDING)'],
        prc: ['process-api', 'prc-account-opening-api (saga coordinator)'],
        state: ['database', 'Saga state (sagaId, steps, status)'],
        rec: ['batch-job', 'Saga recovery / reconciliation job'],
        q: ['queue', 'card-issuance-q'],
        dlq: ['dlq', 'card-issuance-dlq'],
        wk: ['process-api', 'prc-account-opening card worker'],
        scrm: ['system-api', 'sys-crm-customer-api'],
        score: ['system-api', 'sys-core-account-api'],
        scard: ['system-api', 'sys-card-api (idempotency key, status lookup)'],
        crm: ['crm', 'CRM'],
        core: ['legacy', 'Core banking'],
        card: ['external-api', 'Card processor'],
      },
      [
        'mob -> exp', 'exp -> prc', 'prc -> state', 'prc -> scrm', 'prc -> score', 'prc ~> q', 'q ~> wk', 'q ~> dlq',
        'wk -> scard', 'wk -> state', 'rec -> state', 'scrm -> crm', 'score -> core', 'scard -> card',
      ],
    ),
  },
  description: `
\`prc-account-opening-api\` must, for a new bank customer:

1. Create the customer in **CRM** (\`sys-crm-customer-api\`)
2. Create the account in **core banking** (\`sys-core-account-api\`)
3. Issue a debit card via the **card processor** (\`sys-card-api\`, external, sometimes slow)
4. Mark the CRM customer as "onboarded"

Each system has its own database; there is no shared transaction. Last month, step 3 failed for 2% of requests and left customers with an account but no card and CRM still "pending". Support fixes them manually.

**Questions:**
1. Why can't you wrap these four calls in one transaction (XA / Mule \`try\` with transactions)?
2. Design a **saga**: in which **layer** does it live, what are the compensations, and what does each System API need to provide to make it work?
3. How do you handle the **unknown outcome** case (card call times out — was the card issued or not)?
4. Synchronous orchestration or asynchronous? What does the Experience API return to the mobile app?
`,
  answerTemplate: `## Why not a distributed transaction

## Saga design and layer placement

## Unknown outcomes

## Sync vs async and the consumer response
`,
  keyPoints: [
    'Across HTTP APIs and SaaS/external systems there is no shared transaction manager; Mule XA transactions only cover transactional resources like JMS/JDBC/VM, not REST calls.',
    'The saga belongs in the Process API, which owns the business process; System APIs provide the primitives: idempotent create, compensating operations (cancel/close) and status lookups.',
    'Each step has a compensation (close account, deactivate customer) or a forward-recovery path (retry card issuance later) chosen by business rules.',
    'Unknown outcomes are resolved with idempotency keys and status queries before retrying or compensating — never by blind retry.',
    'For slow/unreliable steps, accept the request (202 or 201 with status PENDING), persist saga state, and complete asynchronously via queues; the Experience API exposes status.',
  ],
  solution: `
**Why not one transaction.** Two-phase commit needs every participant to support a transaction protocol coordinated by one manager. CRM (SaaS), core banking via API and an external card processor over HTTPS do not. In Mule 4, XA covers transactional connectors (JMS, JDBC, VM) — not HTTP calls to other APIs. Holding locks across slow external calls would also hurt availability. So you accept **eventual consistency** and manage it explicitly.

**Saga design — Process layer.**
\`\`\`
prc-account-opening-api (owns saga state: sagaId, step, status)
  1 POST sys-crm  /customers           (Idempotency-Key: sagaId-1)   comp: PATCH status=CANCELLED
  2 POST sys-core /accounts            (Idempotency-Key: sagaId-2)   comp: POST /accounts/{id}/closure
  3 POST sys-card /cards               (Idempotency-Key: sagaId-3)   forward recovery: retry via queue
  4 PATCH sys-crm /customers/{id}      status=ONBOARDED              (idempotent by nature)
\`\`\`
- **Process layer**, because the saga *is* business logic: which steps, in what order, and what "undo" means. System APIs must stay unaware of each other.
- System APIs must provide:
  - **Idempotent creates** (idempotency key or natural business key) so retries do not duplicate.
  - **Compensating operations** that make business sense (close account, cancel customer) — usually not "delete".
  - **Status lookups** (\`GET /cards?requestRef=…\`) to resolve unknown outcomes.
  - Clear error semantics (4xx = will never succeed, 5xx/timeout = may succeed on retry).
- Business decision per step: failure at step 3 does **not** necessarily mean compensating 1–2. Often better: keep the account, mark customer "card pending", **retry card issuance asynchronously**, alert after N attempts. That is forward recovery. Compensation is for failures that make the whole process invalid (e.g. step 2 rejected for compliance).

**Saga state.** Persist in a database (or persistent Object Store for simple cases): \`sagaId\`, completed steps with returned ids, current status, attempts. A recovery job resumes or compensates stuck sagas after restarts — the Process API remains stateless per request.

**Unknown outcomes (timeout on step 3).**
1. Do not assume failure. Query \`sys-card-api\` by the idempotency/request reference.
2. If found → record success and continue; if not found → retry with the **same** idempotency key; if the processor supports idempotency keys natively, retry is safe directly.
3. If still unknown after the retry budget → park in a "needs reconciliation" state, alert, and let a reconciliation process match against the processor's daily report.

**Sync vs async.**
- Steps 1–2 are fast and internal: synchronous.
- Step 3 is slow/unreliable: put a message on a queue (Anypoint MQ) and process asynchronously with retries and DLQ.
- The Experience API returns **201 Created** with \`accountStatus: ACTIVE, cardStatus: PENDING\` (or **202 Accepted** with a status URL if even the account is created async). The app polls \`GET /me/onboarding/{id}\` or receives a push notification.
- The Experience API stays thin: it never coordinates the saga, it only exposes the status the Process API owns.
`,
  followUps: [
    { q: 'Orchestrated saga or choreographed saga?', a: 'Orchestrated (Process API as coordinator) is easier to reason about, monitor and change for a 3–5 step business process. Choreography via events suits loosely coupled domains but makes the overall flow harder to see.' },
    { q: 'What if a compensation itself fails?', a: 'Compensations must be idempotent and retried from durable state; if they keep failing, the saga moves to a manual-intervention state with alerting. Never lose the record that compensation is still owed.' },
    { q: 'Could you use the transactional outbox here?', a: 'Yes: when the Process API writes saga state and the next-step message, an outbox in the same database guarantees the message is published if and only if the state change committed.' },
  ],
}

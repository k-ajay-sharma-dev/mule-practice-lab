export default {
  id: 'inc-048',
  category: 'incidents',
  title: 'Experience API Times Out While the Lower Layers Still Finish Successfully',
  level: 'ADVANCED',
  tags: ['api-led', 'timeouts', 'latency', 'timeout-budget', 'idempotency'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '14:02:11.004 INFO  [exp-web-api]      POST /api/checkout cart=C-55102 corrId=f19a-02', relevant: false },
      { text: '14:02:11.020 INFO  [prc-order-api]    POST /api/orders corrId=f19a-02', relevant: false },
      { text: '14:02:13.240 INFO  [sys-payment-api]  Payment captured amount=129.90 corrId=f19a-02', relevant: true, why: 'The payment is already captured 2 s in; whatever happens next, the customer has been charged.' },
      { text: '14:02:13.262 INFO  [sys-sap-api]      Creating sales order in SAP corrId=f19a-02', relevant: true, why: 'The SAP call starts with its own full 30 s clock, but only ~28 s of the outer budget are left.' },
      { text: '14:02:20.500 INFO  [exp-web-api]      GET /api/products/P-100 200 corrId=aa01-77', relevant: false },
      { text: "14:02:41.009 ERROR [exp-web-api]      HTTP:TIMEOUT HTTP POST on resource 'https://prc-order-api.internal/api/orders' failed: Timeout exceeded. corrId=f19a-02", relevant: true, why: 'The Experience API gives up first: its 30 s clock started earliest, so it times out while work continues below.' },
      { text: '14:02:41.012 ERROR [exp-web-api]      Returning 504 to client corrId=f19a-02', relevant: false },
      { text: '14:02:42.171 INFO  [sys-sap-api]      SAP order 4500991231 created corrId=f19a-02', relevant: true, why: 'SAP succeeds after ~29 s: the timeout was an unknown outcome, not a failure.' },
      { text: '14:02:42.205 WARN  [prc-order-api]    Response could not be delivered: client connection closed corrId=f19a-02', relevant: true, why: 'The order exists but nobody is listening; the customer retries and is charged again.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why does the top layer fail while the lower layers succeed?',
        options: [
          'Every layer uses 30 s; the outer clock starts first and must cover payment + SAP + overhead, so a slow SAP makes the outer layer give up while work continues',
          'prc-order-api crashes after creating the order',
          'The gateway has a bug that drops responses at random',
          'sys-sap-api returns the wrong status code',
        ],
        answer: 0,
        explain: 'Timeouts **stack**: identical values at each hop mean the outermost layer always runs out of time first.',
      },
      {
        type: 'single',
        prompt: 'What stops the **double charges** most directly?',
        options: [
          'Make checkout idempotent with an Idempotency-Key (cart ID) stored in Object Store, returning the existing order on retry',
          'Lower the SAP timeout to 5 s',
          'Add replicas to prc-order-api',
          'Retry the SAP call three times',
        ],
        answer: 0,
        explain: 'A retry after an unknown outcome must not create a second payment. Disabling the shop auto-retry is the fallback if idempotency cannot ship today.',
      },
      {
        type: 'order',
        prompt: 'Order a correct timeout budget from outermost to innermost.',
        items: [
          'Gateway / client: 20 s',
          'exp-web-api requester to prc: 18 s',
          'prc-order-api to SAPI: 12 s (payment 4 s runs before it)',
          'sys-sap-api SAP call: 11 s',
        ],
        explain: 'Budget top-down: each inner timeout is smaller than its caller minus processing overhead.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and prevention**?',
        options: [
          'Async pattern for slow writes: 202 Accepted with a reference, order queued in Anypoint MQ, status polling or push',
          'Idempotency at every write layer (payment and SAP order create)',
          'Timeouts as reviewed per-API properties, with p95/p99 latency per hop and load tests with a slow SAP',
          'Set every layer to 120 s so nothing ever times out',
        ],
        answer: [0, 1, 2],
        explain: 'Equal large timeouts still stack and just make users wait longer; the fix is a budget, idempotency and async for long work. Also ask SAP to move the batch job.',
      },
    ],
  },
  description: `
## Symptoms
- About 6% of \`POST /checkout\` calls from the web shop fail with **504** after exactly **30 s**.
- Customers retry and some are **charged twice**; finance finds orders in SAP for checkouts that the shop showed as failed.
- When the team traces a failed request, \`prc-order-api\` and \`sys-sap-api\` both log **success** — moments after the experience layer gave up.

## Change / Context
- Chain: \`exp-web-api\` → \`prc-order-api\` → \`sys-sap-api\` (SAP order create) and \`sys-payment-api\`.
- Every HTTP request config in every layer uses the template default \`responseTimeout="30000"\`. The CloudHub load balancer / gateway in front of \`exp-web-api\` also uses 30 s.
- \`prc-order-api\` calls \`sys-payment-api\` (~2 s) and then \`sys-sap-api\`. SAP order creation normally takes 3–5 s, but since a SAP batch job moved to business hours it often takes 25–35 s.

## Logs
\`\`\`
14:02:11.004 INFO  [exp-web-api]      POST /api/checkout cart=C-55102 corrId=f19a-02
14:02:11.020 INFO  [prc-order-api]    POST /api/orders corrId=f19a-02
14:02:13.240 INFO  [sys-payment-api]  Payment captured amount=129.90 corrId=f19a-02
14:02:13.262 INFO  [sys-sap-api]      Creating sales order in SAP corrId=f19a-02
14:02:41.009 ERROR [exp-web-api]      HTTP:TIMEOUT HTTP POST on resource 'https://prc-order-api.internal/api/orders' failed: Timeout exceeded. corrId=f19a-02
14:02:41.012 ERROR [exp-web-api]      Returning 504 to client corrId=f19a-02
14:02:42.171 INFO  [sys-sap-api]      SAP order 4500991231 created corrId=f19a-02
14:02:42.203 INFO  [prc-order-api]    Order created orderId=4500991231 corrId=f19a-02
14:02:42.205 WARN  [prc-order-api]    Response could not be delivered: client connection closed corrId=f19a-02
\`\`\`

## Your tasks
1. Explain why the top layer fails while the lower layers succeed.
2. What do you do immediately to stop double charges?
3. What is the root cause?
4. Design a correct timeout budget for this chain.
5. How do you prevent this class of issue?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Explains latency stacking: the Experience API\'s 30 s budget must cover payment + SAP + network + processing in the lower layers, so identical 30 s timeouts at every layer mean the top always gives up first.',
    'Recognises the timeout as an "unknown outcome", not a failure: the order and payment were completed, so client retries cause duplicates.',
    'Immediate: stop duplicate charges with idempotency (idempotency key on checkout/payment), reconcile already double-charged orders, and temporarily raise the outer timeouts above the inner ones.',
    'Permanent fix: a top-down timeout budget where each inner timeout is smaller than its caller\'s minus overhead, plus an async pattern (202 Accepted + status polling or event) for operations that can legitimately take long.',
    'Addresses the slow dependency itself (SAP batch job scheduling) and sets latency SLOs per layer.',
    'Prevention: timeout values as reviewed, per-API configuration (not template defaults), and monitoring of p95/p99 latency per hop.',
  ],
  solution: `
**Diagnosis.** Timeouts in a chain **stack**. With the same 30 s at every layer:

\`\`\`
t=0s    exp-web-api starts its 30s clock
t=0s      prc-order-api receives the request
t=2s        sys-payment-api done (payment captured!)
t=2s        the calls to sys-sap-api and SAP start their 30s clocks -> SAP takes ~29s
t=30s   exp-web-api gives up -> 504 to the shop  <-- outer timer ran out first
t=31s       SAP order created, prc-order-api succeeds -> nobody is listening
\`\`\`

The Experience API's clock started first and has the same length as the inner clocks, so any slow inner call means the outer layer times out while work continues below. The customer sees "failed", retries, and the payment and order are created again.

**Immediate mitigation.**
1. Stop the bleeding on duplicates: make checkout idempotent — the shop sends an \`Idempotency-Key\` (cart ID); \`prc-order-api\` stores key → result in an Object Store and returns the existing order on a retry instead of charging again. If that can't ship today, disable the shop's automatic retry and show "we are confirming your order" instead.
2. Temporarily set the outer timeouts larger than the inner ones (e.g. gateway 60 s, exp 55 s, prc 50 s) so successful orders are returned.
3. Reconcile: find payments without a confirmed order response and refund duplicates.
4. Ask the SAP team to move the batch job back out of business hours.

**Root cause.** No **timeout budget**: all layers use a copy-pasted default, so the outermost layer has the least effective time. Combined with a non-idempotent write operation, a timeout became duplicate charges.

**Permanent fix.**
- **Budget top-down**: start from what the user/gateway will tolerate and give each inner call less, leaving room for processing and retries.

\`\`\`
Gateway / client  : 20s
exp-web-api       : requester to prc  = 18s
prc-order-api     : payment = 4s, SAP = 12s  (sequential: 4 + 12 + overhead < 18)
sys-sap-api       : SAP call timeout = 11s
\`\`\`

- **Async for slow writes**: if SAP can legitimately take 30 s+, \`POST /checkout\` returns **202 Accepted** with an order reference after payment authorisation and a queued order request (Anypoint MQ); the shop polls \`GET /checkout/{id}\` or receives a push notification.
- **Idempotency** at every write layer (payment and SAP order create keyed by cart/order reference).
- Fail fast inside: an inner call that exceeds its budget returns 504/503 quickly with a clear error, rather than letting the outer layer guess.

**Prevention.** Timeouts as explicit, documented per-API properties reviewed in design (no blind template defaults); p95/p99 latency dashboards per hop with correlation IDs; load tests that simulate a slow SAP; contract notes in Exchange stating each API's expected latency and timeout.
`,
  followUps: [
    { q: 'Why not just set every timeout to 120 seconds?', a: 'Users and gateways will not wait that long, and long timeouts keep resources and connections busy during an incident. The goal is ordered timeouts (inner smaller than outer) plus async handling for genuinely slow work.' },
    { q: 'If the inner timeout fires, has the operation failed?', a: 'Not necessarily — the backend may still complete it. A timeout means "unknown outcome", which is why writes need idempotency keys and, ideally, a way to query status afterwards.' },
    { q: 'How do retries fit into a timeout budget?', a: 'Each retry consumes budget: two attempts of 8 s need at least 16 s plus backoff inside the caller\'s timeout. Retries are usually done in one layer only, and only for idempotent or idempotency-protected operations.' },
  ],
}

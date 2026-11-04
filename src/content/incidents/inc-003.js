export default {
  id: 'inc-003',
  category: 'incidents',
  title: 'Duplicate Orders Created by Client Retries',
  level: 'INTERMEDIATE',
  tags: ['idempotency', 'retries', 'timeouts', 'object-store'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '12:14:03.201 INFO  [orders-papi] POST /orders basketId=B-77812 corrId=4a10', relevant: true, why: 'The first request for basket B-77812.' },
      { text: '12:14:03.240 INFO  [orders-papi] Calling erp-sapi createOrder basketId=B-77812 corrId=4a10', relevant: false },
      { text: '12:14:05.610 INFO  [orders-papi] POST /orders basketId=B-77790 corrId=0be4', relevant: false },
      { text: '12:14:13.305 INFO  [orders-papi] POST /orders basketId=B-77812 corrId=91bf', relevant: true, why: 'The same basket arrives again exactly 10 s later with a new correlation ID: the mobile auto-retry, while the first call is still running.' },
      { text: '12:14:13.332 INFO  [orders-papi] Calling erp-sapi createOrder basketId=B-77812 corrId=91bf', relevant: true, why: 'Nothing recognises the repeat, so a second ERP create is started for the same basket.' },
      { text: '12:14:15.870 INFO  [orders-papi] ERP order created orderNo=4500112 basketId=B-77812 corrId=4a10', relevant: true, why: 'The first call took 12.6 s at peak, longer than the 10 s client timeout, but it did succeed.' },
      { text: '12:14:20.002 INFO  [health] GET /health 200 (2 ms)', relevant: false },
      { text: '12:14:24.118 INFO  [orders-papi] ERP order created orderNo=4500119 basketId=B-77812 corrId=91bf', relevant: true, why: 'A second order number for the same basket: the duplicate.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the most likely root cause of the duplicates?',
        options: [
          'The mobile app retries after 10 s while the ERP still processes the first request, and POST /orders is not idempotent',
          'The ERP has a bug that creates two orders for large baskets',
          'Customers double-click the checkout button',
          'orders-papi has two replicas that both process each request',
        ],
        answer: 0,
        explain: 'Same basket, different correlation IDs, 10 s apart: that is the client retry. At peak the ERP takes 8 to 15 s, so the first call is still running and both succeed. A double-click would be milliseconds apart, not 10 s.',
      },
      {
        type: 'single',
        prompt: 'What do you do **right now** to limit the damage?',
        options: [
          'Scale orders-papi to more replicas so the ERP call finishes faster',
          'Turn off the mobile auto-retry (or raise its timeout above the worst ERP time), then find and cancel the duplicates before they ship',
          'Restart the ERP',
          'Add an Until Successful scope around the ERP call',
        ],
        answer: 1,
        explain: 'Stop new duplicates at the source and clean up the existing ones before they are shipped and charged. More Mule replicas do not make the ERP faster, and more retries create more duplicates.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix**?',
        options: [
          'The client sends an Idempotency-Key header (per checkout, or the basket ID) and retries with the same key',
          'An Idempotent Message Validator on a persistent Object Store with a TTL, keyed on that key',
          'Mark the key as in progress before calling the ERP, and store the original response to return on repeats',
          'Remove all client retries permanently',
        ],
        answer: [0, 1, 2],
        explain: 'Idempotency makes retries safe instead of forbidden. Marking the key before the ERP call also catches a retry that arrives while the first call is still running, as in this incident.',
      },
      {
        type: 'order',
        prompt: 'Put the incident response in order.',
        items: [
          'Match duplicate pairs by basket ID and spot the 10 s gap with different correlation IDs',
          'Turn off the mobile auto-retry via remote config',
          'Find, cancel and refund duplicate orders and inform customer service',
          'Add idempotency keys with an Object Store check in orders-papi',
          'Add a daily duplicate-basket reconciliation alert',
        ],
        explain: 'Diagnose, stop the bleeding, repair customer impact, then fix properly and monitor for regressions.',
      },
    ],
  },
  description: `
## Symptoms
- Customer service reports customers charged and shipped **twice** for the same basket. About 1.5% of yesterday's orders are duplicates.
- Duplicates happen mostly between 12:00 and 14:00 (lunchtime peak).
- Every duplicate pair has the **same basket ID** and items, created 10–12 s apart.

## Context
- Mobile app → \`orders-exp-api\` → \`orders-papi\` → \`erp-sapi\` (\`POST /orders\` creates an order in the ERP).
- Last sprint the mobile team added an **automatic retry**: if no response in 10 s, resend the same request (up to 2 times).
- At peak, ERP order creation takes 8–15 s.

## Logs (orders-papi)
\`\`\`
12:14:03.201 INFO  [orders-papi] POST /orders basketId=B-77812 corrId=4a10
12:14:03.240 INFO  [orders-papi] Calling erp-sapi createOrder basketId=B-77812 corrId=4a10
12:14:13.305 INFO  [orders-papi] POST /orders basketId=B-77812 corrId=91bf
12:14:13.332 INFO  [orders-papi] Calling erp-sapi createOrder basketId=B-77812 corrId=91bf
12:14:15.870 INFO  [orders-papi] ERP order created orderNo=4500112 basketId=B-77812 corrId=4a10
12:14:24.118 INFO  [orders-papi] ERP order created orderNo=4500119 basketId=B-77812 corrId=91bf
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do **right now** to limit the damage?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Client timeout (10 s) is shorter than server processing time (8–15 s), so the client retries while the first request is still running; both succeed.',
    'Each retry gets a new correlation ID and nothing on the server recognises it as the same request — the POST is not idempotent.',
    'Immediate: disable or lengthen the client auto-retry (feature flag/config) and identify and cancel/refund existing duplicates.',
    'Permanent fix: an idempotency key (e.g. Idempotency-Key header or basket ID) checked server-side with an Idempotent Message Validator / Object Store, returning the original result for repeats.',
    'Handles the in-flight case: store the key as "processing" before calling the ERP so a concurrent retry is rejected (e.g. 409) or waits, not just after completion.',
    'Prevention: retry only idempotent operations or with idempotency keys, client timeouts aligned with server SLAs, backoff, and an alert/reconciliation for duplicate orders.',
  ],
  solution: `
**Diagnosis.** The logs show the same \`basketId\` arriving twice, 10 s apart, with **different correlation IDs** — that is the mobile app's automatic retry. The first request is still waiting on the ERP (8–15 s at peak), the client gives up at 10 s and resends, and **both** requests create an order. Peak hours make the ERP slower, so more requests cross the 10 s line.

**Immediate mitigation.**
- Turn off the mobile auto-retry (remote config / feature flag) or raise its timeout above the worst ERP time.
- Run a query to find duplicate orders (same basket ID, short time apart), cancel/refund the second one before shipping, and inform customer service.

**Root cause.** A non-idempotent \`POST /orders\` combined with a client retry policy whose timeout is shorter than the server's processing time. Nothing on the server recognises a repeat.

**Permanent fix.**
- Client sends an **idempotency key** (a UUID per checkout, or the basket ID) in a header such as \`Idempotency-Key\`.
- \`orders-papi\` checks the key first: Mule's **Idempotent Message Validator** with a persistent **Object Store** (TTL e.g. 24 h), keyed on the idempotency key. A repeat raises \`MULE:DUPLICATE_MESSAGE\`, which you map to returning the **original response** (stored with the key) or a 409 with the order reference.
- Mark the key as *in progress* **before** calling the ERP, so a retry that arrives while the first call is running is caught too; store the final result when done.
- Optionally pass the key to the ERP as an external reference so it can reject duplicates itself.

**Prevention.** API standard: every create operation accepts an idempotency key; clients retry only with the same key, use exponential backoff, and time out **after** the server's documented SLA. Add a daily reconciliation/alert for duplicate basket IDs.
`,
}

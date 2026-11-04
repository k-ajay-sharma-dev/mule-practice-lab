export default {
  id: 'inc-029',
  category: 'incidents',
  title: 'Partner Renamed a Field and Every Order Fails in DataWeave',
  level: 'BEGINNER',
  tags: ['dataweave', 'schema-change', 'null-safety', 'validation', 'error-handling'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '01:58:40.002 INFO  [partner-orders-papi] Webhook received orderId=MP-55087 corrId=a771', relevant: false },
      { text: '01:58:40.051 INFO  [partner-orders-papi] Order MP-55087 mapped and forwarded, 201 corrId=a771', relevant: false },
      { text: '02:00:00.000 INFO  [partner] Marketplace API v3.1 released: customer.address -> customer.shippingAddress, discount omitted when zero', relevant: true, why: 'The partner changed its contract at 02:00, exactly when failures begin; we did not deploy anything.' },
      { text: '02:03:11.410 INFO  [partner-orders-papi] Webhook received orderId=MP-55102 corrId=c3e1', relevant: false },
      { text: '02:03:11.438 ERROR [partner-orders-papi] MULE:EXPRESSION "Cannot coerce Null (null) to Number at payload.customer.address.postCode as Number" corrId=c3e1', relevant: true, why: 'The missing field selects to null; the failure is the coercion of null to Number.' },
      { text: '02:03:11.440 ERROR [partner-orders-papi] Returning 500 corrId=c3e1', relevant: true, why: 'A 500 tells the partner to retry, so the same invalid order keeps coming back.' },
      { text: '02:03:30.950 INFO  [health] GET /health 200 (3 ms)', relevant: false },
      { text: '02:04:11.502 INFO  [partner-orders-papi] Webhook received orderId=MP-55102 (retry 2) corrId=d8f0', relevant: true, why: 'The partner is retrying the same order, which will never succeed until the mapping changes.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause of the 500s?',
        options: [
          'The partner renamed `customer.address` and omits `discount`; the selector returns null and `as Number` / arithmetic on null fails',
          'DataWeave throws an error as soon as you select a key that does not exist',
          'The partner is sending invalid JSON that cannot be parsed',
          'A deployment on our side broke the mapping at 02:00',
        ],
        answer: 0,
        explain: 'DataWeave returns **null** for a missing key; the error comes later when null is coerced to Number or used in subtraction. No deployment happened on our side.',
      },
      {
        type: 'single',
        prompt: 'What do you do **right now**?',
        options: [
          'Ask the partner to roll back v3.1 and wait',
          'Hotfix the mapping to accept both shapes, deploy, let the partner retries flow, and reconcile the rest',
          'Return 200 for every webhook so the partner stops retrying',
          'Restart the app to clear the failed messages',
        ],
        answer: 1,
        explain: 'A tolerant mapping restores the flow and the partner retries do the replay for you. Returning 200 would silently drop orders.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix**?',
        options: [
          'Use `default`: `payload.customer.shippingAddress default payload.customer.address` and `(payload.discount default 0)`',
          'Validate the inbound body against a schema (APIkit/JSON schema) and return 400 with details for invalid payloads',
          'Send records that fail mapping to an error/parking queue instead of losing them',
          'Wrap the whole mapping in a Try scope that returns 500 on any error',
        ],
        answer: [0, 1, 2],
        explain: 'Null-safe mapping, explicit validation with a 4xx and a parking queue. Returning 500 for bad input invites endless partner retries.',
      },
      {
        type: 'single',
        prompt: 'Which prevention step would have caught this **before** 02:00?',
        options: [
          'A versioned contract with the partner plus contract tests using their sample payloads in CI',
          'More workers for partner-orders-papi',
          'Longer HTTP response timeouts',
          'Logging the full payload at INFO level',
        ],
        answer: 0,
        explain: 'A versioned endpoint with a deprecation period, and contract tests with the partner payloads, catch breaking schema changes. Scaling or timeouts do not.',
      },
      {
        type: 'order',
        prompt: 'Put the response in order.',
        items: [
          'Correlate the errors with the partner v3.1 release',
          'Hotfix the mapping to accept both field names and missing discount',
          'Let partner retries flow and reconcile remaining orders with the partner',
          'Add schema validation returning 400 and a parking queue',
          'Agree contract versioning and add an error-rate alert per partner',
        ],
        explain: 'Find the trigger, restore the flow, recover data, then harden the API and the partner contract.',
      },
    ],
  },
  description: `
## Symptoms
- \`partner-orders-papi\` receives orders from a marketplace partner via webhook.
- Since 02:00, **100% of orders** fail with **HTTP 500** and the partner is retrying.
- No deployment happened on our side.

## Change / Context
- The partner released "API v3.1" overnight. In their changelog: \`customer.address\` is now \`customer.shippingAddress\`, and \`discount\` is omitted when zero.
- Our mapping uses \`payload.customer.address.postCode as Number\` and \`payload.total - payload.discount\`.

## Logs
\`\`\`
02:03:11.410 INFO  [partner-orders-papi] Webhook received orderId=MP-55102 corrId=c3e1
02:03:11.438 ERROR [partner-orders-papi] MULE:EXPRESSION
  "Cannot coerce Null (null) to Number
   at payload.customer.address.postCode as Number" evaluating expression ... corrId=c3e1
02:03:11.440 ERROR [partner-orders-papi] Returning 500 corrId=c3e1
\`\`\`

## Your tasks
1. What is the root cause?
2. What do you do right now?
3. How should the mapping be fixed?
4. How do you prevent silent contract breakage in future?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Selecting a missing field returns null in DataWeave; the failure happens when null is coerced (as Number) or used in arithmetic.',
    'The partner changed the contract (rename + optional field) without versioning on our side.',
    'Immediate: hotfix the mapping to read both field names, keep the partner retrying (or park failures) and replay.',
    'Fix: use default values / the default operator, explicit null handling, and validate the inbound payload against a schema with a clear 400.',
    'Returning 500 for bad input triggers partner retries; invalid contracts should get a 4xx and go to a review queue.',
    'Prevention: versioned contracts, consumer-driven contract tests, and monitoring of error rate per partner.',
  ],
  solution: `
## Diagnosis
\`payload.customer.address\` no longer exists, so the selector returns **null** (DataWeave does not fail on missing keys). The error happens at \`as Number\`: you cannot coerce null to Number → **MULE:EXPRESSION**. The same would happen for \`payload.total - payload.discount\` when \`discount\` is omitted.

## Immediate mitigation
Hotfix the mapping to support **both** shapes, deploy, and replay: the partner is retrying, so most orders will flow once the fix is live; reconcile the rest with the partner's order list. Tell the partner about the impact.

## Root cause
An unannounced breaking change in the partner's payload, plus a mapping that assumed every field is present and an API that returned 500 (inviting retries) instead of a clear validation error.

## Permanent fix
\`\`\`
%dw 2.0
output application/json
var addr = payload.customer.shippingAddress default payload.customer.address
---
{
  postCode: addr.postCode default "",
  net: (payload.total default 0) - (payload.discount default 0)
}
\`\`\`
- Validate the inbound body (JSON schema validation or APIkit with a RAML/OAS spec) and return **400** with details for invalid payloads.
- Send records that fail mapping to an error/parking queue rather than losing them.

## Prevention
- Agree a versioned contract with the partner (e.g. \`/v3\` endpoint, deprecation period).
- Contract tests using the partner's sample payloads in CI.
- Alert on error rate per partner so a spike at 02:00 pages someone immediately.
`,
  followUps: [
    { q: 'What does payload.a.b return if a does not exist?', a: 'null — selectors on null return null, so the error only appears later when the value is coerced, used in arithmetic, or passed to a function that does not accept null.' },
    { q: 'Why return 400 instead of 500 for a bad payload?', a: '500 says "our fault, retry later", so the partner keeps retrying something that will never succeed; 400 says the request is invalid and should be fixed by the sender.' },
  ],
}

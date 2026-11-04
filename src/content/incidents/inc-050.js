export default {
  id: 'inc-050',
  category: 'incidents',
  title: 'Retries in Every Layer Turn One Slow SAP Call Into 27',
  level: 'ADVANCED',
  tags: ['api-led', 'retries', 'retry-amplification', 'resilience', 'sap'],
  estMinutes: 40,
  investigation: {
    logs: [
      { text: '08:06:40.112 INFO  [exp-mobile-api]   GET /api/stock?sku=88123 corrId=d4b0-77', relevant: false },
      { text: '08:06:50.130 WARN  [sys-sap-api]      SAP call timed out, retry 1/2 corrId=d4b0-77', relevant: true, why: 'Innermost layer retries SAP on a timeout, i.e. when SAP is overloaded, adding more load.' },
      { text: "08:06:50.131 ERROR [prc-inventory-api] HTTP:TIMEOUT HTTP GET on resource 'https://sys-sap-api.internal/api/materials/88123/availability' failed: Timeout exceeded. corrId=d4b0-77", relevant: false },
      { text: '08:06:50.140 WARN  [prc-inventory-api] Retrying call to sys-sap-api, attempt 2 corrId=d4b0-77', relevant: true, why: 'The Process API retries too, while the System API retries from the first attempt are still running.' },
      { text: '08:06:50.645 WARN  [exp-mobile-api]   Retrying call to prc-inventory-api, attempt 2 corrId=d4b0-77', relevant: true, why: 'The Experience API also retries: 3 x 3 x 3 = up to 27 SAP calls for one tap.' },
      { text: '08:06:52.004 ERROR [sys-sap-api]      SAP:CONNECTIVITY ... corrId=d4b0-77', relevant: false },
      { text: '08:07:00.000 INFO  [metrics] exp-mobile-api in=40 req/s | sys-sap-api out to SAP=~1,000 calls/s', relevant: true, why: 'Normal incoming traffic, but the backend call rate is ~25x higher: the amplification is visible in the ratio.' },
      { text: '08:07:10.880 ERROR [exp-mobile-api]   MULE:RETRY_EXHAUSTED Retries exhausted ... corrId=d4b0-77', relevant: false },
      { text: '08:07:15.000 INFO  [health] exp-mobile-api GET /health 200', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'With `maxRetries="2"` in three nested layers, what is the worst case number of SAP calls per user request?',
        options: ['27', '6', '9', '8'],
        answer: 0,
        explain: 'maxRetries="2" means **3 attempts**. Nested: 3 x 3 x 3 = 27. At 40 req/s that is up to ~1,080 SAP calls/s.',
      },
      {
        type: 'multi',
        prompt: 'What do you do **immediately**?',
        options: [
          'Turn off retries in exp-mobile-api and prc-inventory-api',
          'Apply rate limiting / spike control on sys-sap-api and lower its concurrency to SAP',
          'Serve stock from a short-lived cache, labelled as indicative, while SAP recovers',
          'Increase maxRetries to 5 so requests eventually succeed',
        ],
        answer: [0, 1, 2],
        explain: 'Remove the multiplier and shield SAP. More retries feed the overload that took SAP down for everyone.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in a **correct retry strategy** for the chain?',
        options: [
          'Retry in one layer only (usually the System API), only for transient errors',
          'Do not retry timeouts by default: they often mean overload and an unknown outcome',
          'Max 1–2 retries with exponential backoff and jitter, within the caller timeout budget, plus a circuit breaker',
          'Same retry count in every layer for consistency',
        ],
        answer: [0, 1, 2],
        explain: 'One deliberate retry point, backoff with jitter, a breaker. Retries in every layer multiply.',
      },
      {
        type: 'order',
        prompt: 'Put the response in order.',
        items: [
          'Notice backend call rate far above incoming request rate',
          'Disable retries in the upper layers',
          'Protect SAP with rate limiting and serve cached stock',
          'Work with SAP basis to clear stuck work processes',
          'Write a C4E retry policy and load-test with a slow SAP',
        ],
        explain: 'Spot the amplification, remove it, shield the backend, recover it, then standardise.',
      },
    ],
  },
  description: `
## Symptoms
- Monday 08:05, SAP response times degrade from ~1 s to ~12 s. Within 10 minutes the SAP gateway hits its **dialog work process limit** and SAP becomes unavailable for **all** users, including the warehouse.
- SAP basis reports roughly **25–30 identical \`BAPI_MATERIAL_AVAILABILITY\` calls per user request** arriving from the Mule system user.
- Incoming traffic at \`exp-mobile-api\` is normal (~40 req/s).

## Change / Context
- Chain: \`exp-mobile-api\` → \`prc-inventory-api\` → \`sys-sap-api\` → SAP.
- After a previous outage, each team independently "added resilience":
  - \`exp-mobile-api\`: \`until-successful maxRetries="2" millisBetweenRetries="500"\` around the call to the Process API.
  - \`prc-inventory-api\`: \`until-successful maxRetries="2" millisBetweenRetries="500"\` around the call to the System API.
  - \`sys-sap-api\`: \`until-successful maxRetries="2" millisBetweenRetries="500"\` around the SAP connector call.
- Each layer uses a 10 s timeout for its downstream call.

## Logs
\`\`\`
08:06:40.112 INFO  [exp-mobile-api]   GET /api/stock?sku=88123 corrId=d4b0-77
08:06:50.130 WARN  [sys-sap-api]      SAP call timed out, retry 1/2 corrId=d4b0-77
08:06:50.131 ERROR [prc-inventory-api] HTTP:TIMEOUT HTTP GET on resource 'https://sys-sap-api.internal/api/materials/88123/availability' failed: Timeout exceeded. corrId=d4b0-77
08:06:50.140 WARN  [prc-inventory-api] Retrying call to sys-sap-api, attempt 2 corrId=d4b0-77
08:06:50.141 ERROR [exp-mobile-api]   HTTP:TIMEOUT HTTP GET on resource 'https://prc-inventory-api.internal/api/stock/88123' failed: Timeout exceeded. corrId=d4b0-77
08:06:50.645 WARN  [exp-mobile-api]   Retrying call to prc-inventory-api, attempt 2 corrId=d4b0-77
08:06:52.004 ERROR [sys-sap-api]      SAP:CONNECTIVITY ... corrId=d4b0-77
08:07:10.880 ERROR [exp-mobile-api]   MULE:RETRY_EXHAUSTED Retries exhausted ... corrId=d4b0-77
\`\`\`

## Your tasks
1. Calculate the worst-case number of SAP calls per user request and explain the amplification.
2. What do you do immediately?
3. What is the root cause?
4. Design a correct retry strategy across the layers.
5. How do you prevent it?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Calculates amplification: 3 attempts × 3 attempts × 3 attempts = 27 SAP calls per user request in the worst case; at 40 req/s that is up to ~1,000 SAP calls/s when SAP is already slow.',
    'Explains the feedback loop: slowness causes timeouts, timeouts cause retries, retries add load, load causes more slowness — retries turn a degradation into an outage.',
    'Also notes the inner retries continue after outer layers have already timed out and retried — wasted work nobody waits for.',
    'Immediate: remove/disable retries in the upper layers (config property or redeploy), shed load with a rate limit/spike control on sys-sap-api, and serve cached stock where acceptable.',
    'Permanent fix: retry in one layer only (usually closest to the failing resource), only for transient and idempotent errors, with capped exponential backoff and jitter, inside the timeout budget; add a circuit breaker and caching for read data.',
    'Prevention: a written retry policy in the C4E standards, retry counts as reviewed configuration, and load/chaos tests with a slow backend.',
  ],
  solution: `
**Diagnosis.** \`until-successful maxRetries="2"\` means **3 attempts**. Three layers nest them:

\`\`\`
exp-mobile-api        3 attempts
  prc-inventory-api     x 3 attempts
    sys-sap-api           x 3 attempts
                          = 27 SAP calls for one tap in the app
\`\`\`

At ~40 req/s the theoretical worst case is ~1,080 SAP calls/s. Worse, the timeouts are equal (10 s each), so the outer layers time out and retry **while inner retries are still running** — work is multiplied and nobody is waiting for most of the results. SAP's dialog work processes fill up, and SAP fails for everyone, including the warehouse, which never used these APIs.

**Immediate mitigation.**
1. Turn off retries in \`exp-mobile-api\` and \`prc-inventory-api\` (if the counts are properties, change and restart; otherwise hotfix deploy).
2. Protect SAP: apply a **rate limiting / spike control** policy on \`sys-sap-api\` in API Manager at a level SAP can handle, and lower the System API's max concurrency to SAP.
3. Serve stock from a short-lived cache (e.g. last known availability, clearly labelled as indicative) while SAP recovers.
4. Coordinate with SAP basis to clear stuck work processes.

**Root cause.** Each team added retries locally with no system-wide view; retries were applied to **timeouts** (where the backend is overloaded, not flaky), with fixed short delays and no load protection. Retries + equal timeouts + no backpressure = amplification.

**Permanent fix — a retry strategy for the chain.**
- **Retry in one place.** Typically the System API, closest to the resource, and only for clearly transient errors (connection reset, 503 with Retry-After). Upper layers do **not** retry; they fail fast and report a clear error.
- **Not on timeouts by default**: a timeout often means "overloaded" — retrying makes it worse, and for writes the outcome is unknown.
- **Backoff with jitter**, max 1–2 retries, all within the caller's timeout budget (inner timeout × attempts + backoff < outer timeout).
- **Circuit breaker** in \`sys-sap-api\` (e.g. failure counter in an Object Store or a reusable module/custom policy): after N failures, stop calling SAP for 30 s and return 503 immediately.
- **Caching** for read-mostly data like availability (Cache scope or Object Store with a short TTL) to reduce SAP calls in normal operation too.
- Idempotency for any write operation that is retried.

**Prevention.** C4E standard: "retries at one layer, documented in the API's Exchange page"; retry/timeout values externalised and reviewed; load tests that make SAP slow (not just down); dashboards comparing incoming request rate to backend call rate — a ratio far above 1 is an early warning.
`,
  followUps: [
    { q: 'Does the Mule HTTP requester retry failed responses by default?', a: 'No. The reconnection strategy on a connector config relates to establishing connections, not to retrying a request that got an error response. Retries of operations come from constructs like until-successful or from the caller.' },
    { q: 'Why is jitter important?', a: 'Without jitter, all clients that failed at the same moment retry at the same moment, creating synchronised waves of load. Random spread smooths the retries out.' },
    { q: 'Where would you retry if the failure is in the Process API itself?', a: 'Usually the client or Experience API decides (e.g. the app shows "try again"), since only it knows whether the user is still waiting. The key rule is one deliberate retry point per failure, not one per layer.' },
  ],
}

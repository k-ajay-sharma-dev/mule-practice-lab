export default {
  id: 'inc-006',
  category: 'incidents',
  title: 'Retry Storm: 429s, Redeliveries and a Growing DLQ',
  level: 'EXPERT',
  tags: ['retries', 'rate-limiting', 'anypoint-mq', 'dlq', 'backpressure'],
  estMinutes: 45,
  investigation: {
    logs: [
      { text: '09:50:12.004 INFO  [crm-sapi] CRM connection pool re-established', relevant: false },
      { text: '09:51:02.114 INFO  [customer-sync] Processing msg id=8c1e... customerId=C-10023 corrId=e71a', relevant: false },
      { text: '09:51:02.130 WARN  [customer-sync] HTTP:TOO_MANY_REQUESTS PUT /customers/C-10023 -> 429 X-Ratelimit-Remaining=0 X-Ratelimit-Reset=420', relevant: true, why: 'The shared 100 req/s limit is exhausted: the CRM is back, but the backlog flood hits the rate limit.' },
      { text: '09:51:02.336 WARN  [customer-sync] HTTP:TOO_MANY_REQUESTS PUT /customers/C-10023 -> 429 corrId=e71a', relevant: true, why: 'Retries every 200 ms without backoff, ignoring the reset header. Each retry uses quota too.' },
      { text: '09:51:03.150 ERROR [customer-sync] MULE:RETRY_EXHAUSTED  until-successful retries exhausted corrId=e71a', relevant: false },
      { text: '09:51:03.152 INFO  [customer-sync] Message nacked id=8c1e... (delivery 3 of 3)', relevant: true, why: 'After 3 deliveries a valid message goes to the DLQ just because it never got a slot.' },
      { text: '09:51:03.171 INFO  [customer-sync] PUT /customers/C-10023 -> 200 corrId=33c9', relevant: true, why: 'Another event for the same customer succeeds while the older one is still being redelivered, so older data can overwrite newer.' },
      { text: '09:51:04.010 INFO  [metrics] replicas=4 inflight=64 queue.depth=176412', relevant: true, why: '4 replicas x 16 concurrent messages, each retrying 5 times, far exceeds 100 req/s.' },
      { text: '09:51:05.200 INFO  [health] GET /health 200 (2 ms)', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why did things get **worse** after the CRM recovered?',
        options: [
          'The backlog flushed with 64 concurrent messages and tight retries, far above the shared 100 req/s limit, so almost every call got 429',
          'The CRM came back with a bug that rejects updates',
          'The rate limiting policy was lowered during maintenance',
          'Anypoint MQ lost messages during the outage',
        ],
        answer: 0,
        explain: 'This is a **retry storm**: demand of hundreds of requests per second against a 100 req/s limit, and retries consume quota themselves. During the outage calls failed fast; after recovery they hit the limit.',
      },
      {
        type: 'single',
        prompt: 'What is the **first** action to restore service for the web shop?',
        options: [
          'Replay the DLQ immediately',
          'Scale customer-sync down to 1 replica with low concurrency (or stop it)',
          'Raise maxRetries to 20 so messages stop reaching the DLQ',
          'Remove the rate limiting policy from crm-sapi',
        ],
        answer: 1,
        explain: 'Stopping the stampede frees the shared quota for interactive users. Replaying the DLQ or adding retries adds load; removing the limit would push the overload onto the CRM.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix**?',
        options: [
          'Throttle consumption below the limit by tuning replicas, concurrency and prefetch',
          'Exponential backoff with jitter that honours Retry-After / X-Ratelimit-Reset, retrying only retryable errors',
          'Separate limits or SLA tiers for the batch sync and the web shop',
          'Event versions or timestamps so crm-sapi rejects older updates',
          'Raise the DLQ threshold to 50 deliveries',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Controlled throughput, polite retries, isolated quotas and version checks address each failure. More deliveries only prolong the storm.',
      },
      {
        type: 'order',
        prompt: 'Put the recovery steps in order.',
        items: [
          'Scale down or stop customer-sync',
          'Confirm the web shop no longer gets 429s',
          'Drain the main queue at a controlled rate (e.g. 50 to 60 req/s)',
          'Replay the DLQ selectively, only events newer than the CRM data',
          'Reconcile customers updated during the incident',
        ],
        explain: 'Protect users first, then drain in a controlled way, and only replay the DLQ once the main queue is empty so stale data is not reintroduced.',
      },
    ],
  },
  description: `
## Symptoms
- \`customer-sync\` consumes *CustomerUpdated* events from Anypoint MQ queue \`customer-updates\` and calls \`crm-sapi\` (\`PUT /customers/{id}\`).
- \`crm-sapi\` had a **40-minute outage** this morning (09:10–09:50) because the CRM was down for maintenance. ~180,000 messages piled up.
- Since the CRM came back at 09:50, things got **worse**, not better: \`crm-sapi\` returns mostly **HTTP 429**, the backlog is not shrinking, and the DLQ \`customer-updates-dlq\` has gone from 0 to **42,000** messages.
- Other consumers of \`crm-sapi\` (the web shop's "update profile") are also getting 429s, so customers can't update their details.
- Some customers in the CRM now show **older** data than before the outage.

## Context
- \`crm-sapi\` has a **Rate Limiting** policy in API Manager: 100 requests per second, shared by all clients.
- \`customer-sync\`: 4 replicas; the MQ subscriber uses default prefetch and up to 16 concurrent messages per replica; acknowledgement mode **AUTO**.
- Each message is processed inside an **Until Successful** scope (\`maxRetries=5\`, \`millisBetweenRetries=200\`).
- Queue \`customer-updates\`: acknowledgement timeout 2 min, DLQ after **3** deliveries.

## Logs (customer-sync, one replica)
\`\`\`
09:51:02.114 INFO  [customer-sync] Processing msg id=8c1e... customerId=C-10023 corrId=e71a
09:51:02.130 WARN  [customer-sync] HTTP:TOO_MANY_REQUESTS PUT /customers/C-10023 -> 429
  X-Ratelimit-Limit=100 X-Ratelimit-Remaining=0 X-Ratelimit-Reset=420 corrId=e71a
09:51:02.336 WARN  [customer-sync] HTTP:TOO_MANY_REQUESTS PUT /customers/C-10023 -> 429 corrId=e71a
09:51:02.540 WARN  [customer-sync] HTTP:TOO_MANY_REQUESTS PUT /customers/C-10023 -> 429 corrId=e71a
...
09:51:03.150 ERROR [customer-sync] MULE:RETRY_EXHAUSTED  'until-successful' retries exhausted corrId=e71a
09:51:03.152 INFO  [customer-sync] Message nacked id=8c1e... (delivery 3 of 3)
09:51:03.160 INFO  [customer-sync] Processing msg id=f02b... customerId=C-10023 corrId=33c9
09:51:03.171 INFO  [customer-sync] PUT /customers/C-10023 -> 200 corrId=33c9
\`\`\`

## Your tasks
1. What is the most likely root cause (explain why it got *worse* after the CRM recovered)?
2. What do you do **right now** to restore service for the web shop and drain the backlog safely?
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
    'Explains the retry storm: 4 replicas × 16 concurrent messages × up to 6 attempts every 200 ms, plus MQ redeliveries, sends far more than 100 req/s. As a result, nearly every call gets 429 and real work never gets through.',
    'Notes that retrying immediately on 429 ignores X-Ratelimit-Reset; retries consume the shared quota, starving the web shop (noisy neighbour on one shared limit).',
    'Explains the DLQ growth (3 failed deliveries → DLQ) and the stale data: messages for the same customer are processed out of order (an older event retried/redelivered later overwrites a newer one).',
    'Immediate: stop or scale down the consumer (e.g. 1 replica, low concurrency) to free the quota for the web shop, then drain at a controlled rate below the limit; replay the DLQ in order only after checking event versions/timestamps.',
    'Permanent fix: throttle consumption to a rate below the limit. Retry with exponential backoff + jitter honouring Retry-After/X-Ratelimit-Reset. Treat 429/5xx as retryable but with limited attempts. Give batch consumers a separate SLA tier from interactive clients.',
    'Adds ordering/version protection (e.g. compare event timestamp/version before updating, or FIFO per customer) and monitoring/alerts on queue depth, DLQ size and 429 rate; considers a circuit breaker to pause consumption while the target is unavailable.',
  ],
  solution: `
**Diagnosis.** During the outage 180k messages accumulated. When the CRM recovered, \`customer-sync\` went at it with **4 replicas × 16 concurrent messages = 64 in flight**, each retrying **5 more times every 200 ms**. Every failure also returns the message to the queue for redelivery (up to 3 deliveries). Demand jumps to many hundreds of requests per second against a **shared 100 req/s** limit, so almost every call — including the retries — gets **429**. Retries themselves use up quota, so useful throughput collapses. This is a **retry storm**: the system is busy failing.

- **Why worse after recovery**: during the outage requests failed fast (connection errors); after recovery they hit the rate limit and the backlog flood started.
- **Web shop impact**: the rate limit is shared, so the sync job's retries starve interactive users.
- **DLQ growth**: after 3 deliveries a message goes to the DLQ, even though it's perfectly valid — it just never got a slot.
- **Stale data**: events for the same customer are processed in parallel and redelivered later, so an **older** update can be applied **after** a newer one (see C-10023: msg \`f02b\` succeeded while \`8c1e\` was still being retried/redelivered).

**Immediate mitigation.**
1. **Stop the stampede**: scale \`customer-sync\` to 1 replica with low concurrency (or stop it) — the web shop's 429s should stop within the reset window.
2. Temporarily give the web shop priority: e.g. an SLA tier/client-specific limit for the interactive client, if available.
3. **Drain at a controlled rate** (e.g. 50–60 req/s) and watch 429s and latency.
4. Replay the **DLQ** only after the main queue is drained, and only if each event is newer than what the CRM has (compare an event timestamp/version), to avoid reintroducing stale data. Run a reconciliation for customers updated during the incident.

**Root cause.** Consumer concurrency and retry policy were sized for normal traffic, with no backoff, no awareness of 429/\`X-Ratelimit-Reset\`, and no ordering protection. One shared rate limit lets a batch consumer starve interactive users.

**Permanent fix.**
- **Throttle consumption** below the limit: tune concurrency/prefetch and replicas so max throughput is known (e.g. ≤ 60 req/s), or use a rate-limiting step in the consumer.
- **Retries**: exponential backoff with **jitter**, honour \`Retry-After\`/\`X-Ratelimit-Reset\`; retry only retryable errors (429, 503, timeouts); keep total attempts modest. Prefer letting the **message go back to the queue** (NACK, which has no delay parameter, or no ack until the acknowledgement timeout) over tight in-process loops.
- **Circuit breaker**: when the CRM is failing, pause the subscriber (stop the flow/source) for a while instead of hammering it.
- **Separate limits**: different SLA tiers or client-based limits for the batch sync and the web shop.
- **Ordering/versioning**: include a version/timestamp in each event; \`crm-sapi\` rejects updates older than what it has. Or use a FIFO queue / partition by customer ID if ordering is required.
- DLQ handling: an alert, a documented replay procedure, and a tool to replay selectively.

**Prevention.** Hold design reviews that check "what happens when the backlog flushes?". Run load tests that simulate recovery after an outage. Add dashboards/alerts on queue depth, message age, DLQ count and 429 rate per client. Keep runbooks for throttling consumers during incidents.
`,
}

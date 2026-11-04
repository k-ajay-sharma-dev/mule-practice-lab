export default {
  id: 'inc-044',
  category: 'incidents',
  title: 'Customer 360 Returns Incomplete Profiles When One Backend Is Slow',
  level: 'EXPERT',
  tags: ['scatter-gather', 'timeouts', 'error-handling', 'partial-results', 'resilience'],
  estMinutes: 40,
  investigation: {
    logs: [
      { text: '11:02:08.201 INFO  [customer360-papi] routes: crm=180 ms loyalty=240 ms support=310 ms orders=pending corrId=a7e2', relevant: false },
      { text: '11:02:13.208 ERROR [customer360-papi] MULE:COMPOSITE_ROUTING Exception(s) were found for route(s): 1: MULE:TIMEOUT / HTTP:TIMEOUT ...', relevant: true, why: 'Thursday: one slow route (Orders) fails the whole Scatter-Gather even though three backends answered.' },
      { text: '11:02:13.209 ERROR [customer360-papi] Returning 500 corrId=a7e2', relevant: true, why: 'The unhandled composite routing error becomes a 500 for the call-centre UI.' },
      { text: '[orders-sapi] p95 latency 3.1-8.9 s since DB migration (Wed 22:00)', relevant: true, why: 'The trigger: Orders SAPI slowed down after its DB migration, beyond the 5 s router timeout.' },
      { text: '11:20:46.900 INFO  [customer360-papi] GET /customers/C-1182/profile corrId=b311', relevant: false },
      { text: '11:20:47.110 WARN  [customer360-papi] route orders failed: HTTP:TIMEOUT -> continuing with {} corrId=b311', relevant: true, why: "Friday's fix swallows the failure and returns {}, which looks exactly like 'no orders'." },
      { text: '11:20:47.112 INFO  [customer360-papi] Returning 200 corrId=b311', relevant: true, why: 'A 200 with silently missing sections: the agent cannot tell the data is incomplete.' },
      { text: '11:21:00.000 INFO  [health] GET /health 200 (2 ms)', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why is the behaviour after Friday **worse** than the 500s?',
        options: [
          'Missing sections return {} with 200, indistinguishable from "customer has no orders", so agents give customers wrong information',
          'It increases latency for every request',
          'on-error-continue leaks memory',
          'It hides the 500s from monitoring, but the data is still correct',
        ],
        answer: 0,
        explain: 'Silent wrong data is worse than an error for a call-centre use case: the consumer cannot recognise the response as partial.',
      },
      {
        type: 'single',
        prompt: 'What do you ship **right now**?',
        options: [
          'Revert to Thursday behaviour so every timeout returns 500',
          'Mark failed routes explicitly (e.g. orders: { status: "UNAVAILABLE" }) so the UI shows "temporarily unavailable", and engage the Orders team on the slowdown',
          'Raise the Scatter-Gather timeout to 60 s',
          'Remove the Orders route from the profile',
        ],
        answer: 1,
        explain: 'Make partial data visible and fix the trigger. A 60 s timeout would exceed the client timeout and hold threads.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent design**?',
        options: [
          'Decide per section: mandatory (CRM, fail if missing) vs optional (Orders, Loyalty, Support, degrade)',
          'Per-route timeouts < router timeout < client timeout',
          'Response contract with section status and a top-level complete flag; cached values labelled with asOf',
          'on-error-continue returning {} in every route so the API never fails',
        ],
        answer: [0, 1, 2],
        explain: 'An explicit partial-failure contract. Returning empty data that looks valid is exactly the bug to avoid.',
      },
      {
        type: 'order',
        prompt: 'Put the response in order.',
        items: [
          'Confirm Orders route timeouts in Thursday and Friday logs',
          'Ship explicit UNAVAILABLE markers instead of {}',
          'Engage the Orders team on the post-migration latency',
          'Implement section status contract and aligned timeouts',
          'Add a degraded-response metric per backend with alerts',
        ],
        explain: 'Diagnose, stop the wrong data, fix the trigger, then the design and observability.',
      },
    ],
  },
  description: `
## Symptoms
- \`customer360-papi\` aggregates a profile from **CRM**, **Orders**, **Loyalty** and **Support tickets** using a Scatter-Gather.
- Since Thursday, during peaks, ~8% of requests return **500**, and the call-centre UI shows a generic error.
- Worse: a fix attempted on Friday made the 500s disappear, but now agents see profiles **without orders and without loyalty points** and nobody can tell — a customer was told they had no recent orders and complained.

## Change / Context
- Scatter-Gather \`timeout="5000"\` was set on the router. Orders SAPI slowed to 3–9 s at peak after a DB migration.
- Friday's "fix": each route wrapped in Try with **on-error-continue** returning \`{}\`, so the Scatter-Gather never fails.
- The DataWeave after the Scatter-Gather does \`payload["1"].payload default {}\` for each route and merges the results.

## Logs
\`\`\`
# Thursday
11:02:13.208 ERROR [customer360-papi] MULE:COMPOSITE_ROUTING Exception(s) were found for route(s): 1: MULE:TIMEOUT / HTTP:TIMEOUT ...
11:02:13.209 ERROR [customer360-papi] Returning 500 corrId=a7e2
# Friday onwards
11:20:47.110 WARN  [customer360-papi] route orders failed: HTTP:TIMEOUT -> continuing with {} corrId=b311
11:20:47.112 INFO  [customer360-papi] Returning 200 corrId=b311
\`\`\`

## Your tasks
1. Explain both behaviours (Thursday and after Friday).
2. What do you do right now?
3. Design the correct behaviour for partial failures.
4. How do you make this observable and prevent recurrence?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Scatter-Gather fails with MULE:COMPOSITE_ROUTING if any route fails or times out, so one slow backend fails the whole aggregate (Thursday).',
    'Swallowing errors with on-error-continue returning {} turns failures into silently wrong data — worse than an error for a call-centre use case.',
    'Correct design: per-route timeouts and fallbacks, but explicit partial-response metadata (e.g. sections with status / "unavailable"), and a decision which sections are mandatory.',
    'Use error.errorMessage / per-route results to build the response; consider cached last-known values for non-critical sections, clearly labelled.',
    'Address the actual slowness (Orders DB after migration) and align timeouts: per-route < router timeout < client timeout.',
    'Observability: metric for degraded responses per backend, logs with route-level timings, and alerts.',
  ],
  solution: `
## Diagnosis
**Thursday:** Scatter-Gather waits for all routes. When Orders exceeds the timeout, that route fails and the router throws **MULE:COMPOSITE_ROUTING** (it contains successful results and the failures). Without handling, the whole request returns 500 even though three of four backends answered.

**Friday onwards:** every route now swallows errors and returns \`{}\`. The aggregate always "succeeds", but missing data is indistinguishable from "customer has no orders". This is **silent data corruption at the presentation layer** — the call-centre agent gave a customer wrong information.

## Immediate mitigation
- Ship a quick change so failed routes are **marked**, e.g. \`orders: { status: "UNAVAILABLE" }\` instead of \`{}\`, and let the UI show "Orders temporarily unavailable".
- Engage the Orders team about the post-migration slowness (likely missing indexes/statistics).
- Raise the per-route timeout for Orders a little only if it still fits within the client's timeout.

## Root cause
No partial-failure contract: the aggregator either failed completely or hid failures. Underlying trigger: Orders SAPI latency regression after its DB migration.

## Permanent fix
- Define per section whether it is **mandatory** (CRM: fail if missing) or **optional** (Orders, Loyalty, Support: degrade).
- Per-route HTTP timeouts (e.g. 2–3 s) inside a router timeout slightly larger, all below the client timeout.
- Response contract with section status, e.g. \`{ customer: {...}, orders: { status: "OK", items: [...] }, loyalty: { status: "UNAVAILABLE", reason: "TIMEOUT" } }\` plus a top-level \`complete: false\`.
- Optionally serve cached last-known values for optional sections, labelled with \`asOf\`.
- Alternatively handle MULE:COMPOSITE_ROUTING in an error handler and build the response from its successful results and failures, rather than swallowing errors per route.

## Prevention
- Metric/alert for degraded responses by backend (e.g. % of responses with orders UNAVAILABLE).
- Log per-route latency with correlation ID.
- Review rule: on-error-continue must never return data that looks valid but is empty.
`,
  followUps: [
    { q: 'What does MULE:COMPOSITE_ROUTING contain?', a: 'The results of routes that succeeded and the errors of routes that failed, so an error handler can inspect both and build a partial response.' },
    { q: 'When is failing the whole request better than a partial response?', a: 'When the missing piece is essential to correctness (e.g. the customer identity, or a payment decision); partial data is only OK if consumers can recognise it as partial.' },
    { q: 'Does Scatter-Gather run routes in parallel threads?', a: 'Yes, routes run concurrently, so total latency is roughly that of the slowest route (bounded by the timeout), not the sum.' },
  ],
}

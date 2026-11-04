export default {
  id: 'inc-001',
  category: 'incidents',
  title: 'Orders API Returns 504 After a Release',
  level: 'INTERMEDIATE',
  tags: ['timeouts', 'http', 'threads', 'production'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '09:00:12.004 INFO  [deploy] orders-process-api v2.4.0 started on 2 workers', relevant: true, why: 'The problems start right after this release, so the change in it is the first suspect.' },
      { text: '09:21:04.118 INFO  [orders] Fetching order 88123 corrId=7f2c', relevant: false },
      { text: '09:21:04.402 INFO  [orders] Calling loyalty-sapi /points/C-4410 corrId=7f2c', relevant: true, why: 'The new synchronous call to the Loyalty System API, added in v2.4.0.' },
      { text: '09:21:05.010 INFO  [orders] Fetching order 88124 corrId=a91d', relevant: false },
      { text: '09:21:30.950 INFO  [health] GET /health 200 (4 ms)', relevant: false },
      { text: '09:22:04.405 ERROR [orders] HTTP:TIMEOUT  Timeout exceeded (60000 ms) corrId=7f2c', relevant: true, why: 'The loyalty call waits the full 60 s. The load balancer gives up earlier, so the client already received a 504.' },
      { text: '09:22:05.120 INFO  [metrics] cpu=14% heap=41% threads.waiting=187', relevant: true, why: 'Low CPU with many waiting threads means requests are blocked on I/O, not busy computing.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the most likely root cause of the 504s?',
        options: [
          'The new Loyalty System API call is slow and hangs until its 60 s timeout, longer than the load balancer waits',
          'Workers are out of CPU because of the new DataWeave mapping',
          'The /orders endpoint was removed from the RAML in v2.4.0',
          'A memory leak introduced in v2.4.0',
        ],
        answer: 0,
        explain: 'Only endpoints that call Loyalty fail, CPU and memory are normal, and the log shows a 60 s HTTP:TIMEOUT on the loyalty call. The load balancer times out first, so clients see **504**.',
      },
      {
        type: 'single',
        prompt: 'What do you do **right now** to restore service?',
        options: [
          'Raise the HTTP Request timeout to 120 s',
          'Roll back to v2.3.x, or switch the loyalty call off with a feature flag',
          'Add two more workers',
          'Restart the application',
        ],
        answer: 1,
        explain: 'Remove the failing dependency from the request path first. More workers or a restart do not fix a dependency that hangs, and a longer timeout makes it worse.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix**?',
        options: [
          'An explicit response timeout on the loyalty call, well below the load balancer timeout',
          'A Try scope with a fallback that returns the order without points',
          'Calling Loyalty in parallel with the order lookup, and caching points briefly',
          'Raising the load balancer timeout to 5 minutes',
        ],
        answer: [0, 1, 2],
        explain: 'Bound the wait, degrade gracefully and take the call off the critical path. Raising the load balancer timeout only hides the problem and keeps threads blocked longer.',
      },
      {
        type: 'order',
        prompt: 'Put the incident response in order.',
        items: [
          'Correlate the 504s with the 09:00 release and the endpoints affected',
          'Roll back or turn the loyalty feature off',
          'Confirm the 504 rate is back to normal',
          'Add timeout and fallback to the loyalty call and load-test it',
          'Redeploy and add latency and 5xx alerts per endpoint',
        ],
        explain: 'Diagnose, restore service, verify, then fix properly and add monitoring so the next slow dependency is caught early.',
      },
    ],
  },
  description: `
## Symptoms
- Release **v2.4.0** of \`orders-process-api\` went live at 09:00.
- From ~09:20, clients get **HTTP 504** from the load balancer for \`GET /orders/{id}\`.
- CPU on the workers is low (~15%). Memory is normal.
- Other endpoints on the same app (\`/health\`) respond fine.

## Change in the release
> "Added customer loyalty points to the order response by calling the Loyalty System API."

The new HTTP Request operation for Loyalty was copied from a batch integration and has \`responseTimeout="60000"\`.

## Logs (worker 1)
\`\`\`
09:21:04.118 INFO  [orders] Fetching order 88123 corrId=7f2c
09:21:04.402 INFO  [orders] Calling loyalty-sapi /points/C-4410 corrId=7f2c
09:22:04.405 ERROR [orders] HTTP:TIMEOUT  Timeout exceeded (60000 ms) corrId=7f2c
09:21:05.010 INFO  [orders] Fetching order 88124 corrId=a91d
09:21:05.311 INFO  [orders] Calling loyalty-sapi /points/C-0091 corrId=a91d
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do **right now** to restore service?
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
    'New synchronous dependency (Loyalty SAPI) is slow/unavailable; calls hang until the 60 s timeout.',
    'Load balancer timeout (< 60 s) fires first, so clients see 504 while the app still waits.',
    'Low CPU + waiting threads points to I/O blocking, not compute.',
    'Immediate: roll back to v2.3.x or disable the loyalty call via a feature flag.',
    'Fix: short timeout on the loyalty call, fallback (omit points), optionally cache or call in parallel.',
    'Prevention: timeouts below LB timeout for every outbound call, load test new dependencies, alerts on latency.',
  ],
  solution: `
**Diagnosis.** Each \`/orders\` request now makes a synchronous call to the Loyalty SAPI. Those calls hang until the **60 s HTTP Request timeout**. The load balancer gives up sooner (commonly 30–60 s), so clients get **504** while the app is still waiting. CPU is low because threads are *blocked on I/O*, not working. \`/health\` is fine because it doesn't call Loyalty.

**Immediate mitigation.** Roll back to the previous version (or toggle the loyalty feature off via a property/feature flag) and confirm 504s stop. Check Loyalty SAPI health with its team.

**Permanent fix.**
- Set an explicit **response timeout** on the loyalty request (e.g. 2–3 s), well below the LB timeout.
- Wrap it in **Try** with a **fallback**: return the order without points (\`loyaltyPoints: null\`) when it fails.
- Consider calling it in parallel with the order fetch (Scatter-Gather) and caching points briefly.

**Prevention.** Standard: every outbound call has a timeout and fallback; app timeouts < LB timeout; performance-test new dependencies before release; alert on p95 latency and 5xx rate per endpoint.
`,
}

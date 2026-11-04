export default {
  id: 'ms-044',
  category: 'mulesoft',
  title: 'Performance Tuning a Slow Mule API: A Systematic Checklist',
  level: 'EXPERT',
  tags: ['performance', 'tuning', 'dataweave', 'load-testing', 'troubleshooting'],
  estMinutes: 35,
  quiz: [
    {
      type: 'single',
      prompt: 'CPU is at 35–45 % while throughput plateaus at 60 req/s and p95 is 3.8 s. What does this point to?',
      options: [
        'The replicas need more vCores',
        'Threads are mostly waiting — on six sequential remote calls and per-request DB loads — not lack of compute',
        'The Pricing API is the only problem',
        'DataWeave is CPU-bound',
      ],
      answer: 1,
      explain: 'Low CPU with high latency means waiting. Six sequential calls alone are 6 × 180 ms ≈ 1.1 s, and as the backend slows under peak load those waits turn into HTTP:TIMEOUT.',
    },
    {
      type: 'order',
      prompt: 'Put the performance method in order.',
      items: [
        'Define the target and a repeatable, realistic load test',
        'Instrument: per-flow and outbound metrics, step timings, GC, thread dumps at peak',
        'Fix the biggest contributor — one change at a time',
        'Re-run the same load test and compare p50/p95/p99, throughput and errors',
      ],
      explain: 'Measure first and change one thing at a time; otherwise you cannot tell which fix helped.',
    },
    {
      type: 'match',
      prompt: 'Match each finding to its fix.',
      pairs: [
        ['5,000 products loaded from the DB per request; data changes daily', 'Cache with a daily TTL or refresh'],
        ['`products filter ($.id == item.productId)` inside `map`', 'Index once with `groupBy $.id`, then look up by key'],
        ['6 sequential pricing calls', 'Parallelise with bounded concurrency, or use a batch endpoint'],
        ['Full payload logged at INFO four times', 'Log IDs and sizes at INFO, payloads only at DEBUG'],
      ],
      explain: 'Remove avoidable work first: caching, O(n×m) → O(n) lookups, parallel waits, and less logging I/O and GC.',
    },
    {
      type: 'single',
      prompt: 'Why can parallelising the pricing calls make things **worse** if done carelessly?',
      options: [
        'Parallel calls are always slower in Mule',
        'Without a concurrency limit it multiplies load on the backend and connection pools, causing throttling, pool exhaustion and higher tail latency',
        'Scatter-Gather loses responses',
        'It disables HTTP keep-alive',
      ],
      answer: 1,
      explain: 'Use `maxConcurrency`, size the connection pool for the concurrency, and agree rate limits with the Pricing team.',
    },
    {
      type: 'single',
      prompt: 'Management suggests going from 2 to 6 replicas right now. What is the best answer?',
      options: [
        'Yes — scaling always fixes latency',
        'Not yet — scaling a design bottleneck mostly doubles cost and backend/DB load; make per-request work lean first, then scale when CPU is the limit',
        'Yes, but only with bigger vCores',
        'No — CloudHub 2.0 cannot scale beyond 2 replicas',
      ],
      answer: 1,
      explain: 'Once the app is efficient and CPU becomes the limit, adding replicas (also better availability) or larger vCores is the right move.',
    },
    {
      type: 'multi',
      prompt: 'How do you validate the result and prevent regressions?',
      options: [
        'Re-run the same load test after each change',
        'Add a smaller-scale performance test stage to CI or pre-release',
        'Alert on p95 and error rate in production',
        'Rely on unit-test coverage percentage',
      ],
      answer: [0, 1, 2],
      explain: 'Coverage says nothing about latency; repeatable load tests and production alerts do.',
    },
  ],
  description: `
A **Quote Process API** on CloudHub 2.0 (2 replicas, 1 vCore each) must handle **150 req/s at p95 < 800 ms**. A load test shows:

| Metric | Value |
|---|---|
| Throughput | plateaus at ~60 req/s |
| p95 latency | 3.8 s |
| CPU | 35–45 % |
| Heap | saw-tooth, frequent GC, occasional long pauses |
| Backend Pricing API p95 | 180 ms (measured directly) |
| Errors | some \`HTTP:TIMEOUT\` at peak |

Findings from a quick code read:
- The HTTP Request config to Pricing uses defaults; each quote makes **6 sequential** pricing calls.
- A Transform does \`payload.items map (item) -> { ..., product: products filter ($.id == item.productId) }\` with 5,000 products loaded from a DB per request.
- A Logger logs the **full payload at INFO** at four points.
- Product reference data changes once a day.

**Questions**
1. Describe your **method** before touching code (what you measure and how).
2. Interpret the metrics: why is CPU low but latency high?
3. List concrete fixes in priority order with the expected effect.
4. How do you validate the result and prevent regressions?
5. When is scaling (more replicas / bigger vCores) the right answer?
`,
  answerTemplate: `## Method

## Interpreting the metrics

## Fixes in priority order

## Validation and regression prevention

## When to scale
`,
  keyPoints: [
    'Measure first: reproduce with a realistic load test, break down latency per step (monitoring, logs with timings, thread dumps), change one thing at a time.',
    'Low CPU with high latency points to waiting — connection pool limits, sequential remote calls, blocking — not to lack of compute.',
    'Remove avoidable work: cache slow-changing reference data, parallelise independent calls with bounded concurrency, replace O(n×m) lookups with indexed maps.',
    'Logging full payloads, unnecessary serialisation and loading large data per request create GC pressure and latency.',
    'Scale horizontally only after the app is efficient; scaling a design bottleneck mostly moves the load to the backend.',
  ],
  solution: `
**Method**
1. Define the target (150 req/s, p95 < 800 ms) and a repeatable load test with realistic payloads and data volumes.
2. Instrument: Anypoint Monitoring / metrics for response time per flow and per outbound call, log timings at step boundaries (with correlation IDs), heap/GC metrics, and **thread dumps** at peak to see where threads wait.
3. Find the biggest contributor, fix one thing, re-test. Keep a results table.

**Interpretation:** CPU at 40 % while throughput plateaus means threads are mostly **waiting**: on six sequential calls (6 × 180 ms ≈ 1.1 s minimum — and as the Pricing backend slows at peak, those waits become \`HTTP:TIMEOUT\`), and on the per-request DB load. (The Mule 4 HTTP Request connection's max connections is unlimited by default, so the defaults do not cap the pool — but they also do not protect the backend, and the response timeout may not suit the target.) GC pressure comes from loading 5,000 products and logging full payloads on every request.

**Fixes in priority order**
| # | Fix | Effect |
|---|---|---|
| 1 | **Cache product reference data** (Cache scope or Object Store with daily TTL / refresh job) | removes a DB query + large allocation per request |
| 2 | **Index lookups**: \`var byId = products groupBy $.id\` then \`byId[item.productId][0]\` | O(n×m) → O(n); big CPU/GC saving |
| 3 | **Parallelise the 6 pricing calls** (Scatter-Gather or Parallel For Each with \`maxConcurrency\`) — or ask for a batch pricing endpoint | ~1.1 s → ~200–300 ms |
| 4 | **Tune the HTTP Request connection settings** (an explicit max connections sized for concurrency × calls and agreed with the backend — the default is unlimited), sensible response timeouts, keep-alive | predictable backend load, fewer timeouts |
| 5 | **Logging**: log IDs and sizes at INFO, full payloads only at DEBUG; async loggers | less I/O and GC |
| 6 | Streaming strategy & memory: avoid materialising large payloads repeatedly; check repeatable stream buffer sizes | fewer GC pauses |
| 7 | Review flow \`maxConcurrency\` and backend limits so you don't overload Pricing (agree on rate limits) | stable latency at peak |

**Validation:** re-run the same load test after each change; compare p50/p95/p99, throughput, error rate, GC. Add a performance test stage (smaller scale) to CI or a pre-release environment, and alerts on p95 and error rate in production.

**When to scale:** once per-request work is lean and CPU becomes the limit at target load, add replicas (horizontal, also improves availability) or larger vCores (more CPU/memory per replica, useful for memory-heavy transforms). Scaling first would have doubled cost and doubled DB/pricing load without fixing the sequential waits.
`,
  followUps: [
    {
      q: 'How do you find which processor is slow without an APM tool?',
      a: 'Log timestamps (or use now() deltas) at step boundaries with the correlation ID, use Anypoint Monitoring outbound call metrics, and take thread dumps under load to see where threads are blocked.',
    },
    {
      q: 'Why can making calls parallel make things worse?',
      a: 'It multiplies concurrent load on the backend and on connection pools; without a concurrency limit you can trigger backend throttling or pool exhaustion and increase tail latency.',
    },
    {
      q: 'Does a bigger vCore help a DataWeave-heavy app?',
      a: 'Often yes, because more memory reduces GC pressure and more CPU speeds up transforms — but fix algorithmic issues first, since O(n×m) code will still dominate.',
    },
  ],
}

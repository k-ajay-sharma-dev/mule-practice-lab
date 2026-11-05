export default {
  id: 'ar-018',
  category: 'architecture',
  title: 'Capacity Planning and Sizing from TPS and Latency',
  level: 'ADVANCED',
  tags: ['capacity-planning', 'sizing', 'vcores', 'performance'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'At 600 rps, 80% of calls take ~0.15 s and 20% take ~1.1 s. Using Little\'s law, about how many requests are in flight?',
      options: ['About 34', 'About 90', 'About 200', 'About 660'],
      answer: 2,
      explain: 'Weighted latency ≈ 0.8 × 0.15 + 0.2 × 1.1 ≈ 0.34 s; concurrency = throughput × latency = 600 × 0.34 ≈ 200.',
    },
    {
      type: 'single',
      prompt: 'Load tests show one 1-vCore replica sustains ~150 rps for this mix. How do you size for 600 rps?',
      options: [
        'Exactly 4 replicas — 600 / 150',
        '4 replicas plus headroom for a replica/AZ failure and burst, e.g. about 6 × 1 vCore at peak',
        'One 4-vCore replica',
        '2 replicas, because Mule is non-blocking',
      ],
      answer: 1,
      explain: 'Measure per-replica capacity, divide, then add headroom for failure and burst. Several replicas also give HA; one big replica is a single point of failure.',
    },
    {
      type: 'single',
      prompt: 'What is the real bottleneck at 600 rps?',
      options: [
        'Mule CPU',
        'The inventory database, limited to 400 queries/s',
        'The 8 KB response size',
        'The payment hold API latency',
      ],
      answer: 1,
      explain: '600 rps × 1 inventory query = 600 qps, above the DB\'s 400 qps. Adding Mule replicas would only overload the DB faster.',
    },
    {
      type: 'multi',
      prompt: 'Which measures protect the inventory database?',
      options: [
        'Cache availability for a few seconds in the Process API',
        'Request collapsing for many users asking about the same event',
        'Spike Control / Rate Limiting on the System API below 400 qps, returning 429 with Retry-After',
        'A virtual waiting room at the edge for on-sale peaks',
        'Adding more Mule replicas of the Process API',
      ],
      answer: [0, 1, 2, 3],
      explain: 'All four reduce or shape the load that reaches the DB. More replicas increase the load on the DB instead.',
    },
    {
      type: 'single',
      prompt: 'The on-sale starts at 10:00 and traffic jumps within a minute. How do you handle "possibly more than 600 rps"?',
      options: [
        'Rely only on autoscaling to react to CPU',
        'Pre-scale before the known on-sale time, keep gateway limits as a safety valve, and define degraded modes',
        'Do nothing; Mule queues requests forever',
        'Disable rate limiting so no customer is rejected',
      ],
      answer: 1,
      explain: 'Scaling takes time; for a spike in the first minutes you must already have the capacity. Limits make overload degrade gracefully instead of timing out.',
    },
    {
      type: 'multi',
      prompt: 'What should the load test measure to validate the estimate?',
      options: [
        'CPU and heap per replica',
        'p95/p99 latency and error rate',
        'Backend latency under load',
        'A realistic mix, ramping to about 1.5× forecast, plus a soak test',
        'Only the average response time of a single request',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Averages hide tail latency. Production-like mix and ramp-up give the per-replica capacity figure you defend to finance.',
    },
  ],
  description: `
A ticketing company is launching a **Ticket Availability & Reservation** Process API on CloudHub 2.0 for a major concert season.

Known numbers:
- Normal load: **40 requests/s**. On-sale events (first 15 minutes): forecast **600 requests/s**, possibly more.
- Each request calls the **Inventory System API** (p95 120 ms) and, for reservations (~20% of calls), the **Payment hold** API (p95 900 ms).
- Average response payload 8 KB; reservation requests do a DataWeave transformation of ~50 KB.
- The inventory database behind the System API handles **at most 400 queries/s** without degrading.
- The licence includes a fixed number of vCores; finance asks "how many do you need and why?"

**Questions:**
- How do you estimate concurrency and the number/size of replicas? Show the calculation.
- What will be the real bottleneck, and how do you protect it?
- How do you validate the estimate before the on-sale day?
- How do you handle "possibly more than 600 rps"?
`,
  answerTemplate: `## Workload model and concurrency

## Replica sizing (first estimate)

## Bottlenecks and protection

## Validation (load testing)

## Handling more than forecast
`,
  keyPoints: [
    'Concurrency is estimated with Little\'s law: in-flight requests ≈ throughput × latency (e.g. 600 rps × ~0.34 s weighted average ≈ 200 concurrent requests).',
    'Sizing is an estimate to be confirmed by load tests: start with several smaller replicas (horizontal scaling, ≥ 2 for HA) and target ~60–70% CPU at peak to keep headroom.',
    'The inventory DB (400 qps) is the real bottleneck at 600 rps, so it needs caching/read model, request collapsing or a queue/waiting-room — adding Mule replicas would make it worse.',
    'Rate limiting / spike control at the gateway protects backends and returns 429 with Retry-After instead of letting latency explode.',
    'Load tests run with realistic data and backends (or calibrated mocks) and measure p95 latency, CPU, memory, and error rate per replica to derive throughput per vCore.',
    'Non-blocking I/O and streaming in Mule 4 keep threads free while waiting on slow calls; payload size drives memory sizing more than request count.',
  ],
  solution: `
**Workload model.** At 600 rps: 80% availability checks (~120 ms inventory + ~30 ms Mule overhead ≈ 150 ms) and 20% reservations (inventory + payment hold ≈ 1.05 s + overhead ≈ 1.1 s).
Weighted latency ≈ 0.8 × 0.15 + 0.2 × 1.1 ≈ **0.34 s**.
**Little's law:** concurrency = 600 × 0.34 ≈ **~200 requests in flight** at peak.

**Replica sizing.** Mule 4's HTTP requester is non-blocking, so waiting on the payment API doesn't hold a CPU thread; CPU is mostly spent on HTTP handling, security policies, and DataWeave. Approach:
1. Load test one replica of a candidate size (e.g. 1 vCore) to find the throughput at which p95 rises or CPU passes ~70% — say it sustains ~150 rps for this mix.
2. Peak 600 rps / 150 ≈ 4 replicas → add headroom (+1 for a replica failure / AZ loss, +30%) → **6 × 1 vCore**, normal load on 2 replicas.
3. Memory: 200 concurrent × (50 KB payload × several copies during transformation) is a few tens of MB — fine; payload size, not count, drives memory. Large payloads would need streaming.
The numbers are illustrative; the *method* (measure per-replica capacity, divide, add headroom for failure and burst) is what you defend to finance.

**The real bottleneck.** 600 rps × 1 inventory query = 600 qps > the DB's **400 qps**. More Mule replicas would just overload the DB faster. Protect it:
- **Cache availability** in the Process API for a few seconds (availability for a section doesn't need to be millisecond-exact; reservations check authoritatively).
- **Request collapsing** — many users asking for the same event → one backend query.
- **Spike Control / Rate Limiting** on the System API at ≤ 380 qps so it degrades gracefully (429 + Retry-After) rather than timing out.
- For on-sale peaks, a **virtual waiting room/queue** at the edge is the standard business answer.

**Validation.** Load test (JMeter/Gatling/k6) in a production-like environment with realistic mix, ramp-up to 1.5× forecast, and a soak test. Measure per replica: CPU, heap, p95/p99, errors, backend latency. Use the result to correct the per-replica capacity figure.

**More than forecast.** Pre-scale before the known on-sale time (scheduled scaling via pipeline/CLI), keep gateway limits as a safety valve, and define degraded modes (e.g. disable non-essential features). Horizontal autoscaling can help for gradual growth if your subscription supports it, but scaling takes time — for a spike in the first minutes, **pre-scale**.
`,
  followUps: [
    { q: 'Why several smaller replicas rather than one big one?', a: 'Several replicas give high availability across zones and allow rolling updates; a single large replica is a single point of failure. Very small replicas, however, have less CPU per request and can show poor performance under DataWeave-heavy load, so measure.' },
    { q: 'Finance says vCores are expensive — can you scale down after the on-sale?', a: 'Yes: pre-scale before the event and scale back to the normal baseline afterwards through the pipeline or Runtime Manager. You pay for peak capacity only during the peak window, within the licence model\'s rules.' },
    { q: 'What if the payment hold API slows from 0.9 s to 5 s?', a: 'Concurrency rises roughly fivefold for that share of traffic (Little\'s law). Set tight timeouts, a circuit breaker and a max-concurrency limit on that call so a slow dependency cannot exhaust the app.' },
  ],
}

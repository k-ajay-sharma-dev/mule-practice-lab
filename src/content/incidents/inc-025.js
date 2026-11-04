export default {
  id: 'inc-025',
  category: 'incidents',
  title: 'Flash Sale: 503s From Back-Pressure While CPU Sits Idle',
  level: 'EXPERT',
  tags: ['back-pressure', 'threads', 'concurrency', 'capacity-planning', 'performance-tuning'],
  estMinutes: 45,
  investigation: {
    logs: [
      { text: '12:00:14.221 INFO  [cart-papi] POST /cart/items corrId=e02a -> inventory-sapi', relevant: false },
      { text: '12:00:18.302 INFO  [cart-papi] inventory-sapi responded 200 in 4,081 ms corrId=e02a', relevant: true, why: 'The dependency now takes about 4 s instead of 200 ms, so each request holds a concurrency slot 20 times longer.' },
      { text: '12:00:18.400 INFO  [metrics] worker-0 rps=40 inflight=50/50 cpu=19%', relevant: true, why: '40 req/s x 4 s needs about 160 in flight, but maxConcurrency caps it at 50; CPU is idle because threads wait on I/O.' },
      { text: '12:00:18.611 WARN  [cart-papi] MULE:FLOW_BACK_PRESSURE Flow post:\\cart\\items:api-config is unable to accept new events at this time', relevant: true, why: 'The flow is full, so Mule applies back-pressure and the listener answers 503.' },
      { text: '12:00:18.612 WARN  [cart-papi] Responding 503 Service Unavailable', relevant: false },
      { text: '12:00:18.615 INFO  [cart-papi] POST /cart/items corrId=e02b (client retry 1 of 2)', relevant: true, why: 'The web shop retries immediately, multiplying load at the worst moment.' },
      { text: '12:00:19.000 INFO  [health] GET /health 200 (3 ms)', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why does cart-papi return 503 while CPU is at 20%?',
        options: [
          'Little’s law: 40 req/s x 4 s latency needs ~160 in flight, but maxConcurrency is 50, so the flow applies back-pressure',
          'The workers are out of memory',
          'The load balancer is misconfigured',
          'inventory-sapi returns 503 and cart-papi passes it through',
        ],
        answer: 0,
        explain: 'Max throughput is 50 / 4 s = 12.5 req/s per worker. The rest is rejected with FLOW_BACK_PRESSURE. Threads are waiting, not computing.',
      },
      {
        type: 'single',
        prompt: 'A colleague proposes maxConcurrency=500 and 4 vCores. What happens?',
        options: [
          'It fixes the 503s',
          'cart-papi sends many more concurrent calls to the already overloaded inventory database, so latency and failures get worse',
          'Nothing changes',
          'It reduces latency to 250 ms',
        ],
        answer: 1,
        explain: 'The bottleneck is inventory-sapi. Scaling the caller pushes more load onto the callee; maxConcurrency is actually protecting it.',
      },
      {
        type: 'multi',
        prompt: 'Which are good **immediate** actions?',
        options: [
          'Short timeout on the inventory check with a fallback ("availability confirmed at checkout")',
          'Short-lived cache of stock levels for hot sale items',
          'Ask the web shop to stop immediate retries and use backoff with jitter',
          'Inventory team scales or tunes its database',
          'Raise the inventory response timeout from 10 s to 60 s',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Lower latency means less concurrency needed. A longer timeout holds slots even longer.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix**?',
        options: [
          'Latency budgets and timeouts per call derived from the end-to-end SLA',
          'Circuit breaker with fallback around inventory calls',
          'maxConcurrency kept as a bulkhead and sized with Little’s law from target latency',
          'End-to-end load tests at sale volume with slow-dependency scenarios',
          'Remove maxConcurrency entirely',
        ],
        answer: [0, 1, 2, 3],
        explain: 'maxConcurrency is a deliberate bulkhead; keep it and size it, and make the chain degrade gracefully.',
      },
    ],
  },
  description: `
## Symptoms
- During a flash sale, \`cart-papi\` returns **HTTP 503** for ~70% of requests. Traffic is **40 req/s per worker** (normally 8).
- CPU per worker: ~20%. Heap: normal.
- Successful requests take ~4 s instead of the usual 250 ms.
- The web shop retries failed calls twice, immediately.

## Change / Context
- Each \`POST /cart/items\` calls \`inventory-sapi\` (normally 200 ms). Since the sale started, inventory-sapi's own database is overloaded and its latency is **~4 s**.
- Two months ago, to "protect inventory-sapi", a developer set \`maxConcurrency="50"\` on the \`cart-papi\` flow.
- 2 workers × 1 vCore, Mule 4.4, default thread-pool settings. Response timeout on the inventory call: 10 s.
- A colleague proposes: "Raise maxConcurrency to 500 and move to 4 vCores."

## Logs
\`\`\`
12:00:14.221 INFO  [cart-papi] POST /cart/items corrId=e02a -> inventory-sapi
12:00:18.302 INFO  [cart-papi] inventory-sapi responded 200 in 4,081 ms corrId=e02a
12:00:18.611 WARN  [cart-papi] MULE:FLOW_BACK_PRESSURE Flow 'post:\\cart\\items:api-config'
  is unable to accept new events at this time
12:00:18.612 WARN  [cart-papi] Responding 503 Service Unavailable
\`\`\`

## Your tasks
1. Explain the numbers: why 503s, why idle CPU? (Hint: Little's law.)
2. What do you do **right now**? Evaluate the colleague's proposal.
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
    'Applies Little\'s law: in-flight requests = arrival rate × latency = 40 req/s × ~4 s ≈ 160 per worker, far above maxConcurrency=50, so Mule applies back-pressure and the HTTP listener answers 503.',
    'Explains that CPU is idle because requests are waiting on I/O (the slow inventory-sapi), and that the real bottleneck is inventory-sapi\'s database.',
    'Explains the retry amplification: immediate client retries on 503 increase the arrival rate further.',
    'Evaluates the proposal: raising maxConcurrency/vCores would only push ~3x more concurrent load onto an already overloaded inventory-sapi and make things worse; capacity must be fixed at the bottleneck.',
    'Immediate options: shed or degrade gracefully (e.g. accept add-to-cart with a short inventory timeout and check stock at checkout, cached availability), ask the web shop to back off retries, and scale/relieve inventory-sapi\'s DB.',
    'Permanent fix: timeouts sized from latency budgets, circuit breaker and fallback around inventory, cached/pre-computed stock, client retries with backoff, and capacity tests at sale volumes.',
  ],
  solution: `
**Diagnosis.** **Little's law**: concurrency = throughput × latency. Each worker gets 40 req/s and each request now waits ~4 s on inventory-sapi, so it needs **~160 requests in flight**. The flow allows **50**. Max throughput per worker is therefore 50 / 4 s ≈ **12.5 req/s**; the rest is rejected. When the flow can't accept more events, Mule applies **back-pressure** and the HTTP Listener responds **503** (\`FLOW_BACK_PRESSURE\`). CPU is ~20% because the 50 in-flight requests are just **waiting on I/O**. The web shop's **immediate retries** turn every 503 into up to 3 requests, so the effective load is even higher. The true bottleneck is **inventory-sapi's database**, not cart-papi.

**Immediate mitigation.**
- **Reject the colleague's proposal as stated.** With maxConcurrency 500 and more vCores, cart-papi would send **3x more concurrent calls** to inventory-sapi, whose DB is already overloaded: latency rises further, timeouts start, and the whole chain fails harder. Scaling the caller doesn't fix a bottleneck in the callee.
- **Degrade gracefully** in cart-papi: add-to-cart with a **short timeout** (e.g. 800 ms) on the inventory check and a **fallback** ("availability confirmed at checkout"), or use a short-lived **cache** of stock levels for hot sale items. This cuts latency and therefore the needed concurrency.
- Ask the web shop to **stop immediate retries** (exponential backoff with jitter, honour \`Retry-After\`).
- Relieve the bottleneck: inventory team scales/tunes its DB (read replica for availability checks, indexes, cache).

**Root cause.** A synchronous dependency chain with no latency budget: cart-papi's capacity was implicitly tied to inventory-sapi's latency. \`maxConcurrency\` worked as designed (it protected inventory) but there was no fallback, so protection became user-facing 503s. Nobody load-tested sale volumes end-to-end.

**Permanent fix.**
- **Latency budgets and timeouts** per call, derived from the end-to-end SLA.
- **Circuit breaker + fallback** around inventory calls (fail fast when it's degraded instead of tying up concurrency for 4 s).
- **Pre-computed/cached availability** for read-heavy checks; reserve stock asynchronously or at checkout.
- Keep \`maxConcurrency\` as a deliberate bulkhead, sized with Little's law from *target* latency. \`FLOW_BACK_PRESSURE\` is a critical error that flow error handlers cannot handle, so do not plan on customising that 503: agree client backoff instead.
- **Autoscaling** only for the tier that is actually CPU/throughput-bound.

**Prevention.** Capacity model for peak events (expected rate × latency → required concurrency at each tier); end-to-end load tests at sale volume including slow-dependency scenarios; dashboards for back-pressure/503 rate, in-flight requests and dependency latency; client retry standards.
`,
  followUps: [
    { q: 'What exactly is back-pressure in Mule 4?', a: 'When a flow cannot accept more events (maxConcurrency reached or no threads/resources available), the runtime signals the source to stop accepting work instead of queueing unboundedly. For the HTTP Listener that means responding 503 to new requests.' },
    { q: 'Why is CPU not a good scaling signal here?', a: 'The workload is I/O-bound: threads wait on a slow dependency. CPU stays low while capacity is exhausted, so you should monitor in-flight requests, back-pressure events and dependency latency instead.' },
    { q: 'How do you prove the bottleneck is inventory-sapi and not cart-papi?', a: 'Correlated traces/logs show almost all of cart-papi\'s request time is spent waiting on inventory-sapi; inventory-sapi\'s own metrics show its DB saturated; and 503s start exactly when its latency rises.' },
  ],
}

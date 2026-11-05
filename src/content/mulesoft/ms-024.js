export default {
  id: 'ms-024',
  category: 'mulesoft',
  title: 'Threading Model, maxConcurrency and Back-Pressure',
  level: 'EXPERT',
  tags: ['threading', 'performance', 'back-pressure', 'uber-pool', 'tuning'],
  estMinutes: 40,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each processing type to a typical example.',
      pairs: [
        ['CPU_LITE', 'Logger, or the non-blocking hand-off of an HTTP Request'],
        ['BLOCKING_IO', 'Database operation or File write'],
        ['CPU_INTENSIVE', 'Heavy DataWeave transform'],
      ],
      explain: 'Components declare a processing type and the runtime schedules them accordingly. Since 4.3 they all run on the shared UBER pool by default.',
    },
    {
      type: 'single',
      prompt: 'CPU is ~35%, latency climbs to 12 s, and uber threads wait inside the legacy JDBC code. What is the diagnosis?',
      options: [
        'A hidden blocking call holds threads without using CPU; events queue for threads until back-pressure gives 503',
        'The replicas are CPU-bound and need more vCores',
        'DataWeave is consuming all threads',
        'The Scatter-Gather is deadlocked',
      ],
      answer: 0,
      explain: 'Low CPU plus rising latency means threads are **waiting**, not computing. The static Java call is opaque to Mule and blocks for ~1 s per request.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Why is `maxConcurrency=1000` a bad idea here?',
      options: [
        'It adds no capacity — more events block on the same slow JDBC call, using memory and exhausting DB connections',
        'The maximum allowed value is 256',
        'It disables back-pressure entirely, which crashes the runtime',
        'It forces all processors to run on one thread',
      ],
      answer: 0,
      explain: '`maxConcurrency` is a **limiter** (bulkhead). Set it to what the DB can serve so excess load is rejected quickly instead of piling up.',
    },
    {
      type: 'match',
      prompt: 'Match each element to its role in back-pressure.',
      pairs: [
        ['HTTP Listener', 'Might respond 503 Service Unavailable'],
        ['Message-broker listener', 'Depending on the connector, waits for resources or drops the message'],
        ['Flow that reached its maxConcurrency', 'Signals its source that it cannot accept more events'],
      ],
      explain: 'What happens is specific to each source. An HTTP client cannot be "paused", so the listener might reject; a broker listener might offer waiting or dropping, so check that connector before assuming messages are safe.',
    },
    {
      type: 'multi',
      needsScenario: true,
      prompt: 'Which fixes address the actual bottleneck?',
      options: [
        'Replace the JDBC inside the library with the Database connector (BLOCKING_IO, pooling, query timeout), or bound the call with a timeout',
        'Move the audit insert to an async consumer via Anypoint MQ/VM',
        'Set `maxConcurrency` on the flow to match the DB pool size and return a clear 503/429',
        'Double the replicas first, before changing the code',
      ],
      answer: [0, 1, 2],
      explain: 'Scaling before removing the blocking bottleneck just multiplies waiting threads. Fix the blocking call, offload non-essential work, and bulkhead.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'Since Mule 4.3, what is the default thread pool strategy?',
      options: [
        'A single UBER pool shared by all processing types',
        'Three dedicated pools: CPU_LITE, BLOCKING_IO, CPU_INTENSIVE',
        'One thread per flow',
        'A fixed pool of 16 threads per app',
      ],
      answer: 0,
      explain: 'UBER is the default; the dedicated strategy can still be selected in `schedulers-pools.conf`. HTTP socket I/O uses separate selector threads.',
    },
  ],
  description: `
A **Pricing Process API** (Mule 4.6, CloudHub 2.0, 2 replicas of 1 vCore) handles \`POST /quotes\`. Per request it:

1. Transforms a 200 KB JSON (DataWeave, heavy \`groupBy\`/\`reduce\`).
2. Calls 3 System APIs in a **Scatter-Gather** (HTTP, ~200 ms each).
3. Runs a legacy **Java library** via the Java module that internally makes a **blocking JDBC call** (~1 s) — invoked as a static method.
4. Writes an audit row with the Database connector.

Under a load test at 150 req/s:
- Latency jumps from 400 ms to 12 s, then clients see **503**s.
- CPU on the replicas is only ~35%.
- A thread dump shows most \`[MuleRuntime].uber\` threads in \`WAITING\`/\`TIMED_WAITING\` inside the legacy library's JDBC code.
- A developer proposes "just set \`maxConcurrency=1000\` on the flow".

**Questions**
1. Describe the Mule 4 threading model: processing types, the UBER pool vs dedicated pools, and HTTP selector threads.
2. Explain the observed behaviour: why low CPU, rising latency and then 503?
3. What does \`maxConcurrency\` do, and why is 1000 a bad idea here?
4. What is back-pressure in Mule 4 and how does the HTTP Listener react to it compared with a queue-based source?
5. Propose concrete fixes (code and configuration) and how you would verify them.
`,
  answerTemplate: `## Threading model

## Diagnosis

## maxConcurrency

## Back-pressure

## Fixes and verification
`,
  keyPoints: [
    'Components declare a processing type — CPU_LITE (non-blocking, short), BLOCKING_IO (blocking I/O, e.g. DB, file, transactions), CPU_INTENSIVE (e.g. heavy DataWeave); the runtime schedules them accordingly.',
    'Since Mule 4.3 the default is a single UBER pool shared by all types (dedicated CPU_LITE/BLOCKING_IO/CPU_INTENSIVE pools remain configurable via schedulers-pools.conf); HTTP uses separate selector threads for I/O.',
    'Hidden blocking work (a static Java call doing JDBC) holds threads without using CPU — low CPU with growing latency means threads are waiting, not computing.',
    'maxConcurrency caps concurrent events in a flow; raising it does not add capacity when the bottleneck is a blocked dependency — it adds threads, memory and pressure on the DB.',
    'Back-pressure: when the flow/pools can\'t accept more work the source is notified and reacts in a connector-specific way; the HTTP Listener might reject with 503, while a message-broker listener might wait for resources or drop the message.',
    'Fixes target the bottleneck: make the blocking call bounded (timeouts, pool size), move it out of the request path or make it async, tune DataWeave, then verify with load tests and thread dumps.',
  ],
  solution: `
**Threading model**
- Every processor declares a **processing type**: \`CPU_LITE\` (quick, non-blocking — Logger, HTTP Request's non-blocking I/O handoff), \`BLOCKING_IO\` (blocks a thread — DB, File, transactional work), \`CPU_INTENSIVE\` (DataWeave transforms, compression).
- Mule 4.3+ default: **UBER** pool strategy — one elastic pool serves all three types, sized by the runtime from available cores/memory. The older **DEDICATED** strategy (separate CPU_LITE, BLOCKING_IO, CPU_INTENSIVE pools) can be selected in \`conf/schedulers-pools.conf\` on runtimes where you control the config.
- The HTTP connector uses **selector threads** (Grizzly) for socket I/O; flows then run on the runtime pools. Non-blocking HTTP Requests don't hold a processing thread while waiting.

**Diagnosis:** the Java static method is opaque to Mule. It can't see the JDBC inside, which **blocks** the thread for ~1 s per call with no timeout or pool control from Mule. At 150 req/s × 1 s, you need ~150 threads blocked per second of load spread over 2 replicas; the pool grows to its limit and threads sit **waiting** (thread dump) — CPU is idle (35%). New events queue for a thread → latency climbs to 12 s → when the runtime can't accept more work it applies **back-pressure** and the HTTP Listener answers **503**. The DB behind the legacy library is probably limited too (its own connection pool).

**maxConcurrency:** the maximum number of events a flow processes at the same time (default effectively unbounded, limited by pool capacity). 1000 doesn't create capacity: it allows more threads to block on the same slow JDBC call, adds memory per in-flight event, can exhaust the DB's connections, and turns 503s into timeouts. \`maxConcurrency\` is a **limiter** (bulkhead) — e.g. set it to what the DB can actually serve, so excess load is rejected quickly instead of piling up.

**Back-pressure:** when a flow reaches \`maxConcurrency\` or the runtime has no capacity to accept an event, Mule signals the **source**. The reaction is specific to each source. The HTTP Listener can't "pause the client", so it might respond **503 Service Unavailable**. A message-broker listener might offer the option to wait for resources or drop the message, and some sources disconnect and reconnect once the load eases, so check the connector you use.

**Fixes**
1. **Replace the hidden blocking call**: use the Database connector (declared BLOCKING_IO, connection pooling, query timeout) instead of JDBC inside the library, or wrap the library call so it has a **timeout** and a bounded pool size.
2. **Move non-essential work out of the request path**: the audit insert (and possibly the legacy call) via Anypoint MQ/VM to an async consumer flow with its own \`maxConcurrency\`.
3. **Bulkhead**: \`maxConcurrency\` on the flow that hits the legacy DB = DB pool size, plus a clear 503/429 with \`Retry-After\` to clients.
4. **DataWeave**: avoid repeated full-collection operations (e.g. \`groupBy\` once, indexed lookups instead of filter inside map) to reduce CPU_INTENSIVE time.
5. **Capacity**: scale replicas/size only after removing the blocking bottleneck — otherwise you multiply waiting threads.
6. **Verify**: repeat the load test; compare latency percentiles, 503 rate, thread dumps (fewer waiting uber threads), DB pool metrics and CPU (should now rise with load).
`,
  followUps: [
    {
      q: 'Why can a single blocking call inside a CPU_LITE-declared component hurt more with dedicated pools than with UBER?',
      a: 'The dedicated CPU_LITE pool is small (sized to cores), so a few blocked threads can stall all non-blocking processing for the app. UBER\'s shared elastic pool absorbs it better, but blocking still wastes capacity.',
    },
    {
      q: 'How do Scatter-Gather and Parallel For Each interact with maxConcurrency?',
      a: 'Each route/item is processed concurrently, so one event can use several threads; both have their own concurrency settings (Parallel For Each maxConcurrency, Scatter-Gather maxConcurrency) that should be bounded to protect downstream systems.',
    },
    {
      q: 'How would you capture a thread dump on CloudHub 2.0?',
      a: 'Use the platform\'s diagnostics options where available (e.g. Runtime Manager / Anypoint Monitoring diagnostics) or reproduce on a local or RTF runtime with jstack; read the thread names ([MuleRuntime].uber, http selectors) and their stack frames.',
    },
  ],
}

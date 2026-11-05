export default {
  id: 'ms-072',
  category: 'mulesoft',
  title: 'Flash-Sale Order Capture Hangs: Diagnosing Oracle Connection Pool Exhaustion and Sizing Pools Across Replicas',
  level: 'EXPERT',
  tags: ['retail', 'oracle', 'database', 'connection-pool', 'performance', 'flash-sale', 'capacity-planning'],
  estMinutes: 40,
  quiz: [
    {
      type: 'multi',
      prompt: 'Which observations point to **pool exhaustion** in the Mule app rather than a slow Oracle database?',
      options: [
        'Response times jump to exactly the pool maxWait value and then requests fail waiting for a connection',
        'Thread dumps show many threads waiting to obtain a connection from the pool, few executing SQL',
        'Oracle shows the app sessions mostly idle (waiting for the client) while the API is slow',
        'Oracle AWR shows one query with very high CPU and long executions',
      ],
      answer: [0, 1, 2],
      explain: 'Waiting inside the pool shows up as maxWait-shaped latencies, threads parked on the pool and idle DB sessions held by the app. A single expensive query in AWR is a database-side problem (which can then cause exhaustion, but is diagnosed differently).',
    },
    {
      type: 'single',
      prompt: 'Using Little\'s law, each order request holds a connection for about 40 ms, and the peak is 600 requests/s spread over 4 replicas. Roughly how many connections does **each** replica need in use at peak?',
      options: [
        'About 6 (150 req/s × 0.04 s), plus headroom — e.g. a pool of 10',
        'About 600, one per request per second',
        'About 24 per replica',
        'Exactly 1, because queries are fast',
      ],
      answer: 0,
      explain: 'Connections in use ≈ arrival rate × hold time. Per replica 150 × 0.04 = 6. The total across replicas (4 × pool max) must fit within what the DBA allows for this user.',
    },
    {
      type: 'single',
      prompt: 'The hold time measured in the pool is 2 seconds, while the SQL itself takes 30 ms. Which flow design most likely explains it?',
      options: [
        'A Try scope with a DB transaction that also contains an HTTP call to the payment provider',
        'Using bind parameters instead of literals',
        'A small preparedStatementCacheSize',
        'Using db:insert instead of db:bulk-insert for one row',
      ],
      answer: 0,
      explain: 'Inside a transaction the connection is held from the first DB operation until commit, including any HTTP wait. Move remote calls out of the transaction.',
    },
    {
      type: 'single',
      prompt: 'The team proposes raising maxPoolSize from 10 to 100 on each of 8 replicas. What is the main risk?',
      options: [
        'Up to 800 Oracle sessions, beyond the user/instance limits; the waiting moves into the database and can make everything slower',
        'Mule does not allow a pool larger than 50',
        'It disables statement caching',
        'Nothing — more connections are always faster',
      ],
      answer: 0,
      explain: 'Oracle has finite sessions/processes and CPU. Oversized pools cause contention, session limit errors (e.g. ORA-00018 / ORA-12516-type refusals) and logon storms when replicas scale.',
    },
    {
      type: 'match',
      prompt: 'Match each pooling or flow setting to its purpose.',
      pairs: [
        ['maxPoolSize', 'Upper bound of connections per replica for this config'],
        ['maxWait', 'How long a request waits for a free connection before failing'],
        ['Flow maxConcurrency', 'Limits how many events run the flow at once, so excess load is held back before the pool'],
        ['queryTimeout on DB operations', 'Stops a runaway statement from holding a connection forever'],
      ],
      explain: 'Bound the pool, fail fast when it is busy, limit concurrency upstream, and cap individual statements — together they keep a slow dependency from taking the whole app down.',
    },
    {
      type: 'multi',
      prompt: 'A Mule API runs out of pooled database connections at peak. Each connection is held much longer than the SQL needs to run. Which three things can cause that?',
      options: [
        'Streaming a large `db:select` result that is consumed slowly',
        'A transaction that spans a remote HTTP call',
        'Statements with no `queryTimeout` waiting on row locks',
        'Using named parameters in the SQL statement text',
        'A short `maxWait` setting on the pooling profile',
      ],
      answer: [0, 1, 2],
      explain: 'A connection returns to the pool when the statement, result set and transaction are finished. Named parameters have no effect on hold time. `maxWait` only sets how long a request waits for a connection, so a short value makes it fail fast.',
    },
  ],
  description: `
An electronics retailer runs **flash sales** (limited stock released at 12:00). The **Order Capture Process API** (CloudHub 2.0, 4 replicas, autoscaling up to 8) reserves stock and writes orders to **Oracle**. Oracle allows the app user 200 sessions.

Each replica has:

\`\`\`xml
<db:pooling-profile maxPoolSize="10" maxWait="30" maxWaitUnit="SECONDS"/>
\`\`\`

The flow looks like this:

\`\`\`xml
<try transactionalAction="ALWAYS_BEGIN">
  <db:update config-ref="oracle"> <!-- reserve stock --> </db:update>
  <http:request config-ref="paymentProvider" path="/authorise"/>  <!-- 1–3 s at peak -->
  <db:insert config-ref="oracle"> <!-- order --> </db:insert>
</try>
\`\`\`

At 12:00:05 last Friday:
- p95 latency went from 180 ms to **30 s**, then requests failed with errors about not obtaining a connection.
- Thread dumps showed dozens of threads waiting on the pool.
- The DBA saw most of the app's Oracle sessions **idle** ("SQL*Net message from client") while the API was slow.
- The DBA also saw one \`UPDATE inventory_reservation\` waiting on row locks for a hot SKU.

The proposed fix is \`maxPoolSize="100"\` on every replica.

**Questions**
1. What are the signs of pool exhaustion vs a slow database, and what do these symptoms tell you?
2. Why are connections held so long? Identify every cause in the design.
3. Size the pool properly across replicas (including autoscaling) and explain why 100 is wrong.
4. What changes to the flow and settings would you make so the next flash sale degrades gracefully?
`,
  answerTemplate: `## Signs of pool exhaustion

## Why connections are held

## Pool sizing across replicas

## Changes for the next flash sale
`,
  keyPoints: [
    'Pool exhaustion: latency ≈ maxWait, threads waiting on the pool, idle DB sessions held by the app; a slow DB shows long active SQL and waits in Oracle.',
    'A transaction holds its connection from the first DB operation until commit — an HTTP call inside it multiplies hold time.',
    'Lock contention on hot rows and missing queryTimeout also extend hold time; streaming results hold connections until consumed.',
    'Size with Little\'s law (rate × hold time) per replica plus headroom, and check total = max replicas × maxPoolSize against the DB session budget.',
    'Use a short maxWait to fail fast, flow maxConcurrency to hold back load upstream (back-pressure; an HTTP listener might return 503), queryTimeout on statements, and move remote calls out of transactions.',
    'For hot SKUs, reduce lock time (short single-statement reservations, e.g. conditional UPDATE) or reserve stock from a cache/queue instead of row locks.',
  ],
  solution: `
**1. Signs.** Pool exhaustion: latency clustering at \`maxWait\` (30 s), errors about obtaining a connection, threads parked on the pool, and Oracle sessions **idle** because the app holds them without running SQL. A slow DB looks different: sessions **active** in Oracle, long SQL execution or lock waits, high DB CPU/IO. Here both appear: idle sessions (connections held during the HTTP call) plus a lock wait on a hot SKU.

**2. Why connections are held.**
- The Try scope begins a **DB transaction**; the connection is bound to it from the \`db:update\` until commit — including the **1–3 s payment call**. Hold time goes from ~30 ms to seconds.
- The stock reservation row for the hot SKU is **locked** by the open transaction, so other requests for the same SKU wait on the lock — while holding their own connections.
- No \`queryTimeout\`, so a blocked UPDATE waits indefinitely.
- Little's law: 150 req/s per replica × 2 s ≈ 300 connections needed per replica — no pool size fixes that.

**3. Sizing.** After the redesign, hold time ≈ 40 ms. Peak 600 req/s over 4 replicas → 150 req/s × 0.04 s ≈ **6** in use per replica; pool of **10–12** gives headroom. Check the budget for the **maximum** replica count: 8 × 12 = 96 sessions, within the 200 allowed (leaving room for other apps/tools). With \`maxPoolSize="100"\`: 8 × 100 = 800 sessions — beyond the user limit, causing connection refusals, logon storms when replicas scale out, and more contention on the same hot rows. A bigger pool only moves the queue into Oracle.

**4. Changes.**
\`\`\`xml
<flow name="capture-order" maxConcurrency="32">
  <db:update config-ref="oracle" queryTimeout="2" queryTimeoutUnit="SECONDS">
    <db:sql>UPDATE inventory_reservation SET available = available - :qty
            WHERE sku = :sku AND available >= :qty</db:sql>   <!-- single atomic statement, auto-commit -->
  </db:update>
  <!-- affectedRows = 0 → sold out, return 409 -->
  <http:request config-ref="paymentProvider" path="/authorise"/>   <!-- outside any DB transaction -->
  <db:insert config-ref="oracle" queryTimeout="2" queryTimeoutUnit="SECONDS">...</db:insert>
  <!-- payment failed → compensating UPDATE to release the reservation -->
</flow>
\`\`\`
- Reserve with one conditional UPDATE (short lock, no transaction spanning HTTP); compensate on payment failure.
- \`maxWait\` of 1–2 s to fail fast and return 503/429 with Retry-After instead of hanging threads.
- \`maxConcurrency\` so excess requests hit back-pressure before the pool (the docs say an HTTP listener might return 503); a **rate-limiting / spike-control** policy on the Experience API for the flash sale.
- For extreme hot SKUs: pre-split stock into buckets, or reserve from a fast store/queue and settle to Oracle asynchronously.
- Monitor pool usage, wait time and Oracle session counts on a dashboard; load-test the flash-sale profile before the event.
`,
  followUps: [
    {
      q: 'How does autoscaling interact with pool sizing?',
      a: 'Every new replica opens its own pool, so the DB session total grows with replicas. Size pools for the maximum replica count, keep minPoolSize low, and make sure autoscaling cannot push past the DB budget.',
    },
    {
      q: 'Why can a pool that is too large make latency worse?',
      a: 'More concurrent sessions compete for the same CPU, latches and row locks in Oracle, so each statement takes longer; throughput flattens while latency rises. A smaller pool with queuing in front is often faster.',
    },
    {
      q: 'Which metrics would you alert on?',
      a: 'Pool active vs max and wait time (from JMX or custom metrics), and p95 latency and 503 rate per replica. Also Oracle active sessions and lock waits for the app user, and DB:CONNECTIVITY error counts.',
    },
  ],
}

import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-075',
  category: 'architecture',
  title: 'Black Friday Peak: Queue-Based Load Levelling and Backpressure',
  level: 'ADVANCED',
  tags: ['myproject', 'retail', 'peak', 'scaling', 'backpressure', 'activemq', 'anypoint-mq', 'oracle', 'rate-limiting'],
  estMinutes: 45,
  diagram: {
    task: 'draw the checkout path for Black Friday: what protects the edge, what stays synchronous, where orders are buffered, and how the order database is fed at a rate it can handle.',
    checks: [
      { label: 'Web and mobile traffic passes a gateway with spike control / rate limiting', rule: { type: 'each', of: ['web-app', 'mobile-app'], min: 2, edgeTo: 'api-gateway' } },
      { label: 'Accepted orders are buffered on a queue asynchronously', rule: { type: 'edge', from: ['experience-api', 'process-api'], to: ['queue', 'event-stream'], kind: 'async' } },
      { label: 'A separate consumer drains the queue at a controlled rate', rule: { type: 'edge', from: ['queue', 'event-stream'], to: 'process-api', kind: 'async' } },
      { label: 'The checkout Process API does not write orders to Oracle synchronously', rule: { type: 'no-edge', from: { type: 'process-api', label: ['checkout', 'capture'] }, to: { type: 'system-api', label: ['order', 'oracle'] } } },
      { label: 'Oracle is written only through a System API', rule: { type: 'only-via', target: ['database', 'erp'], from: 'system-api' } },
      { label: 'Availability reads during checkout come from a cache', rule: { type: 'edge', from: ['process-api', 'experience-api', 'system-api'], to: 'cache' } },
      { label: 'Payment authorisation is reached only through a System API', rule: { type: 'only-via', target: 'payment', from: 'system-api' } },
      { label: 'Orders that keep failing go to a dead-letter queue', rule: { type: 'edge', from: ['process-api', 'queue'], to: 'dlq' } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: ['queue', 'topic', 'event-stream', 'cloud-queue', 'dlq'], kind: 'async' } },
      { label: 'Reads and writes to a data store are sync calls', rule: { type: 'lines', to: ['database', 'oracle-db', 'sql-server', 'cache'], kind: 'sync' } },
      { label: 'The gateway forwards checkouts to the Experience API', rule: { type: 'edge', from: 'api-gateway', to: 'experience-api' } },
      { label: 'Channels never bypass the gateway', rule: { type: 'no-edge', from: ['web-app', 'mobile-app'], to: ['experience-api', 'process-api'] } },
      { label: 'No chain of sync calls joins the checkout request to Oracle', rule: { type: 'no-path', from: 'experience-api', to: ['database', 'erp'], kind: 'sync' } },
      { label: 'Accepted orders reach Oracle through the queue', rule: { type: 'path', from: 'experience-api', via: ['queue', 'event-stream'], to: ['database', 'erp'] } },
      { label: 'Card authorisation stays in the request as sync calls, before the order is confirmed', rule: { type: 'path', from: 'experience-api', to: 'payment', kind: 'sync' } },
      { label: 'Every System API connects to its backend', rule: { type: 'each', of: 'system-api', edgeTo: ['database', 'erp', 'payment'] } },
      { label: 'The gateway forwards live requests, so its lines are sync calls', rule: { type: 'lines', touching: 'api-gateway', kind: 'sync' } },
      { label: 'APIs call each other with sync calls. Async work goes through a broker', rule: { type: 'lines', from: ['experience-api', 'process-api'], to: ['experience-api', 'process-api', 'system-api'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Web storefront'],
        mob: ['mobile-app', 'Mobile app'],
        gw: ['api-gateway', 'Spike control + rate limit per client', { rateLimit: 1500 }],
        exp: ['experience-api', 'exp-checkout-api', { replicas: 4, vCores: '1' }],
        pchk: ['process-api', 'prc-checkout (validate, reserve, authorise)', { replicas: 4, vCores: '1' }],
        cache: ['cache', 'ATP cache'],
        spay: ['system-api', 'sys-payment', { replicas: 4, vCores: '1' }],
        pay: ['payment', 'Payment provider'],
        q: ['queue', 'orders.accepted (persistent)'],
        ping: ['process-api', 'prc-order-ingest (bounded concurrency)', { vCores: '1' }],
        sord: ['system-api', 'sys-oracle-orders', { vCores: '1', rateLimit: 450 }],
        db: ['database', 'Oracle order DB (bulk inserts, ~600 orders/s)'],
        dlq: ['dlq', 'orders.accepted DLQ'],
      },
      [
        'web -> gw', 'mob -> gw', 'gw -> exp', 'exp -> pchk', 'pchk -> cache', 'pchk -> spay', 'spay -> pay',
        'pchk ~> q', 'q ~> ping', 'ping -> sord', 'sord -> db', 'ping ~> dlq',
      ],
    ),
    simulation: {
      systems: [
        { match: 'payment', latencyMs: 300, maxRps: 2000 },
        { match: 'database', latencyMs: 50, maxRps: 600 },
      ],
      tests: [
        {
          name: 'The doorbuster burst',
          about: 'For 15 minutes the web sends 800 checkouts a second and the app 400, then 200 and 100 for the rest of the sale. Every customer gets an order number within 3 seconds, Oracle stays at 500 orders a second or less, and the queue is empty before the run ends.',
          traffic: [
            { name: 'web', from: 'web-app', rps: 200, to: ['payment', 'database'], kind: 'write', spikes: [{ at: 0, forMin: 15, rps: 800 }] },
            { name: 'mobile', from: 'mobile-app', rps: 100, to: ['payment', 'database'], kind: 'write', spikes: [{ at: 0, forMin: 15, rps: 400 }] },
          ],
          durationMin: 120,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 3000 }], peakRps: [{ node: 'database', max: 500 }], backlog: [{ queue: 'queue', maxEnd: 1000 }], lost: { max: 0 }, vCores: { max: 16 } },
        },
        {
          name: 'Oracle is down and the broker restarts',
          about: 'During the sale (300 checkouts a second) Oracle is down for 20 minutes, and the broker restarts in the middle of it. Customers still get their order numbers, no order is lost, and the backlog drains once Oracle is back.',
          traffic: [
            { name: 'web', from: 'web-app', rps: 200, to: ['payment', 'database'], kind: 'write' },
            { name: 'mobile', from: 'mobile-app', rps: 100, to: ['payment', 'database'], kind: 'write' },
          ],
          incidents: [{ down: 'database', at: 5, forMin: 20 }, { restart: 'queue', at: 15 }],
          durationMin: 90,
          expect: { answers: [{ minSuccess: 0.99 }], backlog: [{ queue: 'queue', maxEnd: 1000 }], lost: { max: 0 }, dlq: { max: 0 } },
        },
        {
          name: 'Bots push past the tested capacity',
          about: 'For two minutes bots push the web to 2,500 checkouts a second on top of 300 from the app. The gateway answers 429 to what is over 1,500 a second, so the APIs never fail with 503.',
          traffic: [
            { name: 'web', from: 'web-app', rps: 600, to: ['payment', 'database'], kind: 'write', spikes: [{ at: 3, forMin: 2, rps: 2500 }] },
            { name: 'mobile', from: 'mobile-app', rps: 300, to: ['payment', 'database'], kind: 'write' },
          ],
          expect: { answers: [{ maxFailed: 0.01, minSuccess: 0.6 }] },
        },
      ],
    },
  },
  description: `
An electronics retailer expects **10× normal traffic on Black Friday**: up to **1,200 checkouts/s** for the first 15 minutes of the doorbuster sale, then ~300/s for hours.

Current synchronous chain: \`exp-checkout → prc-checkout → sys-oracle-orders → Oracle\` plus payment authorisation. Oracle order inserts (several tables, triggers, sequence calls) top out at about **150 orders/s**.

What happened last year:
- The Oracle connection pool was exhausted.
- HTTP threads piled up.
- Response times went to 60 s.
- The site went down for 40 minutes.

Facts:
- Customers must see "order received" with an order number within 3 seconds.
- The card must be **authorised** before confirming (the payment provider handles 2,000 TPS).
- The WMS starts picking 30 minutes after order creation anyway.
- ActiveMQ and Anypoint MQ are both available.

Numbers for sizing:
- In the doorbuster the web sends **800 checkouts a second** and the app **400**, for 15 minutes. Then **200** and **100** for hours.
- The payment provider answers in about 300 ms.
- With bulk inserts and slimmer triggers the DBA can raise Oracle to about **600 orders a second** (50 ms each); keep the ingest at **500 or less**. The queue must be empty again within two hours.
- Oracle can be down for **20 minutes** during the sale, and the broker can restart; no accepted order may be lost.
- Load tests proved **1,500 checkouts a second**. Bots can push far past that for minutes.
- The budget for the Mule apps is **16 vCores**.

**Questions:**
- Which steps must stay synchronous and which can be deferred?
- Where do you buffer, and how do you drain at Oracle's pace?
- What protects the platform when even the queue path is overloaded?
- How do customers get an order number before Oracle has the order?
`,
  answerTemplate: `## Synchronous vs deferred steps

## Buffering and draining

## Backpressure and protection

## Order numbers and customer experience
`,
  keyPoints: [
    'Keep only what the customer must see synchronous: validation, availability check/reservation, payment authorisation; defer the Oracle order write.',
    'Queue-based load levelling: publish accepted orders to a persistent queue and let a consumer with bounded concurrency drain at Oracle’s sustainable rate.',
    'Backpressure at the edge: spike control/rate limiting returns 429 rather than letting threads and pools pile up; sized connection pools and timeouts inside.',
    'Generate the order number upfront (UUID or pre-allocated range) so the customer gets it without waiting for Oracle sequences.',
    'Idempotent ingest (order number as key), DLQ for poison orders, and monitoring of queue depth and age to show how far behind Oracle is.',
    'Size the front for the peak, cap the gateway at the tested capacity, and size the ingest (with a rate limit) to Oracle, so the backlog drains in the time the business accepts.',
  ],
  solution: `
\`\`\`
 Web/App ─► gateway (spike control, rate limit) ─► exp-checkout ─► prc-checkout
                                                            ├─► ATP cache (no Oracle read)
                                                            ├─► sys-payment ─► provider (authorise)
                                                            └~► orders.accepted (persistent queue)  ◄── 202 + order number to customer
                                                                     ~► prc-order-ingest (concurrency tuned to ~150/s)
                                                                              ─► sys-oracle-orders ─► Oracle
                                                                              └~► DLQ
\`\`\`

**Synchronous vs deferred.** Customers need validation, stock confirmation and payment authorisation now. The Oracle insert (and WMS release) can follow seconds or minutes later because picking starts 30 minutes after creation anyway.

**Buffer and drain.** \`prc-checkout\` publishes the accepted order as a persistent message and returns. \`prc-order-ingest\` consumes with a fixed concurrency (e.g. \`jms:listener\` numberOfConsumers or Anypoint MQ subscriber settings plus flow \`maxConcurrency\`) and a DB pool sized to match, so Oracle sees a steady rate instead of 1,200/s.

Do the arithmetic in the interview: at 150/s, the 15-minute burst alone leaves roughly 1,050 × 900 ≈ 950k orders queued, and the sustained 300/s afterwards would keep the backlog **growing**. A queue levels **peaks**; it does not fix **sustained** under-capacity. So the design also raises Oracle write throughput to comfortably above 300/s (batched inserts with \`db:bulk-insert\`, slimmer triggers, a dedicated order-ingest schema). Then the burst backlog drains within an hour or two, which the business must accept explicitly.

**Backpressure.**
- Gateway spike control / rate limiting returns **429** when beyond tested capacity — controlled degradation instead of collapse.
- HTTP timeouts and bounded pools on the payment call; a circuit breaker if the provider struggles.
- Queue limits and alerts on depth/age; the ingest consumer never scales beyond what Oracle can take.

**Order numbers.** Generate the order id in \`prc-checkout\` (UUID or pre-allocated ranges) and use it as the idempotency key in Oracle (unique constraint / MERGE), so redelivered messages do not create duplicates.

**Sizing.**
- \`exp-checkout-api\`, \`prc-checkout\` and \`sys-payment\` each run 4 replicas of 1 vCore (about 2,000 requests a second), so 1,200 a second keeps them under 70% busy.
- The gateway rate limit of 1,500 a second matches the tested capacity: what is over it gets 429, and nothing behind it fails with 503.
- \`prc-order-ingest\` and \`sys-oracle-orders\` run on 1 vCore each, with a rate limit of 450 a second on the System API. The doorbuster leaves about 675,000 orders queued; they drain at about 150 a second over the 300 that still arrive, in a little over an hour.
- The queue is persistent, so a broker restart during an Oracle outage loses nothing. In total 14 vCores, inside the 16 vCore budget.

**Trade-offs:** order status queries must handle "accepted but not yet in Oracle" (read from the queue-side status or a small status store); more moving parts to monitor; a backlog means downstream reports lag.
`,
  followUps: [
    { q: 'Why not just autoscale the Mule apps to 20 replicas?', a: 'More replicas push more load onto Oracle, which is the real bottleneck; it makes the pool exhaustion worse. Scale the front, but drain to Oracle at a fixed rate.' },
    { q: 'The payment authorisation succeeds but the queue publish fails. What now?', a: 'Treat publish failure as a checkout failure: void or let the authorisation expire, return an error, and alert. Alternatively write the order to a durable local outbox first so publish is retried without losing it.' },
    { q: 'How do you rehearse this before Black Friday?', a: 'Load-test the full path at 1.5× forecast, verify 429 behaviour and queue drain rates, and run a game day with Oracle deliberately slowed down.' },
  ],
}

export default {
  id: 'inc-054',
  category: 'incidents',
  title: 'Sale-Day Cascade: One Slow Inventory API Takes Down the Whole Application Network',
  level: 'EXPERT',
  tags: ['api-led', 'cascading-failure', 'circuit-breaker', 'bulkhead', 'caching', 'async'],
  estMinutes: 60,
  investigation: {
    logs: [
      { text: '09:06:58.204 WARN  [sys-inventory-api] DB query reserve_stock took 21844 ms corrId=bf-1a20', relevant: true, why: 'The origin: the new reservation query locks the table under sale-day concurrency, so inventory becomes slow, not down.' },
      { text: '09:07:01.050 INFO  [sys-price-api]     GET /api/prices?skus=... 200 (40 ms) corrId=bf-1a31', relevant: false },
      { text: "09:07:12.330 ERROR [prc-catalog-api]   HTTP:TIMEOUT HTTP GET on resource 'https://sys-inventory-api.internal/api/stock?skus=...' failed: Timeout exceeded. corrId=bf-1a7c", relevant: true, why: 'Catalog waits up to 30 s per inventory call, for 24 tiles per page, holding in-flight requests, connections and memory.' },
      { text: '09:07:30.118 WARN  [prc-checkout-api]  Retrying sys-inventory-api after timeout corrId=bf-1b02', relevant: true, why: 'Retries on timeout add load to the already overloaded inventory API: an amplifier.' },
      { text: '09:08:41.665 WARN  [exp-web-api]       Flow maxConcurrency reached on main-api-flow, rejecting with 503', relevant: true, why: 'The Experience API capacity is full of requests waiting on catalog/checkout, so every feature on it gets 503.' },
      { text: "09:08:42.001 ERROR [exp-web-api]       HTTP:SERVICE_UNAVAILABLE HTTP GET on resource 'https://prc-customer-api.internal/api/customers/me' failed: service unavailable (503). corrId=bf-1c9e", relevant: true, why: 'Login fails although it never touches inventory: no bulkhead between features sharing one Experience API.' },
      { text: '09:08:50.000 INFO  [sys-crm-api]       request rate 210 req/s (normal at this traffic: ~900 req/s)', relevant: false },
      { text: '09:19:55.870 ERROR [prc-catalog-api]   java.lang.OutOfMemoryError: Java heap space', relevant: true, why: 'Piled-up in-flight requests exhaust the heap; the replica restart then removes capacity and makes the cascade worse.' },
      { text: '09:20:03.002 INFO  [prc-catalog-api]   Replica restarting', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why do login and store-locator fail even though they never use inventory?',
        options: [
          'Slow inventory calls hold capacity upstream; the Experience APIs serve all features from one shared concurrency pool, so it fills and rejects everything',
          'sys-crm-api and sys-store-api crashed at 09:07',
          'The gateway blocks all traffic during the sale',
          'Login depends on inventory through a hidden call',
        ],
        answer: 0,
        explain: 'A **slow** dependency is worse than a dead one: every waiting request holds a concurrency slot, connections and memory. Other System APIs actually see *less* traffic because requests die upstream.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **next 15 minutes**?',
        options: [
          'Disable the new reservation rule / revert the query (DB team can kill blocking sessions)',
          'Turn off live stock on product tiles via a feature flag ("check availability at checkout")',
          'Shorten the inventory timeout to ~2 s and remove the retry; rate-limit catalog traffic to protect checkout and login',
          'Scale every app to 4x replicas and wait',
        ],
        answer: [0, 1, 2],
        explain: 'Stop the trigger, degrade instead of dying, fail fast and protect critical journeys. Scaling alone does not help while inventory is slow.',
      },
      {
        type: 'match',
        prompt: 'Match each resilience pattern to what it prevents here.',
        pairs: [
          ['Circuit breaker on sys-inventory-api', 'Waiting on a known-slow dependency; returns a fallback immediately'],
          ['Bulkheads (separate pools, concurrency, deployments per feature)', 'Catalog consuming checkout and login capacity'],
          ['Availability cache / event-fed read model', '24 live inventory calls per product page'],
          ['Async order acceptance (202 + queue)', 'Checkout blocked on slow stock reservation'],
        ],
        explain: 'Each pattern removes one amplifier of the cascade; together they turn API-led reuse into isolated failure domains.',
      },
      {
        type: 'single',
        prompt: 'What is the **architectural** root cause?',
        options: [
          'No failure isolation: synchronous coupling everywhere, long equal timeouts, retries on timeouts, chatty calls, no caching or circuit breakers, and shared Experience API capacity',
          'The load test did not use 6x traffic',
          'Mule 4 blocks a thread per HTTP call',
          'Too many System APIs',
        ],
        answer: 0,
        explain: 'The 6x volume was tested; what was not tested was a slow dependency. The trigger was the table-locking query, but the architecture let it spread.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in **peak-readiness prevention**?',
        options: [
          'Load tests at 6–10x plus fault injection (slow inventory, slow payment)',
          'Runbook with tested kill switches (stock display off, promotions off, catalog rate limit)',
          'Per-dependency SLOs, latency alerts and a change freeze for risky backend changes before peak',
          'Volume-only load tests, as done this year',
        ],
        answer: [0, 1, 2],
        explain: 'Volume tests alone passed this year; prepare for slowness, not only load.',
      },
    ],
  },
  description: `
## Symptoms
- Black Friday, 09:00 sale launch. Traffic is 6x normal, which was load-tested.
- 09:07: **checkout, product pages, account login and store-locator** all start failing with 503/504 on web and mobile. This includes features that never touch inventory.
- Anypoint Monitoring: \`sys-inventory-api\` p95 rises from 120 ms to **25 s**; all other System APIs look healthy but their request rates **drop** (requests aren't reaching them).
- \`prc-catalog-api\` and \`prc-checkout-api\` memory usage climbs; replicas restart around 09:20, making it worse.

## Change / Context
- Application network (simplified):

\`\`\`
exp-web-api ----+--> prc-catalog-api  --> sys-product-api, sys-inventory-api, sys-price-api
exp-mobile-api -+--> prc-checkout-api --> sys-inventory-api, sys-payment-api, sys-sap-order-api
                +--> prc-customer-api --> sys-crm-api
                +--> prc-store-api    --> sys-store-api
\`\`\`

- \`sys-inventory-api\` reads from a legacy warehouse database. A last-minute promotion rule added a stock reservation query that does a **table lock** under concurrency.
- Every requester uses \`responseTimeout=30000\`.
- \`prc-catalog-api\` calls inventory for **every product tile** (24 per page). There is no caching of stock.
- Experience APIs are single apps serving all features. Each has one shared HTTP requester config per downstream API, with \`maxConnections\` limits.
- Flows have \`maxConcurrency\` set.
- There are no circuit breakers. \`prc-checkout-api\` and \`prc-catalog-api\` retry inventory once on timeout.

## Logs
\`\`\`
09:06:58.204 WARN  [sys-inventory-api] DB query reserve_stock took 21844 ms corrId=bf-1a20
09:07:12.330 ERROR [prc-catalog-api]   HTTP:TIMEOUT HTTP GET on resource 'https://sys-inventory-api.internal/api/stock?skus=...' failed: Timeout exceeded. corrId=bf-1a7c
09:07:30.118 WARN  [prc-checkout-api]  Retrying sys-inventory-api after timeout corrId=bf-1b02
09:08:41.665 WARN  [exp-web-api]       Flow maxConcurrency reached on main-api-flow, rejecting with 503
09:08:42.001 ERROR [exp-web-api]       HTTP:SERVICE_UNAVAILABLE HTTP GET on resource 'https://prc-customer-api.internal/api/customers/me' failed: service unavailable (503). corrId=bf-1c9e
09:08:42.004 ERROR [exp-mobile-api]    HTTP:TIMEOUT HTTP POST on resource 'https://prc-checkout-api.internal/api/checkout' failed: Timeout exceeded. corrId=bf-1d01
09:19:55.870 ERROR [prc-catalog-api]   java.lang.OutOfMemoryError: Java heap space
09:20:03.002 INFO  [prc-catalog-api]   Replica restarting
\`\`\`

## Your tasks
1. Explain how one slow System API cascades into a network-wide outage, including features that don't use inventory.
2. What do you do in the next 15 minutes, on the busiest day of the year?
3. What is the root cause, both technical and architectural?
4. Design the permanent resilience architecture (bulkheads, circuit breakers, timeouts, caching, async, degradation).
5. How do you prevent and prepare for next year's peak?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Explains the cascade mechanism: slow (not failed) responses hold in-flight requests, connections and memory for up to 30 s each; with high traffic, upstream capacity (maxConcurrency, requester connection pools, heap) fills, and unrelated features sharing the same Experience API capacity fail too.',
    'Identifies amplifiers: 24 inventory calls per page, retries on timeout, long equal timeouts, no caching, and replica restarts that drop capacity further.',
    'Immediate (15 min): degrade gracefully — turn off live stock on product tiles (feature flag/config), fail fast on inventory with short timeout, rate-limit or shed catalog traffic, disable the new reservation rule, and protect checkout.',
    'Permanent: bulkheads (separate requester pools/concurrency per downstream and per feature, separate apps for critical journeys), circuit breakers with fallbacks, a timeout budget, stock caching or an event-fed availability store, async order acceptance.',
    'Architectural root cause: synchronous coupling everywhere with no failure isolation — API-led layering without resilience patterns turns reuse into a shared failure domain.',
    'Prevention: peak readiness with load tests that include a slow dependency (not only volume), chaos tests, runbooks with kill switches, per-dependency SLOs and dashboards.',
  ],
  solution: `
**Diagnosis — how slowness cascades.**

\`\`\`
1. sys-inventory-api slows to ~25s (table lock in new reservation query)
2. prc-catalog-api: 24 inventory calls per page x 6x traffic, each waiting up to 30s,
   + 1 retry -> in-flight requests pile up, connection pool to inventory full,
   memory grows (buffered responses, queued events) -> OOM -> replicas restart
3. prc-checkout-api: same, checkout waits on stock reservation
4. exp-web-api / exp-mobile-api: their flows wait on catalog/checkout -> maxConcurrency reached
   -> 503 for EVERY request, including login (prc-customer-api) and store-locator
5. Other System APIs see LESS traffic: requests die upstream before reaching them
\`\`\`

A **failed** dependency that fails fast is cheap; a **slow** one is expensive because every waiting request holds capacity. In Mule 4 the HTTP requester is non-blocking, so this is less about threads being blocked and more about in-flight request limits, connection pools and memory — but the effect is the same: shared capacity runs out, and features that share an Experience API's flow concurrency or replicas fail together.

**Immediate mitigation (next 15 minutes).**
1. **Stop the trigger**: disable the new promotion reservation rule / revert that query (DB team can also kill blocking sessions).
2. **Degrade, don't die**: switch \`prc-catalog-api\` to "stock not shown / 'check availability at checkout'" via a property or feature flag — removes 24 calls per page.
3. **Fail fast**: shorten inventory requester timeout to ~2 s and remove the retry (config change + rolling restart, or hotfix).
4. **Protect checkout**: rate-limit catalog traffic at the gateway if needed so checkout and login get capacity; temporarily scale \`prc-checkout-api\` and the Experience APIs (scaling alone won't help while inventory is slow).
5. Communicate status to the business; watch error rates recover per feature.

**Root cause.**
- *Trigger*: an untested query with table locking under sale-day concurrency.
- *Architectural*: the application network has **no failure isolation** — synchronous calls everywhere, long and equal timeouts, retries on timeouts, chatty per-tile calls, no caching, no circuit breakers, and Experience APIs where all features share one concurrency pool. API-led reuse made \`sys-inventory-api\` a shared dependency without making it safe to depend on.

**Permanent fix — resilience architecture.**
- **Timeout budget**: inner timeouts short and ordered (inventory 1.5 s, catalog → exp 4 s, gateway 8 s); retries only in one place and never on timeouts for overloaded resources.
- **Circuit breakers** on calls to each System API (Object Store–based state, a reusable module or custom policy): open after N failures/slow calls, return a fallback immediately, probe periodically.
- **Bulkheads**:
  - separate HTTP requester configs (own connection pools) per downstream API;
  - separate flows/\`maxConcurrency\` per feature so catalog can't consume checkout/login capacity;
  - split critical journeys into separate deployments (e.g. \`exp-web-checkout-api\` vs \`exp-web-browse-api\`) with their own replicas.
- **Caching and data placement**: product-tile stock from a cache or an **availability read model** fed by inventory change events (Anypoint MQ / event streaming), refreshed every few seconds; the legacy DB serves only checkout reservation.
- **Batching**: one call for 24 SKUs instead of 24 calls.
- **Async where possible**: accept orders (202 + order reference), queue them, reserve stock and create the SAP order asynchronously with compensation if stock is gone.
- **Graceful degradation**: defined fallbacks per feature (hide stock, show cached price, "we'll confirm by email").

\`\`\`
exp-web-browse-api --> prc-catalog-api --> [cache / availability store] <-- inventory events
exp-web-checkout-api --> prc-checkout-api --CB/2s--> sys-inventory-api (reservation only)
                                         --> Anypoint MQ --> order worker --> sys-sap-order-api
\`\`\`

**Prevention.**
- Peak-readiness programme: load tests at 6–10x **plus** fault injection (slow inventory, slow payment) — volume tests alone passed this year.
- Change freeze for risky backend changes before peak; performance review of DB changes.
- Runbook with tested kill switches (stock display off, promotions off, catalog rate limit).
- Per-dependency SLOs and dashboards (latency, open circuit breakers, pool saturation), alerts on latency — not only errors.
- Architecture standard: every new synchronous dependency must declare timeout, fallback and circuit-breaker behaviour.
`,
  followUps: [
    { q: 'Why is a slow dependency worse than a dead one?', a: 'A dead dependency fails in milliseconds and frees resources; a slow one holds connections, memory and concurrency slots for the full timeout, so capacity runs out upstream. Circuit breakers and short timeouts convert slow failures into fast ones.' },
    { q: 'Mule 4 is non-blocking — so why did capacity run out?', a: 'Non-blocking I/O avoids parking a thread per call, but each in-flight request still uses memory, a connection from the requester pool and a slot under maxConcurrency; back-pressure then rejects new work. Thousands of 25-second calls exhaust those limits just as surely.' },
    { q: 'Would autoscaling have saved the day?', a: 'Not much: more Experience/Process replicas just send more concurrent requests to the slow inventory database, making the lock contention worse. Isolation, fail-fast and load shedding address the cause.' },
    { q: 'How do you decide which features to degrade first?', a: 'Agree a priority list with the business before peak: checkout and payment first, login next, then browsing enrichments like live stock and recommendations. Kill switches follow that order.' },
  ],
}

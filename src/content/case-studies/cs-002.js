import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-002',
  category: 'case-studies',
  title: 'Retailer Preparing for 10x Black Friday Traffic',
  level: 'BEGINNER',
  tags: ['scalability', 'performance', 'caching', 'peak-traffic'],
  estMinutes: 25,
  diagram: {
    task: 'draw the Black Friday-ready target state: both channels, the catalogue path with caching, order placement decoupled from the ERP, and how the ERP and WMS are protected.',
    checks: [
      { label: 'Both the web shop and the mobile app call an Experience API', rule: { type: 'each', of: ['web-app', 'mobile-app'], min: 2, edgeTo: 'experience-api' } },
      { label: 'Catalogue and order traffic use separate Experience APIs', rule: { type: 'node', match: 'experience-api', min: 2 } },
      { label: 'Catalogue responses are cached so browsing does not hit the backend', rule: { type: 'edge', from: ['experience-api', 'process-api', 'system-api'], to: 'cache' } },
      { label: 'Orders are put on a queue asynchronously instead of calling the ERP inline', rule: { type: 'edge', from: ['process-api', 'experience-api'], to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'A consumer drains the order queue into the ERP', rule: { type: 'path', from: ['queue', 'topic', 'event-stream'], to: 'erp' } },
      { label: 'The ERP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Every backend (ERP, WMS, product DB) is reached only through a System API', rule: { type: 'only-via', target: ['erp', 'legacy', 'database', 'saas'], from: 'system-api' } },
      { label: 'An order from the mobile app reaches the ERP through the queue', rule: { type: 'path', from: 'mobile-app', to: 'erp', via: ['queue', 'topic', 'event-stream'] } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Web shop'],
        mob: ['mobile-app', 'Mobile app'],
        pexp: ['experience-api', 'products-exp-api'],
        oexp: ['experience-api', 'orders-exp-api'],
        cache: ['cache', 'Catalogue cache (TTL few min)'],
        oprc: ['process-api', 'orders-papi'],
        q: ['queue', 'orders-queue'],
        worker: ['process-api', 'prc-order-consumer (~50/s)'],
        scat: ['system-api', 'catalog-sapi'],
        sstock: ['system-api', 'stock-sapi'],
        serp: ['system-api', 'erp-sapi (spike control)'],
        db: ['database', 'Product DB'],
        wms: ['legacy', 'WMS'],
        erp: ['erp', 'On-prem ERP'],
      },
      [
        'web -> pexp', 'web -> oexp', 'mob -> pexp', 'mob -> oexp',
        'pexp -> cache', 'pexp -> scat', 'pexp -> sstock', 'scat -> db', 'sstock -> wms',
        'oexp -> oprc', 'oprc ~> q', 'q ~> worker', 'worker -> serp', 'serp -> erp',
      ],
    ),
  },
  description: `
**Context.** An online retailer runs its web shop and mobile app on a set of Mule 4 APIs on CloudHub 2.0:
- \`products-exp-api\` (catalogue, prices) → \`catalog-sapi\` → a product database.
- \`orders-exp-api\` → \`orders-papi\` → \`erp-sapi\` → an on-prem ERP.
- \`stock-sapi\` → the warehouse system (WMS).

Normal peak is ~200 requests/s. Marketing expects **10x** that on Black Friday, mostly catalogue browsing. Last year the ERP slowed down under load and order placement failed for 40 minutes.

**Constraints**
- The ERP and WMS **cannot** be scaled — the vendor says ~50 orders/s is the safe maximum.
- Black Friday is in 8 weeks. No re-architecture of the ERP.

**Your task.** Propose a readiness plan: what you change in the integration layer, how you prove it works, and what you do on the day.
`,
  answerTemplate: `## Where the load goes

## Changes to the integration layer

## Protecting the ERP and WMS

## Testing and proving it

## On the day
`,
  keyPoints: [
    'Separates read traffic (catalogue, most of the 10x) from write traffic (orders) and treats them differently.',
    'Caches catalogue/price responses (Cache scope, Object Store or HTTP caching) with a sensible TTL so browsing does not hit the backend.',
    'Scales Mule apps horizontally (more replicas, pre-scaled before the event) instead of relying only on bigger workers or last-minute autoscaling.',
    'Protects the ERP with a throttle (spike control / rate limiting) and/or accepts orders asynchronously into a queue drained at a safe rate (~50/s).',
    'Load-tests at 10x+ against a realistic environment well before the day and fixes bottlenecks found.',
    'On the day: change freeze, dashboards and alerts on latency/error rate, and an agreed runbook (who does what, rollback, degrade features).',
  ],
  solution: `
**Where the load goes.** Most of the 10x is **reads** (browse, search, product detail). Orders grow too, but far less. The fragile part is the ERP/WMS, not the Mule layer.

**Changes to the integration layer.**
- **Cache the catalogue**: cache product and price responses in \`products-exp-api\` (Cache scope or Object Store, TTL of a few minutes) and set HTTP cache headers so the CDN can cache too. Most browsing then never reaches \`catalog-sapi\`.
- **Stock**: show approximate stock ("in stock / low") from a short-lived cache; check real stock only at checkout.
- **Scale out**: add replicas of the busy apps ahead of time (e.g. 2 → 6) and check connection pools and DB limits can take it.

**Protecting the ERP and WMS.**
- Put a **spike control / rate limiting** policy (API Manager) in front of \`erp-sapi\` so it never receives more than it can handle.
- Better: make order placement **asynchronous**. \`orders-papi\` validates the order, puts it on a queue (Anypoint MQ), returns *202 Accepted* with an order reference, and a consumer drains the queue into the ERP at ~50 orders/s. A backlog then means delayed confirmations, not failed orders.
- Timeouts and a friendly error/fallback when a backend is slow.

**Testing.** Load test at 10x–12x with a realistic mix (90% reads, 10% orders) at least 3–4 weeks before, against a production-like environment. Fix what breaks, then re-test. Run a short "game day" (what if the ERP goes down?).

**On the day.** Change freeze, pre-scaled replicas, a dashboard (requests/s, p95 latency, 5xx, queue depth) with alerts, an on-call rota, and a runbook: how to switch off non-essential features (e.g. recommendations) and how to roll back.
`,
}

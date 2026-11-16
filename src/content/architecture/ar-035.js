import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-035',
  category: 'architecture',
  title: 'Caching at Gateway vs Process Layer',
  level: 'INTERMEDIATE',
  tags: ['caching', 'cache-scope', 'object-store', 'api-gateway', 'performance'],
  estMinutes: 40,
  diagram: {
    task: 'draw the account chain from the mobile app to the PIM, billing and CRM, and show where caches sit (and where they must not).',
    checks: [
      { label: 'The mobile app reaches an Experience API', rule: { type: 'path', from: 'mobile-app', to: 'experience-api' } },
      { label: 'The Experience API goes through a Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'The Process API orchestrates three System APIs (catalogue, billing, CRM)', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 3 } },
      { label: 'The catalogue is cached at the Catalogue System API, protecting the PIM for every consumer', rule: { type: 'edge', from: { type: 'system-api', label: ['catalog', 'product', 'pim'] }, to: 'cache' } },
      { label: 'The balance (Billing System API) is never cached', rule: { type: 'no-edge', from: { type: 'system-api', label: ['billing', 'balance'] }, to: 'cache' } },
      { label: 'The balance is read live from billing over sync calls', rule: { type: 'path', from: 'mobile-app', via: { type: 'system-api', label: ['billing', 'balance'] }, to: ['saas', 'external-api', 'erp', 'crm', 'database', 'legacy'], kind: 'sync' } },
      { label: 'Backends (PIM, billing, CRM) are reached only through System APIs', rule: { type: 'only-via', target: ['saas', 'external-api', 'erp', 'crm', 'database', 'legacy'], from: 'system-api' } },
      { label: 'Every System API is called by the Process API', rule: { type: 'each', of: 'system-api', edgeFrom: 'process-api' } },
      { label: 'Every System API connects to its backend', rule: { type: 'each', of: 'system-api', edgeTo: ['saas', 'external-api', 'erp', 'crm', 'database', 'legacy'] } },
      { label: 'The Experience API never calls System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'APIs call each other with sync calls. Async work goes through a broker', rule: { type: 'lines', from: ['mobile-app', 'api-gateway', 'experience-api', 'process-api'], to: ['api-gateway', 'experience-api', 'process-api', 'system-api'], kind: 'sync' } },
      { label: 'Reads and writes to a data store are sync calls', rule: { type: 'lines', to: ['database', 'oracle-db', 'sql-server', 'cache'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Mobile app'],
        gw: ['api-gateway', 'API Manager policies (HTTP caching on GET /products only)'],
        exp: ['experience-api', 'exp-account-api', { replicas: 3, vCores: '0.2' }],
        prc: ['process-api', 'prc-account-api', { replicas: 3, vCores: '0.2' }],
        pcache: ['cache', 'CRM profile cache (per customerId, TTL 5 min)', { ttlSec: 300 }],
        scat: ['system-api', 'sys-catalogue-api', { replicas: 3 }],
        sbil: ['system-api', 'sys-billing-api', { replicas: 3 }],
        scrm: ['system-api', 'sys-crm-api', { replicas: 3 }],
        ccache: ['cache', 'Catalogue cache (Object Store v2, TTL 30 min + eviction)', { ttlSec: 1800 }],
        pim: ['saas', 'Vendor PIM (pay per call)'],
        bil: ['database', 'Billing system (balance)'],
        crm: ['crm', 'CRM (customer profile)'],
      },
      ['mob -> gw', 'gw -> exp', 'exp -> prc', 'prc -> pcache', 'prc -> scat', 'prc -> sbil', 'prc -> scrm', 'scat -> ccache', 'scat -> pim', 'sbil -> bil', 'scrm -> crm'],
    ),
    simulation: {
      systems: [
        { match: 'saas', latencyMs: 1500, maxRps: 20 },
        { match: 'database', latencyMs: 50 },
        { match: 'crm', latencyMs: 200 },
        { match: { type: 'cache', label: 'catalogue' }, hitRatio: 0.95 },
        { match: { type: 'cache', label: 'profile' }, hitRatio: 0.3 },
      ],
      tests: [
        {
          name: 'Product pages at peak',
          about: 'The app asks for product details 150 times a second for ten minutes. The PIM must stay within its allowance of 10 calls a second, pages must load fast, and the APIs must fit the 3 vCore budget.',
          traffic: [{ name: 'products', from: 'mobile-app', rps: 150, to: 'saas' }],
          expect: { answers: [{ minSuccess: 0.99, maxMs: 400 }], peakRps: [{ node: 'saas', max: 10 }], vCores: { max: 3 } },
        },
        {
          name: 'A zone goes down',
          about: 'Account screens come in at 100 a second and product pages at 50, and one availability zone fails for four minutes. With three replicas per app, both keep being answered.',
          traffic: [
            { name: 'accounts', from: 'mobile-app', rps: 100, to: ['database', 'crm'] },
            { name: 'products', from: 'mobile-app', rps: 50, to: 'saas' },
          ],
          incidents: [{ zone: true, at: 3, forMin: 4 }],
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
A telecom has a **Product Catalogue** and **Customer Account** chain:

\`\`\`
Mobile App → Account Experience API → Account Process API
   → Catalogue System API (vendor PIM, slow: p95 1.5 s, changes a few times a day)
   → Billing System API (balance, per customer, changes on every payment)
   → CRM System API (customer profile, changes rarely)
\`\`\`

Observations:
- 70% of calls fetch the same ~300 products.
- The PIM vendor charges per API call above a monthly allowance.
- Balance must never be stale by more than a few seconds; a stale balance led to complaints before.
- APIs are managed in API Manager; apps run with 3 replicas each on CloudHub 2.0, spread over availability zones. The budget for the APIs is **3 vCores**.
- At peak the app asks for product details **150 times a second** and opens account screens 100 times a second. Product pages should load in well under half a second.
- The PIM allowance works out to about **10 calls a second**, and the PIM refuses more than 20. Billing answers in about 50 ms and the CRM in about 200 ms.
- A catalogue cache kept for 30 minutes answers about 95% of product reads. A profile cache keyed per customer answers far fewer, about 30%, because each customer opens the app only now and then.

**Questions:**
- What would you cache, where (client, gateway, Experience, Process, System), and with what TTL?
- How do you handle invalidation when the catalogue changes?
- What are the pitfalls of caching per-customer data at the gateway?
- How do multiple replicas affect your cache design?
`,
  answerTemplate: `## What to cache and where

## Invalidation strategy

## Pitfalls (security and correctness)

## Multi-replica considerations
`,
  keyPoints: [
    'Cache what is read often, changes rarely and is shared across users (catalogue); avoid or keep very short TTLs for volatile per-user data (balance).',
    'Gateway-level HTTP caching (e.g. the HTTP Caching policy) is cheap and transparent but works on whole responses keyed by request, so it suits public, non-personalised GETs.',
    'Inside Mule, the Cache scope or an Object Store gives fine-grained caching of a specific backend call result, close to the slow system (System or Process layer).',
    'Personalised responses must never be cached under a key that ignores the caller identity, or one customer can see another customer\'s data.',
    'Invalidation is TTL-based by default, with event-driven eviction when the source can notify changes.',
    'With several replicas, use a shared persistent Object Store (or accept per-replica caches) and be aware of consistency and cold-start behaviour.',
    'Sizing: with a 30 minute catalogue cache the PIM gets a few calls a second at a peak of 150. The Experience and Process APIs need 3 replicas of 0.2 vCore, the System APIs 3 of 0.1: 2.1 vCores, and a zone outage still leaves two replicas of each.',
  ],
  solution: `
**What and where.**

| Data | Where | TTL | Why |
|---|---|---|---|
| Product catalogue (PIM) | **Catalogue System API** (Cache scope / Object Store), optionally gateway HTTP caching on \`GET /products\` | 15–60 min + event eviction | Shared by all users, slow and costly backend |
| CRM profile | Process API, keyed by customerId | ~5 min | Rarely changes; per-user key |
| Balance | **No cache**, or ≤ a few seconds | — | Business requires freshness |
| Static reference data (countries, plans) | Client / CDN with \`Cache-Control\` | hours | Almost never changes |

- Caching at the **System API** protects the PIM and its call allowance for **every** consumer, not just this mobile journey.
- Gateway caching saves even the Mule processing, but caches whole HTTP responses — fine for \`GET /products/{id}\`, dangerous for personalised data.
- Clients and CDNs can honour \`Cache-Control\`/\`ETag\` headers you return — the cheapest cache of all.

**Invalidation.**
- Default: TTL matching business tolerance.
- If the PIM can emit a change notification/webhook, a small flow evicts specific keys (Object Store remove / invalidate cache) so updates appear within seconds.
- Optionally a scheduled **warm-up** for the top 300 products after deployment to avoid a cold-start burst on the PIM.

**Pitfalls.**
- Cache key must include everything that changes the response: path, query parameters, language, **caller identity** for personalised data. A gateway cache keyed only on the URL can return customer A's account to customer B.
- Do not cache error responses for long (a 500 cached for an hour).
- Caching large objects in memory on 3 replicas wastes heap; cache only needed fields.

**Multiple replicas.**
- In-memory caches are per replica: three replicas = three copies and three cache misses. Acceptable for small reference data.
- For shared, consistent state, use a **persistent Object Store** (Object Store v2 on CloudHub) — slower than memory but shared across replicas and restarts. Or an external cache (e.g. Redis) if latency and volume justify it.
- Document TTLs as part of the API contract so consumers know data may be up to N minutes old.

**Sizing.**
- Without the catalogue cache, 150 product reads a second would send over 100 calls a second to a PIM that takes 1.5 s and allows 10: pages fail and the bill grows. With a TTL of 30 minutes about 95% are answered from the cache, so the PIM sees about 5 calls a second and pages load in about a tenth of a second.
- \`exp-account-api\` and \`prc-account-api\` carry every request, so each runs **3 replicas of 0.2 vCore**. The System APIs carry less and stay at 3 replicas of 0.1 vCore. That is 2.1 vCores in total, and losing a zone leaves two thirds of the capacity, which is still enough.
`,
  followUps: [
    { q: 'How do you stop many concurrent misses hitting the PIM after expiry (cache stampede)?', a: 'Refresh proactively before expiry (scheduled warm-up), add small random jitter to TTLs, or serialise refresh per key so only one request calls the backend while others wait or get the stale value.' },
    { q: 'Would you cache POST responses?', a: 'Generally no: POST is not idempotent and its result is not a cacheable representation. Search-style POSTs can be cached explicitly inside Mule with a key derived from the body if there is a clear benefit.' },
  ],
}

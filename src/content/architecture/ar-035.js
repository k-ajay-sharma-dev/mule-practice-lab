import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-035',
  category: 'architecture',
  title: 'Caching at Gateway vs Process Layer',
  level: 'INTERMEDIATE',
  tags: ['caching', 'cache-scope', 'object-store', 'api-gateway', 'performance'],
  estMinutes: 25,
  diagram: {
    task: 'draw the account chain from the mobile app to the PIM, billing and CRM, and show where caches sit (and where they must not).',
    checks: [
      { label: 'The mobile app reaches an Experience API', rule: { type: 'path', from: 'mobile-app', to: 'experience-api' } },
      { label: 'The Experience API goes through a Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'The Process API orchestrates three System APIs (catalogue, billing, CRM)', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 3 } },
      { label: 'The catalogue is cached at the Catalogue System API, protecting the PIM for every consumer', rule: { type: 'edge', from: { type: 'system-api', label: ['catalog', 'product', 'pim'] }, to: 'cache' } },
      { label: 'The balance (Billing System API) is never cached', rule: { type: 'no-edge', from: { type: 'system-api', label: ['billing', 'balance'] }, to: 'cache' } },
      { label: 'Backends (PIM, billing, CRM) are reached only through System APIs', rule: { type: 'only-via', target: ['saas', 'external-api', 'erp', 'crm', 'database', 'legacy'], from: 'system-api' } },
      { label: 'The Experience API never calls System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Mobile app'],
        gw: ['api-gateway', 'API Manager policies (HTTP caching on GET /products only)'],
        exp: ['experience-api', 'exp-account-api'],
        prc: ['process-api', 'prc-account-api'],
        pcache: ['cache', 'CRM profile cache (per customerId, TTL 5 min)'],
        scat: ['system-api', 'sys-catalogue-api'],
        sbil: ['system-api', 'sys-billing-api'],
        scrm: ['system-api', 'sys-crm-api'],
        ccache: ['cache', 'Catalogue cache (Object Store v2, TTL 30 min + eviction)'],
        pim: ['saas', 'Vendor PIM (pay per call)'],
        bil: ['database', 'Billing system (balance)'],
        crm: ['crm', 'CRM (customer profile)'],
      },
      ['mob -> gw', 'gw -> exp', 'exp -> prc', 'prc -> pcache', 'prc -> scat', 'prc -> sbil', 'prc -> scrm', 'scat -> ccache', 'scat -> pim', 'sbil -> bil', 'scrm -> crm'],
    ),
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
- APIs are managed in API Manager; apps run with 3 replicas each on CloudHub 2.0.

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
`,
  followUps: [
    { q: 'How do you stop many concurrent misses hitting the PIM after expiry (cache stampede)?', a: 'Refresh proactively before expiry (scheduled warm-up), add small random jitter to TTLs, or serialise refresh per key so only one request calls the backend while others wait or get the stale value.' },
    { q: 'Would you cache POST responses?', a: 'Generally no: POST is not idempotent and its result is not a cacheable representation. Search-style POSTs can be cached explicitly inside Mule with a key derived from the body if there is a clear benefit.' },
  ],
}

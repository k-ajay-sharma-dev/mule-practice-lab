export default {
  id: 'ms-012',
  category: 'mulesoft',
  title: 'Cache Scope: Keys, Strategies and Invalidation',
  level: 'INTERMEDIATE',
  tags: ['caching', 'cache-scope', 'object-store', 'performance'],
  estMinutes: 20,
  quiz: [
    {
      type: 'single',
      prompt: 'Why does every SKU return the same price with the default caching strategy?',
      options: [
        'The default key is a SHA-256 digest of the payload, which is empty for every GET',
        'The default TTL is infinite, so prices never refresh',
        'The default strategy caches only the first response per flow',
        'The default key is the request path without URI params',
      ],
      answer: 0,
      explain: 'The default key is derived from the **payload**. All `GET /products/{sku}` requests have the same (empty) payload, so they share one key.',
    },
    {
      type: 'single',
      prompt: 'Which caching-strategy setting fixes the bug and meets the 10-minute freshness requirement?',
      options: [
        '`keyGenerationExpression="#[vars.sku]"` with an object store `entryTtl="10" entryTtlUnit="MINUTES"`',
        '`keyGenerationExpression="#[payload]"` with `maxEntries="10"`',
        'Default key with `entryTtl="10" entryTtlUnit="MINUTES"`',
        '`keyGenerationExpression="#[correlationId]"` with no TTL',
      ],
      answer: 0,
      explain: 'The key must be what makes the response unique (the SKU, plus currency/locale if relevant), and the TTL gives freshness. A correlation ID is unique per request, so nothing would ever hit.',
    },
    {
      type: 'single',
      prompt: 'On 3 replicas without clustering, what is the trade-off of an **in-memory** cache store?',
      options: [
        'Each replica has its own cache: more misses and short-lived inconsistency, but very fast hits',
        'It is shared across replicas but slower than persistent',
        'In-memory caches are not allowed on CloudHub 2.0',
        'It survives redeploys, unlike persistent stores',
      ],
      answer: 0,
      explain: 'In-memory is per replica. Persistent (OSv2) is shared but every lookup is a network call — still a big win against an 800 ms backend.',
    },
    {
      type: 'multi',
      prompt: 'In which cases does the Cache scope **not** store a result?',
      options: [
        'The incoming payload is a non-repeatable stream',
        'The response is a non-repeatable stream',
        'The filter expression bypasses caching for that request',
        'The response is larger than 1 KB',
      ],
      answer: [0, 1, 2],
      explain: 'Non-repeatable streams can be read only once, so they are not cached, and the filter expression can skip caching. There is no 1 KB limit.',
    },
    {
      type: 'single',
      prompt: 'Finance publishes a price change for one SKU. How do you evict just that entry immediately?',
      options: [
        'Call `ee:invalidate-key` with the caching strategy and the SKU key',
        'Redeploy the application',
        'Call `ee:invalidate-cache`, which removes only expired entries',
        'Set the TTL to 0 at runtime',
      ],
      answer: 0,
      explain: '`invalidate-key` evicts one entry; `invalidate-cache` clears **everything**. With per-replica in-memory caches every replica must receive the eviction.',
    },
  ],
  description: `
A **Product Experience API** handles \`GET /products/{sku}\`. Each request calls a slow **Pricing System API**.

- Traffic is ~300 req/s.
- The Pricing call takes ~800 ms.
- Prices change a few times per day.
- When Finance publishes a price change, the new price must be visible within **10 minutes**.

A developer wrapped the Pricing call in a **Cache** scope with the default caching strategy. Response times dropped dramatically, but QA reports that **every SKU now returns the same price**.

**Questions**
1. How does the Cache scope decide whether it has a hit, and what is the default key?
2. Why does every SKU return the same price?
3. Configure a caching strategy that meets the 10-minute freshness requirement on a 3-replica CloudHub 2.0 deployment. In-memory or persistent?
4. How would you evict a single SKU immediately after a price change?
5. Name situations where the Cache scope will not cache, and an alternative to caching inside the app.
`,
  answerTemplate: `## How a hit is decided

## The "same price" bug

## Caching strategy

## Evicting one SKU

## When it won't cache / alternatives
`,
  keyPoints: [
    'The Cache scope computes a key; on a hit it skips the inner processors and returns the cached response, on a miss it runs them and stores the result.',
    'Default key = a digest (SHA-256) of the payload; for a GET the payload is empty, so all SKUs share one key.',
    'Fix: a caching strategy with keyGenerationExpression such as #[attributes.uriParams.sku] (or a var set from it).',
    'Object store backing the strategy with entryTtl 10 minutes (and maxEntries); persistent shares across replicas but adds network latency, in-memory is per replica.',
    'Targeted eviction via the invalidate-key / invalidate-cache operations, or removing the key from the object store.',
    'Non-repeatable (consumable) payloads are not cached; API Manager\'s HTTP Caching policy is an alternative at the gateway.',
  ],
  solution: `
**How a hit is decided:** the Cache scope asks its **caching strategy** for a key. If an entry exists for that key, the inner processors are skipped and the cached response is returned. On a miss it runs the inner processors and stores the resulting response under that key in an **object store**.

**Same-price bug:** the default key generator uses a **SHA-256 digest of the payload**. For \`GET /products/{sku}\` the payload is empty (or the same request body), so every SKU produces **the same key** and gets the first cached price.

**Caching strategy**
\`\`\`xml
<ee:object-store-caching-strategy name="pricingCache"
    keyGenerationExpression="#[vars.sku]">
  <os:private-object-store alias="pricingStore"
      persistent="false" maxEntries="50000"
      entryTtl="10" entryTtlUnit="MINUTES"
      expirationInterval="1" expirationIntervalUnit="MINUTES"/>
</ee:object-store-caching-strategy>
\`\`\`
- Set \`vars.sku = attributes.uriParams.sku\` before the scope (or use the expression directly) — the key must be what makes the response unique (add currency/locale if they matter).
- **TTL 10 minutes** satisfies "visible within 10 minutes" with no extra work.
- **In-memory vs persistent:** with in-memory, each of the 3 replicas has its own cache (3× cache misses, slightly inconsistent prices for up to 10 min) but hits are microseconds. Persistent (OSv2) shares one cache but every lookup is a network call — for an 800 ms backend that's still a big win. For a 10-minute TTL, in-memory per replica is usually fine; use \`maxEntries\` to protect the heap.

**Evicting one SKU:** call the cache invalidation operations — \`ee:invalidate-key\` with the caching strategy and the key (e.g. from a Finance event or an admin endpoint), or \`ee:invalidate-cache\` to clear everything. With per-replica in-memory caches, every replica must receive the eviction (e.g. via a broadcast event), which is a point in favour of a shared persistent store.

**When it won't cache:** the payload or the result is a **non-repeatable stream**. The scope also has a filter expression to bypass caching for some requests. (A failure inside the scope produces no response to store, although the docs do not describe this case.) **Alternatives:** the **HTTP Caching** policy in API Manager (caches at the gateway before the flow runs), or caching in the System API layer so all consumers benefit.
`,
  followUps: [
    {
      q: 'What would you cache for an authenticated, per-user response?',
      a: 'Either nothing, or include the user/tenant identity in the key so one user never receives another user\'s data. Data with personal information should usually not go into a shared cache.',
    },
    {
      q: 'What happens when 100 requests miss the same key at the same moment?',
      a: 'Without synchronisation they would all call the backend (a cache stampede). The object-store caching strategy synchronises access to the cache by default (the \`synchronized\` setting), so one request computes the value while the others wait, at some cost in performance.',
    },
    {
      q: 'Why not cache the OAuth token in a Cache scope?',
      a: 'You can, but the OAuth module/HTTP Request authentication already manages tokens and refreshes them before expiry. A manual cache needs a TTL shorter than the token lifetime and must handle 401s by invalidating the key.',
    },
  ],
}

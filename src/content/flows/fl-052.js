import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'
import { handlerStatus } from '../../flow/rules.js'

export default {
  id: 'fl-052',
  category: 'flows',
  title: 'Experience API Caching a Slow Process API Response',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'experience-api', 'cache', 'performance', 'timeouts'],
  estMinutes: 25,
  flowChecks: [
    {
      label: 'The web channel has its own Experience API listener (/exp-...)',
      rule: { type: 'source', component: 'http-listener', where: { path: 'exp-' } },
    },
    {
      label: 'The catalog logic stays in a Process API listener (/prc-...)',
      rule: { type: 'source', component: 'http-listener', where: { path: 'prc-' } },
    },
    {
      label: 'The slow Process API call is wrapped in a Cache scope in the Experience API',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'http-request', within: 'cache', where: { path: 'prc-' } },
          { type: 'before', first: 'http-listener', firstWhere: { path: 'exp-' }, then: 'cache' },
        ],
      },
    },
    {
      label: 'The cache key is built from the category and the locale',
      rule: {
        type: 'any',
        rules: [
          { type: 'exists', component: 'cache', where: { cachingStrategy: 'locale' } },
          { type: 'before', first: 'set-variable', firstWhere: { value: 'locale' }, then: 'cache' },
        ],
      },
    },
    {
      label: 'The cached response is shaped for the web channel with DataWeave',
      rule: { type: 'before', first: 'cache', then: 'transform' },
    },
    {
      label: 'Calls between layers have explicit response timeouts',
      rule: { type: 'exists', component: 'http-request', where: { responseTimeout: { gte: 1 } }, min: 2 },
    },
    {
      label: 'A Process API timeout is mapped to a clear status (504)',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: ['on-error-propagate', 'on-error-continue'], where: { type: 'TIMEOUT' } },
          handlerStatus('TIMEOUT', '504'),
        ],
      },
    },
  ],
  optionalSteps: [
    {
      type: 'on-error-propagate',
      flow: 'exp-web-catalog',
      why: 'The scenario asks for a clear error when the catalog is slow, which the timeout handler gives. Mapping an unknown category to 404 and other failures to 502 is a good extra.',
    },
    {
      type: 'on-error-propagate',
      flow: 'prc-catalog-category',
      why: 'This handler only logs the error and passes it on, which Mule does by default.',
    },
  ],
  referenceFlow: design(
    flow(
      'exp-web-catalog',
      source('http-listener', { path: '/exp-web/v1/categories/{categoryId}/products', allowedMethods: 'GET' }),
      [
        step('set-variable', {
          variableName: 'cacheKey',
          value: '#[attributes.uriParams.categoryId ++ ":" ++ (attributes.queryParams.locale default "en-GB")]',
        }),
        scope('cache', { cachingStrategy: 'catalog-10min (key = vars.cacheKey, TTL 600 s, max 2000 entries)' }, [
          step('http-request', {
            method: 'GET',
            path: '/prc-catalog/v1/categories/{categoryId}/products?locale={locale}',
            responseTimeout: 4000,
          }),
        ]),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{\n  category: payload.category.name,\n  products: payload.products map {\n    id: $.productId,\n    title: $.content.title,\n    image: $.media[0].url default null,\n    badges: $.badges default []\n  }\n}',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'HTTP:TIMEOUT' }, [
          step('set-variable', { variableName: 'httpStatus', value: '504' }),
          step('set-payload', { value: '#[output application/json --- { message: "Catalog is taking too long, please retry" }]' }),
        ]),
        handler('on-error-propagate', { type: 'HTTP:NOT_FOUND' }, [step('set-variable', { variableName: 'httpStatus', value: '404' })]),
        handler('on-error-propagate', { type: 'ANY' }, [step('set-variable', { variableName: 'httpStatus', value: '502' })]),
      ],
    ),
    flow(
      'prc-catalog-category',
      source('http-listener', { path: '/prc-catalog/v1/categories/{categoryId}/products', allowedMethods: 'GET' }),
      [
        router('scatter-gather', { timeout: 3500 }, [
          route({}, [step('http-request', { method: 'GET', path: '/sys-pim/v1/products?category={categoryId}', responseTimeout: 3000 })]),
          route({}, [step('http-request', { method: 'GET', path: '/sys-dam/v1/assets?category={categoryId}', responseTimeout: 3000 })]),
        ]),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\nvar products = payload."0".payload\nvar media = payload."1".payload groupBy $.productId\n---\n{\n  category: { name: products[0].categoryName default "" },\n  products: products map (p) -> p ++ { media: media[p.productId] default [] }\n}',
        }),
      ],
      [handler('on-error-propagate', { type: 'ANY' }, [step('logger', { level: 'ERROR', message: '#[error.description]' })])],
    ),
  ),
  description: `
A retailer's **website** renders category pages (product tiles: title, image, badges). The data comes from the **Catalog Process API**, which merges the PIM (product content) and the DAM (images). That Process API is slow: **p95 3 s**, because the PIM is slow — and it is also used by the stores' kiosk app and the marketing feed.

Facts:
- Category pages get **~400 req/s** at peak, but there are only ~1,500 category × locale combinations.
- Product content changes a few times a day; **10 minutes of staleness is acceptable** to the business.
- The web team wants **p95 < 300 ms** and a clear error (not a hang) if the catalog is slow.
- The web front end authenticates to the Experience API with a **client id/secret** issued in Exchange.

**Convention for API-led problems:** one canvas holds the whole application network. Draw each API as a separate flow whose name starts with its layer prefix (\`exp-\`, \`prc-\`, \`sys-\`), give it an HTTP Listener whose path shows the API (e.g. \`/exp-web/v1/categories/{categoryId}/products\`), and let layers call each other with HTTP Request pointing at the lower API's path.

**Design the flow(s):** the Experience API (where the cache goes, its key and TTL, timeouts, error mapping) and the Process API it calls. Say where client id enforcement lives.
`,
  answerTemplate: `## Layers

## Where to cache and why

## Cache key and TTL

## Timeouts and errors

## Security (client id)
`,
  keyPoints: [
    'Caching the Process API response in the Experience API turns ~400 req/s into about one call per key every 10 minutes; p95 drops to cache-hit latency.',
    'The cache key must contain everything that changes the response (category + locale) — and nothing user-specific, or the hit rate collapses and data can leak between users.',
    'TTL follows the business tolerance (10 minutes) and the object store gets a max-entries limit; personalised data (prices per customer, stock) would not be cached here.',
    'Explicit timeouts per hop (4 s exp → 3.5 s process → 3 s system) and HTTP:TIMEOUT mapped to 504 give the web a clear failure instead of a hang.',
    'Client id enforcement and rate limiting are API Manager policies on the Experience API, not flow logic.',
  ],
  solution: `
\`\`\`
   Website  --(client_id / client_secret: API Manager policy)-->
 +---------------------------------------------------------------+
 | exp-web-catalog                                  EXPERIENCE   |
 |   key = categoryId:locale                                     |
 |   Cache scope (TTL 600 s, max 2000 entries)                   |
 |     HTTP GET /prc-catalog/v1/categories/{id}/products (4 s)  |
 |   DataWeave -> web tile model                                 |
 |   HTTP:TIMEOUT -> 504, NOT_FOUND -> 404, ANY -> 502           |
 +---------------------------------------------------------------+
                         |  (only on cache miss)
                         v
 +---------------------------------------------------------------+
 | prc-catalog-category        Scatter-Gather (3.5 s)  PROCESS   |
 +---------------------------------------------------------------+
            |                                  |
        sys-pim (3 s)                     sys-dam (3 s)          SYSTEM
\`\`\`

**exp-web-catalog**
1. Set Variable \`cacheKey = categoryId:locale\`.
2. **Cache** scope with a caching strategy whose key is \`vars.cacheKey\`, backed by an object store with a 600 s TTL and a max-entries limit. Inside: HTTP Request to the Process API with a 4 s response timeout.
3. Transform (outside the cache, cheap) shapes the web tile model — or put it inside to cache the final shape.
4. Errors: \`HTTP:TIMEOUT\` → 504, \`HTTP:NOT_FOUND\` → 404, anything else → 502.

**prc-catalog-category** — Scatter-Gather over \`sys-pim\` and \`sys-dam\`, merge images into products. It is reused by kiosk and feed, which may cache with different TTLs.

**Why cache in the Experience layer here?** The tolerance (10 min) is a *web* decision; the kiosk may need fresher data. If every consumer accepted the same staleness, caching in the Process API would serve everyone.

**Client id:** apply *Client ID Enforcement* (and *Rate Limiting – SLA based*) in API Manager on \`exp-web\`; the web app sends \`client_id\`/\`client_secret\` headers. The flow does not check them.
`,
  followUps: [
    {
      q: 'The web is deployed on 4 workers. Is the cache shared?',
      a: 'Only if the caching strategy uses a persistent/shared object store (Object Store v2 in CloudHub). An in-memory store gives each worker its own cache — fine for a 10-minute catalog cache, but hit rate is lower and entries can differ briefly between workers.',
    },
    {
      q: 'Marketing changes a product title and wants it live immediately. How?',
      a: 'Expose an invalidation operation (or listen for a product-changed event) that removes the affected keys from the object store, instead of shortening the TTL for everyone.',
    },
    {
      q: 'Why not use the HTTP Caching policy in API Manager instead of a Cache scope?',
      a: 'That is a valid alternative for whole-response caching of GETs and keeps the flow simpler; the Cache scope gives finer control (partial caching, custom keys, caching only one of several calls).',
    },
  ],
}

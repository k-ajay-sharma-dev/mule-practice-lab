import { design, flow, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-115',
  category: 'flows',
  title: 'Currency List API: Keep the Reference Data Answer in a Cache Scope',
  level: 'BEGINNER',
  tags: ['cache-scope', 'caching', 'http', 'http-request', 'performance'],
  estMinutes: 12,
  flowChecks: [
    { label: 'An HTTP Listener accepts GET requests', rule: { type: 'source', component: 'http-listener', where: { allowedMethods: 'GET' } } },
    {
      label: 'The call GET /reference/v1/currencies is inside the Cache scope',
      rule: { type: 'inside', component: 'http-request', within: 'cache', where: { method: 'GET', path: '/reference/v1/currencies' } },
    },
    {
      label: 'The Cache scope uses its own caching strategy, not the default one',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'cache', where: { cachingStrategy: { set: true } } },
          { type: 'exists', component: 'cache', where: { cachingStrategy: { not: 'default' } } },
        ],
      },
    },
    {
      label: 'The reshaping to the short list happens inside the Cache scope, so the small result is what gets cached',
      rule: { type: 'inside', component: 'transform', within: 'cache', where: { script: 'code' } },
    },
    {
      label: 'A Logger inside the Cache scope records each cache miss',
      rule: { type: 'inside', component: 'logger', within: 'cache', where: { message: 'miss' } },
    },
  ],
  referenceFlow: design(
    flow('currencies-api', source('http-listener', { path: '/currencies', allowedMethods: 'GET' }), [
      scope('cache', { cachingStrategy: 'currencyListCache' }, [
        step('logger', { level: 'INFO', message: 'Currency cache miss, calling the reference data API' }),
        step('http-request', { method: 'GET', path: '/reference/v1/currencies', responseTimeout: 5000 }),
        step('transform', {
          script: '%dw 2.0\noutput application/json\n---\npayload.items filter ($.active) map { code: $.isoCode, name: $.displayName, decimals: $.minorUnits }',
        }),
      ]),
    ]),
  ),
  description: `
A travel booking site shows a currency picker on every search page. The picker calls \`GET /currencies\`.

The list comes from a **reference data API** at \`GET /reference/v1/currencies\`. It answers in about **1.2 seconds** and returns 180 currencies with 40 fields each, about **300 KB**. The list changes a few times a year. The search page makes about **50 calls a second** at peak, and the reference data team has asked you to stop calling them so often.

A **Cache scope** keeps the result of the steps inside it. The first call runs the steps and stores the result. Later calls get the stored result without running the steps, until the entry expires. A **caching strategy** is the setting that says where results are kept and for how long.

**Requirements**
- Call the reference data API only when the cache has no entry.
- Return only active currencies, with the code, name and number of decimals.
- Keep the cached entry for **one hour**.
- Write a log line each time the reference API is called, so you can see the cache working.

**Design the flow.** Which steps go inside the Cache scope?
`,
  answerTemplate: `## Trigger

## What goes inside the Cache scope

## The caching strategy

## How you know the cache works
`,
  keyPoints: [
    'Steps inside a Cache scope run only on a cache miss. On a hit, the stored payload comes back at once.',
    'Put the reshaping inside the scope too, so the cache holds the small list and not the 300 KB response.',
    'A Logger inside the scope runs only on a miss, which proves the cache works.',
    'The default caching strategy does not let you choose the expiry. Define your own strategy with an Object Store and an entry time to live of one hour.',
    'By default the cache key is built from the payload. A GET has no body, so every call shares one entry, which is what this API needs.',
    'Only cache read operations whose answer is the same for every caller.',
  ],
  solution: `
1. **HTTP Listener**, path \`/currencies\`, method \`GET\`.
2. **Cache** scope with the caching strategy \`currencyListCache\`. Inside it:
   - **Logger**: "Currency cache miss, calling the reference data API".
   - **HTTP Request** \`GET /reference/v1/currencies\` with a 5 second response timeout.
   - **Transform Message** that keeps active currencies and maps \`code\`, \`name\` and \`decimals\`.

**The caching strategy.** Define \`currencyListCache\` as a global element. Give it an Object Store with an entry time to live of 1 hour. With an in-memory store, each replica keeps its own copy, which is fine for data that changes a few times a year.

**What happens at peak.** The first call after expiry takes about 1.2 seconds. The other calls in that hour take a few milliseconds. The reference data API now gets about one call per hour per replica instead of 180,000.

**Why the Transform is inside.** Whatever the scope returns is what gets stored. Reshaping inside the scope keeps the cached value small, and it also saves the work of reshaping on every hit.
`,
  followUps: [
    {
      q: 'The picker later sends ?region=EU to get a shorter list. Does the cache still work?',
      a: 'Not as it is. The default key comes from the payload, and query parameters are not part of it. Set a key expression in the caching strategy that includes the region.',
    },
    {
      q: 'A currency is withdrawn and must disappear at once. What do you do?',
      a: 'Clear the entry. You can invalidate the cache with the Invalidate Cache or Invalidate Key operation, for example from a small admin endpoint.',
    },
    {
      q: 'The reference API is down when the entry expires. What does the caller see?',
      a: 'The HTTP Request inside the scope fails and the caller gets an error. Nothing is cached for a failed call, so the next request tries again.',
    },
    {
      q: 'Would you cache a call that creates a booking?',
      a: 'No. A Cache scope must only hold read results that are the same for every caller. Caching a write would skip the write on a hit.',
    },
  ],
}

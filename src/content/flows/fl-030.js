import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-030',
  category: 'flows',
  title: 'Enriching Sales Events with a Cached Reference-Data Lookup',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'cache-scope', 'enrichment', 'object-store', 'anypoint-mq', 'performance'],
  estMinutes: 25,
  flowChecks: [
    {
      label: 'Sales events are consumed from a queue',
      rule: { type: 'source', component: ['mq-subscriber', 'jms-listener', 'vm-listener'] },
    },
    {
      label: 'The original event is kept in a variable before the lookup changes the payload',
      rule: { type: 'before', first: 'set-variable', then: 'cache' },
    },
    {
      label: 'The store lookup is wrapped in a Cache scope',
      rule: { type: 'inside', component: ['http-request', 'db-select', 'flow-ref'], within: 'cache' },
    },
    {
      label: 'The Cache scope uses a named caching strategy (key and entry lifetime), not the default',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'cache', where: { cachingStrategy: { set: true } } },
          { type: 'exists', component: 'cache', where: { cachingStrategy: { not: 'default' } } },
        ],
      },
    },
    {
      label: 'The event is merged with the cached data after the lookup',
      rule: { type: 'before', first: 'cache', then: 'transform', outside: true },
    },
    {
      label: 'The enriched event is published to sales-enriched',
      rule: { type: 'before', first: 'transform', then: 'mq-publish', thenWhere: { destination: 'sales-enriched' }, outside: true },
    },
    {
      label: 'An unknown store is handled explicitly instead of failing the whole stream',
      rule: { type: 'handler', component: ['on-error-continue', 'on-error-propagate'], errorType: 'HTTP:NOT_FOUND' },
    },
    {
      label: 'An event for an unknown store is still published, marked as unenriched',
      rule: { type: 'inside', component: 'mq-publish', within: 'on-error-continue', withinWhere: { type: 'NOT_FOUND' } },
    },
    {
      label: 'When the Store Master API is down the error propagates, so the event is redelivered, not lost (no IMMEDIATE acknowledgement)',
      rule: {
        type: 'all',
        rules: [
          { type: 'source', component: ['mq-subscriber', 'jms-listener', 'vm-listener'] },
          { type: 'absent', component: 'mq-subscriber', where: { acknowledgementMode: 'IMMEDIATE' } },
          {
            type: 'any',
            rules: [
              {
                type: 'all',
                rules: [
                  {
                    type: 'absent',
                    component: 'on-error-continue',
                    where: { type: { oneOf: ['CONNECTIVITY', 'TIMEOUT', 'SERVICE_UNAVAILABLE'] } },
                  },
                  // ANY also matches a handler with no type, since both catch everything.
                  { type: 'absent', component: 'on-error-continue', where: { type: 'ANY' } },
                ],
              },
              // With manual acknowledgement, a handler may Nack the message back to the queue instead.
              { type: 'inside', component: 'mq-nack', within: ['on-error-continue', 'on-error-propagate'] },
            ],
          },
        ],
      },
    },
  ],
  simulation: {
    systems: {
      http: [
        { method: 'GET', path: '/stores/S-0042', latencyMs: 250, respond: { status: 200, body: { id: 'S-0042', name: 'Wellington Central', region: 'NZ-North', currency: 'NZD' } } },
        { method: 'GET', path: '/stores/S-9999', latencyMs: 250, respond: { status: 404, body: { message: 'Store S-9999 not found' } } },
      ],
    },
    tests: [
      {
        name: 'A sale is enriched',
        about: 'The store is known, so the sale goes to sales-enriched with the store region and the message is acknowledged.',
        trigger: { message: { kind: 'mq', destination: 'pos-sales', payload: { saleId: 'SL-1001', storeId: 'S-0042', amount: 42.5 } } },
        expect: {
          calls: [{ method: 'GET', path: '/stores/S-0042', count: 1 }],
          sent: [{ destination: 'sales-enriched', count: 1, has: { saleId: 'SL-1001', amount: 42.5 } }],
          ack: 'acked',
          maxMs: 2000,
        },
      },
      {
        name: 'Two sales from one store',
        about: 'The second sale finds the store in the cache, so the Store Master API is called once.',
        triggers: [
          { message: { kind: 'mq', destination: 'pos-sales', payload: { saleId: 'SL-1001', storeId: 'S-0042', amount: 42.5 } } },
          { afterMs: 300, message: { kind: 'mq', destination: 'pos-sales', payload: { saleId: 'SL-1002', storeId: 'S-0042', amount: 9.9 } } },
        ],
        expect: { calls: [{ method: 'GET', path: '/stores/S-0042', count: 1 }], sent: [{ destination: 'sales-enriched', count: 2 }] },
      },
      {
        name: 'An unknown store',
        about: 'The Store Master API answers 404. The sale is still published and the message is acknowledged.',
        trigger: { message: { kind: 'mq', destination: 'pos-sales', payload: { saleId: 'SL-1003', storeId: 'S-9999', amount: 15 } } },
        expect: { sent: [{ destination: 'sales-enriched', count: 1, has: { saleId: 'SL-1003' } }], ack: 'acked' },
      },
      {
        name: 'The Store Master API is down',
        about: 'The connection is refused. Nothing is published and the message goes back to the queue.',
        trigger: { message: { kind: 'mq', destination: 'pos-sales', payload: { saleId: 'SL-1004', storeId: 'S-0042', amount: 18 } } },
        overrides: { systems: { http: [{ method: 'GET', path: '/stores/S-0042', respond: { fault: 'CONNECTIVITY' } }] } },
        expect: { notSent: ['sales-enriched'], ack: 'returned' },
      },
    ],
  },
  optionalSteps: [
    {
      type: 'on-error-propagate',
      why: 'Mule propagates the error by default, so the event is redelivered without this handler. It only adds a log line.',
    },
  ],
  referenceFlow: design(
    flow(
      'enrich-sales-events',
      source('mq-subscriber', { destination: 'pos-sales', acknowledgementMode: 'AUTO' }),
      [
        step('set-variable', { variableName: 'sale', value: '#[payload]' }),
        step('set-payload', { value: '#[vars.sale.storeId]' }),
        scope('cache', { cachingStrategy: 'store-reference-cache' }, [
          // The payload is the storeId here, so the path is built from it.
          step('http-request', { method: 'GET', path: '#["/stores/" ++ payload]', responseTimeout: 2000 }),
          step('transform', {
            script: '%dw 2.0\noutput application/java\n---\n{ storeId: payload.id, region: payload.region, storeName: payload.name, currency: payload.currency }',
          }),
        ]),
        step('transform', {
          script: '%dw 2.0\noutput application/json\n---\nvars.sale ++ { store: payload }',
        }),
        step('mq-publish', { destination: 'sales-enriched' }),
      ],
      [
        handler('on-error-continue', { type: 'HTTP:NOT_FOUND' }, [
          step('logger', { level: 'WARN', message: '#["Unknown store " ++ (vars.sale.storeId default "") ++ ", publishing unenriched"]' }),
          step('transform', {
            script: '%dw 2.0\noutput application/json\n---\nvars.sale ++ { store: null, enrichmentStatus: "UNKNOWN_STORE" }',
          }),
          step('mq-publish', { destination: 'sales-enriched' }),
        ]),
        handler('on-error-propagate', { type: 'HTTP:CONNECTIVITY, HTTP:TIMEOUT, HTTP:SERVICE_UNAVAILABLE' }, [
          step('logger', { level: 'ERROR', message: '#["Store API unavailable, message will be redelivered: " ++ error.description]' }),
        ]),
      ],
    ),
  ),
  description: `
Point-of-sale systems publish every sale to the Anypoint MQ queue \`pos-sales\`: **~400 events/s** at peak, from **1,200 stores**. A sale is \`{ saleId, storeId, amount }\`.

Downstream analytics needs each event enriched with the **store's name, region and currency**. That data lives in the **Store Master API** (REST, ~250 ms per call): \`GET /stores/{storeId}\` answers \`{ id, name, region, currency }\`, or **404** for an unknown store. It changes a few times per week, and the API owner allows at most **20 requests/s**.

- Events must reach \`sales-enriched\` within 2 s of arriving.
- An event for an unknown store must not block the stream; publish it marked as unenriched.
- If the Store Master API is down, events must not be lost.

**Design the flow(s):**
- How do you avoid calling the Store Master API 400 times a second?
- What is the cache key, where is the cache stored, and how long do entries live?
- How do you keep the original event while doing the lookup?
- How do you handle unknown stores and an unavailable Store Master API?
`,
  answerTemplate: `## Flow outline

## Cache scope and caching strategy

## Keeping the original event

## Unknown store

## Store Master API down
`,
  keyPoints: [
    'Wrap the lookup in a Cache scope: with 1,200 stores and 400 events/s, almost every lookup is a cache hit and the API sees only cache misses.',
    'Configure a named caching strategy with an explicit key (storeId) and an Object Store with entryTtl (e.g. 12 h), instead of the default SHA-256 payload key and in-memory store.',
    'Save the event in a variable (or use a target) before the lookup, then merge event + store data in a Transform after the scope.',
    'A failed lookup raises an error out of the Cache scope; HTTP:NOT_FOUND is handled with On Error Continue and the event is published unenriched.',
    'Connectivity errors propagate so the message is redelivered (and dead-lettered after the queue max-deliveries), so no events are lost.',
  ],
  solution: `
**Flow \`enrich-sales-events\`**
1. **Anypoint MQ Subscriber** \`pos-sales\`.
2. \`vars.sale = payload\`, then set the payload to \`vars.sale.storeId\` so the cache key is small and stable.
3. **Cache scope** with caching strategy \`store-reference-cache\`:
   - key generation expression \`#[payload]\` (the storeId)
   - **Object Store** \`entryTtl = 12 h\`, on Object Store v2 so all replicas and restarts share it (Max Entries is not configurable on Object Store v2; use \`maxEntries\` only on a local store)
   - inside: **HTTP Request** \`GET /stores/{storeId}\` (the payload is the storeId, so the path can be \`#["/stores/" ++ payload]\` or a URI parameter set from \`payload\`) → Transform to a small Java map (no streams, which cannot be cached)
4. **Transform** \`vars.sale ++ { store: payload }\` → **MQ Publish** \`sales-enriched\`.
5. **Errors:**
   - \`HTTP:NOT_FOUND\` → **On Error Continue**: log WARN, publish the event with \`enrichmentStatus: "UNKNOWN_STORE"\`.
   - Connectivity / timeout / 503 → **On Error Propagate**: the MQ subscriber does not ack and the message is redelivered later; after max deliveries it goes to the DLQ.

On a cold start, 1,200 cache misses are spread over a few seconds. To smooth this out, prime the cache with a Scheduler that loads all stores once, or limit the subscriber's concurrency during warm-up.
`,
  followUps: [
    {
      q: 'Why not store all stores in a variable at startup?',
      a: 'A variable is per event and per replica. You would need a custom refresh mechanism. The Cache scope + Object Store gives you TTL-based refresh and, on Object Store v2, sharing across replicas for free.',
    },
    {
      q: 'What makes a payload non-cacheable?',
      a: 'Consumable streams (e.g. a raw HTTP response body). The cache stores the scope result, so convert it into a Java object or a repeatable, serialisable value inside the scope.',
    },
    {
      q: 'How would you invalidate a single store when it changes?',
      a: 'Subscribe to a store-changed event (or expose an admin endpoint) and remove the key from the caching strategy\'s Object Store, or use invalidate-key on the caching strategy.',
    },
  ],
}

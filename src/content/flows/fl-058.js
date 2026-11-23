import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'
import { handlerStatus } from '../../flow/rules.js'

export default {
  id: 'fl-058',
  category: 'flows',
  title: 'Price Change API: Update Oracle, then Announce on an ActiveMQ Topic',
  level: 'BEGINNER',
  tags: ['myproject', 'retail', 'pricing', 'activemq', 'jms', 'topic', 'oracle', 'api'],
  estMinutes: 25,
  flowChecks: [
    { label: 'Price changes arrive on an HTTP listener (POST /prices)', rule: { type: 'source', component: 'http-listener', where: { path: 'price' } } },
    { label: 'The request is validated (SKU present, price > 0)', rule: { type: 'exists', component: 'validation' } },
    {
      label: 'Validation happens before Oracle is touched',
      rule: { type: 'before', first: 'validation', then: ['db-update', 'db-insert', 'db-stored-procedure'] },
    },
    {
      label: 'Oracle is updated before the change event is published',
      rule: { type: 'before', first: ['db-update', 'db-insert', 'db-stored-procedure'], then: 'jms-publish' },
    },
    {
      label: 'The change is published to the retail.price.changed topic',
      rule: { type: 'exists', component: 'jms-publish', where: { destination: 'retail.price.changed', destinationType: 'TOPIC' } },
    },
    {
      label: 'An unknown SKU/zone (0 rows updated) is detected with a Choice',
      rule: { type: 'before', first: 'db-update', then: 'choice' },
    },
    {
      label: 'Nothing is published for an unknown SKU/zone: the check comes before the publish',
      rule: {
        type: 'any',
        rules: [
          { type: 'before', first: 'choice', then: 'jms-publish', outside: true },
          { type: 'inside', component: 'jms-publish', within: 'choice' },
        ],
      },
    },
    { label: 'Bad input is answered with 400', rule: handlerStatus('VALIDATION', '400') },
    {
      label: 'An unknown SKU/zone is answered with 404',
      rule: {
        type: 'any',
        rules: [
          { type: 'all', rules: [{ type: 'inside', component: 'raise-error', within: 'choice' }, handlerStatus('APP:', '404')] },
          { type: 'inside', component: 'set-variable', where: { value: '404' }, within: 'choice' },
        ],
      },
    },
    {
      label: 'A broker outage has its own error mapping (JMS error type) and asks the tool to retry with 503',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: ['on-error-propagate', 'on-error-continue'], where: { type: 'JMS:' } },
          handlerStatus('JMS:', '503'),
        ],
      },
    },
  ],
  simulation: {
    systems: {
      db: {
        tables: {
          ITEM_PRICE: {
            columns: ['SKU', 'PRICE_ZONE', 'PRICE', 'EFFECTIVE_FROM', 'CHANGED_BY', 'CHANGED_AT'],
            key: ['SKU', 'PRICE_ZONE'],
            rows: [
              { SKU: 'DRS-1042-BLK', PRICE_ZONE: 'UK', PRICE: 49.99, EFFECTIVE_FROM: '2026-09-01', CHANGED_BY: 'buyer.amir', CHANGED_AT: '2026-08-28T15:02:00Z' },
              { SKU: 'DRS-1042-BLK', PRICE_ZONE: 'IE', PRICE: 54.99, EFFECTIVE_FROM: '2026-09-01', CHANGED_BY: 'buyer.amir', CHANGED_AT: '2026-08-28T15:02:00Z' },
            ],
          },
        },
        latencyMs: 25,
      },
    },
    tests: [
      {
        name: 'A price is marked down',
        about: 'The UK price row is updated and one change event goes to the topic.',
        trigger: { http: { method: 'POST', path: '/api/prices', body: { sku: 'DRS-1042-BLK', zone: 'UK', price: 39.99, currency: 'GBP', effectiveFrom: '2026-11-14', changedBy: 'buyer.jane' } } },
        expect: {
          status: 200,
          db: { ITEM_PRICE: { has: [{ SKU: 'DRS-1042-BLK', PRICE_ZONE: 'UK', PRICE: 39.99 }, { PRICE_ZONE: 'IE', PRICE: 54.99 }] } },
          sent: [{ destination: 'retail.price.changed', count: 1, has: { sku: 'DRS-1042-BLK', zone: 'UK', price: 39.99 } }],
          maxMs: 1000,
        },
      },
      {
        name: 'The price is zero',
        about: 'Bad input gets 400. Oracle is not touched and nothing is announced.',
        trigger: { http: { method: 'POST', path: '/api/prices', body: { sku: 'DRS-1042-BLK', zone: 'UK', price: 0, currency: 'GBP', effectiveFrom: '2026-11-14', changedBy: 'buyer.jane' } } },
        expect: { status: 400, db: { ITEM_PRICE: { lacks: [{ PRICE: 0 }] } }, notSent: ['retail.price.changed'] },
      },
      {
        name: 'The SKU is not priced in that zone',
        about: 'After a good UK change, a change for zone FR matches no row. The tool gets 404 and only the UK change is announced.',
        triggers: [
          { http: { method: 'POST', path: '/api/prices', body: { sku: 'DRS-1042-BLK', zone: 'UK', price: 39.99, currency: 'GBP', effectiveFrom: '2026-11-14', changedBy: 'buyer.jane' } } },
          { http: { method: 'POST', path: '/api/prices', body: { sku: 'DRS-1042-BLK', zone: 'FR', price: 44.99, currency: 'EUR', effectiveFrom: '2026-11-14', changedBy: 'buyer.jane' } } },
        ],
        expect: { status: 404, sent: [{ destination: 'retail.price.changed', count: 1 }, { destination: 'retail.price.changed', count: 0, has: { zone: 'FR' } }] },
      },
      {
        name: 'The broker is down',
        about: 'The price is saved but the event cannot be published, so the tool gets 503 and retries.',
        trigger: { http: { method: 'POST', path: '/api/prices', body: { sku: 'DRS-1042-BLK', zone: 'IE', price: 44.99, currency: 'EUR', effectiveFrom: '2026-11-14', changedBy: 'buyer.jane' } } },
        overrides: { systems: { queues: { 'retail.price.changed': { fault: true } } } },
        expect: { status: 503, db: { ITEM_PRICE: { has: [{ PRICE_ZONE: 'IE', PRICE: 44.99 }] } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'post-price-change',
      source('http-listener', { path: '/api/prices', allowedMethods: 'POST' }),
      [
        step('validation', { check: 'is-not-blank-string', expression: '#[payload.sku]', message: 'sku is required' }),
        step('validation', { check: 'is-true', expression: '#[(payload.price default 0) > 0]', message: 'price must be greater than 0' }),
        step('set-variable', { variableName: 'change', value: '#[payload]' }),
        step('db-update', {
          database: 'Oracle',
          sql: 'UPDATE ITEM_PRICE\nSET PRICE = :price, EFFECTIVE_FROM = :effectiveFrom, CHANGED_BY = :changedBy, CHANGED_AT = SYSTIMESTAMP\nWHERE SKU = :sku AND PRICE_ZONE = :zone',
        }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[payload.affectedRows == 0]' }, [
              step('raise-error', { type: 'APP:NOT_FOUND', description: '#["No price row for " ++ vars.change.sku ++ " in zone " ++ vars.change.zone]' }),
            ]),
          ],
          { otherwise: [step('logger', { level: 'INFO', message: '#["Price updated for " ++ vars.change.sku]' })] },
        ),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{\n  eventType: "PRICE_CHANGED",\n  sku: vars.change.sku,\n  zone: vars.change.zone,\n  price: vars.change.price,\n  currency: vars.change.currency default "USD",\n  effectiveFrom: vars.change.effectiveFrom,\n  publishedAt: now()\n}',
        }),
        // destinationType TOPIC, persistent delivery; subscribers: e-commerce, POS gateway, shelf-label system.
        step('jms-publish', { destination: 'retail.price.changed', destinationType: 'TOPIC', persistentDelivery: 'true' }),
        step('set-payload', { value: '#[output application/json --- { status: "UPDATED", sku: vars.change.sku, zone: vars.change.zone }]' }),
      ],
      [
        handler('on-error-propagate', { type: 'VALIDATION:INVALID_BOOLEAN, VALIDATION:BLANK_STRING, VALIDATION:EMPTY_COLLECTION' }, [
          step('set-variable', { variableName: 'httpStatus', value: '400' }),
          step('set-payload', { value: '#[output application/json --- { error: error.description }]' }),
        ]),
        handler('on-error-propagate', { type: 'APP:NOT_FOUND' }, [
          step('set-variable', { variableName: 'httpStatus', value: '404' }),
          step('set-payload', { value: '#[output application/json --- { error: error.description }]' }),
        ]),
        handler('on-error-propagate', { type: 'JMS:CONNECTIVITY' }, [
          step('logger', { level: 'ERROR', message: '#["Price saved but event not published for " ++ vars.change.sku]' }),
          step('set-variable', { variableName: 'httpStatus', value: '503' }),
          step('set-payload', { value: '#[output application/json --- { error: "Price saved, notification pending - please retry" }]' }),
        ]),
      ],
    ),
  ),
  description: `
A clothing retailer's pricing tool calls an integration API whenever a buyer changes a price: \`POST /api/prices\` with \`{ sku, zone, price, currency, effectiveFrom, changedBy }\`. Around **5,000 changes a day**, in bursts of a few hundred when a markdown is approved.

- The master price lives in an **Oracle** table \`ITEM_PRICE\` (one row per SKU and price zone), with \`SKU\`, \`PRICE_ZONE\`, \`PRICE\`, \`EFFECTIVE_FROM\`, \`CHANGED_BY\` and \`CHANGED_AT\`. The \`zone\` of a request is its \`PRICE_ZONE\`.
- A price must be greater than 0 and the \`sku\` must not be blank.
- After the update, an event must go to the **ActiveMQ topic** \`retail.price.changed\`; three consumers subscribe (e-commerce site, POS gateway, electronic shelf labels). The event is JSON with \`eventType: "PRICE_CHANGED"\`, \`sku\`, \`zone\`, \`price\`, \`currency\` and \`effectiveFrom\`.
- The pricing tool expects **400** for bad input, **404** when the SKU/zone row does not exist, **503** when it should retry.
- Response time target: under 1 second.

**What each system sends back**
- A Database Update answers \`{ "affectedRows": 1 }\`. \`0\` means no row has that SKU and zone. It replaces the payload, so keep the request in a variable to build the event.
- JMS Publish returns nothing you need.

**What failures look like**
- A blank \`sku\` raises \`VALIDATION:BLANK_STRING\`; an Is true check on the price raises \`VALIDATION:INVALID_BOOLEAN\`. Answer **400** and touch nothing.
- No row matched: no error is raised. Check \`affectedRows\` and raise your own \`APP:\` error, answer **404**, and publish nothing.
- The broker is down: JMS Publish raises \`JMS:CONNECTIVITY\`. The price is already saved; answer **503** so the tool retries.

**Design the flow(s).**
`,
  answerTemplate: `## Trigger and validation

## Oracle update

## Publishing the event

## Error responses
`,
  keyPoints: [
    'Validate the request first (Validation module) so bad input never reaches Oracle.',
    'Database Update with named parameters; its result has affectedRows, so 0 rows means unknown SKU/zone → 404.',
    'Publish to a JMS topic (destinationType TOPIC) only after the DB update succeeded, so subscribers never see a price that is not in the master.',
    'A topic gives every subscriber its own copy; durable subscriptions (or ActiveMQ virtual topics) stop offline consumers missing changes.',
    'Map error types to statuses: validation → 400, APP:NOT_FOUND → 404, JMS:CONNECTIVITY → 503 so the caller retries (the update is idempotent).',
  ],
  solution: `
1. **HTTP Listener** \`POST /api/prices\`; the listener response uses \`#[vars.httpStatus default 200]\` for the status code.
2. **Validate**: \`sku\` not empty, \`price > 0\` (is-true). Failures raise \`VALIDATION:*\` errors → 400.
3. **Database Update** \`UPDATE ITEM_PRICE SET PRICE = :price ... WHERE SKU = :sku AND PRICE_ZONE = :zone\` (autocommit, single statement).
4. **Choice** on \`payload.affectedRows == 0\` → **Raise Error** \`APP:NOT_FOUND\` → 404.
5. **Transform Message** builds the event (sku, zone, price, effectiveFrom).
6. **JMS Publish** to \`retail.price.changed\` with \`destinationType="TOPIC"\` and persistent delivery.
7. Return \`{ status: "UPDATED" }\`.

**If the broker is down** the price is already saved. Return 503 so the pricing tool retries: repeating the same UPDATE is harmless (idempotent) and the event is then published. For a stronger guarantee use an outbox table written in the same transaction as the price and a poller that publishes it.

**Topic consumers:** plain topic subscribers miss messages while offline. Use durable subscriptions, or in ActiveMQ Classic a **virtual topic** (\`VirtualTopic.retail.price.changed\`) where each consumer reads its own queue (\`Consumer.ECOM.VirtualTopic.retail.price.changed\`).
`,
  followUps: [
    {
      q: 'Why not publish first and update Oracle afterwards?',
      a: 'If the update then fails, subscribers have already applied a price that the master does not have. Write the system of record first, then announce.',
    },
    {
      q: 'What is the difference between a durable subscriber and an ActiveMQ virtual topic?',
      a: 'A durable subscription keeps messages for one named subscriber while it is offline but allows only one active consumer per subscription. A virtual topic copies each message into a queue per consumer group, so each group gets queue semantics such as load balancing and DLQs.',
    },
    {
      q: 'How would you guarantee the event is published even if the broker is down for an hour?',
      a: 'Write an outbox row in the same Oracle transaction as the price update and have a scheduled flow publish pending outbox rows and mark them sent.',
    },
  ],
}

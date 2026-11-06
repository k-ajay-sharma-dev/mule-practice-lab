import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-058',
  category: 'flows',
  title: 'Price Change API: Update Oracle, then Announce on an ActiveMQ Topic',
  level: 'BEGINNER',
  tags: ['retail', 'pricing', 'activemq', 'jms', 'topic', 'oracle', 'api'],
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
    { label: 'The change is published to a price topic', rule: { type: 'exists', component: 'jms-publish', where: { destination: 'price' } } },
    {
      label: 'An unknown SKU/zone (0 rows updated) is detected with a Choice',
      rule: { type: 'before', first: 'db-update', then: 'choice' },
    },
    {
      label: 'A broker outage has its own error mapping (JMS error type)',
      rule: { type: 'exists', component: ['on-error-propagate', 'on-error-continue'], where: { type: 'JMS:' } },
    },
  ],
  referenceFlow: design(
    flow(
      'post-price-change',
      source('http-listener', { path: '/api/prices', allowedMethods: 'POST' }),
      [
        step('validation', { check: 'is-not-blank-string', expression: '#[payload.sku]', message: 'sku is required' }),
        step('validation', { check: 'is-true', expression: '#[(payload.price default 0) > 0]', message: 'price must be greater than 0' }),
        step('set-variable', { variableName: 'change', value: '#[payload]' }),
        step('db-update', {
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
A fashion retailer's pricing tool calls an integration API whenever a buyer changes a price: \`POST /api/prices\` with \`{ sku, zone, price, currency, effectiveFrom, changedBy }\`. Around **5,000 changes a day**, in bursts of a few hundred when a markdown is approved.

- The master price lives in an **Oracle** table \`ITEM_PRICE\` (one row per SKU and price zone).
- After the update, an event must go to the **ActiveMQ topic** \`retail.price.changed\`; three consumers subscribe (e-commerce site, POS gateway, electronic shelf labels).
- The pricing tool expects **400** for bad input, **404** when the SKU/zone row does not exist, **503** when it should retry.
- Response time target: under 1 second.

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
2. **Validate** — \`sku\` not empty, \`price > 0\` (is-true). Failures raise \`VALIDATION:*\` errors → 400.
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

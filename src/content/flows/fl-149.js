import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

const change = (sku, price, at) => ({ message: { kind: 'mq', destination: 'price-changes', payload: { sku, price, changedAt: `2026-11-18T14:${at}Z` } } })
const pending = (rows) => ({ db: { tables: { pending_prices: { key: 'sku', rows } } } })
const listing = (respond) => ({ http: [{ method: 'PUT', path: '/marketplace/v2/listings/{sku}/price', respond }] })
const ok = { status: 200, body: { updated: true } }
const tick = { schedule: {} }

export default {
  id: 'fl-149',
  category: 'flows',
  title: 'Forty Price Changes a Minute for One Product: Keep Only the Latest in a Table, Push Once a Minute, and Never Lose a Change That Lands During the Push',
  level: 'EXPERT',
  tags: ['myproject', 'debounce', 'coalescing', 'database', 'upsert', 'scheduler', 'anypoint-mq', 'marketplace'],
  estMinutes: 55,
  flowChecks: [
    { label: 'Price changes are read from the price-changes queue', rule: { type: 'source', component: 'mq-subscriber', where: { destination: 'price-changes' } } },
    { label: 'The queue flow never calls the marketplace itself', rule: { type: 'all', rules: [{ type: 'exists', component: 'http-request' }, { type: 'absent', component: 'http-request', inFlowWith: { component: 'mq-subscriber' } }] } },
    {
      label: 'Each change is upserted into pending_prices, one row per SKU',
      rule: { type: 'exists', component: 'db-insert', where: { sql: { all: ['pending_prices', 'on conflict', 'changed_at'] } } },
    },
    { label: 'A Scheduler pushes what is pending', rule: { type: 'source', component: 'scheduler' } },
    {
      label: 'A pushed row is deleted only after its call, and only if it has not changed since it was read',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'db-delete', within: 'foreach', where: { sql: { all: ['pending_prices', 'version'] } } },
          { type: 'before', first: 'http-request', then: 'db-delete' },
        ],
      },
    },
    { label: 'A failed push for one SKU is caught inside the loop, so the others still go', rule: { type: 'inside', component: 'on-error-continue', within: 'foreach' } },
  ],
  simulation: {
    systems: { ...pending([]), ...listing(ok) },
    tests: [
      {
        name: 'Three changes in one minute',
        about: 'A repricing run changes SKU KB-210 three times in a minute. One row waits, holding the last price.',
        triggers: [change('KB-210', 52.0, '00:05'), change('KB-210', 49.5, '00:21'), change('KB-210', 47.99, '00:48')],
        expect: { db: { pending_prices: { count: 1, has: [{ sku: 'KB-210', price: 47.99 }] } }, calls: [{ method: 'PUT', path: '/marketplace/v2/listings/{sku}/price', count: 0 }] },
      },
      {
        name: 'An older change arrives late',
        about: 'The change from 14:00:21 is delivered after the one from 14:00:48. The newer price stays.',
        triggers: [change('KB-210', 47.99, '00:48'), change('KB-210', 49.5, '00:21')],
        expect: { db: { pending_prices: { count: 1, has: [{ sku: 'KB-210', price: 47.99 }] } } },
      },
      {
        name: 'Changes then the push',
        about: 'Three changes for one SKU and one for another, then the minute ends. The marketplace gets one call per SKU with the last price, and nothing is left pending.',
        triggers: [change('KB-210', 52.0, '00:05'), change('KB-210', 47.99, '00:48'), change('MS-077', 18.5, '00:30'), { ...tick, afterMs: 20000 }],
        expect: {
          calls: [
            { method: 'PUT', path: '/marketplace/v2/listings/KB-210/price', count: 1, has: { price: 47.99 } },
            { method: 'PUT', path: '/marketplace/v2/listings/MS-077/price', count: 1, has: { price: 18.5 } },
          ],
          db: { pending_prices: { count: 0 } },
        },
      },
      {
        name: 'The marketplace refuses one SKU',
        about: 'The marketplace answers 503 for MS-077. KB-210 is pushed and cleared. MS-077 stays pending for the next minute, with a WARN.',
        trigger: tick,
        overrides: {
          systems: {
            ...pending([
              { sku: 'KB-210', price: 47.99, changed_at: '2026-11-18T14:00:48Z', version: 3 },
              { sku: 'MS-077', price: 18.5, changed_at: '2026-11-18T14:00:30Z', version: 1 },
            ]),
            ...listing((req) => (req.params.sku === 'MS-077' ? { status: 503, body: { message: 'Try later' } } : ok)),
          },
        },
        expect: { noError: true, db: { pending_prices: { count: 1, has: [{ sku: 'MS-077' }] } }, logs: [{ level: 'WARN' }] },
      },
    ],
  },
  referenceFlow: design(
    flow('collect-price-changes', source('mq-subscriber', { destination: 'price-changes' }), [
      step('db-insert', {
        database: 'PostgreSQL',
        sql: 'INSERT INTO pending_prices (sku, price, changed_at, version) VALUES (:sku, :price, :changedAt, 1) ON CONFLICT (sku) DO UPDATE SET price = EXCLUDED.price, changed_at = EXCLUDED.changed_at, version = pending_prices.version + 1 WHERE EXCLUDED.changed_at > pending_prices.changed_at',
        inputParameters: '#[{ sku: payload.sku, price: payload.price, changedAt: payload.changedAt }]',
      }),
    ]),
    flow('push-prices', source('scheduler', { strategy: 'fixed-frequency', frequency: 60, timeUnit: 'SECONDS' }), [
      step('db-select', { database: 'PostgreSQL', sql: 'SELECT sku, price, version FROM pending_prices ORDER BY changed_at' }),
      scope('foreach', { collection: '#[payload]' }, [
        step('set-variable', { variableName: 'row', value: '#[payload]' }),
        scope('try', {}, [
          step('set-payload', { value: '#[output application/json --- { price: vars.row.price, currency: "GBP" }]' }),
          step('http-request', { method: 'PUT', path: '#["/marketplace/v2/listings/" ++ vars.row.sku ++ "/price"]', responseTimeout: 10000 }),
          step('db-delete', {
            database: 'PostgreSQL',
            sql: 'DELETE FROM pending_prices WHERE sku = :sku AND version = :version',
            inputParameters: '#[{ sku: vars.row.sku, version: vars.row.version }]',
          }),
        ], {
          errorHandlers: [handler('on-error-continue', { type: 'ANY' }, [step('logger', { level: 'WARN', message: '#["Price for " ++ vars.row.sku ++ " not pushed, kept for the next run: " ++ error.description]' })])],
        }),
      ]),
    ]),
  ),
  description: `
An electronics seller lists its products on an online **marketplace**. Prices come from the seller's pricing engine, which publishes every change on the Anypoint MQ queue **\`price-changes\`**:

\`{ "sku": "KB-210", "price": 47.99, "changedAt": "2026-11-18T14:00:48Z" }\`

During a repricing run the engine can change one product **40 times a minute**. Today Mule sends every change to the marketplace at once:

\`PUT /marketplace/v2/listings/{sku}/price\` with \`{ "price", "currency": "GBP" }\`

The marketplace has warned the seller: more than one price update per product per minute counts as abuse, and repeat offenders lose their listings.

**Requirements**
- Send **at most one** update per SKU per minute, with the **latest** price.
- Changes can be delivered out of order. An older change must never replace a newer price.
- A change that arrives while a push is running must not be lost.
- If the marketplace refuses one SKU, push the others, and try that SKU again next minute.

You may use a PostgreSQL table \`pending_prices\` (\`sku\` primary key, \`price\`, \`changed_at\`, \`version\`).

**Design the flows.**
`,
  answerTemplate: `## Taking in changes

## Keeping only the latest

## Pushing once a minute

## A change during the push

## When the marketplace refuses
`,
  keyPoints: [
    'Split taking in from sending out. The queue flow only records the latest price per SKU; a Scheduler sends what is pending once a minute.',
    'An upsert keyed by SKU keeps one row per product however many changes arrive. That is debouncing, or coalescing, in a table.',
    'Guard the upsert with WHERE EXCLUDED.changed_at > pending_prices.changed_at, so a late, older change does not win.',
    'Bump a version with every change. The push deletes a row only if its version is still the one it read, so a change that landed during the push stays for next minute.',
    'Put the call and the delete in a Try with On Error Continue inside the For Each. A refused SKU keeps its row and the loop goes on.',
    'The table also survives a restart, which an in-memory buffer would not.',
  ],
  solution: `
**Flow \`collect-price-changes\`**
1. **Anypoint MQ Subscriber** on \`price-changes\`.
2. **Database Insert**:
   \`\`\`sql
   INSERT INTO pending_prices (sku, price, changed_at, version)
   VALUES (:sku, :price, :changedAt, 1)
   ON CONFLICT (sku) DO UPDATE
     SET price = EXCLUDED.price, changed_at = EXCLUDED.changed_at, version = pending_prices.version + 1
     WHERE EXCLUDED.changed_at > pending_prices.changed_at
   \`\`\`

**Flow \`push-prices\`**
1. **Scheduler** every 60 seconds.
2. **Database Select** \`SELECT sku, price, version FROM pending_prices ORDER BY changed_at\`.
3. **For Each** row: **Set Variable** \`row\`, then a **Try**:
   - **Set Payload** \`{ price, currency: "GBP" }\`, **HTTP Request** \`PUT /marketplace/v2/listings/{sku}/price\`.
   - **Database Delete** \`DELETE FROM pending_prices WHERE sku = :sku AND version = :version\`.
   - **On Error Continue**: log a WARN. The row stays.

**Why the version.** Between the Select and the Delete, the queue flow may have written a newer price. A delete by SKU alone would remove it, and that price would never reach the marketplace. With the version in the WHERE clause, the delete changes no row, and next minute pushes the new price.

**At most once a minute.** A run takes far less than a minute for a few hundred SKUs. If a run could take longer, two runs could overlap and push one SKU twice in a minute; keep the app on one replica for the Scheduler, or take a lock row at the start of a run.
`,
  followUps: [
    {
      q: 'A row was cleared after an older change, then the late change arrives. What happens?',
      a: 'The table has no row for that SKU any more, so the late change is inserted and pushed next minute, setting an old price. Keep the last pushed changed_at per SKU in a second table and ignore anything older.',
    },
    {
      q: 'Why not use an Object Store with the SKU as key?',
      a: 'An Object Store keeps the latest value per key well, but it has no conditional write on a timestamp and no delete that checks a version. Two replicas could then lose a change.',
    },
    {
      q: 'The marketplace adds a bulk endpoint for 500 prices at a time. What changes?',
      a: 'The push reads up to 500 rows, sends them in one call, and deletes them by SKU and version in one statement. Read the answer for SKUs it refused and leave those rows.',
    },
  ],
}

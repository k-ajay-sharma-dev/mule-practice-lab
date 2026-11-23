import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const prices = [
  { supplier_id: 'SUP-311', sku: 'BLT-M8-50', price: 0.42, changed_on: '2026-09-01' },
  { supplier_id: 'SUP-311', sku: 'NUT-M8', price: 0.09, changed_on: '2026-09-01' },
  { supplier_id: 'SUP-311', sku: 'WSH-M8', price: 0.05, changed_on: '2026-09-01' },
  { supplier_id: 'SUP-502', sku: 'BLT-M8-50', price: 0.45, changed_on: '2026-10-15' },
]
const upload = (supplierId, items) => ({ http: { method: 'POST', path: `/suppliers/${supplierId}/price-list`, body: { effectiveFrom: '2026-12-01', items } } })

export default {
  id: 'fl-137',
  category: 'flows',
  title: 'Supplier Price List Upload: Insert New SKUs, Update Changed Prices, Leave Equal Prices Alone, and Count All Three',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'foreach', 'database', 'choice', 'upsert', 'variables', 'procurement'],
  estMinutes: 30,
  flowChecks: [
    {
      label: 'The API is a POST on /suppliers/{supplierId}/price-list',
      rule: { type: 'source', component: 'http-listener', where: { path: { all: ['/suppliers/{supplierId}', '/price-list'] }, allowedMethods: 'POST' } },
    },
    { label: 'Each item\'s current price is read inside a For Each', rule: { type: 'inside', component: 'db-select', within: 'foreach', where: { sql: 'supplier_prices' } } },
    { label: 'A new SKU is inserted on its own Choice route', rule: { type: 'inside', component: 'db-insert', within: 'choice', where: { sql: 'supplier_prices' } } },
    { label: 'A changed price is updated on its own Choice route', rule: { type: 'inside', component: 'db-update', within: 'choice', where: { sql: 'supplier_prices' } } },
    {
      label: 'The counts start before the loop and the answer is built after it',
      rule: {
        type: 'all',
        rules: [
          { type: 'before', first: 'set-variable', firstWhere: { variableName: 'inserted' }, then: 'foreach', outside: true },
          { type: 'before', first: 'foreach', then: 'set-payload', thenWhere: { value: 'vars.unchanged' }, outside: true },
        ],
      },
    },
  ],
  simulation: {
    systems: { db: { tables: { supplier_prices: { key: ['supplier_id', 'sku'], rows: prices } } } },
    tests: [
      {
        name: 'One of each',
        about: 'The list has a new SKU, a changed price and a price that is the same. The answer counts one of each.',
        trigger: upload('SUP-311', [
          { sku: 'BLT-M8-50', price: 0.44 },
          { sku: 'NUT-M8', price: 0.09 },
          { sku: 'SCR-4X40', price: 0.03 },
        ]),
        expect: {
          status: 200,
          bodyHas: { supplierId: 'SUP-311', inserted: 1, updated: 1, unchanged: 1 },
          db: {
            supplier_prices: {
              count: 5,
              has: [
                { supplier_id: 'SUP-311', sku: 'BLT-M8-50', price: 0.44, changed_on: '2026-12-01' },
                { supplier_id: 'SUP-311', sku: 'SCR-4X40', price: 0.03, changed_on: '2026-12-01' },
              ],
            },
          },
        },
      },
      {
        name: 'A price that did not change is not written',
        about: 'The nut costs 0.09 as before. Its row keeps the date it last changed, so the audit trail shows no change.',
        trigger: upload('SUP-311', [{ sku: 'NUT-M8', price: 0.09 }, { sku: 'WSH-M8', price: 0.05 }]),
        expect: {
          status: 200,
          bodyHas: { inserted: 0, updated: 0, unchanged: 2 },
          db: { supplier_prices: { has: [{ supplier_id: 'SUP-311', sku: 'NUT-M8', changed_on: '2026-09-01' }, { supplier_id: 'SUP-311', sku: 'WSH-M8', changed_on: '2026-09-01' }] } },
        },
      },
      {
        name: 'A first list from a new supplier',
        about: 'Supplier SUP-777 has no prices yet. Every item is inserted and nothing is updated.',
        trigger: upload('SUP-777', [
          { sku: 'BLT-M8-50', price: 0.4 },
          { sku: 'NUT-M8', price: 0.08 },
        ]),
        expect: { status: 200, bodyHas: { inserted: 2, updated: 0, unchanged: 0 }, db: { supplier_prices: { count: 6 } } },
      },
      {
        name: 'Another supplier sells the same SKU',
        about: 'SUP-502 also sells the M8 bolt. Its new price changes its own row only, not the one from SUP-311.',
        trigger: upload('SUP-502', [{ sku: 'BLT-M8-50', price: 0.47 }]),
        expect: {
          status: 200,
          bodyHas: { inserted: 0, updated: 1, unchanged: 0 },
          db: { supplier_prices: { has: [{ supplier_id: 'SUP-502', sku: 'BLT-M8-50', price: 0.47 }, { supplier_id: 'SUP-311', sku: 'BLT-M8-50', price: 0.42 }] } },
        },
      },
    ],
  },
  referenceFlow: design(
    flow('upload-price-list', source('http-listener', { path: '/suppliers/{supplierId}/price-list', allowedMethods: 'POST' }), [
      step('set-variable', { variableName: 'supplierId', value: '#[attributes.uriParams.supplierId]' }),
      step('set-variable', { variableName: 'effectiveFrom', value: '#[payload.effectiveFrom]' }),
      step('set-variable', { variableName: 'inserted', value: '#[0]' }),
      step('set-variable', { variableName: 'updated', value: '#[0]' }),
      step('set-variable', { variableName: 'unchanged', value: '#[0]' }),
      scope('foreach', { collection: '#[payload.items]' }, [
        step('db-select', {
          database: 'SQL Server',
          sql: 'SELECT price FROM supplier_prices WHERE supplier_id = :supplierId AND sku = :sku',
          inputParameters: '#[{ supplierId: vars.supplierId, sku: payload.sku }]',
          target: 'current',
        }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[isEmpty(vars.current)]' }, [
              step('db-insert', {
                database: 'SQL Server',
                sql: 'INSERT INTO supplier_prices (supplier_id, sku, price, changed_on) VALUES (:supplierId, :sku, :price, :changedOn)',
                inputParameters: '#[{ supplierId: vars.supplierId, sku: payload.sku, price: payload.price, changedOn: vars.effectiveFrom }]',
                target: 'written',
              }),
              step('set-variable', { variableName: 'inserted', value: '#[vars.inserted + 1]' }),
            ]),
            route({ expression: '#[vars.current[0].price != payload.price]' }, [
              step('db-update', {
                database: 'SQL Server',
                sql: 'UPDATE supplier_prices SET price = :price, changed_on = :changedOn WHERE supplier_id = :supplierId AND sku = :sku',
                inputParameters: '#[{ supplierId: vars.supplierId, sku: payload.sku, price: payload.price, changedOn: vars.effectiveFrom }]',
                target: 'written',
              }),
              step('set-variable', { variableName: 'updated', value: '#[vars.updated + 1]' }),
            ]),
          ],
          { otherwise: [step('set-variable', { variableName: 'unchanged', value: '#[vars.unchanged + 1]' })] },
        ),
      ]),
      step('set-payload', {
        value: '#[output application/json --- { supplierId: vars.supplierId, inserted: vars.inserted, updated: vars.updated, unchanged: vars.unchanged }]',
      }),
    ]),
  ),
  description: `
A building supplies wholesaler takes **price lists** from its suppliers. Prices live in a SQL Server table \`supplier_prices\` with the columns \`supplier_id\`, \`sku\`, \`price\` and \`changed_on\`. The key is the supplier and the SKU together, because several suppliers sell the same SKU.

A supplier portal calls:

\`POST /suppliers/{supplierId}/price-list\` with \`{ "effectiveFrom": "2026-12-01", "items": [ { "sku": "BLT-M8-50", "price": 0.44 }, ... ] }\`

**Requirements**
- A SKU the supplier has no row for is **inserted**, with \`changed_on\` set to \`effectiveFrom\`.
- A SKU whose price is different is **updated**: the new price, and \`changed_on\` set to \`effectiveFrom\`.
- A SKU whose price is the same is **not written at all**. The table has an audit trigger on UPDATE, and the finance team does not want thousands of audit rows that change nothing.
- Answer **200** with \`{ "supplierId", "inserted", "updated", "unchanged" }\`.
- Only touch the rows of the supplier in the URL.

Lists are a few hundred lines, sent once a month.

**Facts**
- Keep the three counts in variables named \`inserted\`, \`updated\` and \`unchanged\`.

**Design the flow.**

**What each system sends back**
- A Database **Select** answers a list of rows with the column names as written, for example \`[ { "price": 0.42 } ]\`. For a SKU the supplier has no row for, the list is empty.
- Database **Insert** and **Update** answer \`{ "affectedRows": 1 }\`. Store the answers in a target variable, so the payload still holds the price list item.
`,
  answerTemplate: `## The endpoint

## For each item: read the current price

## Insert, update or leave alone

## Counting and the answer
`,
  keyPoints: [
    'Read the current row for each item first, into a Target variable, so the payload is still the item.',
    'A Choice with three outcomes: no row means insert, a different price means update, otherwise do nothing.',
    'Check for no row first. With no row, vars.current[0].price is null, and null differs from any price.',
    'Start the counts before the loop. Variables set inside a For Each are still there after it, so the loop can add to them.',
    'Use the supplier and the SKU in every WHERE clause. The SKU alone would change another supplier\'s price.',
    'A plain upsert writes equal prices too, so it breaks the audit rule. A MERGE with a condition on the matched rows can avoid that, but the counts then take more work.',
  ],
  solution: `
1. **HTTP Listener**: \`POST /suppliers/{supplierId}/price-list\`.
2. **Set Variable** \`supplierId\` from \`attributes.uriParams.supplierId\`, \`effectiveFrom\` from the body, and \`inserted\`, \`updated\`, \`unchanged\` = \`0\`.
3. **For Each** over \`#[payload.items]\`:
   - **Database Select**, Target \`current\`:
     \`\`\`sql
     SELECT price FROM supplier_prices WHERE supplier_id = :supplierId AND sku = :sku
     \`\`\`
   - **Choice**:
     - \`#[isEmpty(vars.current)]\`: **Database Insert**, then \`inserted\` + 1.
     - \`#[vars.current[0].price != payload.price]\`: **Database Update** \`UPDATE supplier_prices SET price = :price, changed_on = :changedOn WHERE supplier_id = :supplierId AND sku = :sku\`, then \`updated\` + 1.
     - Otherwise: \`unchanged\` + 1.
4. **Set Payload**: \`{ supplierId, inserted, updated, unchanged }\`.

**Why the insert and update have a Target too.** A Database Insert or Update puts its result in the payload. With a Target, the payload is still the item, which keeps the loop clear to read.

**One call per item.** A few hundred items a month is a few hundred quick reads, which is fine. For lists of many thousands, load the list into a staging table with a Bulk Insert and let one set of SQL statements compare the two tables.
`,
  followUps: [
    {
      q: 'Should the whole list be saved in one transaction?',
      a: 'If a half-loaded list is worse than none, yes: put the loop in a Try with a transaction, so a failure part way undoes the rows already written, and the supplier sends the list again.',
    },
    {
      q: 'Prices come as text such as "0.090" from some suppliers. Does the comparison still work?',
      a: 'Not as text: "0.090" and 0.09 are different strings. Coerce the price to a Number before the comparison and before the write.',
    },
    {
      q: 'How would you report SKUs that the supplier dropped from the list?',
      a: 'Collect the SKUs of the list in a variable, then after the loop select the supplier\'s SKUs that are not in it, and return them in the answer or mark them as withdrawn.',
    },
  ],
}

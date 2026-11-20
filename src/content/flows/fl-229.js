import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const post = (qty) => ({ http: { method: 'POST', path: '/transfers', body: { fromStore: '0412', toStore: '0415', sku: 'KETTLE-SS-17', qty } } })
const stock = (store, qty) => ({ store_id: store, sku: 'KETTLE-SS-17', qty })
const tables = () => ({
  store_stock: { key: ['store_id', 'sku'], rows: [stock('0412', 9), stock('0415', 1)] },
  stock_transfers: { key: 'transfer_id', columns: ['transfer_id', 'from_store', 'to_store', 'sku', 'qty'], rows: [] },
})

export default {
  id: 'fl-229',
  category: 'flows',
  title: 'A Stock Transfer Between Two Stores in Oracle: Debit, Credit and the Transfer Row in One Transaction, and 409 When the Shelf Is Short',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'oracle', 'transaction', 'rollback', 'http', 'stock'],
  estMinutes: 30,
  flowChecks: [
    { label: 'Transfers are accepted on POST /transfers', rule: { type: 'source', component: 'http-listener', where: { path: '/transfers', allowedMethods: 'POST' } } },
    {
      label: 'The debit, the credit and the transfer row are in one transaction',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'db-update', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'qty - :qty' }, min: 1 },
          { type: 'inside', component: 'db-update', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'qty + :qty' } },
          { type: 'inside', component: 'db-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'stock_transfers' } },
        ],
      },
    },
    { label: 'The debit only takes stock that is there', rule: { type: 'exists', component: 'db-update', where: { sql: { all: ['qty - :qty', 'qty >= :qty'] } } } },
    { label: 'Too little stock raises an error inside the transaction', rule: { type: 'inside', component: 'raise-error', within: 'try' } },
  ],
  simulation: {
    systems: { db: { tables: tables() } },
    tests: [
      {
        name: 'Move 4 kettles',
        about: 'Store 0412 goes from 9 to 5, store 0415 from 1 to 5, and the transfer is recorded. The answer is 201.',
        trigger: post(4),
        expect: {
          status: 201,
          db: { store_stock: { has: [{ store_id: '0412', qty: 5 }, { store_id: '0415', qty: 5 }] }, stock_transfers: { count: 1, has: [{ from_store: '0412', to_store: '0415', qty: 4 }] } },
        },
      },
      {
        name: 'More than the shelf holds',
        about: 'Store 0412 has 9 and 12 are asked for. The answer is 409 and neither store changes.',
        trigger: post(12),
        expect: { status: 409, db: { store_stock: { has: [{ store_id: '0412', qty: 9 }, { store_id: '0415', qty: 1 }] }, stock_transfers: { count: 0 } } },
      },
      {
        name: 'The credit fails',
        about: 'The debit works, then the credit fails. The rollback puts the 4 kettles back in 0412, so no stock disappears.',
        trigger: post(4),
        overrides: { systems: { db: { failWhen: [{ match: 'qty + :qty', fault: 'QUERY_EXECUTION', description: 'ORA-00060: deadlock detected' }] } } },
        expect: { status: 500, db: { store_stock: { has: [{ store_id: '0412', qty: 9 }, { store_id: '0415', qty: 1 }] }, stock_transfers: { count: 0 } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'store-transfer-api',
      source('http-listener', { path: '/transfers', allowedMethods: 'POST' }),
      [
        step('set-variable', { variableName: 't', value: '#[payload]' }),
        step('set-variable', { variableName: 'transferId', value: '#[uuid()]' }),
        scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
          step('db-update', {
            database: 'Oracle',
            sql: 'UPDATE store_stock SET qty = qty - :qty WHERE store_id = :fromStore AND sku = :sku AND qty >= :qty',
            inputParameters: '#[{ qty: vars.t.qty, fromStore: vars.t.fromStore, sku: vars.t.sku }]',
            target: 'debit',
          }),
          router('choice', {}, [route({ expression: '#[vars.debit.affectedRows == 0]' }, [step('raise-error', { type: 'APP:INSUFFICIENT_STOCK', description: 'Not enough stock to move' })])]),
          step('db-update', {
            database: 'Oracle',
            sql: 'UPDATE store_stock SET qty = qty + :qty WHERE store_id = :toStore AND sku = :sku',
            inputParameters: '#[{ qty: vars.t.qty, toStore: vars.t.toStore, sku: vars.t.sku }]',
            target: 'credit',
          }),
          step('db-insert', {
            database: 'Oracle',
            sql: 'INSERT INTO stock_transfers (transfer_id, from_store, to_store, sku, qty) VALUES (:transferId, :fromStore, :toStore, :sku, :qty)',
            inputParameters: '#[{ transferId: vars.transferId, fromStore: vars.t.fromStore, toStore: vars.t.toStore, sku: vars.t.sku, qty: vars.t.qty }]',
            target: 'recorded',
          }),
        ]),
        step('set-variable', { variableName: 'httpStatus', value: '201' }),
        step('set-payload', { value: '#[output application/json --- { transferId: vars.transferId, status: "DONE" }]' }),
      ],
      [
        handler('on-error-continue', { type: 'APP:INSUFFICIENT_STOCK' }, [
          step('set-variable', { variableName: 'httpStatus', value: '409' }),
          step('set-payload', { value: '#[output application/json --- { message: "Store " ++ vars.t.fromStore ++ " does not have " ++ (vars.t.qty as String) ++ " of " ++ vars.t.sku }]' }),
        ]),
      ],
    ),
  ),
  description: `
Marrow & Pine Home, a fictional homewares retailer, lets store managers move stock between stores. Stock is in the Oracle table \`store_stock\` (\`store_id\`, \`sku\`, \`qty\`). Each move is recorded in \`stock_transfers\` (\`transfer_id\`, \`from_store\`, \`to_store\`, \`sku\`, \`qty\`).

\`\`\`json
POST /transfers
{ "fromStore": "0412", "toStore": "0415", "sku": "KETTLE-SS-17", "qty": 4 }
\`\`\`

The first version ran three statements one after another. When the credit failed on a deadlock, the kettles left one store and never arrived at the other.

**Requirements**
- Take the stock from \`fromStore\` only if it has enough. Otherwise answer **409** with a message, and change nothing.
- Debit, credit and the transfer row happen together or not at all.
- Answer **201** \`{ transferId, status: "DONE" }\` when it works. Any other failure answers 500 and changes nothing.

**Facts**
- Check the stock in the debit itself: \`... SET qty = qty - :qty WHERE ... AND qty >= :qty\`. Its result's \`affectedRows\` is 0 when the stock is short; then raise an error inside the transaction.
- Make the \`transferId\` with \`uuid()\`.
- Put the status code in the variable \`httpStatus\`. The listener answers with it. An error you do not catch answers 500.

**Design the flow.**
`,
  answerTemplate: `## One transaction

## Not enough stock

## When a statement fails
`,
  keyPoints: [
    'A Try with ALWAYS_BEGIN makes the three statements one unit. Any error that leaves the Try rolls all of them back.',
    'Put the check in the UPDATE itself: WHERE qty >= :qty. Then affectedRows says whether the stock was there, with no gap between a read and a write.',
    'Raise an error when affectedRows is 0. The error rolls the transaction back and lets a handler turn it into 409.',
    'The handler sits outside the Try, so the rollback has already happened when it builds the 409.',
    'Lock order matters for deadlocks: two transfers in opposite directions can wait on each other. Updating the two rows in a fixed order (lower store ID first) avoids it.',
  ],
  solution: `
1. **HTTP Listener** \`POST /transfers\`. **Set Variable** \`t\` and \`transferId\`.
2. **Try** ALWAYS_BEGIN:
   - **Database Update** \`SET qty = qty - :qty WHERE store_id = :fromStore AND sku = :sku AND qty >= :qty\`, Target \`debit\`.
   - **Choice** \`vars.debit.affectedRows == 0\`: **Raise Error** \`APP:INSUFFICIENT_STOCK\`.
   - **Database Update** the credit, Target \`credit\`.
   - **Database Insert** into \`stock_transfers\`.
3. \`httpStatus\` 201 and \`{ transferId, status }\`.
4. Flow **On Error Continue** for \`APP:INSUFFICIENT_STOCK\`: \`httpStatus\` 409 and a message. Other errors fall to the default handler and answer 500.

**A store or SKU that does not exist on the credit side.** The credit then updates 0 rows. Check its affectedRows the same way and raise an error, so stock is never debited into nowhere.
`,
  followUps: [
    {
      q: 'Why not SELECT the stock first and compare in DataWeave?',
      a: 'Another transfer can take the stock between the select and the update. The condition in the UPDATE is checked and applied in one step.',
    },
    {
      q: 'The transfer must also send a message to the WMS. Can it join the transaction?',
      a: 'Only with XA, which both resources must support. A lighter way is an outbox row in the same Oracle transaction, sent by a relay afterwards.',
    },
  ],
}

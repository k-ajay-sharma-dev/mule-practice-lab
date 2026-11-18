import { design, flow, source, step } from '../../flow/dsl.js'

const item = (supplierId, itemId, caseQty, description) => ({ supplierId, itemId, caseQty, description })
const doc = (messageId, items) => ({ message: { kind: 'jms', destination: 'SUPPLIER.ITEM.WORK', payload: { messageId, items } } })
const existing = [
  { supplier_id: 'SUP-OAKLEY', item_id: 'LAMP-OAK-01', case_qty: 4, description: 'Oak table lamp', message_id: 'MSG-51001' },
  { supplier_id: 'SUP-OAKLEY', item_id: 'LAMP-OAK-02', case_qty: 4, description: 'Oak floor lamp', message_id: 'MSG-51001' },
]
const tables = () => ({ stg_supplier_item: { key: ['supplier_id', 'item_id'], columns: ['supplier_id', 'item_id', 'case_qty', 'description', 'message_id'], rows: structuredClone(existing) } })
const items = [item('SUP-OAKLEY', 'LAMP-OAK-01', 6, 'Oak table lamp'), item('SUP-OAKLEY', 'SHADE-LIN-30', 10, 'Linen shade 30 cm'), item('SUP-WEAVE', 'RUG-WOOL-160', 1, 'Wool rug 160 cm')]

export default {
  id: 'fl-226',
  category: 'flows',
  title: 'Supplier Items Resent With Changes: MERGE Into the Oracle Staging Table So a Known Item Is Updated, Not Refused With ORA-00001',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'oracle', 'merge', 'upsert', 'jms', 'staging', 'bulk'],
  estMinutes: 30,
  flowChecks: [
    { label: 'Item documents are read from SUPPLIER.ITEM.WORK', rule: { type: 'source', component: 'jms-listener', where: { destination: 'SUPPLIER.ITEM.WORK' } } },
    {
      label: 'Items are written with a MERGE on supplier and item, in one bulk call',
      rule: { type: 'exists', component: ['db-bulk-update', 'db-bulk-insert'], where: { sql: { all: ['MERGE INTO stg_supplier_item', 'supplier_id', 'item_id', 'WHEN MATCHED', 'WHEN NOT MATCHED'] } } },
    },
    {
      label: 'No plain INSERT into stg_supplier_item is left beside the MERGE',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: ['db-bulk-update', 'db-bulk-insert'], where: { sql: 'MERGE' } },
          { type: 'absent', component: ['db-insert', 'db-bulk-insert'], where: { sql: 'INSERT INTO stg_supplier_item' } },
        ],
      },
    },
  ],
  simulation: {
    systems: { db: { tables: tables() } },
    tests: [
      {
        name: 'A known item and two new ones',
        about: 'LAMP-OAK-01 is already staged with a case of 4; it is updated to 6. The two new items are inserted. Nothing fails on the key.',
        trigger: doc('MSG-51077', items),
        expect: {
          noError: true,
          ack: 'acked',
          db: {
            stg_supplier_item: {
              count: 4,
              has: [{ item_id: 'LAMP-OAK-01', case_qty: 6, message_id: 'MSG-51077' }, { item_id: 'LAMP-OAK-02', case_qty: 4 }, { supplier_id: 'SUP-WEAVE', item_id: 'RUG-WOOL-160' }],
            },
          },
        },
      },
      {
        name: 'The whole document again',
        about: 'The platform resends MSG-51077. Every row already matches, so each is updated in place and the table still holds 4 rows.',
        triggers: [doc('MSG-51077', items), doc('MSG-51077', items)],
        expect: { noError: true, ack: ['acked', 'acked'], db: { stg_supplier_item: { count: 4 } } },
      },
    ],
  },
  referenceFlow: design(
    flow('supplier-item-merge', source('jms-listener', { destination: 'SUPPLIER.ITEM.WORK', ackMode: 'AUTO' }), [
      step('set-variable', { variableName: 'messageId', value: '#[payload.messageId]' }),
      step('transform', {
        script: '%dw 2.0\noutput application/java\n---\npayload.items map ((i) -> { supplier_id: i.supplierId, item_id: i.itemId, case_qty: i.caseQty, description: i.description, message_id: vars.messageId })',
      }),
      step('db-bulk-update', {
        database: 'Oracle',
        sql: 'MERGE INTO stg_supplier_item t USING (SELECT :supplier_id AS supplier_id, :item_id AS item_id, :case_qty AS case_qty, :description AS description, :message_id AS message_id FROM dual) s ON (t.supplier_id = s.supplier_id AND t.item_id = s.item_id) WHEN MATCHED THEN UPDATE SET t.case_qty = s.case_qty, t.description = s.description, t.message_id = s.message_id WHEN NOT MATCHED THEN INSERT (supplier_id, item_id, case_qty, description, message_id) VALUES (s.supplier_id, s.item_id, s.case_qty, s.description, s.message_id)',
      }),
      step('logger', { level: 'INFO', message: '#["Merged " ++ (sizeOf(payload) as String) ++ " items from " ++ vars.messageId]' }),
    ]),
  ),
  description: `
Marrow & Pine Home, a fictional homewares retailer, receives supplier item documents from the planning platform on the JMS queue \`SUPPLIER.ITEM.WORK\`:

\`\`\`json
{ "messageId": "MSG-51077",
  "items": [ { "supplierId": "SUP-OAKLEY", "itemId": "LAMP-OAK-01", "caseQty": 6, "description": "Oak table lamp" } ] }
\`\`\`

They are loaded into the Oracle staging table \`stg_supplier_item\` (\`supplier_id\`, \`item_id\`, \`case_qty\`, \`description\`, \`message_id\`), with a unique key on \`supplier_id\` + \`item_id\`.

The flow used a Bulk Insert. When a supplier corrected an item and the platform sent it again, Oracle refused the whole batch with **ORA-00001: unique constraint violated**, and the message went round the queue until someone deleted it.

**Requirements**
- Read documents from \`SUPPLIER.ITEM.WORK\`.
- An item already staged gets its new values and message ID. A new item is inserted.
- Write all items of a document in one bulk call. A resent document must never fail on the key.

**Design the flow.**
`,
  answerTemplate: `## Why the insert failed

## The MERGE

## Writing in bulk
`,
  keyPoints: [
    'MERGE matches each source row on the key: matched rows are updated, the rest inserted. A repeat is no longer an error.',
    'In Oracle the source is usually SELECT :a AS a, ... FROM dual, one row per record in the bulk call.',
    'Recent versions of the Database connector accept a MERGE in the Bulk Update operation; check the version you run, or use a stored procedure that takes the whole list.',
    'Update the message ID too. Support can then see which document last changed each item.',
    'Catching ORA-00001 and retrying row by row also works, but it hides real key problems and is slow. MERGE says what you mean.',
  ],
  solution: `
1. **JMS On New Message** on \`SUPPLIER.ITEM.WORK\`.
2. **Set Variable** \`messageId\`.
3. **Transform** the items to rows with the column names.
4. **Database Bulk Update**:
\`\`\`sql
MERGE INTO stg_supplier_item t
USING (SELECT :supplier_id AS supplier_id, :item_id AS item_id, :case_qty AS case_qty,
              :description AS description, :message_id AS message_id FROM dual) s
ON (t.supplier_id = s.supplier_id AND t.item_id = s.item_id)
WHEN MATCHED THEN UPDATE SET t.case_qty = s.case_qty, t.description = s.description, t.message_id = s.message_id
WHEN NOT MATCHED THEN INSERT (supplier_id, item_id, case_qty, description, message_id)
  VALUES (s.supplier_id, s.item_id, s.case_qty, s.description, s.message_id)
\`\`\`
5. **Logger** with the count.

**Two consumers merging the same new item at once.** Both can find no match and both insert, and one gets ORA-00001 after all. That is rare; let the message be redelivered, and the second try matches.
`,
  followUps: [
    {
      q: 'An older document arrives after a newer one. What does MERGE do?',
      a: 'It overwrites the newer values. Add a version or sent time column and a WHERE on the update: WHEN MATCHED THEN UPDATE ... WHERE s.sent_at > t.sent_at.',
    },
    {
      q: 'When is a plain insert still the right choice?',
      a: 'When a repeat really is an error you must see, such as a payment. Then the key violation is the signal, and the handler should say so.',
    },
  ],
}

import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const item = (n, gtin = `0501234567${String(8900 + n).padStart(4, '0')}`) => ({ supplierItemId: `SI-${n}`, gtin, supplierId: 'HALDEN-FILTERS', costPrice: 4.1 + n })
const items = [1, 2, 3, 4, 5].map((n) => item(n))
const withGap = items.map((i) => (i.supplierItemId === 'SI-3' ? { ...i, gtin: null } : i))
const msg = { message: { kind: 'jms', destination: 'PDH.SUPPLIERITEM.WORK', payload: { messageId: 'MSG-93010', senderId: 'HALDEN-FILTERS', blobName: 'inbound/HALDEN-FILTERS/MSG-93010.json' } } }
const tables = {
  stg_supplier_item: { columns: ['message_id', 'supplier_item_id', { name: 'gtin', notNull: true }, 'supplier_id', 'cost_price'], rows: [] },
  pdh_rejects: { columns: ['message_id', 'record_key', 'reason'], rows: [] },
}

export default {
  id: 'fl-170',
  category: 'flows',
  title: 'A 200,000 Line SupplierItem Blob Into Oracle Staging: Bulk Insert in a Batch Aggregator, Fall Back to Row by Row When a Group Fails',
  level: 'ADVANCED',
  tags: ['myproject', 'azure-blob', 'batch', 'batch-aggregator', 'bulk-insert', 'oracle', 'jms', 'error-handling', 'gs1'],
  estMinutes: 45,
  flowChecks: [
    { label: 'SupplierItem work is read from PDH.SUPPLIERITEM.WORK', rule: { type: 'source', component: 'jms-listener', where: { destination: 'PDH.SUPPLIERITEM.WORK' } } },
    { label: 'The document is downloaded from pdh-inbound before the Batch Job', rule: { type: 'before', first: 'azure-download-blob', firstWhere: { container: 'pdh-inbound' }, then: 'batch-job' } },
    { label: 'A Batch Aggregator bulk inserts each group into stg_supplier_item', rule: { type: 'inside', component: 'db-bulk-insert', within: 'batch-aggregator', where: { sql: 'stg_supplier_item' } } },
    {
      label: 'The bulk insert runs in its own transaction, so a failed group leaves no rows behind',
      rule: { type: 'inside', component: 'db-bulk-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' } },
    },
    {
      label: 'When a group fails, its records are inserted one by one',
      rule: { type: 'inside', component: 'db-insert', within: 'foreach', where: { sql: 'stg_supplier_item' } },
    },
    { label: 'A record that fails on its own is written to pdh_rejects with the reason', rule: { type: 'inside', component: 'db-insert', within: 'on-error-continue', where: { sql: 'pdh_rejects' } } },
    { label: 'On Complete logs the counts', rule: { type: 'inside', component: 'logger', within: 'batch-job', inSlot: 'onComplete' } },
  ],
  simulation: {
    systems: { db: { tables }, calls: { 'azure-download-blob': { payload: { senderDocumentId: 'HF-SI-20261113', items: withGap } } } },
    tests: [
      {
        name: 'One record has no GTIN',
        about: 'The group with SI-3 fails as a bulk insert. It is loaded again row by row: four rows reach staging and SI-3 goes to pdh_rejects.',
        trigger: msg,
        expect: {
          ack: 'acked',
          db: {
            stg_supplier_item: { count: 4, lacks: [{ supplier_item_id: 'SI-3' }] },
            pdh_rejects: { count: 1, has: [{ message_id: 'MSG-93010', record_key: 'SI-3' }] },
          },
          logs: [{ level: 'INFO', has: 'loaded' }],
        },
      },
      {
        name: 'A clean file',
        about: 'Every record is good. The bulk insert loads them all and nothing is rejected.',
        trigger: msg,
        overrides: { systems: { calls: { 'azure-download-blob': { payload: { senderDocumentId: 'HF-SI-20261114', items } } } } },
        expect: { db: { stg_supplier_item: { count: 5 }, pdh_rejects: { count: 0 } } },
      },
      {
        name: 'Blob storage is down',
        about: 'The document cannot be downloaded. No job starts, and the work goes back to the broker.',
        trigger: msg,
        overrides: { systems: { calls: { 'azure-download-blob': { fault: { type: 'AZURE-STORAGE:CONNECTIVITY', description: 'Unable to reach the storage account' } } } } },
        expect: { ack: 'returned', db: { stg_supplier_item: { count: 0 } } },
      },
    ],
  },
  referenceFlow: design(
    flow('pdh-load-supplier-items', source('jms-listener', { destination: 'PDH.SUPPLIERITEM.WORK', ackMode: 'AUTO' }), [
      step('set-variable', { variableName: 'messageId', value: '#[payload.messageId]' }),
      step('azure-download-blob', { container: 'pdh-inbound', fileName: '#[payload.blobName]' }),
      step('set-payload', { value: '#[payload.items map ((i) -> { message_id: vars.messageId, supplier_item_id: i.supplierItemId, gtin: i.gtin, supplier_id: i.supplierId, cost_price: i.costPrice })]' }),
      router(
        'batch-job',
        { jobName: 'pdh-supplier-item-load', blockSize: 500, maxFailedRecords: -1 },
        [
          route({ name: 'load-staging', acceptPolicy: 'NO_FAILURES' }, [
            scope('batch-aggregator', { size: 500 }, [
              scope('try', {}, [
                scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
                  step('db-bulk-insert', {
                    database: 'Oracle',
                    sql: 'INSERT INTO stg_supplier_item (message_id, supplier_item_id, gtin, supplier_id, cost_price) VALUES (:message_id, :supplier_item_id, :gtin, :supplier_id, :cost_price)',
                  }),
                ]),
              ], {
                errorHandlers: [
                  handler('on-error-continue', { type: 'DB:QUERY_EXECUTION' }, [
                    step('logger', { level: 'WARN', message: '#["Bulk insert of " ++ (sizeOf(payload) as String) ++ " records failed, loading them one by one"]' }),
                    scope('foreach', { collection: '#[payload]' }, [
                      scope('try', {}, [
                        step('db-insert', {
                          database: 'Oracle',
                          sql: 'INSERT INTO stg_supplier_item (message_id, supplier_item_id, gtin, supplier_id, cost_price) VALUES (:message_id, :supplier_item_id, :gtin, :supplier_id, :cost_price)',
                          inputParameters: '#[payload]',
                        }),
                      ], {
                        errorHandlers: [
                          handler('on-error-continue', { type: 'DB:QUERY_EXECUTION' }, [
                            step('db-insert', {
                              database: 'Oracle',
                              sql: 'INSERT INTO pdh_rejects (message_id, record_key, reason) VALUES (:messageId, :recordKey, :reason)',
                              inputParameters: '#[{ messageId: payload.message_id, recordKey: payload.supplier_item_id, reason: error.description }]',
                            }),
                          ]),
                        ],
                      }),
                    ]),
                  ]),
                ],
              }),
            ]),
          ]),
        ],
        {
          onComplete: [
            step('logger', {
              level: 'INFO',
              message: '#["SupplierItem " ++ vars.messageId ++ " loaded: total=" ++ (payload.totalRecords as String) ++ " successful=" ++ (payload.successfulRecords as String) ++ " failed=" ++ (payload.failedRecords as String)]',
            }),
          ],
        },
      ),
    ]),
  ),
  description: `
Copperline Home Supply' product data hub (fictional) receives SupplierItem documents from suppliers: their item number, GTIN and cost price for every part they sell. A big supplier sends 200,000 lines in one JSON blob in the Azure Blob Storage container \`pdh-inbound\`. A notification on the JMS queue \`PDH.SUPPLIERITEM.WORK\` names it:

\`{ "messageId": "MSG-93010", "senderId": "HALDEN-FILTERS", "blobName": "inbound/HALDEN-FILTERS/MSG-93010.json" }\`

The blob holds \`{ "senderDocumentId", "items": [ { "supplierItemId", "gtin", "supplierId", "costPrice" } ] }\`. The same load style is used for feeds to the supply chain planning platform, so the team wants it right once.

Oracle tables:
- \`stg_supplier_item\` (\`message_id\`, \`supplier_item_id\`, \`gtin\` NOT NULL, \`supplier_id\`, \`cost_price\`).
- \`pdh_rejects\` (\`message_id\`, \`record_key\`, \`reason\`).

Inserting 200,000 rows one at a time took over an hour. A plain bulk insert was fast, but one bad row failed its whole group, and 499 good rows were lost with it.

**Requirements**
- Download the document and load the items with a **Batch Job**, using a **Batch Aggregator** and a **bulk insert** per group.
- If a group's bulk insert fails, leave none of its rows half loaded, then insert that group's records **one by one**, so only the bad rows fail.
- Write each bad row to \`pdh_rejects\` with the database's reason.
- In **On Complete**, log the total, successful and failed counts.

**Design the flow.**
`,
  answerTemplate: `## Download and records

## Bulk insert per group

## Falling back to one by one

## Counting
`,
  keyPoints: [
    'A Batch Job splits the items into records and works through them in blocks, with progress kept on disk. A Batch Aggregator hands a step a list of records at a time, which is what a bulk insert needs.',
    'Bulk insert first, because almost every group is clean and it is many times faster than single inserts.',
    'The bulk insert sits in a Try with ALWAYS_BEGIN and no handler of its own: a failure rolls back the group, so no row is half loaded.',
    'An outer Try catches the failure and inserts the group one row at a time. Each row has its own Try, so a bad row is written to the rejects table and the next row goes on.',
    'The batch step\'s records do not fail, because every error is handled. The rejects table, not failedRecords, is the list of bad rows. On Complete still logs the job\'s counts.',
  ],
  solution: `
1. **JMS On New Message** on \`PDH.SUPPLIERITEM.WORK\`. **Set Variable** \`messageId\`.
2. **Download Blob** from \`pdh-inbound\` with \`#[payload.blobName]\`.
3. **Set Payload**: the items mapped to staging columns.
4. **Batch Job** \`pdh-supplier-item-load\`, max failed records \`-1\`:
   - Step \`load-staging\` with a **Batch Aggregator** of 500:
     - **Try** (no transaction) around a **Try** with **ALWAYS_BEGIN** holding the **Bulk Insert** into \`stg_supplier_item\`.
     - Outer Try's **On Error Continue** \`DB:QUERY_EXECUTION\`: WARN, then **For Each** record: a **Try** with **Database Insert** of the one row, and **On Error Continue** that inserts into \`pdh_rejects\` with \`error.description\`.
   - **On Complete**: **Logger** with \`totalRecords\`, \`successfulRecords\` and \`failedRecords\`.

**Why two Trys.** On Error Continue inside a transactional Try would commit the transaction. Rolling back happens in the inner Try, and the fallback runs in the outer one, outside the transaction.

**Memory.** Keep the download streamed and the aggregator size moderate. 500 rows a bulk insert is a common start; measure with real data.
`,
  followUps: [
    {
      q: 'Why not mark the bad rows as failed batch records and handle them in an ONLY_FAILURES step?',
      a: 'An aggregator processes the group as one. If it fails, every record in the group fails, good ones too. The row by row fallback finds the one bad row and keeps the rest.',
    },
    {
      q: 'The ACK to the supplier must report the reject count. Where does it go?',
      a: 'In On Complete. Count the rejects for the message ID in pdh_rejects and send the ACK there, because the flow that started the job ended long before the load did.',
    },
  ],
}

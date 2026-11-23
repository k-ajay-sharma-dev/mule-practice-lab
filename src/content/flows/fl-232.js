import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const note = { message: { kind: 'jms', destination: 'STORE.SALES.NOTIFY', payload: { messageId: 'MSG-72310', blobName: 'sales/2026-11-12/0101.json' } } }
const sale = (store, sku, units) => ({ store, sku, units, businessDate: '2026-11-12' })
const blob = [sale('0101', 'JKT-RAIN-M', 4), sale('0101', 'SOCK-WOOL-L', -2), sale('0101', 'BOTTLE-1L', 6)]
// The DBA team's procedure: moves a batch from staging to store_sales, rejects negative units, returns the counts
const procedures = {
  'SALES_LOAD.APPLY_BATCH': (args, db) => {
    const stg = db.tables.stg_store_sales.rows.filter((r) => r.batch_no === args.p_batch_no)
    let applied = 0
    let rejected = 0
    for (const r of stg) {
      if (r.units < 0) {
        r.status = 'REJECTED'
        rejected++
      } else {
        db.tables.store_sales.rows.push({ store_id: r.store_id, sku: r.sku, units: r.units, business_date: r.business_date, batch_no: r.batch_no })
        r.status = 'APPLIED'
        applied++
      }
    }
    return { p_applied: applied, p_rejected: rejected }
  },
}
const db = () => ({
  tables: {
    stg_store_sales: { columns: ['batch_no', 'store_id', 'sku', 'units', 'business_date', 'status'], rows: [] },
    store_sales: { columns: ['store_id', 'sku', 'units', 'business_date', 'batch_no'], rows: [] },
  },
  sequences: { LOAD_BATCH_SEQ: 8800 },
  procedures,
})

export default {
  id: 'fl-232',
  category: 'flows',
  title: 'Store Sales by Claim Check Into Oracle: Download the Blob, Stamp a Batch Number From a Sequence, Stage It, and Let a Procedure Apply It, All or Nothing',
  level: 'ADVANCED',
  tags: ['myproject', 'oracle', 'claim-check', 'azure-blob', 'sequence', 'staging', 'stored-procedure', 'transaction', 'jms'],
  estMinutes: 45,
  flowChecks: [
    { label: 'Notifications are read from STORE.SALES.NOTIFY', rule: { type: 'source', component: 'jms-listener', where: { destination: 'STORE.SALES.NOTIFY' } } },
    { label: 'The sales are downloaded from the blob the notification names', rule: { type: 'exists', component: 'azure-download-blob', where: { fileName: 'blobName' } } },
    { label: 'A batch number is taken from LOAD_BATCH_SEQ before staging', rule: { type: 'before', first: 'db-select', firstWhere: { sql: { all: ['LOAD_BATCH_SEQ', 'NEXTVAL'] } }, then: 'db-bulk-insert' } },
    {
      label: 'Staging and the apply procedure run in one transaction, staging first',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'db-bulk-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'stg_store_sales' } },
          { type: 'inside', component: 'db-stored-procedure', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'SALES_LOAD.APPLY_BATCH' } },
          { type: 'before', first: 'db-bulk-insert', then: 'db-stored-procedure' },
        ],
      },
    },
    { label: 'The final ACK goes to STORE.SALES.ACK after the transaction', rule: { type: 'before', first: 'try', then: 'jms-publish', thenWhere: { destination: 'STORE.SALES.ACK' }, outside: true } },
  ],
  simulation: {
    systems: { db: db(), calls: { 'azure-download-blob': { payload: blob } } },
    tests: [
      {
        name: 'A day of sales with one bad line',
        about: 'The three lines are staged with batch 8801. The procedure applies two and rejects the negative one. The ACK carries the batch number and both counts.',
        trigger: note,
        expect: {
          noError: true,
          ack: 'acked',
          db: { stg_store_sales: { count: 3, has: [{ batch_no: 8801, sku: 'SOCK-WOOL-L', status: 'REJECTED' }] }, store_sales: { count: 2, has: [{ sku: 'JKT-RAIN-M', batch_no: 8801 }] } },
          sent: [{ destination: 'STORE.SALES.ACK', count: 1, has: { messageId: 'MSG-72310', batchNo: 8801, applied: 2, rejected: 1 } }],
        },
      },
      {
        name: 'The apply procedure fails',
        about: 'The procedure fails after the staging insert. Both are rolled back, no ACK goes out, and the notification goes back to the queue for another try.',
        trigger: note,
        overrides: { systems: { db: { failWhen: [{ match: 'SALES_LOAD.APPLY_BATCH', fault: 'QUERY_EXECUTION', description: 'ORA-04068: existing state of packages has been discarded' }] } } },
        expect: { ack: 'returned', db: { stg_store_sales: { count: 0 }, store_sales: { count: 0 } }, notSent: ['STORE.SALES.ACK'] },
      },
      {
        name: 'The blob is not there',
        about: 'The download fails. Nothing is staged, no batch number is spent on it, and the message goes back to the queue.',
        trigger: note,
        overrides: { systems: { calls: { 'azure-download-blob': { fault: { type: 'AZURE-STORAGE:BLOB_NOT_FOUND', description: 'The specified blob does not exist.' } } } } },
        expect: { ack: 'returned', db: { stg_store_sales: { count: 0 } }, notSent: ['STORE.SALES.ACK'] },
      },
    ],
  },
  referenceFlow: design(
    flow('store-sales-load', source('jms-listener', { destination: 'STORE.SALES.NOTIFY', ackMode: 'AUTO' }), [
      step('set-variable', { variableName: 'note', value: '#[payload]' }),
      step('azure-download-blob', { container: 'store-sales', fileName: '#[vars.note.blobName]' }),
      step('set-variable', { variableName: 'lines', value: '#[payload]' }),
      step('db-select', { database: 'Oracle', sql: 'SELECT LOAD_BATCH_SEQ.NEXTVAL AS batch_no FROM dual', target: 'seq' }),
      step('set-variable', { variableName: 'batchNo', value: '#[vars.seq[0].batch_no]' }),
      step('transform', {
        script: '%dw 2.0\noutput application/java\n---\nvars.lines map ((s) -> { batch_no: vars.batchNo, store_id: s.store, sku: s.sku, units: s.units, business_date: s.businessDate, status: "STAGED" })',
      }),
      scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
        step('db-bulk-insert', {
          database: 'Oracle',
          sql: 'INSERT INTO stg_store_sales (batch_no, store_id, sku, units, business_date, status) VALUES (:batch_no, :store_id, :sku, :units, :business_date, :status)',
        }),
        step('db-stored-procedure', {
          database: 'Oracle',
          sql: '{ call SALES_LOAD.APPLY_BATCH(:p_batch_no, :p_applied, :p_rejected) }',
          inputParameters: '#[{ p_batch_no: vars.batchNo }]',
          target: 'applied',
        }),
      ]),
      router('choice', {}, [route({ expression: '#[vars.applied.p_rejected > 0]' }, [step('logger', { level: 'WARN', message: '#["Batch " ++ (vars.batchNo as String) ++ " rejected " ++ (vars.applied.p_rejected as String) ++ " lines"]' })])]),
      step('set-payload', { value: '#[output application/json --- { messageId: vars.note.messageId, batchNo: vars.batchNo, applied: vars.applied.p_applied, rejected: vars.applied.p_rejected }]' }),
      step('jms-publish', { destination: 'STORE.SALES.ACK', destinationType: 'QUEUE', persistentDelivery: 'true' }),
    ]),
  ),
  optionalSteps: [{ type: 'choice', why: 'The WARN for rejected lines helps support, but the ACK already carries the reject count.' }],
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, collects each store's daily sales as a JSON file in **Azure Blob Storage**, container \`store-sales\`. A small JMS notification on \`STORE.SALES.NOTIFY\` points at it (a claim check):

\`\`\`json
{ "messageId": "MSG-72310", "blobName": "sales/2026-11-12/0101.json" }
\`\`\`

The blob is a list: \`[ { "store", "sku", "units", "businessDate" } ]\`.

The DBA team owns the load into the reporting table \`store_sales\`. Their rule: apps write to the staging table \`stg_store_sales\` (\`batch_no\`, \`store_id\`, \`sku\`, \`units\`, \`business_date\`, \`status\`), every row of one load stamped with the same \`batch_no\` from the sequence \`LOAD_BATCH_SEQ\`. Then the app calls

\`\`\`sql
SALES_LOAD.APPLY_BATCH(p_batch_no IN NUMBER, p_applied OUT NUMBER, p_rejected OUT NUMBER)
\`\`\`

which checks each row, moves the good ones into \`store_sales\` and marks the bad ones \`REJECTED\` in staging.

**Requirements**
- Download the blob the notification names.
- Take one batch number for the whole file, and stage every line with status \`STAGED\`.
- Staging and the apply are all or nothing. If either fails, nothing is left in staging, no ACK goes out, and the notification goes back to the queue.
- Then publish \`{ messageId, batchNo, applied, rejected }\` to \`STORE.SALES.ACK\`.

**Facts**
- The listener's ack mode is AUTO. Do not catch errors: a failed run then returns the notification to the queue.
- Name the procedure parameters as it does: \`p_batch_no\`, \`p_applied\`, \`p_rejected\`. The result holds the outputs under those names.
- Map \`store\` to \`store_id\` and \`businessDate\` to \`business_date\`.

**What each system sends back**
- The blob download gives the file's content as the payload: \`[ { "store": "0101", "sku": "SOCK-WOOL-L", "units": -2, "businessDate": "2026-11-12" } ]\`. Keep the notification in a variable first, because the download replaces the payload.
- \`SELECT LOAD_BATCH_SEQ.NEXTVAL AS batch_no FROM dual\` answers \`[ { "batch_no": 8801 } ]\`.
- The procedure answers its outputs: \`{ "p_applied": 2, "p_rejected": 1 }\`.

**What failures look like**
- The blob is not there: the download raises an error with the description "The specified blob does not exist." (\`AZURE-STORAGE:BLOB_NOT_FOUND\` in this simulation; check the error type your connector version raises, as some versions report it as \`AZURE-STORAGE:EXECUTION\`). Nothing is staged and the notification goes back to the queue.
- The procedure fails: it raises \`DB:QUERY_EXECUTION\` with \`ORA-04068\` in \`error.description\`. The Try rolls back the staging insert, and the notification goes back to the queue.

**Design the flow.**
`,
  answerTemplate: `## The claim check

## The batch number

## Staging and apply in one transaction

## The ACK and failures
`,
  keyPoints: [
    'The notification carries only the blob name. Large documents stay in storage and the queue stays light.',
    'One batch number from a sequence ties every staging row of a load together, so the procedure, support and reports can all ask about "batch 8801".',
    'Take the number after the download works. A failed download then spends no number, though gaps are harmless anyway.',
    'The bulk insert and the procedure share one Oracle transaction. A failed apply rolls back the staging rows too, so a retry starts clean.',
    'No handler: the error reaches the listener, which does not acknowledge the message, so the broker delivers it again. Set a redelivery limit and a dead letter queue so a broken file cannot loop for ever.',
  ],
  solution: `
1. **JMS On New Message** on \`STORE.SALES.NOTIFY\`. **Set Variable** \`note\`.
2. **Azure Blob Storage Download Blob**, container \`store-sales\`, blob \`vars.note.blobName\`. **Set Variable** \`lines\`.
3. **Database Select** \`SELECT LOAD_BATCH_SEQ.NEXTVAL AS batch_no FROM dual\`. **Set Variable** \`batchNo\`.
4. **Transform** the lines to staging rows with \`batch_no\` and status \`STAGED\`.
5. **Try** ALWAYS_BEGIN: **Bulk Insert** into \`stg_store_sales\`, then **Stored Procedure** \`{ call SALES_LOAD.APPLY_BATCH(:p_batch_no, :p_applied, :p_rejected) }\`, Target \`applied\`.
6. **Choice** rejected > 0: WARN.
7. **Set Payload** the ACK, **JMS Publish** to \`STORE.SALES.ACK\`.

**A procedure that commits by itself.** If the PL/SQL has its own COMMIT, the Mule rollback cannot undo it. Ask the DBA team; the procedure should leave commits to the caller.
`,
  followUps: [
    {
      q: 'The same notification arrives twice. What happens?',
      a: 'It gets a second batch number and the sales are applied twice. Record the message ID in a processed table, in the same transaction, and skip a repeat before downloading.',
    },
    {
      q: 'Why stage at all, instead of inserting into store_sales directly?',
      a: 'Staging keeps the raw load for support, lets the DBA team own the rules in one procedure, and lets support find and replay a load by batch number.',
    },
  ],
}

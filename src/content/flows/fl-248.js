import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const name = 'SUPPLIER_ITEMS_20261113.csv'
const file = `/mnt/supplier-share/in/${name}`
const clean = 'supplier_id,item_id,unit_cost\nSUP-ORCHARD,4410021,1.85\nSUP-ORCHARD,4410187,0.95\nSUP-DALE,4410300,3.20'
const oneBad = 'supplier_id,item_id,unit_cost\nSUP-ORCHARD,4410021,1.85\nSUP-ORCHARD,4410187,\nSUP-DALE,4410300,3.20'
const tables = {
  stg_supplier_item: { columns: ['supplier_id', 'item_id', { name: 'unit_cost', notNull: true }], rows: [] },
  supplier_item_rejects: { columns: ['supplier_id', 'item_id', 'reason'], rows: [] },
}

export default {
  id: 'fl-248',
  category: 'flows',
  title: 'Supplier Items Into Oracle Through a Batch Job: a Second Step With Accept Policy ONLY_FAILURES Writes Each Failed Row to a Reject Table',
  level: 'BEGINNER',
  tags: ['myproject', 'batch', 'oracle', 'accept-policy', 'only-failures', 'reject-table', 'staging'],
  estMinutes: 25,
  flowChecks: [
    { label: 'A NO_FAILURES step inserts each item into stg_supplier_item', rule: { type: 'inside', component: 'db-insert', within: 'batch-job', routeWhere: { acceptPolicy: 'NO_FAILURES' }, where: { sql: 'stg_supplier_item' } } },
    { label: 'A step with accept policy ONLY_FAILURES writes supplier_item_rejects', rule: { type: 'inside', component: 'db-insert', within: 'batch-job', routeWhere: { acceptPolicy: 'ONLY_FAILURES' }, where: { sql: 'supplier_item_rejects' } } },
    { label: 'The file is moved to /mnt/supplier-share/done after the job is started', rule: { type: 'before', first: 'batch-job', then: 'file-move', thenWhere: { targetPath: '/mnt/supplier-share/done' }, outside: true } },
  ],
  simulation: {
    systems: { files: { [file]: clean }, db: { tables } },
    tests: [
      {
        name: 'A clean file',
        about: 'All three items reach staging. The reject step takes no record, so the reject table stays empty.',
        trigger: { file: { path: file } },
        expect: { noError: true, db: { stg_supplier_item: { count: 3 }, supplier_item_rejects: { count: 0 } }, files: { [`/mnt/supplier-share/done/${name}`]: { exists: true } } },
      },
      {
        name: 'An item with no cost',
        about: 'Item 4410187 has no unit cost, so Oracle refuses it. The other two load, and the reject step writes 4410187 with reason LOAD_FAILED.',
        trigger: { file: { path: file } },
        overrides: { systems: { files: { [file]: oneBad } } },
        expect: {
          db: {
            stg_supplier_item: { count: 2, has: [{ item_id: '4410021' }, { item_id: '4410300' }] },
            supplier_item_rejects: { count: 1, has: [{ item_id: '4410187', reason: 'LOAD_FAILED' }] },
          },
        },
      },
    ],
  },
  referenceFlow: design(
    flow('supplier-items-load', source('file-listener', { directory: '/mnt/supplier-share/in', matcher: 'SUPPLIER_ITEMS_*.csv', postAction: 'none', timeBetweenSizeCheck: 10000 }), [
      step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
      router(
        'batch-job',
        { jobName: 'supplier-items-load', blockSize: 100, maxFailedRecords: -1 },
        [
          route({ name: 'stage-item', acceptPolicy: 'NO_FAILURES' }, [
            step('transform', { script: '%dw 2.0\noutput application/java\n---\n{ supplier_id: payload.supplier_id, item_id: payload.item_id, unit_cost: if (isBlank(payload.unit_cost)) null else payload.unit_cost as Number }' }),
            step('db-insert', { database: 'Oracle', sql: 'INSERT INTO stg_supplier_item (supplier_id, item_id, unit_cost) VALUES (:supplier_id, :item_id, :unit_cost)', inputParameters: '#[payload]' }),
          ]),
          route({ name: 'record-reject', acceptPolicy: 'ONLY_FAILURES' }, [
            step('db-insert', {
              database: 'Oracle',
              sql: 'INSERT INTO supplier_item_rejects (supplier_id, item_id, reason) VALUES (:supplier_id, :item_id, :reason)',
              inputParameters: '#[{ supplier_id: payload.supplier_id, item_id: payload.item_id, reason: "LOAD_FAILED" }]',
            }),
          ]),
        ],
        {
          onComplete: [step('logger', { level: 'INFO', message: '#["Supplier items: loaded=" ++ (payload.successfulRecords as String) ++ " failed=" ++ (payload.failedRecords as String)]' })],
        },
      ),
      step('file-move', { sourcePath: '#[vars.filePath]', targetPath: '/mnt/supplier-share/done' }),
    ]),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, gets supplier item costs as files. The suppliers' portal writes \`SUPPLIER_ITEMS_<date>.csv\` to an **Azure File Share** mounted at \`/mnt/supplier-share\`, folder \`in\`. A file holds about **300,000 rows**:

\`\`\`
supplier_id,item_id,unit_cost
SUP-ORCHARD,4410021,1.85
\`\`\`

A Batch Job inserts each row into the Oracle staging table \`stg_supplier_item\` (\`unit_cost\` NOT NULL). Max failed records is already -1, so a bad row does not stop the job.

The buying team's complaint: the log says \`failed=12\`, but nobody can tell which 12 items. They want each failed row in \`supplier_item_rejects\` (\`supplier_id\`, \`item_id\`, \`reason\`), so they can chase the supplier.

**Requirements**
- Insert each row into \`stg_supplier_item\`. A blank cost goes in as null, so Oracle refuses it.
- For every row that failed, insert a reject row with reason \`LOAD_FAILED\`.
- A good row must never reach the reject table.
- Log the counts in On Complete, and move the file to \`/mnt/supplier-share/done\`.

**What each system sends back**
- The File listener gives the CSV content as the payload, so the Batch Job splits it into one record per row: \`{ "supplier_id": "SUP-ORCHARD", "item_id": "4410187", "unit_cost": "" }\`, every value as text. The full path is in \`attributes.path\`.
- In On Complete the payload is the job result, with \`successfulRecords\` and \`failedRecords\`.

**What failures look like**
- A row with no cost: Oracle refuses the null, and the Database Insert raises \`DB:QUERY_EXECUTION\` for that record. The record is marked failed and goes on to the ONLY_FAILURES step as it was when it failed.

**Design the flow.**
`,
  answerTemplate: `## The load step

## The reject step

## Accept policies

## After the job
`,
  keyPoints: [
    'Each batch step has an accept policy: NO_FAILURES (the default) takes records no earlier step failed on, ONLY_FAILURES takes only failed ones, ALL takes every record.',
    'A reject step with ONLY_FAILURES sits after the load step. A record that failed in the load step reaches it, and a good record skips it.',
    'With max failed records 0 the job stops at the first failure, so the reject step never runs. Use -1 or a limit above the failures you expect.',
    'The reject step sees the record as it reached the step that failed. Keep the keys the buyers need: supplier and item.',
    'The record still counts as failed in the job result, so On Complete shows the same number the reject table holds.',
  ],
  solution: `
1. **File On New or Updated File** on \`/mnt/supplier-share/in\`, size check wait 10 seconds. **Set Variable** \`filePath\`.
2. **Batch Job** (max failed records -1):
   - Step \`stage-item\` (NO_FAILURES): **Transform**, **Database Insert** into \`stg_supplier_item\`.
   - Step \`record-reject\` (ONLY_FAILURES): **Database Insert** into \`supplier_item_rejects\` with reason \`LOAD_FAILED\`.
   - **On Complete**: **Logger** with the counts.
3. **File Move** to \`/mnt/supplier-share/done\`.

**The real error text.** Mule keeps the error of each failed step on the record. Reading it inside a later step needs the batch error functions of your Mule version, so check the docs before you rely on them. A fixed reason works on every version.
`,
  followUps: [
    {
      q: 'The reject insert itself fails, for example the reject table is full. What then?',
      a: 'The record fails again in the reject step and is still counted as failed. Log a WARN in On Complete when the reject count and failedRecords differ.',
    },
    {
      q: 'Why not check the cost in DataWeave and skip the insert?',
      a: 'That works for known rules and saves a round trip. The ONLY_FAILURES step still catches what you did not foresee, such as a key clash or a value too long for its column.',
    },
  ],
}

import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const name = 'STORE_SALES_20261112.csv'
const file = `/mnt/scm-share/sales/in/${name}`
const clean = 'sale_id,store,sku,units\n7001,0412,4410021,3\n7002,0412,4410187,1\n7003,0415,4410300,2'
const oneBad = 'sale_id,store,sku,units\n7001,0412,4410021,3\n7002,0412,,1\n7003,0415,4410300,2'
const tables = {
  sales_staging: { key: 'sale_id', columns: ['sale_id', 'store', { name: 'sku', notNull: true }, 'units'], rows: [] },
  sales_rejects: { columns: ['sale_id', 'error_text'], rows: [] },
}

export default {
  id: 'fl-218',
  category: 'flows',
  title: 'Bulk Insert With a Row by Row Fallback: When a Group Fails, Roll It Back, Insert Its Rows One at a Time, and Send Only the Bad Row to a Reject Table',
  level: 'ADVANCED',
  tags: ['myproject', 'sql-server', 'bulk-insert', 'fallback', 'batch-aggregator', 'reject-table', 'azure-file-share'],
  estMinutes: 45,
  flowChecks: [
    { label: 'Each group is bulk inserted inside a Try that begins a transaction', rule: { type: 'inside', component: 'db-bulk-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'sales_staging' } } },
    { label: 'The bulk insert sits in a Batch Aggregator', rule: { type: 'inside', component: 'db-bulk-insert', within: 'batch-aggregator' } },
    { label: 'When the group fails, its rows are inserted one by one in a For Each', rule: { type: 'inside', component: 'db-insert', within: 'foreach', where: { sql: 'sales_staging' } } },
    { label: 'A row that still fails goes to dbo.sales_rejects with the error', rule: { type: 'inside', component: 'db-insert', within: 'on-error-continue', where: { sql: { all: ['sales_rejects', 'error_text'] } } } },
  ],
  simulation: {
    systems: { files: { [file]: clean }, db: { tables } },
    tests: [
      {
        name: 'A clean group',
        about: 'The bulk insert works: three rows in staging, nothing rejected.',
        trigger: { file: { path: file } },
        expect: { noError: true, db: { sales_staging: { count: 3 }, sales_rejects: { count: 0 } }, files: { [`/mnt/scm-share/sales/done/${name}`]: { exists: true } } },
      },
      {
        name: 'One bad row in the group',
        about: 'Sale 7002 has no SKU, so the bulk insert fails and rolls back. One by one, 7001 and 7003 load and only 7002 lands in the reject table.',
        trigger: { file: { path: file } },
        overrides: { systems: { files: { [file]: oneBad } } },
        expect: {
          db: { sales_staging: { count: 2, has: [{ sale_id: '7001' }, { sale_id: '7003' }] }, sales_rejects: { count: 1, has: [{ sale_id: '7002' }] } },
          logs: [{ level: 'INFO', has: 'rejected=1' }],
        },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'store-sales-load',
      source('file-listener', { directory: '/mnt/scm-share/sales/in', matcher: 'STORE_SALES_*.csv', postAction: 'none', timeBetweenSizeCheck: 10000 }),
      [
        step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
        router(
          'batch-job',
          { jobName: 'store-sales-load', blockSize: 200, maxFailedRecords: -1 },
          [
            route({ name: 'stage', acceptPolicy: 'NO_FAILURES' }, [
              step('transform', { script: '%dw 2.0\noutput application/java\n---\n{ sale_id: payload.sale_id, store: payload.store, sku: if (isBlank(payload.sku)) null else payload.sku, units: payload.units as Number }' }),
              scope('batch-aggregator', { size: 500, streaming: 'false' }, [
                step('set-variable', { variableName: 'group', value: '#[payload]' }),
                scope(
                  'try',
                  {},
                  [scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.sales_staging (sale_id, store, sku, units) VALUES (:sale_id, :store, :sku, :units)' })])],
                  {
                    errorHandlers: [
                      handler('on-error-continue', { type: 'DB:QUERY_EXECUTION' }, [
                        step('logger', { level: 'WARN', message: '#["Bulk insert of " ++ (sizeOf(vars.group) as String) ++ " rows failed, inserting one by one"]' }),
                        scope('foreach', { collection: '#[vars.group]' }, [
                          scope('try', {}, [step('db-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.sales_staging (sale_id, store, sku, units) VALUES (:sale_id, :store, :sku, :units)', inputParameters: '#[payload]', target: 'one' })], {
                            errorHandlers: [
                              handler('on-error-continue', { type: 'ANY' }, [
                                step('db-insert', {
                                  database: 'SQL Server',
                                  sql: 'INSERT INTO dbo.sales_rejects (sale_id, error_text) VALUES (:saleId, :errorText)',
                                  inputParameters: '#[{ saleId: payload.sale_id, errorText: error.description }]',
                                  target: 'rejected',
                                }),
                              ]),
                            ],
                          }),
                        ]),
                      ]),
                    ],
                  },
                ),
              ]),
            ]),
          ],
          {
            onComplete: [step('db-select', { database: 'SQL Server', sql: 'SELECT COUNT(*) AS n FROM dbo.sales_rejects', target: 'rejects' }), step('logger', { level: 'INFO', message: '#["Store sales load done: loaded=" ++ (payload.successfulRecords as String) ++ " rejected=" ++ (vars.rejects[0].n as String)]' })],
          },
        ),
        step('file-move', { sourcePath: '#[vars.filePath]', targetPath: '/mnt/scm-share/sales/done', overwrite: 'true' }),
      ],
    ),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, loads daily store sales into SQL Server for the planning platform's sales feed. The till system writes \`STORE_SALES_<date>.csv\` to an **Azure File Share** mounted at \`/mnt/scm-share\`, about 2 million rows a day:

\`\`\`
sale_id,store,sku,units
7001,0412,4410021,3
\`\`\`

The rows go to \`dbo.sales_staging\` (\`sale_id\` key, \`store\`, \`sku\` NOT NULL, \`units\`) through a Batch Job and bulk inserts of 500 rows.

The problem: a single bad row, such as a missing SKU, fails its whole bulk insert, and 499 good sales are lost with it. The team wants the speed of bulk inserts and the precision of single inserts.

Bad rows go to \`dbo.sales_rejects\` (\`sale_id\`, \`error_text\`).

**Requirements**
- Bulk insert each group of up to 500 rows.
- If the group fails, insert its rows one at a time, so every good row loads.
- A row that fails on its own goes to the reject table with the database's error text.
- A failed bulk insert must leave no rows behind, or the single inserts would clash with them.
- When the job ends, log how many rows loaded and how many were rejected. Then move the file to \`/mnt/scm-share/sales/done\`.

**Facts**
- Turn a blank SKU into null, so the database refuses the row. Store \`units\` as a number.
- The File listener gives the CSV as rows, every value as text. A missing SKU is an empty string: \`{ "sale_id": "7002", "store": "0412", "sku": "", "units": "1" }\`. The path is in \`attributes.path\`.
- A refused insert raises \`DB:QUERY_EXECUTION\`, with the database's message in \`error.description\`.
- The rows are not counted as failed by the job, so count the reject table in On Complete. Log at INFO with \`loaded=<n> rejected=<n>\`.

**Design the flow.**
`,
  answerTemplate: `## The fast path

## When a group fails

## Why the transaction

## Reporting
`,
  keyPoints: [
    'Most groups are clean, so the bulk insert runs almost every time. The slow path only runs for a group with a bad row.',
    'The inner Try begins a transaction: a failed bulk insert is rolled back whole, so the row by row pass starts from nothing.',
    'Without it, rows inserted before the bad one stay, and the single inserts then fail on their keys and go to rejects by mistake.',
    'Keep the group in a variable before the Try. In the handler you loop over it.',
    'The handler is On Error Continue, so the aggregator step ends as a success and the job does not count those records as failed. The reject table holds the truth.',
  ],
  solution: `
1. **File On New or Updated File** on \`/mnt/scm-share/sales/in\`, size check wait 10 seconds.
2. **Batch Job** (max failed records -1), step \`stage\`:
   - **Transform** the record (blank SKU becomes null).
   - **Batch Aggregator** (size 500):
     - **Set Variable** \`group\`.
     - **Try** with **On Error Continue** (DB:QUERY_EXECUTION):
       - Inside: **Try** ALWAYS_BEGIN with **Bulk Insert**.
       - Handler: WARN log, **For Each** \`vars.group\`: **Try** { **Insert** the row } with **On Error Continue** { **Insert** into \`dbo.sales_rejects\` }.
   - **On Complete**: count the rejects and log the totals.
3. **File Move** to \`done\`.

**Sizing.** With 1 bad row in 10,000, about 1 group in 20 takes the slow path. If bad rows are common, check them in DataWeave first and send them to rejects before the insert.
`,
  followUps: [
    {
      q: 'Why not use a smaller aggregator size to lose less?',
      a: 'A smaller group fails less data but costs more round trips on the clean path, which is almost every group. The fallback keeps the size large without losing rows.',
    },
    {
      q: 'Could the rejects be counted without a select in On Complete?',
      a: 'Not from the job result, because the records are counted as successful. A select on the reject table for this file, or a counter in an object store, both work. Filter by file or job ID in real use.',
    },
  ],
}

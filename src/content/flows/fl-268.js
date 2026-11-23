import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const name = 'STORE_SALES_20261113.csv'
const file = `/sales/in/${name}`
const csv = 'sale_id,store,sku,units,amount\nS-1,0412,4410021,2,3.70\nS-2,0412,4410187,4,3.80\nS-3,0415,4410300,1,3.20\nS-4,0415,4410021,3,5.55'
const tables = {
  sales_line_staging: { columns: ['file_name', 'sale_id', 'store', 'sku', 'units', 'amount'], rows: [] },
  store_day_totals: { columns: ['file_name', 'store', 'units', 'amount'], rows: [] },
}
const totals =
  'INSERT INTO dbo.store_day_totals (file_name, store, units, amount)\nSELECT file_name, store, SUM(units), SUM(amount) FROM dbo.sales_line_staging WHERE file_name = :fileName GROUP BY file_name, store'

export default {
  id: 'fl-268',
  category: 'flows',
  title: 'Store Totals From a 40 Million Line Sales File Without groupBy in Mule: Stage the Lines Through a Batch Job, Let SQL Server Do the GROUP BY in On Complete, and Send Only the Totals',
  level: 'ADVANCED',
  tags: ['myproject', 'large-files', 'batch', 'sql-server', 'group-by', 'memory', 'ftp', 'planning'],
  estMinutes: 45,
  flowChecks: [
    {
      label: 'Nothing in the flow groups the lines with DataWeave',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'batch-job' },
          { type: 'absent', component: 'transform', where: { script: 'groupBy' } },
          { type: 'absent', component: 'set-variable', where: { value: 'groupBy' } },
          { type: 'absent', component: 'set-payload', where: { value: 'groupBy' } },
        ],
      },
    },
    { label: 'The file\'s old staging rows are deleted before the Batch Job', rule: { type: 'before', first: 'db-delete', firstWhere: { sql: { all: ['sales_line_staging', 'file_name'] } }, then: 'batch-job' } },
    { label: 'A Batch Aggregator bulk inserts the lines into dbo.sales_line_staging', rule: { type: 'inside', component: 'db-bulk-insert', within: 'batch-aggregator', where: { sql: 'sales_line_staging' } } },
    { label: 'On Complete builds the totals with a GROUP BY in SQL Server', rule: { type: 'inside', component: ['db-insert', 'db-update'], within: 'batch-job', inSlot: 'onComplete', where: { sql: { all: ['store_day_totals', 'GROUP BY'] } } } },
    { label: 'On Complete replaces the file\'s totals, not adds to them', rule: { type: 'inside', component: 'db-delete', within: 'batch-job', inSlot: 'onComplete', where: { sql: 'store_day_totals' } } },
    { label: 'On Complete writes the totals file to the planning platform', rule: { type: 'inside', component: 'ftp-write', within: 'batch-job', inSlot: 'onComplete', where: { path: '/inbound/store-totals' } } },
  ],
  simulation: {
    systems: { files: { [file]: csv }, db: { tables } },
    tests: [
      {
        name: 'A day of sales',
        about: 'Four lines are staged. SQL Server adds them up to one row per store, and the totals file holds 0412 with 6 units and 0415 with 4.',
        trigger: { file: { path: file } },
        expect: {
          noError: true,
          db: { sales_line_staging: { count: 4 }, store_day_totals: { count: 2, has: [{ store: '0412', units: 6 }, { store: '0415', units: 4 }] } },
          files: { '/inbound/store-totals/STORE_TOTALS_20261113.csv': { exists: true, has: '0412,6' } },
        },
      },
      {
        name: 'The same file again',
        about: 'Support drops the file in a second time. The file\'s staging rows and totals are replaced, so 0412 still has 6 units, not 12.',
        triggers: [{ file: { path: file } }, { file: { path: file } }],
        expect: { db: { sales_line_staging: { count: 4 }, store_day_totals: { count: 2, has: [{ store: '0412', units: 6 }] } }, files: { '/inbound/store-totals/STORE_TOTALS_20261113.csv': { has: '0415,4' } } },
      },
    ],
  },
  referenceFlow: design(
    flow('store-sales-totals', source('sftp-listener', { directory: '/sales/in', matcher: 'STORE_SALES_*.csv', postAction: 'move', moveTo: '/sales/done', timeBetweenSizeCheck: 30000 }), [
      step('set-variable', { variableName: 'fileName', value: '#[attributes.fileName]' }),
      step('set-variable', { variableName: 'day', value: '#[(attributes.fileName splitBy "_")[2] replace ".csv" with ""]' }),
      step('db-delete', { database: 'SQL Server', sql: 'DELETE FROM dbo.sales_line_staging WHERE file_name = :fileName', inputParameters: '#[{ fileName: vars.fileName }]', target: 'cleared' }),
      router(
        'batch-job',
        { jobName: 'store-sales-totals', blockSize: 500, maxFailedRecords: -1 },
        [
          route({ name: 'stage', acceptPolicy: 'NO_FAILURES' }, [
            step('transform', { script: '%dw 2.0\noutput application/java\n---\n{ file_name: vars.fileName, sale_id: payload.sale_id, store: payload.store, sku: payload.sku, units: payload.units as Number, amount: payload.amount as Number }' }),
            scope('batch-aggregator', { size: 1000, streaming: 'false' }, [
              step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.sales_line_staging (file_name, sale_id, store, sku, units, amount) VALUES (:file_name, :sale_id, :store, :sku, :units, :amount)' }),
            ]),
          ]),
        ],
        {
          onComplete: [
            step('db-delete', { database: 'SQL Server', sql: 'DELETE FROM dbo.store_day_totals WHERE file_name = :fileName', inputParameters: '#[{ fileName: vars.fileName }]', target: 'oldTotals' }),
            step('db-insert', { database: 'SQL Server', sql: totals, inputParameters: '#[{ fileName: vars.fileName }]', target: 'built' }),
            step('db-select', { database: 'SQL Server', sql: 'SELECT store, units, amount FROM dbo.store_day_totals WHERE file_name = :fileName ORDER BY store', inputParameters: '#[{ fileName: vars.fileName }]' }),
            step('transform', { script: '%dw 2.0\noutput application/csv\n---\npayload' }),
            step('ftp-write', { path: '#["/inbound/store-totals/STORE_TOTALS_" ++ vars.day ++ ".csv"]', mode: 'OVERWRITE' }),
          ],
        },
      ),
    ]),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, sends the planning platform one row per store per day: units and sales amount. The source is the day's sales file, \`STORE_SALES_<date>.csv\` on the **SFTP server**, folder \`/sales/in\`: about **40 million lines**, 4 GB.

The current flow reads the file, runs \`payload groupBy $.store\` in a Transform, sums each group and writes \`STORE_TOTALS_<date>.csv\` to the platform's **FTP server**, folder \`/inbound/store-totals\`. The result is only 600 rows, but the flow needs the whole file in memory to get there, and since the summer it fails most Mondays.

The DBA team offers two SQL Server tables: \`dbo.sales_line_staging\` (\`file_name\`, \`sale_id\`, \`store\`, \`sku\`, \`units\`, \`amount\`) and \`dbo.store_day_totals\` (\`file_name\`, \`store\`, \`units\`, \`amount\`).

**Requirements**
- Stage every line through a Batch Job, in bulk, tagged with the file name.
- Build the totals in the database with one \`GROUP BY\` once the job is done.
- Write the totals (\`store,units,amount\`) as \`STORE_TOTALS_<date>.csv\` to the FTP server.
- Loading the same file twice must not double anything.
- No DataWeave \`groupBy\` over the lines.

**Facts**
- \`<date>\` in the totals file name is the date from the sales file name.
- \`file_name\` is the sales file's name. \`units\` and \`amount\` are numbers.
- A rerun replaces: delete the file's staging rows before the job, and its totals in On Complete before you build them again.
- Build the totals with \`INSERT INTO dbo.store_day_totals ... SELECT ... GROUP BY\`.

**What each system sends back**
- The SFTP listener gives the CSV as the payload, with the name in \`attributes.fileName\` (\`STORE_SALES_20261113.csv\`). The Batch Job gets one record per line, keyed by the header and with string values:
\`\`\`json
{ "sale_id": "S-1", "store": "0412", "sku": "4410021", "units": "2", "amount": "3.70" }
\`\`\`
- The totals select gives a list of rows with the columns as named: \`[ { "store": "0412", "units": 6, "amount": 7.5 } ]\`.

**Design the flow.**
`,
  answerTemplate: `## Why groupBy fails here

## Staging

## Totals in the database

## Running twice
`,
  keyPoints: [
    'groupBy must see every line before it can return a group, so it holds the whole input. On a 4 GB file that is the heap.',
    'A database is built to aggregate data larger than memory: it sorts and hashes on disk when it must.',
    'On Complete runs once every line is staged, which is the moment the totals can be built.',
    'The result is 600 rows, so reading it back and writing a CSV in the flow is cheap.',
    'Deleting the file\'s staging rows and totals before writing makes a rerun replace the data instead of adding to it.',
  ],
  solution: `
1. **SFTP On New or Updated File** on \`/sales/in\`, size check wait 30 seconds, move to \`/sales/done\` after reading.
2. **Set Variable** \`fileName\` and \`day\`. **Database Delete** the file's staging rows.
3. **Batch Job**, step \`stage\`: **Transform** with \`file_name\`, **Batch Aggregator** (size 1000) with **Bulk Insert**.
4. **On Complete**:
   - **Database Delete** the file's totals.
   - **Database Insert** \`INSERT INTO dbo.store_day_totals ... SELECT ... GROUP BY file_name, store\`.
   - **Database Select** the totals, **Transform** to CSV, **FTP Write** \`STORE_TOTALS_<date>.csv\`.

**Staging that grows.** 40 million rows a day add up. Purge staging rows older than a week in a nightly job, or truncate a partition per day if the DBA sets one up.
`,
  followUps: [
    {
      q: 'Could DataWeave sum the lines while streaming, without groupBy?',
      a: 'A reduce over the stream that keeps a running total per store can stream, because it holds only one total per store. It is harder to get right and to restart than SQL, and it does not leave the lines anywhere for support to check.',
    },
    {
      q: 'Some lines failed to stage. Are the totals wrong?',
      a: 'They miss those lines. Write the failed count from the job result next to the totals, or hold the totals file back when failures pass a limit, and tell the planning team.',
    },
  ],
}

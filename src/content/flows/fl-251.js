import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const name = 'STOCK_SNAPSHOT_20261113.csv'
const file = `/wms/stock/${name}`
const csv = 'snapshot_date,store,sku,on_hand\n2026-11-13,0412,4410021,3\n2026-11-13,0412,4410187,1\n2026-11-13,0415,4410300,2'
const tables = {
  store_stock: {
    key: ['store', 'sku'],
    columns: ['store', 'sku', 'on_hand', 'snapshot_date'],
    rows: [
      { store: '0412', sku: '4410021', on_hand: 1, snapshot_date: '2026-11-12' },
      { store: '0415', sku: '4410999', on_hand: 7, snapshot_date: '2026-11-12' },
    ],
  },
}
const merge =
  'MERGE INTO dbo.store_stock AS t\nUSING (SELECT :store AS store, :sku AS sku, :on_hand AS on_hand, :snapshot_date AS snapshot_date) AS s\nON t.store = s.store AND t.sku = s.sku\nWHEN MATCHED THEN UPDATE SET on_hand = s.on_hand, snapshot_date = s.snapshot_date\nWHEN NOT MATCHED THEN INSERT (store, sku, on_hand, snapshot_date) VALUES (s.store, s.sku, s.on_hand, s.snapshot_date);'

export default {
  id: 'fl-251',
  category: 'flows',
  title: 'A Stock Snapshot That Can Be Loaded Twice: MERGE From the Batch Aggregator So a Rerun Updates Rows Instead of Failing on the Key or Doubling Them',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'batch', 'sql-server', 'merge', 'idempotent', 'batch-aggregator', 'rerun'],
  estMinutes: 30,
  flowChecks: [
    {
      label: 'A Batch Aggregator writes each group with a MERGE on store and SKU',
      rule: { type: 'inside', component: ['db-bulk-update', 'db-bulk-insert'], within: 'batch-aggregator', where: { sql: { all: ['MERGE INTO dbo.store_stock', 'WHEN MATCHED', 'WHEN NOT MATCHED'] } } },
    },
    { label: 'The aggregator groups at least 100 records', rule: { type: 'exists', component: 'batch-aggregator', where: { size: { gte: 100 } } } },
  ],
  simulation: {
    systems: { files: { [file]: csv }, db: { tables } },
    tests: [
      {
        name: 'A snapshot with known and new rows',
        about: 'Store 0412 already has a row for 4410021. It is updated to 3, the two new rows are inserted, and the row for 0415 / 4410999 is left as it was.',
        trigger: { file: { path: file } },
        expect: {
          noError: true,
          db: {
            store_stock: {
              count: 4,
              has: [
                { store: '0412', sku: '4410021', on_hand: 3, snapshot_date: '2026-11-13' },
                { store: '0415', sku: '4410300', on_hand: 2 },
                { store: '0415', sku: '4410999', on_hand: 7, snapshot_date: '2026-11-12' },
              ],
            },
          },
        },
      },
      {
        name: 'The same file again',
        about: 'Support drops the file back in after a network blip. The second load changes nothing: still four rows, the same quantities.',
        triggers: [{ file: { path: file } }, { file: { path: file } }],
        expect: { db: { store_stock: { count: 4, has: [{ store: '0412', sku: '4410187', on_hand: 1 }] } } },
      },
    ],
  },
  referenceFlow: design(
    flow('stock-snapshot-load', source('ftp-listener', { directory: '/wms/stock', matcher: 'STOCK_SNAPSHOT_*.csv', postAction: 'move', moveTo: '/wms/stock/done', timeBetweenSizeCheck: 15000 }), [
      router(
        'batch-job',
        { jobName: 'stock-snapshot-load', blockSize: 500, maxFailedRecords: -1 },
        [
          route({ name: 'merge-stock', acceptPolicy: 'NO_FAILURES' }, [
            step('transform', { script: '%dw 2.0\noutput application/java\n---\n{ store: payload.store, sku: payload.sku, on_hand: payload.on_hand as Number, snapshot_date: payload.snapshot_date }' }),
            scope('batch-aggregator', { size: 500, streaming: 'false' }, [step('db-bulk-update', { database: 'SQL Server', sql: merge })]),
          ]),
        ],
        {
          onComplete: [step('logger', { level: 'INFO', message: '#["Stock snapshot merged=" ++ (payload.successfulRecords as String) ++ " failed=" ++ (payload.failedRecords as String)]' })],
        },
      ),
    ]),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, gets an on hand snapshot from its warehouse system every night: \`STOCK_SNAPSHOT_<date>.csv\` on the WMS **FTP server**, folder \`/wms/stock\`, about **4 million rows**:

\`\`\`
snapshot_date,store,sku,on_hand
2026-11-13,0412,4410021,3
\`\`\`

The rows go to \`dbo.store_stock\` in SQL Server (key \`store\` + \`sku\`, \`on_hand\`, \`snapshot_date\`). The table keeps one row per store and SKU: tonight's snapshot replaces last night's quantity.

Today a Batch Job bulk inserts groups of 500. Two problems:
- A store and SKU already in the table fails on the key, and the whole group of 500 with it.
- Support sometimes drops the same file in again after a network blip. Any design that deletes first and inserts would leave the table half empty while it runs.

**Requirements**
- Write the rows in groups of at least 100 from a Batch Aggregator.
- A known store and SKU is updated, a new one is inserted, and rows not in the file are left alone.
- Loading the same file twice must give the same table as loading it once.

**What each system sends back**
- The FTP listener gives the CSV content as the payload, so the Batch Job splits it into one record per row: \`{ "snapshot_date": "2026-11-13", "store": "0412", "sku": "4410021", "on_hand": "3" }\`, every value as text. Inside the Batch Aggregator the payload is a list of those records, which the Bulk Update runs once each.

**Design the flow.**
`,
  answerTemplate: `## The aggregator

## The MERGE

## Loading twice
`,
  keyPoints: [
    'MERGE ... WHEN MATCHED THEN UPDATE ... WHEN NOT MATCHED THEN INSERT does both in one statement, on the key the table already has.',
    'A Bulk Update with a MERGE runs the statement once per record in the group, in one round trip, so the speed of a bulk insert stays.',
    'An idempotent write is what makes reruns and redeliveries safe: the second load writes the same values again.',
    'The statement ends with a semicolon in SQL Server. MERGE without it can fail to parse there.',
    'Two loads of the same key in one group can clash inside the MERGE. If the file can hold duplicates, remove them first or add a tie breaker.',
  ],
  solution: `
1. **FTP On New or Updated File** on \`/wms/stock\`, size check wait 15 seconds, move to \`done\` after reading.
2. **Batch Job** (max failed records -1), step \`merge-stock\`:
   - **Transform** the record.
   - **Batch Aggregator** (size 500): **Bulk Update** with the MERGE:

\`\`\`sql
MERGE INTO dbo.store_stock AS t
USING (SELECT :store AS store, :sku AS sku, :on_hand AS on_hand, :snapshot_date AS snapshot_date) AS s
ON t.store = s.store AND t.sku = s.sku
WHEN MATCHED THEN UPDATE SET on_hand = s.on_hand, snapshot_date = s.snapshot_date
WHEN NOT MATCHED THEN INSERT (store, sku, on_hand, snapshot_date) VALUES (s.store, s.sku, s.on_hand, s.snapshot_date);
\`\`\`

3. **On Complete**: log the counts.

**Old rows.** A SKU a store no longer stocks keeps last night's row. If the business wants it gone, delete rows with an older \`snapshot_date\` in On Complete, after a good load only.
`,
  followUps: [
    {
      q: 'MERGE row by row is slower than a plain insert. When would you stage first?',
      a: 'For millions of rows, bulk insert into an empty staging table, then run one set based MERGE from staging to the target. One statement over the whole set is faster than millions of single MERGEs.',
    },
    {
      q: 'Is MERGE safe when two loads run at the same time?',
      a: 'Not always: two sessions can both see no match and both insert. Run the loads one at a time, or use the locking hints your DBA recommends.',
    },
  ],
}

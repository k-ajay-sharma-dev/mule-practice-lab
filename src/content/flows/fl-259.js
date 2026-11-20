import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const name = 'TILL_TXN_20261113.csv'
const file = `/tills/in/${name}`
const csv = 'txn_id,store,till,sku,qty,amount\nT-90001,0412,03,4410021,2,3.70\nT-90002,0415,01,4410187,1,0.95\nT-90003,0412,05,4410300,4,12.80'
const tables = { till_txn_staging: { key: 'txn_id', columns: ['txn_id', 'store', 'till', 'sku', 'qty', 'amount'], rows: [] } }
const whole = ['orderBy', 'groupBy', 'distinctBy', 'sizeOf(payload)']

export default {
  id: 'fl-259',
  category: 'flows',
  title: 'A 3 GB Till File Into SQL Server Without Running Out of Memory: Hand the SFTP Stream Straight to a Batch Job, and Keep Sorting and Counting Out of the Flow',
  level: 'BEGINNER',
  tags: ['myproject', 'large-files', 'streaming', 'batch', 'sftp', 'sql-server', 'memory'],
  estMinutes: 25,
  flowChecks: [
    { label: 'Till files are picked up from /tills/in once their size is stable', rule: { type: 'source', component: 'sftp-listener', where: { directory: '/tills/in', timeBetweenSizeCheck: { gte: 1 } } } },
    {
      label: 'Nothing in the flow sorts, groups or counts the whole file',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'batch-job' },
          { type: 'absent', component: 'transform', where: { script: { oneOf: whole } } },
          { type: 'absent', component: 'set-variable', where: { value: { oneOf: whole } } },
          { type: 'absent', component: 'logger', where: { message: { oneOf: whole } } },
        ],
      },
    },
    { label: 'A Batch Aggregator bulk inserts into dbo.till_txn_staging', rule: { type: 'inside', component: 'db-bulk-insert', within: 'batch-aggregator', where: { sql: 'till_txn_staging' } } },
    { label: 'The file is moved to /tills/done after the job is started', rule: { type: 'before', first: 'batch-job', then: 'sftp-move', thenWhere: { targetPath: '/tills/done' }, outside: true } },
  ],
  simulation: {
    systems: { files: { [file]: csv }, db: { tables } },
    tests: [
      {
        name: 'A night of till transactions',
        about: 'Every transaction reaches staging and the file moves to done.',
        trigger: { file: { path: file } },
        expect: { noError: true, db: { till_txn_staging: { count: 3, has: [{ txn_id: 'T-90003', qty: 4 }] } }, files: { [`/tills/done/${name}`]: { exists: true } } },
      },
    ],
  },
  referenceFlow: design(
    flow('till-txn-load', source('sftp-listener', { directory: '/tills/in', matcher: 'TILL_TXN_*.csv', postAction: 'none', timeBetweenSizeCheck: 30000 }), [
      step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
      step('logger', { level: 'INFO', message: '#["Till file " ++ attributes.fileName ++ ", " ++ (attributes.size as String) ++ " bytes"]' }),
      router(
        'batch-job',
        { jobName: 'till-txn-load', blockSize: 500, maxFailedRecords: -1 },
        [
          route({ name: 'stage', acceptPolicy: 'NO_FAILURES' }, [
            step('transform', { script: '%dw 2.0\noutput application/java\n---\n{ txn_id: payload.txn_id, store: payload.store, till: payload.till, sku: payload.sku, qty: payload.qty as Number, amount: payload.amount as Number }' }),
            scope('batch-aggregator', { size: 1000, streaming: 'false' }, [
              step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.till_txn_staging (txn_id, store, till, sku, qty, amount) VALUES (:txn_id, :store, :till, :sku, :qty, :amount)' }),
            ]),
          ]),
        ],
        { onComplete: [step('logger', { level: 'INFO', message: '#["Till load done: loaded=" ++ (payload.successfulRecords as String) ++ " failed=" ++ (payload.failedRecords as String)]' })] },
      ),
      step('sftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/tills/done', overwrite: 'true' }),
    ]),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, loads every till transaction of the day into SQL Server for the planning platform's sales feed. The till system writes \`TILL_TXN_<date>.csv\` to the **SFTP server**, folder \`/tills/in\`. Before Christmas a file is about **3 GB**, around 40 million lines:

\`\`\`
txn_id,store,till,sku,qty,amount
T-90001,0412,03,4410021,2,3.70
\`\`\`

The current flow:
1. Transform: \`payload orderBy $.store\`, "so the inserts are in store order".
2. Logger: \`"rows=" ++ sizeOf(payload)\`.
3. Batch Job with a Batch Aggregator bulk insert into \`dbo.till_txn_staging\`.

On a normal day it works. In December the worker ran out of memory before the Batch Job started.

**Requirements**
- Pick up the file once the till system has finished writing it.
- Load every line into \`dbo.till_txn_staging\` through a Batch Job, bulk inserting groups.
- Nothing before the job may need the whole file at once. Log the file size from the attributes instead of a row count.
- Move the file to \`/tills/done\`.

**Facts**
- \`dbo.till_txn_staging\` has the file's six columns. \`qty\` and \`amount\` are numbers.

**Design the flow.**
`,
  answerTemplate: `## Why the old flow ran out of memory

## The new flow

## Where the sorting and counting go
`,
  keyPoints: [
    'A file connector hands the flow a stream. A Batch Job can read it record by record, so only the records in flight are in memory.',
    'orderBy, groupBy and distinctBy must see every record before they return the first one, so they hold the whole file. So does sizeOf(payload).',
    'Mule can buffer a stream to disk past a size (a file store repeatable stream), so a second read does not fail. It still costs a full pass and the disk space.',
    'If the order matters, sort in the database with ORDER BY after the load. If the count matters, use the job result or a COUNT(*) in On Complete.',
    'attributes.size gives the file size without reading the content.',
  ],
  solution: `
1. **SFTP On New or Updated File** on \`/tills/in\`, size check wait 30 seconds.
2. **Set Variable** \`filePath\`. **Logger** with \`attributes.size\`.
3. **Batch Job** (max failed records -1), step \`stage\`: **Transform** the record, **Batch Aggregator** (size 1000) with **Bulk Insert**. **On Complete**: log the counts.
4. **SFTP Move** to \`/tills/done\`.

**Streaming settings.** Keep the connector's default repeatable file store stream, or set a non repeatable stream when nothing reads the payload twice. Check the defaults of your connector version.
`,
  followUps: [
    {
      q: 'The planning platform wants the rows sorted by store. Where does that happen now?',
      a: 'In the export from staging: SELECT ... ORDER BY store, with an index that supports it. The database sorts on disk; a Mule worker sorts in its heap.',
    },
    {
      q: 'Would a bigger worker have fixed it?',
      a: 'Until the next peak. The file grows with the business, and memory per worker has a ceiling. Streaming keeps memory flat whatever the file size.',
    },
  ],
}

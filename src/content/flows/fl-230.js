import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const file = '/data/fenwick/items/in/ITEMS_20261113.csv'
const head = 'item_id,description,case_qty'
const rows = (bad) =>
  [1, 2, 3, 4, 5, 6, 7].map((n) => `FX-${1000 + n},Item ${n},${bad && n === 5 ? '' : n * 6}`).join('\n')
const tables = () => ({
  job_log: { key: 'job_id', columns: ['job_id', 'job_name', 'status', 'total_count', 'rejected_count'], rows: [] },
  stg_items: { key: 'item_id', columns: ['job_id', 'item_id', 'description', { name: 'case_qty', notNull: true }], rows: [] },
  stg_item_rejects: { columns: ['job_id', 'item_id', 'reason'], rows: [] },
})

export default {
  id: 'fl-230',
  category: 'flows',
  title: 'An Item File Into Oracle Through a Batch Job: Bulk Insert Each Aggregator Group, and When a Group Fails, Roll It Back and Insert Its Rows One by One',
  level: 'ADVANCED',
  tags: ['myproject', 'oracle', 'batch', 'batch-aggregator', 'bulk-insert', 'fallback', 'reject-table', 'job-log'],
  estMinutes: 45,
  flowChecks: [
    { label: 'Item files are picked up from /data/fenwick/items/in', rule: { type: 'source', component: 'file-listener', where: { directory: '/data/fenwick/items/in' } } },
    { label: 'The job is logged as STARTED before the batch job runs', rule: { type: 'before', first: 'db-insert', firstWhere: { sql: { all: ['job_log', 'STARTED'] } }, then: 'batch-job' } },
    { label: 'Each aggregator group is bulk inserted into stg_items', rule: { type: 'inside', component: 'db-bulk-insert', within: 'batch-aggregator', where: { sql: 'stg_items' } } },
    { label: 'The bulk insert runs in its own transaction, so a failed group leaves no rows behind', rule: { type: 'inside', component: 'db-bulk-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' } } },
    { label: 'A failed group is retried one row at a time from an error handler', rule: { type: 'inside', component: 'db-insert', within: 'foreach', where: { sql: 'INSERT INTO stg_items' } } },
    { label: 'A row that still fails goes to stg_item_rejects with the reason', rule: { type: 'inside', component: 'db-insert', within: 'on-error-continue', where: { sql: 'stg_item_rejects' } } },
    { label: 'On Complete closes the job row with the counts', rule: { type: 'inside', component: 'db-update', within: 'batch-job', inSlot: 'onComplete', where: { sql: { all: ['job_log', 'COMPLETED'] } } } },
  ],
  simulation: {
    systems: { files: { [file]: `${head}\n${rows(false)}` }, db: { tables: tables() } },
    tests: [
      {
        name: 'A clean file',
        about: 'All 7 items load in three bulk calls. No rejects, and the job row ends COMPLETED with 7 and 0.',
        trigger: { file: { path: file } },
        expect: { noError: true, db: { stg_items: { count: 7 }, stg_item_rejects: { count: 0 }, job_log: { has: [{ status: 'COMPLETED', total_count: 7, rejected_count: 0 }] } } },
      },
      {
        name: 'One item has no case quantity',
        about: 'Item 5 breaks the second group. The group is rolled back, items 4 and 6 load on their own, and only item 5 goes to the reject table.',
        trigger: { file: { path: file } },
        overrides: { systems: { files: { [file]: `${head}\n${rows(true)}` } } },
        expect: {
          db: {
            stg_items: { count: 6, lacks: [{ item_id: 'FX-1005' }] },
            stg_item_rejects: { count: 1, has: [{ item_id: 'FX-1005' }] },
            job_log: { has: [{ status: 'COMPLETED', total_count: 7, rejected_count: 1 }] },
          },
        },
      },
    ],
  },
  referenceFlow: design(
    flow('items-file-to-staging', source('file-listener', { directory: '/data/fenwick/items/in', matcher: 'ITEMS_*.csv', postAction: 'none', timeBetweenSizeCheck: 10000 }), [
      step('set-variable', { variableName: 'jobId', value: '#[uuid()]' }),
      step('db-insert', {
        database: 'Oracle',
        sql: "INSERT INTO job_log (job_id, job_name, status) VALUES (:jobId, 'ITEM_STAGING_LOAD', 'STARTED')",
        inputParameters: '#[{ jobId: vars.jobId }]',
        target: 'started',
      }),
      step('transform', {
        script: '%dw 2.0\noutput application/java\n---\npayload map ((r) -> { job_id: vars.jobId, item_id: r.item_id, description: r.description, case_qty: if (isEmpty(r.case_qty)) null else r.case_qty as Number })',
      }),
      router(
        'batch-job',
        { jobName: 'item-staging-load', blockSize: 100, maxFailedRecords: -1 },
        [
          route({ name: 'load', acceptPolicy: 'NO_FAILURES' }, [
            scope('batch-aggregator', { size: 3 }, [
              scope(
                'try',
                {},
                [scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [step('db-bulk-insert', { database: 'Oracle', sql: 'INSERT INTO stg_items (job_id, item_id, description, case_qty) VALUES (:job_id, :item_id, :description, :case_qty)' })])],
                {
                  errorHandlers: [
                    handler('on-error-continue', { type: 'DB:QUERY_EXECUTION' }, [
                      step('logger', { level: 'WARN', message: '#["A group of " ++ (sizeOf(payload) as String) ++ " failed, inserting row by row"]' }),
                      scope('foreach', { collection: '#[payload]' }, [
                        scope('try', {}, [step('db-insert', { database: 'Oracle', sql: 'INSERT INTO stg_items (job_id, item_id, description, case_qty) VALUES (:job_id, :item_id, :description, :case_qty)' })], {
                          errorHandlers: [
                            handler('on-error-continue', { type: 'DB:QUERY_EXECUTION' }, [
                              step('db-insert', {
                                database: 'Oracle',
                                sql: 'INSERT INTO stg_item_rejects (job_id, item_id, reason) VALUES (:jobId, :itemId, :reason)',
                                inputParameters: '#[{ jobId: payload.job_id, itemId: payload.item_id, reason: error.description }]',
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
          onComplete: [
            step('db-select', { database: 'Oracle', sql: 'SELECT COUNT(*) AS rejected FROM stg_item_rejects WHERE job_id = :jobId', inputParameters: '#[{ jobId: vars.jobId }]', target: 'rej' }),
            step('db-update', {
              database: 'Oracle',
              sql: "UPDATE job_log SET status = 'COMPLETED', total_count = :total, rejected_count = :rejected WHERE job_id = :jobId",
              inputParameters: '#[{ total: payload.totalRecords, rejected: vars.rej[0].REJECTED, jobId: vars.jobId }]',
            }),
            step('logger', { level: 'INFO', message: '#["Item load " ++ vars.jobId ++ " done: " ++ (payload.totalRecords as String) ++ " records"]' }),
          ],
        },
      ),
    ]),
  ),
  description: `
Fenwick Supply, a fictional builders' merchant, loads the planning platform's item file into the Oracle staging table \`stg_items\` (\`job_id\`, \`item_id\` unique, \`description\`, \`case_qty\` NOT NULL). Files land in \`/data/fenwick/items/in\` as \`ITEMS_<date>.csv\` and can hold 300,000 rows.

\`\`\`
item_id,description,case_qty
FX-1001,Item 1,6
\`\`\`

Bulk inserts are fast, but one bad row fails a whole group. The old flow then lost every row in that group. The data team wants every good row loaded and each bad row in \`stg_item_rejects\` (\`job_id\`, \`item_id\`, \`reason\`).

Every run has a row in \`job_log\` (\`job_id\`, \`job_name\`, \`status\`, \`total_count\`, \`rejected_count\`).

**Requirements**
- Log the job as \`STARTED\` (job name \`ITEM_STAGING_LOAD\`) before loading.
- Load the rows with a Batch Job. Bulk insert each Batch Aggregator group (size 3 here, so the tests stay small; about 500 in real life).
- If a group fails, leave none of its rows half loaded, then insert its rows one at a time. A row that still fails goes to \`stg_item_rejects\` with the database's message.
- When the job ends, set the job row to \`COMPLETED\` with the total and the number of rejects.

**Facts**
- Make the \`job_id\` with \`uuid()\` and put it on every staged and rejected row.
- Turn an empty \`case_qty\` into null, so Oracle refuses the row, and store the rest as numbers. A refused insert raises \`DB:QUERY_EXECUTION\`.
- The File listener gives the CSV as rows, every value as text. A missing quantity is an empty string: \`{ "item_id": "FX-1005", "description": "Item 5", "case_qty": "" }\`.
- On Complete's payload has \`totalRecords\`. The rejected rows still count as successful, so count \`stg_item_rejects\` for the job.

**What each system sends back**
- A Database **Select** answers a list of rows. Oracle returns unquoted column names and aliases in upper case, so \`SELECT COUNT(*) AS rejected\` reads \`[ { "REJECTED": 1 } ]\`.

**Design the flow.**
`,
  answerTemplate: `## Before the batch job

## The aggregator and the bulk insert

## Falling back to one row at a time

## Closing the job row
`,
  keyPoints: [
    'A bulk insert is one round trip for hundreds of rows. Use it for the normal case, and fall back only for the rare group with a bad row.',
    'Put the bulk insert in a Try with ALWAYS_BEGIN and no handler of its own. A failure then rolls back the rows the batch did insert before the bad one, and only after that does the outer handler start the fallback.',
    'On Error Continue inside a transactional Try would commit what was done. The handler belongs on an outer Try without a transaction.',
    'In the fallback each row is its own small Try, so one bad row goes to the reject table and the next row still loads.',
    'Catch DB:QUERY_EXECUTION only. A lost connection is not a bad row, and should fail the group so the batch counts it.',
    'On Complete runs once, after every record. It is the place to close the job row.',
  ],
  solution: `
1. **File On New or Updated File** on \`/data/fenwick/items/in\`, \`ITEMS_*.csv\`.
2. **Set Variable** \`jobId\`. **Database Insert** the \`STARTED\` row.
3. **Transform** the CSV rows to the column names, with \`job_id\`.
4. **Batch Job**, Max failed records -1, step \`load\`:
   - **Batch Aggregator** size 3:
     - **Try** (no transaction) holding a **Try** with **ALWAYS_BEGIN** and a **Bulk Insert** into \`stg_items\`.
     - The outer Try's **On Error Continue** (\`DB:QUERY_EXECUTION\`): WARN, **For Each** row: a **Try** with **Database Insert** into \`stg_items\`, and **On Error Continue** that inserts into \`stg_item_rejects\` with \`error.description\`.
5. **On Complete**: **Database Select** the reject count, **Database Update** \`job_log\` to \`COMPLETED\` with both counts.

**Speed.** A group that falls back costs one call per row. With one bad row in 300,000 that is cheap. If whole files are bad, validate in DataWeave first and reject before the database sees them.
`,
  followUps: [
    {
      q: 'Why not let the Batch Job mark the failed records and handle them in a second step with ONLY_FAILURES?',
      a: 'The aggregator fails the whole group, so every record in it is marked failed, good ones too. You would still need to try them one by one to find the bad one.',
    },
    {
      q: 'How does Oracle behave when one row of a JDBC batch fails?',
      a: 'It depends on the driver: rows before the bad one may already be in the session. That is why the group needs its own transaction, so a failed group is rolled back as a whole.',
    },
  ],
}

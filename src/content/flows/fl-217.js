import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const name = 'SALES_HIST_2026W46.csv'
const file = `/history/in/${name}`
const csv = 'business_date,store,sku,units,net_sales\n2026-11-09,0101,TENT-2P-OLV,2,258.00\n2026-11-09,0102,JKT-RAIN-M,5,299.95\n2026-11-10,0101,BOTTLE-1L,11,164.89'
const tables = {
  sales_history_staging: { columns: ['business_date', 'store', 'sku', 'units', 'net_sales', 'job_id'], rows: [] },
  job_log: { key: 'job_id', columns: ['job_id', 'job_name', 'status', 'loaded', 'failed'], rows: [{ job_id: 300, job_name: 'SALES_HISTORY_LOAD', status: 'COMPLETED', loaded: 52011, failed: 0 }] },
}
const procedures = {
  'dbo.usp_job_start': (args, db) => {
    const rows = db.tables.job_log.rows
    const id = Math.max(0, ...rows.map((r) => r.job_id)) + 1
    rows.push({ job_id: id, job_name: args.jobName, status: 'STARTED', loaded: null, failed: null })
    return { job_id: id }
  },
}

export default {
  id: 'fl-217',
  category: 'flows',
  title: 'A Weekly Sales History File Into SQL Server Through a Batch Job: Bulk Insert From a Batch Aggregator, and Close the Job Log Row From On Complete',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'sql-server', 'batch', 'batch-aggregator', 'bulk-insert', 'job-log', 'large-files'],
  estMinutes: 35,
  flowChecks: [
    { label: 'A job log row is started before the Batch Job', rule: { type: 'before', first: 'db-stored-procedure', firstWhere: { sql: 'usp_job_start' }, then: 'batch-job' } },
    { label: 'A Batch Aggregator of at least 100 records bulk inserts into dbo.sales_history_staging', rule: { type: 'inside', component: 'db-bulk-insert', within: 'batch-aggregator', withinWhere: { size: { gte: 100 } }, where: { sql: 'sales_history_staging' } } },
    { label: 'On Complete writes the loaded and failed counts to the job log row', rule: { type: 'inside', component: 'db-update', within: 'batch-job', inSlot: 'onComplete', where: { sql: { all: ['job_log', 'loaded', 'failed'] } } } },
    { label: 'The file is moved to /history/done once the job has its records', rule: { type: 'before', first: 'batch-job', then: 'sftp-move', thenWhere: { targetPath: '/history/done' }, outside: true } },
  ],
  simulation: {
    systems: { files: { [file]: csv }, db: { tables, procedures } },
    tests: [
      {
        name: 'A weekly file',
        about: 'Every row reaches staging with job 301. On Complete marks job 301 COMPLETED with 3 loaded and 0 failed, and the file moves to done.',
        trigger: { file: { path: file } },
        expect: {
          noError: true,
          db: { sales_history_staging: { count: 3, has: [{ sku: 'BOTTLE-1L', units: 11, job_id: 301 }] }, job_log: { has: [{ job_id: 301, status: 'COMPLETED', loaded: 3, failed: 0 }] } },
          files: { [`/history/done/${name}`]: { exists: true } },
        },
      },
      {
        name: 'SQL Server refuses the group',
        about: 'The bulk insert fails, so the job counts the records as failed. Job 301 says COMPLETED_WITH_ERRORS with 3 failed, for the morning check.',
        trigger: { file: { path: file } },
        overrides: { systems: { db: { failWhen: [{ match: 'INSERT INTO dbo.sales_history_staging', fault: 'QUERY_EXECUTION' }] } } },
        expect: { db: { job_log: { has: [{ job_id: 301, status: 'COMPLETED_WITH_ERRORS', failed: 3 }] } } },
      },
    ],
  },
  referenceFlow: design(
    flow('sales-history-load', source('sftp-listener', { directory: '/history/in', matcher: 'SALES_HIST_*.csv', postAction: 'none', timeBetweenSizeCheck: 30000 }), [
      step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
      step('db-stored-procedure', { database: 'SQL Server', sql: '{ call dbo.usp_job_start(:jobName) }', inputParameters: '#[{ jobName: "SALES_HISTORY_LOAD" }]', target: 'job' }),
      step('set-variable', { variableName: 'jobId', value: '#[vars.job.job_id]' }),
      router(
        'batch-job',
        { jobName: 'sales-history-load', blockSize: 500, maxFailedRecords: -1 },
        [
          route({ name: 'stage-rows', acceptPolicy: 'NO_FAILURES' }, [
            step('transform', {
              script: '%dw 2.0\noutput application/java\n---\n{ business_date: payload.business_date, store: payload.store, sku: payload.sku, units: payload.units as Number, net_sales: payload.net_sales as Number, job_id: vars.jobId }',
            }),
            scope('batch-aggregator', { size: 500, streaming: 'false' }, [
              step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.sales_history_staging (business_date, store, sku, units, net_sales, job_id) VALUES (:business_date, :store, :sku, :units, :net_sales, :job_id)' }),
            ]),
          ]),
        ],
        {
          onComplete: [
            step('db-update', {
              database: 'SQL Server',
              sql: 'UPDATE dbo.job_log SET status = :status, loaded = :loaded, failed = :failed WHERE job_id = :jobId',
              inputParameters: '#[{ jobId: vars.jobId, loaded: payload.successfulRecords, failed: payload.failedRecords, status: if (payload.failedRecords > 0) "COMPLETED_WITH_ERRORS" else "COMPLETED" }]',
            }),
          ],
        },
      ),
      step('sftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/history/done', overwrite: 'true' }),
    ]),
  ),
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, sends the planning platform a year of sales history to train its forecasts. Every Monday a weekly history file lands on Brindle's **SFTP server**, folder \`/history/in\`, named \`SALES_HIST_<week>.csv\`. A file holds **about 5 million rows**:

\`\`\`
business_date,store,sku,units,net_sales
2026-11-09,0101,TENT-2P-OLV,2,258.00
\`\`\`

The rows go to the SQL Server table \`dbo.sales_history_staging\` (the same columns plus \`job_id\`). Every load has a row in \`dbo.job_log\` (\`job_id\`, \`job_name\`, \`status\`, \`loaded\`, \`failed\`). \`dbo.usp_job_start(@jobName)\` inserts a \`STARTED\` row and returns its \`job_id\`.

Inserting row by row took nine hours. One big insert ran out of memory.

**Requirements**
- Start a job row named \`SALES_HISTORY_LOAD\`, and tag each staged row with its \`job_id\`.
- Load the rows through a **Batch Job**, inserting them in groups with a bulk insert.
- When the job ends, write the loaded and failed counts to the job row, with status \`COMPLETED\` or \`COMPLETED_WITH_ERRORS\`.
- Move the file to \`/history/done\`.

**Design the flow.**
`,
  answerTemplate: `## The job row

## The Batch Job

## On Complete

## The file
`,
  keyPoints: [
    'A Batch Job splits the file into records and works on blocks in parallel. The Batch Aggregator hands a step a list of records, which suits a bulk insert.',
    'A group of 500 to 1,000 rows per bulk insert is a usual start. Measure, because row width and indexes change the best size.',
    'Variables set before the job, such as jobId, can be read in the steps and in On Complete. Check this on your Mule version.',
    'On Complete gets the job result: successfulRecords and failedRecords. Write them to the job row there.',
    'maxFailedRecords -1 lets the job finish when some groups fail, so On Complete can report them.',
  ],
  solution: `
1. **SFTP On New or Updated File** on \`/history/in\`, size check wait 30 seconds. Use a repeatable file store stream for a file this size.
2. **Set Variable** \`filePath\`. **Stored Procedure** \`usp_job_start\`, then **Set Variable** \`jobId\`.
3. **Batch Job** (block size 500, max failed records -1):
   - Step \`stage-rows\`: **Transform** the record with \`job_id\`, then **Batch Aggregator** (size 500) with **Bulk Insert** into \`dbo.sales_history_staging\`.
   - **On Complete**: **Database Update** the job row with the counts and the status.
4. **SFTP Move** the file to \`/history/done\`.

**Moving the file.** The Batch Job queues the records and returns at once, so the move happens while the job runs. Mule keeps its own copy of the records, so the file can go.
`,
  followUps: [
    {
      q: 'One bad row fails a whole group of 500. How would you find it?',
      a: 'Fall back to row by row inserts for a group that fails: each good row loads, and the bad one goes to a reject table with its error.',
    },
    {
      q: 'SQL Server\'s log grows fast during the load. What can help?',
      a: 'Ask the DBA about the recovery model during the load window, a heap or fewer indexes on the staging table, and TABLOCK on a bulk load. These are database settings, not Mule ones.',
    },
  ],
}

import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const name = 'CARRIER_INVOICES_20261113.csv'
const file = `/invoices/in/${name}`
const clean = 'invoice_line,carrier,shipment,amount\nIL-9001,HARROW-HAUL,SHP-30011,412.50\nIL-9002,HARROW-HAUL,SHP-30012,98.00\nIL-9003,KESTREL-LINES,SHP-30019,1210.75'
const oneBad = 'invoice_line,carrier,shipment,amount\nIL-9001,HARROW-HAUL,SHP-30011,412.50\nIL-9002,HARROW-HAUL,SHP-30012,\nIL-9003,KESTREL-LINES,SHP-30019,1210.75'
const tables = {
  invoice_line_staging: { key: 'invoice_line', columns: ['invoice_line', 'carrier', 'shipment', { name: 'amount', notNull: true }, 'job_id'], rows: [] },
  // rejects from last night's job stay in the table for support
  invoice_rejects: {
    columns: ['job_id', 'invoice_line', 'error_text'],
    rows: [
      { job_id: 500, invoice_line: 'IL-8870', error_text: 'Cannot insert the value NULL into column amount' },
      { job_id: 500, invoice_line: 'IL-8871', error_text: 'Cannot insert the value NULL into column amount' },
    ],
  },
  job_log: { key: 'job_id', columns: ['job_id', 'job_name', 'status', 'loaded', 'rejected'], rows: [{ job_id: 500, job_name: 'CARRIER_INVOICES_IN', status: 'COMPLETED_WITH_REJECTS', loaded: 30411, rejected: 2 }] },
}
const procedures = {
  'dbo.usp_job_start': (args, db) => {
    const rows = db.tables.job_log.rows
    const id = Math.max(0, ...rows.map((r) => r.job_id)) + 1
    rows.push({ job_id: id, job_name: args.jobName, status: 'STARTED', loaded: null, rejected: null })
    return { job_id: id }
  },
}
const insertSql = 'INSERT INTO dbo.invoice_line_staging (invoice_line, carrier, shipment, amount, job_id) VALUES (:invoice_line, :carrier, :shipment, :amount, :job_id)'

export default {
  id: 'fl-254',
  category: 'flows',
  title: 'Carrier Invoices Through a Batch Job: Bulk Insert With a Row by Row Fallback, Rejects Tagged With the Job ID, and a Job Log Built From What the Tables Hold, Not From the Batch Counts',
  level: 'ADVANCED',
  tags: ['myproject', 'batch', 'sql-server', 'bulk-insert', 'fallback', 'reject-table', 'job-log', 'batch-aggregator'],
  estMinutes: 50,
  flowChecks: [
    {
      label: 'Each group is bulk inserted inside a Try that begins a transaction, within a Batch Aggregator',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'db-bulk-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'invoice_line_staging' } },
          { type: 'inside', component: 'db-bulk-insert', within: 'batch-aggregator' },
        ],
      },
    },
    { label: 'When a group fails, its rows are inserted one by one in a For Each', rule: { type: 'inside', component: 'db-insert', within: 'foreach', where: { sql: 'invoice_line_staging' } } },
    { label: 'A row that still fails goes to dbo.invoice_rejects with the job ID and the error', rule: { type: 'inside', component: 'db-insert', within: 'on-error-continue', where: { sql: { all: ['invoice_rejects', 'job_id', 'error_text'] } } } },
    { label: 'On Complete counts this job\'s rejects by job ID', rule: { type: 'inside', component: 'db-select', within: 'batch-job', inSlot: 'onComplete', where: { sql: { all: ['invoice_rejects', 'job_id'] } } } },
    { label: 'On Complete writes the status and counts to the job row', rule: { type: 'inside', component: 'db-update', within: 'batch-job', inSlot: 'onComplete', where: { sql: { all: ['job_log', 'status', 'loaded', 'rejected'] } } } },
  ],
  simulation: {
    systems: { files: { [file]: clean }, db: { tables, procedures } },
    tests: [
      {
        name: 'A clean file',
        about: 'Every line loads in one bulk insert. Job 501 is COMPLETED with 3 loaded and 0 rejected, even though last night\'s rejects are still in the table.',
        trigger: { file: { path: file } },
        expect: {
          noError: true,
          db: { invoice_line_staging: { count: 3 }, invoice_rejects: { count: 2 }, job_log: { has: [{ job_id: 501, status: 'COMPLETED', loaded: 3, rejected: 0 }] } },
        },
      },
      {
        name: 'One line with no amount',
        about: 'IL-9002 has no amount. The group is rolled back and tried line by line: two lines load, IL-9002 is rejected under job 501, and job 501 says 2 loaded and 1 rejected.',
        trigger: { file: { path: file } },
        overrides: { systems: { files: { [file]: oneBad } } },
        expect: {
          db: {
            invoice_line_staging: { count: 2, has: [{ invoice_line: 'IL-9001', job_id: 501 }, { invoice_line: 'IL-9003' }] },
            invoice_rejects: { count: 3, has: [{ job_id: 501, invoice_line: 'IL-9002' }] },
            job_log: { has: [{ job_id: 501, status: 'COMPLETED_WITH_REJECTS', loaded: 2, rejected: 1 }] },
          },
        },
      },
    ],
  },
  referenceFlow: design(
    flow('carrier-invoices-load', source('sftp-listener', { directory: '/invoices/in', matcher: 'CARRIER_INVOICES_*.csv', postAction: 'move', moveTo: '/invoices/done', timeBetweenSizeCheck: 15000 }), [
      step('db-stored-procedure', { database: 'SQL Server', sql: '{ call dbo.usp_job_start(:jobName) }', inputParameters: '#[{ jobName: "CARRIER_INVOICES_IN" }]', target: 'job' }),
      step('set-variable', { variableName: 'jobId', value: '#[vars.job.job_id]' }),
      router(
        'batch-job',
        { jobName: 'carrier-invoices-load', blockSize: 500, maxFailedRecords: -1 },
        [
          route({ name: 'stage', acceptPolicy: 'NO_FAILURES' }, [
            step('transform', {
              script: '%dw 2.0\noutput application/java\n---\n{ invoice_line: payload.invoice_line, carrier: payload.carrier, shipment: payload.shipment, amount: if (isBlank(payload.amount)) null else payload.amount as Number, job_id: vars.jobId }',
            }),
            scope('batch-aggregator', { size: 500, streaming: 'false' }, [
              step('set-variable', { variableName: 'group', value: '#[payload]' }),
              scope('try', {}, [scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [step('db-bulk-insert', { database: 'SQL Server', sql: insertSql })])], {
                errorHandlers: [
                  handler('on-error-continue', { type: 'DB:QUERY_EXECUTION' }, [
                    step('logger', { level: 'WARN', message: '#["Bulk insert of " ++ (sizeOf(vars.group) as String) ++ " lines failed, inserting one by one"]' }),
                    scope('foreach', { collection: '#[vars.group]' }, [
                      scope('try', {}, [step('db-insert', { database: 'SQL Server', sql: insertSql, inputParameters: '#[payload]', target: 'one' })], {
                        errorHandlers: [
                          handler('on-error-continue', { type: 'ANY' }, [
                            step('db-insert', {
                              database: 'SQL Server',
                              sql: 'INSERT INTO dbo.invoice_rejects (job_id, invoice_line, error_text) VALUES (:jobId, :line, :errorText)',
                              inputParameters: '#[{ jobId: payload.job_id, line: payload.invoice_line, errorText: error.description }]',
                              target: 'rejected',
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
            step('db-select', { database: 'SQL Server', sql: 'SELECT COUNT(*) AS n FROM dbo.invoice_rejects WHERE job_id = :jobId', inputParameters: '#[{ jobId: vars.jobId }]', target: 'rejects' }),
            step('db-select', { database: 'SQL Server', sql: 'SELECT COUNT(*) AS n FROM dbo.invoice_line_staging WHERE job_id = :jobId', inputParameters: '#[{ jobId: vars.jobId }]', target: 'staged' }),
            step('db-update', {
              database: 'SQL Server',
              sql: 'UPDATE dbo.job_log SET status = :status, loaded = :loaded, rejected = :rejected WHERE job_id = :jobId',
              inputParameters: '#[{ jobId: vars.jobId, loaded: vars.staged[0].n, rejected: vars.rejects[0].n, status: if (vars.rejects[0].n == 0) "COMPLETED" else "COMPLETED_WITH_REJECTS" }]',
            }),
          ],
        },
      ),
    ]),
  ),
  description: `
Quayle Freight, a fictional freight forwarder, loads carrier invoice lines every night. Each carrier's billing system drops \`CARRIER_INVOICES_<date>.csv\` on the **SFTP server**, folder \`/invoices/in\`, about **1.5 million lines**:

\`\`\`
invoice_line,carrier,shipment,amount
IL-9001,HARROW-HAUL,SHP-30011,412.50
\`\`\`

The lines go to \`dbo.invoice_line_staging\` (key \`invoice_line\`, \`amount\` NOT NULL, \`job_id\`). Each run has a row in \`dbo.job_log\` (\`job_id\`, \`job_name\`, \`status\`, \`loaded\`, \`rejected\`), started by \`dbo.usp_job_start(@jobName)\`.

The team wants:
- the speed of bulk inserts in groups of 500,
- every good line loaded even when its group holds a bad one,
- each bad line in \`dbo.invoice_rejects\` (\`job_id\`, \`invoice_line\`, \`error_text\`), which keeps rejects from earlier jobs for support,
- a job row that says how many lines this job loaded and rejected.

A first try wrote \`successfulRecords\` and \`failedRecords\` to the job row. It said \`rejected=0\` on a night with 40 rejects.

**Requirements**
- Start a job row \`CARRIER_INVOICES_IN\` and tag each line with its \`job_id\`.
- Bulk insert each group. If it fails, roll it back and insert its lines one by one; a line that still fails goes to the reject table with the job ID and the database's error text.
- When the job ends, write \`loaded\`, \`rejected\` and a status: \`COMPLETED\` with no rejects, else \`COMPLETED_WITH_REJECTS\`.

**Facts**
- \`dbo.usp_job_start\` returns \`{ job_id }\`.
- A blank amount goes in as null, so the database refuses that line.
- A failed bulk insert raises \`DB:QUERY_EXECUTION\`. \`error_text\` holds \`error.description\` of the single insert that failed.
- \`loaded\` is the number of staging rows with this job's ID, and \`rejected\` the number of reject rows with it.

**Design the flow.**
`,
  answerTemplate: `## The job row

## Bulk insert and fallback

## Why the batch counts are wrong here

## The job row at the end
`,
  keyPoints: [
    'The fallback handler is On Error Continue, so the aggregator step ends as a success. Mule counts a rejected line as successful, so failedRecords stays 0.',
    'The tables hold the truth: count staging and rejects for this job ID in On Complete.',
    'Rejects from earlier jobs stay for support. Without WHERE job_id the count includes them.',
    'The inner Try begins a transaction, so a failed bulk insert leaves no rows behind and the single inserts do not clash with them.',
    'Most groups are clean and take the fast path. Only a group with a bad line pays for the slow one.',
  ],
  solution: `
1. **SFTP On New or Updated File** on \`/invoices/in\`, size check wait 15 seconds, move to \`/invoices/done\` after reading.
2. **Stored Procedure** \`usp_job_start\`, **Set Variable** \`jobId\`.
3. **Batch Job** (max failed records -1), step \`stage\`:
   - **Transform** with \`job_id\` (blank amount becomes null).
   - **Batch Aggregator** (size 500): **Set Variable** \`group\`; **Try** { **Try** ALWAYS_BEGIN { **Bulk Insert** } } with **On Error Continue** (DB:QUERY_EXECUTION): WARN log, **For Each** \`vars.group\`: **Try** { **Insert** } with **On Error Continue** { **Insert** into \`dbo.invoice_rejects\` }.
4. **On Complete**: **Select** \`COUNT(*)\` of rejects and of staging for \`vars.jobId\`, then **Database Update** of the job row.
`,
  followUps: [
    {
      q: 'Could the reject handler use On Error Propagate so the batch counts are right?',
      a: 'Then the whole aggregator step fails and Mule marks every record of the group as failed, the good ones too. The counts would be wrong the other way. Count from the tables instead.',
    },
    {
      q: 'A carrier sends a file where every line is bad. What does this design do?',
      a: 'Every group falls back to 500 single inserts that all fail. It is slow but correct. A check in On Complete that alerts when rejected is above, say, 5% of the lines tells support the file itself is broken.',
    },
  ],
}

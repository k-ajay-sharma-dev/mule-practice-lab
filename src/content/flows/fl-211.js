import { design, flow, handler, source, step } from '../../flow/dsl.js'

const tables = {
  job_log: {
    key: 'job_id',
    columns: ['job_id', 'job_name', 'status', 'row_count', 'error_text'],
    rows: [
      { job_id: 40, job_name: 'ITEM_OUTBOUND', status: 'COMPLETED', row_count: 1198, error_text: null },
      { job_id: 41, job_name: 'ITEM_OUTBOUND', status: 'STARTED', row_count: null, error_text: null },
    ],
  },
}
const procedures = {
  // inserts a STARTED row and returns its key (OUTPUT INSERTED.job_id inside the procedure)
  'dbo.usp_job_start': (args, db) => {
    const rows = db.tables.job_log.rows
    const id = Math.max(0, ...rows.map((r) => r.job_id)) + 1
    rows.push({ job_id: id, job_name: args.jobName, status: 'STARTED', row_count: null, error_text: null })
    return { job_id: id }
  },
  // fills the outbound item table for this job and says how many rows it wrote
  'dbo.usp_generate_item_outbound': () => ({ row_count: 1240 }),
}

export default {
  id: 'fl-211',
  category: 'flows',
  title: 'A Job Log Row Around the Nightly Item Outbound Procedure in SQL Server: Start It, Complete It With the Count, or Mark It Failed',
  level: 'BEGINNER',
  tags: ['myproject', 'sql-server', 'job-log', 'stored-procedure', 'scheduler', 'outbound'],
  estMinutes: 20,
  flowChecks: [
    { label: 'The job row is started through dbo.usp_job_start before the outbound procedure runs', rule: { type: 'before', first: 'db-stored-procedure', firstWhere: { sql: 'usp_job_start' }, then: 'db-stored-procedure', thenWhere: { sql: 'usp_generate_item_outbound' } } },
    { label: 'The job row is marked COMPLETED, by its own job_id, after the procedure', rule: { type: 'before', first: 'db-stored-procedure', firstWhere: { sql: 'usp_generate_item_outbound' }, then: 'db-update', thenWhere: { sql: { all: ['COMPLETED', 'job_id'] } }, outside: true } },
    { label: 'A failure marks the job row FAILED', rule: { type: 'inside', component: 'db-update', within: ['on-error-propagate', 'on-error-continue'], where: { sql: 'FAILED' } } },
  ],
  simulation: {
    systems: { db: { tables, procedures } },
    tests: [
      {
        name: 'A normal night',
        about: 'Job 42 starts, the procedure writes 1,240 rows, and job 42 is COMPLETED with that count. Job 41, left STARTED by a crash last week, is not touched.',
        trigger: { schedule: {} },
        expect: { db: { job_log: { has: [{ job_id: 42, status: 'COMPLETED', row_count: 1240 }, { job_id: 41, status: 'STARTED' }] } } },
      },
      {
        name: 'The outbound procedure fails',
        about: 'The procedure raises an error. Job 42 is marked FAILED with the reason, so the morning check sees it.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { procedures: { 'dbo.usp_generate_item_outbound': null } } } },
        expect: { db: { job_log: { has: [{ job_id: 42, status: 'FAILED' }] } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'item-outbound-job',
      source('scheduler', { strategy: 'cron', expression: '0 0 22 * * ?' }),
      [
        step('db-stored-procedure', { database: 'SQL Server', sql: '{ call dbo.usp_job_start(:jobName) }', inputParameters: '#[{ jobName: "ITEM_OUTBOUND" }]', target: 'job' }),
        step('set-variable', { variableName: 'jobId', value: '#[vars.job.job_id]' }),
        step('db-stored-procedure', { database: 'SQL Server', sql: '{ call dbo.usp_generate_item_outbound(:jobId) }', inputParameters: '#[{ jobId: vars.jobId }]', target: 'generated' }),
        step('db-update', {
          database: 'SQL Server',
          sql: "UPDATE dbo.job_log SET status = 'COMPLETED', row_count = :rowCount WHERE job_id = :jobId",
          inputParameters: '#[{ jobId: vars.jobId, rowCount: vars.generated.row_count }]',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('db-update', {
            database: 'SQL Server',
            sql: "UPDATE dbo.job_log SET status = 'FAILED', error_text = :errorText WHERE job_id = :jobId",
            inputParameters: '#[{ jobId: vars.jobId, errorText: error.description }]',
          }),
        ]),
      ],
    ),
  ),
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, builds its nightly item feed inside SQL Server. A stored procedure, \`dbo.usp_generate_item_outbound(@jobId)\`, fills an outbound table and returns \`row_count\`. A Mule flow runs it at 22:00.

Support checks \`dbo.job_log\` (\`job_id\`, \`job_name\`, \`status\`, \`row_count\`, \`error_text\`) each morning. The DBA team gives you \`dbo.usp_job_start(@jobName)\`, which inserts a \`STARTED\` row and returns its new \`job_id\`.

Last week the runtime restarted during a run, and job 41 still says \`STARTED\`.

**Requirements**
- Start a job row named \`ITEM_OUTBOUND\` before the work.
- Run the outbound procedure with the job ID.
- Mark this run's row \`COMPLETED\` with the row count, or \`FAILED\` with the error text.

**What each system sends back**
- \`{ call dbo.usp_job_start(:jobName) }\` answers \`{ "job_id": 42 }\` on the test night. Keep it in a target variable and read \`vars.job.job_id\`.
- \`{ call dbo.usp_generate_item_outbound(:jobId) }\` answers \`{ "row_count": 1240 }\`. Keep it in a target variable too, so the job ID is not lost.

**What failures look like**
- The outbound procedure fails: the Stored procedure operation raises \`DB:QUERY_EXECUTION\` with the database's message in \`error.description\`. An On Error Propagate writes \`FAILED\` and that text to the job row, and the run still fails.

**Design the flow.**
`,
  answerTemplate: `## Starting the job row

## The work

## Completing or failing it
`,
  keyPoints: [
    'Get the new key back from the insert (OUTPUT INSERTED inside the procedure) and keep it in a variable.',
    'Every later update names that job_id. "WHERE status = STARTED" would also close job 41 from last week.',
    'Use a target variable on each procedure call, so the result does not replace the payload.',
    'The error handler updates the same row with the reason. A row left STARTED then always means the runtime died, which is a different alert.',
  ],
  solution: `
1. **Scheduler**, cron \`0 0 22 * * ?\`.
2. **Stored Procedure** \`{ call dbo.usp_job_start(:jobName) }\`, target \`job\`. **Set Variable** \`jobId\`.
3. **Stored Procedure** \`{ call dbo.usp_generate_item_outbound(:jobId) }\`, target \`generated\`.
4. **Database Update** \`status = 'COMPLETED', row_count = :rowCount WHERE job_id = :jobId\`.
5. Flow **On Error Propagate**: **Database Update** \`status = 'FAILED', error_text\` for the job.

**Without a procedure.** A plain insert can return the key too: \`INSERT ... OUTPUT INSERTED.job_id VALUES (...)\` run as a Select, or an Insert with auto generated keys on. Check what your driver returns for the key column.
`,
  followUps: [
    {
      q: 'How would you find runs like job 41 automatically?',
      a: 'A morning check selects rows still STARTED after a set time, for example two hours, and alerts. Those are runs that died without reaching the handler.',
    },
    {
      q: 'Why not one row per step instead of one per job?',
      a: 'For a longer job that helps: a job_step table with a row per step shows where a run stopped. One row is enough when there is one real step.',
    },
  ],
}

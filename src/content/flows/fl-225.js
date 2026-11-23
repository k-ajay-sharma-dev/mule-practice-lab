import { design, flow, handler, source, step } from '../../flow/dsl.js'

const row = (id, loadedAt) => ({ row_id: id, supplier_id: 'SUP-HALE', item_id: `IT-${id}`, loaded_at: loadedAt })
const tables = () => ({
  job_log: { key: 'job_id', columns: ['job_id', 'job_name', 'status', 'row_count'], rows: [] },
  stg_supplier_items: { key: 'row_id', rows: [row(1, '2026-09-02'), row(2, '2026-10-01'), row(3, '2026-11-10'), row(4, '2026-11-12')] },
})

export default {
  id: 'fl-225',
  category: 'flows',
  title: 'A Nightly Purge of Old Oracle Staging Rows With a Job Log Row: STARTED First, Then COMPLETED With the Count or FAILED',
  level: 'BEGINNER',
  tags: ['myproject', 'oracle', 'job-log', 'scheduler', 'housekeeping', 'staging'],
  estMinutes: 20,
  flowChecks: [
    { label: 'A Scheduler starts the purge every night at 01:30', rule: { type: 'source', component: 'scheduler', where: { expression: '0 30 1' } } },
    { label: 'The job is logged as STARTED before anything is deleted', rule: { type: 'before', first: 'db-insert', firstWhere: { sql: { all: ['job_log', 'STARTED'] } }, then: 'db-delete' } },
    { label: 'Only rows older than the cut off are deleted', rule: { type: 'exists', component: 'db-delete', where: { sql: { all: ['stg_supplier_items', 'loaded_at <'] } } } },
    { label: 'The job row ends COMPLETED with the number of rows deleted', rule: { type: 'before', first: 'db-delete', then: 'db-update', thenWhere: { sql: { all: ['COMPLETED', 'row_count'] } }, outside: true } },
    { label: 'A failed purge marks the job FAILED in the error handler', rule: { type: 'inside', component: 'db-update', within: ['on-error-continue', 'on-error-propagate'], where: { sql: 'FAILED' } } },
  ],
  simulation: {
    systems: { db: { tables: tables() } },
    tests: [
      {
        name: 'The nightly purge',
        about: 'Rows loaded more than 30 days ago (2 of the 4) are deleted. The job row ends COMPLETED with a count of 2.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          db: { stg_supplier_items: { count: 2, lacks: [{ row_id: 1 }, { row_id: 2 }] }, job_log: { count: 1, has: [{ job_name: 'PURGE_STG_SUPPLIER_ITEMS', status: 'COMPLETED', row_count: 2 }] } },
        },
      },
      {
        name: 'The delete fails',
        about: 'Oracle refuses the delete. The rows stay, and the job row says FAILED, so the morning check sees it.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { failWhen: [{ match: 'DELETE FROM stg_supplier_items', fault: 'QUERY_EXECUTION', description: 'ORA-00054: resource busy' }] } } },
        expect: { db: { stg_supplier_items: { count: 4 }, job_log: { count: 1, has: [{ status: 'FAILED' }] } }, logs: [{ level: 'ERROR' }] },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'purge-supplier-staging',
      source('scheduler', { strategy: 'cron', expression: '0 30 1 * * ?' }),
      [
        step('set-variable', { variableName: 'jobId', value: '#[uuid()]' }),
        step('set-variable', { variableName: 'cutoff', value: '#[(now() - |P30D|) as String {format: "yyyy-MM-dd"}]' }),
        step('db-insert', {
          database: 'Oracle',
          sql: "INSERT INTO job_log (job_id, job_name, status) VALUES (:jobId, 'PURGE_STG_SUPPLIER_ITEMS', 'STARTED')",
          inputParameters: '#[{ jobId: vars.jobId }]',
          target: 'started',
        }),
        step('db-delete', { database: 'Oracle', sql: 'DELETE FROM stg_supplier_items WHERE loaded_at < :cutoff', inputParameters: '#[{ cutoff: vars.cutoff }]', target: 'deleted' }),
        step('db-update', {
          database: 'Oracle',
          sql: "UPDATE job_log SET status = 'COMPLETED', row_count = :rowCount WHERE job_id = :jobId",
          inputParameters: '#[{ rowCount: vars.deleted.affectedRows, jobId: vars.jobId }]',
          target: 'finished',
        }),
      ],
      [
        handler('on-error-continue', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Purge job " ++ vars.jobId ++ " failed: " ++ error.description]' }),
          step('db-update', { database: 'Oracle', sql: "UPDATE job_log SET status = 'FAILED' WHERE job_id = :jobId", inputParameters: '#[{ jobId: vars.jobId }]' }),
        ]),
      ],
    ),
  ),
  description: `
Fenwick Supply, a fictional builders' merchant, loads supplier item files into the Oracle staging table \`stg_supplier_items\` (\`row_id\`, \`supplier_id\`, \`item_id\`, \`loaded_at\` as \`yyyy-MM-dd\`). Nothing cleans it up, and the table has grown to 80 million rows.

Every job at Fenwick writes a row in \`job_log\` (\`job_id\`, \`job_name\`, \`status\`, \`row_count\`). Support checks it each morning.

**Requirements**
- Every night at 01:30, delete staging rows loaded more than 30 days ago.
- Write a \`job_log\` row with job name \`PURGE_STG_SUPPLIER_ITEMS\` and status \`STARTED\` before deleting.
- When the delete works, set the row to \`COMPLETED\` with \`row_count\` = rows deleted.
- When it fails, log an ERROR and set the row to \`FAILED\`.

**Facts**
- Make the \`job_id\` with \`uuid()\` at the start of the run.
- Work out the cut off once as \`yyyy-MM-dd\` text (today minus 30 days) and pass it as a parameter.
- The Database Delete result has \`affectedRows\`, for example \`{ "affectedRows": 2 }\`. Keep it in a target variable.

**What failures look like**
- Oracle refuses the delete: it raises \`DB:QUERY_EXECUTION\` with \`ORA-00054: resource busy\` in \`error.description\`. The rows stay, and the handler logs an ERROR and sets the job row to \`FAILED\`.

**Design the flow.**
`,
  answerTemplate: `## The schedule

## The job log row

## The delete

## When it fails
`,
  keyPoints: [
    'Write the STARTED row first. If the job dies half way, support still sees that it ran and when.',
    'The Database Delete result holds affectedRows. Keep it with a Target variable, then write it to the job row.',
    'Work out the cut off once, at the start, and pass it as a parameter. Every statement then uses the same date.',
    'A handler that marks the job FAILED turns a silent failure into a row support will see in the morning.',
  ],
  solution: `
1. **Scheduler**, cron \`0 30 1 * * ?\`.
2. **Set Variable** \`jobId\` (\`#[uuid()]\`) and \`cutoff\` (today minus 30 days).
3. **Database Insert** into \`job_log\` with \`STARTED\`, Target \`started\`.
4. **Database Delete** \`WHERE loaded_at < :cutoff\`, Target \`deleted\`.
5. **Database Update** \`job_log\` to \`COMPLETED\` with \`row_count = vars.deleted.affectedRows\`.
6. **On Error Continue** (ANY): ERROR log, **Database Update** to \`FAILED\`.

**Millions of rows.** One delete of 70 million rows holds undo space and locks for a long time. Delete in chunks (\`AND ROWNUM <= 50000\`) in a loop until nothing is left, or ask the DBA to partition the table by load date and drop old partitions.
`,
  followUps: [
    {
      q: 'Why is the STARTED insert not in a transaction with the delete?',
      a: 'A rollback would remove it, and the failed run would leave no trace. The log row must outlive the failure it reports.',
    },
    {
      q: 'Should the cut off use the database clock or Mule\'s clock?',
      a: 'Either, but pick one. SYSDATE - 30 in the SQL uses the database clock and avoids time zone surprises between the two servers.',
    },
  ],
}

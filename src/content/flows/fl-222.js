import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const job = (job_id, status, attempts) => ({ job_id, job_name: 'REPL_PLAN_IN', status, attempts })
const staging = [
  { job_id: 520, store: '0101', sku: 'TENT-2P-OLV', qty: 5 },
  { job_id: 520, store: '0102', sku: 'JKT-RAIN-M', qty: 8 },
]
const base = {
  job_log: { key: 'job_id', rows: [job(519, 'COMPLETED', 0), job(520, 'FAILED', 1), job(521, 'STARTED', 0)] },
  repl_staging: { rows: staging },
  store_replenishment: { key: ['store', 'sku'], rows: [{ store: '0101', sku: 'TENT-2P-OLV', qty: 2, job_id: 519 }] },
}
const procedures = {
  'dbo.usp_merge_replenishment': (args, db) => {
    const target = db.tables.store_replenishment.rows
    const mine = db.tables.repl_staging.rows.filter((r) => r.job_id === args.jobId)
    for (const s of mine) {
      const hit = target.find((t) => t.store === s.store && t.sku === s.sku)
      if (hit) Object.assign(hit, { qty: s.qty, job_id: s.job_id })
      else target.push({ store: s.store, sku: s.sku, qty: s.qty, job_id: s.job_id })
    }
    return { merged: mine.length }
  },
}
const thirdTry = { tables: { job_log: { key: 'job_id', rows: [job(519, 'COMPLETED', 0), job(520, 'FAILED', 2)] } }, procedures: { 'dbo.usp_merge_replenishment': null } }

export default {
  id: 'fl-222',
  category: 'flows',
  title: 'A Restart Flow for Failed Plan Loads in SQL Server: Check the Database First, Retry Each Failed Job From Staging, Count the Attempts, and Give Up Loudly After Three',
  level: 'EXPERT',
  tags: ['myproject', 'sql-server', 'restart', 'job-log', 'health-check', 'merge', 'email'],
  estMinutes: 50,
  flowChecks: [
    { label: 'A health check query runs before any job is looked at', rule: { type: 'before', first: 'db-select', firstWhere: { sql: 'SELECT 1' }, then: 'db-select', thenWhere: { sql: 'job_log' } } },
    { label: 'Only FAILED jobs with fewer than 3 attempts are picked', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['job_log', 'FAILED', 'attempts < 3'] } } } },
    { label: 'Each job is retried on its own in a For Each with a Try', rule: { type: 'inside', component: 'db-stored-procedure', within: 'try', where: { sql: 'usp_merge_replenishment' } } },
    { label: 'A retry that fails adds one to attempts and the loop goes on', rule: { type: 'inside', component: 'db-update', within: 'on-error-continue', where: { sql: 'attempts = attempts + 1' } } },
    { label: 'The third failure marks the job ABANDONED and emails support', rule: { type: 'all', rules: [{ type: 'inside', component: 'db-update', within: 'choice', where: { sql: 'ABANDONED' } }, { type: 'inside', component: 'email-send', within: 'choice' }] } },
  ],
  simulation: {
    systems: { db: { tables: base, procedures } },
    tests: [
      {
        name: 'A failed load is restarted',
        about: 'Job 520 failed last night because the MERGE timed out. Today it merges from its staging rows and is COMPLETED. Job 521, still STARTED, is not touched.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          db: { job_log: { has: [{ job_id: 520, status: 'COMPLETED' }, { job_id: 521, status: 'STARTED' }] }, store_replenishment: { has: [{ store: '0101', qty: 5, job_id: 520 }, { store: '0102', qty: 8 }] } },
          noEmails: true,
        },
      },
      {
        name: 'The merge fails again',
        about: 'Job 520 fails a second time. Its attempts go from 1 to 2 and it stays FAILED for the next run. No email yet.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { procedures: { 'dbo.usp_merge_replenishment': null } } } },
        expect: { noError: true, db: { job_log: { has: [{ job_id: 520, status: 'FAILED', attempts: 2 }] } }, noEmails: true },
      },
      {
        name: 'The third failure',
        about: 'Job 520 already has 2 attempts and fails again. It becomes ABANDONED, so it is never picked again, and support is emailed.',
        trigger: { schedule: {} },
        overrides: { systems: { db: thirdTry } },
        expect: { db: { job_log: { has: [{ job_id: 520, status: 'ABANDONED', attempts: 3 }] } }, emails: [{ to: 'replenishment-support@brindle.example', has: '520', count: 1 }] },
      },
      {
        name: 'SQL Server is down',
        about: 'The health check fails and the run stops at once. No job uses up an attempt, and no email goes out.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { fault: 'CONNECTIVITY' } } },
        expect: { error: 'DB:CONNECTIVITY', noEmails: true },
      },
    ],
  },
  referenceFlow: design(
    flow('replenishment-restart', source('scheduler', { strategy: 'fixed-frequency', frequency: 30, timeUnit: 'MINUTES' }), [
      step('db-select', { database: 'SQL Server', sql: 'SELECT 1 AS ok', target: 'health' }),
      step('db-select', { database: 'SQL Server', sql: "SELECT job_id, attempts FROM dbo.job_log WHERE job_name = 'REPL_PLAN_IN' AND status = 'FAILED' AND attempts < 3 ORDER BY job_id" }),
      scope('foreach', { collection: '#[payload]' }, [
        step('set-variable', { variableName: 'job', value: '#[payload]' }),
        scope(
          'try',
          {},
          [
            step('db-stored-procedure', { database: 'SQL Server', sql: '{ call dbo.usp_merge_replenishment(:jobId) }', inputParameters: '#[{ jobId: vars.job.job_id }]', target: 'merged' }),
            step('db-update', { database: 'SQL Server', sql: "UPDATE dbo.job_log SET status = 'COMPLETED' WHERE job_id = :jobId", inputParameters: '#[{ jobId: vars.job.job_id }]' }),
          ],
          {
            errorHandlers: [
              handler('on-error-continue', { type: 'ANY' }, [
                step('db-update', { database: 'SQL Server', sql: 'UPDATE dbo.job_log SET attempts = attempts + 1 WHERE job_id = :jobId', inputParameters: '#[{ jobId: vars.job.job_id }]' }),
                router('choice', {}, [
                  route({ expression: '#[vars.job.attempts + 1 >= 3]' }, [
                    step('db-update', { database: 'SQL Server', sql: "UPDATE dbo.job_log SET status = 'ABANDONED' WHERE job_id = :jobId", inputParameters: '#[{ jobId: vars.job.job_id }]' }),
                    step('email-send', {
                      toAddresses: 'replenishment-support@brindle.example',
                      subject: '#["Replenishment job " ++ (vars.job.job_id as String) ++ " abandoned after 3 attempts"]',
                      content: '#["Job " ++ (vars.job.job_id as String) ++ " could not be merged: " ++ error.description]',
                      contentType: 'text/plain',
                    }),
                  ]),
                ]),
              ]),
            ],
          },
        ),
      ]),
    ]),
  ),
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, loads replenishment plans into SQL Server. The load app stages each plan in \`dbo.repl_staging\` (by \`job_id\`) and runs \`dbo.usp_merge_replenishment(@jobId)\`. When the merge fails, the load marks the job \`FAILED\` in \`dbo.job_log\` (\`job_id\`, \`job_name\`, \`status\`, \`attempts\`) and **keeps the staging rows**.

Most failures are passing: a lock timeout during the nightly index rebuild, or a failover of the availability group. Today support reruns them by hand each morning.

Build a **restart** flow:

**Requirements**
- Every 30 minutes, first check that SQL Server answers (\`SELECT 1\`). If it does not, stop the run.
- Pick \`REPL_PLAN_IN\` jobs with status \`FAILED\` and fewer than 3 attempts.
- For each job, run the merge procedure again. On success mark it \`COMPLETED\`.
- On failure add one to \`attempts\`. When that makes 3, mark it \`ABANDONED\` and email \`replenishment-support@brindle.example\`.
- One job failing must not stop the others.

**Design the flow.**
`,
  answerTemplate: `## Health check

## Picking jobs

## Retrying one job

## Giving up
`,
  keyPoints: [
    'The health check stops a run that would only fail every job and burn their attempts while the database is down.',
    'Staging rows keyed by job_id make a restart possible: the input is still there, so the merge can run again without the file.',
    'A Try per job with On Error Continue keeps the loop going.',
    'An attempts counter and a final ABANDONED state stop a job from being retried for ever, and turn it into a task for a person.',
    'The merge must be safe to run twice. A MERGE that sets values from staging is: running it again gives the same result.',
  ],
  solution: `
1. **Scheduler**, every 30 minutes.
2. **Database Select** \`SELECT 1 AS ok\` (target variable). If SQL Server is down, the run ends here with DB:CONNECTIVITY.
3. **Database Select** failed \`REPL_PLAN_IN\` jobs with \`attempts < 3\`.
4. **For Each** job: **Set Variable** \`job\`, then **Try**:
   - **Stored Procedure** \`usp_merge_replenishment(:jobId)\`, **Database Update** to \`COMPLETED\`.
   - **On Error Continue**: **Update** \`attempts = attempts + 1\`. **Choice** \`attempts + 1 >= 3\`: **Update** to \`ABANDONED\`, **Email Send**.

**On a cluster** run the scheduler on the primary node only, or two nodes may restart the same job at once.

**Which errors to retry.** A data error will fail every time; retrying it three times only delays the email. Mark those ABANDONED at once if the error text shows a data problem.
`,
  followUps: [
    {
      q: 'Why not use Until Successful around the merge instead of a restart flow?',
      a: 'Until Successful waits inside one run, minutes at most. A failover or an index rebuild can take longer, and the job must survive a redeploy. A table based restart can wait hours and support can see it.',
    },
    {
      q: 'The original file was archived. Can support still see what was loaded?',
      a: 'Yes, the staging rows by job_id are the input. Keep them until the job is COMPLETED or ABANDONED and a few days after, then purge.',
    },
  ],
}

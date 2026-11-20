import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const name = 'REPL_20261113_R7781.csv'
const file = `/plan/out/repl/${name}`
const csv = 'line,store,sku,qty\n1,0101,TENT-2P-OLV,6\n2,0102,JKT-RAIN-M,10\n3,0177,JKT-RAIN-M,4'
const tables = {
  stores: { key: 'store', rows: [{ store: '0101', is_open: 1 }, { store: '0102', is_open: 1 }] },
  repl_staging: { columns: ['job_id', 'line', 'store', 'sku', 'qty'], rows: [] },
  repl_rejects: { columns: ['job_id', 'line', 'reason'], rows: [] },
  store_replenishment: { key: ['store', 'sku'], rows: [{ store: '0101', sku: 'TENT-2P-OLV', qty: 2, job_id: 512 }, { store: '0103', sku: 'BOTTLE-1L', qty: 12, job_id: 512 }] },
  job_log: { key: 'job_id', columns: ['job_id', 'job_name', 'status', 'detail'], rows: [{ job_id: 512, job_name: 'REPL_PLAN_IN', status: 'COMPLETED', detail: 'good=2 rejected=0' }] },
}
const procedures = {
  'dbo.usp_job_start': (args, db) => {
    const rows = db.tables.job_log.rows
    const id = Math.max(0, ...rows.map((r) => r.job_id)) + 1
    rows.push({ job_id: id, job_name: args.jobName, status: 'STARTED', detail: null })
    return { job_id: id }
  },
  // a set based MERGE of the job's staging rows into dbo.store_replenishment
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

export default {
  id: 'fl-221',
  category: 'flows',
  title: 'Replenishment Plans From the Planning Platform Into SQL Server, End to End: Job Log, Staging and Reject Tables, a MERGE Procedure for Key Clashes, and an Async Email Report',
  level: 'EXPERT',
  tags: ['myproject', 'sql-server', 'job-log', 'staging', 'reject-table', 'merge', 'async', 'ftp'],
  estMinutes: 60,
  flowChecks: [
    { label: 'Plan files are picked up from /plan/out/repl once their size is stable', rule: { type: 'source', component: 'ftp-listener', where: { directory: '/plan/out/repl', timeBetweenSizeCheck: { gte: 1 } } } },
    { label: 'A job log row is started before anything is staged', rule: { type: 'before', first: 'db-stored-procedure', firstWhere: { sql: 'usp_job_start' }, then: 'try' } },
    {
      label: 'Staging, rejects and the MERGE procedure run in one transaction',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'db-bulk-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'repl_staging' } },
          { type: 'inside', component: 'db-bulk-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'repl_rejects' } },
          { type: 'inside', component: 'db-stored-procedure', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'usp_merge_replenishment' } },
        ],
      },
    },
    { label: 'The job is marked COMPLETED with the counts after the commit', rule: { type: 'before', first: 'try', then: 'db-update', thenWhere: { sql: 'COMPLETED' }, outside: true } },
    { label: 'The report email is sent from an Async scope', rule: { type: 'inside', component: 'email-send', within: 'async' } },
    { label: 'A failure marks the job FAILED and moves the file to /plan/out/repl/error', rule: { type: 'all', rules: [{ type: 'inside', component: 'db-update', within: 'on-error-propagate', where: { sql: 'FAILED' } }, { type: 'inside', component: 'ftp-move', within: 'on-error-propagate', where: { targetPath: '/plan/out/repl/error' } }] } },
  ],
  simulation: {
    systems: { files: { [file]: csv }, db: { tables, procedures } },
    tests: [
      {
        name: 'A plan with one bad line',
        about: 'Line 3 names a store that is not open and is rejected. Lines 1 and 2 are merged: store 0101\'s existing row is updated, not inserted twice. Job 513 is COMPLETED, support gets the report, and the file is archived.',
        trigger: { file: { path: file } },
        expect: {
          noError: true,
          db: {
            store_replenishment: { count: 3, has: [{ store: '0101', sku: 'TENT-2P-OLV', qty: 6, job_id: 513 }, { store: '0102', sku: 'JKT-RAIN-M', qty: 10 }, { store: '0103', qty: 12, job_id: 512 }] },
            repl_rejects: { count: 1, has: [{ job_id: 513, line: '3', reason: 'UNKNOWN_STORE' }] },
            job_log: { has: [{ job_id: 513, status: 'COMPLETED', detail: 'good=2 rejected=1' }] },
          },
          emails: [{ to: 'replenishment-support@brindle.example', subject: '513', count: 1 }],
          files: { [`/plan/out/repl/archive/${name}`]: { exists: true } },
        },
      },
      {
        name: 'The MERGE procedure fails',
        about: 'Staging and rejects are rolled back with it, so nothing half done is left for a rerun to trip over. Job 513 is FAILED and the file goes to the error folder.',
        trigger: { file: { path: file } },
        overrides: { systems: { db: { procedures: { 'dbo.usp_merge_replenishment': null } } } },
        expect: {
          error: 'DB:QUERY_EXECUTION',
          db: { repl_staging: { count: 0 }, repl_rejects: { count: 0 }, store_replenishment: { has: [{ store: '0101', qty: 2 }] }, job_log: { has: [{ job_id: 513, status: 'FAILED' }] } },
          files: { [`/plan/out/repl/error/${name}`]: { exists: true } },
        },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'replenishment-plans-in',
      source('ftp-listener', { directory: '/plan/out/repl', matcher: 'REPL_*.csv', postAction: 'none', timeBetweenSizeCheck: 15000 }),
      [
        step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
        step('set-variable', { variableName: 'rows', value: '#[payload]' }),
        step('db-stored-procedure', { database: 'SQL Server', sql: '{ call dbo.usp_job_start(:jobName) }', inputParameters: '#[{ jobName: "REPL_PLAN_IN" }]', target: 'job' }),
        step('set-variable', { variableName: 'jobId', value: '#[vars.job.job_id]' }),
        step('db-select', { database: 'SQL Server', sql: 'SELECT store FROM dbo.stores WHERE is_open = 1', target: 'stores' }),
        step('transform', {
          target: 'variable',
          variableName: 'checked',
          script:
            '%dw 2.0\noutput application/java\nvar openStores = vars.stores map $.store\n---\nvars.rows map ((r) -> {\n  job_id: vars.jobId,\n  line: r.line,\n  store: r.store,\n  sku: r.sku,\n  qty: r.qty as Number,\n  reason: if (not (openStores contains r.store)) "UNKNOWN_STORE" else if ((r.qty as Number) <= 0) "QTY_NOT_POSITIVE" else ""\n})',
        }),
        step('set-variable', { variableName: 'good', value: '#[vars.checked filter ($.reason == "") map ($ - "reason")]' }),
        step('set-variable', { variableName: 'bad', value: '#[vars.checked filter ($.reason != "") map { job_id: $.job_id, line: $.line, reason: $.reason }]' }),
        scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
          router('choice', {}, [
            route({ expression: '#[not isEmpty(vars.good)]' }, [
              step('set-payload', { value: '#[vars.good]' }),
              step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.repl_staging (job_id, line, store, sku, qty) VALUES (:job_id, :line, :store, :sku, :qty)' }),
            ]),
          ]),
          router('choice', {}, [
            route({ expression: '#[not isEmpty(vars.bad)]' }, [
              step('set-payload', { value: '#[vars.bad]' }),
              step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.repl_rejects (job_id, line, reason) VALUES (:job_id, :line, :reason)' }),
            ]),
          ]),
          step('db-stored-procedure', { database: 'SQL Server', sql: '{ call dbo.usp_merge_replenishment(:jobId) }', inputParameters: '#[{ jobId: vars.jobId }]', target: 'merged' }),
        ]),
        step('set-variable', { variableName: 'detail', value: '#["good=" ++ (sizeOf(vars.good) as String) ++ " rejected=" ++ (sizeOf(vars.bad) as String)]' }),
        step('db-update', { database: 'SQL Server', sql: "UPDATE dbo.job_log SET status = 'COMPLETED', detail = :detail WHERE job_id = :jobId", inputParameters: '#[{ jobId: vars.jobId, detail: vars.detail }]' }),
        scope('async', {}, [
          step('email-send', {
            toAddresses: 'replenishment-support@brindle.example',
            subject: '#["Replenishment plan job " ++ (vars.jobId as String) ++ ": " ++ vars.detail]',
            content: '#[(vars.bad map ((b) -> "Line " ++ b.line ++ ": " ++ b.reason)) joinBy "\\n" default "No rejects"]',
            contentType: 'text/plain',
          }),
        ]),
        step('ftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/plan/out/repl/archive', overwrite: 'true' }),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('db-update', { database: 'SQL Server', sql: "UPDATE dbo.job_log SET status = 'FAILED', detail = :detail WHERE job_id = :jobId", inputParameters: '#[{ jobId: vars.jobId, detail: error.description }]' }),
          step('ftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/plan/out/repl/error', overwrite: 'true' }),
        ]),
      ],
    ),
  ),
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, gets replenishment plans from the planning platform after every run. The platform writes \`REPL_<date>_<run>.csv\` to its **FTP server**, folder \`/plan/out/repl\`:

\`\`\`
line,store,sku,qty
1,0101,TENT-2P-OLV,6
\`\`\`

The store ordering system reads \`dbo.store_replenishment\` (key \`store\` + \`sku\`, \`qty\`, \`job_id\`) in SQL Server. A new plan replaces the quantity for a store and SKU that is already there; a plain insert failed on the key every second run.

The DBA team has set up:
- \`dbo.usp_job_start(@jobName)\`: inserts a \`STARTED\` row in \`dbo.job_log\` and returns \`job_id\`.
- \`dbo.repl_staging\` (\`job_id\`, \`line\`, \`store\`, \`sku\`, \`qty\`) and \`dbo.repl_rejects\` (\`job_id\`, \`line\`, \`reason\`).
- \`dbo.usp_merge_replenishment(@jobId)\`: one MERGE of the job's staging rows into \`dbo.store_replenishment\`.
- Open stores in \`dbo.stores\` (\`store\`, \`is_open\`).

Support (\`replenishment-support@brindle.example\`) wants an email per plan with the counts and the rejected lines. The mail server is slow some mornings.

**Requirements**
- Start a job row \`REPL_PLAN_IN\` for each file.
- Reject lines for stores that are not open (\`UNKNOWN_STORE\`) or with a quantity not above zero (\`QTY_NOT_POSITIVE\`).
- Stage good lines, record rejects, and run the MERGE, all in one transaction.
- Mark the job \`COMPLETED\` with \`good=<n> rejected=<n>\`, email support without holding up the flow, and archive the file to \`/plan/out/repl/archive\`.
- On any failure, mark the job \`FAILED\` and move the file to \`/plan/out/repl/error\`.

**Facts**
- Name the procedure parameters \`jobName\` and \`jobId\`. The start procedure's result has \`job_id\`.
- Keep \`line\` as text and store \`qty\` as a number.
- The email subject carries the job ID, such as \`Replenishment plan job 513: good=2 rejected=1\`.
- After marking the job \`FAILED\`, let the error propagate.

**Design the flow.**
`,
  answerTemplate: `## The job row

## Checking the lines

## Staging, rejects and MERGE together

## Reporting

## Failure
`,
  keyPoints: [
    'Staging and reject rows carry the job_id, so each run\'s rows can be found, merged and reported on their own.',
    'MERGE in the database is one set based statement for the whole file, and it solves the key clash: update the match, insert the rest.',
    'One transaction over staging, rejects and MERGE: either the plan is applied and recorded, or nothing is.',
    'The job row is started outside that transaction, so a rollback cannot erase the evidence that the run happened.',
    'The success email is async; the job update before it is not, because support relies on the job log.',
  ],
  solution: `
1. **FTP On New or Updated File** on \`/plan/out/repl\`, \`REPL_*.csv\`, size check wait 15 seconds.
2. **Set Variable** \`filePath\` and \`rows\`. **Stored Procedure** \`usp_job_start\` (target \`job\`), **Set Variable** \`jobId\`.
3. **Database Select** open stores. **Transform** into \`vars.checked\` with a reason per line; **Set Variable** \`good\` and \`bad\`.
4. **Try** ALWAYS_BEGIN: **Choice** + **Bulk Insert** good lines into staging; **Choice** + **Bulk Insert** bad lines into rejects; **Stored Procedure** \`usp_merge_replenishment(:jobId)\`.
5. **Set Variable** \`detail\`; **Database Update** the job to \`COMPLETED\`.
6. **Async**: **Email Send** the counts and rejected lines.
7. **FTP Move** to \`archive\`.
8. Flow **On Error Propagate**: update the job to \`FAILED\`, **FTP Move** to \`error\`.

**Cleaning staging.** Keep staging rows for a few days for support, then purge by job_id in a nightly job.
`,
  followUps: [
    {
      q: 'Two plan files arrive a minute apart and run in parallel. What can go wrong?',
      a: 'Both MERGE into the same table and can deadlock or apply out of order. Process plan files one at a time (max concurrency 1 on the flow), or have the procedure skip a plan older than the one already applied.',
    },
    {
      q: 'Why not MERGE straight from Mule, row by row?',
      a: 'That works for small files. For thousands of lines one set based MERGE in the database is much faster, and the staging table keeps what was received for support.',
    },
  ],
}

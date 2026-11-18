import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const dir = '/plan/out/po'
const ctlName = 'PO_PLAN_20261113.ctl'
const ctl = `${dir}/${ctlName}`
const files = {
  [ctl]: 'PO_PLAN_20261113_1.csv|2\nPO_PLAN_20261113_2.csv|1\nTOTAL|3',
  [`${dir}/PO_PLAN_20261113_1.csv`]: 'line,supplier,sku,qty\n1,SUP-ASHBY,SOFA-3S-GRY,40\n2,SUP-ASHBY,SOFA-2S-GRY,25',
  [`${dir}/PO_PLAN_20261113_2.csv`]: 'line,supplier,sku,qty\n3,SUP-LUMEN,LAMP-ARC-BRS,120',
}
const tables = {
  po_plan_staging: { columns: ['job_id', 'part', 'line', 'supplier', 'sku', 'qty'], rows: [] },
  po_plan: { key: ['supplier', 'sku'], rows: [{ supplier: 'SUP-ASHBY', sku: 'SOFA-3S-GRY', qty: 30, job_id: 300 }, { supplier: 'SUP-LUMEN', sku: 'RUG-160-OAT', qty: 60, job_id: 300 }] },
  job_log: { key: 'job_id', columns: ['job_id', 'job_name', 'status', 'detail'], rows: [{ job_id: 300, job_name: 'PO_PLAN_IN', status: 'COMPLETED', detail: 'lines=50211' }] },
}
const procedures = {
  'dbo.usp_job_start': (args, db) => {
    const rows = db.tables.job_log.rows
    const id = Math.max(0, ...rows.map((r) => r.job_id)) + 1
    rows.push({ job_id: id, job_name: args.jobName, status: 'STARTED', detail: null })
    return { job_id: id }
  },
  // one set based MERGE of the job's staging rows into dbo.po_plan
  'dbo.usp_merge_po_plan': (args, db) => {
    const target = db.tables.po_plan.rows
    const mine = db.tables.po_plan_staging.rows.filter((r) => r.job_id === args.jobId)
    for (const s of mine) {
      const hit = target.find((t) => t.supplier === s.supplier && t.sku === s.sku)
      if (hit) Object.assign(hit, { qty: s.qty, job_id: s.job_id })
      else target.push({ supplier: s.supplier, sku: s.sku, qty: s.qty, job_id: s.job_id })
    }
    return { merged: mine.length }
  },
}

export default {
  id: 'fl-267',
  category: 'flows',
  title: 'Purchase Plans Back From the Planning Platform in Parts: Stage Every Part Under One Job, Check the Total Against the Control File, Then One MERGE Into the Plan Table, or Nothing',
  level: 'ADVANCED',
  tags: ['myproject', 'large-files', 'split-files', 'control-file', 'merge', 'staging', 'job-log', 'sql-server', 'sftp'],
  estMinutes: 50,
  flowChecks: [
    { label: 'The flow starts when a control file appears in /plan/out/po', rule: { type: 'source', component: 'sftp-listener', where: { directory: '/plan/out/po', matcher: '.ctl' } } },
    { label: 'Each part is bulk inserted into dbo.po_plan_staging inside a For Each', rule: { type: 'inside', component: 'db-bulk-insert', within: 'foreach', where: { sql: 'po_plan_staging' } } },
    { label: 'The staged rows of the job are counted before the MERGE', rule: { type: 'before', first: 'db-select', firstWhere: { sql: { all: ['COUNT', 'po_plan_staging', 'job_id'] } }, then: 'db-stored-procedure', thenWhere: { sql: 'usp_merge_po_plan' } } },
    { label: 'The MERGE procedure runs only on a route of a Choice', rule: { type: 'inside', component: 'db-stored-procedure', within: 'choice', where: { sql: 'usp_merge_po_plan' } } },
    { label: 'A set whose total does not match has its staging rows deleted', rule: { type: 'inside', component: 'db-delete', within: 'choice', where: { sql: { all: ['po_plan_staging', 'job_id'] } } } },
    { label: 'A failure marks the job FAILED', rule: { type: 'inside', component: 'db-update', within: 'on-error-propagate', where: { sql: 'FAILED' } } },
  ],
  simulation: {
    systems: { files, db: { tables, procedures } },
    tests: [
      {
        name: 'A complete plan',
        about: 'Three lines are staged under job 301 and the total matches. One MERGE updates SOFA-3S-GRY to 40 and adds two rows; RUG-160-OAT is left alone. Job 301 is COMPLETED and the files are archived.',
        trigger: { file: { path: ctl } },
        expect: {
          noError: true,
          db: {
            po_plan: { count: 4, has: [{ sku: 'SOFA-3S-GRY', qty: 40, job_id: 301 }, { sku: 'LAMP-ARC-BRS', qty: 120 }, { sku: 'RUG-160-OAT', job_id: 300 }] },
            job_log: { has: [{ job_id: 301, status: 'COMPLETED' }] },
          },
          files: { [`/plan/archive/${ctlName}`]: { exists: true }, '/plan/archive/PO_PLAN_20261113_2.csv': { exists: true } },
        },
      },
      {
        name: 'A part is short',
        about: 'Part 1 arrived with one line, so 2 lines are staged where the control file says 3. The plan table is not touched, job 301\'s staging rows are deleted, job 301 is FAILED and the control file goes to /plan/error.',
        trigger: { file: { path: ctl } },
        overrides: { systems: { files: { [`${dir}/PO_PLAN_20261113_1.csv`]: 'line,supplier,sku,qty\n1,SUP-ASHBY,SOFA-3S-GRY,40' } } },
        expect: {
          db: { po_plan: { count: 2, has: [{ sku: 'SOFA-3S-GRY', qty: 30 }] }, po_plan_staging: { count: 0 }, job_log: { has: [{ job_id: 301, status: 'FAILED' }] } },
          files: { [`/plan/error/${ctlName}`]: { exists: true } },
        },
      },
      {
        name: 'The MERGE fails',
        about: 'The procedure fails. The flow marks job 301 FAILED, so support sees it in the morning check.',
        trigger: { file: { path: ctl } },
        overrides: { systems: { db: { procedures: { 'dbo.usp_merge_po_plan': null } } } },
        expect: { error: 'DB:QUERY_EXECUTION', db: { po_plan: { has: [{ sku: 'SOFA-3S-GRY', qty: 30 }] }, job_log: { has: [{ job_id: 301, status: 'FAILED' }] } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'po-plan-in',
      source('sftp-listener', { directory: '/plan/out/po', matcher: 'PO_PLAN_*.ctl', postAction: 'none', timeBetweenSizeCheck: 10000 }),
      [
        step('set-variable', { variableName: 'ctlPath', value: '#[attributes.path]' }),
        step('set-variable', { variableName: 'lines', value: '#[(payload splitBy "\\n") map ((l) -> { name: (l splitBy "|")[0], rows: (l splitBy "|")[1] as Number })]' }),
        step('set-variable', { variableName: 'parts', value: '#[vars.lines filter ($.name != "TOTAL")]' }),
        step('set-variable', { variableName: 'expected', value: '#[(vars.lines filter ($.name == "TOTAL"))[0].rows]' }),
        step('db-stored-procedure', { database: 'SQL Server', sql: '{ call dbo.usp_job_start(:jobName) }', inputParameters: '#[{ jobName: "PO_PLAN_IN" }]', target: 'job' }),
        step('set-variable', { variableName: 'jobId', value: '#[vars.job.job_id]' }),
        scope('foreach', { collection: '#[vars.parts]' }, [
          step('set-variable', { variableName: 'part', value: '#[payload.name]' }),
          step('sftp-read', { path: '#["/plan/out/po/" ++ vars.part]', outputMimeType: 'application/csv' }),
          step('transform', { script: '%dw 2.0\noutput application/java\n---\npayload map { job_id: vars.jobId, part: vars.part, line: $.line as Number, supplier: $.supplier, sku: $.sku, qty: $.qty as Number }' }),
          step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.po_plan_staging (job_id, part, line, supplier, sku, qty) VALUES (:job_id, :part, :line, :supplier, :sku, :qty)', target: 'staged' }),
        ]),
        step('db-select', { database: 'SQL Server', sql: 'SELECT COUNT(*) AS n FROM dbo.po_plan_staging WHERE job_id = :jobId', inputParameters: '#[{ jobId: vars.jobId }]', target: 'count' }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[vars.count[0].n == vars.expected]' }, [
              step('db-stored-procedure', { database: 'SQL Server', sql: '{ call dbo.usp_merge_po_plan(:jobId) }', inputParameters: '#[{ jobId: vars.jobId }]', target: 'merged' }),
              step('db-update', { database: 'SQL Server', sql: "UPDATE dbo.job_log SET status = 'COMPLETED', detail = :detail WHERE job_id = :jobId", inputParameters: '#[{ jobId: vars.jobId, detail: "lines=" ++ (vars.expected as String) }]' }),
              scope('foreach', { collection: '#[vars.parts]' }, [step('sftp-move', { sourcePath: '#["/plan/out/po/" ++ payload.name]', targetPath: '/plan/archive', overwrite: 'true' })]),
              step('sftp-move', { sourcePath: '#[vars.ctlPath]', targetPath: '/plan/archive', overwrite: 'true' }),
            ]),
          ],
          {
            otherwise: [
              step('db-delete', { database: 'SQL Server', sql: 'DELETE FROM dbo.po_plan_staging WHERE job_id = :jobId', inputParameters: '#[{ jobId: vars.jobId }]' }),
              step('db-update', {
                database: 'SQL Server',
                sql: "UPDATE dbo.job_log SET status = 'FAILED', detail = :detail WHERE job_id = :jobId",
                inputParameters: '#[{ jobId: vars.jobId, detail: "staged " ++ (vars.count[0].n as String) ++ " of " ++ (vars.expected as String) }]',
              }),
              step('sftp-move', { sourcePath: '#[vars.ctlPath]', targetPath: '/plan/error', overwrite: 'true' }),
            ],
          },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('db-update', { database: 'SQL Server', sql: "UPDATE dbo.job_log SET status = 'FAILED', detail = :detail WHERE job_id = :jobId", inputParameters: '#[{ jobId: vars.jobId, detail: error.description }]' }),
        ]),
      ],
    ),
  ),
  description: `
Marrow & Pine Home, a fictional home furnishings retailer, gets purchase plans back from the planning platform after each weekly run. The platform writes parts of up to **100,000 lines** and then a control file to Marrow & Pine's **SFTP server**, folder \`/plan/out/po\`:

\`\`\`
PO_PLAN_20261113.ctl
PO_PLAN_20261113_1.csv|2
PO_PLAN_20261113_2.csv|1
TOTAL|3
\`\`\`

A part: \`line,supplier,sku,qty\`. A full plan is about 1.4 million lines in 14 parts.

The buying system reads \`dbo.po_plan\` (key \`supplier\` + \`sku\`, \`qty\`, \`job_id\`). A new plan replaces the quantity of a supplier and SKU already there.

The DBA team has set up:
- \`dbo.usp_job_start(@jobName)\` and \`dbo.job_log\` (\`job_id\`, \`job_name\`, \`status\`, \`detail\`),
- \`dbo.po_plan_staging\` (\`job_id\`, \`part\`, \`line\`, \`supplier\`, \`sku\`, \`qty\`),
- \`dbo.usp_merge_po_plan(@jobId)\`: one set based MERGE of the job's staging rows into \`dbo.po_plan\`.

The old flow merged each part as it arrived. When part 9 failed, buyers worked from a plan that was half new and half old.

**Requirements**
- Start when the control file appears, and start a job row \`PO_PLAN_IN\`.
- Stage every part under the job ID.
- Compare the staged count with \`TOTAL\`. Equal: run the MERGE, mark the job \`COMPLETED\`, archive the parts and the control file to \`/plan/archive\`.
- Not equal: leave \`dbo.po_plan\` alone, delete the job's staging rows, mark the job \`FAILED\` with the counts, and move the control file to \`/plan/error\`.
- Any error: mark the job \`FAILED\`.

**Design the flow.**
`,
  answerTemplate: `## The control file and the job row

## Staging the parts

## The total check

## The MERGE, or nothing
`,
  keyPoints: [
    'Staging decouples arrival from apply. Parts land one by one; the plan table changes once, when the whole set is there.',
    'The count comes from the database, for this job ID. It proves what was staged, not what the flow thinks it wrote.',
    'One set based MERGE in the database applies 1.4 million lines far faster than row by row writes from Mule, and in one transaction of its own.',
    'A failed set leaves the plan table as it was. Buyers work from last week\'s plan, which is better than half of each.',
    'Parts of 100,000 lines keep each read and bulk insert small enough for the worker. Agree the part size with the platform team.',
  ],
  solution: `
1. **SFTP On New or Updated File** on \`/plan/out/po\`, \`PO_PLAN_*.ctl\`.
2. **Set Variable** \`ctlPath\`, \`lines\`, \`parts\`, \`expected\` (the TOTAL).
3. **Stored Procedure** \`usp_job_start\`, **Set Variable** \`jobId\`.
4. **For Each** part: **SFTP Read** as CSV, **Transform** with \`job_id\` and \`part\`, **Bulk Insert** into staging.
5. **Database Select** \`COUNT(*)\` of staging for the job.
6. **Choice**:
   - equal: **Stored Procedure** \`usp_merge_po_plan\`, **Update** COMPLETED, **For Each** **SFTP Move** parts to archive, **SFTP Move** the control file.
   - otherwise: **Delete** the job's staging rows, **Update** FAILED, **SFTP Move** the control file to \`/plan/error\`.
7. Flow **On Error Propagate**: **Update** FAILED.
`,
  followUps: [
    {
      q: 'Why not one transaction from the first staging insert to the MERGE?',
      a: 'It would hold locks on staging for the whole load of 14 parts. Staging rows under a job ID are cheap to delete, so a short transaction inside the procedure is enough.',
    },
    {
      q: 'The MERGE takes 20 minutes and blocks the buying system. What can help?',
      a: 'Run it in the procedure in chunks by supplier, schedule it outside buying hours, or MERGE into a new table and swap it in with a rename. Ask the DBA which their system allows.',
    },
  ],
}

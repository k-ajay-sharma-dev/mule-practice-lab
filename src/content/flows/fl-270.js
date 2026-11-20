import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const dir = '/plan/out/orders'
const ctlName = 'STORE_ORDERS_20261113.ctl'
const ctl = `${dir}/${ctlName}`
const files = {
  [ctl]: 'STORE_ORDERS_20261113_1.csv|2|712cab8c25ad6c202bbb8320848b0ed6\nSTORE_ORDERS_20261113_2.csv|1|1687524973ec1bd996cf893858310f33',
  [`${dir}/STORE_ORDERS_20261113_1.csv`]: 'store,sku,qty\n0412,4410021,12\n0415,4410187,6',
  [`${dir}/STORE_ORDERS_20261113_2.csv`]: 'store,sku,qty\n0420,4410300,9',
}
const tables = {
  store_order_staging: { columns: ['job_id', 'part', 'store', 'sku', 'qty'], rows: [] },
  store_order_plan: { key: ['store', 'sku'], rows: [{ store: '0412', sku: '4410021', qty: 5, job_id: 700 }, { store: '0430', sku: '4410999', qty: 3, job_id: 700 }] },
  job_log: { key: 'job_id', columns: ['job_id', 'job_name', 'status', 'detail'], rows: [{ job_id: 700, job_name: 'STORE_ORDERS_IN', status: 'COMPLETED', detail: 'parts=11' }] },
}
const procedures = {
  'dbo.usp_job_start': (args, db) => {
    const rows = db.tables.job_log.rows
    const id = Math.max(0, ...rows.map((r) => r.job_id)) + 1
    rows.push({ job_id: id, job_name: args.jobName, status: 'STARTED', detail: null })
    return { job_id: id }
  },
  'dbo.usp_merge_store_orders': (args, db) => {
    const target = db.tables.store_order_plan.rows
    const mine = db.tables.store_order_staging.rows.filter((r) => r.job_id === args.jobId)
    for (const s of mine) {
      const hit = target.find((t) => t.store === s.store && t.sku === s.sku)
      if (hit) Object.assign(hit, { qty: s.qty, job_id: s.job_id })
      else target.push({ store: s.store, sku: s.sku, qty: s.qty, job_id: s.job_id })
    }
    return { merged: mine.length }
  },
}
const failed = (detail) => ({ database: 'SQL Server', sql: "UPDATE dbo.job_log SET status = 'FAILED', detail = :detail WHERE job_id = :jobId", inputParameters: `#[{ jobId: vars.jobId, detail: ${detail} }]` })

export default {
  id: 'fl-270',
  category: 'flows',
  title: 'Store Order Plans From the Planning Platform, End to End: a Control File, a Size Limit per Part, an MD5 per Part, Staging Under a Job ID, One MERGE When Every Part Is Good, and a Clean Failure When One Is Not',
  level: 'EXPERT',
  tags: ['myproject', 'large-files', 'control-file', 'split-files', 'checksum', 'file-size', 'merge', 'staging', 'job-log', 'sftp', 'planning'],
  estMinutes: 75,
  flowChecks: [
    { label: 'The flow starts when a control file appears in /plan/out/orders', rule: { type: 'source', component: 'sftp-listener', where: { directory: '/plan/out/orders', matcher: '.ctl' } } },
    { label: 'Part sizes come from a listing, before any part is read', rule: { type: 'before', first: 'sftp-list', then: 'sftp-read' } },
    { label: 'Each part\'s MD5 is worked out inside the For Each', rule: { type: 'inside', component: 'set-variable', within: 'foreach', where: { value: 'Crypto::MD5' } } },
    { label: 'Good parts are bulk inserted into dbo.store_order_staging inside the For Each', rule: { type: 'inside', component: 'db-bulk-insert', within: 'foreach', where: { sql: 'store_order_staging' } } },
    { label: 'The MERGE procedure runs only on a route of a Choice', rule: { type: 'inside', component: 'db-stored-procedure', within: 'choice', where: { sql: 'usp_merge_store_orders' } } },
    { label: 'A bad set has the job\'s staging rows deleted', rule: { type: 'inside', component: 'db-delete', within: 'choice', where: { sql: { all: ['store_order_staging', 'job_id'] } } } },
    { label: 'The success report is sent from an Async scope', rule: { type: 'inside', component: 'email-send', within: 'async' } },
    { label: 'A failure marks the job FAILED', rule: { type: 'inside', component: 'db-update', within: 'on-error-propagate', where: { sql: 'FAILED' } } },
  ],
  simulation: {
    properties: { 'plan.maxPartBytes': '500000000' },
    systems: { files, db: { tables, procedures } },
    tests: [
      {
        name: 'A good set',
        about: 'Both parts are under the limit and match their MD5. They are staged under job 701 and merged once: 0412 / 4410021 becomes 12, two rows are added. Job 701 is COMPLETED, the files are archived and support gets the report.',
        trigger: { file: { path: ctl } },
        expect: {
          noError: true,
          db: {
            store_order_plan: { count: 4, has: [{ store: '0412', sku: '4410021', qty: 12, job_id: 701 }, { store: '0420', qty: 9 }, { store: '0430', job_id: 700 }] },
            job_log: { has: [{ job_id: 701, status: 'COMPLETED' }] },
          },
          files: { [`/plan/archive/${ctlName}`]: { exists: true }, '/plan/archive/STORE_ORDERS_20261113_1.csv': { exists: true } },
          emails: [{ to: 'replenishment@larkfield.example', subject: 'COMPLETED', count: 1 }],
        },
      },
      {
        name: 'A part over the size limit',
        about: 'The limit is set to 30 bytes for this test, so part 1 counts as too large and is not read. Part 2 is staged, then removed again. The plan table is not touched, job 701 is FAILED and support is told.',
        trigger: { file: { path: ctl } },
        overrides: { properties: { 'plan.maxPartBytes': '30' } },
        expect: {
          db: { store_order_plan: { has: [{ store: '0412', qty: 5 }] }, store_order_staging: { count: 0 }, job_log: { has: [{ job_id: 701, status: 'FAILED' }] } },
          files: { [`/plan/error/${ctlName}`]: { exists: true } },
          emails: [{ to: 'replenishment@larkfield.example', has: 'too large', count: 1 }],
        },
      },
      {
        name: 'A garbled part',
        about: 'Part 2 says 8 where the platform wrote 9, so its MD5 does not match. Part 1 was already staged; it is removed. Nothing is merged and job 701 is FAILED.',
        trigger: { file: { path: ctl } },
        overrides: { systems: { files: { [`${dir}/STORE_ORDERS_20261113_2.csv`]: 'store,sku,qty\n0420,4410300,8' } } },
        expect: {
          db: { store_order_plan: { count: 2 }, store_order_staging: { count: 0 }, job_log: { has: [{ job_id: 701, status: 'FAILED' }] } },
          emails: [{ to: 'replenishment@larkfield.example', has: 'checksum', count: 1 }],
        },
      },
      {
        name: 'The MERGE fails',
        about: 'The procedure fails after every part was staged. The flow marks job 701 FAILED and the plan table is as it was.',
        trigger: { file: { path: ctl } },
        overrides: { systems: { db: { procedures: { 'dbo.usp_merge_store_orders': null } } } },
        expect: { error: 'DB:QUERY_EXECUTION', db: { store_order_plan: { has: [{ store: '0412', qty: 5 }] }, job_log: { has: [{ job_id: 701, status: 'FAILED' }] } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'store-orders-in',
      source('sftp-listener', { directory: '/plan/out/orders', matcher: 'STORE_ORDERS_*.ctl', postAction: 'none', timeBetweenSizeCheck: 10000 }),
      [
        step('set-variable', { variableName: 'ctlPath', value: '#[attributes.path]' }),
        step('set-variable', { variableName: 'parts', value: '#[(payload splitBy "\\n") map ((l) -> { name: (l splitBy "|")[0], rows: (l splitBy "|")[1] as Number, md5: (l splitBy "|")[2] })]' }),
        step('db-stored-procedure', { database: 'SQL Server', sql: '{ call dbo.usp_job_start(:jobName) }', inputParameters: '#[{ jobName: "STORE_ORDERS_IN" }]', target: 'job' }),
        step('set-variable', { variableName: 'jobId', value: '#[vars.job.job_id]' }),
        step('sftp-list', { directoryPath: '/plan/out/orders', matcher: 'STORE_ORDERS_*.csv', recursive: 'false' }),
        step('set-variable', { variableName: 'sizes', value: '#[payload map { name: $.attributes.fileName, size: $.attributes.size }]' }),
        step('set-variable', { variableName: 'bad', value: '#[[]]' }),
        scope('foreach', { collection: '#[vars.parts]' }, [
          step('set-variable', { variableName: 'part', value: '#[payload]' }),
          step('set-variable', { variableName: 'size', value: '#[((vars.sizes filter ($.name == vars.part.name))[0].size) default -1]' }),
          router(
            'choice',
            {},
            [
              route({ expression: '#[vars.size < 0]' }, [step('set-variable', { variableName: 'bad', value: '#[vars.bad ++ [vars.part.name ++ " is missing"]]' })]),
              route({ expression: '#[vars.size > (p("plan.maxPartBytes") as Number)]' }, [step('set-variable', { variableName: 'bad', value: '#[vars.bad ++ [vars.part.name ++ " is too large: " ++ (vars.size as String) ++ " bytes"]]' })]),
            ],
            {
              otherwise: [
                step('sftp-read', { path: '#["/plan/out/orders/" ++ vars.part.name]', outputMimeType: 'text/plain' }),
                step('set-variable', { variableName: 'md5', value: '#[dw::Crypto::MD5(payload as Binary)]' }),
                router(
                  'choice',
                  {},
                  [route({ expression: '#[vars.md5 != vars.part.md5]' }, [step('set-variable', { variableName: 'bad', value: '#[vars.bad ++ [vars.part.name ++ " failed its checksum"]]' })])],
                  {
                    otherwise: [
                      step('transform', { script: '%dw 2.0\noutput application/java\n---\nread(payload, "application/csv") map { job_id: vars.jobId, part: vars.part.name, store: $.store, sku: $.sku, qty: $.qty as Number }' }),
                      step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.store_order_staging (job_id, part, store, sku, qty) VALUES (:job_id, :part, :store, :sku, :qty)', target: 'staged' }),
                    ],
                  },
                ),
              ],
            },
          ),
        ]),
        router(
          'choice',
          {},
          [
            route({ expression: '#[isEmpty(vars.bad)]' }, [
              step('db-stored-procedure', { database: 'SQL Server', sql: '{ call dbo.usp_merge_store_orders(:jobId) }', inputParameters: '#[{ jobId: vars.jobId }]', target: 'merged' }),
              step('db-update', { database: 'SQL Server', sql: "UPDATE dbo.job_log SET status = 'COMPLETED', detail = :detail WHERE job_id = :jobId", inputParameters: '#[{ jobId: vars.jobId, detail: "parts=" ++ (sizeOf(vars.parts) as String) }]' }),
              scope('foreach', { collection: '#[vars.parts]' }, [step('sftp-move', { sourcePath: '#["/plan/out/orders/" ++ payload.name]', targetPath: '/plan/archive', overwrite: 'true' })]),
              step('sftp-move', { sourcePath: '#[vars.ctlPath]', targetPath: '/plan/archive', overwrite: 'true' }),
              scope('async', {}, [
                step('email-send', { toAddresses: 'replenishment@larkfield.example', subject: '#["Store order plan job " ++ (vars.jobId as String) ++ " COMPLETED"]', content: '#["Parts merged: " ++ (sizeOf(vars.parts) as String)]', contentType: 'text/plain' }),
              ]),
            ]),
          ],
          {
            otherwise: [
              step('db-delete', { database: 'SQL Server', sql: 'DELETE FROM dbo.store_order_staging WHERE job_id = :jobId', inputParameters: '#[{ jobId: vars.jobId }]' }),
              step('db-update', failed('vars.bad joinBy "; "')),
              step('sftp-move', { sourcePath: '#[vars.ctlPath]', targetPath: '/plan/error', overwrite: 'true' }),
              step('email-send', { toAddresses: 'replenishment@larkfield.example', subject: '#["Store order plan job " ++ (vars.jobId as String) ++ " FAILED"]', content: '#[vars.bad joinBy "\\n"]', contentType: 'text/plain' }),
            ],
          },
        ),
      ],
      [handler('on-error-propagate', { type: 'ANY' }, [step('db-update', failed('error.description'))])],
    ),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, gets store order plans from the planning platform every night. The platform writes the parts and then a control file to Larkfield's **SFTP server**, folder \`/plan/out/orders\`. Each control line is \`<part>|<rows>|<MD5>\`:

\`\`\`
STORE_ORDERS_20261113_1.csv|2|712cab8c25ad6c202bbb8320848b0ed6
STORE_ORDERS_20261113_2.csv|1|1687524973ec1bd996cf893858310f33
\`\`\`

A part is a CSV (\`store,sku,qty\`), normally about 40 MB. The store ordering system reads \`dbo.store_order_plan\` (key \`store\` + \`sku\`, \`qty\`, \`job_id\`).

The DBA team provides \`dbo.usp_job_start(@jobName)\`, \`dbo.job_log\` (\`job_id\`, \`job_name\`, \`status\`, \`detail\`), \`dbo.store_order_staging\` (\`job_id\`, \`part\`, \`store\`, \`sku\`, \`qty\`) and \`dbo.usp_merge_store_orders(@jobId)\`, one MERGE of the job's staging rows into the plan.

Past incidents: a 9 GB part (the platform repeated every store) took the worker down; a part garbled in transit sent wrong quantities to stores; a failure halfway left the plan table half updated.

**Requirements**
- Start when the control file appears, and start a job row \`STORE_ORDERS_IN\`.
- Get every part's size from a listing. A part that is missing, or over the property \`plan.maxPartBytes\`, is bad and is not read.
- Read each other part as text, check its MD5, and stage it under the job ID if it matches.
- No bad part: one MERGE, job \`COMPLETED\`, parts and control file to \`/plan/archive\`, and a report to \`replenishment@larkfield.example\` that never holds up the flow.
- Any bad part: delete the job's staging rows, job \`FAILED\` with the reasons, control file to \`/plan/error\`, and email the reasons.
- Any error: job \`FAILED\`.

**Facts**
- Control files match \`STORE_ORDERS_*.ctl\` and parts \`STORE_ORDERS_*.csv\`, in the same folder.
- \`dbo.usp_job_start\` returns \`{ job_id }\`.
- Work out the MD5 with \`dw::Crypto::MD5(payload as Binary)\`.
- Each reason names the part: \`is missing\`, \`is too large\` or \`failed its checksum\`.
- The report subject says \`COMPLETED\`, and the failure email subject says \`FAILED\`.
- On any error, mark the job in an On Error Propagate, so the run still ends with the original error.

**Design the flow.**
`,
  answerTemplate: `## The control file, the job row and the listing

## Checking and staging each part

## Applying the set

## A bad set

## Errors
`,
  keyPoints: [
    'The listing gives every size at once, without reading a byte of content. The limit keeps one broken part from taking the worker down.',
    'The size limit also bounds memory for the rest: a part read as text is never bigger than the limit.',
    'The MD5 is checked on the text as read, and the same text is parsed for staging, so the part is read once.',
    'Staging under a job ID makes a bad set cheap to undo: one DELETE by job ID, and the plan table never saw it.',
    'The MERGE runs once, after every part passed. The plan is all new or all old, never mixed.',
  ],
  solution: `
1. **SFTP On New or Updated File** on \`/plan/out/orders\`, \`STORE_ORDERS_*.ctl\`.
2. **Set Variable** \`ctlPath\`, \`parts\`. **Stored Procedure** \`usp_job_start\`, **Set Variable** \`jobId\`.
3. **SFTP List** the parts, **Set Variable** \`sizes\`, \`bad\` = \`[]\`.
4. **For Each** part: **Set Variable** \`part\`, \`size\`; **Choice**:
   - missing: add to \`bad\`; over \`p("plan.maxPartBytes")\`: add to \`bad\`;
   - otherwise: **SFTP Read** as text, **Set Variable** \`md5\`, **Choice** mismatch: add to \`bad\`, otherwise **Transform** (read the CSV, add \`job_id\`) and **Bulk Insert** into staging.
5. **Choice**:
   - no bad part: **Stored Procedure** \`usp_merge_store_orders\`, **Update** COMPLETED, **For Each** **SFTP Move** to archive, **SFTP Move** the control file, **Async** { **Email Send** }.
   - otherwise: **Delete** the job's staging rows, **Update** FAILED, **SFTP Move** to \`/plan/error\`, **Email Send**.
6. Flow **On Error Propagate**: **Update** FAILED.
`,
  followUps: [
    {
      q: 'Why check all parts before deciding, instead of stopping at the first bad one?',
      a: 'Support and the platform team fix everything in one round when they see every problem at once. The cost is reading the good parts of a set that will fail anyway.',
    },
    {
      q: 'Parts grow to 400 MB. What changes?',
      a: 'Reading a part as text into memory stops being safe. Stream each part into a Batch Job for staging instead, and hash it in a separate streaming pass or on the server. Raise the size limit only after that change.',
    },
  ],
}

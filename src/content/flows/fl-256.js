import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const name = 'PRICE_CHANGES_20261113.csv'
const file = `/prices/in/${name}`
const head = 'sku,store_group,new_price,effective\n'
const clean = `${head}TENT-2P-OLV,ALL,119.00,2026-11-15\nJKT-RAIN-M,ALL,49.99,2026-11-15\nBOTTLE-1L,NORTH,12.50,2026-11-15\nSTOVE-GAS-1B,ALL,39.00,2026-11-15`
const oneBad = `${head}TENT-2P-OLV,ALL,119.00,2026-11-15\nJKT-RAIN-M,ALL,,2026-11-15\nBOTTLE-1L,NORTH,12.50,2026-11-15\nSTOVE-GAS-1B,ALL,39.00,2026-11-15`
const broken = `${head}TENT-2P-OLV,ALL,,2026-11-15\nJKT-RAIN-M,ALL,,2026-11-15\nBOTTLE-1L,NORTH,,2026-11-15\nSTOVE-GAS-1B,ALL,39.00,2026-11-15`
const tables = {
  price_change: { columns: ['sku', 'store_group', { name: 'new_price', notNull: true }, 'effective', 'job_id'], rows: [] },
  job_log: { key: 'job_id', columns: ['job_id', 'job_name', 'status', 'loaded', 'failed'], rows: [{ job_id: 70, job_name: 'PRICE_CHANGES_IN', status: 'COMPLETED', loaded: 2100400, failed: 0 }] },
}
const procedures = {
  'dbo.usp_job_start': (args, db) => {
    const rows = db.tables.job_log.rows
    const id = Math.max(0, ...rows.map((r) => r.job_id)) + 1
    rows.push({ job_id: id, job_name: args.jobName, status: 'STARTED', loaded: null, failed: null })
    return { job_id: id }
  },
}
const jobUpdate = (status) => ({
  database: 'SQL Server',
  sql: 'UPDATE dbo.job_log SET status = :status, loaded = :loaded, failed = :failed WHERE job_id = :jobId',
  inputParameters: `#[{ jobId: vars.jobId, loaded: payload.successfulRecords, failed: payload.failedRecords, status: ${status} }]`,
  target: 'jobRow',
})

export default {
  id: 'fl-256',
  category: 'flows',
  title: 'A Broken Price File Must Stop Early and Loudly: a Max Failed Records Limit, a Status Worked Out in On Complete, and the File Moved to Done or Error Only When the Job Is Over',
  level: 'ADVANCED',
  tags: ['myproject', 'batch', 'sql-server', 'max-failed-records', 'on-complete', 'job-log', 'email', 'sftp'],
  estMinutes: 45,
  flowChecks: [
    { label: 'Max failed records is a limit above zero, so a broken file stops the job early', rule: { type: 'exists', component: 'batch-job', where: { maxFailedRecords: { gte: 1 } } } },
    { label: 'On Complete writes the status and counts to the job row', rule: { type: 'inside', component: 'db-update', within: 'batch-job', inSlot: 'onComplete', where: { sql: 'job_log' } } },
    {
      label: 'On Complete moves the file to /prices/done or /prices/error',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'sftp-move', within: 'batch-job', inSlot: 'onComplete', where: { targetPath: '/prices/done' } },
          { type: 'inside', component: 'sftp-move', within: 'batch-job', inSlot: 'onComplete', where: { targetPath: '/prices/error' } },
        ],
      },
    },
    { label: 'A broken file is emailed to pricing support from On Complete', rule: { type: 'inside', component: 'email-send', within: 'batch-job', inSlot: 'onComplete' } },
  ],
  simulation: {
    systems: { files: { [file]: clean }, db: { tables, procedures } },
    tests: [
      {
        name: 'A clean file',
        about: 'All four prices load. Job 71 is COMPLETED and the file moves to done. No email.',
        trigger: { file: { path: file } },
        expect: { noError: true, db: { price_change: { count: 4 }, job_log: { has: [{ job_id: 71, status: 'COMPLETED', loaded: 4, failed: 0 }] } }, files: { [`/prices/done/${name}`]: { exists: true } }, noEmails: true },
      },
      {
        name: 'One price is missing',
        about: 'One row in four fails. That is a normal bad row, not a broken file: the other three load, job 71 is COMPLETED_WITH_ERRORS and the file moves to done.',
        trigger: { file: { path: file } },
        overrides: { systems: { files: { [file]: oneBad } } },
        expect: { db: { price_change: { count: 3 }, job_log: { has: [{ job_id: 71, status: 'COMPLETED_WITH_ERRORS', failed: 1 }] } }, files: { [`/prices/done/${name}`]: { exists: true } }, noEmails: true },
      },
      {
        name: 'A broken file',
        about: 'Three rows in four fail: the pricing system shifted a column. Job 71 is FAILED, the file goes to the error folder, and pricing support gets an email.',
        trigger: { file: { path: file } },
        overrides: { systems: { files: { [file]: broken } } },
        expect: {
          db: { job_log: { has: [{ job_id: 71, status: 'FAILED' }] } },
          files: { [`/prices/error/${name}`]: { exists: true }, [`/prices/done/${name}`]: { exists: false } },
          emails: [{ to: 'pricing-support@brindle.example', subject: 'FAILED', count: 1 }],
        },
      },
    ],
  },
  referenceFlow: design(
    flow('price-changes-load', source('sftp-listener', { directory: '/prices/in', matcher: 'PRICE_CHANGES_*.csv', postAction: 'none', timeBetweenSizeCheck: 15000 }), [
      step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
      step('set-variable', { variableName: 'fileName', value: '#[attributes.fileName]' }),
      step('db-stored-procedure', { database: 'SQL Server', sql: '{ call dbo.usp_job_start(:jobName) }', inputParameters: '#[{ jobName: "PRICE_CHANGES_IN" }]', target: 'job' }),
      step('set-variable', { variableName: 'jobId', value: '#[vars.job.job_id]' }),
      router(
        'batch-job',
        { jobName: 'price-changes-load', blockSize: 200, maxFailedRecords: 1000 },
        [
          route({ name: 'insert-price', acceptPolicy: 'NO_FAILURES' }, [
            step('db-insert', {
              database: 'SQL Server',
              sql: 'INSERT INTO dbo.price_change (sku, store_group, new_price, effective, job_id) VALUES (:sku, :storeGroup, :newPrice, :effective, :jobId)',
              inputParameters: '#[{ sku: payload.sku, storeGroup: payload.store_group, newPrice: if (isBlank(payload.new_price)) null else payload.new_price as Number, effective: payload.effective, jobId: vars.jobId }]',
            }),
          ]),
        ],
        {
          onComplete: [
            router(
              'choice',
              {},
              [
                route({ expression: '#[payload.failedRecords * 2 > payload.totalRecords]' }, [
                  step('db-update', jobUpdate('"FAILED"')),
                  step('sftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/prices/error', overwrite: 'true' }),
                  step('email-send', {
                    toAddresses: 'pricing-support@brindle.example',
                    subject: '#["Price file " ++ vars.fileName ++ " FAILED"]',
                    content: '#["Job " ++ (vars.jobId as String) ++ ": " ++ (payload.failedRecords as String) ++ " of " ++ (payload.totalRecords as String) ++ " rows failed. The file is in /prices/error."]',
                    contentType: 'text/plain',
                  }),
                ]),
              ],
              {
                otherwise: [
                  step('db-update', jobUpdate('if (payload.failedRecords == 0) "COMPLETED" else "COMPLETED_WITH_ERRORS"')),
                  step('sftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/prices/done', overwrite: 'true' }),
                ],
              },
            ),
          ],
        },
      ),
    ]),
  ),
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, gets price changes from its pricing system every night: \`PRICE_CHANGES_<date>.csv\` on the **SFTP server**, folder \`/prices/in\`, about **2 million rows**:

\`\`\`
sku,store_group,new_price,effective
TENT-2P-OLV,ALL,119.00,2026-11-15
\`\`\`

A Batch Job inserts each row into \`dbo.price_change\` (\`new_price\` NOT NULL, \`job_id\`). Each run has a row in \`dbo.job_log\`, started by \`dbo.usp_job_start(@jobName)\`.

The job runs with max failed records -1. A few bad rows a night are normal. But last week the pricing system added a column, every price landed in the wrong field, and the job spent **three hours** failing 2 million inserts. The job row said \`COMPLETED_WITH_ERRORS\` and the file sat in \`/prices/done\`.

**Requirements**
- Stop the job once it is clear the file is broken: after **1,000** failed rows.
- When the job ends, decide:
  - more than half the rows failed: job \`FAILED\`, file to \`/prices/error\`, email \`pricing-support@brindle.example\` with "FAILED" in the subject;
  - otherwise: \`COMPLETED\` or \`COMPLETED_WITH_ERRORS\`, file to \`/prices/done\`.
- Write \`loaded\` and \`failed\` to the job row in both cases.

**Design the flow.**
`,
  answerTemplate: `## Max failed records

## Deciding in On Complete

## Where the file goes

## Telling support
`,
  keyPoints: [
    'Max failed records is a circuit breaker for a broken file: past the limit Mule stops the job, and the remaining records are not processed.',
    'Pick a limit well above the bad rows of a normal night and far below a whole file. 1,000 out of 2 million fits here.',
    'The decision needs the job result, so the file move and the email live in On Complete, not after the Batch Job step.',
    'Variables set before the job, such as filePath and jobId, are still there in On Complete.',
    'A stopped job reports fewer processed records than the total. Compare failedRecords with totalRecords, or check processedRecords, on your Mule version.',
  ],
  solution: `
1. **SFTP On New or Updated File** on \`/prices/in\`, size check wait 15 seconds.
2. **Set Variable** \`filePath\`, \`fileName\`; **Stored Procedure** \`usp_job_start\`; **Set Variable** \`jobId\`.
3. **Batch Job** (max failed records 1000), step \`insert-price\`: **Database Insert**.
4. **On Complete**: **Choice**
   - \`payload.failedRecords * 2 > payload.totalRecords\`: **Database Update** FAILED, **SFTP Move** to \`/prices/error\`, **Email Send**.
   - otherwise: **Database Update** COMPLETED or COMPLETED_WITH_ERRORS, **SFTP Move** to \`/prices/done\`.

**What a stopped job leaves behind.** Rows inserted before the stop stay in \`dbo.price_change\` under the failed job's ID. Tell the store systems to read only rows of COMPLETED jobs, or delete the failed job's rows in the FAILED branch.
`,
  followUps: [
    {
      q: 'Could you catch the shifted column before the job starts?',
      a: 'Yes: check the header line against the expected columns first and reject the file at once. Keep the failure limit anyway, for faults the header check cannot see.',
    },
    {
      q: 'Why not make the limit a property?',
      a: 'It should be one, such as ${prices.maxFailed}, so operations can change it without a release. Check that your Mule version accepts a property placeholder in that attribute.',
    },
  ],
}

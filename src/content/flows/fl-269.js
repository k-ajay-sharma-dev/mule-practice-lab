import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

const tables = {
  weekly_sales: {
    rows: [
      { week: '2026W46', store: 'G01', sku: 'SEED-TOM-CHERRY', units: 140 },
      { week: '2026W46', store: 'G01', sku: 'POT-30CM-TERRA', units: 32 },
      { week: '2026W46', store: 'G02', sku: 'HOSE-25M-GRN', units: 9 },
      { week: '2026W46', store: 'G03', sku: 'SEED-TOM-CHERRY', units: 75 },
      { week: '2026W46', store: 'G03', sku: 'SHEARS-PRO', units: 4 },
    ],
  },
  job_log: { key: 'job_id', columns: ['job_id', 'job_name', 'status', 'detail'], rows: [{ job_id: 90, job_name: 'WEEKLY_SALES_OUT', status: 'COMPLETED', detail: 'parts=19 rows=18402215' }] },
}
const procedures = {
  'dbo.usp_job_start': (args, db) => {
    const rows = db.tables.job_log.rows
    const id = Math.max(0, ...rows.map((r) => r.job_id)) + 1
    rows.push({ job_id: id, job_name: args.jobName, status: 'STARTED', detail: null })
    return { job_id: id }
  },
}

export default {
  id: 'fl-269',
  category: 'flows',
  title: 'Twenty Million Weekly Sales Rows to the Planning Platform, End to End: a Job Row, Streamed Rows Cut Into Parts, an MD5 and a Count per Part, a Control File Written Last, and Reports That Never Block',
  level: 'EXPERT',
  tags: ['myproject', 'large-files', 'split-files', 'checksum', 'md5', 'control-file', 'job-log', 'ftp', 'async', 'planning'],
  estMinutes: 65,
  flowChecks: [
    { label: 'A job row is started before the rows are read', rule: { type: 'before', first: 'db-stored-procedure', firstWhere: { sql: 'usp_job_start' }, then: 'db-select', thenWhere: { sql: 'weekly_sales' } } },
    { label: 'The rows stream from SQL Server with a fetch size', rule: { type: 'exists', component: 'db-select', where: { sql: 'weekly_sales', fetchSize: { gte: 1 } } } },
    { label: 'A For Each cuts the rows into parts of at least 100,000', rule: { type: 'exists', component: 'foreach', where: { batchSize: { gte: 100000 } } } },
    { label: 'Each part\'s MD5 is worked out inside the For Each', rule: { type: 'inside', component: 'set-variable', within: 'foreach', where: { value: 'Crypto::MD5' } } },
    { label: 'Each part is written as .tmp and renamed, inside the For Each', rule: { type: 'all', rules: [{ type: 'inside', component: 'ftp-write', within: 'foreach', where: { path: '.tmp' } }, { type: 'inside', component: 'ftp-rename', within: 'foreach' }] } },
    { label: 'The control file is written after every part is renamed', rule: { type: 'before', first: 'ftp-rename', then: 'ftp-write', thenWhere: { path: '.ctl' }, outside: true } },
    { label: 'The job is marked COMPLETED after the control file', rule: { type: 'before', first: 'ftp-write', firstWhere: { path: '.ctl' }, then: 'db-update', thenWhere: { sql: 'COMPLETED' }, outside: true } },
    { label: 'The report email is sent from an Async scope', rule: { type: 'inside', component: 'email-send', within: 'async' } },
    { label: 'A failed run marks the job FAILED and emails support', rule: { type: 'all', rules: [{ type: 'inside', component: 'db-update', within: 'on-error-propagate', where: { sql: 'FAILED' } }, { type: 'inside', component: 'email-send', within: 'on-error-propagate' }] } },
  ],
  simulation: {
    systems: { db: { tables, procedures } },
    tests: [
      {
        name: 'A weekly export',
        about: 'The week fits in one part here. The part is renamed from .tmp, the control file lists it with 5 rows and its MD5, job 91 is COMPLETED and support gets the report.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          files: {
            '/inbound/weekly/WEEKLY_SALES_*_1.csv': { count: 1, has: 'SHEARS-PRO' },
            '/inbound/weekly/*.tmp': { count: 0 },
            '/inbound/weekly/WEEKLY_SALES_*.ctl': { count: 1, has: '_1.csv|5|' },
          },
          db: { job_log: { has: [{ job_id: 91, status: 'COMPLETED', detail: 'parts=1 rows=5' }] } },
          emails: [{ to: 'planning-support@hollin.example', subject: 'COMPLETED', count: 1 }],
        },
      },
      {
        name: 'The FTP server is down',
        about: 'No part can be written, so no control file appears. Job 91 is FAILED and support is told.',
        trigger: { schedule: {} },
        overrides: { systems: { files: { fault: true, faultOn: 'ftp' } } },
        expect: { error: 'FTP:CONNECTIVITY', files: { '/inbound/weekly/*.ctl': { count: 0 } }, db: { job_log: { has: [{ job_id: 91, status: 'FAILED' }] } }, emails: [{ to: 'planning-support@hollin.example', subject: 'FAILED', count: 1 }] },
      },
      {
        name: 'The mail server is down',
        about: 'The export and the job row are done before the report. The report email fails on its own and the job stays COMPLETED.',
        trigger: { schedule: {} },
        overrides: { systems: { email: { fault: true } } },
        expect: { files: { '/inbound/weekly/WEEKLY_SALES_*.ctl': { count: 1 } }, db: { job_log: { has: [{ job_id: 91, status: 'COMPLETED' }] } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'weekly-sales-out',
      source('scheduler', { strategy: 'cron', expression: '0 30 0 ? * MON' }),
      [
        step('db-stored-procedure', { database: 'SQL Server', sql: '{ call dbo.usp_job_start(:jobName) }', inputParameters: '#[{ jobName: "WEEKLY_SALES_OUT" }]', target: 'job' }),
        step('set-variable', { variableName: 'jobId', value: '#[vars.job.job_id]' }),
        step('set-variable', { variableName: 'stamp', value: '#[now() as String {format: "yyyyMMdd"}]' }),
        step('set-variable', { variableName: 'parts', value: '#[[]]' }),
        step('db-select', { database: 'SQL Server', sql: 'SELECT week, store, sku, units FROM dbo.weekly_sales ORDER BY store, sku', fetchSize: 5000 }),
        scope('foreach', { collection: '#[payload]', batchSize: 500000 }, [
          step('set-variable', { variableName: 'fileName', value: '#["WEEKLY_SALES_" ++ vars.stamp ++ "_" ++ (vars.counter as String) ++ ".csv"]' }),
          step('set-variable', { variableName: 'rows', value: '#[sizeOf(payload)]' }),
          step('set-payload', { value: '#[write(payload, "application/csv")]' }),
          step('set-variable', { variableName: 'md5', value: '#[dw::Crypto::MD5(payload as Binary)]' }),
          step('set-variable', { variableName: 'parts', value: '#[vars.parts ++ [{ name: vars.fileName, rows: vars.rows, md5: vars.md5 }]]' }),
          step('ftp-write', { path: '#["/inbound/weekly/" ++ vars.fileName ++ ".tmp"]', mode: 'OVERWRITE' }),
          step('ftp-rename', { path: '#["/inbound/weekly/" ++ vars.fileName ++ ".tmp"]', to: '#[vars.fileName]' }),
        ]),
        step('set-variable', { variableName: 'total', value: '#[sum(vars.parts map $.rows)]' }),
        step('set-payload', { value: '#[((vars.parts map ($.name ++ "|" ++ ($.rows as String) ++ "|" ++ $.md5)) ++ ["TOTAL|" ++ (vars.total as String)]) joinBy "\\n"]' }),
        step('ftp-write', { path: '#["/inbound/weekly/WEEKLY_SALES_" ++ vars.stamp ++ ".ctl"]', mode: 'OVERWRITE' }),
        step('db-update', {
          database: 'SQL Server',
          sql: "UPDATE dbo.job_log SET status = 'COMPLETED', detail = :detail WHERE job_id = :jobId",
          inputParameters: '#[{ jobId: vars.jobId, detail: "parts=" ++ (sizeOf(vars.parts) as String) ++ " rows=" ++ (vars.total as String) }]',
        }),
        scope('async', {}, [
          step('email-send', {
            toAddresses: 'planning-support@hollin.example',
            subject: '#["Weekly sales job " ++ (vars.jobId as String) ++ " COMPLETED"]',
            content: '#[(vars.parts map ($.name ++ ": " ++ ($.rows as String) ++ " rows, md5 " ++ $.md5)) joinBy "\\n"]',
            contentType: 'text/plain',
          }),
        ]),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('db-update', { database: 'SQL Server', sql: "UPDATE dbo.job_log SET status = 'FAILED', detail = :detail WHERE job_id = :jobId", inputParameters: '#[{ jobId: vars.jobId, detail: error.description }]' }),
          step('email-send', { toAddresses: 'planning-support@hollin.example', subject: '#["Weekly sales job " ++ ((vars.jobId default "?") as String) ++ " FAILED"]', content: '#[error.description]', contentType: 'text/plain' }),
        ]),
      ],
    ),
  ),
  description: `
Hollin Garden Supply, a fictional garden centre chain, sends the planning platform its weekly sales every Monday at 00:30: about **20 million rows** from \`dbo.weekly_sales\` in SQL Server, to the platform's **FTP server**, folder \`/inbound/weekly\`.

The platform's rules:
- Parts named \`WEEKLY_SALES_<date>_<n>.csv\`, at most **500,000 rows** each. \`.tmp\` files are ignored.
- A control file \`WEEKLY_SALES_<date>.ctl\` starts the load. One line per part, \`<file name>|<rows>|<MD5 of the file>\`, then \`TOTAL|<rows>\`. A part whose MD5 does not match is refused, with the whole set.

Hollin's own rules:
- Every run has a row in \`dbo.job_log\` (\`job_id\`, \`job_name\`, \`status\`, \`detail\`), started by \`dbo.usp_job_start(@jobName)\`.
- Planning support (\`planning-support@hollin.example\`) gets a report after each run. The mail server is not reliable at night.

**Requirements**
- Start a job row \`WEEKLY_SALES_OUT\`.
- Read the rows so they stream, and cut them into parts of 500,000.
- For each part: the CSV text, its MD5 and its row count; write it as \`.tmp\` and rename.
- Write the control file only after every part is in place.
- Mark the job \`COMPLETED\` with \`parts=<n> rows=<n>\`, then send the report without holding up or failing the run.
- On any failure: mark the job \`FAILED\` and email support.

**Facts**
- \`dbo.usp_job_start\` returns \`{ job_id }\`.
- \`<date>\` is the run date as \`yyyyMMdd\`. Parts are numbered from 1. A part has the columns \`week\`, \`store\`, \`sku\` and \`units\`.
- Work out the MD5 with \`dw::Crypto::MD5(... as Binary)\`.
- The report subject says \`COMPLETED\`, and the failure email subject says \`FAILED\`.
- On failure, mark the job and email in an On Error Propagate, so the run still ends with the original error.

**Design the flow.**
`,
  answerTemplate: `## The job row

## Reading and cutting into parts

## The checksum

## The control file

## Reporting and failure
`,
  keyPoints: [
    'The MD5 is worked out on the exact text that is written. Hash the CSV string, then write that same string.',
    'Each pass of the For Each holds one part, never the whole week. The list of { name, rows, md5 } is all that grows.',
    'The control file is the commit for the set. The job is COMPLETED only after it is written.',
    'The success email is async. In the error handler it is not: the run has failed anyway, and the email is the alarm.',
    'A rerun writes the same names with OVERWRITE. Parts left by a failed run are never loaded, because no control file names them.',
  ],
  solution: `
1. **Scheduler** cron \`0 30 0 ? * MON\`.
2. **Stored Procedure** \`usp_job_start\`, **Set Variable** \`jobId\`, \`stamp\`, \`parts\` = \`[]\`.
3. **Database Select** with fetch size 5000, ordered.
4. **For Each** (batch size 500,000):
   - **Set Variable** \`fileName\` and \`rows\`.
   - **Set Payload** \`write(payload, "application/csv")\`; **Set Variable** \`md5\` = \`dw::Crypto::MD5(payload as Binary)\`; add \`{ name, rows, md5 }\` to \`parts\`.
   - **FTP Write** \`.tmp\`, **FTP Rename**.
5. **Set Variable** \`total\`; **Set Payload** the control lines; **FTP Write** the \`.ctl\`.
6. **Database Update** COMPLETED; **Async** { **Email Send** }.
7. Flow **On Error Propagate**: **Update** FAILED, **Email Send**.

**Encoding.** The platform hashes the bytes it receives. Write the parts with the encoding it expects, such as UTF-8, and hash the same bytes.
`,
  followUps: [
    {
      q: 'Holding 500,000 rows as one CSV string per part is still a lot. How could you shrink it?',
      a: 'Ask for smaller parts, or write each part in pages with APPEND and compute the MD5 from the file on the server afterwards, if the server or a script there can do it. Measure the heap with a real week first.',
    },
    {
      q: 'The platform refuses the set because of an MD5 mismatch. Where do you look?',
      a: 'Compare the hash of the file on the FTP server with the control line. A mismatch there points at the transfer mode (ASCII mode changes line endings) or an encoding change. Use binary transfer for files that are hashed.',
    },
  ],
}

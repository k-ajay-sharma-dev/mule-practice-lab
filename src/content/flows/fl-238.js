import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const done = (jobId) => ({ message: { kind: 'jms', destination: 'JOB.COMPLETED', payload: { jobId } } })
const rej = (n, reason) => ({ job_id: 'J-40417', line_no: n, reason })
const tables = () => ({
  job_log: {
    key: 'job_id',
    rows: [
      { job_id: 'J-40417', message_type: 'SupplierItem', status: 'COMPLETED', good_count: 41870, bad_count: 4 },
      { job_id: 'J-40418', message_type: 'Barcode', status: 'COMPLETED', good_count: 912, bad_count: 0 },
    ],
  },
  job_rejects: { rows: [rej(3, 'UNKNOWN_SUPPLIER'), rej(9, 'UNKNOWN_SUPPLIER'), rej(12, 'UNKNOWN_SUPPLIER'), rej(40, 'BAD_GTIN')] },
})

export default {
  id: 'fl-238',
  category: 'flows',
  title: 'A Reject Report After Each Inbound Job: Counts by Reason and a Link to the Rows, Never Forty Thousand Rows in an Email',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'email', 'smtp', 'reject-table', 'job-log', 'oracle', 'jms', 'reports'],
  estMinutes: 30,
  flowChecks: [
    { label: 'Completed jobs are read from JOB.COMPLETED', rule: { type: 'source', component: 'jms-listener', where: { destination: 'JOB.COMPLETED' } } },
    { label: 'The job row and the reject counts by reason come from Oracle', rule: { type: 'all', rules: [{ type: 'exists', component: 'db-select', where: { sql: 'job_log' } }, { type: 'exists', component: 'db-select', where: { sql: { all: ['job_rejects', 'GROUP BY reason'] } } }] } },
    {
      label: 'The email links to the rejects screen and attaches nothing',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'email-send', where: { content: 'reports.fenwick.example/rejects?jobId=' } },
          { type: 'absent', component: 'email-send', where: { attachments: { set: true } } },
        ],
      },
    },
    { label: 'A job with no rejects sends no email', rule: { type: 'inside', component: 'email-send', within: 'choice' } },
  ],
  simulation: {
    systems: { db: { tables: tables() } },
    tests: [
      {
        name: 'A job with four rejects',
        about: 'J-40417 loaded 41,870 lines and rejected 4. The data stewards get the counts by reason and the link for this job.',
        trigger: done('J-40417'),
        expect: {
          noError: true,
          emails: [
            { to: 'data-stewards@fenwick.example', count: 1, subject: 'J-40417' },
            { has: 'UNKNOWN_SUPPLIER: 3', count: 1 },
            { has: 'https://reports.fenwick.example/rejects?jobId=J-40417', count: 1 },
          ],
        },
      },
      {
        name: 'A clean job',
        about: 'J-40418 has no rejects. Nobody is emailed.',
        trigger: done('J-40418'),
        expect: { noEmails: true },
      },
      {
        name: 'An unknown job ID',
        about: 'J-99999 is not in job_log. A WARN is logged and nothing is sent.',
        trigger: done('J-99999'),
        expect: { noEmails: true, logs: [{ level: 'WARN', has: 'J-99999' }] },
      },
    ],
  },
  referenceFlow: design(
    flow('reject-report-on-job-completed', source('jms-listener', { destination: 'JOB.COMPLETED', ackMode: 'AUTO' }), [
      step('set-variable', { variableName: 'jobId', value: '#[payload.jobId]' }),
      step('db-select', { database: 'Oracle', sql: 'SELECT job_id, message_type, good_count, bad_count FROM job_log WHERE job_id = :jobId', inputParameters: '#[{ jobId: vars.jobId }]', target: 'job' }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[isEmpty(vars.job)]' }, [step('logger', { level: 'WARN', message: '#["Job " ++ vars.jobId ++ " not found in job_log, no report"]' })]),
          route({ expression: '#[vars.job[0].bad_count == 0]' }, [step('logger', { level: 'INFO', message: '#["Job " ++ vars.jobId ++ " has no rejects"]' })]),
        ],
        {
          otherwise: [
            step('db-select', { database: 'Oracle', sql: 'SELECT reason, COUNT(*) AS line_count FROM job_rejects WHERE job_id = :jobId GROUP BY reason ORDER BY reason', inputParameters: '#[{ jobId: vars.jobId }]', target: 'byReason' }),
            step('email-send', {
              toAddresses: 'data-stewards@fenwick.example',
              subject: '#["Rejects in job " ++ vars.jobId ++ " (" ++ vars.job[0].message_type ++ "): " ++ (vars.job[0].bad_count as String)]',
              content:
                '#["Job " ++ vars.jobId ++ " loaded " ++ (vars.job[0].good_count as String) ++ " lines and rejected " ++ (vars.job[0].bad_count as String) ++ ".\\n\\n" ++ ((vars.byReason map ((r) -> r.reason ++ ": " ++ (r.line_count as String))) joinBy "\\n") ++ "\\n\\nSee the rows: https://reports.fenwick.example/rejects?jobId=" ++ vars.jobId]',
            }),
          ],
        },
      ),
    ]),
  ),
  description: `
Fenwick Supply, a fictional builders' merchant, logs every inbound load in the Oracle table \`job_log\` (\`job_id\`, \`message_type\`, \`status\`, \`good_count\`, \`bad_count\`) and its bad lines in \`job_rejects\` (\`job_id\`, \`line_no\`, \`reason\`). When a load finishes, the adapter publishes \`{ "jobId": "J-40417" }\` to the JMS queue \`JOB.COMPLETED\`.

The data stewards (\`data-stewards@fenwick.example\`) fix rejects. They used to get every bad row in the email body. Then a broken supplier file rejected 40,000 lines, the email was refused by the mail server, and nobody knew.

The reports team runs a rejects screen at \`https://reports.fenwick.example/rejects?jobId=<job>\`, behind the company login.

**Requirements**
- On each completed job, read the job row. An unknown job ID: WARN and stop.
- A job with no rejects sends no email.
- Otherwise email the stewards: how many lines loaded and rejected, a count per reason, and the link to the screen for this job. No rows, no attachment.

**Facts**
- The subject carries the job ID. Each reason is its own line in the body: \`UNKNOWN_SUPPLIER: 3\`.
- The WARN for an unknown job names the job ID.

**Design the flow.**
`,
  answerTemplate: `## Reading the job

## The summary

## Why a link
`,
  keyPoints: [
    'A summary fits any size of job. Counts by reason tell the stewards what kind of problem it is before they open anything.',
    'The link takes them to the rows in a screen with a login, so the email holds no data that should not travel.',
    'Mail servers limit message size (often around 10 to 25 MB). A report that grows with the data will one day be refused.',
    'Two Choice routes cover the unknown job and the clean job before any email work is done.',
    'An event per job keeps the report close in time to the load. A daily digest is the next step if stewards get too many emails.',
  ],
  solution: `
1. **JMS On New Message** on \`JOB.COMPLETED\`. **Set Variable** \`jobId\`.
2. **Database Select** the job row, Target \`job\`.
3. **Choice**:
   - \`isEmpty(vars.job)\`: WARN.
   - \`vars.job[0].bad_count == 0\`: INFO.
   - Otherwise: **Database Select** \`SELECT reason, COUNT(*) AS line_count FROM job_rejects WHERE job_id = :jobId GROUP BY reason\`, Target \`byReason\`. **Email Send** to \`data-stewards@fenwick.example\` with the counts, one line per reason, and the link.

**Mail must not hold up the queue.** This flow does only reporting, so a mail failure can let the message be redelivered. Add a redelivery limit, or move the send into an Async scope if one lost report is acceptable.
`,
  followUps: [
    {
      q: 'The stewards ask for the first ten rows in the email anyway. Is that fine?',
      a: 'Only if the rows hold no personal or sensitive data, and with a hard limit of ten. The link stays the way to see the rest.',
    },
    {
      q: 'How do you stop a link from being guessed?',
      a: 'The screen checks the login and the user\'s role, so a guessed job ID shows nothing to the wrong person. The job ID in the URL is not a secret.',
    },
  ],
}

import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const recipients = [
  { job_name: 'STOCK_SNAPSHOT_OUT', email: 'stock-team@fenwick.example', active: 1 },
  { job_name: 'STOCK_SNAPSHOT_OUT', email: 'night-ops@fenwick.example', active: 1 },
  { job_name: 'STOCK_SNAPSHOT_OUT', email: 'old-planner@fenwick.example', active: 0 },
  { job_name: 'PRICE_FILE_IN', email: 'pricing@fenwick.example', active: 1 },
]
const tables = { job_recipient: { columns: ['job_name', 'email', 'active'], rows: recipients } }
const jobEvent = (jobName) => ({ message: { kind: 'jms', destination: 'job.events', payload: { jobName, jobId: 5521, status: 'COMPLETED', loaded: 48210, failed: 3 } } })

export default {
  id: 'fl-285',
  category: 'flows',
  title: 'Job Report Emails to the People Listed for Each Job in Oracle, Not in the Code: Read the Active Recipients, Join Them Into One Send, and Log a WARN When Nobody Is Listed',
  level: 'BEGINNER',
  tags: ['myproject', 'email', 'oracle', 'configuration', 'job-log', 'jms'],
  estMinutes: 20,
  flowChecks: [
    { label: 'Job events arrive on the JMS queue job.events', rule: { type: 'source', component: 'jms-listener', where: { destination: 'job.events' } } },
    { label: 'The recipients are read from job_recipient before the email', rule: { type: 'before', first: 'db-select', firstWhere: { sql: 'job_recipient' }, then: 'email-send' } },
    { label: 'The To list comes from the data, not a written address', rule: { type: 'exists', component: 'email-send', where: { toAddresses: { not: '@' } } } },
  ],
  simulation: {
    systems: { db: { tables } },
    tests: [
      {
        name: 'Two active recipients',
        about: 'The stock snapshot job has two active recipients. One email goes to both, with the counts in the subject.',
        trigger: jobEvent('STOCK_SNAPSHOT_OUT'),
        expect: {
          noError: true,
          emails: [
            { to: 'stock-team@fenwick.example', subject: 'COMPLETED', count: 1 },
            { to: 'night-ops@fenwick.example', count: 1 },
            { to: 'old-planner@fenwick.example', count: 0 },
          ],
        },
      },
      {
        name: 'Another job, another list',
        about: 'The price file job reports to pricing only.',
        trigger: jobEvent('PRICE_FILE_IN'),
        expect: { noError: true, emails: [{ to: 'pricing@fenwick.example', count: 1 }, { to: 'stock-team@fenwick.example', count: 0 }] },
      },
      {
        name: 'Nobody is listed',
        about: 'A new job has no recipients yet. No email is sent, and a WARN says so, so support can add them.',
        trigger: jobEvent('TRANSFER_PLAN_IN'),
        expect: { noError: true, noEmails: true, logs: [{ level: 'WARN', has: 'TRANSFER_PLAN_IN' }] },
      },
    ],
  },
  referenceFlow: design(
    flow('job-report-mailer', source('jms-listener', { destination: 'job.events', ackMode: 'AUTO', numberOfConsumers: 1 }), [
      step('db-select', { database: 'Oracle', sql: 'SELECT email FROM job_recipient WHERE job_name = :jobName AND active = 1 ORDER BY email', inputParameters: '#[{ jobName: payload.jobName }]', target: 'recipients' }),
      router(
        'choice',
        {},
        [route({ expression: '#[isEmpty(vars.recipients)]' }, [step('logger', { level: 'WARN', message: '#["No recipients listed for " ++ payload.jobName ++ ", report not sent"]' })])],
        {
          otherwise: [
            step('email-send', {
              toAddresses: '#[vars.recipients map $.EMAIL joinBy ","]',
              subject: '#[payload.jobName ++ " job " ++ (payload.jobId as String) ++ ": " ++ payload.status]',
              content: '#["Loaded " ++ (payload.loaded as String) ++ ", failed " ++ (payload.failed as String) ++ "."]',
              contentType: 'text/plain',
            }),
          ],
        },
      ),
    ]),
  ),
  description: `
Fenwick Supply, a fictional builders' merchant, has a dozen nightly jobs. When a job ends it publishes an event on the **JMS** queue \`job.events\`:

\`\`\`json
{ "jobName": "STOCK_SNAPSHOT_OUT", "jobId": 5521, "status": "COMPLETED", "loaded": 48210, "failed": 3 }
\`\`\`

Each job's report goes to different people. Today the addresses are written into each app's properties, so a change of staff needs a deployment, and a planner who left last spring still gets the stock reports.

The support team now keeps the lists in Oracle, in \`job_recipient\` (\`job_name\`, \`email\`, \`active\`), and edits them from their console.

**Requirements**
- Send **one** email per event to every **active** recipient of that job. The subject holds the job name, the job ID and the status; the body the counts.
- If a job has nobody listed, send nothing and log a WARN that names the job.

**Facts**
- \`active\` is 1 for a current recipient and 0 for an old one.
- Read the recipients into a target variable, so the event stays the payload. Pass the addresses to **Email Send** as one comma separated To list.

**What each system sends back**
- Oracle returns unquoted column names in upper case, so a row reads \`{ "EMAIL": ... }\`.
- \`SELECT email FROM job_recipient ...\` gives a list of rows, empty when nobody is listed:
\`\`\`json
[ { "EMAIL": "night-ops@fenwick.example" }, { "EMAIL": "stock-team@fenwick.example" } ]
\`\`\`

**Design the flow.**
`,
  answerTemplate: `## Finding the recipients

## One email, many recipients

## Nobody listed
`,
  keyPoints: [
    'Recipients are data, not code. A table the support team edits changes who is told without a deployment.',
    'Read them with a target variable, so the job event stays the payload for the subject and the body.',
    'Email Send takes a comma separated To list: map the rows to their addresses and joinBy ",". One send, one message for everyone.',
    'Filter on active = 1 in the SQL. Keeping old rows with active = 0 shows who used to get the report.',
    'An empty list is a setup gap, not an error. A WARN that names the job tells support exactly what to add.',
  ],
  solution: `
1. **JMS On New Message** on \`job.events\`.
2. **Database Select** \`SELECT email FROM job_recipient WHERE job_name = :jobName AND active = 1\` (target \`recipients\`).
3. **Choice**:
   - empty: **Logger** WARN with the job name.
   - otherwise: **Email Send** to \`#[vars.recipients map $.EMAIL joinBy ","]\`, subject from the event, the counts in the body.

**Many recipients.** Everyone in To sees the other addresses. For a long list, or people outside the company, put them in Bcc or send one email each.
`,
  followUps: [
    {
      q: 'The table is read on every event. Is that a problem?',
      a: 'A dozen events a night is nothing. For thousands a minute, wrap the select in a Cache scope with a short time to live, so a console change still shows within minutes.',
    },
    {
      q: 'What if the mail server is down when the event arrives?',
      a: 'Email Send fails and the flow ends with an error, so the event goes back to the queue and is tried again. Set a redelivery limit, or the event loops while the server is down for long.',
    },
  ],
}

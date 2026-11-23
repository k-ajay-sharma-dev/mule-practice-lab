import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

const db = () => ({
  tables: { job_runs: { columns: ['job_name', 'status', 'row_count'], rows: [] } },
  procedures: { 'EXPORT_PKG.BUILD_STORE_FILE': () => ({ p_rows: 412 }) },
})

export default {
  id: 'fl-235',
  category: 'flows',
  title: 'A Job Report by Email After the Nightly Export: Send It in an Async Scope So a Mail Outage Never Fails the Job',
  level: 'BEGINNER',
  tags: ['myproject', 'email', 'smtp', 'async', 'job-report', 'oracle', 'scheduler'],
  estMinutes: 20,
  flowChecks: [
    { label: 'A Scheduler starts the export at 02:00', rule: { type: 'source', component: 'scheduler', where: { expression: '0 0 2' } } },
    { label: 'The export procedure runs before the run is recorded', rule: { type: 'before', first: 'db-stored-procedure', firstWhere: { sql: 'EXPORT_PKG.BUILD_STORE_FILE' }, then: 'db-insert', thenWhere: { sql: 'job_runs' } } },
    { label: 'The report email to the planning team is sent in an Async scope', rule: { type: 'inside', component: 'email-send', within: 'async', where: { toAddresses: 'planning-team@larkfield.example' } } },
    { label: 'The report goes out after the run is recorded', rule: { type: 'before', first: 'db-insert', then: 'async' } },
  ],
  simulation: {
    systems: { db: db() },
    tests: [
      {
        name: 'A normal night',
        about: 'The procedure builds 412 rows, the run is recorded as COMPLETED, and the planning team gets a report that says 412.',
        trigger: { schedule: {} },
        expect: { noError: true, db: { job_runs: { has: [{ job_name: 'STORE_EXPORT', status: 'COMPLETED', row_count: 412 }] } }, emails: [{ to: 'planning-team@larkfield.example', count: 1, has: '412' }] },
      },
      {
        name: 'The mail server is down',
        about: 'The report cannot be sent. The job itself still ends without an error, the run is recorded, and the job does not log a failure of its own.',
        trigger: { schedule: {} },
        overrides: { systems: { email: { fault: true } } },
        expect: { noError: true, db: { job_runs: { count: 1, has: [{ status: 'COMPLETED' }] } }, noLogs: [{ level: 'ERROR' }] },
      },
      {
        name: 'The export fails',
        about: 'The procedure fails. No report goes to the planning team, because there is nothing to report, and an ERROR is logged.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { failWhen: [{ match: 'BUILD_STORE_FILE', fault: 'QUERY_EXECUTION', description: 'ORA-01555: snapshot too old' }] } } },
        expect: { emails: [{ to: 'planning-team@larkfield.example', count: 0 }], logs: [{ level: 'ERROR' }], db: { job_runs: { count: 0 } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'store-export-nightly',
      source('scheduler', { strategy: 'cron', expression: '0 0 2 * * ?' }),
      [
        step('db-stored-procedure', { database: 'Oracle', sql: '{ call EXPORT_PKG.BUILD_STORE_FILE(:p_rows) }', target: 'built' }),
        step('db-insert', {
          database: 'Oracle',
          sql: "INSERT INTO job_runs (job_name, status, row_count) VALUES ('STORE_EXPORT', 'COMPLETED', :rows)",
          inputParameters: '#[{ rows: vars.built.p_rows }]',
          target: 'recorded',
        }),
        scope('async', {}, [
          step('email-send', {
            toAddresses: 'planning-team@larkfield.example',
            subject: '#["Store export completed: " ++ (vars.built.p_rows as String) ++ " stores"]',
            content: '#["The nightly store export finished at " ++ (now() as String {format: "HH:mm"}) ++ " with " ++ (vars.built.p_rows as String) ++ " stores."]',
          }),
        ]),
      ],
      [handler('on-error-continue', { type: 'ANY' }, [step('logger', { level: 'ERROR', message: '#["Store export failed: " ++ error.description]' })])],
    ),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, builds a store master file for the planning platform every night. The Oracle procedure \`EXPORT_PKG.BUILD_STORE_FILE(p_rows OUT NUMBER)\` builds it and returns the number of stores. Each run is recorded in \`job_runs\` (\`job_name\`, \`status\`, \`row_count\`).

The planning team wants a short email each morning saying the export worked and how many stores it held. They read \`planning-team@larkfield.example\`.

Last month the mail relay was down for maintenance one night. The export had worked, but the email step failed the whole job, and support reran an export that was already done.

**Requirements**
- Run the export every night at 02:00.
- After it works, record the run as \`STORE_EXPORT\`, \`COMPLETED\`, with the row count.
- Then email the planning team a report with the count. A mail problem must not fail or slow the job.
- If the export fails, send no report and log an ERROR.

**What each system sends back**
- The stored procedure returns its output parameter by name: \`{ "p_rows": 412 }\`. With Target \`built\`, read it as \`vars.built.p_rows\`.

**What failures look like**
- The export fails: the Stored Procedure raises \`DB:QUERY_EXECUTION\` (\`ORA-01555: snapshot too old\`). Nothing is recorded and no report is sent.
- The mail server is down: Email Send raises an \`EMAIL\` error, but inside Async it never reaches the flow, so nothing is logged as ERROR.

**Design the flow.**
`,
  answerTemplate: `## The export and the record

## The report email

## When the mail server is down
`,
  keyPoints: [
    'The report is about the job, it is not part of it. An Async scope runs the send on its own, and its errors never reach the flow.',
    'Send the report only after the run is recorded, so the email never claims something the job log does not show.',
    'A report email with numbers is better than "it worked": the planning team can spot a count that is far too low.',
    'An Async scope keeps its work in memory. If the app stops at that moment, the email is lost. For reports that is usually fine; for mail that must arrive, use an outbox table.',
  ],
  solution: `
1. **Scheduler** cron \`0 0 2 * * ?\`.
2. **Database Stored Procedure** \`{ call EXPORT_PKG.BUILD_STORE_FILE(:p_rows) }\` with \`p_rows\` as an output parameter, Target \`built\`.
3. **Database Insert** into \`job_runs\`.
4. **Async**: **Email Send** to \`planning-team@larkfield.example\`, with the count in the subject and the body.
5. **On Error Continue** (ANY): ERROR log.

**Who hears about a failure?** The ERROR log feeds the monitoring alert. A failure email to support is fine as well, also in an Async scope.
`,
  followUps: [
    {
      q: 'Why not On Error Continue around the Email Send instead of Async?',
      a: 'That stops the failure, but the job still waits for the mail server, which can take the full SMTP timeout. Async removes both the failure and the wait.',
    },
    {
      q: 'The planning team wants the report even when no stores changed. Anything to watch?',
      a: 'Send it every night, with the count, so a missing email itself becomes a signal that the job did not run.',
    },
  ],
}

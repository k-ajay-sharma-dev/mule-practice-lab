import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const cfg = (type, recipients) => ({ report_type: type, recipients, active: 1 })
const log = (type, direction, status, n) => Array.from({ length: n }, (_, i) => ({ message_type: type, direction, status, log_date: '2026-11-12', ref: `${type}-${direction}-${status}-${i}` }))
const entityLog = [...log('Item', 'IN', 'PROCESSED', 3), ...log('Item', 'IN', 'FAILED', 1), ...log('Item', 'OUT', 'SENT', 2), ...log('Barcode', 'IN', 'PROCESSED', 2)]
const tables = (config, runs = []) => ({
  report_config: { key: 'report_type', rows: config },
  entity_log: { rows: entityLog },
  report_runs: { columns: ['report_type', 'run_date', 'status'], rows: runs },
})
const normal = [cfg('Item', 'item-team@marrowpine.example'), cfg('Barcode', 'barcode-team@marrowpine.example')]

export default {
  id: 'fl-244',
  category: 'flows',
  title: 'The Morning Report App: One Email per Message Type From the Entity Log Tables, Each Type on Its Own, and No Second Copy When the Job Is Rerun',
  level: 'ADVANCED',
  tags: ['myproject', 'email', 'smtp', 'reports', 'job-log', 'oracle', 'scheduler', 'idempotency'],
  estMinutes: 40,
  flowChecks: [
    { label: 'A Scheduler runs the reports at 07:00', rule: { type: 'source', component: 'scheduler', where: { expression: '0 0 7' } } },
    { label: 'The report types and their recipients come from report_config', rule: { type: 'exists', component: 'db-select', where: { sql: 'report_config' } } },
    { label: 'Each type is reported in its own Try inside a For Each', rule: { type: 'all', rules: [{ type: 'inside', component: 'email-send', within: 'try' }, { type: 'inside', component: 'try', within: 'foreach' }] } },
    { label: 'Yesterday\'s inbound and outbound counts are read from entity_log for the type', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['entity_log', 'message_type = :', 'GROUP BY'] } } } },
    { label: 'Each sent report is recorded in report_runs after the send', rule: { type: 'before', first: 'email-send', then: 'db-insert', thenWhere: { sql: { all: ['report_runs', 'SENT'] } } } },
    { label: 'A type already reported today is skipped', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['report_runs', 'run_date'] } } } },
    { label: 'A type that fails is recorded as FAILED and the others go on', rule: { type: 'inside', component: 'db-insert', within: 'on-error-continue', where: { sql: 'FAILED' } } },
  ],
  simulation: {
    systems: { db: { tables: tables(normal) } },
    tests: [
      {
        name: 'A normal morning',
        about: 'Item and Barcode each get one email with yesterday\'s inbound and outbound counts, and each run is recorded as SENT.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          emails: [
            { to: 'item-team@marrowpine.example', count: 1, has: 'IN PROCESSED: 3' },
            { to: 'item-team@marrowpine.example', count: 1, has: 'OUT SENT: 2' },
            { to: 'barcode-team@marrowpine.example', count: 1, has: 'IN PROCESSED: 2' },
          ],
          db: { report_runs: { count: 2, has: [{ report_type: 'Item', run_date: '2026-11-13', status: 'SENT' }, { report_type: 'Barcode', status: 'SENT' }] } },
        },
      },
      {
        name: 'One type has no recipients',
        about: 'Someone cleared the Barcode recipients. That report fails and is recorded as FAILED; the Item report still goes.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { tables: tables([cfg('Item', 'item-team@marrowpine.example'), cfg('Barcode', '')]) } } },
        expect: { emails: [{ to: 'item-team@marrowpine.example', count: 1 }, { count: 1 }], db: { report_runs: { has: [{ report_type: 'Item', status: 'SENT' }, { report_type: 'Barcode', status: 'FAILED' }] } }, logs: [{ level: 'ERROR', has: 'Barcode' }] },
      },
      {
        name: 'Support reruns the job at 09:00',
        about: 'The Item report went out at 07:00, so only Barcode, which failed then, is sent now.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { tables: tables(normal, [{ report_type: 'Item', run_date: '2026-11-13', status: 'SENT' }, { report_type: 'Barcode', run_date: '2026-11-13', status: 'FAILED' }]) } } },
        expect: { emails: [{ to: 'item-team@marrowpine.example', count: 0 }, { to: 'barcode-team@marrowpine.example', count: 1 }] },
      },
    ],
  },
  referenceFlow: design(
    flow('morning-reports', source('scheduler', { strategy: 'cron', expression: '0 0 7 * * ?' }), [
      step('set-variable', { variableName: 'today', value: '#[now() as String {format: "yyyy-MM-dd"}]' }),
      step('set-variable', { variableName: 'yesterday', value: '#[(now() - |P1D|) as String {format: "yyyy-MM-dd"}]' }),
      step('db-select', { database: 'Oracle', sql: 'SELECT report_type, recipients FROM report_config WHERE active = 1 ORDER BY report_type', target: 'reports' }),
      scope('foreach', { collection: '#[vars.reports]' }, [
        step('set-variable', { variableName: 'report', value: '#[payload]' }),
        scope('try', {}, [
          step('db-select', {
            database: 'Oracle',
            sql: "SELECT report_type FROM report_runs WHERE report_type = :type AND run_date = :today AND status = 'SENT'",
            inputParameters: '#[{ type: vars.report.report_type, today: vars.today }]',
            target: 'done',
          }),
          router('choice', {}, [
            route({ expression: '#[isEmpty(vars.done)]' }, [
              router('choice', {}, [route({ expression: '#[isEmpty(vars.report.recipients default "")]' }, [step('raise-error', { type: 'APP:NO_RECIPIENTS', description: 'The report has no recipients' })])]),
              step('db-select', {
                database: 'Oracle',
                sql: 'SELECT direction, status, COUNT(*) AS msg_count FROM entity_log WHERE message_type = :type AND log_date = :day GROUP BY direction, status ORDER BY direction, status',
                inputParameters: '#[{ type: vars.report.report_type, day: vars.yesterday }]',
                target: 'counts',
              }),
              step('email-send', {
                toAddresses: '#[vars.report.recipients]',
                subject: '#[vars.report.report_type ++ " messages on " ++ vars.yesterday]',
                content: '#[(vars.counts map ((c) -> c.direction ++ " " ++ c.status ++ ": " ++ (c.msg_count as String))) joinBy "\\n"]',
              }),
              step('db-insert', {
                database: 'Oracle',
                sql: "INSERT INTO report_runs (report_type, run_date, status) VALUES (:type, :today, 'SENT')",
                inputParameters: '#[{ type: vars.report.report_type, today: vars.today }]',
              }),
            ]),
          ]),
        ], {
          errorHandlers: [
            handler('on-error-continue', { type: 'ANY' }, [
              step('logger', { level: 'ERROR', message: '#["Report " ++ vars.report.report_type ++ " failed: " ++ error.description]' }),
              step('db-insert', {
                database: 'Oracle',
                sql: "INSERT INTO report_runs (report_type, run_date, status) VALUES (:type, :today, 'FAILED')",
                inputParameters: '#[{ type: vars.report.report_type, today: vars.today }]',
              }),
            ]),
          ],
        }),
      ]),
    ]),
  ),
  description: `
Marrow & Pine Home, a fictional homewares retailer, runs a small report app beside its integration adapters. Every inbound and outbound message is logged in the Oracle table \`entity_log\` (\`message_type\`, \`direction\` \`IN\` or \`OUT\`, \`status\`, \`log_date\`, \`ref\`). Each team gets a morning email for its message type.

Oracle tables:
- \`report_config\` (\`report_type\`, \`recipients\` comma separated, \`active\`): which reports to send, to whom.
- \`report_runs\` (\`report_type\`, \`run_date\`, \`status\`): one row per report sent or failed.

**Requirements**
- Every day at 07:00, for each active report type, email its recipients yesterday's counts by direction and status, one line each, such as \`IN PROCESSED: 3\`.
- Each report on its own: one failing must not stop the others. Record it in \`report_runs\` as \`SENT\` or \`FAILED\`, with today's date, and log an ERROR for a failure.
- A report with no recipients is a failure.
- Support often reruns the job after fixing something. A type already \`SENT\` today is skipped, so nobody gets a second copy.

**Design the flow.**
`,
  answerTemplate: `## Which reports

## One report at a time

## Counting the messages

## Reruns
`,
  keyPoints: [
    'Keep the list of reports and recipients in a table. Adding a team or changing an address is then a data change, not a release.',
    'A Try per report inside the For Each keeps one broken report from stopping the rest.',
    'GROUP BY in Oracle gives the counts in one query per type. Pulling every log row into Mule to count it does not scale.',
    'report_runs makes the job safe to rerun: a SENT row today means skip. A FAILED row does not block the retry.',
    'The report_runs row is written after the send. If the insert fails after a send, a rerun sends a second copy; that is the safer side to err on for a report.',
  ],
  solution: `
1. **Scheduler** cron \`0 0 7 * * ?\`. **Set Variable** \`today\` and \`yesterday\`.
2. **Database Select** active rows of \`report_config\`, Target \`reports\`.
3. **For Each** report: \`report\`, then a **Try**:
   - **Database Select** a \`SENT\` row in \`report_runs\` for today, Target \`done\`.
   - **Choice** not done:
     - **Choice** no recipients: **Raise Error** \`APP:NO_RECIPIENTS\`.
     - **Database Select** counts \`... GROUP BY direction, status\`, Target \`counts\`.
     - **Email Send** to the recipients, one line per count.
     - **Database Insert** \`report_runs\` \`SENT\`.
   - **On Error Continue**: ERROR log, **Database Insert** \`report_runs\` \`FAILED\`.

**One combined email.** Some teams want inbound and outbound in one email, as here. A management summary across all types is one more row in \`report_config\` with its own query.
`,
  followUps: [
    {
      q: 'Why not one big email to everyone with every type?',
      a: 'Each team cares about its own types. A long email for everyone is read by no one. Per type emails also fail on their own.',
    },
    {
      q: 'The Scheduler runs on two nodes by mistake. What saves you?',
      a: 'Partly report_runs: the second node skips types the first has marked SENT, but both can send if they start in the same second. Primary node only is the real fix.',
    },
  ],
}

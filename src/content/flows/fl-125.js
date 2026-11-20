import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

const lockRow = (row) => ({ job_lock: { key: 'job_name', rows: [{ job_name: 'interest-export', owner: null, lease_until: '2026-11-13T09:00:00Z', last_completed_date: '2026-11-12', ...row }] } })
const FILE = '/ledger/inbound/interest-2026-11-13.csv'

export default {
  id: 'fl-125',
  category: 'flows',
  title: 'One Nightly Export From Three Unclustered Mule Servers: a Database Lease, the Database Clock and a Safe Takeover',
  level: 'EXPERT',
  tags: ['myproject', 'scheduler', 'distributed-lock', 'lease', 'oracle', 'sftp', 'banking', 'on-premises'],
  estMinutes: 45,
  flowChecks: [
    { label: 'A Scheduler with a cron expression starts the job', rule: { type: 'source', component: 'scheduler', where: { strategy: 'cron', expression: { set: true } } } },
    {
      label: 'The lease is taken with one conditional UPDATE on job_lock that only matches an expired lease',
      rule: { type: 'exists', component: 'db-update', where: { sql: { all: ['update job_lock', 'set owner', 'lease_until <'] } } },
    },
    {
      label: 'The lease times come from the database clock, not from each server',
      rule: {
        type: 'exists',
        component: 'db-update',
        where: { sql: { all: ['lease_until <', 'interval'], oneOf: ['current_timestamp', 'systimestamp', 'sysdate'] } },
      },
    },
    {
      label: 'The same UPDATE skips a day that is already done',
      rule: { type: 'exists', component: 'db-update', where: { sql: { all: ['lease_until <', 'last_completed_date <'] } } },
    },
    { label: 'A Choice reads affectedRows from the lease UPDATE', rule: { type: 'routes', component: 'choice', routeWhere: { expression: 'affectedRows' } } },
    {
      label: 'The lease is taken before the export, and the file is only written inside the Choice',
      rule: {
        type: 'all',
        rules: [
          { type: 'before', first: 'db-update', firstWhere: { sql: 'lease_until <' }, then: 'db-select' },
          { type: 'inside', component: 'sftp-write', within: 'choice' },
        ],
      },
    },
    {
      label: 'The day is marked done only after the file is written, on the main path',
      rule: { type: 'before', first: 'sftp-write', then: 'db-update', thenWhere: { sql: { all: ['last_completed_date =', 'owner ='] } }, outside: true },
    },
    {
      label: 'On a failure the lease is given back at once, only by its owner, and the day is not marked done',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'db-update', within: ['on-error-propagate', 'on-error-continue'], where: { sql: { all: ['job_lock', 'lease_until', 'owner = :'] } } },
          { type: 'absent', component: 'db-update', where: { sql: 'last_completed_date =' }, within: ['on-error-propagate', 'on-error-continue'] },
        ],
      },
    },
  ],
  simulation: {
    properties: { 'node.name': 'mule-02' },
    systems: {
      db: {
        now: '2026-11-13T10:00:00Z',
        tables: {
          ...lockRow({}),
          daily_interest: {
            key: 'account_id',
            rows: [
              { account_id: 'ACC-1001', business_date: '2026-11-13', accrued_interest: 1.37, currency: 'GBP' },
              { account_id: 'ACC-1002', business_date: '2026-11-13', accrued_interest: 0.42, currency: 'GBP' },
              { account_id: 'ACC-0999', business_date: '2026-11-12', accrued_interest: 0.51, currency: 'GBP' },
            ],
          },
        },
      },
      files: {},
    },
    tests: [
      {
        name: 'This server wins the lease',
        about: 'The lease is free and today is not done. This server takes the lease, writes the file, marks the day done and gives the lease back.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          files: { [FILE]: { exists: true, has: 'ACC-1002' } },
          db: { job_lock: { has: [{ job_name: 'interest-export', last_completed_date: '2026-11-13', owner: null }] } },
        },
      },
      {
        name: 'Another server holds the lease',
        about: 'mule-01 took the lease two minutes ago and is still working. This server does nothing, writes no file and ends without an error.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { tables: lockRow({ owner: 'mule-01', lease_until: '2026-11-13T10:28:00Z' }) } } },
        expect: {
          noError: true,
          files: { [FILE]: { exists: false } },
          db: { job_lock: { has: [{ owner: 'mule-01', lease_until: '2026-11-13T10:28:00Z', last_completed_date: '2026-11-12' }] } },
        },
      },
      {
        name: 'Today is already done',
        about: 'An earlier run finished the export for today and gave the lease back. Later runs in the window do nothing.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { tables: lockRow({ last_completed_date: '2026-11-13' }) } } },
        expect: { noError: true, files: { [FILE]: { exists: false } } },
      },
      {
        name: 'The server holding the lease died',
        about: 'mule-01 took the lease at 09:05 and crashed. Its lease ran out at 09:35, so this server takes over and the export still happens today.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { tables: lockRow({ owner: 'mule-01', lease_until: '2026-11-13T09:35:00Z' }) } } },
        expect: {
          noError: true,
          files: { [FILE]: { exists: true } },
          db: { job_lock: { has: [{ last_completed_date: '2026-11-13', owner: null }] } },
        },
      },
      {
        name: 'The ledger SFTP server is down',
        about: 'The file cannot be written. The run fails, the lease is given back at once and the day is not marked done, so the next run in the window can try again on any server.',
        trigger: { schedule: {} },
        overrides: { systems: { files: { fault: true, faultOn: 'sftp' } } },
        expect: {
          error: 'SFTP:CONNECTIVITY',
          db: { job_lock: { has: [{ owner: null, last_completed_date: '2026-11-12' }], lacks: [{ owner: 'mule-02' }] } },
        },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'nightly-interest-export',
      source('scheduler', { strategy: 'cron', expression: '0 0/10 1-3 * * ?' }),
      [
        step('set-variable', { variableName: 'node', value: "#[p('node.name')]" }),
        step('set-variable', { variableName: 'businessDate', value: '#[now() as String {format: "yyyy-MM-dd"}]' }),
        step('db-update', {
          database: 'Oracle',
          sql: "UPDATE job_lock SET owner = :node, lease_until = CURRENT_TIMESTAMP + INTERVAL '30' MINUTE WHERE job_name = 'interest-export' AND lease_until < CURRENT_TIMESTAMP AND last_completed_date < TO_DATE(:businessDate, 'YYYY-MM-DD')",
          inputParameters: '#[{ node: vars.node, businessDate: vars.businessDate }]',
          target: 'lease',
        }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[vars.lease.affectedRows == 1]' }, [
              step('logger', { level: 'INFO', message: '#["Interest export for " ++ vars.businessDate ++ " runs on " ++ vars.node]' }),
              step('db-select', {
                database: 'Oracle',
                sql: "SELECT account_id, accrued_interest, currency FROM daily_interest WHERE business_date = TO_DATE(:businessDate, 'YYYY-MM-DD')",
                inputParameters: '#[{ businessDate: vars.businessDate }]',
              }),
              step('transform', {
                script: '%dw 2.0\noutput application/csv\n---\npayload map { account: $.account_id, amount: $.accrued_interest, currency: $.currency }',
              }),
              step('sftp-write', { path: '#["/ledger/inbound/interest-" ++ vars.businessDate ++ ".csv"]', mode: 'OVERWRITE' }),
              step('db-update', {
                database: 'Oracle',
                sql: "UPDATE job_lock SET last_completed_date = TO_DATE(:businessDate, 'YYYY-MM-DD'), owner = NULL, lease_until = CURRENT_TIMESTAMP WHERE job_name = 'interest-export' AND owner = :node",
                inputParameters: '#[{ node: vars.node, businessDate: vars.businessDate }]',
              }),
            ]),
          ],
          { otherwise: [step('logger', { level: 'DEBUG', message: '#["Interest export skipped on " ++ vars.node ++ ": done, or another server holds the lease"]' })] },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('db-update', {
            database: 'Oracle',
            sql: "UPDATE job_lock SET owner = NULL, lease_until = CURRENT_TIMESTAMP WHERE job_name = 'interest-export' AND owner = :node",
            inputParameters: '#[{ node: vars.node }]',
          }),
          step('logger', { level: 'ERROR', message: '#["Interest export failed on " ++ vars.node ++ ", lease released: " ++ error.description]' }),
        ]),
      ],
    ),
  ),
  description: `
A building society runs Mule 4 on **three customer-hosted servers**, \`mule-01\` to \`mule-03\`, behind a load balancer. They are **not in a Mule cluster**, so every Scheduler fires on all three. Each server starts with its own name in the system property \`node.name\`, so a flow can read it with \`p('node.name')\`.

A nightly job exports the day's interest accruals from the Oracle table \`daily_interest\` (\`account_id\`, \`business_date\`, \`accrued_interest\`, \`currency\`) to the ledger's SFTP server as \`/ledger/inbound/interest-YYYY-MM-DD.csv\`. The ledger posts every file it receives. Last week it posted the same interest **three times**, once per server.

A developer suggested a flag in the Object Store. The team found that on servers outside a cluster each server's Object Store is its own, so the servers would not see each other's flag.

The DBA has created this table, with one row per job:

| column | meaning |
|---|---|
| \`job_name\` | \`interest-export\` |
| \`owner\` | the server that holds the lease, or null |
| \`lease_until\` | when the lease runs out (a TIMESTAMP) |
| \`last_completed_date\` | the last business date exported (a DATE) |

**Requirements**
- Exactly one server exports each business date.
- If the server doing the export crashes, another server must take over **the same night**. The export window is 01:00 to 04:00, and the export takes about 5 minutes.
- If the export fails, the day must not be marked done, and another try must not wait for a lease to run out.
- A server must never give back a lease that another server holds.
- The three servers' clocks can differ by up to a minute.

**Facts**
- The job row already exists with \`job_name = 'interest-export'\`. A free lease has \`owner\` null and a \`lease_until\` in the past.
- A lease lasts **30 minutes**. Run the Scheduler every 10 minutes through the window.
- The business date is today's date. Export the rows of \`daily_interest\` for that date as CSV with the columns \`account\`, \`amount\` and \`currency\`, and overwrite a file of the same name.
- After the file is written, set \`last_completed_date\` to the business date and give the lease back (\`owner\` null). On a failure, give the lease back and let the error propagate, so the run shows as failed.

**Design the flow.** Explain why a SELECT followed by an UPDATE is not enough.
`,
  answerTemplate: `## Why every server ran the job

## Why SELECT then UPDATE is not enough

## Taking the lease

## The export

## Giving the lease back

## When a server dies
`,
  keyPoints: [
    'Outside a cluster every server runs every Scheduler, and each server has its own Object Store, so the lock must live in a store all servers share: here the database.',
    'Take the lease with one conditional UPDATE. The database applies the condition and the change together, so only one server can get affectedRows = 1.',
    'A SELECT then an UPDATE leaves a gap where two servers both see a free lease.',
    'A lease runs out on its own. A server that crashes cannot hold the job for ever.',
    'Use the database clock for the lease times. Server clocks that differ by a minute would let two servers think a lease has expired at different moments.',
    'Run the Scheduler every 10 minutes through the window, so a takeover happens the same night. last_completed_date stops the later runs from exporting again.',
    'Give the lease back in the error handler, and only with owner = this server, so a failed run can be retried at once and no server frees another\'s lease.',
    'Name the file by business date and overwrite it. A run that crashed after writing the file but before marking the day done writes the same file again, not a second one.',
  ],
  solution: `
**Why every server ran the job.** A Scheduler on a server that is not in a cluster fires on that server. Three servers, three exports. In a Mule cluster the Scheduler would run on the primary node only, but these servers are not clustered.

**Why SELECT then UPDATE is not enough.** All three servers fire at 01:00:00. Each one reads the lock row, sees it free, and then writes its own name. All three think they won.

**Flow: nightly-interest-export**
1. **Scheduler**, cron \`0 0/10 1-3 * * ?\`: every 10 minutes from 01:00 to 03:50.
2. **Set Variable** \`node\` = \`p('node.name')\` and \`businessDate\` = today as \`yyyy-MM-dd\`.
3. **Database Update** with Target \`lease\`:
   \`\`\`sql
   UPDATE job_lock
   SET owner = :node, lease_until = CURRENT_TIMESTAMP + INTERVAL '30' MINUTE
   WHERE job_name = 'interest-export'
     AND lease_until < CURRENT_TIMESTAMP
     AND last_completed_date < TO_DATE(:businessDate, 'YYYY-MM-DD')
   \`\`\`
4. **Choice** on \`vars.lease.affectedRows == 1\`:
   - **Database Select** the accruals for the date, **Transform** to CSV, **SFTP Write** \`/ledger/inbound/interest-<date>.csv\` with OVERWRITE.
   - **Database Update**: \`SET last_completed_date = <date>, owner = NULL, lease_until = CURRENT_TIMESTAMP WHERE job_name = 'interest-export' AND owner = :node\`.
   - Otherwise: log at DEBUG and stop. Another server has it, or today is done.
5. **On Error Propagate** for \`ANY\`: **Database Update** \`SET owner = NULL, lease_until = CURRENT_TIMESTAMP WHERE job_name = 'interest-export' AND owner = :node\`, then log at ERROR.

**Why one UPDATE works.** Oracle locks the row while it runs the UPDATE. The first server's UPDATE matches and moves \`lease_until\` 30 minutes ahead. The other two run after it, find \`lease_until\` in the future, and match nothing.

**Choosing 30 minutes.** The lease must be longer than the longest export, about 5 minutes, with a wide margin. It must also be short enough to leave time in the window for a takeover. 30 minutes does both.

**When a server dies.** \`mule-01\` takes the lease at 01:00 and crashes at 01:03. Its lease runs out at 01:30. The 01:30 or 01:40 run on \`mule-02\` or \`mule-03\` takes the lease and exports. The file name is the same, so a half-written file from \`mule-01\` is replaced.

**One edge case.** If an export ever runs longer than its lease, a second server can start while the first is still writing. Keep the lease well above the slowest run you have seen, and alert when an export takes more than half of it.
`,
  followUps: [
    {
      q: 'Would a Mule cluster remove the need for this table?',
      a: 'Yes for the Scheduler: in a cluster it runs on the primary node only, and the cluster shares its Object Store. You still need last_completed_date if the job must not run twice after a restart.',
    },
    {
      q: 'Why not SELECT ... FOR UPDATE inside a transaction?',
      a: 'It works while the transaction is open, but the export then holds a database transaction open for minutes, across an SFTP write. A lease row with a time limit holds no transaction.',
    },
    {
      q: 'What happens if the job_lock row is missing?',
      a: 'The UPDATE matches nothing, so no server runs the export and nothing fails. Insert the row once when the job is set up, and alert when a night ends without a new last_completed_date.',
    },
    {
      q: 'Why give the lease back on failure instead of letting it run out?',
      a: 'A failed run on a dead SFTP server would otherwise block every server for 30 minutes. Giving it back lets the next run, 10 minutes later, try again.',
    },
  ],
}

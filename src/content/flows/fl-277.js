import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const tables = {
  v_sales_yesterday: {
    rows: [
      { store: '0101', sku: 'TENT-2P-OLV', units: 3 },
      { store: '0102', sku: 'JKT-RAIN-M', units: 7 },
      { store: '0103', sku: 'STOVE-GAS-1B', units: 2 },
    ],
  },
}
const dir = '/inbound/sales'

export default {
  id: 'fl-277',
  category: 'flows',
  title: 'Daily Sales to the Planning Platform Over SFTP: Notice When Yesterday\'s File Was Never Picked Up, Send Tonight\'s Anyway, and Never Overwrite a File the Platform Has Not Taken',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'sftp', 'planning', 'monitoring', 'create-new', 'sql-server', 'email', 'async'],
  estMinutes: 30,
  flowChecks: [
    { label: 'The outbound folder is listed before tonight\'s file is written', rule: { type: 'before', first: 'sftp-list', firstWhere: { directoryPath: dir }, then: 'sftp-write' } },
    { label: 'Tonight\'s file is written with CREATE_NEW', rule: { type: 'exists', component: 'sftp-write', where: { path: dir, mode: 'CREATE_NEW' } } },
    { label: 'An alert email is sent from an Async scope', rule: { type: 'inside', component: 'email-send', within: 'async' } },
  ],
  simulation: {
    systems: { db: { tables } },
    tests: [
      {
        name: 'A normal night',
        about: 'The folder is empty, as it should be. Tonight\'s file is written and nobody is emailed.',
        trigger: { schedule: {} },
        expect: { noError: true, files: { [`${dir}/DAILY_SALES_20261113.csv`]: { exists: true, has: 'STOVE-GAS-1B' } }, noEmails: true },
      },
      {
        name: 'Yesterday\'s file is still there',
        about: 'The platform did not take last night\'s file. Tonight\'s file is still written, and planning support is told which file is waiting.',
        trigger: { schedule: {} },
        overrides: { systems: { files: { [`${dir}/DAILY_SALES_20261112.csv`]: 'store,sku,units\n0101,TENT-2P-OLV,1' } } },
        expect: {
          files: { [`${dir}/DAILY_SALES_20261113.csv`]: { exists: true }, [`${dir}/DAILY_SALES_20261112.csv`]: { exists: true } },
          emails: [{ to: 'planning-support@brindle.example', has: 'DAILY_SALES_20261112.csv', count: 1 }],
        },
      },
      {
        name: 'A rerun after the file was sent',
        about: 'Support reruns the job while tonight\'s file still waits for the platform. The write refuses to replace it, so the platform never reads a file that changes under it.',
        trigger: { schedule: {} },
        overrides: { systems: { files: { [`${dir}/DAILY_SALES_20261113.csv`]: 'store,sku,units\n0101,FIRST-RUN,1' } } },
        expect: { error: 'SFTP:FILE_ALREADY_EXISTS', files: { [`${dir}/DAILY_SALES_20261113.csv`]: { has: 'FIRST-RUN' } } },
      },
      {
        name: 'The mail server is down',
        about: 'The alert cannot be sent, but it runs on its own, so tonight\'s file is still written.',
        trigger: { schedule: {} },
        overrides: { systems: { files: { [`${dir}/DAILY_SALES_20261112.csv`]: 'store,sku,units\n0101,TENT-2P-OLV,1' }, email: { fault: true } } },
        expect: { noError: true, files: { [`${dir}/DAILY_SALES_20261113.csv`]: { exists: true } } },
      },
    ],
  },
  referenceFlow: design(
    flow('daily-sales-out', source('scheduler', { strategy: 'cron', expression: '0 0 2 * * ?' }), [
      step('sftp-list', { directoryPath: dir, matcher: 'DAILY_SALES_*.csv', recursive: 'false' }),
      step('set-variable', { variableName: 'waiting', value: '#[payload map $.attributes.fileName]' }),
      step('set-variable', { variableName: 'fileName', value: '#["DAILY_SALES_" ++ (now() as String {format: "yyyyMMdd"}) ++ ".csv"]' }),
      step('db-select', { database: 'SQL Server', sql: 'SELECT store, sku, units FROM dbo.v_sales_yesterday ORDER BY store, sku', fetchSize: 2000 }),
      step('transform', { script: '%dw 2.0\noutput application/csv\n---\npayload' }),
      step('sftp-write', { path: `#["${dir}/" ++ vars.fileName]`, mode: 'CREATE_NEW' }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[not isEmpty(vars.waiting)]' }, [
            step('logger', { level: 'WARN', message: '#["Files not picked up by the platform: " ++ (vars.waiting joinBy ", ")]' }),
            scope('async', {}, [
              step('email-send', {
                toAddresses: 'planning-support@brindle.example',
                subject: 'Sales files waiting on the planning platform SFTP',
                content: '#["These files were not picked up: " ++ (vars.waiting joinBy ", ") ++ ". Tonight\'s file " ++ vars.fileName ++ " was sent as usual."]',
                contentType: 'text/plain',
              }),
            ]),
          ]),
        ],
        { otherwise: [step('logger', { level: 'INFO', message: '#["Sent " ++ vars.fileName]' })] },
      ),
    ]),
  ),
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, sends yesterday's sales to the planning platform every night at 02:00. The view \`dbo.v_sales_yesterday\` in SQL Server gives the rows (\`store\`, \`sku\`, \`units\`). The file goes to the platform's **SFTP server**, folder \`/inbound/sales\`, as \`DAILY_SALES_<yyyyMMdd>.csv\` with a header line.

The platform moves each file away once it has loaded it, so the folder should be empty when the job starts. Twice this year the platform's loader stopped for days. Nobody noticed until the planners saw flat sales in their forecasts.

**Requirements**
- Before writing, see what is still in the folder. Files left from earlier nights mean the platform is not loading.
- Send tonight's file anyway; the platform loads every waiting file when it starts again.
- When old files are waiting, email planning support (\`planning-support@brindle.example\`) with their names. A mail outage must not stop the file.
- Never replace a file that is already in the folder: the platform may be reading it.

**Facts**
- List \`/inbound/sales\` for \`DAILY_SALES_*.csv\` before you write. The date in the name is today's date. In the tests today is 2026-11-13.
- Write with the mode \`CREATE_NEW\`. When the file exists, the write raises \`SFTP:FILE_ALREADY_EXISTS\`. Do not catch it: the run fails and the old file stays as it was.
- Send the alert from an **Async** scope, so a mail failure does not fail the run.

**What each system sends back**
- SFTP List gives a list of messages, one per file, each with \`attributes.fileName\` (such as \`DAILY_SALES_20261112.csv\`). An empty folder gives \`[]\`.
- The Database Select gives rows with the columns as named: \`[ { "store": "0101", "sku": "TENT-2P-OLV", "units": 3 } ]\`.

**What failures look like**
- Tonight's file is already there: the SFTP Write raises \`SFTP:FILE_ALREADY_EXISTS\` and the run fails.
- The mail server is down: the email fails inside the Async scope. Tonight's file is written and the run ends without error.

**Design the flow.**
`,
  answerTemplate: `## What is waiting

## Tonight's file

## The alert
`,
  keyPoints: [
    'The folder is the platform\'s inbox. Files that stay there are the cheapest sign that its loader has stopped.',
    'Keep only the names of the waiting files. The listing also carries their content, which you do not need.',
    'CREATE_NEW makes the write fail if the file exists. A rerun cannot change a file the platform may be reading or has half loaded.',
    'The alert sits in an Async scope, so a mail outage cannot stop tonight\'s file.',
    'Send tonight\'s file even when old ones wait. Holding it back would leave the platform one more night behind when it recovers.',
  ],
  solution: `
1. **Scheduler** cron \`0 0 2 * * ?\`.
2. **SFTP List** \`/inbound/sales\`, \`DAILY_SALES_*.csv\`. **Set Variable** \`waiting\` = the file names; **Set Variable** \`fileName\`.
3. **Database Select** \`dbo.v_sales_yesterday\`, **Transform** to CSV.
4. **SFTP Write** \`/inbound/sales/<fileName>\` with **CREATE_NEW**.
5. **Choice**: waiting not empty: **Logger** WARN, **Async** { **Email Send** to planning support }; otherwise **Logger** INFO.

**A rerun.** If tonight's file must really be sent again, support deletes or renames the waiting one first. That is a deliberate step, not something a rerun does by accident.
`,
  followUps: [
    {
      q: 'Why list before the write and not after?',
      a: 'After the write the listing always holds tonight\'s file, so you would have to filter it out. Listing first shows only what the platform left.',
    },
    {
      q: 'The platform\'s loader stops for a week. How many emails does support get, and is that right?',
      a: 'One a night, each listing every waiting file. That is a fair reminder. If it grows too noisy, keep the alert time in a table and send at most one a day per file.',
    },
  ],
}

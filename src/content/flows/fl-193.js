import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const sale = (id, store, sku, units, net, exported = 0) => ({ sale_id: id, business_date: '2026-11-12', store, sku, units, net_sales: net, exported })
const rows = [sale(9001, '0101', 'JKT-RAIN-M', 4, 239.96), sale(9002, '0102', 'SOCK-WOOL-L', 9, 107.91), sale(9003, '0103', 'BOTTLE-1L', 6, 89.94), sale(8990, '0101', 'TENT-2P-OLV', 1, 129.0, 1)]

export default {
  id: 'fl-193',
  category: 'flows',
  title: 'Daily Sales to the Planning Platform Over SFTP With a Control File: Data First, the Count File Last, and Rows Marked Sent Only After Both',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'sftp', 'control-file', 'record-count', 'scheduler', 'outbound', 'planning'],
  estMinutes: 30,
  flowChecks: [
    { label: 'Rows not yet exported are selected from daily_sales', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['daily_sales', 'exported'] } } } },
    { label: 'The data file is written to /inbound/sales before the control file', rule: { type: 'before', first: 'sftp-write', firstWhere: { path: '.csv' }, then: 'sftp-write', thenWhere: { path: '.ctl' } } },
    { label: 'The control file carries the row count', rule: { type: 'exists', component: 'set-payload', where: { value: 'sizeOf' } } },
    { label: 'Rows are marked exported only after the control file is written', rule: { type: 'before', first: 'sftp-write', firstWhere: { path: '.ctl' }, then: ['db-update', 'db-bulk-update'], thenWhere: { sql: 'exported' }, outside: true } },
    { label: 'No files are written when there is nothing new', rule: { type: 'inside', component: 'sftp-write', within: 'choice', inSlot: 'otherwise' } },
  ],
  simulation: {
    systems: { db: { tables: { daily_sales: { key: 'sale_id', rows } } } },
    tests: [
      {
        name: 'The nightly send',
        about: 'The three new rows go out. The control file names the data file and says 3. The rows are then marked exported; the old one was never resent.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          files: { '/inbound/sales/DAILY_SALES_*.csv': { count: 1, has: 'SOCK-WOOL-L' }, '/inbound/sales/DAILY_SALES_*.ctl': { count: 1, has: '.csv|3' } },
          db: { daily_sales: { has: [{ sale_id: 9001, exported: 1 }, { sale_id: 9003, exported: 1 }] } },
        },
      },
      {
        name: 'The SFTP server is down',
        about: 'Nothing can be written. No row is marked exported, so tomorrow\'s run sends them.',
        trigger: { schedule: {} },
        overrides: { systems: { files: { fault: true, faultOn: 'sftp' } } },
        expect: { error: 'SFTP:CONNECTIVITY', db: { daily_sales: { has: [{ sale_id: 9001, exported: 0 }, { sale_id: 9002, exported: 0 }] } } },
      },
      {
        name: 'Nothing new',
        about: 'Every row was sent already. No data file and no control file appear.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { tables: { daily_sales: { key: 'sale_id', rows: [rows[3]] } } } } },
        expect: { files: { '/inbound/sales/*': { count: 0 } } },
      },
    ],
  },
  referenceFlow: design(
    flow('daily-sales-to-planning', source('scheduler', { strategy: 'cron', expression: '0 30 2 * * ?' }), [
      step('db-select', { database: 'SQL Server', sql: 'SELECT sale_id, business_date, store, sku, units, net_sales FROM daily_sales WHERE exported = 0 ORDER BY sale_id' }),
      router(
        'choice',
        {},
        [route({ expression: '#[isEmpty(payload)]' }, [step('logger', { level: 'INFO', message: 'No new sales to send' })])],
        {
          otherwise: [
            step('set-variable', { variableName: 'rows', value: '#[payload]' }),
            step('set-variable', { variableName: 'fileBase', value: '#["DAILY_SALES_" ++ (now() as String {format: "yyyyMMddHHmmss"})]' }),
            step('transform', { script: '%dw 2.0\noutput application/csv\n---\npayload map ((s) -> s - "sale_id")' }),
            step('sftp-write', { path: '#["/inbound/sales/" ++ vars.fileBase ++ ".csv"]', mode: 'OVERWRITE' }),
            step('set-payload', { value: '#[vars.fileBase ++ ".csv|" ++ (sizeOf(vars.rows) as String)]' }),
            step('sftp-write', { path: '#["/inbound/sales/" ++ vars.fileBase ++ ".ctl"]', mode: 'OVERWRITE' }),
            step('set-payload', { value: '#[vars.rows]' }),
            step('db-bulk-update', { database: 'SQL Server', sql: 'UPDATE daily_sales SET exported = 1 WHERE sale_id = :sale_id' }),
          ],
        },
      ),
    ]),
  ),
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, sends store sales to the planning platform each night over **SFTP**. Sales sit in the SQL Server table \`daily_sales\` (\`sale_id\`, \`business_date\`, \`store\`, \`sku\`, \`units\`, \`net_sales\`, \`exported\`). \`exported\` is 0 until a row has been sent.

The platform's rule for its \`/inbound/sales\` folder:
- Put the data file \`DAILY_SALES_<yyyyMMddHHmmss>.csv\` first.
- Then put a control file with the same name and \`.ctl\`, holding one line: \`<data file name>|<row count>\`.
- The platform starts its load when it sees the control file, and checks the count.

**Requirements**
- Every night at 02:30, send the rows not yet exported.
- Write the data file, then the control file.
- Mark the rows sent (\`exported = 1\`) only once both files are written.
- If there is nothing new, write no files at all.

**Facts**
- Work out the file name once, with the run's timestamp, and use it for both files.
- Build the control line with a **Set Payload**, using \`sizeOf\` on the selected rows, such as \`DAILY_SALES_20261113023000.csv|3\`.
- Mark only the rows that were in the file, by \`sale_id\`.
- Do not catch a failed write. The run fails and no row is marked.

**What each system sends back**
- The Database Select gives a list of rows with the table's column names, such as \`{ "sale_id": 9001, "business_date": "2026-11-12", "store": "0101", "sku": "JKT-RAIN-M", "units": 4, "net_sales": 239.96 }\`. Nothing new gives \`[]\`.

**What failures look like**
- An SFTP server that cannot be reached raises **SFTP:CONNECTIVITY** on the first write. The run ends with that error.

**Design the flow.**
`,
  answerTemplate: `## Choosing the rows

## The data file and the control file

## Marking rows sent

## Nothing new, and failures
`,
  keyPoints: [
    'The control file is the receiver\'s "go". Written last, it can only appear when the data file is complete.',
    'The count in the control file lets the platform reject a short data file instead of loading it.',
    'Mark rows by their keys, not with "every row where exported = 0". A row added while the job ran was not in the file and must stay unsent.',
    'Marking comes last. If a write fails, nothing is marked and the next run sends the rows again.',
    'No rows, no files. A control file that says 0 is a choice to agree with the platform, not a default.',
  ],
  solution: `
1. **Scheduler**, cron \`0 30 2 * * ?\`.
2. **Database Select** \`... WHERE exported = 0\`.
3. **Choice**: no rows, INFO log. Otherwise:
   - **Set Variable** \`rows\` and \`fileBase\`.
   - **Transform** to CSV.
   - **SFTP Write** \`/inbound/sales/<fileBase>.csv\`.
   - **Set Payload** \`<fileBase>.csv|<count>\`, **SFTP Write** \`/inbound/sales/<fileBase>.ctl\`.
   - **Set Payload** \`vars.rows\`, **Database Bulk Update** \`SET exported = 1 WHERE sale_id = :sale_id\`.

**A crash after the control file.** The platform has the files, but the rows are still 0, so tomorrow sends them again. The platform should ignore rows it has, or Mule should record the file name before writing and check it next time.

**Big files.** Write the data file under a temporary name and rename it before the control file, for receivers that also scan for \`*.csv\`.
`,
  followUps: [
    {
      q: 'Why not put the count in a trailer line inside the data file?',
      a: 'Both work. A trailer needs no second file, but the receiver must read to the end to find it. A control file also acts as the "go" signal. Use what the receiver supports.',
    },
    {
      q: 'The platform also wants a checksum. Where would it go?',
      a: 'In the control file, next to the count. Work it out from the exact bytes written, so line endings or encoding cannot make it disagree.',
    },
  ],
}

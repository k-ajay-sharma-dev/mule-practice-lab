import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const dir = '/mnt/pos-share/sales/in'
const f = (store) => `${dir}/STORE_${store}_20261112.csv`
const csv = (store, sku, units) => `store,sku,business_date,units,net_sales\n${store},${sku},2026-11-12,${units},${(units * 12.5).toFixed(2)}`
const files = { [f('0101')]: csv('0101', 'JKT-RAIN-M', 4), [f('0102')]: csv('0102', 'SOCK-WOOL-L', 9), [f('0103')]: csv('0103', 'BOTTLE-1L', 6) }
const stores = { key: 'store_id', rows: ['0101', '0102', '0103'].map((s) => ({ store_id: s, active: 1 })) }
const tables = (runs = []) => ({ expected_stores: stores, sales_runs: { key: 'business_date', rows: runs } })

export default {
  id: 'fl-185',
  category: 'flows',
  title: 'One Daily Sales File From Every Store\'s Drop on an Azure File Share: Wait Until All Stores Are In, Send One Combined File Under a Temporary Name, and Never Send a Day Twice',
  level: 'EXPERT',
  tags: ['myproject', 'azure-file-share', 'smb', 'sftp', 'aggregation', 'completeness', 'idempotency', 'planning'],
  estMinutes: 55,
  flowChecks: [
    { label: 'A Scheduler lists the store drop folder', rule: { type: 'all', rules: [{ type: 'source', component: 'scheduler' }, { type: 'exists', component: 'file-list', where: { directoryPath: dir } }] } },
    { label: 'The stores that should send are read from expected_stores', rule: { type: 'exists', component: 'db-select', where: { sql: 'expected_stores' } } },
    { label: 'sales_runs is checked so a day is never sent twice', rule: { type: 'before', first: 'db-select', firstWhere: { sql: 'sales_runs' }, then: 'sftp-write' } },
    { label: 'The combined file is written under a .tmp name, then renamed', rule: { type: 'before', first: 'sftp-write', firstWhere: { path: '.tmp' }, then: 'sftp-rename' } },
    { label: 'The day is recorded in sales_runs after the rename', rule: { type: 'before', first: 'sftp-rename', then: 'db-insert', thenWhere: { sql: 'sales_runs' } } },
    { label: 'The store files are archived one by one after the day is recorded', rule: { type: 'all', rules: [{ type: 'before', first: 'db-insert', then: 'file-move', thenWhere: { targetPath: 'archive' } }, { type: 'inside', component: 'file-move', within: 'foreach', where: { targetPath: 'archive' } }] } },
  ],
  simulation: {
    systems: { files, db: { tables: tables() } },
    tests: [
      {
        name: 'Every store is in',
        about: 'All three stores have sent. One combined file appears under its final name with every store\'s rows, the day is recorded, and the store files are archived.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          files: {
            '/inbound/sales/STORE_SALES_20261112.csv': { exists: true, has: 'SOCK-WOOL-L' },
            '/inbound/sales/*.tmp': { count: 0 },
            '/mnt/pos-share/sales/archive/*': { count: 3 },
          },
          db: { sales_runs: { count: 1, has: [{ business_date: '20261112', store_count: 3 }] } },
        },
      },
      {
        name: 'A store is late',
        about: 'Store 0103 has not sent yet. Nothing goes to the platform, the two files wait on the share, and the log names the missing store.',
        trigger: { schedule: {} },
        overrides: { systems: { files: { [f('0103')]: null } } },
        expect: { files: { '/inbound/sales/*': { count: 0 }, [f('0101')]: { exists: true } }, db: { sales_runs: { count: 0 } }, logs: [{ level: 'INFO', has: '0103' }] },
      },
      {
        name: 'The day was already sent',
        about: 'sales_runs already has 20261112: a store resent its file after the cut. Nothing is sent again, and the files go to the late folder for the planners to look at.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { tables: tables([{ business_date: '20261112', store_count: 3, status: 'SENT' }]) } } },
        expect: { files: { '/inbound/sales/*': { count: 0 }, '/mnt/pos-share/sales/late/*': { count: 3 } }, logs: [{ level: 'WARN' }] },
      },
    ],
  },
  referenceFlow: design(
    flow('combined-store-sales', source('scheduler', { strategy: 'fixed-frequency', frequency: 15, timeUnit: 'MINUTES' }), [
      step('file-list', { directoryPath: dir, matcher: 'STORE_*.csv', recursive: 'false' }),
      router(
        'choice',
        {},
        [route({ expression: '#[isEmpty(payload)]' }, [step('logger', { level: 'DEBUG', message: 'No store files yet' })])],
        {
          otherwise: [
            step('set-variable', { variableName: 'files', value: '#[payload]' }),
            step('set-variable', { variableName: 'businessDate', value: '#[(payload[0].attributes.fileName splitBy "_")[2] replace ".csv" with ""]' }),
            step('set-variable', { variableName: 'present', value: '#[payload map ((f) -> (f.attributes.fileName splitBy "_")[1])]' }),
            step('db-select', { database: 'SQL Server', sql: 'SELECT store_id FROM expected_stores WHERE active = 1', target: 'expected' }),
            step('db-select', { database: 'SQL Server', sql: 'SELECT business_date FROM sales_runs WHERE business_date = :businessDate', inputParameters: '#[{ businessDate: vars.businessDate }]', target: 'sent' }),
            step('set-variable', { variableName: 'missing', value: '#[(vars.expected map $.store_id) filter ((s) -> not (vars.present contains s))]' }),
            router(
              'choice',
              {},
              [
                route({ expression: '#[not isEmpty(vars.sent)]' }, [
                  step('logger', { level: 'WARN', message: '#["Sales for " ++ vars.businessDate ++ " were already sent; moving the late files aside"]' }),
                  scope('foreach', { collection: '#[vars.files]' }, [step('file-move', { sourcePath: '#[payload.attributes.path]', targetPath: '/mnt/pos-share/sales/late' })]),
                ]),
                route({ expression: '#[not isEmpty(vars.missing)]' }, [
                  step('logger', { level: 'INFO', message: '#["Waiting for stores " ++ (vars.missing joinBy ", ") ++ " for " ++ vars.businessDate]' }),
                ]),
              ],
              {
                otherwise: [
                  step('transform', { script: '%dw 2.0\noutput application/csv\n---\nflatten(vars.files map ((f) -> read(f.payload as String, "application/csv")))' }),
                  step('sftp-write', { path: '#["/inbound/sales/STORE_SALES_" ++ vars.businessDate ++ ".csv.tmp"]', mode: 'OVERWRITE' }),
                  step('sftp-rename', { path: '#["/inbound/sales/STORE_SALES_" ++ vars.businessDate ++ ".csv.tmp"]', to: '#["STORE_SALES_" ++ vars.businessDate ++ ".csv"]' }),
                  step('db-insert', {
                    database: 'SQL Server',
                    sql: "INSERT INTO sales_runs (business_date, store_count, status) VALUES (:businessDate, :storeCount, 'SENT')",
                    inputParameters: '#[{ businessDate: vars.businessDate, storeCount: sizeOf(vars.files) }]',
                  }),
                  scope('foreach', { collection: '#[vars.files]' }, [step('file-move', { sourcePath: '#[payload.attributes.path]', targetPath: '/mnt/pos-share/sales/archive' })]),
                ],
              },
            ),
          ],
        },
      ),
    ]),
  ),
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, sends store sales to the planning platform once a day. Each store's till server copies a file to an **Azure File Share**, mounted over SMB on the integration host at \`/mnt/pos-share\`. Files land in \`sales/in\` as \`STORE_<store>_<yyyyMMdd>.csv\`:

\`\`\`
store,sku,business_date,units,net_sales
0101,JKT-RAIN-M,2026-11-12,4,50.00
\`\`\`

The planning platform wants **one** file a day with every store in it, on its SFTP server: \`/inbound/sales/STORE_SALES_<yyyyMMdd>.csv\`. It loads any \`*.csv\` it finds there at once. It treats a store missing from the file as a store that sold nothing, and loading a day twice doubles that day's sales.

SQL Server holds \`expected_stores\` (\`store_id\`, \`active\`) and \`sales_runs\` (\`business_date\` primary key, \`store_count\`, \`status\`).

**Requirements**
- Every 15 minutes, look at the files waiting on the share.
- Send nothing until every active store's file for the day is there. Log which stores are missing.
- Then build one combined CSV and put it on the SFTP server so the platform can never load half of it.
- Record the day in \`sales_runs\`, then move the store files to \`/mnt/pos-share/sales/archive\`.
- If the day was already sent, send nothing and move the files to \`/mnt/pos-share/sales/late\`.

**Design the flow.**
`,
  answerTemplate: `## Is every store in

## Building the combined file

## Putting it on the SFTP server

## Recording the day, and repeats

## Late stores and a cut off
`,
  keyPoints: [
    'Completeness is a business rule, not a file rule: compare the stores present with the stores expected, from a table the business owns.',
    'The platform loads any *.csv at once, so write STORE_SALES_<date>.csv.tmp and rename it. The final name appears only when the file is whole.',
    'sales_runs keyed on the business date is the guard against a second send. Check it before building the file, and insert into it right after the rename.',
    'Archive the store files after the run is recorded. If the flow stops after the rename, the next poll sees sales_runs and moves the files to late instead of sending again.',
    'Every branch either waits, sends once, or sets files aside. Nothing is left in a state where the next poll could send a partial day.',
  ],
  solution: `
1. **Scheduler** every 15 minutes. **File List** \`/mnt/pos-share/sales/in\`, \`STORE_*.csv\`.
2. **Choice**: no files, DEBUG log. Otherwise:
   - **Set Variable** \`files\`, \`businessDate\` (from the first file name) and \`present\` (the store numbers in the names).
   - **Database Select** active stores into \`expected\`, and \`sales_runs\` for the date into \`sent\`.
   - **Set Variable** \`missing\` = expected minus present.
   - **Choice**:
     - Already sent: WARN, **For Each** file **File Move** to \`late\`.
     - Stores missing: INFO log naming them.
     - Otherwise: **Transform** all rows into one CSV, **SFTP Write** \`STORE_SALES_<date>.csv.tmp\`, **SFTP Rename** to \`STORE_SALES_<date>.csv\`, **Database Insert** into \`sales_runs\`, **For Each** file **File Move** to \`archive\`.

**A cut off.** A store whose server is broken would hold every other store back. Agree a cut off with the planners, such as 06:00: after it, send the stores that are in, record which were missing, and send a correction later if the platform accepts one.

**Two days at once.** If yesterday's files are still waiting when today's arrive, group the list by business date and handle each date on its own.
`,
  followUps: [
    {
      q: 'The rename on the SFTP server fails because yesterday\'s file was never collected and has the same name. What happens?',
      a: 'The rename raises an error, sales_runs is not written and the files stay, so the next poll tries again. Alert on it: a file the platform did not collect is a problem on its side.',
    },
    {
      q: 'Why combine in Mule rather than let the platform load 40 store files?',
      a: 'The platform asked for one file a day. If it could load per store, sending each file as it arrives would need less state in Mule, and the completeness rule would move to the platform side.',
    },
  ],
}

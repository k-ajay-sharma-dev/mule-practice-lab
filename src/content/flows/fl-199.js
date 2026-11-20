import { design, flow, source, step } from '../../flow/dsl.js'

const item = (item_id, description, dept, unit_cost, status) => ({ item_id, description, dept, unit_cost, status })
const items = [
  item('TENT-2P-OLV', 'Two person tent, olive', 'CAMP', 129.0, 'ACTIVE'),
  item('JKT-RAIN-M', 'Rain jacket, medium', 'APPAREL', 59.99, 'ACTIVE'),
  item('BOTTLE-1L', 'Steel bottle, 1 litre', 'CAMP', 14.99, 'DISCONTINUED'),
  item('STOVE-MINI', 'Mini gas stove', 'CAMP', 34.5, 'DRAFT'),
]
const final = '/inbound/items/ITEMS_20261113.csv'

export default {
  id: 'fl-199',
  category: 'flows',
  title: 'Nightly Item Master to the Planning Platform Over FTP: Write Under a Temporary Name, Then Rename',
  level: 'BEGINNER',
  tags: ['myproject', 'ftp', 'master-data', 'scheduler', 'temp-file', 'outbound', 'planning'],
  estMinutes: 20,
  flowChecks: [
    { label: 'The export runs on a nightly cron schedule', rule: { type: 'source', component: 'scheduler', where: { strategy: 'cron', expression: { set: true } } } },
    { label: 'Items are read from dbo.items, leaving out drafts', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['items', 'DRAFT'] } } } },
    { label: 'The file is written to /inbound/items under a .tmp name', rule: { type: 'exists', component: 'ftp-write', where: { path: { all: ['/inbound/items/', '.tmp'] } } } },
    { label: 'The file is renamed to its final name after the write', rule: { type: 'before', first: 'ftp-write', then: 'ftp-rename' } },
  ],
  simulation: {
    systems: { db: { tables: { items: { key: 'item_id', rows: items } } } },
    tests: [
      {
        name: 'The nightly export',
        about: 'Three items go out in ITEMS_20261113.csv. The draft item stays behind, and no .tmp file is left on the server.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          files: { [final]: { exists: true, has: 'JKT-RAIN-M' }, '/inbound/items/*.tmp': { count: 0 } },
        },
      },
      {
        name: 'The FTP server is down',
        about: 'The write fails. No file with the final name appears, so the platform never loads half a file.',
        trigger: { schedule: {} },
        overrides: { systems: { files: { fault: true, faultOn: 'ftp' } } },
        expect: { error: 'FTP:CONNECTIVITY', files: { [final]: { exists: false } } },
      },
    ],
  },
  referenceFlow: design(
    flow('items-to-planning', source('scheduler', { strategy: 'cron', expression: '0 30 23 * * ?' }), [
      step('db-select', { database: 'SQL Server', sql: "SELECT item_id, description, dept, unit_cost, status FROM dbo.items WHERE status <> 'DRAFT' ORDER BY item_id" }),
      step('set-variable', { variableName: 'fileName', value: '#["ITEMS_" ++ (now() as String {format: "yyyyMMdd"}) ++ ".csv"]' }),
      step('transform', { script: '%dw 2.0\noutput application/csv\n---\npayload' }),
      step('ftp-write', { path: '#["/inbound/items/" ++ vars.fileName ++ ".tmp"]', mode: 'OVERWRITE' }),
      step('ftp-rename', { path: '#["/inbound/items/" ++ vars.fileName ++ ".tmp"]', to: '#[vars.fileName]' }),
      step('logger', { level: 'INFO', message: '#["Item master sent as " ++ vars.fileName]' }),
    ]),
  ),
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, sends its item master to the planning platform every night. The platform collects files from its own **FTP server**, folder \`/inbound/items\`, and loads any \`.csv\` it finds there.

Items live in the SQL Server table \`dbo.items\` (\`item_id\`, \`description\`, \`dept\`, \`unit_cost\`, \`status\`). Items with status \`DRAFT\` are not ready and must not be sent.

Last month the platform loaded half a file: its loader ran while the Mule app was still uploading.

**Requirements**
- Run at 23:30 each night.
- Send every item that is not a draft, as \`ITEMS_<yyyyMMdd>.csv\`.
- The platform must never see a file that is still being written.

**Facts**
- Write the file as \`/inbound/items/ITEMS_<yyyyMMdd>.csv.tmp\`, which the loader ignores, then rename it to \`ITEMS_<yyyyMMdd>.csv\`. No \`.tmp\` file may be left.
- The date in the name is the run date.
- Do not catch a failed write. The run fails, and no file with the final name appears.

**Design the flow.**
`,
  answerTemplate: `## Schedule and query

## Building the file

## Never a half written file

## When the FTP server is down
`,
  keyPoints: [
    'Write to a name the loader ignores (.tmp), then rename. A rename on the same server is quick and the file appears whole.',
    'The rename uses the same folder, so it does not copy the bytes again.',
    'Filter drafts in SQL, not in DataWeave: fewer rows cross the network.',
    'If the write fails, the .tmp name protects the platform. Tidy old .tmp files at the start of the next run, or let the next OVERWRITE replace them.',
  ],
  solution: `
1. **Scheduler**, cron \`0 30 23 * * ?\` (set the time zone on the scheduler if the runtime is not on local time).
2. **Database Select** on SQL Server: \`SELECT item_id, description, dept, unit_cost, status FROM dbo.items WHERE status <> 'DRAFT' ORDER BY item_id\`.
3. **Set Variable** \`fileName\` = \`ITEMS_<yyyyMMdd>.csv\`.
4. **Transform** to CSV.
5. **FTP Write** \`/inbound/items/<fileName>.tmp\`.
6. **FTP Rename** the \`.tmp\` file to \`<fileName>\`.

**Passive mode.** Most FTP servers sit behind a firewall that only lets the client open connections. Use passive mode on the FTP config, and ask the server team for the passive port range to open.

**Transfer type.** A CSV can go in ASCII mode, which may change line endings. Binary keeps the bytes as written and is the safer default for files a program loads.
`,
  followUps: [
    {
      q: 'The platform team says they cannot ignore .tmp files. What else could you do?',
      a: 'Write to a separate staging folder on the same server and move the file into /inbound/items when it is complete, or send a control file after the data file. Both give the loader a clear "ready" signal.',
    },
    {
      q: 'Why not add the date to the .tmp name as well?',
      a: 'It already has it, because the .tmp name is the final name plus .tmp. Two runs on the same day overwrite the same .tmp file, which is what you want for a rerun.',
    },
  ],
}

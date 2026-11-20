import { design, flow, scope, source, step } from '../../flow/dsl.js'

const tables = {
  region: { key: 'region_code', columns: ['region_code', 'active'], rows: [{ region_code: 'N', active: 1 }, { region_code: 'S', active: 1 }, { region_code: 'W', active: 1 }, { region_code: 'X', active: 0 }] },
  store_transfer: {
    rows: [
      { region: 'N', from_store: '0204', to_store: '0207', sku: 'MILK-2L-SEMI', qty: 24 },
      { region: 'N', from_store: '0207', to_store: '0211', sku: 'EGGS-6-FR', qty: 12 },
      { region: 'S', from_store: '0311', to_store: '0315', sku: 'BREAD-WHT-800', qty: 30 },
    ],
  },
}
const out = '/inbound/transfers'

export default {
  id: 'fl-280',
  category: 'flows',
  title: 'Store Transfers per Region to the Planning Platform Over FTP: a File for Every Active Region, Even a Quiet One With Only Its Header, and a Control File With the Count per Region',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'ftp', 'csv', 'empty-file', 'control-file', 'sql-server', 'planning'],
  estMinutes: 30,
  flowChecks: [
    { label: 'The active regions are read before the loop', rule: { type: 'before', first: 'db-select', firstWhere: { sql: 'region' }, then: 'foreach' } },
    { label: 'Each region\'s file is written as .tmp and renamed inside the For Each', rule: { type: 'all', rules: [{ type: 'inside', component: 'ftp-write', within: 'foreach', where: { path: '.tmp' } }, { type: 'inside', component: 'ftp-rename', within: 'foreach' }] } },
    { label: 'The control file is written after every region file', rule: { type: 'before', first: 'ftp-rename', then: 'ftp-write', thenWhere: { path: '.ctl' }, outside: true } },
  ],
  simulation: {
    systems: { db: { tables } },
    tests: [
      {
        name: 'Three regions, one quiet',
        about: 'North and South have transfers. West has none today and still gets a file with the header line. The closed region X gets nothing, and the control file lists W with 0.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          files: {
            [`${out}/TRANSFERS_N_20261113.csv`]: { has: '0207,0211,EGGS-6-FR,12' },
            [`${out}/TRANSFERS_W_20261113.csv`]: { has: 'from_store,to_store,sku,qty' },
            [`${out}/TRANSFERS_X_*`]: { count: 0 },
            [`${out}/*.tmp`]: { count: 0 },
            [`${out}/TRANSFERS_20261113.ctl`]: { has: 'W|0' },
          },
        },
      },
      {
        name: 'Every region is quiet',
        about: 'A bank holiday: no transfers at all. Each active region still gets its header only file, and the control file says 0 for each.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { tables: { ...tables, store_transfer: { rows: [] } } } } },
        expect: { noError: true, files: { [`${out}/TRANSFERS_*_20261113.csv`]: { count: 3 }, [`${out}/TRANSFERS_S_20261113.csv`]: { has: 'from_store' }, [`${out}/TRANSFERS_20261113.ctl`]: { has: 'N|0' } } },
      },
      {
        name: 'The FTP server is down',
        about: 'No region file can be written, so no control file appears and the platform waits.',
        trigger: { schedule: {} },
        overrides: { systems: { files: { fault: true, faultOn: 'ftp' } } },
        expect: { error: 'FTP:CONNECTIVITY', files: { [`${out}/*.ctl`]: { count: 0 } } },
      },
    ],
  },
  referenceFlow: design(
    flow('transfers-out', source('scheduler', { strategy: 'cron', expression: '0 30 23 * * ?' }), [
      step('set-variable', { variableName: 'stamp', value: '#[now() as String {format: "yyyyMMdd"}]' }),
      step('set-variable', { variableName: 'counts', value: '#[[]]' }),
      step('db-select', { database: 'SQL Server', sql: 'SELECT region_code FROM dbo.region WHERE active = 1 ORDER BY region_code' }),
      scope('foreach', { collection: '#[payload]', batchSize: 1 }, [
        step('set-variable', { variableName: 'region', value: '#[payload.region_code]' }),
        step('set-variable', { variableName: 'fileName', value: '#["TRANSFERS_" ++ vars.region ++ "_" ++ vars.stamp ++ ".csv"]' }),
        step('db-select', { database: 'SQL Server', sql: 'SELECT from_store, to_store, sku, qty FROM dbo.store_transfer WHERE region = :region ORDER BY from_store, sku', inputParameters: '#[{ region: vars.region }]' }),
        step('set-variable', { variableName: 'counts', value: '#[vars.counts ++ [vars.region ++ "|" ++ (sizeOf(payload) as String)]]' }),
        step('set-payload', { value: '#[(["from_store,to_store,sku,qty"] ++ (payload map ($.from_store ++ "," ++ $.to_store ++ "," ++ $.sku ++ "," ++ ($.qty as String)))) joinBy "\\n"]' }),
        step('ftp-write', { path: `#["${out}/" ++ vars.fileName ++ ".tmp"]`, mode: 'OVERWRITE' }),
        step('ftp-rename', { path: `#["${out}/" ++ vars.fileName ++ ".tmp"]`, to: '#[vars.fileName]' }),
      ]),
      step('set-payload', { value: '#[vars.counts joinBy "\\n"]' }),
      step('ftp-write', { path: `#["${out}/TRANSFERS_" ++ vars.stamp ++ ".ctl"]`, mode: 'OVERWRITE' }),
    ]),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, sends the day's store to store transfers to the planning platform at 23:30. The platform wants **one file per region** on its **FTP server**, folder \`/inbound/transfers\`, named \`TRANSFERS_<region>_<yyyyMMdd>.csv\`:

\`\`\`
from_store,to_store,sku,qty
0204,0207,MILK-2L-SEMI,24
\`\`\`

The platform's rules:
- Every **active** region must have a file every day. A missing file means "the region's feed is broken" and stops the region's plan. A region with no transfers sends a file with **only the header line**.
- Files ending in \`.tmp\` are ignored.
- The control file \`TRANSFERS_<yyyyMMdd>.ctl\`, written last, lists each region and its row count as \`<region>|<rows>\`.

SQL Server has \`dbo.region\` (\`region_code\`, \`active\`) and \`dbo.store_transfer\` (\`region\`, \`from_store\`, \`to_store\`, \`sku\`, \`qty\`). The first version wrote each region's rows with a CSV Transform. On the first quiet Sunday, West got an empty file with no header, and the platform refused it.

**Requirements**
- Read the active regions from the table; regions change twice a year.
- Write each region's file under a \`.tmp\` name and rename it. A quiet region gets the header line.
- Write the control file after every region file is in place.

**Facts**
- An active region has \`active = 1\`. The date in the names is today's date. In the tests today is 2026-11-13.
- Write each region file as \`<file name>.tmp\`, such as \`TRANSFERS_N_20261113.csv.tmp\`, then **FTP Rename** it to the real name.
- Put each \`<region>|<rows>\` entry of the control file on its own line.
- Do not catch an FTP error. The run fails and no control file is written.

**Design the flow.**
`,
  answerTemplate: `## The regions

## One file per region

## The header for a quiet region

## The control file
`,
  keyPoints: [
    'Drive the loop from the region table. A hard coded list sends nothing for a new region and keeps sending for a closed one.',
    'DataWeave takes the CSV header from the keys of the first row, so an empty list gives an empty file. Build the header line yourself when the platform needs it every time.',
    'Collect region|rows as you go. It is all the control file needs, and it shows a quiet region as 0, which is what the platform expects.',
    'The .tmp and rename keep the platform from reading a half written file. The control file written last tells it the set is complete.',
    'Building the text by hand means you must quote values that can hold a comma. SKUs and store numbers here cannot, but a description column would need it.',
  ],
  solution: `
1. **Scheduler** cron \`0 30 23 * * ?\`. **Set Variable** \`stamp\` and \`counts\` = \`[]\`.
2. **Database Select** the active regions.
3. **For Each** region:
   - **Set Variable** \`region\`, \`fileName\`.
   - **Database Select** the region's transfers.
   - **Set Variable** \`counts\` += \`region|rows\`.
   - **Set Payload** the header line plus one line per row.
   - **FTP Write** \`.tmp\`, **FTP Rename**.
4. **Set Payload** the counts, **FTP Write** the \`.ctl\`.

**Another way to the header.** Some teams write the CSV with a Transform and add the header only when the list is empty. Both work; the hand built text keeps one rule for every case.
`,
  followUps: [
    {
      q: 'A region is closed in the middle of the day. Does tonight\'s run send it?',
      a: 'No: the select reads active = 1 at 23:30. If the platform must get a last file for a region closed today, keep a closed_on date and include regions closed today.',
    },
    {
      q: 'Why not one file with a region column instead?',
      a: 'The platform\'s rule is one file per region, so a broken region can be found and resent on its own. Follow the receiver\'s contract, even when one file would be less work for you.',
    },
  ],
}

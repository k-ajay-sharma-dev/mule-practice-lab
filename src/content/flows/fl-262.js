import { design, flow, scope, source, step } from '../../flow/dsl.js'

const tables = {
  sales_history: {
    rows: [
      { business_date: '2026-11-09', store: '0101', sku: 'TENT-2P-OLV', units: 2 },
      { business_date: '2026-11-09', store: '0102', sku: 'JKT-RAIN-M', units: 5 },
      { business_date: '2026-11-10', store: '0101', sku: 'BOTTLE-1L', units: 11 },
      { business_date: '2026-11-10', store: '0103', sku: 'STOVE-GAS-1B', units: 1 },
      { business_date: '2026-11-11', store: '0102', sku: 'TENT-2P-OLV', units: 3 },
    ],
  },
}

export default {
  id: 'fl-262',
  category: 'flows',
  title: 'A Weekly Sales History in Parts for the Planning Platform: Stream the Rows, Write a Part File per Million Rows Under a Temporary Name, and Write the Control File Last',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'large-files', 'split-files', 'control-file', 'ftp', 'streaming', 'planning'],
  estMinutes: 35,
  flowChecks: [
    { label: 'The history is read with a fetch size, so rows stream from SQL Server', rule: { type: 'exists', component: 'db-select', where: { sql: 'sales_history', fetchSize: { gte: 1 } } } },
    { label: 'A For Each takes the rows in batches of at least 100,000, one part file each', rule: { type: 'exists', component: 'foreach', where: { batchSize: { gte: 100000 } } } },
    { label: 'Each part is written as .tmp and renamed, inside the For Each', rule: { type: 'all', rules: [{ type: 'inside', component: 'ftp-write', within: 'foreach', where: { path: '.tmp' } }, { type: 'inside', component: 'ftp-rename', within: 'foreach' }] } },
    { label: 'The control file is written after every part is renamed', rule: { type: 'before', first: 'ftp-rename', then: 'ftp-write', thenWhere: { path: '.ctl' }, outside: true } },
  ],
  simulation: {
    systems: { db: { tables } },
    tests: [
      {
        name: 'A weekly export',
        about: 'The week fits in one part here. The part is renamed from .tmp, and the control file lists it with its 5 rows and a total.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          files: {
            '/inbound/history/SALES_HIST_*_1.csv': { count: 1, has: 'STOVE-GAS-1B' },
            '/inbound/history/*.tmp': { count: 0 },
            '/inbound/history/SALES_HIST_*.ctl': { count: 1, has: '_1.csv|5' },
          },
        },
      },
      {
        name: 'The FTP server is down',
        about: 'No part can be written, so no control file appears and the platform loads nothing half done.',
        trigger: { schedule: {} },
        overrides: { systems: { files: { fault: true, faultOn: 'ftp' } } },
        expect: { error: 'FTP:CONNECTIVITY', files: { '/inbound/history/*.ctl': { count: 0 } } },
      },
    ],
  },
  referenceFlow: design(
    flow('sales-history-export', source('scheduler', { strategy: 'cron', expression: '0 0 1 ? * MON' }), [
      step('set-variable', { variableName: 'stamp', value: '#[now() as String {format: "yyyyMMdd"}]' }),
      step('set-variable', { variableName: 'parts', value: '#[[]]' }),
      step('db-select', { database: 'SQL Server', sql: 'SELECT business_date, store, sku, units FROM dbo.sales_history ORDER BY business_date, store, sku', fetchSize: 5000 }),
      scope('foreach', { collection: '#[payload]', batchSize: 1000000 }, [
        step('set-variable', { variableName: 'fileName', value: '#["SALES_HIST_" ++ vars.stamp ++ "_" ++ (vars.counter as String) ++ ".csv"]' }),
        step('set-variable', { variableName: 'parts', value: '#[vars.parts ++ [{ name: vars.fileName, rows: sizeOf(payload) }]]' }),
        step('transform', { script: '%dw 2.0\noutput application/csv\n---\npayload' }),
        step('ftp-write', { path: '#["/inbound/history/" ++ vars.fileName ++ ".tmp"]', mode: 'OVERWRITE' }),
        step('ftp-rename', { path: '#["/inbound/history/" ++ vars.fileName ++ ".tmp"]', to: '#[vars.fileName]' }),
      ]),
      step('set-payload', { value: '#[((vars.parts map ($.name ++ "|" ++ ($.rows as String))) ++ ["TOTAL|" ++ (sum(vars.parts map $.rows) as String)]) joinBy "\\n"]' }),
      step('ftp-write', { path: '#["/inbound/history/SALES_HIST_" ++ vars.stamp ++ ".ctl"]', mode: 'OVERWRITE' }),
      step('logger', { level: 'INFO', message: '#["Sales history export: " ++ (sizeOf(vars.parts) as String) ++ " part(s)"]' }),
    ]),
  ),
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, sends the planning platform a weekly sales history every Monday at 01:00: about **20 million rows** from \`dbo.sales_history\` in SQL Server, to the platform's **FTP server**, folder \`/inbound/history\`.

The platform's loading rules:
- No part file may hold more than **1 million rows**.
- Parts are named \`SALES_HIST_<date>_<n>.csv\`. Files ending in \`.tmp\` are ignored.
- Loading starts when the control file \`SALES_HIST_<date>.ctl\` appears. It has one line per part, \`<file name>|<rows>\`, and a last line \`TOTAL|<rows>\`.

The first version read the whole table into a list and split it with DataWeave. It needed 14 GB of heap.

**Requirements**
- Read the rows so they stream from the database, not as one list.
- Write a part file per million rows, under a \`.tmp\` name, then rename it.
- Write the control file only after every part is in place.

**Facts**
- \`<date>\` is the run date as \`yyyyMMdd\`. Parts are numbered from 1.
- A part file has the columns \`business_date\`, \`store\`, \`sku\` and \`units\`.
- If the FTP server fails, let the error end the run. No control file may be written.

**What each system sends back**
- The Database Select streams rows with the columns as named in the query:
\`\`\`json
{ "business_date": "2026-11-10", "store": "0103", "sku": "STOVE-GAS-1B", "units": 1 }
\`\`\`
- Inside a For Each with a batch size, \`payload\` is a list of up to that many rows.

**What failures look like**
- The FTP server is down: the FTP Write raises \`FTP:CONNECTIVITY\`. The run ends with that error and no \`.ctl\` file is written.

**Design the flow.**
`,
  answerTemplate: `## Reading the rows

## One part per million rows

## The control file
`,
  keyPoints: [
    'A Database Select with a fetch size returns a stream: rows arrive from the database in batches as the flow reads them.',
    'For Each with a batch size hands the steps a list of that many records at a time, and works on a stream. Each pass is one part file.',
    'vars.counter numbers the passes, so the part names follow on with no gaps.',
    'The control file is the commit: written last, it tells the platform the set is whole. Without it the platform loads nothing.',
    'Keep a small list of { name, rows } as you go. It is all the control file needs, and it is tiny next to the data.',
  ],
  solution: `
1. **Scheduler** cron \`0 0 1 ? * MON\`. **Set Variable** \`stamp\` and \`parts\` = \`[]\`.
2. **Database Select** with fetch size 5000, ordered.
3. **For Each** (batch size 1,000,000):
   - **Set Variable** \`fileName\` from \`vars.counter\`; add \`{ name, rows: sizeOf(payload) }\` to \`parts\`.
   - **Transform** to CSV. **FTP Write** \`.tmp\`. **FTP Rename**.
4. **Set Payload** the control lines and the total. **FTP Write** the \`.ctl\`.

**Memory.** Each pass holds one part of a million rows while it is written. If that is too much, make the parts smaller or write each part with APPEND in pages, as long as the platform's limit is kept.
`,
  followUps: [
    {
      q: 'The run fails after part 7 of 20. What does the platform see, and how do you rerun?',
      a: 'Seven parts and no control file, so it loads nothing. A rerun writes all 20 again under the same names with OVERWRITE, then the control file. A clean up of parts older than a week removes leftovers.',
    },
    {
      q: 'Why not count all rows first with SELECT COUNT(*) for the total?',
      a: 'It costs a second scan of 20 million rows, and rows can change between the two reads. The sum of the parts is what was really written.',
    },
  ],
}

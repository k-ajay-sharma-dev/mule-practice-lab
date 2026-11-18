import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const rows = [
  { sku: 'HW-1001', store_id: 'ST-04', description: 'Wood screws 4x40, box of 200', on_hand: 3, reorder_level: 10 },
  { sku: 'HW-2040', store_id: 'ST-04', description: 'Masking tape 25 mm', on_hand: 25, reorder_level: 12 },
  { sku: 'HW-3310', store_id: 'ST-07', description: 'Paint roller 230 mm', on_hand: 0, reorder_level: 6 },
  { sku: 'HW-4402', store_id: 'ST-07', description: 'Sandpaper P120, pack of 10', on_hand: 8, reorder_level: 8 },
  { sku: 'HW-5120', store_id: 'ST-09', description: 'Cable ties 200 mm, bag of 100', on_hand: 4, reorder_level: 5 },
]
const table = (list) => ({ db: { tables: { stock_levels: { key: ['sku', 'store_id'], rows: list } } } })

export default {
  id: 'fl-136',
  category: 'flows',
  title: 'Morning Low Stock Report: a Scheduler, One Database Select and a CSV File, and No File on a Day When Nothing Is Low',
  level: 'BEGINNER',
  tags: ['myproject', 'scheduler', 'cron', 'database', 'csv', 'file', 'choice', 'retail'],
  estMinutes: 20,
  flowChecks: [
    { label: 'A Scheduler with a cron expression starts the report', rule: { type: 'source', component: 'scheduler', where: { strategy: 'cron', expression: { set: true } } } },
    { label: 'The low rows are selected from stock_levels by comparing with the reorder level', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['stock_levels', 'reorder_level'] } } } },
    { label: 'A Choice decides whether there is anything to write', rule: { type: 'inside', component: 'file-write', within: 'choice' } },
    { label: 'A Transform turns the rows into CSV before the file is written', rule: { type: 'before', first: 'transform', firstWhere: { script: 'application/csv' }, then: 'file-write' } },
    { label: 'The file goes to the reports folder with the date in its name', rule: { type: 'exists', component: 'file-write', where: { path: { all: ['/reports/', 'low-stock-'] } } } },
  ],
  simulation: {
    systems: table(rows),
    tests: [
      {
        name: 'Three items are low',
        about: 'Three rows are below their reorder level. One CSV file is written with a header and those three rows.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          files: { '/reports/low-stock-*.csv': { count: 1, has: 'HW-1001' } },
        },
      },
      {
        name: 'The report lists every low row',
        about: 'The paint roller at store ST-07 and the cable ties at ST-09 are in the file as well, with their counts.',
        trigger: { schedule: {} },
        expect: { files: { '/reports/low-stock-*.csv': { has: 'HW-3310' } } },
      },
      {
        name: 'A row exactly at its reorder level',
        about: 'The only row left is the sandpaper with 8 on hand and a reorder level of 8. That is not below the level, so no file is written.',
        trigger: { schedule: {} },
        overrides: { systems: table([rows[1], rows[3]]) },
        expect: { noError: true, files: { '/reports/low-stock-*.csv': { count: 0 } } },
      },
      {
        name: 'Nothing is low',
        about: 'Every row is above its reorder level. The run ends cleanly and writes no empty file.',
        trigger: { schedule: {} },
        overrides: { systems: table([rows[1]]) },
        expect: { noError: true, files: { '/reports/low-stock-*.csv': { count: 0 } } },
      },
    ],
  },
  referenceFlow: design(
    flow('low-stock-report', source('scheduler', { strategy: 'cron', expression: '0 0 6 * * ?' }), [
      step('db-select', {
        database: 'PostgreSQL',
        sql: 'SELECT store_id, sku, description, on_hand, reorder_level FROM stock_levels WHERE on_hand < reorder_level ORDER BY store_id, sku',
      }),
      router(
        'choice',
        {},
        [route({ expression: '#[isEmpty(payload)]' }, [step('logger', { level: 'INFO', message: 'No low stock today, so no report file' })])],
        {
          otherwise: [
            step('transform', {
              script:
                '%dw 2.0\noutput application/csv\n---\npayload map { store: $.store_id, sku: $.sku, description: $.description, onHand: $.on_hand, reorderLevel: $.reorder_level }',
            }),
            step('file-write', { path: '#["/reports/low-stock-" ++ (now() as String {format: "yyyy-MM-dd"}) ++ ".csv"]' }),
            step('logger', { level: 'INFO', message: '#["Low stock report written"]' }),
          ],
        },
      ),
    ]),
  ),
  description: `
A hardware store chain wants a **low stock report** on the buyers' shared drive before they start work. Stock is in a PostgreSQL table \`stock_levels\` with the columns \`store_id\`, \`sku\`, \`description\`, \`on_hand\` and \`reorder_level\`.

**Requirements**
- Run every morning at **06:00**.
- Report every row where \`on_hand\` is **below** \`reorder_level\`. A row that is exactly at its level is not low.
- Write one CSV file with a header line, sorted by store, then SKU, to \`/reports/low-stock-<yyyy-MM-dd>.csv\`.
- On a day when nothing is low, write **no file**. The buyers asked for this, because an empty file looks like a failed run.

**Design the flow.**
`,
  answerTemplate: `## When it runs

## Finding the low rows

## Writing the CSV

## A day when nothing is low
`,
  keyPoints: [
    'A Scheduler with a cron expression runs at a time of day. A fixed frequency only says how often, not when.',
    'Let the database find the low rows with WHERE on_hand < reorder_level, instead of reading every row into Mule.',
    'Use < and not <=, so a row exactly at its reorder level is not reported.',
    'A Choice on isEmpty(payload) skips the write. Without it, a quiet day leaves a file with only a header.',
    'Transform Message with output application/csv writes the header from the field names.',
    'Put the date in the file name, so each day keeps its own file and nothing is overwritten.',
  ],
  solution: `
1. **Scheduler**: cron \`0 0 6 * * ?\` (seconds, minutes, hours, day of month, month, day of week).
2. **Database Select**:
   \`\`\`sql
   SELECT store_id, sku, description, on_hand, reorder_level
   FROM stock_levels
   WHERE on_hand < reorder_level
   ORDER BY store_id, sku
   \`\`\`
3. **Choice**:
   - \`#[isEmpty(payload)]\`: **Logger** "No low stock today".
   - Otherwise:
     - **Transform Message**:
       \`\`\`dataweave
       %dw 2.0
       output application/csv
       ---
       payload map { store: $.store_id, sku: $.sku, description: $.description, onHand: $.on_hand, reorderLevel: $.reorder_level }
       \`\`\`
     - **Write** \`#["/reports/low-stock-" ++ (now() as String {format: "yyyy-MM-dd"}) ++ ".csv"]\`.

**Why the database does the filtering.** The table has a row per SKU per store, which can be hundreds of thousands of rows. The database returns only the few that matter.

**Time zone.** A cron Scheduler runs in the server's time zone unless you set one. On CloudHub that is usually UTC, so set the time zone on the Scheduler if 06:00 means local time.
`,
  followUps: [
    {
      q: 'What happens if the server is down at 06:00?',
      a: 'Do not count on the Scheduler to run a time it missed while the app was stopped. If a missed report matters, add a second run later in the morning that writes the file only when today\'s file is not there.',
    },
    {
      q: 'The app runs on two replicas. Could the buyers get two files?',
      a: 'It depends on how the deployment runs schedulers. In an on-premises Mule cluster a Scheduler runs on the primary node only. Elsewhere, check it for your platform, or keep scheduled reports in an app with one replica, or guard the run with a lock.',
    },
    {
      q: 'The buyers now want the file by email as well. Where does that go?',
      a: 'In the otherwise branch after the Write, so an email is sent only when there is a report.',
    },
  ],
}

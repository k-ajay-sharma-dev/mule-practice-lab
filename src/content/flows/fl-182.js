import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const dir = '/mnt/plan-share/plans/in'
const file = `${dir}/REPL_20261113_R0871.csv`
const plan = 'sku,location,need_date,order_qty\nLAMP-OAK-01,DC-NORTH,2026-11-20,24\nRUG-WOOL-160,DC-NORTH,2026-11-21,10\nVASE-GLS-30,DC-SOUTH,2026-11-20,36'
const tables = (log = []) => ({
  repl_plan_staging: { columns: ['file_name', 'sku', 'location', 'need_date', 'order_qty'], rows: [] },
  plan_file_log: { key: 'file_name', rows: log },
})

export default {
  id: 'fl-182',
  category: 'flows',
  title: 'Replenishment Plans Back From the Planning Platform: Load Each File From the Azure File Share Into SQL Server Once, All Rows or None',
  level: 'ADVANCED',
  tags: ['myproject', 'azure-file-share', 'smb', 'plans', 'sql-server', 'transaction', 'idempotency', 'planning'],
  estMinutes: 40,
  flowChecks: [
    { label: 'Plan files are picked up from /mnt/plan-share/plans/in once their size is stable', rule: { type: 'source', component: 'file-listener', where: { directory: dir, timeBetweenSizeCheck: { gte: 1 } } } },
    { label: 'The file log is checked for this file name before loading', rule: { type: 'before', first: 'db-select', firstWhere: { sql: 'plan_file_log' }, then: 'db-bulk-insert' } },
    { label: 'A file already loaded is moved to duplicates and not loaded again', rule: { type: 'inside', component: 'file-move', within: 'choice', where: { targetPath: 'duplicates' } } },
    {
      label: 'The rows and the file log row are written in one transaction',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'db-bulk-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'repl_plan_staging' } },
          { type: 'inside', component: 'db-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'plan_file_log' } },
        ],
      },
    },
    { label: 'The file is moved to processed after the transaction', rule: { type: 'before', first: 'try', then: 'file-move', thenWhere: { targetPath: 'processed' } } },
    { label: 'A failed load moves the file to the error folder', rule: { type: 'inside', component: 'file-move', within: ['on-error-continue', 'on-error-propagate'], where: { targetPath: 'error' } } },
  ],
  simulation: {
    systems: { files: { [file]: plan }, db: { tables: tables() } },
    tests: [
      {
        name: 'A new plan file',
        about: 'All three rows are loaded with the file name, the file is logged as LOADED, and it moves to processed.',
        trigger: { file: { path: file } },
        expect: {
          noError: true,
          db: { repl_plan_staging: { count: 3, has: [{ file_name: 'REPL_20261113_R0871.csv', sku: 'RUG-WOOL-160' }] }, plan_file_log: { count: 1, has: [{ file_name: 'REPL_20261113_R0871.csv', status: 'LOADED' }] } },
          files: { '/mnt/plan-share/plans/processed/REPL_20261113_R0871.csv': { exists: true }, [file]: { exists: false } },
        },
      },
      {
        name: 'The platform sends the same file again',
        about: 'The file log already has this name. No row is loaded twice, and the file goes to duplicates.',
        trigger: { file: { path: file } },
        overrides: { systems: { db: { tables: tables([{ file_name: 'REPL_20261113_R0871.csv', row_count: 3, status: 'LOADED' }]) } } },
        expect: { db: { repl_plan_staging: { count: 0 } }, files: { '/mnt/plan-share/plans/duplicates/*REPL_20261113_R0871*': { count: 1 } } },
      },
      {
        name: 'The file log insert fails',
        about: 'The rows are inserted, then the log insert fails. The transaction rolls back, so no plan rows are left without a log row, and the file goes to the error folder.',
        trigger: { file: { path: file } },
        overrides: { systems: { db: { failWhen: [{ match: 'INSERT INTO plan_file_log', fault: 'QUERY_EXECUTION' }] } } },
        expect: { db: { repl_plan_staging: { count: 0 }, plan_file_log: { count: 0 } }, files: { '/mnt/plan-share/plans/error/*REPL_20261113_R0871*': { count: 1 } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'replenishment-plans-load',
      source('file-listener', { directory: dir, matcher: 'REPL_*.csv', postAction: 'none', timeBetweenSizeCheck: 10000, watermarkMode: 'DISABLED' }),
      [
        step('set-variable', { variableName: 'fileName', value: '#[attributes.fileName]' }),
        step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
        step('set-variable', { variableName: 'rows', value: '#[payload]' }),
        step('db-select', { database: 'SQL Server', sql: 'SELECT file_name, status FROM plan_file_log WHERE file_name = :fileName', inputParameters: '#[{ fileName: vars.fileName }]', target: 'seen' }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[not isEmpty(vars.seen)]' }, [
              step('logger', { level: 'WARN', message: '#[vars.fileName ++ " was loaded before, moved to duplicates"]' }),
              step('file-move', { sourcePath: '#[vars.filePath]', targetPath: '/mnt/plan-share/plans/duplicates', renameTo: '#[(now() as String {format: "yyyyMMddHHmmss"}) ++ "-" ++ vars.fileName]' }),
            ]),
          ],
          {
            otherwise: [
              scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
                step('transform', {
                  script: '%dw 2.0\noutput application/java\n---\nvars.rows map ((r) -> { file_name: vars.fileName, sku: r.sku, location: r.location, need_date: r.need_date, order_qty: r.order_qty as Number })',
                }),
                step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO repl_plan_staging (file_name, sku, location, need_date, order_qty) VALUES (:file_name, :sku, :location, :need_date, :order_qty)' }),
                step('db-insert', {
                  database: 'SQL Server',
                  sql: "INSERT INTO plan_file_log (file_name, row_count, status) VALUES (:fileName, :rowCount, 'LOADED')",
                  inputParameters: '#[{ fileName: vars.fileName, rowCount: sizeOf(vars.rows) }]',
                }),
              ]),
              step('file-move', { sourcePath: '#[vars.filePath]', targetPath: '/mnt/plan-share/plans/processed' }),
            ],
          },
        ),
      ],
      [
        handler('on-error-continue', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Plan file " ++ vars.fileName ++ " failed: " ++ error.description]' }),
          step('file-move', { sourcePath: '#[vars.filePath]', targetPath: '/mnt/plan-share/plans/error', renameTo: '#[(now() as String {format: "yyyyMMddHHmmss"}) ++ "-" ++ vars.fileName]' }),
        ]),
      ],
    ),
  ),
  description: `
Marrow & Pine Home, a fictional homewares retailer, gets replenishment plans back from the planning platform: what to order, for which location, and by when. The platform writes each plan run as a CSV to an **Azure File Share**. On the integration host the share is mounted over SMB at \`/mnt/plan-share\`, and new files land in \`plans/in\`:

\`\`\`
sku,location,need_date,order_qty
LAMP-OAK-01,DC-NORTH,2026-11-20,24
\`\`\`

File names carry the run: \`REPL_20261113_R0871.csv\`. The ordering system reads the SQL Server table \`repl_plan_staging\` (\`file_name\`, \`sku\`, \`location\`, \`need_date\`, \`order_qty\`). The table \`plan_file_log\` (\`file_name\` primary key, \`row_count\`, \`status\`) records each file loaded.

What went wrong before:
- The platform resent a run after a network error on its side, and the orders were raised twice.
- A load failed half way, and the ordering system raised orders from half a plan.

**Requirements**
- Read each \`REPL_*.csv\` once its size has stopped changing.
- A file name already in \`plan_file_log\` goes to \`/mnt/plan-share/plans/duplicates\` and is not loaded.
- Load all of a file's rows, and its log row with status \`LOADED\`, or none of them.
- Move a loaded file to \`processed\`. A file that fails goes to \`error\`, with a timestamp in front of its name.

**Facts**
- The listener reads a \`.csv\` file as CSV, so the payload is a list of rows without the header.
- Each staging row carries the file's name in \`file_name\`. The log row's \`row_count\` is the number of data rows.
- A file keeps its name when moved to \`processed\`. A timestamp in front of the name is fine in \`duplicates\` too.

**What each system sends back**
- The listener puts the file's name in \`attributes.fileName\` and its full path in \`attributes.path\`.
- The Database Select on \`plan_file_log\` gives a list of rows: \`[ { "file_name": "REPL_20261113_R0871.csv", "status": "LOADED" } ]\` for a file seen before, and an empty list \`[]\` for a new one.

**What failures look like**
- A failed insert, for example on \`plan_file_log\`, raises **DB:QUERY_EXECUTION**. The transaction rolls back the plan rows already inserted, and the file goes to \`error\`. The run ends without an error.

**Design the flow.**
`,
  answerTemplate: `## Picking up the file

## Spotting a repeat

## All rows or none

## Folders after the load
`,
  keyPoints: [
    'The file name is the run\'s identity here, so the log table keyed on it stops a repeat. Ask the platform team whether a rerun keeps the name; if it does not, use a run ID from inside the file.',
    'The bulk insert and the log insert share one transaction. If either fails, both roll back, and the ordering system never sees half a plan.',
    'The primary key on plan_file_log is a second guard. Two copies loaded at the same moment would both pass the select, but only one log insert can succeed.',
    'Move the file only after the commit. A file in processed then always means its rows are in the table.',
    'A timestamp in front of the name in duplicates and error keeps two copies of the same file from clashing.',
  ],
  solution: `
1. **File On New or Updated File** on \`/mnt/plan-share/plans/in\`, \`REPL_*.csv\`, size check wait 10 seconds.
2. **Set Variable** \`fileName\`, \`filePath\` and \`rows\`.
3. **Database Select** from \`plan_file_log\` by file name, into \`vars.seen\`.
4. **Choice**:
   - Seen: WARN, **File Move** to \`duplicates\` with a timestamp prefix.
   - Otherwise: **Try** with **ALWAYS_BEGIN**: **Transform** the rows with \`file_name\`, **Bulk Insert** into \`repl_plan_staging\`, **Insert** into \`plan_file_log\` with status \`LOADED\`. Then **File Move** to \`processed\`.
5. Flow **On Error Continue** (ANY): ERROR log, **File Move** to \`error\` with a timestamp prefix.

**Why the handler is outside the Try.** The Try has no handler, so an error rolls back its transaction and then reaches the flow handler, which deals with the file.

**Big plans.** A plan for every store can have millions of rows. Then load in a Batch Job and mark the log row LOADED in On Complete, and keep the ordering system away from rows until it is.
`,
  followUps: [
    {
      q: 'The platform corrects a plan by sending a new run for the same week. How do you handle it?',
      a: 'It has a new run ID, so it loads. The ordering system must know which run is current: keep a "current run" per week, and switch it in the same transaction as the load.',
    },
    {
      q: 'Why not use the listener\'s own move to processed?',
      a: 'The listener\'s post action does not know whether the load committed, and by default it can also run after a failure. Moves in the flow follow the outcome.',
    },
  ],
}

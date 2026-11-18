import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const name = 'ALLOC_20261113_R3301.csv'
const file = `/plan/out/alloc/${name}`
const mixed = 'alloc_line,store,sku,qty\n1,0101,TENT-2P-OLV,4\n2,0199,TENT-2P-OLV,6\n3,0102,JKT-RAIN-M,0\n4,0103,JKT-RAIN-M,8'
const clean = 'alloc_line,store,sku,qty\n1,0101,TENT-2P-OLV,4\n4,0103,JKT-RAIN-M,8'
const tables = {
  stores: { key: 'store', rows: [{ store: '0101', is_open: 1 }, { store: '0102', is_open: 1 }, { store: '0103', is_open: 1 }, { store: '0150', is_open: 0 }] },
  alloc_staging: { columns: ['file_name', 'alloc_line', 'store', 'sku', 'qty'], rows: [] },
  alloc_rejects: { columns: ['file_name', 'alloc_line', 'reason'], rows: [] },
}
const rejectFile = `/plan/in/rejects/${name.replace('.csv', '.rej.csv')}`

export default {
  id: 'fl-206',
  category: 'flows',
  title: 'Allocation Plans Back From the Planning Platform Over FTP: Good Lines to Staging, Bad Lines to a Reject Table, a Reject File for the Planners, and Archive or Error Folders',
  level: 'ADVANCED',
  tags: ['myproject', 'ftp', 'plans', 'reject-table', 'staging', 'transaction', 'sql-server', 'planning'],
  estMinutes: 45,
  flowChecks: [
    { label: 'Allocation files are picked up from /plan/out/alloc once their size is stable', rule: { type: 'source', component: 'ftp-listener', where: { directory: '/plan/out/alloc', timeBetweenSizeCheck: { gte: 1 } } } },
    { label: 'Open stores are read once per file', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['stores', 'open'] } } } },
    {
      label: 'Good lines and reject rows are written in one transaction',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'db-bulk-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'alloc_staging' } },
          { type: 'inside', component: 'db-bulk-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'alloc_rejects' } },
        ],
      },
    },
    { label: 'The reject file is written to /plan/in/rejects only when there are rejects', rule: { type: 'inside', component: 'ftp-write', within: 'choice', where: { path: '/plan/in/rejects/' } } },
    { label: 'The file is archived after the commit', rule: { type: 'before', first: 'try', then: 'ftp-move', thenWhere: { targetPath: '/plan/out/alloc/archive' }, outside: true } },
    { label: 'A file that fails goes to /plan/out/alloc/error', rule: { type: 'inside', component: 'ftp-move', within: ['on-error-propagate', 'on-error-continue'], where: { targetPath: '/plan/out/alloc/error' } } },
  ],
  simulation: {
    systems: { files: { [file]: mixed }, db: { tables } },
    tests: [
      {
        name: 'Good and bad lines',
        about: 'Lines 1 and 4 reach staging. Line 2 names an unknown store and line 3 has a zero quantity: both go to the reject table and to a reject file the planners read. The file is archived.',
        trigger: { file: { path: file } },
        expect: {
          db: {
            alloc_staging: { count: 2, has: [{ alloc_line: '4', store: '0103', qty: 8, file_name: name }] },
            alloc_rejects: { count: 2, has: [{ alloc_line: '2', reason: 'UNKNOWN_STORE' }, { alloc_line: '3', reason: 'QTY_NOT_POSITIVE' }] },
          },
          files: { [rejectFile]: { exists: true, has: 'UNKNOWN_STORE' }, [`/plan/out/alloc/archive/${name}`]: { exists: true } },
        },
      },
      {
        name: 'Every line is good',
        about: 'Nothing is rejected, so no reject file appears. An empty reject file would make the planners look for nothing.',
        trigger: { file: { path: file } },
        overrides: { systems: { files: { [file]: clean } } },
        expect: { noError: true, db: { alloc_staging: { count: 2 }, alloc_rejects: { count: 0 } }, files: { [rejectFile]: { exists: false } } },
      },
      {
        name: 'The reject insert fails',
        about: 'The staging rows are rolled back with the rejects, so staging never holds a file that was half processed. The file goes to the error folder.',
        trigger: { file: { path: file } },
        overrides: { systems: { db: { failWhen: [{ match: 'INSERT INTO dbo.alloc_rejects', fault: 'QUERY_EXECUTION' }] } } },
        expect: { db: { alloc_staging: { count: 0 } }, files: { [`/plan/out/alloc/error/${name}`]: { exists: true }, [rejectFile]: { exists: false } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'allocations-from-planning',
      source('ftp-listener', { directory: '/plan/out/alloc', matcher: 'ALLOC_*.csv', postAction: 'none', timeBetweenSizeCheck: 15000 }),
      [
        step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
        step('set-variable', { variableName: 'fileName', value: '#[attributes.fileName]' }),
        step('set-variable', { variableName: 'rows', value: '#[payload]' }),
        step('db-select', { database: 'SQL Server', sql: 'SELECT store FROM dbo.stores WHERE is_open = 1', target: 'stores' }),
        step('transform', {
          target: 'variable',
          variableName: 'checked',
          script:
            '%dw 2.0\noutput application/java\nvar openStores = vars.stores map $.store\n---\nvars.rows map ((r) -> {\n  file_name: vars.fileName,\n  alloc_line: r.alloc_line,\n  store: r.store,\n  sku: r.sku,\n  qty: r.qty as Number,\n  reason: if (not (openStores contains r.store)) "UNKNOWN_STORE" else if ((r.qty as Number) <= 0) "QTY_NOT_POSITIVE" else ""\n})',
        }),
        step('set-variable', { variableName: 'good', value: '#[vars.checked filter ($.reason == "") map ($ - "reason")]' }),
        step('set-variable', { variableName: 'bad', value: '#[vars.checked filter ($.reason != "") map { file_name: $.file_name, alloc_line: $.alloc_line, reason: $.reason }]' }),
        scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
          router('choice', {}, [
            route({ expression: '#[not isEmpty(vars.good)]' }, [
              step('set-payload', { value: '#[vars.good]' }),
              step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.alloc_staging (file_name, alloc_line, store, sku, qty) VALUES (:file_name, :alloc_line, :store, :sku, :qty)' }),
            ]),
          ]),
          router('choice', {}, [
            route({ expression: '#[not isEmpty(vars.bad)]' }, [
              step('set-payload', { value: '#[vars.bad]' }),
              step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.alloc_rejects (file_name, alloc_line, reason) VALUES (:file_name, :alloc_line, :reason)' }),
            ]),
          ]),
        ]),
        router('choice', {}, [
          route({ expression: '#[not isEmpty(vars.bad)]' }, [
            step('transform', { script: '%dw 2.0\noutput application/csv\n---\nvars.bad map ((b) -> { alloc_line: b.alloc_line, reason: b.reason })' }),
            step('ftp-write', { path: '#["/plan/in/rejects/" ++ (vars.fileName replace ".csv" with ".rej.csv")]', mode: 'OVERWRITE' }),
          ]),
        ]),
        step('ftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/plan/out/alloc/archive', overwrite: 'true' }),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Allocation file " ++ (vars.fileName default "?") ++ " failed: " ++ error.description]' }),
          step('ftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/plan/out/alloc/error', overwrite: 'true' }),
        ]),
      ],
    ),
  ),
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, gets store allocations from the planning platform after each run. The platform writes \`ALLOC_<date>_<run>.csv\` to its **FTP server**, folder \`/plan/out/alloc\`:

\`\`\`
alloc_line,store,sku,qty
1,0101,TENT-2P-OLV,4
\`\`\`

The ERP reads good lines from the SQL Server table \`dbo.alloc_staging\` (\`file_name\`, \`alloc_line\`, \`store\`, \`sku\`, \`qty\`). Support reads bad lines from \`dbo.alloc_rejects\` (\`file_name\`, \`alloc_line\`, \`reason\`). Open stores are in \`dbo.stores\` (\`store\`, \`is_open\`).

The planners do not have database access. They want a reject file in \`/plan/in/rejects\` on the same server, named like the plan with \`.rej.csv\`, listing each rejected line and why.

**Requirements**
- Pick up each file once its upload has finished.
- Reject a line for a store that is not open (\`UNKNOWN_STORE\`) or a quantity not above zero (\`QTY_NOT_POSITIVE\`). The other lines go on.
- Write staging rows and reject rows in one transaction.
- Write a reject file only when there are rejects.
- Archive the file to \`/plan/out/alloc/archive\`. If anything fails, move it to \`/plan/out/alloc/error\`.

**Design the flow.**
`,
  answerTemplate: `## Checking each line

## Staging and rejects together

## The reject file

## Archive and error folders
`,
  keyPoints: [
    'Split good and bad lines once, in DataWeave, with the reason on each bad line. The checks need the open stores, read once per file.',
    'Staging and rejects commit together. Support then sees every line of a file in one place or the other, never only half.',
    'A bulk insert with an empty list is skipped with a Choice. Some drivers refuse an empty batch.',
    'The reject file is written after the commit, so it never lists rejects that were rolled back.',
    'A reject table is for support; a reject file is for the people who can fix the plan. Both carry the line number.',
  ],
  solution: `
1. **FTP On New or Updated File** on \`/plan/out/alloc\`, \`ALLOC_*.csv\`, size check wait 15 seconds.
2. **Set Variable** \`filePath\`, \`fileName\`, \`rows\`. **Database Select** open stores into \`vars.stores\`.
3. **Transform** into \`vars.checked\` with a reason per line. **Set Variable** \`good\` and \`bad\`.
4. **Try** ALWAYS_BEGIN: a **Choice** for each list, each with a **Bulk Insert**.
5. **Choice** \`bad\` not empty: **Transform** to CSV, **FTP Write** \`/plan/in/rejects/<name>.rej.csv\`.
6. **FTP Move** to \`/plan/out/alloc/archive\`.
7. Flow **On Error Propagate**: log, **FTP Move** to \`/plan/out/alloc/error\`.

**Duplicate files.** A resent plan loads twice. Add a processed files table, or key staging on file name and line.
`,
  followUps: [
    {
      q: 'The reject file write fails after the commit. What happens?',
      a: 'The handler moves the plan file to error although its lines are in staging. Make the reject file its own step with a Try, or rebuild it later from the reject table, so a file already loaded is archived.',
    },
    {
      q: 'Why not reject the whole file for one bad line?',
      a: 'One unknown store would hold up hundreds of good allocations. Line level rejects let stores get stock while planners fix the one line.',
    },
  ],
}

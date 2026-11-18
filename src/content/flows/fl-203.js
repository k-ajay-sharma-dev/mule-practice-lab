import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

const data = '/plan/out/FCST_2026W47.csv'
const ok = '/plan/out/FCST_2026W47.ok'
const csv = 'forecast_week,store,sku,units\n2026W47,0101,TENT-2P-OLV,14\n2026W47,0101,JKT-RAIN-M,22\n2026W47,0102,TENT-2P-OLV,9'
const old = [
  { forecast_week: '2026W47', store: '0101', sku: 'TENT-2P-OLV', units: 11 },
  { forecast_week: '2026W46', store: '0101', sku: 'TENT-2P-OLV', units: 12 },
]
const tables = { forecast: { columns: ['forecast_week', 'store', 'sku', 'units'], rows: old } }

export default {
  id: 'fl-203',
  category: 'flows',
  title: 'Weekly Forecasts From the Planning Platform\'s FTP Server With a Control File: Wait for the Marker, Read the Data File, and Archive Both',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'ftp', 'control-file', 'plans', 'transaction', 'sql-server', 'planning'],
  estMinutes: 30,
  flowChecks: [
    { label: 'The listener watches /plan/out for .ok marker files', rule: { type: 'source', component: 'ftp-listener', where: { directory: '/plan/out', matcher: '.ok' } } },
    { label: 'The data file named after the marker is read with FTP Read', rule: { type: 'exists', component: 'ftp-read', where: { path: 'vars.' } } },
    {
      label: 'The week\'s old rows are replaced in one transaction',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'db-delete', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'forecast' } },
          { type: 'inside', component: 'db-bulk-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'forecast' } },
        ],
      },
    },
    { label: 'The marker is archived after the data file', rule: { type: 'before', first: 'ftp-move', firstWhere: { sourcePath: 'dataPath' }, then: 'ftp-move', thenWhere: { sourcePath: 'okPath' }, outside: true } },
    { label: 'Only a missing data file sends the marker to /plan/out/error', rule: { type: 'inside', component: 'ftp-move', within: 'on-error-continue', withinWhere: { type: { is: 'FTP:ILLEGAL_PATH' } }, where: { targetPath: '/plan/out/error' } } },
  ],
  simulation: {
    systems: { files: { [data]: csv, [ok]: '3' }, db: { tables } },
    tests: [
      {
        name: 'A forecast and its marker',
        about: 'The marker arrives after the data file. Week 47 is replaced by the three new rows, week 46 stays, and both files go to the archive folder.',
        trigger: { file: { path: ok } },
        expect: {
          noError: true,
          db: { forecast: { count: 4, has: [{ forecast_week: '2026W47', sku: 'JKT-RAIN-M', units: 22 }, { forecast_week: '2026W46', units: 12 }], lacks: [{ forecast_week: '2026W47', units: 11 }] } },
          files: { '/plan/out/archive/FCST_2026W47.csv': { exists: true }, '/plan/out/archive/FCST_2026W47.ok': { exists: true } },
        },
      },
      {
        name: 'A marker with no data file',
        about: 'The platform wrote the marker but the data file never arrived. The marker goes to the error folder so it is not read on every poll. Nothing changes in the forecast.',
        trigger: { file: { path: ok } },
        overrides: { systems: { files: { [data]: null } } },
        expect: { db: { forecast: { count: 2 } }, files: { '/plan/out/error/FCST_2026W47.ok': { exists: true }, [ok]: { exists: false } } },
      },
      {
        name: 'SQL Server is down',
        about: 'The load cannot run. Both files stay in /plan/out, so the next poll tries again once the database is back.',
        trigger: { file: { path: ok } },
        overrides: { systems: { db: { fault: 'CONNECTIVITY' } } },
        expect: { error: 'DB:CONNECTIVITY', files: { [data]: { exists: true }, [ok]: { exists: true } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'forecast-marker-in',
      source('ftp-listener', { directory: '/plan/out', matcher: 'FCST_*.ok', postAction: 'none', timeBetweenSizeCheck: 0 }),
      [
        step('set-variable', { variableName: 'okPath', value: '#[attributes.path]' }),
        step('set-variable', { variableName: 'dataPath', value: '#[attributes.path replace ".ok" with ".csv"]' }),
        step('ftp-read', { path: '#[vars.dataPath]', outputMimeType: 'application/csv' }),
        step('transform', { script: '%dw 2.0\noutput application/java\n---\npayload map ((r) -> { forecast_week: r.forecast_week, store: r.store, sku: r.sku, units: r.units as Number })' }),
        step('set-variable', { variableName: 'week', value: '#[payload[0].forecast_week]' }),
        scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
          step('db-delete', { database: 'SQL Server', sql: 'DELETE FROM dbo.forecast WHERE forecast_week = :week', inputParameters: '#[{ week: vars.week }]', target: 'deleted' }),
          step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.forecast (forecast_week, store, sku, units) VALUES (:forecast_week, :store, :sku, :units)' }),
        ]),
        step('ftp-move', { sourcePath: '#[vars.dataPath]', targetPath: '/plan/out/archive', overwrite: 'true' }),
        step('ftp-move', { sourcePath: '#[vars.okPath]', targetPath: '/plan/out/archive', overwrite: 'true' }),
      ],
      [
        handler('on-error-continue', { type: 'FTP:ILLEGAL_PATH' }, [
          step('logger', { level: 'ERROR', message: '#["Marker " ++ vars.okPath ++ " has no data file"]' }),
          step('ftp-move', { sourcePath: '#[vars.okPath]', targetPath: '/plan/out/error', overwrite: 'true' }),
        ]),
      ],
    ),
  ),
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, gets a store and item forecast from the planning platform each week. The platform puts two files on its **FTP server**, folder \`/plan/out\`:

1. The data file \`FCST_<week>.csv\`, which can take minutes to write.
2. Then a small marker \`FCST_<week>.ok\`, which holds the row count.

The platform's rule: a data file is complete only once its \`.ok\` file exists. The forecast goes to the SQL Server table \`dbo.forecast\` (\`forecast_week\`, \`store\`, \`sku\`, \`units\`), and a new forecast for a week replaces the old one.

**Requirements**
- Start from the marker, not the data file.
- Replace the week's rows so the ordering system never sees the week empty or half loaded.
- Archive the data file, then the marker, to \`/plan/out/archive\`.
- A marker whose data file is missing goes to \`/plan/out/error\`.
- Any other failure leaves both files where they are for the next poll.

**Design the flow.**
`,
  answerTemplate: `## Starting from the marker

## Reading the data file

## Replacing the week

## Archiving, and when things go wrong
`,
  keyPoints: [
    'The marker is the "done" signal, so the listener watches *.ok. No size check is needed on a file the writer creates last.',
    'FTP Read fetches the data file by a name worked out from the marker\'s path.',
    'Delete and insert in one transaction: readers see the old week or the new week, never an empty one.',
    'Archive the data file first and the marker last. If the flow stops in between, the marker is still there and the next poll finishes the job.',
    'Only FTP:ILLEGAL_PATH is handled. A database outage is not the file\'s fault, so the files stay for a retry.',
  ],
  solution: `
1. **FTP On New or Updated File** on \`/plan/out\`, matcher \`FCST_*.ok\`, after reading: none.
2. **Set Variable** \`okPath\`, and \`dataPath\` (the same path with \`.csv\`).
3. **FTP Read** \`vars.dataPath\` as CSV.
4. **Transform** the rows with \`units as Number\`; **Set Variable** \`week\`.
5. **Try** ALWAYS_BEGIN: **Delete** the week from \`dbo.forecast\` (target variable), **Bulk Insert** the new rows.
6. **FTP Move** the data file, then the marker, to \`/plan/out/archive\`.
7. **On Error Continue** for \`FTP:ILLEGAL_PATH\`: log, move the marker to \`/plan/out/error\`.

**Using the count.** The marker holds the row count. Compare it with \`sizeOf(payload)\` before the Try and treat a mismatch like a missing file.
`,
  followUps: [
    {
      q: 'The platform sometimes writes the marker a few seconds before the data file finishes. What now?',
      a: 'Then the marker is not a real "done" signal. Compare the row count in the marker with the rows read, and if they differ, leave both files for the next poll instead of loading.',
    },
    {
      q: 'Why not add a size check on the listener anyway?',
      a: 'It does no harm, but it checks the marker, not the data file. The data file\'s completeness comes from the order the platform writes them in.',
    },
  ],
}

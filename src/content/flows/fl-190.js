import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

const file = '/outbound/forecast/FCST_2026W47_R1204.csv'
const csv = 'forecast_week,store,sku,units\n2026W47,0412,4410021,118\n2026W47,0412,4410187,40\n2026W47,0415,4410021,96'
const oldRows = [
  { forecast_week: '2026W47', store: '0412', sku: '4410021', units: 101, run_id: 'R1190' },
  { forecast_week: '2026W47', store: '0415', sku: '4410021', units: 90, run_id: 'R1190' },
  { forecast_week: '2026W46', store: '0412', sku: '4410021', units: 99, run_id: 'R1175' },
]
const tables = { forecast_staging: { columns: ['forecast_week', 'store', 'sku', 'units', 'run_id'], rows: oldRows } }

export default {
  id: 'fl-190',
  category: 'flows',
  title: 'Weekly Forecasts Back From the Planning Platform Over SFTP: Replace the Week\'s Rows in One Transaction, and Archive With a Timestamp',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'sftp', 'sftp-listener', 'plans', 'transaction', 'archive', 'planning'],
  estMinutes: 30,
  flowChecks: [
    { label: 'Forecast files are picked up from /outbound/forecast once their size is stable', rule: { type: 'source', component: 'sftp-listener', where: { directory: '/outbound/forecast', timeBetweenSizeCheck: { gte: 1 } } } },
    {
      label: 'The week\'s old rows are deleted and the new rows inserted in one transaction',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'db-delete', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'forecast_staging' } },
          { type: 'inside', component: 'db-bulk-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'forecast_staging' } },
        ],
      },
    },
    { label: 'The delete comes before the insert', rule: { type: 'before', first: 'db-delete', then: 'db-bulk-insert' } },
    { label: 'The file is archived after the load', rule: { type: 'before', first: 'db-bulk-insert', then: 'sftp-move', thenWhere: { targetPath: 'archive' }, outside: true } },
    { label: 'A failed load moves the file to the error folder', rule: { type: 'inside', component: 'sftp-move', within: ['on-error-continue', 'on-error-propagate'], where: { targetPath: 'error' } } },
  ],
  simulation: {
    systems: { files: { [file]: csv }, db: { tables } },
    tests: [
      {
        name: 'A new forecast for week 47',
        about: 'The two old rows for week 47 are replaced by the three new ones. Week 46 is untouched. The file is archived under a timestamped name.',
        trigger: { file: { path: file } },
        expect: {
          noError: true,
          db: { forecast_staging: { count: 4, has: [{ forecast_week: '2026W47', sku: '4410187', run_id: 'R1204' }, { forecast_week: '2026W46', run_id: 'R1175' }], lacks: [{ run_id: 'R1190' }] } },
          files: { '/outbound/forecast/archive/*FCST_2026W47_R1204.csv': { count: 1 }, [file]: { exists: false } },
        },
      },
      {
        name: 'The insert fails',
        about: 'The new rows cannot be inserted. The delete is rolled back, so planners still see the previous forecast, not an empty week. The file goes to the error folder.',
        trigger: { file: { path: file } },
        overrides: { systems: { db: { failWhen: [{ match: 'INSERT INTO forecast_staging', fault: 'QUERY_EXECUTION' }] } } },
        expect: { db: { forecast_staging: { count: 3, has: [{ run_id: 'R1190', store: '0415' }] } }, files: { '/outbound/forecast/error/*FCST_2026W47_R1204.csv': { count: 1 } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'forecasts-from-planning',
      source('sftp-listener', { directory: '/outbound/forecast', matcher: 'FCST_*.csv', postAction: 'none', timeBetweenSizeCheck: 10000 }),
      [
        step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
        step('set-variable', { variableName: 'fileName', value: '#[attributes.fileName]' }),
        step('set-variable', { variableName: 'runId', value: '#[(attributes.fileName splitBy "_")[2] replace ".csv" with ""]' }),
        step('set-variable', { variableName: 'stampedName', value: '#[(now() as String {format: "yyyyMMddHHmmss"}) ++ "_" ++ attributes.fileName]' }),
        step('set-variable', { variableName: 'week', value: '#[payload[0].forecast_week]' }),
        step('transform', {
          script: '%dw 2.0\noutput application/java\n---\npayload map ((r) -> { forecast_week: r.forecast_week, store: r.store, sku: r.sku, units: r.units as Number, run_id: vars.runId })',
        }),
        scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
          step('db-delete', { database: 'Oracle', sql: 'DELETE FROM forecast_staging WHERE forecast_week = :week', inputParameters: '#[{ week: vars.week }]', target: 'deleted' }),
          step('db-bulk-insert', { database: 'Oracle', sql: 'INSERT INTO forecast_staging (forecast_week, store, sku, units, run_id) VALUES (:forecast_week, :store, :sku, :units, :run_id)' }),
        ]),
        step('sftp-rename', { path: '#[vars.filePath]', to: '#[vars.stampedName]' }),
        step('sftp-move', { sourcePath: '#["/outbound/forecast/" ++ vars.stampedName]', targetPath: '/outbound/forecast/archive' }),
      ],
      [
        handler('on-error-continue', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Forecast " ++ vars.fileName ++ " not loaded: " ++ error.description]' }),
          step('sftp-rename', { path: '#[vars.filePath]', to: '#[vars.stampedName]' }),
          step('sftp-move', { sourcePath: '#["/outbound/forecast/" ++ vars.stampedName]', targetPath: '/outbound/forecast/error' }),
        ]),
      ],
    ),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, gets a store and item forecast back from the planning platform each week. The platform puts it on Larkfield's **SFTP server** in \`/outbound/forecast\`, named \`FCST_<week>_<run>.csv\`:

\`\`\`
forecast_week,store,sku,units
2026W47,0412,4410021,118
\`\`\`

The store ordering system reads the Oracle table \`forecast_staging\` (\`forecast_week\`, \`store\`, \`sku\`, \`units\`, \`run_id\`). A new run for a week **replaces** the earlier one: planners re-run a week when a promotion changes.

The files are large and the platform uploads them slowly. \`archive\` and \`error\` folders exist under \`/outbound/forecast\`.

**Requirements**
- Pick up each forecast file once the upload has finished.
- Replace the week's rows with the new ones, tagged with the run ID from the file name. Planners must never see the week empty or half loaded.
- Archive the file with a timestamp in front of its name.
- If the load fails, keep the old rows, and move the file to \`error\` with a timestamp.

**Design the flow.**
`,
  answerTemplate: `## Waiting for the upload

## Replacing a week

## Archiving

## When the load fails
`,
  keyPoints: [
    'A replace is a delete and an insert. In one transaction, readers see the old rows or the new rows, never an empty week.',
    'If the insert fails, the rollback undoes the delete as well. That is the whole reason for the transaction.',
    'Tag rows with the run ID, so support can tell which run the ordering system used.',
    'A timestamp in the archived name keeps two runs of the same week apart, and shows when each was loaded.',
    'The size check wait matters with slow uploads of big files. Without it, the listener can read a forecast that is still arriving.',
  ],
  solution: `
1. **SFTP On New or Updated File** on \`/outbound/forecast\`, \`FCST_*.csv\`, size check wait 10 seconds.
2. **Set Variable** \`filePath\`, \`fileName\`, \`runId\` and \`week\`.
3. **Transform** the rows, with \`run_id\`.
4. **Try** with **ALWAYS_BEGIN**: **Database Delete** the week, **Database Bulk Insert** the new rows.
5. **SFTP Rename** to \`<timestamp>_<file name>\` (worked out once, into \`stampedName\`), then **SFTP Move** to \`archive\`.
6. Flow **On Error Continue** (ANY): ERROR log, **SFTP Rename** to \`stampedName\`, **SFTP Move** to \`error\`.

**Large weeks.** Deleting and inserting a million rows in one transaction holds locks and undo space for a while. Load into a fresh table and switch a view or a "current run" pointer instead, so the swap is instant.

**An older run arriving late.** Compare run IDs before replacing: if the file's run is older than the one loaded, set it aside instead.
`,
  followUps: [
    {
      q: 'Why keep the week in a variable instead of reading it from each row?',
      a: 'The delete needs one value before the insert. The file holds one week by agreement; a check that every row has the same week is a good guard.',
    },
    {
      q: 'Where would you check the file is complete, beyond the size check?',
      a: 'Ask the platform for a trailer or control file with a row count, and compare it before the transaction starts.',
    },
  ],
}

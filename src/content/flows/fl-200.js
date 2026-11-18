import { design, flow, handler, source, step } from '../../flow/dsl.js'

const file = '/stockcount/in/COUNT_0412_20261113.csv'
const good = 'store,sku,counted_qty,count_date\n0412,4410021,118,2026-11-13\n0412,4410187,40,2026-11-13\n0412,4410300,0,2026-11-13'
const bad = 'store,sku,counted_qty,count_date\n0412,4410021,118,2026-11-13\n0412,4410187,forty,2026-11-13'
const tables = { stock_count_staging: { columns: ['file_name', 'store', 'sku', 'counted_qty', 'count_date'], rows: [] } }

export default {
  id: 'fl-200',
  category: 'flows',
  title: 'Store Stock Count Files From an FTP Server Into SQL Server: Wait for the Upload, Then Archive or Park the File',
  level: 'BEGINNER',
  tags: ['myproject', 'ftp', 'ftp-listener', 'sql-server', 'bulk-insert', 'archive', 'error-folder'],
  estMinutes: 20,
  flowChecks: [
    { label: 'Count files are picked up from /stockcount/in once their size is stable', rule: { type: 'source', component: 'ftp-listener', where: { directory: '/stockcount/in', timeBetweenSizeCheck: { gte: 1 } } } },
    { label: 'The rows are bulk inserted into dbo.stock_count_staging', rule: { type: 'exists', component: 'db-bulk-insert', where: { sql: 'stock_count_staging', database: 'SQL Server' } } },
    { label: 'The file is moved to /stockcount/archive after the load', rule: { type: 'before', first: 'db-bulk-insert', then: 'ftp-move', thenWhere: { targetPath: '/stockcount/archive' }, outside: true } },
    { label: 'A file that fails is moved to /stockcount/error', rule: { type: 'inside', component: 'ftp-move', within: ['on-error-continue', 'on-error-propagate'], where: { targetPath: '/stockcount/error' } } },
  ],
  simulation: {
    systems: { files: { [file]: good }, db: { tables } },
    tests: [
      {
        name: 'A count file',
        about: 'The three counted lines reach staging with the file name, and the file goes to the archive folder.',
        trigger: { file: { path: file } },
        expect: {
          noError: true,
          db: { stock_count_staging: { count: 3, has: [{ sku: '4410187', counted_qty: 40, file_name: 'COUNT_0412_20261113.csv' }] } },
          files: { '/stockcount/archive/COUNT_0412_20261113.csv': { exists: true }, [file]: { exists: false } },
        },
      },
      {
        name: 'A count that is not a number',
        about: 'One line says "forty". Nothing is loaded and the file goes to the error folder for the store team.',
        trigger: { file: { path: file } },
        overrides: { systems: { files: { [file]: bad } } },
        expect: { db: { stock_count_staging: { count: 0 } }, files: { '/stockcount/error/COUNT_0412_20261113.csv': { exists: true }, [file]: { exists: false } } },
      },
      {
        name: 'SQL Server is down',
        about: 'The insert cannot run. The file goes to the error folder, out of the way of the next poll.',
        trigger: { file: { path: file } },
        overrides: { systems: { db: { fault: 'CONNECTIVITY' } } },
        expect: { files: { '/stockcount/error/COUNT_0412_20261113.csv': { exists: true } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'stock-counts-in',
      source('ftp-listener', { directory: '/stockcount/in', matcher: 'COUNT_*.csv', postAction: 'none', timeBetweenSizeCheck: 10000 }),
      [
        step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
        step('set-variable', { variableName: 'fileName', value: '#[attributes.fileName]' }),
        step('transform', {
          script: '%dw 2.0\noutput application/java\n---\npayload map ((r) -> {\n  file_name: vars.fileName,\n  store: r.store,\n  sku: r.sku,\n  counted_qty: r.counted_qty as Number,\n  count_date: r.count_date\n})',
        }),
        step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.stock_count_staging (file_name, store, sku, counted_qty, count_date) VALUES (:file_name, :store, :sku, :counted_qty, :count_date)' }),
        step('ftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/stockcount/archive', overwrite: 'true' }),
      ],
      [
        handler('on-error-continue', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Count file " ++ (vars.fileName default "?") ++ " not loaded: " ++ error.description]' }),
          step('ftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/stockcount/error', overwrite: 'true' }),
        ]),
      ],
    ),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, counts stock in each store once a week. The handheld system in each store uploads a CSV to the head office **FTP server**, folder \`/stockcount/in\`, named \`COUNT_<store>_<date>.csv\`:

\`\`\`
store,sku,counted_qty,count_date
0412,4410021,118,2026-11-13
\`\`\`

The rows go to the SQL Server table \`dbo.stock_count_staging\` (\`file_name\`, \`store\`, \`sku\`, \`counted_qty\`, \`count_date\`). Stores on slow lines take up to a minute to upload a file.

**Requirements**
- Pick up each file only once the upload has finished.
- Load every line, with the file name, as numbers where they are numbers.
- Move a loaded file to \`/stockcount/archive\`. Move a file that could not be loaded to \`/stockcount/error\`.

**Design the flow.**
`,
  answerTemplate: `## Picking up the file

## Loading the rows

## Archive and error folders
`,
  keyPoints: [
    'The size check wait makes the listener read a file only once its size stops changing between two looks.',
    'Keep attributes.path in a variable first. A database step replaces the attributes, so the path is gone later.',
    'Convert counted_qty to a number in DataWeave. A bad value fails there, before anything is written.',
    'Move the file yourself: archive at the end of the flow, error in the handler. The listener post action is then "none".',
  ],
  solution: `
1. **FTP On New or Updated File** on \`/stockcount/in\`, matcher \`COUNT_*.csv\`, size check wait 10 seconds, after reading: none.
2. **Set Variable** \`filePath\` and \`fileName\`.
3. **Transform** each row, with \`counted_qty as Number\` and the file name.
4. **Database Bulk Insert** into \`dbo.stock_count_staging\`.
5. **FTP Move** to \`/stockcount/archive\`.
6. Flow **On Error Continue** (ANY): ERROR log, **FTP Move** to \`/stockcount/error\`.

**On a cluster** the listener should run on the primary node only, or both nodes may take the same file.
`,
  followUps: [
    {
      q: 'Why On Error Continue here and not On Error Propagate?',
      a: 'The file is already parked in the error folder, so there is nothing to retry. Continue ends the run cleanly. Propagate also works if you want the failure to show as a failed run in monitoring.',
    },
    {
      q: 'A store sends the same file twice. What happens?',
      a: 'It loads twice, because staging has no key on the file. Add a key on file_name and sku, or check a processed files table first.',
    },
  ],
}

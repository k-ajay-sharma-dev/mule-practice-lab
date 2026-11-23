import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-057',
  category: 'flows',
  title: 'Store Cycle-Count Files from SFTP into Oracle with Bulk Insert',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'retail', 'store-inventory', 'sftp', 'csv', 'oracle', 'bulk-insert', 'transactions'],
  estMinutes: 20,
  flowChecks: [
    { label: 'Count files are picked up by an SFTP listener', rule: { type: 'source', component: 'sftp-listener' } },
    {
      label: 'CSV rows are mapped to table columns with DataWeave before loading',
      rule: { type: 'before', first: 'transform', then: 'db-bulk-insert' },
    },
    { label: 'The count lines are loaded with one Bulk Insert, not row by row', rule: { type: 'exists', component: 'db-bulk-insert' } },
    {
      label: 'A header row for the count (store + date) is written before the lines',
      rule: { type: 'before', first: 'db-insert', then: 'db-bulk-insert' },
    },
    {
      label: 'Header and lines commit together in one database transaction (Try, ALWAYS_BEGIN)',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'db-bulk-insert', within: 'try', withinWhere: { transactionalAction: { oneOf: ['ALWAYS_BEGIN', 'BEGIN_OR_JOIN'] } } },
          { type: 'inside', component: 'db-insert', within: 'try', withinWhere: { transactionalAction: { oneOf: ['ALWAYS_BEGIN', 'BEGIN_OR_JOIN'] } } },
        ],
      },
    },
    {
      label: 'Loaded files are moved to the archive folder only after the load',
      rule: { type: 'before', first: 'db-bulk-insert', then: 'sftp-move', thenWhere: { targetPath: 'archive' }, outside: true },
    },
    {
      label: 'A file that fails is moved to the error folder from the error handler',
      rule: { type: 'inside', component: 'sftp-move', where: { targetPath: 'error' }, within: ['on-error-propagate', 'on-error-continue'] },
    },
  ],
  simulation: {
    systems: {
      files: {
        '/counts/inbound/STORE_0042_20261102.csv': 'SKU,LOCATION,QTY\nSKU-100231,AISLE-04,12\nSKU-100245,,30\nSKU-200871,BACKROOM,6',
      },
      db: {
        tables: {
          STORE_COUNT_BATCH: {
            columns: ['STORE_ID', 'COUNT_DATE', 'FILE_NAME', 'LINE_COUNT', 'LOADED_AT'],
            key: ['STORE_ID', 'COUNT_DATE'],
            rows: [{ STORE_ID: '0017', COUNT_DATE: '2026-11-02', FILE_NAME: 'STORE_0017_20261102.csv', LINE_COUNT: 2810, LOADED_AT: '2026-11-02T21:14:00Z' }],
          },
          STORE_COUNT_STG: { columns: ['STORE_ID', 'COUNT_DATE', 'SKU', 'LOCATION_CODE', 'COUNTED_QTY'], key: ['STORE_ID', 'COUNT_DATE', 'SKU', 'LOCATION_CODE'], rows: [] },
        },
        latencyMs: 40,
      },
    },
    tests: [
      {
        name: 'A count file is loaded',
        about: 'Store 0042 uploads three counted lines. The header and the lines are loaded and the file is archived.',
        trigger: { file: { path: '/counts/inbound/STORE_0042_20261102.csv' } },
        expect: {
          noError: true,
          db: {
            STORE_COUNT_BATCH: { count: 2, has: [{ STORE_ID: '0042', FILE_NAME: 'STORE_0042_20261102.csv', LINE_COUNT: 3 }] },
            STORE_COUNT_STG: { count: 3, has: [{ STORE_ID: '0042', SKU: 'SKU-100231', COUNTED_QTY: 12 }, { SKU: 'SKU-200871', COUNTED_QTY: 6 }] },
          },
          files: { '/counts/archive/STORE_0042_20261102.csv': { exists: true }, '/counts/inbound/STORE_0042_20261102.csv': { exists: false } },
        },
      },
      {
        name: 'A line has a bad quantity',
        about: 'One quantity is not a number. Nothing from the file is loaded and the file goes to the error folder.',
        trigger: { file: { path: '/counts/inbound/STORE_0108_20261102.csv' } },
        overrides: { systems: { files: { '/counts/inbound/STORE_0108_20261102.csv': 'SKU,LOCATION,QTY\nSKU-100231,AISLE-02,8\nSKU-100245,AISLE-02,twelve' } } },
        expect: {
          db: { STORE_COUNT_BATCH: { count: 1 }, STORE_COUNT_STG: { count: 0 } },
          files: { '/counts/error/STORE_0108_20261102.csv': { exists: true }, '/counts/archive/STORE_0108_20261102.csv': { exists: false } },
        },
      },
      {
        name: 'A store re-uploads its count',
        about: 'Store 0017 sends its count for 2 November again. Nothing is loaded twice and the file goes to the error folder.',
        trigger: { file: { path: '/counts/inbound/STORE_0017_20261102.csv' } },
        overrides: { systems: { files: { '/counts/inbound/STORE_0017_20261102.csv': 'SKU,LOCATION,QTY\nSKU-100231,AISLE-01,9\nSKU-300112,AISLE-07,14' } } },
        expect: {
          db: { STORE_COUNT_BATCH: { count: 1 }, STORE_COUNT_STG: { count: 0 } },
          files: { '/counts/error/STORE_0017_20261102.csv': { exists: true }, '/counts/archive/STORE_0017_20261102.csv': { exists: false } },
        },
      },
      {
        name: 'The lines fail after the header',
        about: 'A line appears twice and breaks the staging key during the load. The header already written is rolled back too, so no half count is left.',
        trigger: { file: { path: '/counts/inbound/STORE_0219_20261102.csv' } },
        overrides: { systems: { files: { '/counts/inbound/STORE_0219_20261102.csv': 'SKU,LOCATION,QTY\nSKU-100231,AISLE-04,12\nSKU-200871,BACKROOM,6\nSKU-100231,AISLE-04,12' } } },
        expect: {
          db: { STORE_COUNT_BATCH: { count: 1, lacks: [{ STORE_ID: '0219' }] }, STORE_COUNT_STG: { count: 0 } },
          files: { '/counts/error/STORE_0219_20261102.csv': { exists: true } },
        },
      },
      {
        name: 'Oracle is down',
        about: 'The database does not answer. The file goes to the error folder so store support can see it.',
        trigger: { file: { path: '/counts/inbound/STORE_0042_20261102.csv' } },
        overrides: { systems: { db: { fault: 'CONNECTIVITY' } } },
        expect: {
          files: { '/counts/error/STORE_0042_20261102.csv': { exists: true }, '/counts/archive/STORE_0042_20261102.csv': { exists: false } },
        },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'store-count-to-oracle',
      // Listener outputMimeType="application/csv" (header=true). Files are named STORE_0042_20261102.csv.
      source('sftp-listener', { directory: '/counts/inbound', matcher: 'STORE_*.csv', postAction: 'none' }),
      [
        step('set-variable', { variableName: 'fileName', value: '#[attributes.fileName]' }),
        // Full path: a bare file name would resolve against the connection's working directory.
        step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
        step('set-variable', { variableName: 'storeId', value: '#[(attributes.fileName splitBy "_")[1]]' }),
        step('set-variable', {
          variableName: 'countDate',
          value: '#[((attributes.fileName splitBy "_")[2] splitBy ".")[0] as Date {format: "yyyyMMdd"}]',
        }),
        step('validation', { check: 'is-not-empty-collection', expression: '#[payload]', message: 'Count file has no lines' }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/java\n---\npayload map (r) -> {\n  storeId: vars.storeId,\n  countDate: vars.countDate,\n  sku: trim(r.SKU),\n  location: if (isEmpty(r.LOCATION)) "SALES_FLOOR" else r.LOCATION,\n  countedQty: r.QTY as Number\n}',
        }),
        step('set-variable', { variableName: 'lines', value: '#[payload]' }),
        step('set-variable', { variableName: 'lineCount', value: '#[sizeOf(payload)]' }),
        scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
          // Unique key (STORE_ID, COUNT_DATE) stops the same count being loaded twice.
          step('db-insert', {
            sql: 'INSERT INTO STORE_COUNT_BATCH (STORE_ID, COUNT_DATE, FILE_NAME, LINE_COUNT, LOADED_AT)\nVALUES (:storeId, :countDate, :fileName, :lineCount, SYSTIMESTAMP)',
          }),
          // Bulk Insert reads its rows from #[payload] by default, and the header Insert has just replaced the payload.
          step('set-payload', { value: '#[vars.lines]' }),
          step('db-bulk-insert', {
            sql: 'INSERT INTO STORE_COUNT_STG (STORE_ID, COUNT_DATE, SKU, LOCATION_CODE, COUNTED_QTY)\nVALUES (:storeId, :countDate, :sku, :location, :countedQty)',
          }),
        ]),
        step('sftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/counts/archive' }),
        step('logger', { level: 'INFO', message: '#["Loaded count " ++ vars.fileName ++ " (" ++ (sizeOf(vars.lines) as String) ++ " lines)"]' }),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('sftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/counts/error' }),
          step('logger', { level: 'ERROR', message: '#["Count file " ++ (vars.fileName default "?") ++ " rejected: " ++ error.description]' }),
        ]),
      ],
    ),
  ),
  description: `
A grocery chain runs **cycle counts** in its **320 stores** every night.

**Incoming files**
- Each store's handheld system uploads one CSV per count to an SFTP folder: \`/counts/inbound/STORE_<storeId>_<yyyyMMdd>.csv\`.
- Columns: \`SKU, LOCATION, QTY\`.
- A file typically has **2,000 to 5,000 lines**.
- Files arrive between 21:00 and 23:30.

The counts must be loaded into **Oracle** staging tables before the 01:00 stock-adjustment job runs:
- \`STORE_COUNT_BATCH\`: one row per file (store, count date, file name, line count); unique on store + count date.
- \`STORE_COUNT_STG\`: one row per counted line.

**Facts**
- \`STORE_COUNT_BATCH\` has \`STORE_ID\`, \`COUNT_DATE\`, \`FILE_NAME\`, \`LINE_COUNT\` and \`LOADED_AT\`.
- \`STORE_COUNT_STG\` has \`STORE_ID\`, \`COUNT_DATE\`, \`SKU\`, \`LOCATION_CODE\` and \`COUNTED_QTY\`, and is unique on store, date, SKU and location.
- \`STORE_ID\` is the text from the file name, leading zeros included (\`0042\`).
- An empty \`LOCATION\` means the sales floor; store it as \`SALES_FLOOR\`.

**What the SFTP listener gives you**
- With the output MIME type \`application/csv\`, the payload is a list of rows keyed by the header, all values text:
\`\`\`json
[ { "SKU": "SKU-100231", "LOCATION": "AISLE-04", "QTY": "12" }, { "SKU": "SKU-100245", "LOCATION": "", "QTY": "30" } ]
\`\`\`
- \`attributes.fileName\` is \`STORE_0042_20261102.csv\` and \`attributes.path\` the full path. Later operations replace the attributes, so keep both in variables.
- A Database Insert replaces the payload with its result, so keep the mapped lines in a variable for the Bulk Insert.

**What failures look like**
- A quantity that is not a number (\`twelve\`): the DataWeave coercion \`as Number\` fails, so nothing is inserted.
- A re-uploaded count breaks the unique key on \`STORE_COUNT_BATCH\`, and a line that appears twice breaks the key on \`STORE_COUNT_STG\`. Both raise \`DB:QUERY_EXECUTION\`; inside the transaction the header is rolled back too.
- Oracle is down: the first insert raises \`DB:CONNECTIVITY\`.
- In every case, move the file to \`/counts/error\`.

**Requirements**
- A file is loaded completely or not at all. The adjustment job must never see half a count.
- The same count must not be loaded twice if a store re-uploads it.
- Loaded files go to \`/counts/archive\`, bad files to \`/counts/error\` so the store support team can see them.

**Design the flow(s).**
`,
  answerTemplate: `## Trigger

## Parsing and mapping

## Loading into Oracle (transaction)

## Duplicates

## File handling (archive / error)
`,
  keyPoints: [
    'SFTP listener with a file-name pattern; the store and count date come from the file name (attributes.fileName).',
    'DataWeave maps CSV rows to Java maps whose keys match the named SQL parameters.',
    'Database Bulk Insert sends all lines as one JDBC batch instead of thousands of single inserts.',
    'Header insert and bulk insert run in a Try scope with ALWAYS_BEGIN, so a failure rolls both back.',
    'A unique constraint on (STORE_ID, COUNT_DATE) makes a re-uploaded file fail cleanly (ORA-00001) instead of duplicating stock.',
    'Archive on success, move to an error folder in On Error Propagate so the file is not picked up again forever.',
  ],
  solution: `
1. **SFTP On New or Updated File** on \`/counts/inbound\`, pattern \`STORE_*.csv\`, output MIME type \`application/csv\`. Keep the polling frequency modest (e.g. 1 minute) and set a **time-between-size-check** so a file still being uploaded is not read half-written.
2. **Set Variable**: \`fileName\`, \`filePath\` (\`attributes.path\`, because later operations replace the attributes and a bare name resolves against the working directory), \`storeId\` and \`countDate\` parsed from the file name. After the Transform, \`lines\` keeps the mapped list and \`lineCount\` its size for the header row.
3. **Validate** the file is not empty.
4. **Transform Message**: CSV rows → \`application/java\` list of maps (\`storeId, countDate, sku, location, countedQty\`). Keys match the \`:named\` parameters of the SQL.
5. **Try** (transactional action **ALWAYS_BEGIN**) containing:
   - **Database Insert** into \`STORE_COUNT_BATCH\` (header).
   - **Database Bulk Insert** into \`STORE_COUNT_STG\`: the whole list goes as one JDBC batch. It reads \`#[payload]\` by default and the header Insert has replaced the payload, so keep the list in a variable and pass it back.
   Both use the same Oracle connection and commit together at the end of the Try.
6. **SFTP Move** the file to \`/counts/archive\`.

**Errors:** On Error Propagate moves the file to \`/counts/error\` and logs it. A duplicate upload hits the unique key on the header (ORA-00001 → \`DB:QUERY_EXECUTION\`) and nothing is loaded.

**Oracle notes:** add the Oracle JDBC driver (ojdbc) as a dependency/shared library; for very large files use streaming and split the list into chunks of a few thousand rows per bulk call.
`,
  followUps: [
    {
      q: 'Why not use For Each with a Database Insert per line?',
      a: 'Thousands of single round trips are far slower than one JDBC batch, and each insert would be its own statement execution. Bulk Insert sends the parameter sets together.',
    },
    {
      q: 'What happens if the SFTP server is briefly unavailable during the archive move?',
      a: 'The move fails after the DB commit; the file stays in inbound and is read again, but the unique key on the header rejects the reload, so stock is not duplicated. The error folder then shows it for manual cleanup.',
    },
    {
      q: 'How would you stop the listener reading a file that is still uploading?',
      a: 'Configure timeBetweenSizeCheck on the listener, or agree that stores upload as .tmp and rename to .csv when done, and match only *.csv.',
    },
  ],
}

import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const name = 'TRF_0103_20261113.csv'
const file = `/transfers/in/${name}`
const csv = 'transfer_id,from_store,to_store,sku,qty\nT-8801,0103,0101,LAMP-OAK-S,3\nT-8802,0103,0102,RUG-JUTE-L,1'
const fixed = 'transfer_id,from_store,to_store,sku,qty\nT-8801,0103,0101,LAMP-OAK-S,12\nT-8802,0103,0102,RUG-JUTE-L,1'
// the listener gives every test file the time 2026-11-13T09:58:00Z
const keyOf = (content) => `${name}|${content.length}|2026-11-13T09:58:00Z`
const tables = {
  processed_files: { key: 'file_key', columns: ['file_key', 'file_name'], rows: [] },
  transfer_staging: { columns: ['file_name', 'transfer_id', 'from_store', 'to_store', 'sku', 'qty'], rows: [] },
}
const seen = { tables: { processed_files: { key: 'file_key', columns: ['file_key', 'file_name'], rows: [{ file_key: keyOf(csv), file_name: name }] } } }

export default {
  id: 'fl-207',
  category: 'flows',
  title: 'Store Transfer Files on a Two Node Cluster: a Processed Files Table Keyed on Name, Size and Time Stops Double Loads From Resent Files',
  level: 'ADVANCED',
  tags: ['myproject', 'ftp', 'idempotency', 'cluster', 'primary-node', 'duplicates', 'sql-server'],
  estMinutes: 40,
  flowChecks: [
    { label: 'Transfer files are picked up from /transfers/in once their size is stable', rule: { type: 'source', component: 'ftp-listener', where: { directory: '/transfers/in', timeBetweenSizeCheck: { gte: 1 } } } },
    { label: 'The file key is looked up in dbo.processed_files', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['processed_files', ':fileKey'] } } } },
    {
      label: 'The processed file row and the staging rows are written in one transaction',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'db-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'processed_files' } },
          { type: 'inside', component: 'db-bulk-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'transfer_staging' } },
        ],
      },
    },
    { label: 'A file seen before is moved to /transfers/duplicates, not loaded', rule: { type: 'inside', component: 'ftp-move', within: 'choice', where: { targetPath: '/transfers/duplicates' } } },
    { label: 'A loaded file is moved to /transfers/archive', rule: { type: 'before', first: 'try', then: 'ftp-move', thenWhere: { targetPath: '/transfers/archive' } } },
  ],
  simulation: {
    systems: { files: { [file]: csv }, db: { tables } },
    tests: [
      {
        name: 'A new transfer file',
        about: 'The key is new. Both transfers reach staging, the key is recorded, and the file is archived.',
        trigger: { file: { path: file } },
        expect: {
          noError: true,
          db: { transfer_staging: { count: 2, has: [{ transfer_id: 'T-8802', qty: 1 }] }, processed_files: { has: [{ file_key: keyOf(csv) }] } },
          files: { [`/transfers/archive/${name}`]: { exists: true } },
        },
      },
      {
        name: 'The same file again',
        about: 'The store\'s uploader resent yesterday\'s file unchanged. Its name, size and time are already recorded, so nothing is loaded and the file goes to duplicates.',
        trigger: { file: { path: file } },
        overrides: { systems: { db: seen } },
        expect: { db: { transfer_staging: { count: 0 } }, files: { [`/transfers/duplicates/${name}`]: { exists: true } } },
      },
      {
        name: 'A corrected file with the same name',
        about: 'The store fixed a quantity and uploaded again under the same name. The size differs, so it is a new file and it loads.',
        trigger: { file: { path: file } },
        overrides: { systems: { db: seen, files: { [file]: fixed } } },
        expect: { db: { transfer_staging: { count: 2, has: [{ transfer_id: 'T-8801', qty: 12 }] } }, files: { [`/transfers/archive/${name}`]: { exists: true } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'store-transfers-in',
      source('ftp-listener', { directory: '/transfers/in', matcher: 'TRF_*.csv', postAction: 'none', timeBetweenSizeCheck: 10000 }),
      [
        step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
        step('set-variable', { variableName: 'fileName', value: '#[attributes.fileName]' }),
        step('set-variable', { variableName: 'fileKey', value: '#[attributes.fileName ++ "|" ++ (attributes.size as String) ++ "|" ++ (attributes.timestamp as String)]' }),
        step('db-select', { database: 'SQL Server', sql: 'SELECT file_key FROM dbo.processed_files WHERE file_key = :fileKey', inputParameters: '#[{ fileKey: vars.fileKey }]', target: 'seen' }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[not isEmpty(vars.seen)]' }, [
              step('logger', { level: 'WARN', message: '#["Duplicate transfer file " ++ vars.fileKey]' }),
              step('ftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/transfers/duplicates', overwrite: 'true' }),
            ]),
          ],
          {
            otherwise: [
              step('transform', {
                script: '%dw 2.0\noutput application/java\n---\npayload map ((r) -> { file_name: vars.fileName, transfer_id: r.transfer_id, from_store: r.from_store, to_store: r.to_store, sku: r.sku, qty: r.qty as Number })',
              }),
              scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
                step('db-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.processed_files (file_key, file_name) VALUES (:fileKey, :fileName)', inputParameters: '#[{ fileKey: vars.fileKey, fileName: vars.fileName }]', target: 'marked' }),
                step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.transfer_staging (file_name, transfer_id, from_store, to_store, sku, qty) VALUES (:file_name, :transfer_id, :from_store, :to_store, :sku, :qty)' }),
              ]),
              step('ftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/transfers/archive', overwrite: 'true' }),
            ],
          },
        ),
      ],
    ),
  ),
  description: `
Marrow & Pine Home, a fictional homewares retailer, moves stock between stores. Each store's back office uploads a transfer file to the head office **FTP server**, folder \`/transfers/in\`, named \`TRF_<store>_<date>.csv\`.

The uploader in the stores is old. When it is not sure an upload worked, it uploads the **same file again**, often after the first copy was already loaded and archived. Stores also fix mistakes by uploading a corrected file **under the same name**.

The Mule app runs on a **two node cluster**. Transfers go to the SQL Server table \`dbo.transfer_staging\`. A table \`dbo.processed_files\` (\`file_key\` primary key, \`file_name\`) is free for you to use.

**Requirements**
- Pick up each file once its upload has finished.
- Load a file once. A resent copy goes to \`/transfers/duplicates\` and loads nothing.
- A corrected file with the same name is new and loads.
- Archive a loaded file to \`/transfers/archive\`.

**Design the flow.** Also say what you set so the two nodes do not both take the same file.
`,
  answerTemplate: `## What counts as the same file

## Checking and recording

## Two nodes
`,
  keyPoints: [
    'The file name alone is not enough: a corrected file reuses it. Name, size and modified time together tell a resend from a correction.',
    'Record the key in the same transaction as the rows. A key with no rows, or rows with no key, both lie.',
    'The primary key on file_key is the last guard. If two runs race, the second insert fails and its transaction rolls back.',
    'Run the listener on the primary node only (primaryNodeOnly on the source). Otherwise both nodes poll the folder and can take the same file at once.',
    'The listener\'s own watermark skips files it has seen, but it lives in the app\'s object store. A table survives redeploys and can be queried by support.',
  ],
  solution: `
1. **FTP On New or Updated File** on \`/transfers/in\`, \`TRF_*.csv\`, size check wait 10 seconds, primary node only.
2. **Set Variable** \`filePath\`, \`fileName\`, \`fileKey\` = name | size | timestamp.
3. **Database Select** the key from \`dbo.processed_files\` into \`vars.seen\`.
4. **Choice**:
   - Seen: WARN log, **FTP Move** to \`/transfers/duplicates\`.
   - Otherwise: **Transform**, **Try** ALWAYS_BEGIN (**Insert** the key, **Bulk Insert** the rows), **FTP Move** to \`/transfers/archive\`.

**A content hash** is stronger than size and time: two different files can share a size. Hashing needs the whole file read first, which is fine for small transfer files.
`,
  followUps: [
    {
      q: 'The corrected file must replace the first one, not add to it. What changes?',
      a: 'Inside the same transaction, delete the staging rows for that file name before the insert. Then the corrected version replaces the earlier one.',
    },
    {
      q: 'Is the FTP timestamp reliable?',
      a: 'It depends on the server. Some FTP servers report times only to the minute, or in their local zone. Test it, and fall back to a content hash if it is coarse.',
    },
  ],
}

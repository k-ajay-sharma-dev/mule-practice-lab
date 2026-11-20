import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const name = 'READS_PEN_20261112.csv'
const file = `/reads/in/${name}`
const csv = 'meter_id,read_at,reading\nMTR-30011,2026-11-12T23:59,48812\nMTR-30012,2026-11-12T23:59,10277'
const fixed = 'meter_id,read_at,reading\nMTR-30011,2026-11-12T23:59,48812\nMTR-30012,2026-11-12T23:59,10272\nMTR-30019,2026-11-12T23:59,77310'
const oldReads = [
  { meter_id: 'MTR-30011', read_at: '2026-11-12T23:59', reading: 48812, file_name: name },
  { meter_id: 'MTR-30012', read_at: '2026-11-12T23:59', reading: 10277, file_name: name },
]
const tables = (received = [], reads = []) => ({
  received_files: { key: 'file_name', rows: received },
  meter_reads: { columns: ['meter_id', 'read_at', 'reading', 'file_name'], rows: reads },
})
const seen = (size) => [{ file_name: name, file_size: size, status: 'LOADED' }]

export default {
  id: 'fl-192',
  category: 'flows',
  title: 'A Contractor Resends Meter Read Files Under the Same Name: Skip an Exact Repeat, Replace the Rows of a Corrected File, and Load a New One Once',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'sftp', 'sftp-listener', 'duplicates', 'idempotency', 'transaction', 'utilities'],
  estMinutes: 35,
  flowChecks: [
    { label: 'Read files are picked up from /reads/in', rule: { type: 'source', component: 'sftp-listener', where: { directory: '/reads/in' } } },
    { label: 'received_files is checked for the file name before any load', rule: { type: 'before', first: 'db-select', firstWhere: { sql: 'received_files' }, then: 'db-bulk-insert' } },
    { label: 'The decision compares the size with the size seen before', rule: { type: 'routes', component: 'choice', routeWhere: { expression: 'size' } } },
    { label: 'An exact repeat is moved to /reads/duplicates', rule: { type: 'inside', component: 'sftp-move', within: 'choice', where: { targetPath: '/reads/duplicates' } } },
    { label: 'A corrected file deletes its old rows before inserting, in one transaction', rule: { type: 'inside', component: 'db-delete', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'meter_reads' } } },
    { label: 'Loads record the file in received_files inside the transaction', rule: { type: 'inside', component: ['db-insert', 'db-update'], within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'received_files' }, min: 2 } },
  ],
  simulation: {
    systems: { files: { [file]: csv }, db: { tables: tables() } },
    tests: [
      {
        name: 'A new file',
        about: 'The name is new. Both reads are loaded, the file is recorded with its size, and it moves to done.',
        trigger: { file: { path: file } },
        expect: {
          noError: true,
          db: { meter_reads: { count: 2 }, received_files: { count: 1, has: [{ file_name: name, file_size: csv.length }] } },
          files: { [`/reads/done/${name}`]: { exists: true } },
        },
      },
      {
        name: 'The same file again',
        about: 'Same name, same size: the contractor resent it after a timeout on its side. Nothing is loaded twice, and it goes to duplicates.',
        trigger: { file: { path: file } },
        overrides: { systems: { db: { tables: tables(seen(csv.length), oldReads) } } },
        expect: { db: { meter_reads: { count: 2 } }, files: { [`/reads/duplicates/${name}`]: { exists: true } }, logs: [{ level: 'WARN' }] },
      },
      {
        name: 'A corrected file',
        about: 'Same name, different size: the contractor fixed a reading and added a meter. The old rows from this file are replaced by the new three, and the file is marked CORRECTED.',
        trigger: { file: { path: file, content: fixed } },
        overrides: { systems: { files: { [file]: fixed }, db: { tables: tables(seen(csv.length), oldReads) } } },
        expect: {
          db: { meter_reads: { count: 3, has: [{ meter_id: 'MTR-30012', reading: 10272 }], lacks: [{ reading: 10277 }] }, received_files: { has: [{ file_name: name, status: 'CORRECTED', file_size: fixed.length }] } },
          files: { [`/reads/corrections/${name}`]: { exists: true } },
        },
      },
    ],
  },
  referenceFlow: design(
    flow('meter-read-files', source('sftp-listener', { directory: '/reads/in', matcher: 'READS_*.csv', postAction: 'none', timeBetweenSizeCheck: 5000 }), [
      step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
      step('set-variable', { variableName: 'fileName', value: '#[attributes.fileName]' }),
      step('set-variable', { variableName: 'fileSize', value: '#[attributes.size]' }),
      step('transform', {
        script: '%dw 2.0\noutput application/java\n---\npayload map ((r) -> { meter_id: r.meter_id, read_at: r.read_at, reading: r.reading as Number, file_name: vars.fileName })',
      }),
      step('db-select', { database: 'SQL Server', sql: 'SELECT file_name, file_size FROM received_files WHERE file_name = :fileName', inputParameters: '#[{ fileName: vars.fileName }]', target: 'seen' }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[isEmpty(vars.seen)]' }, [
            scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
              step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO meter_reads (meter_id, read_at, reading, file_name) VALUES (:meter_id, :read_at, :reading, :file_name)' }),
              step('db-insert', {
                database: 'SQL Server',
                sql: "INSERT INTO received_files (file_name, file_size, status) VALUES (:fileName, :fileSize, 'LOADED')",
                inputParameters: '#[{ fileName: vars.fileName, fileSize: vars.fileSize }]',
              }),
            ]),
            step('sftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/reads/done' }),
          ]),
          route({ expression: '#[vars.seen[0].file_size == vars.fileSize]' }, [
            step('logger', { level: 'WARN', message: '#[vars.fileName ++ " was received before with the same size; skipped"]' }),
            step('sftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/reads/duplicates' }),
          ]),
        ],
        {
          otherwise: [
            scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
              step('db-delete', { database: 'SQL Server', sql: 'DELETE FROM meter_reads WHERE file_name = :fileName', inputParameters: '#[{ fileName: vars.fileName }]', target: 'deleted' }),
              step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO meter_reads (meter_id, read_at, reading, file_name) VALUES (:meter_id, :read_at, :reading, :file_name)' }),
              step('db-update', {
                database: 'SQL Server',
                sql: "UPDATE received_files SET file_size = :fileSize, status = 'CORRECTED' WHERE file_name = :fileName",
                inputParameters: '#[{ fileName: vars.fileName, fileSize: vars.fileSize }]',
              }),
            ]),
            step('sftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/reads/corrections' }),
          ],
        },
      ),
    ]),
  ),
  description: `
Penrose Utilities, a fictional water supplier, gets daily meter reads from a meter reading contractor. The contractor uploads \`READS_PEN_<yyyyMMdd>.csv\` to Penrose's **SFTP server**, folder \`/reads/in\`:

\`\`\`
meter_id,read_at,reading
MTR-30011,2026-11-12T23:59,48812
\`\`\`

Two habits of the contractor's system cause trouble:
- When its upload times out, it uploads the **same file again** under the same name, even if the first upload worked.
- When it fixes a reading, it uploads a **corrected file** under the same name.

SQL Server tables:
- \`meter_reads\` (\`meter_id\`, \`read_at\`, \`reading\`, \`file_name\`).
- \`received_files\` (\`file_name\` primary key, \`file_size\`, \`status\`).

Folders \`/reads/done\`, \`/reads/duplicates\` and \`/reads/corrections\` exist.

**Requirements**
- A name never seen before: load its rows and record the file with its size and status \`LOADED\`. Move it to \`done\`.
- The same name and the same size: load nothing, log a warning, move it to \`duplicates\`.
- The same name and a different size: replace that file's rows with the new ones, update its size and set status \`CORRECTED\`. Move it to \`corrections\`.
- Rows and the file record change together or not at all.

**Facts**
- Listen for \`READS_*.csv\`. The SFTP listener gives the size in bytes in \`attributes.size\`. Store that number in \`file_size\` and compare with it.
- Store \`reading\` as a number, and each row's \`file_name\` as the file's name.
- Each load is a **Try** with the transactional action \`ALWAYS_BEGIN\`. A correction deletes the rows with that \`file_name\` first.
- Log a repeat at WARN. Files keep their names when moved.

**Design the flow.**
`,
  answerTemplate: `## Knowing a file by its name

## Repeat or correction

## Loading in a transaction

## Where the file goes
`,
  keyPoints: [
    'The name alone cannot tell a repeat from a correction when the sender reuses names. The size is a cheap second signal.',
    'Size is a heuristic: a correction that changes 48812 to 48813 keeps the same size. A checksum of the content is the reliable test.',
    'A correction is a replace: delete the rows that came from this file, then insert the new ones. Tagging rows with file_name is what makes that possible.',
    'Each load writes the rows and the file record in one transaction, so received_files never claims a file whose rows are missing.',
    'Different folders for done, duplicates and corrections tell support at a glance what happened to each upload.',
  ],
  solution: `
1. **SFTP On New or Updated File** on \`/reads/in\`, \`READS_*.csv\`, size check wait 5 seconds.
2. **Set Variable** \`filePath\`, \`fileName\`, \`fileSize\` (\`attributes.size\`).
3. **Transform** the rows, with \`file_name\`.
4. **Database Select** from \`received_files\` by name, into \`vars.seen\`.
5. **Choice**:
   - Not seen: **Try** ALWAYS_BEGIN: **Bulk Insert** the rows, **Insert** into \`received_files\` with \`LOADED\`. Then **SFTP Move** to \`/reads/done\`.
   - Same size: WARN, **SFTP Move** to \`/reads/duplicates\`.
   - Otherwise: **Try** ALWAYS_BEGIN: **Delete** this file's rows, **Bulk Insert** the new rows, **Update** \`received_files\` with the new size and \`CORRECTED\`. Then **SFTP Move** to \`/reads/corrections\`.

**A name clash in the folders.** The second correction of the same file would meet the first in \`corrections\`. Put a timestamp in front of the name before moving.

**Better than size.** Store a SHA-256 of the content in \`received_files\` and compare that. It costs one pass over the file and removes the guesswork.
`,
  followUps: [
    {
      q: 'Billing already ran on the old readings. Is replacing the rows enough?',
      a: 'No. Billing must hear about the change. Write the corrected meters to a table or queue that billing reads, so it can rebill.',
    },
    {
      q: 'Two copies of the same new file arrive seconds apart. Can both load?',
      a: 'Both could pass the select, but the primary key on received_files lets only one insert commit. The other rolls back, and its file ends in the flow\'s error path.',
    },
  ],
}

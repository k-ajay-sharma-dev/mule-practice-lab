import { design, flow, source, step } from '../../flow/dsl.js'

const dir = '/outbound/promo'
const file = `${dir}/PROMO_W46.csv`
const week46 = 'store,sku,promo_price\n0101,TENT-2P-OLV,129.00\n0102,BOTTLE-1L,8.50'
const tables = { promo_staging: { columns: ['file_name', 'store', 'sku', 'promo_price'], rows: [] } }
const trigger = { file: { path: file } }

export default {
  id: 'fl-279',
  category: 'flows',
  title: 'Weekly Promotions From the Planning Platform\'s FTP Server: Archive Each File Under a Name With the Load Time, So a Resent Week Never Replaces the Copy You Loaded First',
  level: 'BEGINNER',
  tags: ['myproject', 'ftp', 'archive', 'audit', 'sql-server', 'planning'],
  estMinutes: 20,
  flowChecks: [
    { label: 'Promotion files are picked up from /outbound/promo', rule: { type: 'source', component: 'ftp-listener', where: { directory: '/outbound/promo' } } },
    { label: 'The rows are staged before the file is touched', rule: { type: 'before', first: 'db-bulk-insert', firstWhere: { sql: 'promo_staging' }, then: 'ftp-rename' } },
    { label: 'The file is renamed before it is moved to the archive', rule: { type: 'before', first: 'ftp-rename', then: 'ftp-move', thenWhere: { targetPath: 'archive' } } },
  ],
  simulation: {
    systems: { db: { tables }, files: { [file]: week46 } },
    tests: [
      {
        name: 'A weekly file',
        about: 'The two rows are staged and the file goes to the archive with the load time in its name.',
        trigger,
        expect: { noError: true, db: { promo_staging: { count: 2, has: [{ file_name: 'PROMO_W46.csv', sku: 'BOTTLE-1L' }] } }, files: { [`${dir}/archive/PROMO_W46.csv.*`]: { count: 1 }, [file]: { exists: false } } },
      },
      {
        name: 'The same week resent',
        about: 'The platform corrected week 46 and sent it again. The first copy stays in the archive next to the new one, so the audit can compare them.',
        trigger,
        overrides: { systems: { files: { [`${dir}/archive/PROMO_W46.csv`]: 'store,sku,promo_price\n0101,TENT-2P-OLV,139.00' } } },
        expect: { noError: true, files: { [`${dir}/archive/PROMO_W46.csv*`]: { count: 2 }, [`${dir}/archive/PROMO_W46.csv`]: { has: '139.00' } } },
      },
      {
        name: 'SQL Server is down',
        about: 'The insert fails. The file is not renamed or moved, so it is picked up again later.',
        trigger,
        overrides: { systems: { db: { failWhen: [{ match: 'promo_staging', fault: 'CONNECTIVITY' }] } } },
        expect: { error: 'DB:CONNECTIVITY', files: { [file]: { exists: true }, [`${dir}/archive/*`]: { count: 0 } } },
      },
    ],
  },
  referenceFlow: design(
    flow('promo-in', source('ftp-listener', { directory: dir, matcher: 'PROMO_*.csv', postAction: 'none', timeBetweenSizeCheck: 5000 }), [
      step('set-variable', { variableName: 'fileName', value: '#[attributes.fileName]' }),
      step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
      step('set-variable', { variableName: 'archiveName', value: '#[attributes.fileName ++ "." ++ (now() as String {format: "yyyyMMddHHmmss"})]' }),
      step('transform', { script: '%dw 2.0\noutput application/java\n---\npayload map { file_name: vars.fileName, store: $.store, sku: $.sku, promo_price: $.promo_price as Number }' }),
      step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.promo_staging (file_name, store, sku, promo_price) VALUES (:file_name, :store, :sku, :promo_price)' }),
      step('ftp-rename', { path: '#[vars.filePath]', to: '#[vars.archiveName]' }),
      step('ftp-move', { sourcePath: `#["${dir}/" ++ vars.archiveName]`, targetPath: `${dir}/archive`, overwrite: 'false' }),
    ]),
  ),
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, gets weekly store promotions from the planning platform as \`PROMO_W<week>.csv\` on the platform's **FTP server**, folder \`/outbound/promo\`:

\`\`\`
store,sku,promo_price
0101,TENT-2P-OLV,129.00
\`\`\`

The rows go to \`dbo.promo_staging\` (\`file_name\`, \`store\`, \`sku\`, \`promo_price\`) in SQL Server. After loading, the file is kept in \`/outbound/promo/archive\` for the auditors.

When the platform finds a mistake it sends the **same week again under the same name**. The old job moved each file to the archive under its own name, so the corrected file replaced the first one. Last quarter the auditors could not show which prices the stores had on the Monday.

**Requirements**
- Stage the rows with the file name.
- Archive the file under a name that holds the load time, such as \`PROMO_W46.csv.20261113100000\`, so every version is kept.
- If the load fails, leave the file where it is.

**Facts**
- \`file_name\` is the file's own name, such as \`PROMO_W46.csv\`. Store \`promo_price\` as a number.
- The archive name is \`<file name>.<yyyyMMddHHmmss>\`. FTP Move keeps a file's name, so **FTP Rename** the file in place first, then move it.
- Do not catch a database error. The run fails and the file stays in \`/outbound/promo\`.

**What each system sends back**
- The FTP listener gives the file as a list of rows keyed by the header, with string values, and the file details in \`attributes.fileName\` (\`PROMO_W46.csv\`) and \`attributes.path\`:
\`\`\`json
[ { "store": "0101", "sku": "TENT-2P-OLV", "promo_price": "129.00" } ]
\`\`\`

**What failures look like**
- SQL Server is down: the Bulk Insert raises \`DB:CONNECTIVITY\`. The run ends with that error and the file is not renamed or moved.

**Design the flow.**
`,
  answerTemplate: `## Staging

## A name per version

## When the load fails
`,
  keyPoints: [
    'The same name twice is normal for a resend. The archive needs something that differs per load, such as the load time.',
    'Rename in place, then move. The FTP Move operation keeps the name, so the new name must be given first.',
    'Keep the path in a variable before the database step. A database result replaces the attributes, and attributes.path is gone after it.',
    'Touch the file only after the rows are staged. A failed insert leaves the file in place for the next poll.',
    'Overwrite set to false on the move is a guard: if two loads ever pick the same second, the second move fails instead of replacing the first copy.',
  ],
  solution: `
1. **FTP On New or Updated File** on \`/outbound/promo\`, \`PROMO_*.csv\`.
2. **Set Variable** \`fileName\`, \`filePath\` and \`archiveName\` = \`fileName ++ "." ++ now() as String {format: "yyyyMMddHHmmss"}\`.
3. **Transform** with \`file_name\`, **Bulk Insert** into \`dbo.promo_staging\`.
4. **FTP Rename** the file to \`archiveName\`.
5. **FTP Move** it to \`/outbound/promo/archive\`, overwrite false.

**Time zones.** now() is the server's time with its zone. Format it in one agreed zone, such as UTC, so names sort in load order whatever server runs the job.
`,
  followUps: [
    {
      q: 'Staging now holds both versions of week 46. Which one do the stores get?',
      a: 'Both rows carry the same file name, so the downstream job cannot tell. Add the archive name or a load ID to the staging rows, or delete the week\'s rows before the insert so a resend replaces them.',
    },
    {
      q: 'Can the platform\'s FTP server rename across folders in one step?',
      a: 'Many FTP servers can, since a rename with a path is a move. Not all allow it, so two steps are the safer choice when you do not control the server.',
    },
  ],
}

import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const file = '/wms/receipts/RCV_20261112.txt'
const good = ['H20261112DC-EAST', 'D4410021 000480 PO-77120', 'D4410187 000096 PO-77121', 'T000002'].join('\n')
const short = ['H20261112DC-EAST', 'D4410021 000480 PO-77120', 'D4410187 000096 PO-77121', 'T000003'].join('\n')
const cut = ['H20261112DC-EAST', 'D4410021 000480 PO-77120'].join('\n')
const tables = { receipt_staging: { columns: ['file_name', 'dc', 'sku', 'qty', 'po_number'], rows: [] } }

export default {
  id: 'fl-202',
  category: 'flows',
  title: 'Fixed Width Receipt Files From a Legacy Warehouse Over FTP: Parse by Position, Check the Trailer Count, and Load Only a Complete File',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'ftp', 'fixed-width', 'trailer', 'record-count', 'sql-server', 'legacy'],
  estMinutes: 30,
  flowChecks: [
    { label: 'Receipt files are picked up from /wms/receipts once their size is stable', rule: { type: 'source', component: 'ftp-listener', where: { directory: '/wms/receipts', matcher: '.txt', timeBetweenSizeCheck: { gte: 1 } } } },
    { label: 'A Choice compares the trailer count with the detail lines', rule: { type: 'routes', component: 'choice', routeWhere: { expression: 'trailer' } } },
    { label: 'Only a file whose count matches is bulk inserted into dbo.receipt_staging', rule: { type: 'inside', component: 'db-bulk-insert', within: 'choice', routeWhere: { expression: 'trailer' }, where: { sql: 'receipt_staging' } } },
    { label: 'A loaded file is moved to /wms/receipts/archive', rule: { type: 'inside', component: 'ftp-move', within: 'choice', routeWhere: { expression: 'trailer' }, where: { targetPath: '/wms/receipts/archive' } } },
    { label: 'A file that fails the count goes to /wms/receipts/error', rule: { type: 'inside', component: 'ftp-move', within: 'choice', inSlot: 'otherwise', where: { targetPath: '/wms/receipts/error' } } },
  ],
  simulation: {
    systems: { files: { [file]: good }, db: { tables } },
    tests: [
      {
        name: 'A complete file',
        about: 'The trailer says 2 and there are 2 detail lines. Both receipts are loaded with numbers that lost their leading zeros, and the file is archived.',
        trigger: { file: { path: file } },
        expect: {
          noError: true,
          db: { receipt_staging: { count: 2, has: [{ sku: '4410021', qty: 480, po_number: 'PO-77120', dc: 'DC-EAST' }] } },
          files: { '/wms/receipts/archive/RCV_20261112.txt': { exists: true } },
        },
      },
      {
        name: 'The trailer says 3',
        about: 'One detail line is missing. Nothing is loaded and the file goes to the error folder.',
        trigger: { file: { path: file } },
        overrides: { systems: { files: { [file]: short } } },
        expect: { db: { receipt_staging: { count: 0 } }, files: { '/wms/receipts/error/RCV_20261112.txt': { exists: true } } },
      },
      {
        name: 'The file was cut off',
        about: 'The transfer broke after the first detail line, so there is no trailer at all. That is not a complete file either.',
        trigger: { file: { path: file } },
        overrides: { systems: { files: { [file]: cut } } },
        expect: { db: { receipt_staging: { count: 0 } }, files: { '/wms/receipts/error/RCV_20261112.txt': { exists: true } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'wms-receipts-in',
      source('ftp-listener', { directory: '/wms/receipts', matcher: 'RCV_*.txt', postAction: 'none', timeBetweenSizeCheck: 10000 }),
      [
        step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
        step('set-variable', { variableName: 'fileName', value: '#[attributes.fileName]' }),
        step('transform', {
          target: 'variable',
          variableName: 'parsed',
          script:
            '%dw 2.0\noutput application/java\nvar recs = (payload splitBy "\\n") filter (trim($) != "")\nvar dc = trim(recs[0][9 to -1])\nvar trailer = (recs filter ($[0] == "T"))[0]\n---\n{\n  details: recs filter ($[0] == "D") map ((l) -> {\n    file_name: vars.fileName,\n    dc: dc,\n    sku: l[1 to 7],\n    qty: l[9 to 14] as Number,\n    po_number: trim(l[16 to -1])\n  }),\n  trailerCount: if (trailer == null) -1 else (trailer[1 to -1] as Number)\n}',
        }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[vars.parsed.trailerCount == sizeOf(vars.parsed.details)]' }, [
              step('set-payload', { value: '#[vars.parsed.details]' }),
              step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.receipt_staging (file_name, dc, sku, qty, po_number) VALUES (:file_name, :dc, :sku, :qty, :po_number)' }),
              step('ftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/wms/receipts/archive', overwrite: 'true' }),
            ]),
          ],
          {
            otherwise: [
              step('logger', { level: 'WARN', message: '#["Receipt file " ++ vars.fileName ++ " has " ++ (sizeOf(vars.parsed.details) as String) ++ " lines, trailer says " ++ (vars.parsed.trailerCount as String)]' }),
              step('ftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/wms/receipts/error', overwrite: 'true' }),
            ],
          },
        ),
      ],
    ),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, still runs a legacy warehouse system at its east distribution centre. Each night it writes the day's goods receipts to an **FTP server** as a **fixed width** text file, \`/wms/receipts/RCV_<date>.txt\`:

\`\`\`
H20261112DC-EAST
D4410021 000480 PO-77120
D4410187 000096 PO-77121
T000002
\`\`\`

- \`H\` header: the H, the date in 8 digits, then the DC code.
- \`D\` detail: the D, the 7 digit SKU, a space, the quantity in 6 digits with leading zeros, a space, then the PO number.
- \`T\` trailer: the T, then the number of detail lines in 6 digits.

The FTP link drops now and then, and a cut off file once loaded half a night of receipts. The receipts go to the SQL Server table \`dbo.receipt_staging\` (\`file_name\`, \`dc\`, \`sku\`, \`qty\`, \`po_number\`).

**Requirements**
- Pick up each file once its upload has finished.
- Load it only when the trailer is there and its count equals the detail lines. Then archive it to \`/wms/receipts/archive\`.
- Otherwise load nothing and move it to \`/wms/receipts/error\`.

**Facts**
- Listen for \`RCV_*.txt\` with a size check wait.
- Parse the whole file in one Transform first. Keep the trailer count as \`trailerCount\`, or -1 when there is no trailer, and compare it with the number of detail lines in a **Choice**.
- Each row has \`file_name\` (the file's name), \`dc\` from the header, \`sku\` as the 7 digit text, \`qty\` as a number (\`000480\` becomes 480) and \`po_number\`.
- Log a count that does not match at WARN. Files keep their names when moved.

**Design the flow.**
`,
  answerTemplate: `## Reading a fixed width file

## The trailer check

## Load or park
`,
  keyPoints: [
    'A fixed width line is cut by position. In DataWeave a string range such as l[1 to 7] gives those characters.',
    'Quantities arrive as text with leading zeros. "as Number" turns 000480 into 480.',
    'A missing trailer is the clearest sign of a cut off transfer. Treat it as a count that does not match.',
    'Check the whole file before you write anything. Then a bad file leaves no rows behind and needs no cleanup.',
    'DataWeave also has a flat file format with a schema (a .ffd file). It suits wide records with many fields; a short script is fine for three record types.',
  ],
  solution: `
1. **FTP On New or Updated File** on \`/wms/receipts\`, matcher \`RCV_*.txt\`, size check wait 10 seconds. Read it as text.
2. **Set Variable** \`filePath\` and \`fileName\`.
3. **Transform** into \`vars.parsed\`: split into lines, take the DC from the header, map each \`D\` line by position, and read the trailer count (-1 when there is no trailer).
4. **Choice**:
   - \`trailerCount == sizeOf(details)\`: **Set Payload** the details, **Bulk Insert** into \`dbo.receipt_staging\`, **FTP Move** to \`archive\`.
   - Otherwise: WARN log, **FTP Move** to \`error\`.

**Transfer mode.** Ask for binary mode on the FTP connection. ASCII mode may change line endings, and a \\r\\n file then needs \`trim\` on every line.
`,
  followUps: [
    {
      q: 'The file has 2 million lines. What changes?',
      a: 'Do not split it all in memory. Stream it, count lines in a first pass or trust a control file, and load through a Batch Job. Or load everything into staging under the file name and delete it again if the trailer does not match.',
    },
    {
      q: 'Why not use the size check alone to spot a cut off file?',
      a: 'The size check only tells you the size stopped changing. A broken transfer also stops changing. The trailer tells you the writer finished.',
    },
  ],
}

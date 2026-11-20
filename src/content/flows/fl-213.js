import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const name = 'RCPT_0412_20261113.csv'
const file = `/mnt/scm-share/receipts/in/${name}`
const mixed = 'line,store,sku,qty\n1,0412,4410021,24\n2,0412,,12\n3,0412,4410187,6'
const clean = 'line,store,sku,qty\n1,0412,4410021,24\n3,0412,4410187,6'
const tables = {
  receipt_staging: { columns: ['file_name', 'line', 'store', 'sku', 'qty'], rows: [] },
  receipt_rejects: { columns: ['file_name', 'line', 'reason'], rows: [] },
}

export default {
  id: 'fl-213',
  category: 'flows',
  title: 'Store Receipts From an Azure File Share Into SQL Server: Good Lines to a Staging Table, Bad Lines to a Reject Table With the Reason',
  level: 'BEGINNER',
  tags: ['myproject', 'sql-server', 'staging', 'reject-table', 'bulk-insert', 'azure-file-share'],
  estMinutes: 20,
  flowChecks: [
    { label: 'Receipt files are picked up from the mounted share once their size is stable', rule: { type: 'source', component: 'file-listener', where: { directory: '/mnt/scm-share/receipts/in', timeBetweenSizeCheck: { gte: 1 } } } },
    { label: 'Good lines are bulk inserted into dbo.receipt_staging when there are any', rule: { type: 'inside', component: 'db-bulk-insert', within: 'choice', where: { sql: 'receipt_staging' } } },
    { label: 'Bad lines are bulk inserted into dbo.receipt_rejects when there are any', rule: { type: 'inside', component: 'db-bulk-insert', within: 'choice', where: { sql: 'receipt_rejects' } } },
    { label: 'The file is moved to /mnt/scm-share/receipts/done at the end', rule: { type: 'exists', component: 'file-move', where: { targetPath: '/mnt/scm-share/receipts/done' } } },
  ],
  simulation: {
    systems: { files: { [file]: mixed }, db: { tables } },
    tests: [
      {
        name: 'A file with one bad line',
        about: 'Line 2 has no SKU. Lines 1 and 3 reach staging, line 2 reaches the reject table with SKU_MISSING, and the file moves to done.',
        trigger: { file: { path: file } },
        expect: {
          noError: true,
          db: { receipt_staging: { count: 2, has: [{ line: '3', sku: '4410187', qty: 6 }] }, receipt_rejects: { count: 1, has: [{ line: '2', reason: 'SKU_MISSING', file_name: name }] } },
          files: { [`/mnt/scm-share/receipts/done/${name}`]: { exists: true } },
        },
      },
      {
        name: 'A clean file',
        about: 'Every line is good. Staging gets both, and the reject table stays empty.',
        trigger: { file: { path: file } },
        overrides: { systems: { files: { [file]: clean } } },
        expect: { noError: true, db: { receipt_staging: { count: 2 }, receipt_rejects: { count: 0 } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'store-receipts-in',
      source('file-listener', { directory: '/mnt/scm-share/receipts/in', matcher: 'RCPT_*.csv', postAction: 'none', timeBetweenSizeCheck: 10000 }),
      [
        step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
        step('set-variable', { variableName: 'fileName', value: '#[attributes.fileName]' }),
        step('transform', {
          target: 'variable',
          variableName: 'checked',
          script:
            '%dw 2.0\noutput application/java\n---\npayload map ((r) -> {\n  file_name: vars.fileName,\n  line: r.line,\n  store: r.store,\n  sku: r.sku,\n  qty: r.qty as Number default 0,\n  reason: if (isBlank(r.sku)) "SKU_MISSING" else if ((r.qty as Number default 0) <= 0) "QTY_NOT_POSITIVE" else ""\n})',
        }),
        router('choice', {}, [
          route({ expression: '#[sizeOf(vars.checked filter ($.reason == "")) > 0]' }, [
            step('set-payload', { value: '#[vars.checked filter ($.reason == "") map ($ - "reason")]' }),
            step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.receipt_staging (file_name, line, store, sku, qty) VALUES (:file_name, :line, :store, :sku, :qty)' }),
          ]),
        ]),
        router('choice', {}, [
          route({ expression: '#[sizeOf(vars.checked filter ($.reason != "")) > 0]' }, [
            step('set-payload', { value: '#[vars.checked filter ($.reason != "") map { file_name: $.file_name, line: $.line, reason: $.reason }]' }),
            step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.receipt_rejects (file_name, line, reason) VALUES (:file_name, :line, :reason)' }),
          ]),
        ]),
        step('file-move', { sourcePath: '#[vars.filePath]', targetPath: '/mnt/scm-share/receipts/done', overwrite: 'true' }),
      ],
    ),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, records goods received in each store. The store servers write \`RCPT_<store>_<date>.csv\` to an **Azure File Share**, which is mounted on the Mule host at \`/mnt/scm-share\`:

\`\`\`
line,store,sku,qty
1,0412,4410021,24
\`\`\`

Good lines go to the SQL Server table \`dbo.receipt_staging\` (\`file_name\`, \`line\`, \`store\`, \`sku\`, \`qty\`). Until now one bad line failed the whole file, and a store's receipts waited a day.

Support wants bad lines kept in \`dbo.receipt_rejects\` (\`file_name\`, \`line\`, \`reason\`) so they can call the store.

**Requirements**
- Pick up each file from \`/mnt/scm-share/receipts/in\` once it is written.
- A line with no SKU is rejected with \`SKU_MISSING\`, a quantity not above zero with \`QTY_NOT_POSITIVE\`.
- Insert good lines into staging and bad lines into rejects, each only when there are some.
- Move the file to \`/mnt/scm-share/receipts/done\`.

**Facts**
- Use the File listener on the mount, \`RCPT_*.csv\`, with a size check wait.
- Test the SKU first: a line with both faults gets \`SKU_MISSING\`.
- Every row carries \`file_name\` (the file's name) and \`line\` as in the file. Store \`qty\` as a number.
- Skip an empty list with a **Choice** before each bulk insert. The file keeps its name in \`done\`.

**Design the flow.**
`,
  answerTemplate: `## Reading the file

## Sorting the lines

## Two tables
`,
  keyPoints: [
    'A staging table holds what loaded; a reject table holds what did not, with the reason and the line number.',
    'Work out the reason once, in one Transform, then split the list by it.',
    'A Choice skips a bulk insert when its list is empty. Some drivers refuse an empty batch.',
    'The File connector reads a mounted share like a local folder. A size check still matters, because the store writes over the network.',
  ],
  solution: `
1. **File On New or Updated File** on \`/mnt/scm-share/receipts/in\`, \`RCPT_*.csv\`, size check wait 10 seconds.
2. **Set Variable** \`filePath\` and \`fileName\`.
3. **Transform** into \`vars.checked\`: each line with a \`reason\` (empty when good).
4. **Choice** good lines exist: **Set Payload** them, **Bulk Insert** into \`dbo.receipt_staging\`.
5. **Choice** bad lines exist: **Set Payload** them, **Bulk Insert** into \`dbo.receipt_rejects\`.
6. **File Move** to \`done\`.

**All or nothing per file.** Put both inserts in a Try with ALWAYS_BEGIN if support wants a file in both tables or in neither.
`,
  followUps: [
    {
      q: 'Why not the Azure Storage connector instead of a mount?',
      a: 'A mount is the quickest when Mule runs on a host in Azure that can mount the share. On CloudHub there is no mount, so you would call the File Share REST API instead.',
    },
    {
      q: 'How does support know a store sent bad lines?',
      a: 'A daily email from the reject table, grouped by store, or a dashboard on it. A table nobody reads helps nobody.',
    },
  ],
}

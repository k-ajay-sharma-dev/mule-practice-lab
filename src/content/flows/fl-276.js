import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

const inDir = '/mnt/planning/outbound/alloc'
const outDir = '/mnt/planning/inbound/alloc-results'
const name = 'ALLOC_20261113_01.csv'
const clean = 'store,sku,qty\n0204,MILK-2L-SEMI,40\n0204,BREAD-WHT-800,25\n0311,EGGS-6-FR,30'
const oneBad = 'store,sku,qty\n0204,MILK-2L-SEMI,40\n0204,BREAD-WHT-800,25\n0311,MILK-2L-SEMI,\n0311,EGGS-6-FR,30'
const tables = { alloc_staging: { columns: ['file_name', 'store', 'sku', 'qty'], rows: [] } }
const arrives = (content) => ({ file: { path: `${inDir}/${name}`, content } })
const filesWith = (content) => ({ [`${inDir}/${name}`]: content })

export default {
  id: 'fl-276',
  category: 'flows',
  title: 'Allocation Plans From an Azure File Share With a Result File Back: Stage the Good Lines, Write LOADED, PARTIAL or FAILED Next to the Platform Under a Temporary Name, and Leave the File When SQL Server Is Only Unreachable',
  level: 'ADVANCED',
  tags: ['myproject', 'azure-file-share', 'file', 'result-file', 'sql-server', 'reject', 'error-handling', 'planning'],
  estMinutes: 45,
  flowChecks: [
    { label: 'Plan files are picked up from the alloc folder on the mounted share', rule: { type: 'source', component: 'file-listener', where: { directory: 'alloc' } } },
    { label: 'The good lines are bulk inserted into alloc_staging', rule: { type: 'exists', component: 'db-bulk-insert', where: { sql: 'alloc_staging' } } },
    { label: 'The result file is written under a .tmp name and renamed', rule: { type: 'all', rules: [{ type: 'exists', component: 'file-write', where: { path: '.tmp' } }, { type: 'exists', component: 'file-rename' }] } },
    { label: 'The plan file is archived after the result is in place', rule: { type: 'before', first: 'file-rename', then: 'file-move', thenWhere: { targetPath: 'archive' } } },
    { label: 'A refused plan is moved to the error folder from an On Error Continue', rule: { type: 'inside', component: 'file-move', within: 'on-error-continue', where: { targetPath: 'error' } } },
  ],
  simulation: {
    systems: { db: { tables }, files: filesWith(clean) },
    tests: [
      {
        name: 'A clean plan',
        about: 'All three lines are staged. The result says LOADED with 3 lines, and the plan file goes to the archive.',
        trigger: arrives(clean),
        expect: {
          noError: true,
          db: { alloc_staging: { count: 3, has: [{ file_name: name, store: '0311', sku: 'EGGS-6-FR', qty: 30 }] } },
          files: { [`${outDir}/${name}.result`]: { count: 1, has: 'status=LOADED' }, [`${outDir}/*.tmp`]: { count: 0 }, [`${inDir}/archive/${name}`]: { exists: true }, [`${inDir}/${name}`]: { exists: false } },
        },
      },
      {
        name: 'A line without a quantity',
        about: 'Line 3 has no quantity. The other three are staged, and the result says PARTIAL and names line 3.',
        trigger: arrives(oneBad),
        overrides: { systems: { files: filesWith(oneBad) } },
        expect: {
          noError: true,
          db: { alloc_staging: { count: 3, lacks: [{ store: '0311', sku: 'MILK-2L-SEMI' }] } },
          files: { [`${outDir}/${name}.result`]: { has: 'line 3|MISSING_VALUE' }, [`${outDir}/*.result`]: { has: 'status=PARTIAL' } },
        },
      },
      {
        name: 'SQL Server cannot be reached',
        about: 'The connection fails. No result is written and the plan file stays where it is, so the listener picks it up again once SQL Server is back.',
        trigger: arrives(clean),
        overrides: { systems: { db: { failWhen: [{ match: 'INSERT INTO dbo.alloc_staging', fault: 'CONNECTIVITY' }] } } },
        expect: { error: 'DB:CONNECTIVITY', files: { [`${outDir}/*`]: { count: 0 }, [`${inDir}/${name}`]: { exists: true } } },
      },
      {
        name: 'SQL Server refuses the plan',
        about: 'The insert fails on a constraint. Nothing is staged, the result says FAILED with the reason, and the plan file goes to the error folder so it is not tried again and again.',
        trigger: arrives(clean),
        overrides: { systems: { db: { failWhen: [{ match: 'INSERT INTO dbo.alloc_staging', fault: 'QUERY_EXECUTION' }] } } },
        expect: {
          noError: true,
          db: { alloc_staging: { count: 0 } },
          files: { [`${outDir}/${name}.result`]: { has: 'status=FAILED' }, [`${inDir}/error/${name}`]: { exists: true }, [`${inDir}/${name}`]: { exists: false } },
        },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'alloc-plans-in',
      source('file-listener', { directory: inDir, matcher: 'ALLOC_*.csv', postAction: 'none', timeBetweenSizeCheck: 5000 }),
      [
        step('set-variable', { variableName: 'fileName', value: '#[attributes.fileName]' }),
        step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
        step('set-variable', { variableName: 'lines', value: '#[payload map ((l, i) -> l ++ { line: i + 1 })]' }),
        step('set-variable', { variableName: 'bad', value: '#[vars.lines filter (isEmpty($.store) or isEmpty($.qty))]' }),
        step('set-variable', { variableName: 'good', value: '#[vars.lines filter ((isEmpty($.store) or isEmpty($.qty)) == false)]' }),
        scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
          step('set-payload', { value: '#[vars.good map { file_name: vars.fileName, store: $.store, sku: $.sku, qty: $.qty as Number }]' }),
          step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.alloc_staging (file_name, store, sku, qty) VALUES (:file_name, :store, :sku, :qty)' }),
        ]),
        step('set-payload', {
          value:
            '#[(["file=" ++ vars.fileName, "status=" ++ (if (isEmpty(vars.bad)) "LOADED" else "PARTIAL"), "loaded=" ++ (sizeOf(vars.good) as String), "rejected=" ++ (sizeOf(vars.bad) as String)] ++ (vars.bad map ("line " ++ ($.line as String) ++ "|MISSING_VALUE"))) joinBy "\\n"]',
        }),
        step('file-write', { path: `#["${outDir}/" ++ vars.fileName ++ ".result.tmp"]`, mode: 'OVERWRITE' }),
        step('file-rename', { path: `#["${outDir}/" ++ vars.fileName ++ ".result.tmp"]`, to: '#[vars.fileName ++ ".result"]' }),
        step('file-move', { sourcePath: '#[vars.filePath]', targetPath: `${inDir}/archive` }),
      ],
      [
        handler('on-error-propagate', { type: 'DB:CONNECTIVITY' }, [step('logger', { level: 'ERROR', message: '#["SQL Server unreachable, " ++ vars.fileName ++ " left for the next try"]' })]),
        handler('on-error-continue', { type: 'ANY' }, [
          step('set-payload', { value: '#[["file=" ++ vars.fileName, "status=FAILED", "reason=" ++ error.errorType.asString ++ " " ++ error.description] joinBy "\\n"]' }),
          step('file-write', { path: `#["${outDir}/" ++ vars.fileName ++ ".result"]`, mode: 'OVERWRITE' }),
          step('file-move', { sourcePath: '#[vars.filePath]', targetPath: `${inDir}/error` }),
        ]),
      ],
    ),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, gets store allocations back from the planning platform. The platform writes \`ALLOC_<date>_<nn>.csv\` files to an **Azure File Share**, folder \`outbound/alloc\`:

\`\`\`
store,sku,qty
0204,MILK-2L-SEMI,40
0311,EGGS-6-FR,30
\`\`\`

Larkfield's Mule runtime for the planning flows runs **on premises** and mounts the share at \`/mnt/planning\`. The lines go to \`dbo.alloc_staging\` (\`file_name\`, \`store\`, \`sku\`, \`qty\`) in SQL Server, and a nightly job takes them on to the warehouse.

The planning team cannot see Larkfield's logs. They asked for a **result file** per plan in \`inbound/alloc-results\`, named \`<plan file>.result\`, that their monitor reads:

\`\`\`
file=ALLOC_20261113_01.csv
status=PARTIAL
loaded=3
rejected=1
line 3|MISSING_VALUE
\`\`\`

**Requirements**
- A line with no store or no quantity is not staged; it is listed in the result as \`line <n>|MISSING_VALUE\` (data lines count from 1). Stage the others with the file name.
- Status \`LOADED\` when nothing was rejected, \`PARTIAL\` otherwise. The monitor reads any \`.result\` file it sees, so a half written one must never be visible.
- After a good result, move the plan to \`outbound/alloc/archive\`.
- If SQL Server **cannot be reached**, write nothing and leave the plan where it is, so it is picked up again.
- If SQL Server **refuses** the plan, write a \`FAILED\` result with the reason and move the plan to \`outbound/alloc/error\`. The platform resends a fixed plan.

**Design the flow.**
`,
  answerTemplate: `## Good and bad lines

## Staging

## The result file

## Two kinds of failure
`,
  keyPoints: [
    'Split the lines before the insert. A missing value is the platform\'s mistake and belongs in the result file, not in a database error.',
    'Write the result as .tmp and rename it. A rename on the same share is a quick step, so the monitor never reads half a file.',
    'Archive the plan only after the result is in place. A crash in between leaves the plan to be picked up again, and OVERWRITE makes the second result harmless.',
    'Tell the two failures apart. A lost connection will pass, so propagate and leave the file. A refused insert will fail every time, so report it and move the file aside.',
    'The handlers are tried in order: On Error Propagate for DB:CONNECTIVITY first, then On Error Continue for the rest.',
  ],
  solution: `
1. **File On New or Updated File** on \`/mnt/planning/outbound/alloc\`, \`ALLOC_*.csv\`, size check 5 seconds.
2. **Set Variable** \`fileName\`, \`filePath\`, \`lines\` (with a line number), \`bad\` and \`good\`.
3. **Try** (ALWAYS_BEGIN): **Set Payload** the good rows, **Bulk Insert** into \`dbo.alloc_staging\`.
4. **Set Payload** the result text. **File Write** \`<name>.result.tmp\`, **File Rename** to \`<name>.result\`.
5. **File Move** the plan to \`archive\`.
6. Flow handlers: **On Error Propagate** (\`DB:CONNECTIVITY\`) with a **Logger**; **On Error Continue** (ANY): **Set Payload** the FAILED result, **File Write** it, **File Move** the plan to \`error\`.

**Why the mount.** A file listener needs a folder it can see. On CloudHub you would poll the share through its REST API instead, and write the result with Create File and Put Range.
`,
  followUps: [
    {
      q: 'The plan is staged, then Mule dies before the result is written. What happens on restart?',
      a: 'The plan is still in the folder, so it loads again and its lines are staged twice. Delete the rows for that file_name before the insert, inside the same transaction, so a rerun replaces them.',
    },
    {
      q: 'Why write the FAILED result without a temporary name?',
      a: 'It is short and written in one call, so the risk is small, but the same .tmp and rename would be safer. Keep both paths the same if the monitor is strict.',
    },
  ],
}

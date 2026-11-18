import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const name = 'SALES_HIST_2026W46.csv'
const file = `/sales/hist/in/${name}`
const csv = 'line,store,sku,units\n1,0101,SOFA-3S-GRY,1\n2,0102,LAMP-ARC-BRS,4\n3,0101,RUG-160-OAT,2\n4,0103,LAMP-ARC-BRS,1'
const tables = {
  sales_hist_staging: { key: ['file_name', 'line'], columns: ['file_name', 'line', 'store', 'sku', 'units'], rows: [] },
  load_checkpoint: { key: 'file_name', columns: ['file_name', 'last_line'], rows: [] },
}
const restart = {
  sales_hist_staging: {
    ...tables.sales_hist_staging,
    rows: [
      { file_name: name, line: 1, store: '0101', sku: 'SOFA-3S-GRY', units: 1 },
      { file_name: name, line: 2, store: '0102', sku: 'LAMP-ARC-BRS', units: 4 },
    ],
  },
  load_checkpoint: { ...tables.load_checkpoint, rows: [{ file_name: name, last_line: 2 }] },
}
const checkpointMerge =
  'MERGE INTO dbo.load_checkpoint AS t\nUSING (SELECT :fileName AS file_name, :lastLine AS last_line) AS s\nON t.file_name = s.file_name\nWHEN MATCHED THEN UPDATE SET last_line = s.last_line\nWHEN NOT MATCHED THEN INSERT (file_name, last_line) VALUES (s.file_name, s.last_line);'

export default {
  id: 'fl-252',
  category: 'flows',
  title: 'Restart a Six Million Row Load Where It Stopped: a Checkpoint Row Written With Each Group in the Same Transaction, and an Accept Expression That Skips the Lines Already Loaded',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'batch', 'sql-server', 'checkpoint', 'restart', 'transaction', 'accept-expression'],
  estMinutes: 40,
  flowChecks: [
    { label: 'The checkpoint for the file is read before the Batch Job', rule: { type: 'before', first: 'db-select', firstWhere: { sql: 'load_checkpoint' }, then: 'batch-job' } },
    { label: 'The batch step has an accept expression, so lines already loaded are skipped', rule: { type: 'routes', component: 'batch-job', routeWhere: { acceptExpression: { set: true } } } },
    {
      label: 'Each group is staged and the checkpoint moved in one transaction',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'db-bulk-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'sales_hist_staging' } },
          { type: 'inside', component: ['db-update', 'db-bulk-update'], within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'load_checkpoint' } },
          { type: 'inside', component: 'try', within: 'batch-aggregator' },
        ],
      },
    },
    { label: 'The file is moved to /sales/hist/done after the job is started', rule: { type: 'before', first: 'batch-job', then: 'file-move', thenWhere: { targetPath: '/sales/hist/done' }, outside: true } },
  ],
  simulation: {
    systems: { files: { [file]: csv }, db: { tables } },
    tests: [
      {
        name: 'A first load',
        about: 'No checkpoint yet. All four lines are staged and the checkpoint says 4.',
        trigger: { file: { path: file } },
        expect: { noError: true, db: { sales_hist_staging: { count: 4 }, load_checkpoint: { has: [{ file_name: name, last_line: 4 }] } }, files: { [`/sales/hist/done/${name}`]: { exists: true } } },
      },
      {
        name: 'A restart after a crash',
        about: 'The app died after lines 1 and 2 were committed, and the checkpoint says 2. The file is dropped in again. Only lines 3 and 4 are loaded: no key clash and no line twice.',
        trigger: { file: { path: file } },
        overrides: { systems: { db: { tables: restart } } },
        expect: { db: { sales_hist_staging: { count: 4, has: [{ line: 3, sku: 'RUG-160-OAT' }, { line: 4 }] }, load_checkpoint: { has: [{ last_line: 4 }] } } },
      },
      {
        name: 'The checkpoint update fails',
        about: 'The staging rows of the group are rolled back with it. Staging and checkpoint still agree, so a restart loads the group again and nothing is lost or doubled.',
        trigger: { file: { path: file } },
        overrides: { systems: { db: { failWhen: [{ match: 'MERGE INTO dbo.load_checkpoint', fault: 'QUERY_EXECUTION' }] } } },
        expect: { db: { sales_hist_staging: { count: 0 }, load_checkpoint: { count: 0 } } },
      },
    ],
  },
  referenceFlow: design(
    flow('sales-history-load', source('file-listener', { directory: '/sales/hist/in', matcher: 'SALES_HIST_*.csv', postAction: 'none', timeBetweenSizeCheck: 30000 }), [
      step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
      step('set-variable', { variableName: 'fileName', value: '#[attributes.fileName]' }),
      step('db-select', { database: 'SQL Server', sql: 'SELECT last_line FROM dbo.load_checkpoint WHERE file_name = :fileName', inputParameters: '#[{ fileName: vars.fileName }]', target: 'checkpoint' }),
      step('set-variable', { variableName: 'done', value: '#[vars.checkpoint[0].last_line default 0]' }),
      step('logger', { level: 'INFO', message: '#["Loading " ++ vars.fileName ++ " after line " ++ (vars.done as String)]' }),
      router(
        'batch-job',
        { jobName: 'sales-history-load', blockSize: 500, maxFailedRecords: -1 },
        [
          route({ name: 'stage', acceptPolicy: 'NO_FAILURES', acceptExpression: '#[(payload.line as Number) > vars.done]' }, [
            step('transform', { script: '%dw 2.0\noutput application/java\n---\n{ file_name: vars.fileName, line: payload.line as Number, store: payload.store, sku: payload.sku, units: payload.units as Number }' }),
            scope('batch-aggregator', { size: 500, streaming: 'false' }, [
              scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
                step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.sales_hist_staging (file_name, line, store, sku, units) VALUES (:file_name, :line, :store, :sku, :units)', target: 'inserted' }),
                step('db-update', { database: 'SQL Server', sql: checkpointMerge, inputParameters: '#[{ fileName: vars.fileName, lastLine: max(payload map $.line) }]' }),
              ]),
            ]),
          ]),
        ],
        {
          onComplete: [step('logger', { level: 'INFO', message: '#["Sales history " ++ vars.fileName ++ ": staged=" ++ (payload.successfulRecords as String) ++ " failed=" ++ (payload.failedRecords as String)]' })],
        },
      ),
      step('file-move', { sourcePath: '#[vars.filePath]', targetPath: '/sales/hist/done' }),
    ]),
  ),
  description: `
Marrow & Pine Home, a fictional home furnishings retailer, sends the planning platform a weekly sales history. A file \`SALES_HIST_<week>.csv\` lands on a mounted share, folder \`/sales/hist/in\`, with about **6 million lines**. Each line has its own number:

\`\`\`
line,store,sku,units
1,0101,SOFA-3S-GRY,1
\`\`\`

A Batch Job bulk inserts groups of 500 into \`dbo.sales_hist_staging\` (key \`file_name\` + \`line\`). A load takes about 90 minutes.

Last week the app was redeployed 60 minutes into a load. Support dropped the file in again. The new load started from line 1: the first groups failed on the key, and the job took 90 minutes again.

The DBA has added \`dbo.load_checkpoint\` (\`file_name\`, \`last_line\`).

**Requirements**
- Read the checkpoint for the file before the job starts. No row means line 0.
- Skip every line at or below the checkpoint, without reading the whole file into memory first.
- With each group, stage the rows and move the checkpoint to the group's highest line. The two must never disagree.
- Move the file to \`/sales/hist/done\`.

**Design the flow.**
`,
  answerTemplate: `## Reading the checkpoint

## Skipping done lines

## Staging and the checkpoint together

## Why the transaction
`,
  keyPoints: [
    'A checkpoint is a small row that says how far a load got. A restart reads it and carries on from there.',
    'An accept expression on the batch step skips records one at a time as they stream past. A filter in a Transform before the job would need the whole file first.',
    'The staging insert and the checkpoint update must commit together. Otherwise a crash between them loads a group twice or skips it.',
    'This works because groups commit in line order here. With several threads, groups can finish out of order; then keep a checkpoint per group, or rely on an idempotent MERGE instead.',
    'Variables set before the Batch Job, such as done and fileName, can be read in the accept expression and in the steps.',
  ],
  solution: `
1. **File On New or Updated File** on \`/sales/hist/in\`, size check wait 30 seconds. **Set Variable** \`filePath\` and \`fileName\`.
2. **Database Select** the checkpoint (target \`checkpoint\`). **Set Variable** \`done\` = \`vars.checkpoint[0].last_line default 0\`.
3. **Batch Job**, step \`stage\` with accept expression \`#[(payload.line as Number) > vars.done]\`:
   - **Transform** with \`file_name\`.
   - **Batch Aggregator** (size 500): **Try** ALWAYS_BEGIN with **Bulk Insert** into staging and **Database Update** with a MERGE of the checkpoint to \`max(payload map $.line)\`.
4. **File Move** to \`done\`.

**Out of order groups.** Mule runs blocks on several threads, so in a real job a later group can commit before an earlier one. Take the checkpoint as a hint and keep the staging key: a line that was already loaded fails on the key in its own group, which the row by row fallback handles. Check how your Mule version orders blocks before you rely on strict order.
`,
  followUps: [
    {
      q: 'How else could a restart skip done lines?',
      a: 'Make the write idempotent with a MERGE on file and line. A restart then writes the first lines again without harm. It costs the time of those lines but needs no checkpoint.',
    },
    {
      q: 'Mule batch keeps its own queues on disk. Does a restarted app not carry on by itself?',
      a: 'It can, when the app restarts on the same persistent store. A redeploy to new replicas may not have it. A checkpoint in the database works whatever the runtime kept.',
    },
  ],
}

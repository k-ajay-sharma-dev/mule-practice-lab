import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

const name = 'COSTS_SUP-HAYDEN_20261113.csv'
const file = `/costs/in/${name}`
const csv = 'supplier_id,sku,unit_cost,lead_days\nSUP-HAYDEN,JKT-RAIN-M,31.40,21\nSUP-HAYDEN,SOCK-WOOL-L,4.10,14\nSUP-HAYDEN,FLEECE-NAVY-L,18.90,21'
const noCost = 'supplier_id,sku,unit_cost,lead_days\nSUP-HAYDEN,JKT-RAIN-M,31.40,21\nSUP-HAYDEN,SOCK-WOOL-L,,14'
const existing = [
  { supplier_id: 'SUP-HAYDEN', sku: 'JKT-RAIN-M', unit_cost: 29.9, lead_days: 21, updated_file: 'COSTS_SUP-HAYDEN_20261001.csv' },
  { supplier_id: 'SUP-HAYDEN', sku: 'SOCK-WOOL-L', unit_cost: 3.95, lead_days: 14, updated_file: 'COSTS_SUP-HAYDEN_20261001.csv' },
  { supplier_id: 'SUP-ORCHARD', sku: 'JKT-RAIN-M', unit_cost: 30.5, lead_days: 28, updated_file: 'COSTS_SUP-ORCHARD_20261020.csv' },
]
const tables = {
  supplier_item: {
    key: ['supplier_id', 'sku'],
    columns: ['supplier_id', 'sku', { name: 'unit_cost', notNull: true }, 'lead_days', 'updated_file'],
    rows: existing,
  },
}
const merge =
  'MERGE INTO dbo.supplier_item AS t\nUSING (SELECT :supplier_id AS supplier_id, :sku AS sku, :unit_cost AS unit_cost, :lead_days AS lead_days, :file_name AS file_name) AS s\nON t.supplier_id = s.supplier_id AND t.sku = s.sku\nWHEN MATCHED THEN UPDATE SET unit_cost = s.unit_cost, lead_days = s.lead_days, updated_file = s.file_name\nWHEN NOT MATCHED THEN INSERT (supplier_id, sku, unit_cost, lead_days, updated_file) VALUES (s.supplier_id, s.sku, s.unit_cost, s.lead_days, s.file_name);'

export default {
  id: 'fl-214',
  category: 'flows',
  title: 'Supplier Cost Files Into SQL Server With MERGE: Update the Rows That Exist, Insert the New Ones, and Never Fail on a Key Clash',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'sql-server', 'merge', 'upsert', 'bulk', 'transaction', 'ftp'],
  estMinutes: 30,
  flowChecks: [
    { label: 'Cost files are picked up from /costs/in once their size is stable', rule: { type: 'source', component: 'ftp-listener', where: { directory: '/costs/in', timeBetweenSizeCheck: { gte: 1 } } } },
    { label: 'Each row is applied to dbo.supplier_item with a MERGE in one bulk operation', rule: { type: 'exists', component: 'db-bulk-update', where: { sql: { all: ['MERGE', 'supplier_item', 'WHEN MATCHED', 'WHEN NOT MATCHED'] } } } },
    { label: 'The whole file is applied in one transaction', rule: { type: 'inside', component: 'db-bulk-update', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' } } },
    { label: 'The file is archived to /costs/archive, or moved to /costs/error when it fails', rule: { type: 'all', rules: [{ type: 'before', first: 'try', then: 'ftp-move', thenWhere: { targetPath: '/costs/archive' } }, { type: 'inside', component: 'ftp-move', within: ['on-error-propagate', 'on-error-continue'], where: { targetPath: '/costs/error' } }] } },
  ],
  simulation: {
    systems: { files: { [file]: csv }, db: { tables } },
    tests: [
      {
        name: 'Known and new items',
        about: 'Two costs change and one item is new. The table ends with four rows, the other supplier\'s row untouched, and no key clash.',
        trigger: { file: { path: file } },
        expect: {
          noError: true,
          db: {
            supplier_item: {
              count: 4,
              has: [
                { supplier_id: 'SUP-HAYDEN', sku: 'JKT-RAIN-M', unit_cost: 31.4, updated_file: name },
                { supplier_id: 'SUP-HAYDEN', sku: 'FLEECE-NAVY-L', unit_cost: 18.9 },
                { supplier_id: 'SUP-ORCHARD', sku: 'JKT-RAIN-M', unit_cost: 30.5 },
              ],
            },
          },
          files: { [`/costs/archive/${name}`]: { exists: true } },
        },
      },
      {
        name: 'A row with no cost',
        about: 'The second row has no cost and the column cannot be empty. The first row\'s change is rolled back too, and the file goes to the error folder.',
        trigger: { file: { path: file } },
        overrides: { systems: { files: { [file]: noCost } } },
        expect: { db: { supplier_item: { count: 3, has: [{ supplier_id: 'SUP-HAYDEN', sku: 'JKT-RAIN-M', unit_cost: 29.9 }] } }, files: { [`/costs/error/${name}`]: { exists: true } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'supplier-costs-in',
      source('ftp-listener', { directory: '/costs/in', matcher: 'COSTS_*.csv', postAction: 'none', timeBetweenSizeCheck: 10000 }),
      [
        step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
        step('set-variable', { variableName: 'fileName', value: '#[attributes.fileName]' }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/java\n---\npayload map ((r) -> {\n  supplier_id: r.supplier_id,\n  sku: r.sku,\n  unit_cost: if (isBlank(r.unit_cost)) null else r.unit_cost as Number,\n  lead_days: r.lead_days as Number,\n  file_name: vars.fileName\n})',
        }),
        scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [step('db-bulk-update', { database: 'SQL Server', sql: merge })]),
        step('ftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/costs/archive', overwrite: 'true' }),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Cost file " ++ (vars.fileName default "?") ++ " failed: " ++ error.description]' }),
          step('ftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/costs/error', overwrite: 'true' }),
        ]),
      ],
    ),
  ),
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, gets cost price files from its suppliers on its **FTP server**, folder \`/costs/in\`, named \`COSTS_<supplier>_<date>.csv\`. The planning platform uses the costs and lead times, read from the SQL Server table \`dbo.supplier_item\` (key \`supplier_id\` + \`sku\`; \`unit_cost\` NOT NULL, \`lead_days\`, \`updated_file\`).

A file holds every item the supplier sells: most rows already exist, some change, a few are new.

The first version used a plain bulk **INSERT**. It failed on the first row with "Violation of PRIMARY KEY constraint", and nothing loaded.

**Requirements**
- Pick up each file once its upload has finished.
- For each row: update the cost and lead time if the supplier and SKU exist, insert it if not. Record the file name.
- Apply a file completely or not at all.
- Archive a loaded file to \`/costs/archive\`; move a failed one to \`/costs/error\`.

**Design the flow.**
`,
  answerTemplate: `## Why the insert failed

## MERGE

## All or nothing

## Archive and error
`,
  keyPoints: [
    'MERGE matches on the key and either updates or inserts, in one statement. A key clash cannot happen.',
    'Run it as a bulk operation: the same statement with each row\'s parameters, in one round trip per batch.',
    'In SQL Server, end a MERGE with a semicolon. It is required for MERGE.',
    'A Try with ALWAYS_BEGIN rolls back the rows already merged when a later row fails.',
    'Two rows for the same key in one file are applied one after another here. A set based MERGE from a staging table would fail on that, so remove duplicates first.',
  ],
  solution: `
1. **FTP On New or Updated File** on \`/costs/in\`, \`COSTS_*.csv\`, size check wait 10 seconds.
2. **Set Variable** \`filePath\` and \`fileName\`.
3. **Transform** rows into typed values with \`file_name\`.
4. **Try** ALWAYS_BEGIN: **Database Bulk Update** with the MERGE.
5. **FTP Move** to \`/costs/archive\`.
6. Flow **On Error Propagate**: log, **FTP Move** to \`/costs/error\`.

\`\`\`sql
MERGE INTO dbo.supplier_item AS t
USING (SELECT :supplier_id AS supplier_id, :sku AS sku, ...) AS s
ON t.supplier_id = s.supplier_id AND t.sku = s.sku
WHEN MATCHED THEN UPDATE SET unit_cost = s.unit_cost, ...
WHEN NOT MATCHED THEN INSERT (...) VALUES (...);
\`\`\`

**Large files.** For hundreds of thousands of rows, bulk insert into a staging table and run one set based MERGE in a stored procedure. It is far fewer statements.
`,
  followUps: [
    {
      q: 'Two Mule workers load files for the same supplier at once. Can MERGE still clash?',
      a: 'Yes. MERGE checks and then inserts, and two sessions can both see "not matched". Use the HOLDLOCK hint on the target, or a unique key and a retry. Test it under load.',
    },
    {
      q: 'Why not delete the supplier\'s rows and insert them all again?',
      a: 'It works inside one transaction, but it loses rows the file left out by mistake and rewrites rows that did not change. MERGE touches only what the file names.',
    },
  ],
}

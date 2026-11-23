import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const blobA = { name: 'inbound/hartwell-2026-11-13.json', eTag: '0x8DD1A40' }
const blobB = { name: 'inbound/osgood-2026-11-13.json', eTag: '0x8DD1B77' }
const rowsA = [
  { supplier: 'HARTWELL', sku: 'SOFA-3S-GRY', cost: 412.0 },
  { supplier: 'HARTWELL', sku: 'CHAIR-OAK-2', cost: 96.5 },
]
const rowsB = [{ supplier: 'OSGOOD', sku: 'LAMP-FLOOR-BRS', cost: 38.2 }]
const tablesWith = (logged = [], staged = []) => ({
  processed_blob: { columns: ['blob_name', 'etag'], rows: logged },
  price_staging: { columns: ['blob_name', 'supplier', 'sku', 'cost'], rows: staged },
})
const calls = (download) => ({ 'azure-list-blobs': { payload: [blobA, blobB] }, 'azure-download-blob': download })

export default {
  id: 'fl-273',
  category: 'flows',
  title: 'Supplier Price Blobs Polled Every Ten Minutes: Know Each Blob by Its Name and eTag, So an Overwritten Blob Loads Again, an Unchanged One Never Does, and One Bad Blob Never Stops the Rest',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'azure-blob', 'polling', 'etag', 'idempotency', 'sql-server', 'staging'],
  estMinutes: 35,
  flowChecks: [
    { label: 'The blobs in supplier-prices are listed on a schedule', rule: { type: 'exists', component: 'azure-list-blobs', where: { containerName: 'supplier-prices' } } },
    { label: 'Each blob is looked up in processed_blob by its eTag too', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['processed_blob', 'etag'] } } } },
    { label: 'The lookup comes before the download', rule: { type: 'before', first: 'db-select', firstWhere: { sql: 'processed_blob' }, then: 'azure-download-blob' } },
    { label: 'The blob is logged in processed_blob after its rows are staged', rule: { type: 'before', first: 'db-bulk-insert', firstWhere: { sql: 'price_staging' }, then: 'db-insert', thenWhere: { sql: 'processed_blob' } } },
  ],
  simulation: {
    systems: { db: { tables: tablesWith() }, calls: calls([{ payload: rowsA }, { payload: rowsB }]) },
    tests: [
      {
        name: 'Two new blobs',
        about: 'Both blobs are new. Their three rows are staged and both are logged with their eTags.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          connector: [{ type: 'azure-download-blob', count: 2 }],
          db: { price_staging: { count: 3, has: [{ blob_name: blobB.name, sku: 'LAMP-FLOOR-BRS' }] }, processed_blob: { count: 2, has: [{ blob_name: blobA.name, etag: blobA.eTag }] } },
        },
      },
      {
        name: 'A blob already loaded',
        about: 'Hartwell\'s blob was loaded with the same eTag. Only Osgood\'s blob is downloaded.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { tables: tablesWith([{ blob_name: blobA.name, etag: blobA.eTag }], [{ blob_name: blobA.name, supplier: 'HARTWELL', sku: 'SOFA-3S-GRY', cost: 412.0 }]) }, calls: calls([{ payload: rowsB }]) } },
        expect: { noError: true, connector: [{ type: 'azure-download-blob', count: 1, settings: { fileName: blobB.name } }], db: { price_staging: { count: 2 } } },
      },
      {
        name: 'A blob overwritten with new costs',
        about: 'Hartwell overwrote its blob, so the eTag changed. It loads again and its new rows replace the old ones.',
        trigger: { schedule: {} },
        overrides: {
          systems: {
            db: { tables: tablesWith([{ blob_name: blobA.name, etag: '0x8DD0F11' }], [{ blob_name: blobA.name, supplier: 'HARTWELL', sku: 'SOFA-3S-GRY', cost: 399.0 }, { blob_name: blobA.name, supplier: 'HARTWELL', sku: 'CHAIR-OAK-2', cost: 90.0 }]) },
          },
        },
        expect: { noError: true, db: { price_staging: { count: 3, has: [{ sku: 'SOFA-3S-GRY', cost: 412.0 }], lacks: [{ sku: 'SOFA-3S-GRY', cost: 399.0 }] }, processed_blob: { has: [{ blob_name: blobA.name, etag: blobA.eTag }] } } },
      },
      {
        name: 'One download fails',
        about: 'Hartwell\'s blob cannot be read. It is not logged, so the next run tries it again, and Osgood\'s blob still loads.',
        trigger: { schedule: {} },
        overrides: { systems: { calls: calls([{ fault: { type: 'AZURE-STORAGE:CONNECTIVITY', description: 'The storage account did not answer' } }, { payload: rowsB }]) } },
        expect: { noError: true, db: { price_staging: { count: 1, has: [{ sku: 'LAMP-FLOOR-BRS' }] }, processed_blob: { count: 1, lacks: [{ blob_name: blobA.name }] } }, logs: [{ level: 'ERROR', has: 'hartwell' }] },
      },
    ],
  },
  referenceFlow: design(
    flow('supplier-price-blobs', source('scheduler', { strategy: 'fixed-frequency', frequency: 10, timeUnit: 'MINUTES' }), [
      step('azure-list-blobs', { containerName: 'supplier-prices', blobPath: 'inbound/' }),
      scope('foreach', { collection: '#[payload]', batchSize: 1 }, [
        step('set-variable', { variableName: 'blob', value: '#[payload]' }),
        step('db-select', {
          database: 'SQL Server',
          sql: 'SELECT blob_name FROM dbo.processed_blob WHERE blob_name = :name AND etag = :etag',
          inputParameters: '#[{ name: vars.blob.name, etag: vars.blob.eTag }]',
          target: 'seen',
        }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[isEmpty(vars.seen)]' }, [
              scope(
                'try',
                { transactionalAction: 'INDIFFERENT' },
                [
                  step('azure-download-blob', { container: 'supplier-prices', fileName: '#[vars.blob.name]' }),
                  step('transform', { script: '%dw 2.0\noutput application/java\n---\npayload map { blob_name: vars.blob.name, supplier: $.supplier, sku: $.sku, cost: $.cost }' }),
                  step('db-delete', { database: 'SQL Server', sql: 'DELETE FROM dbo.price_staging WHERE blob_name = :name', inputParameters: '#[{ name: vars.blob.name }]', target: 'cleared' }),
                  step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.price_staging (blob_name, supplier, sku, cost) VALUES (:blob_name, :supplier, :sku, :cost)' }),
                  step('db-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.processed_blob (blob_name, etag) VALUES (:name, :etag)', inputParameters: '#[{ name: vars.blob.name, etag: vars.blob.eTag }]' }),
                ],
                {
                  errorHandlers: [handler('on-error-continue', { type: 'ANY' }, [step('logger', { level: 'ERROR', message: '#["Blob " ++ vars.blob.name ++ " not loaded: " ++ error.description]' })])],
                },
              ),
            ]),
          ],
          { otherwise: [step('logger', { level: 'DEBUG', message: '#["Blob " ++ vars.blob.name ++ " already loaded"]' })] },
        ),
      ]),
    ]),
  ),
  description: `
Marrow & Pine Home, a fictional home furnishings retailer, gets supplier costs as JSON blobs in the **Azure Blob Storage** container \`supplier-prices\`, folder \`inbound/\`. Suppliers write a blob per day and sometimes **overwrite** it with corrected costs. Nobody may delete or move the blobs: the buying team reads them too.

A blob holds rows like \`{ "supplier": "HARTWELL", "sku": "SOFA-3S-GRY", "cost": 412.0 }\`. List Blobs gives each blob's \`name\` and \`eTag\` (check the shape your connector version returns; some nest the eTag under properties). Azure gives a blob a new eTag every time it is written.

SQL Server has:
- \`dbo.price_staging\` (\`blob_name\`, \`supplier\`, \`sku\`, \`cost\`).
- \`dbo.processed_blob\` (\`blob_name\`, \`etag\`): one row for each blob version loaded.

The first version kept the time of the last run and loaded blobs changed since then. Clock drift between Mule and Azure made it miss a corrected blob, and a rerun loaded a whole day twice.

**Requirements**
- Every 10 minutes, list the container and load each blob version **once**.
- A blob overwritten with new content loads again, and its new rows **replace** its old ones.
- A blob that fails must not stop the others, and must be tried again on the next run.

**Facts**
- Look a blob up with \`SELECT ... FROM dbo.processed_blob WHERE blob_name = ... AND etag = ...\`.
- Write the \`processed_blob\` row only after the blob's rows are staged.
- A blob that fails is logged at ERROR with its name.

**What each system sends back**
- List Blobs gives a list, one entry per blob:
\`\`\`json
[ { "name": "inbound/hartwell-2026-11-13.json", "eTag": "0x8DD1A40" } ]
\`\`\`
- The lookup select gives a list of rows, empty when this name and eTag were never loaded.
- Download Blob replaces the payload with the blob's JSON list of rows.

**What failures look like**
- A blob that cannot be read: Download Blob raises a connectivity error (\`AZURE-STORAGE:CONNECTIVITY\` here, "The storage account did not answer"). Log it at ERROR, write no \`processed_blob\` row, and go on with the next blob.

**Design the flow.**
`,
  answerTemplate: `## Listing and the processed log

## Loading one blob

## Failures
`,
  keyPoints: [
    'A name alone cannot tell an overwritten blob from the one you loaded. Name plus eTag can: the eTag changes with every write.',
    'Log the blob after its rows are staged. A failure before the log leaves no row, so the next run picks it up again.',
    'Delete the blob\'s staged rows before the insert. A reload then replaces them, and a run that died between staging and logging does no harm when it runs again.',
    'A Try with On Error Continue inside the For Each keeps one bad blob from stopping the others.',
    'No time watermark: the processed log compares what Azure says with what you loaded, so clock drift does not matter.',
  ],
  solution: `
1. **Scheduler** every 10 minutes. **List Blobs** in \`supplier-prices\`, folder \`inbound/\`.
2. **For Each** blob:
   - **Set Variable** \`blob\`.
   - **Database Select** \`processed_blob\` by name and eTag (target \`seen\`).
   - **Choice**: not seen, a **Try**:
     - **Download Blob**, **Transform** with \`blob_name\`.
     - **Database Delete** the blob's rows from \`price_staging\`, **Bulk Insert** the new ones.
     - **Database Insert** into \`processed_blob\`.
     - **On Error Continue**: **Logger** ERROR.
   - otherwise: **Logger** DEBUG.

**The log grows.** One row per blob version is small, but clean rows older than the blobs you keep, for example after 90 days.
`,
  followUps: [
    {
      q: 'A supplier is still writing a large blob when the listing runs. What could go wrong?',
      a: 'Block blobs become visible only when the writer commits the block list, so a reader normally sees the old version or the new one, not half. A writer that uploads several blobs as a set is another matter: ask for a marker blob written last.',
    },
    {
      q: 'Why not use Event Grid instead of listing every ten minutes?',
      a: 'Events remove the polling, but an event can be missed while Mule is down. Many teams keep a slow listing like this one as a safety net next to the events, and the processed log makes both safe together.',
    },
  ],
}

import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-071',
  category: 'flows',
  title: 'Partner Price Files over Plain FTP into SQL Server with Archive and Error Folders',
  level: 'INTERMEDIATE',
  tags: ['ftp', 'csv', 'sql-server', 'bulk-insert', 'file-polling', 'archive', 'error-handling'],
  estMinutes: 30,
  flowChecks: [
    {
      label: 'Price files are picked up by an FTP listener that moves processed files to /archive',
      rule: { type: 'source', component: 'ftp-listener', where: { moveTo: 'archive' } },
    },
    {
      label: 'A file still being uploaded is not read: the listener waits for its size to stop changing',
      rule: { type: 'source', component: 'ftp-listener', where: { timeBetweenSizeCheck: { gte: 1000 } } },
    },
    {
      label: 'The original file path is kept in a variable before later steps overwrite the attributes',
      rule: { type: 'exists', component: 'set-variable', where: { value: 'attributes.path' } },
    },
    { label: 'CSV rows are mapped to table columns before they are inserted', rule: { type: 'before', first: 'transform', then: 'db-bulk-insert' } },
    {
      label: 'Rows are loaded with a Bulk Insert against SQL Server',
      rule: { type: 'exists', component: 'db-bulk-insert', where: { database: 'SQL Server' } },
    },
    {
      label: 'Large files are inserted in chunks (For Each with a batch size of at least 100)',
      rule: { type: 'inside', component: 'db-bulk-insert', within: 'foreach', withinWhere: { batchSize: { gte: 100 } } },
    },
    {
      label: 'A file is loaded all or nothing: every insert runs inside a Try with ALWAYS_BEGIN',
      rule: { type: 'inside', component: 'db-bulk-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' } },
    },
    {
      label: 'A file that fails is moved from its saved path to /error, and the error propagates so it is not archived',
      rule: { type: 'inside', component: 'ftp-move', within: 'on-error-propagate', where: { targetPath: 'error', sourcePath: 'vars.' } },
    },
  ],
  referenceFlow: design(
    flow(
      'partner-price-file-intake',
      // Listener config: outputMimeType application/csv, matcher plus timeBetweenSizeCheck on the listener (files arrive slowly),
      // applyPostActionWhenFailed="false" so a failed file is not moved to /archive, primaryNodeOnly in a cluster.
      source('ftp-listener', { directory: '/outbound/prices', matcher: 'PRICES_*.csv', postAction: 'move', moveTo: '/archive', timeBetweenSizeCheck: 30000, watermarkEnabled: 'false' }),
      [
        step('set-variable', { variableName: 'originalPath', value: '#[attributes.path]' }),
        step('set-variable', { variableName: 'fileName', value: '#[attributes.fileName]' }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/java\n---\npayload map (row) -> {\n  sourceFile: vars.fileName,\n  sku: trim(row.ITEM_NO),\n  price: row.UNIT_PRICE as Number,\n  currency: upper(row.CURR default "EUR"),\n  validFrom: row.VALID_FROM as Date {format: "dd.MM.yyyy"}\n}',
        }),
        step('validation', { check: 'is-not-empty-collection', expression: '#[payload]', message: 'Price file contains no rows' }),
        scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
          // A re-delivered file replaces its own earlier staging rows.
          step('db-delete', { database: 'SQL Server', sql: 'DELETE FROM dbo.PARTNER_PRICE_STAGING WHERE SOURCE_FILE = :fileName' }),
          scope('foreach', { collection: '#[payload]', batchSize: 1000 }, [
            step('db-bulk-insert', {
              database: 'SQL Server',
              sql: 'INSERT INTO dbo.PARTNER_PRICE_STAGING (SOURCE_FILE, SKU, PRICE, CURRENCY, VALID_FROM)\nVALUES (:sourceFile, :sku, :price, :currency, :validFrom)',
            }),
          ]),
          // MERGE staging → dbo.PARTNER_PRICE inside SQL Server (one set-based statement).
          step('db-stored-procedure', { database: 'SQL Server', sql: '{ call dbo.usp_ApplyPartnerPrices(:fileName) }' }),
        ]),
        step('logger', { level: 'INFO', message: '#["Price file " ++ vars.fileName ++ " loaded, archived by the listener"]' }),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('ftp-move', { sourcePath: '#[vars.originalPath]', targetPath: '/error', overwrite: 'true' }),
          step('logger', { level: 'ERROR', message: '#["Price file " ++ (vars.fileName default "?") ++ " moved to /error: " ++ error.description]' }),
        ]),
      ],
    ),
  ),
  description: `
A wholesale partner still runs a **legacy FTP server** (plain FTP, no SFTP or HTTPS available). Twice a day it drops a price list \`PRICES_yyyyMMdd_HHmm.csv\` into \`/outbound/prices\` — about **40,000 rows** (\`ITEM_NO;UNIT_PRICE;CURR;VALID_FROM\`, dates as \`dd.MM.yyyy\`).

The prices must be loaded into **SQL Server** (\`dbo.PARTNER_PRICE\`) for the pricing engine.

**Requirements**
- A file is loaded **completely or not at all** — the pricing engine must never see half a price list.
- Successfully processed files go to \`/archive\` on the FTP server; files that fail go to \`/error\` so the partner manager can look at them.
- The same file must not be processed again on the next poll.
- The partner's upload of a 3 MB file takes up to a minute over a slow line.
- The integration runs on two clustered Mule runtimes.

**Design the flow.** Also explain what plain FTP means for security and networking.
`,
  answerTemplate: `## Picking up the file (listener settings)

## Parsing and mapping the CSV

## Loading into SQL Server

## Archive and error folders

## Plain FTP: security and firewall

## Cluster and re-processing
`,
  keyPoints: [
    'Use FTP On New or Updated File with a filename pattern. Add a size-check delay (timeBetweenSizeCheck) so a file is only ready once its size stops changing. Add a post action (moveToDirectory /archive) so the file is not picked up again.',
    'applyPostActionWhenFailed defaults to true; set it to false and move failed files to /error in the error handler, otherwise broken files also land in /archive.',
    'Keep attributes.path in a variable at the start — after a Database operation the attributes describe that operation, not the file.',
    'DataWeave maps CSV rows to typed values (Number, Date); a Bulk Insert with parameterised SQL loads them in chunks of ~1,000 inside one transaction (Try ALWAYS_BEGIN).',
    'Load into a staging table and MERGE into the target in SQL Server, so a file replaces prices atomically.',
    'Plain FTP sends credentials and data unencrypted and needs passive mode through firewalls; push the partner towards SFTP and restrict by IP meanwhile. Run the listener on the primary node only in a cluster.',
  ],
  solution: `
1. **FTP On New or Updated File** on \`/outbound/prices\`, matcher \`PRICES_*.csv\`, and \`timeBetweenSizeCheck\` on the listener (e.g. 30 s) so a file still being uploaded is not read. Output MIME type \`application/csv\` (separator \`;\`). Post action **moveToDirectory \`/archive\`**, \`applyPostActionWhenFailed="false"\`, \`primaryNodeOnly="true"\` (otherwise both cluster nodes pick up the same file). Watermark is not needed because the file leaves the folder.
2. **Set Variable** \`originalPath = attributes.path\` and \`fileName\` — later operations replace \`attributes\`.
3. **Transform**: CSV rows → \`{ sourceFile, sku, price as Number, currency, validFrom as Date {format: "dd.MM.yyyy"} }\`. A malformed number or date fails here, before anything is written. Validate the list is not empty.
4. **Try (ALWAYS_BEGIN)** on the SQL Server config:
   - **Delete** earlier staging rows for the same file name (makes a re-delivery safe).
   - **For Each** (\`batchSize\` 1000) → **Bulk Insert** into \`dbo.PARTNER_PRICE_STAGING\` with \`:named\` parameters.
   - **Stored Procedure** \`dbo.usp_ApplyPartnerPrices(:fileName)\` runs a \`MERGE\` into \`dbo.PARTNER_PRICE\`.
   Commit at the end of the Try; any error rolls the whole file back.
5. On success the listener moves the file to \`/archive\`.
6. **On Error Propagate** → **FTP Move** \`vars.originalPath\` → \`/error\` (overwrite true, so a second failure of the same name does not fail the handler) and log the reason. Propagate so the failure shows in monitoring and the post action is not applied.

**Plain FTP:** user name, password and data go over the network in clear text. Use passive mode (the server opens data ports; the firewall must allow that range), restrict the partner connection to a VPN or IP allow-list, keep the credentials in secure properties, and plan a move to SFTP.
`,
  followUps: [
    {
      q: 'Why not use On Error Continue in the flow error handler?',
      a: 'On Error Continue tells the source that processing succeeded, so the listener would apply its post action and try to move the file to /archive. That fails or hides the problem because the handler already moved it to /error. On Error Propagate marks the execution as failed.',
    },
    {
      q: 'How do you avoid reading a file the partner is still uploading?',
      a: 'Use the size check on the listener (timeBetweenSizeCheck): the connector checks the size twice and the file is ready when both checks match. The FTP docs do not say what happens when they differ, so test that. Better still, ask the partner to upload under a temporary name and rename when done, and match only the final name.',
    },
    {
      q: 'Why load a staging table instead of inserting straight into dbo.PARTNER_PRICE?',
      a: 'The MERGE in one statement updates existing SKUs, inserts new ones and can expire missing ones; the pricing engine sees the change at commit time. Staging also keeps the raw file content for troubleshooting.',
    },
    {
      q: 'What would you change if files reached 2 million rows?',
      a: 'Stream the CSV (streaming=true on the reader), keep For Each batching so memory stays flat, and consider a Batch Job or SQL Server bulk load tools; one transaction over millions of rows also grows the log, so commit per chunk into staging and switch atomically with the MERGE.',
    },
  ],
}

export default {
  id: 'ms-013',
  category: 'mulesoft',
  title: 'Database Connector: Parameterized Queries, Bulk Insert and Streaming',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'database', 'sql-injection', 'bulk', 'streaming', 'watermark'],
  estMinutes: 20,
  quiz: [
    {
      type: 'single',
      prompt: 'How do you fix the SQL injection in `WHERE status = \'" ++ attributes.queryParams.status ++ "\'`?',
      options: [
        'Use `:status` in the SQL and pass the value as an input parameter',
        'Escape single quotes in the value with the DataWeave `replace`',
        'URL-decode the query parameter before concatenating it',
        'Run the select inside a read-only database transaction',
      ],
      answer: 0,
      explain: 'Bound parameters are sent separately from the SQL text, so the database never interprets the value as code. Manual escaping is error-prone.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The client also sends `sortBy` for the ORDER BY. How do you handle it safely?',
      options: [
        'Bind it as a `:sortBy` input parameter like any other value',
        'Map it through an allow-list of known column names',
        'Concatenate it, because an ORDER BY cannot be exploited',
        'Escape it with `replace` before adding it to the SQL text',
      ],
      answer: 1,
      explain: 'Identifiers such as column names **cannot be bound** as parameters. An allow-list (`{ date: "updated_at", ... }[sortBy] default "updated_at"`) means raw input never reaches the SQL text.',
    },
    {
      type: 'single',
      prompt: 'Inserting 50,000 rows one by one in a For Each takes 25 minutes. What is the best fix?',
      options: [
        'Use the Bulk Insert operation with an array of records, in chunks of e.g. 1,000',
        'Use a Parallel For Each with the same single-row Insert and a larger pool',
        'Raise the DB connection pool max size so the single-row inserts run faster',
        'Build one INSERT text with all 50,000 rows in DataWeave and run it with Execute Script',
      ],
      answer: 0,
      explain: 'Bulk Insert parameterises the SQL once and executes it as a JDBC batch. Chunking bounds memory and transaction size.',
    },
    {
      type: 'multi',
      needsScenario: true,
      prompt: 'The 8-million-row export runs out of memory. Which changes help?',
      options: [
        'Set `fetchSize` so the driver fetches rows in pages',
        'Use a streaming DataWeave transform (`output application/csv deferred=true`) and write directly to the file',
        'Avoid logging the payload or calling `sizeOf(payload)`',
        'Switch the Select to `repeatable-in-memory-iterable` and raise the heap, so all rows fit in memory',
        'Set `maxRows` on the Select to 100,000 so no single result is too big',
      ],
      answer: [0, 1, 2],
      explain: 'The Select result is streamed; the problem is anything that materialises all rows. `fetchSize` pages rows from the driver, a deferred CSV writer streams them to the file, and logging or `sizeOf` would read them all into memory. In-memory streaming keeps everything in heap, the opposite of what you need. `maxRows` stops the error by cutting the export short, so the file is missing rows.',
    },
    {
      type: 'match',
      prompt: 'Match each attribute of the DB **On Table Row** listener to its purpose.',
      pairs: [
        ['`table="shipments"`', 'The table to poll'],
        ['`watermarkColumn="updated_at"`', 'Only rows with a higher value than the last run are emitted'],
        ['`idColumn="id"`', 'Identifies a row so it is not emitted twice'],
      ],
      explain: 'Mule stores the watermark for you and emits each new or changed row once. With 2 replicas, enable clustering with Primary Node Only on the listener so only the primary polls.',
    },
  ],
  description: `
A **Shipment System API** on PostgreSQL has three operations that a security review and a load test flagged:

1. \`GET /shipments?status=...&sortBy=...\` builds the SQL with DataWeave string concatenation:
   \`"SELECT * FROM shipments WHERE status = '" ++ attributes.queryParams.status ++ "' ORDER BY " ++ attributes.queryParams.sortBy\`
2. \`POST /shipments/import\` receives **50,000** rows as JSON and inserts them one by one inside a For Each: it takes 25 minutes.
3. A nightly export reads **8 million** rows with one Select and writes them to a CSV; the replica runs out of memory.

The team also needs a new feature: publish every shipment row **updated** since the last run to Anypoint MQ every 2 minutes.

**Questions**
1. What is wrong with operation 1 and how do you fix it, including the dynamic \`sortBy\`?
2. How do you speed up operation 2?
3. How do you fix the memory problem in operation 3? Which Select parameters matter?
4. How would you implement the "changed rows since last run" feature?
`,
  answerTemplate: `## SQL injection fix

## Bulk insert

## Streaming the export

## Changed rows since last run
`,
  keyPoints: [
    'Concatenating input into SQL allows SQL injection; use :named parameters with inputParameters so the driver binds values.',
    'Identifiers (column names in ORDER BY) cannot be bound as parameters: validate them against an allow-list.',
    'Use the Bulk Insert operation (one parameterized statement, array of records) instead of row-by-row inserts in For Each.',
    'Select returns a repeatable stream of rows; use fetchSize, and process it in a streaming way (DataWeave to CSV with deferred output / no full materialisation).',
    'Changed-rows feature: the DB On Table Row listener with watermarkColumn (and idColumn), or a Scheduler + Select with a watermark stored in a persistent Object Store.',
  ],
  solution: `
**1. SQL injection:** \`status = "x' OR '1'='1"\` changes the query. Use bound parameters:
\`\`\`xml
<db:select config-ref="pg">
  <db:sql>#["SELECT id, status, carrier, updated_at FROM shipments
          WHERE status = :status ORDER BY $(vars.sortColumn)"]</db:sql>
  <db:input-parameters>#[{ status: attributes.queryParams.status }]</db:input-parameters>
</db:select>
\`\`\`
Column names can't be bound as parameters, so build \`vars.sortColumn\` from an **allow-list**: \`{ date: "updated_at", carrier: "carrier" }[attributes.queryParams.sortBy] default "updated_at"\`. Only the allow-listed column name is interpolated into the SQL text; the value still travels as a bound \`:status\` parameter. Never pass raw input into identifiers. Also select only the columns you need instead of \`*\`.

**2. Bulk insert:** replace the For Each with **Bulk Insert**, passing an array of maps; the SQL is parameterized once and the driver executes it as a JDBC batch:
\`\`\`xml
<db:bulk-insert config-ref="pg">
  <db:bulk-input-parameters>#[payload]</db:bulk-input-parameters>
  <db:sql>INSERT INTO shipments (id, status, carrier) VALUES (:id, :status, :carrier)</db:sql>
</db:bulk-insert>
\`\`\`
For 50,000 rows, split into chunks (e.g. a For Each with \`batchSize\` of 1,000, or a Batch Job) to bound memory and transaction size. Wrap a chunk in a transaction if it must be all-or-nothing.

**3. Memory:** the Select result is streamed as rows are fetched. The problem is usually something that **materialises** all 8M rows (logging the payload, \`sizeOf(payload)\`, a DataWeave that needs random access, \`maxRows\` absent but \`payload\` converted to an array). Fix:
- Set \`fetchSize\` (e.g. 1,000 to 5,000) so the driver fetches in pages instead of holding everything (some drivers, PostgreSQL included, only honour fetch size inside a transaction / with auto-commit off).
- Use a DataWeave transform that streams (\`output application/csv deferred=true\`, sequential \`map\` only) and write directly with the File/SFTP write.
- Keep the default repeatable file-store iterable so overflow goes to disk, not heap.

**4. Changed rows:** two options:
- **Database "On Table Row" listener** with \`table="shipments"\`, \`watermarkColumn="updated_at"\` and \`idColumn="id"\`; Mule stores the watermark and emits each new/changed row once.
- **Scheduler + Select** \`WHERE updated_at > :lastRun ORDER BY updated_at\`, with \`lastRun\` kept in a **persistent Object Store** and updated only after a successful publish. Run on one node (clustering) to avoid duplicates.
`,
  followUps: [
    {
      q: 'Why use a stored procedure call or parameterized query instead of escaping quotes yourself?',
      a: 'Manual escaping is error-prone across data types and encodings. Bound parameters are sent separately from the SQL text, so the database never interprets the value as code.',
    },
    {
      q: 'How do you handle one bad row in a bulk insert?',
      a: 'A JDBC batch typically fails as a whole (or reports per-statement counts depending on the driver). Validate before inserting, use smaller chunks, and on failure fall back to inserting that chunk row by row to isolate the bad record.',
    },
    {
      q: 'Is the On Table Row watermark safe with two replicas?',
      a: 'Only if the source runs on one node: enable clustering and Primary Node Only on the listener so it runs on the primary. Otherwise each replica polls and emits the same rows.',
    },
  ],
}

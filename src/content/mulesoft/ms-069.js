export default {
  id: 'ms-069',
  category: 'mulesoft',
  title: 'Nightly Store Inventory Snapshot: Streaming Large Oracle Result Sets, fetchSize and CLOB/BLOB Columns',
  level: 'ADVANCED',
  tags: ['myproject', 'retail', 'supply-chain', 'oracle', 'database', 'streaming', 'fetch-size', 'clob', 'blob'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'The export reads 12 million rows with `db:select` and writes CSV to SFTP. It takes 3 hours, and Oracle shows millions of tiny fetch round trips. Which setting addresses that first?',
      options: [
        'fetchSize on db:select, as Oracle fetches 10 rows per trip',
        'maxRows on db:select, to cap the rows per round trip',
        'A larger pool, so several fetches run at once',
        'Repeatable in-memory streaming instead of file-store',
      ],
      answer: 0,
      explain: 'Set fetchSize to e.g. 1000 to 5000. fetchSize is a hint for how many rows the driver fetches per round trip; the Oracle driver default of 10 is far too small for bulk exports. maxRows limits the total rows returned, which is not the goal.',
    },
    {
      type: 'single',
      prompt: 'The export flow is `db:select` (12 million rows, default streaming), then a Logger with `sizeOf(payload)`, then the CSV transform. Heap stays fine, but the worker disk fills up and the export slows down. Why?',
      options: [
        'db:select loads all rows into a Java list, which then spills to disk',
        'sizeOf reads every row, and repeatable streaming buffers what it read',
        'The Logger writes every row to the log file while it counts them',
        'With fetchSize 10, the driver keeps each round trip in a disk cache',
      ],
      answer: 1,
      explain: 'db:select returns an iterator over the open result set, and the default repeatable streaming buffers what was read (in memory, then on disk) so the payload can be read again. sizeOf consumes the whole stream before the write, so all 12 million rows end up in that buffer. Rows are not loaded into a list up front. The Logger prints only the number. fetchSize sets rows per round trip and has no disk cache. Drop the count, or use non-repeatable streaming when you read the result exactly once.',
    },
    {
      type: 'multi',
      prompt: 'Which choices keep memory flat for the 12-million-row export?',
      options: [
        'A deferred CSV transform written straight to sftp:write',
        'Non-repeatable streaming on db:select when the result is read only once',
        'Logging the full payload at INFO so each nightly run can be traced',
        'Logging sizeOf(payload) as the row count before the SFTP write',
      ],
      answer: [0, 1],
      explain: 'Deferred output (`output application/csv deferred=true`) and a single read pass let rows flow from Oracle to SFTP. Logging the payload or sizeOf() consumes the whole stream (and with repeatable streaming buffers all of it) before the write.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'While the export runs, other flows that use the same DB config wait for connections. Why?',
      options: [
        'A streamed result holds its connection until fully read',
        'db:select locks the table, so other queries wait',
        'fetchSize reserves one connection per fetched batch',
        'Repeatable streaming opens a second connection to buffer',
      ],
      answer: 0,
      explain: 'The connection returns to the pool only when the cursor is closed. Long exports should use their own DB config/pool so they do not starve online traffic.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The table also has `LABEL_PDF BLOB` (pallet labels) and `NOTES CLOB`. How should the export treat them?',
      options: [
        'Leave them out of the CSV and fetch them on demand',
        'Include them, as LOBs cost nothing once the row is fetched',
        'Convert the BLOB to text in SQL with TO_CHAR',
        'Encode them as Base64 in the CSV so the partner has them',
      ],
      answer: 0,
      explain: 'LOB values are read through the open connection, add per-row cost and can be large. LOBs are fetched separately from the row data and can be megabytes each. Only select the columns the consumer needs (`SELECT *` is a common cause of slow exports).',
    },
    {
      type: 'order',
      prompt: 'Order the export flow.',
      items: [
        'Scheduler triggers the job on one node',
        'db:select with explicit columns, fetchSize and a dedicated pool',
        'DataWeave maps rows to CSV with deferred output',
        'sftp:write streams the file to a temporary name',
        'Rename to the final name after a successful write so the consumer never reads a partial file',
      ],
      explain: 'Read, transform and write as one stream, and publish the file atomically by renaming it at the end.',
    },
  ],
  description: `
A department-store group sends a **nightly store inventory snapshot** to its demand-planning partner: every SKU × store position from the Oracle table \`STORE_POSITION\` (~12 million rows) as a CSV on **SFTP** before 04:00.

\`\`\`sql
STORE_POSITION (STORE_ID, SKU, ON_HAND, ON_ORDER, IN_TRANSIT, SNAPSHOT_TS,
                NOTES CLOB, LABEL_PDF BLOB)
\`\`\`

The current flow:
\`\`\`xml
<db:select config-ref="oracle"><db:sql>SELECT * FROM store_position</db:sql></db:select>
<logger level="INFO" message="#['Rows: ' ++ sizeOf(payload)]"/>
<ee:transform> <!-- output application/csv --> </ee:transform>
<sftp:write config-ref="partnerSftp" path="snapshot.csv"/>
\`\`\`

Problems:
- It takes over 3 hours; the DBA sees "a huge number of tiny fetches".
- Worker memory and disk usage spike; the app was restarted twice with out-of-memory errors.
- During the export, the store **click-and-collect API**, which uses the same DB config, times out waiting for connections.
- The partner occasionally picks up a half-written file.

**Questions**
1. How does \`db:select\` stream rows in Mule 4, and what does fetchSize change?
2. What in the current flow breaks streaming and blows up memory?
3. How should CLOB and BLOB columns be handled in exports (and in inserts)?
4. Redesign the flow so it is fast, memory-safe and does not starve other APIs.
`,
  answerTemplate: `## Streaming and fetchSize

## What breaks streaming

## CLOB and BLOB

## Redesigned flow
`,
  keyPoints: [
    'db:select returns an iterator over an open result set; repeatable streaming (default) buffers consumed data in memory then on disk; non-repeatable reads once with no buffer.',
    'fetchSize controls rows per round trip; Oracle JDBC defaults to 10, so set 1000–5000 for bulk exports (maxRows is a different setting).',
    'sizeOf(payload), logging the payload or non-deferred transforms consume or materialise the entire stream before the write.',
    'A streamed result keeps a pooled connection until fully consumed; give long exports their own DB config/pool.',
    'Select explicit columns; LOBs are fetched separately and can be large, so leave them out of bulk exports and fetch on demand. For inserts, declare parameter types for CLOB/BLOB.',
    'Write to a temporary name and rename when complete so the partner never reads a partial file.',
  ],
  solution: `
**1. Streaming and fetchSize.** \`db:select\` returns an iterator over the JDBC result set; rows are fetched as the next processor consumes them. With the default **repeatable file-store** strategy, what was read is buffered (memory up to a limit, then temp files) so it can be re-read. \`fetchSize\` tells the driver how many rows to fetch per round trip. Oracle's default is **10**, i.e. 1.2 million round trips for 12 million rows.

**2. What breaks it.**
- \`sizeOf(payload)\` in the logger iterates the whole result set before the transform, and repeatable streaming buffers all 12 million rows to memory/disk.
- \`SELECT *\` drags two LOB columns into every row.
- The same pool serves online traffic, and the export holds a connection for hours.

**3. LOBs.**
- **Export**: list columns explicitly and leave \`NOTES\` and \`LABEL_PDF\` out. If the partner needs labels, export them as separate files on demand, keyed by store + SKU.
- **Reading**: LOB content is read through the open connection (each LOB can mean extra round trips), so read it in the same flow; a CLOB maps to text, a BLOB to binary content in DataWeave.
- **Inserting**: declare the types so the driver binds them as LOBs, e.g.
\`\`\`xml
<db:insert config-ref="oracle">
  <db:sql>INSERT INTO pallet_labels (pallet_id, label_pdf, notes) VALUES (:id, :pdf, :notes)</db:sql>
  <db:parameter-types>
    <db:parameter-type key="pdf" type="BLOB"/>
    <db:parameter-type key="notes" type="CLOB"/>
  </db:parameter-types>
  <db:input-parameters>#[{ id: vars.palletId, pdf: vars.pdfBytes, notes: vars.notes }]</db:input-parameters>
</db:insert>
\`\`\`

**4. Redesigned flow.**
\`\`\`xml
<db:config name="oracleExport">  <!-- dedicated small pool, e.g. maxPoolSize 2 -->
...
<db:select config-ref="oracleExport" fetchSize="2000">
  <non-repeatable-iterable/>
  <db:sql>SELECT store_id, sku, on_hand, on_order, in_transit, snapshot_ts FROM store_position</db:sql>
</db:select>
<ee:transform>
  <ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/csv deferred=true
---
payload map { store: $.STORE_ID, sku: $.SKU, onHand: $.ON_HAND, onOrder: $.ON_ORDER, inTransit: $.IN_TRANSIT }]]></ee:set-payload></ee:message>
</ee:transform>
<sftp:write config-ref="partnerSftp" path="snapshot.csv.tmp"/>
<sftp:rename config-ref="partnerSftp" path="snapshot.csv.tmp" to="snapshot.csv"/>
\`\`\`
- Row count: count in a separate \`SELECT COUNT(*)\` or write a trailer/control file instead of \`sizeOf\`.
- A dedicated config means online APIs keep their pool; check with the DBA that the extra sessions fit.
- Consider \`SELECT /*+ PARALLEL */\` or splitting by store range into several files if the window is still too tight.
`,
  followUps: [
    {
      q: 'Why not use a Batch Job for this export?',
      a: 'Batch adds per-record persistence in queues, which is overhead for a straight read-transform-write; a streaming flow is faster. Batch is useful when records need individual processing, error tracking or calls to other systems.',
    },
    {
      q: 'What happens if the SFTP connection drops halfway?',
      a: 'The write fails and the temp file is incomplete; the final name is never created, so the partner is safe. Rerun the job (possibly with a retry policy), which re-reads from Oracle.',
    },
    {
      q: 'Is the snapshot consistent if stores sell during the export?',
      a: 'Oracle gives statement-level read consistency, so one SELECT sees data as of its start, provided undo retention is long enough; otherwise you can get ORA-01555 (snapshot too old) on long queries.',
    },
  ],
}

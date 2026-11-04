export default {
  id: 'ms-070',
  category: 'mulesoft',
  title: 'End-of-Day POS Lines into Oracle: db:bulk-insert, Chunking and Isolating Error Rows',
  level: 'ADVANCED',
  tags: ['retail', 'pos', 'oracle', 'database', 'bulk-insert', 'error-handling', 'end-of-day'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'How does `db:bulk-insert` differ from `db:insert` inside a For Each over 400,000 POS lines?',
      options: [
        'bulk-insert sends one parameterised statement with many parameter sets as a JDBC batch, so far fewer round trips',
        'bulk-insert uses Oracle SQL*Loader under the hood',
        'bulk-insert skips constraints and triggers',
        'There is no difference; For Each is optimised into a batch automatically',
      ],
      answer: 0,
      explain: 'A JDBC batch executes the same statement with many sets of bind values in one go. It still runs normal conventional inserts — constraints and triggers apply.',
    },
    {
      type: 'single',
      prompt: 'One line in a chunk of 1,000 has a NULL in a NOT NULL column. With no transaction around the bulk insert, what should you assume?',
      options: [
        'The operation raises DB:QUERY_EXECUTION, and some rows of the chunk may already have been inserted — do not assume all-or-nothing',
        'Oracle skips the bad row and inserts the other 999',
        'Nothing at all is inserted, guaranteed',
        'Mule retries the chunk without the bad row automatically',
      ],
      answer: 0,
      explain: 'How much of a failing JDBC batch is applied depends on driver behaviour and commit mode. Make the outcome explicit: wrap the chunk in a transaction (all-or-nothing) and handle the failure yourself.',
    },
    {
      type: 'multi',
      prompt: 'Which design isolates bad rows while keeping bulk speed?',
      options: [
        'Validate lines in DataWeave first and route invalid ones to an error table/file with the reason',
        'Insert each chunk inside a Try with a LOCAL transaction so a failing chunk is rolled back cleanly',
        'When a chunk fails, re-insert that chunk row by row to find and park the bad rows, and insert the good ones',
        'Switch the whole load to row-by-row inserts permanently',
      ],
      answer: [0, 1, 2],
      explain: 'Pre-validation catches most problems cheaply; atomic chunks make failure predictable; the row-by-row fallback only runs for the rare failing chunk. Row-by-row everywhere throws away the bulk gain.',
    },
    {
      type: 'single',
      prompt: 'What is a reasonable chunk size to start with for bulk inserts of narrow POS lines into Oracle?',
      options: [
        'A few hundred to a few thousand rows per bulk call, then tune with measurements',
        'All 400,000 rows in one call',
        'Exactly 1 row — batches are risky',
        'It must equal the pool size',
      ],
      answer: 0,
      explain: 'Very large batches use a lot of memory and make failures expensive; very small ones lose the benefit. Start around 500–2,000 and measure.',
    },
    {
      type: 'order',
      prompt: 'Order the steps of the end-of-day load for one store file.',
      items: [
        'Parse the file and validate each line in DataWeave, splitting valid and invalid lines',
        'Write invalid lines to POS_LINE_ERRORS with the reason',
        'Split valid lines into chunks of ~1,000',
        'Bulk-insert each chunk in a LOCAL transaction; on failure fall back to row-by-row for that chunk',
        'Record the totals (lines, inserted, rejected) in a load-control table and alert on rejects',
      ],
      explain: 'Validation first, atomic chunks with a targeted fallback, then reconciliation totals so finance can trust the data.',
    },
    {
      type: 'single',
      prompt: 'The same store file is accidentally processed twice. Which safeguard prevents duplicate sales in Oracle?',
      options: [
        'A unique key on (STORE_ID, BUSINESS_DATE, TXN_ID, LINE_NO), with duplicates treated as already loaded',
        'A larger chunk size',
        'Running the flow with maxConcurrency 1',
        'Deleting the file after reading',
      ],
      answer: 0,
      explain: 'Only a business key in the database makes the load idempotent. Concurrency limits and file deletion reduce the chance but do not prevent a reprocessed file.',
    },
  ],
  description: `
A convenience-store chain receives an **end-of-day sales file** from each of its 1,800 stores (POS line items: store, business date, transaction ID, line number, SKU, quantity, price, discount, tender). A Mule app loads the lines into Oracle \`POS_SALES_LINES\` for replenishment and finance; on a normal day that is ~400,000 lines, and up to 2 million after promotions.

Current implementation: a For Each over the lines with a \`db:insert\` per line. It takes 2 hours. A developer switched to a single \`db:bulk-insert\` with all lines of a store and it was fast — until one line with a missing SKU caused \`DB:QUERY_EXECUTION\` (ORA-01400: cannot insert NULL), and nobody could tell which lines of that store were in the table and which were not. When the job was rerun, finance saw some sales twice.

**Questions**
1. How does \`db:bulk-insert\` work, and why is it so much faster than a For Each with \`db:insert\`?
2. What do you know (and not know) about the state of the table after a bulk insert fails?
3. Design a load that keeps bulk speed but isolates and reports bad rows.
4. How do you make reruns safe?
`,
  answerTemplate: `## How bulk insert works

## State after a failure

## Design with error isolation

## Safe reruns
`,
  keyPoints: [
    'db:bulk-insert executes one parameterised statement with an array of parameter maps as a JDBC batch, cutting round trips dramatically.',
    'When a batch fails you get DB:QUERY_EXECUTION; without a transaction, part of the batch may already be applied, so never assume all-or-nothing.',
    'Validate in DataWeave first, chunk the data (hundreds to a few thousand rows), and insert each chunk in a LOCAL transaction.',
    'On a failed chunk, fall back to row-by-row for that chunk to park bad rows with reasons and insert the good ones.',
    'Idempotency needs a business unique key (store, date, transaction, line); treat duplicates as already loaded and keep load-control totals for reconciliation.',
  ],
  solution: `
**1. Bulk insert.** The statement is prepared once and executed as a **JDBC batch** with one set of bind values per row:
\`\`\`xml
<db:bulk-insert config-ref="oracle">
  <db:sql>INSERT INTO pos_sales_lines (store_id, business_date, txn_id, line_no, sku, qty, price, discount)
          VALUES (:storeId, :businessDate, :txnId, :lineNo, :sku, :qty, :price, :discount)</db:sql>
  <db:bulk-input-parameters>#[payload]</db:bulk-input-parameters>
</db:bulk-insert>
\`\`\`
400,000 single inserts mean 400,000 round trips (plus statement handling); batches of 1,000 mean 400.

**2. State after a failure.** The operation raises \`DB:QUERY_EXECUTION\`. Which rows of the batch were applied depends on the driver and the commit mode — with auto-commit some earlier rows may already be in the table. That uncertainty is exactly what finance saw. Make it deterministic with a transaction per chunk.

**3. Design.**
\`\`\`xml
<ee:transform>  <!-- split into vars.valid / vars.invalid with reasons --> </ee:transform>
<db:bulk-insert config-ref="oracle"> <!-- invalid lines into POS_LINE_ERRORS --> </db:bulk-insert>
<foreach collection="#[vars.valid]" batchSize="1000">
  <try>
    <try transactionalAction="ALWAYS_BEGIN">
      <db:bulk-insert config-ref="oracle">...</db:bulk-insert>
    </try>
    <error-handler>
      <on-error-continue type="DB:QUERY_EXECUTION">
        <!-- rolled back: retry this chunk row by row -->
        <foreach collection="#[payload]">
          <try>
            <db:insert config-ref="oracle">...</db:insert>
            <error-handler>
              <on-error-continue type="DB:QUERY_EXECUTION">
                <db:insert config-ref="oracle"><!-- POS_LINE_ERRORS with error.description --></db:insert>
              </on-error-continue>
            </error-handler>
          </try>
        </foreach>
      </on-error-continue>
    </error-handler>
  </try>
</foreach>
\`\`\`
- **Pre-validate** in DataWeave (required fields, numeric ranges, known store) — most rejects never reach Oracle.
- **Atomic chunks**: the inner Try with a LOCAL transaction rolls the whole chunk back on error.
- **Fallback**: only the failing chunk is retried row by row, so bad rows are parked with the ORA message and good rows are loaded.
- For millions of rows with complex error handling, a **Batch Job** with a Batch Aggregator (size 1,000) gives the same pattern with built-in record-level failure tracking.
- An Oracle alternative is DML error logging (\`LOG ERRORS INTO err$_pos_sales_lines REJECT LIMIT UNLIMITED\`), agreed with the DBA.

**4. Safe reruns.** Add a unique constraint on \`(STORE_ID, BUSINESS_DATE, TXN_ID, LINE_NO)\`. On rerun, duplicates fail — treat ORA-00001 as "already loaded" in the row-by-row fallback, or use a MERGE that only inserts when not matched. Keep a **load-control** row per store file (file name, checksum, line count, inserted, rejected) and skip files already loaded successfully.
`,
  followUps: [
    {
      q: 'Does a transaction around each chunk slow the load down?',
      a: 'Slightly, because each chunk commits separately, but one commit per 1,000 rows is cheap compared to row-by-row auto-commit, and it makes failures predictable.',
    },
    {
      q: 'How would you parallelise loading 1,800 store files?',
      a: 'Process files concurrently with a bounded maxConcurrency, sized against the DB pool and Oracle capacity; each file keeps its own chunks and transactions, and the unique key protects against overlap.',
    },
    {
      q: 'What does db:bulk-insert return?',
      a: 'An array of update counts, one per parameter set, which you can sum to reconcile with the number of lines sent. Some drivers report -2 (success, count unknown) for batched statements, so check what your Oracle driver version returns before relying on the sum.',
    },
  ],
}

export default {
  id: 'inc-073',
  category: 'incidents',
  title: 'Deadlock Victims (Error 1205) During Parallel Bulk Price Updates in SQL Server',
  level: 'EXPERT',
  tags: ['sql-server', 'database', 'deadlock', 'parallel-for-each', 'bulk', 'retry', 'pricing'],
  estMinutes: 40,
  investigation: {
    logs: [
      { text: '2026-10-27 19:00:00 INFO  [deploy] price-sync v3.0.0: chunks of 5,000 rows processed with Parallel For Each (maxConcurrency=8), db:bulk-update', relevant: true, why: 'The release moved from sequential chunks to 8 parallel bulk updates against the same table.' },
      { text: '2026-10-28 02:00:05 INFO  [price-sync] 1,240,000 price changes received, 248 chunks (unsorted, as delivered by the PIM export)', relevant: true, why: 'Chunks are taken in delivery order, so parallel chunks touch overlapping pages and rows in different orders.' },
      { text: '2026-10-28 02:00:31 INFO  [health] GET /api/health 200 (2 ms)', relevant: false },
      { text: '2026-10-28 02:03:12 ERROR [price-sync] chunk 37: DB:QUERY_EXECUTION - Transaction (Process ID 87) was deadlocked on lock resources with another process and has been chosen as the deadlock victim. Rerun the transaction.', relevant: true, why: 'SQL Server error 1205: two parallel chunks waited on each other\'s locks and one was killed.' },
      { text: '2026-10-28 02:03:40 ERROR [price-sync] chunk 52: DB:QUERY_EXECUTION - ... chosen as the deadlock victim (1205)', relevant: false },
      { text: '2026-10-28 02:21:40 INFO  [price-sync] Completed: 231 chunks OK, 17 chunks failed — job status COMPLETED_WITH_ERRORS', relevant: true, why: 'Failed chunks are not retried, so 85,000 prices were never updated.' },
      { text: '2026-10-28 02:22:00 INFO  [dba] Execution plan for UPDATE item_price: clustered index scan (no index on sku, store_id)', relevant: true, why: 'Without an index on the WHERE columns each UPDATE scans and locks far more than it needs, which makes overlapping locks likely.' },
      { text: '2026-10-28 06:00:00 INFO  [store-sync] Price labels file sent to 210 stores', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What causes the deadlocks?',
        options: [
          'Eight parallel bulk updates lock overlapping rows/pages of the same table in different orders (amplified by a scan instead of an index seek), so SQL Server kills one of each deadlocked pair with error 1205',
          'The Parallel For Each loses messages',
          'SQL Server cannot run more than one UPDATE at a time',
          'The pool is too small',
        ],
        answer: 0,
        explain: 'Deadlocks need concurrency on overlapping resources acquired in different orders. v3.0.0 added the concurrency; unsorted chunks and table scans provide the overlap.',
      },
      {
        type: 'single',
        prompt: 'Prices go to stores at 06:00. What do you do now (03:00)?',
        options: [
          'Re-run only the 17 failed chunks sequentially, verify the counts, then let the 06:00 label run continue',
          'Re-run the whole job with maxConcurrency=32 to finish faster',
          'Cancel the 06:00 run and wait for tomorrow',
          'Ask the DBA to disable deadlock detection',
        ],
        answer: 0,
        explain: 'The failed chunks were rolled back; running them one at a time removes the concurrency that caused the deadlocks. More concurrency would make it worse.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the permanent fix?',
        options: [
          'Partition the work so parallel chunks never share keys (e.g. chunk by store_id or by SKU range) and sort rows inside each chunk by the clustered key',
          'Add an index supporting the UPDATE predicate (sku, store_id) so each update seeks and locks only its rows',
          'Retry a chunk that fails with error 1205 a few times with a short, varied delay; fail other DB:QUERY_EXECUTION errors immediately',
          'Choose maxConcurrency and chunk size by load testing, keeping each transaction short',
          'Use NOLOCK hints on the UPDATE statements',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Remove overlap, reduce locked resources, retry the true transient error, and tune concurrency. NOLOCK only applies to reads; updates always take locks.',
      },
      {
        type: 'order',
        prompt: 'Order the steps of a robust chunk execution.',
        items: [
          'Group price changes by store_id so each chunk owns a key range',
          'Sort the rows of the chunk by the clustered key',
          'Run the chunk\'s db:bulk-update inside its own short transaction',
          'On error 1205, wait briefly and retry the whole chunk (max 3 attempts)',
          'Record chunk result (ok / failed) for reconciliation and alerting',
        ],
        explain: 'Partitioning and ordering prevent most deadlocks; the retry handles the rest; the record makes failures visible.',
      },
    ],
  },
  description: `
## Symptoms
- Tuesday 03:00: the nightly **price-sync** job finished with **17 of 248 chunks failed**; ~85,000 store prices were not updated. Store labels are printed from SQL Server at 06:00.
- Errors: \`Transaction (Process ID 87) was deadlocked on lock resources with another process and has been chosen as the deadlock victim. Rerun the transaction.\`

## Change / Context
- Release v3.0.0 (Monday) changed the job from sequential chunks to a **Parallel For Each** with \`maxConcurrency="8"\` to finish faster. Each chunk (5,000 rows) runs \`db:bulk-update\`:
  \`UPDATE item_price SET price = :price, valid_from = :validFrom WHERE sku = :sku AND store_id = :storeId\`
- The PIM export delivers rows unsorted; chunks are taken in delivery order.
- \`item_price\` (95 million rows) has a clustered index on \`item_price_id\` and no index on \`(sku, store_id)\`.

## Logs
\`\`\`
02:00:05 INFO  [price-sync] 1,240,000 price changes received, 248 chunks
02:03:12 ERROR [price-sync] chunk 37: DB:QUERY_EXECUTION - Transaction (Process ID 87) was deadlocked
          on lock resources with another process and has been chosen as the deadlock victim.
02:21:40 INFO  [price-sync] Completed: 231 chunks OK, 17 chunks failed
02:22:00 [DBA] UPDATE item_price plan: clustered index scan
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do right now?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'SQL Server error 1205: two transactions wait on each other\'s locks; SQL Server rolls one back (the victim) and the other continues.',
    'Parallel For Each with 8 concurrent bulk updates on the same table, unsorted chunks and table scans create overlapping locks in different orders.',
    'In Mule the deadlock arrives as DB:QUERY_EXECUTION; inspect the vendor code to treat 1205 as retryable.',
    'Immediate: re-run only the failed chunks sequentially before the 06:00 label run.',
    'Fix: partition chunks by key, sort rows by the clustered key, index the WHERE columns, short transaction per chunk, retry only 1205, tune concurrency by load test.',
  ],
  solution: `
**Diagnosis.** With 8 chunks updating \`item_price\` at once, each in delivery order and each UPDATE scanning the clustered index (no index on \`sku, store_id\`), parallel chunks lock overlapping rows and pages in different orders. When two transactions each wait for a lock the other holds, SQL Server picks a **deadlock victim**, rolls it back and raises **1205**. Mule reports it as \`DB:QUERY_EXECUTION\`; the job did not retry, so 17 chunks were lost.

**Immediate mitigation.** Identify the 17 failed chunks from the job log, re-run them **sequentially** (concurrency 1), verify the updated row count against the PIM export, then let the 06:00 label run proceed. If it cannot finish in time, delay labels for affected stores only.

**Root cause.** Concurrency was added without partitioning the data or checking the update's access path; the job had no retry for the one error that is meant to be retried ("Rerun the transaction").

**Permanent fix.**
- Partition chunks so parallel chunks never share keys: group by \`store_id\` (or SKU ranges); sort each chunk by the clustered key.
- Add an index on \`(sku, store_id)\` (with the DBA) so each update seeks and locks only its rows.
- Each chunk in its own short transaction; wrap it in Until Successful (3 attempts, short varied delay) that retries **only** when the vendor error is 1205 — other errors fail fast.
- Pick \`maxConcurrency\` and chunk size by load testing (often 2–4 with sensible chunks beats 8).

**Prevention.** Performance test with production-size tables before raising concurrency; DBA review of execution plans for bulk statements; alert on any failed chunk instead of reporting "completed with errors".
`,
  followUps: [
    { q: 'Why not make every chunk run in one big transaction for consistency?', a: 'A long transaction holds locks for the whole run, blocking stores\' reads and making deadlocks more likely. Short transactions per chunk with a reconciliation record are safer.' },
    { q: 'How do you find exactly which resources deadlocked?', a: 'The DBA can read the deadlock graph from SQL Server (for example the system_health extended event session), which shows the two statements, the locks held and the locks requested.' },
    { q: 'Would MERGE instead of UPDATE avoid deadlocks?', a: 'Not by itself — MERGE also takes locks and can deadlock under concurrency. Partitioning, ordering and indexing matter more than the statement type.' },
  ],
}

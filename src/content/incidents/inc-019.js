export default {
  id: 'inc-019',
  category: 'incidents',
  title: 'Deadlocks in the Inventory Database Under Peak Load',
  level: 'ADVANCED',
  tags: ['database', 'deadlocks', 'transactions', 'concurrency'],
  estMinutes: 35,
  investigation: {
    logs: [
      { text: '11:04:22.118 INFO  [inventory] Reserving order SO-99812 lines=[SKU-77, SKU-12] corrId=4f1a', relevant: true, why: 'This order locks SKU-77 first, then SKU-12.' },
      { text: '11:04:22.121 INFO  [inventory] Reserving order SO-99813 lines=[SKU-12, SKU-77] corrId=9b02', relevant: true, why: 'At the same moment this order locks SKU-12 first, then SKU-77: opposite order, classic deadlock.' },
      { text: '11:04:22.400 INFO  [inventory] POST pricing-papi /value -> 200 (312 ms) corrId=4f1a', relevant: true, why: 'An HTTP call inside the transaction keeps the row locks held about 300 ms longer.' },
      { text: '11:04:25.000 INFO  [health] GET /health 200 (3 ms)', relevant: false },
      { text: '11:04:27.640 ERROR [inventory] DB:QUERY_EXECUTION Transaction (Process ID 87) was deadlocked ... chosen as the deadlock victim. Rerun the transaction. corrId=9b02', relevant: true, why: 'SQL Server resolved the deadlock by rolling back one transaction completely.' },
      { text: '11:04:27.655 INFO  [inventory] Order SO-99813 sent to inventory-errors queue corrId=9b02', relevant: false },
      { text: '11:04:28.010 INFO  [inventory] Reserving order SO-99814 lines=[SKU-03] corrId=c771', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the main cause of the deadlocks?',
        options: [
          'Concurrent transactions update the same SKUs in different orders, made more likely by higher concurrency, no index and an HTTP call inside the transaction',
          'The database is out of CPU',
          'SQL Server has a bug with local transactions',
          'The For Each runs lines in parallel',
        ],
        answer: 0,
        explain: 'SO-99812 locks 77 then 12, SO-99813 locks 12 then 77. Concurrency 32, scans on a missing index and longer-held locks make it frequent at peak.',
      },
      {
        type: 'single',
        prompt: 'Can the orders in inventory-errors be replayed safely?',
        options: [
          'Yes, the deadlock victim was fully rolled back, so replaying them is safe',
          'No, their stock was already reserved',
          'Only after restoring the database from backup',
          'Only manually, line by line',
        ],
        answer: 0,
        explain: 'A deadlock victim transaction is rolled back completely, so nothing was reserved. Replay them and check stock totals.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix**?',
        options: [
          'Sort order lines by sku and warehouse before the For Each',
          'Add an index on stock_level(sku, warehouse)',
          'Keep only the DB statements inside the transaction; call pricing after commit',
          'Retry the whole transaction on deadlock with jittered backoff',
          'Retry only the failed UPDATE statement',
        ],
        answer: [0, 1, 2, 3],
        explain: 'After a deadlock the whole transaction was rolled back, so only retrying the whole transaction is correct.',
      },
      {
        type: 'order',
        prompt: 'Put the incident response in order.',
        items: [
          'Match deadlock victims with orders sharing SKUs in opposite order',
          'Lower maxConcurrency to cut contention',
          'Replay the orders from inventory-errors and check stock totals',
          'Add the index, sort lines and move the HTTP call out of the transaction',
          'Add deadlock retry and alerts, and peak-load tests with overlapping SKUs',
        ],
        explain: 'Diagnose, reduce contention, recover orders, fix the design, then add resilience and tests.',
      },
    ],
  },
  description: `
## Symptoms
- \`inventory-sapi\` reserves stock for incoming orders. During today's promotion (~8x normal order rate) **2–4% of reservations fail** with a database error; the order goes to an error queue.
- At normal load the error is almost never seen.
- The DBA confirms **deadlock graphs** in SQL Server between sessions from the Mule app, all on table \`stock_level\`.

## Change / Context
- For each order the flow starts a **Try scope with a transaction** (\`transactionalAction="ALWAYS_BEGIN"\`, local transaction on the DB connector).
- Inside that scope, a For Each loops over the order lines **in the order they appear in the request**. For each line it runs this statement, followed by an \`INSERT\` into \`reservation\`:
  \`UPDATE stock_level SET reserved = reserved + :qty WHERE sku = :sku AND warehouse = :wh\`
- Before the commit, the flow also calls the pricing API (HTTP, ~300 ms) to log the reserved value.
- Last week the flow's \`maxConcurrency\` was raised from 4 to 32 to handle the promotion.
- \`stock_level\` has a primary key on \`id\`; there is **no index** on \`(sku, warehouse)\`.

## Logs
\`\`\`
11:04:22.118 INFO  [inventory] Reserving order SO-99812 lines=[SKU-77, SKU-12] corrId=4f1a
11:04:22.121 INFO  [inventory] Reserving order SO-99813 lines=[SKU-12, SKU-77] corrId=9b02
11:04:27.640 ERROR [inventory] DB:QUERY_EXECUTION Transaction (Process ID 87) was deadlocked on lock
  resources with another process and has been chosen as the deadlock victim. Rerun the transaction.
  corrId=9b02
11:04:27.655 INFO  [inventory] Order SO-99813 sent to inventory-errors queue corrId=9b02
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do **right now**?
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
    'Explains the deadlock: two transactions lock the same SKUs in opposite order (SO-99812 locks SKU-77 then SKU-12, SO-99813 the reverse), each waits for the other, and SQL Server kills one as the victim.',
    'Identifies aggravating factors: no index on (sku, warehouse) so updates scan and lock more rows than needed; an HTTP call inside the transaction keeps locks longer; concurrency raised from 4 to 32.',
    'Immediate: lower maxConcurrency, then replay the orders from the error queue (deadlock victims are rolled back, so replay is safe).',
    'Permanent fix: update lines in a consistent order (sort by sku/warehouse), add the index, keep transactions short (move the HTTP call outside), and retry the whole transaction on deadlock with a small backoff.',
    'Prevention: load tests with realistic overlapping orders, DB deadlock monitoring and alerts, and a design rule against remote calls inside DB transactions.',
  ],
  solution: `
**Diagnosis.** Two concurrent orders share SKUs but list them in a different order: SO-99812 updates **SKU-77 then SKU-12**, SO-99813 updates **SKU-12 then SKU-77**. Each holds a row lock the other needs → **deadlock**; SQL Server picks a victim and rolls it back (error 1205 message in the log, surfaced as \`DB:QUERY_EXECUTION\`). It got frequent today because:
- **Concurrency 32** (was 4) and 8x order rate → many more overlapping transactions.
- **Missing index on \`(sku, warehouse)\`** → each UPDATE scans and locks more rows/pages than the one it needs, so even orders with *different* SKUs can collide.
- **HTTP call inside the transaction** → locks held ~300 ms longer.

**Immediate mitigation.** Reduce \`maxConcurrency\` (e.g. back to 8) to cut contention. Victim transactions were **fully rolled back**, so the orders in \`inventory-errors\` can be **replayed** safely; replay them and check stock totals. Ask the DBA whether the index can be added online now — often the single biggest win.

**Root cause.** Inconsistent lock ordering in a multi-row transaction, made worse by unnecessary lock scope (no index) and lock duration (remote call inside the transaction), exposed by a large increase in concurrency.

**Permanent fix.**
- **Consistent lock order**: sort order lines by \`sku, warehouse\` before the For Each (DataWeave \`orderBy\`). Transactions then wait for each other instead of deadlocking.
- **Index** \`stock_level(sku, warehouse)\` so each UPDATE locks one row.
- **Short transactions**: only the UPDATEs + INSERT inside the transactional Try scope; call pricing after commit (or asynchronously).
- **Retry on deadlock**: a deadlock is a *transient* error — retry the **whole transaction** a few times with jittered backoff (not just the failed statement), only for the deadlock error.
- Optionally a single set-based statement/stored procedure for all lines.

**Prevention.** Performance tests with realistic overlapping data (same popular SKUs, random line order) at peak concurrency; DB monitoring for deadlocks with alerts; design rule: *no remote calls inside DB transactions*; review concurrency changes together with the DBA.
`,
  followUps: [
    { q: 'Why retry the whole transaction rather than the single failed UPDATE?', a: 'The deadlock victim\'s entire transaction is rolled back, including earlier updates. Retrying only the last statement would leave the order partially reserved; you must re-run the whole unit of work.' },
    { q: 'How do you prove these orders deadlocked on each other?', a: 'The DBA\'s deadlock graph (e.g. from SQL Server Extended Events) shows the two sessions, the resources each held and requested, and the statements. Match the session times to corrIds in the Mule logs.' },
    { q: 'Would optimistic locking help here?', a: 'It avoids long-held locks: read a version, update with WHERE version = :v, and retry on conflict. For hot counters like stock it can cause many retries, so ordering, short transactions and set-based updates are usually the first steps.' },
  ],
}

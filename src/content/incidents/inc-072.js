export default {
  id: 'inc-072',
  category: 'incidents',
  title: 'ORA-01000 and an Exhausted Pool: Unconsumed Database Results Inside a For Each',
  level: 'EXPERT',
  tags: ['oracle', 'database', 'cursors', 'connection-pool', 'streaming', 'for-each', 'performance'],
  estMinutes: 40,
  investigation: {
    logs: [
      { text: '2026-10-20 18:30:00 INFO  [deploy] customer-sync v4.1.0: "address enrichment" — For Each over customers, db:select of the primary address per customer, uses payload[0]', relevant: true, why: 'The new release added one select per customer whose result is only partly read.' },
      { text: '2026-10-21 01:00:02 INFO  [customer-sync] Nightly sync started: 18,450 changed customers, Try transactionalAction=ALWAYS_BEGIN', relevant: true, why: 'The whole loop runs in one transaction, so every select uses the same Oracle session.' },
      { text: '2026-10-21 01:00:41 ERROR [customer-sync] DB:QUERY_EXECUTION - ORA-01000: maximum open cursors exceeded (iteration 301)', relevant: true, why: 'Each partly read result keeps its cursor open on that one session until the event completes; at about 300 (the OPEN_CURSORS limit) Oracle refuses more.' },
      { text: '2026-10-21 01:00:41 INFO  [customer-sync] Transaction rolled back, 0 customers synchronised', relevant: false },
      { text: '2026-10-21 09:14:20 INFO  [health] GET /api/health 200 (3 ms)', relevant: false },
      { text: '2026-10-21 09:15:03 WARN  [customer-api] GET /customers/batch?ids=… took 30,012 ms', relevant: false },
      { text: '2026-10-21 09:15:03 ERROR [customer-api] DB:CONNECTIVITY - could not obtain a connection from the pool within maxWait (maxPoolSize=20, active=20)', relevant: true, why: 'The online batch endpoint uses the same per-id lookup without a transaction: each partly read result holds its own pooled connection until the request ends, so one request with 25 ids drains the pool.' },
      { text: '2026-10-21 09:16:00 INFO  [oracle-dba] Session CUSTOMER_API: 20 sessions, mostly idle, each with many open cursors', relevant: true, why: 'Database-side confirmation: connections are held but idle, with cursors left open — a client-side resource leak, not a slow database.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What links the nightly ORA-01000 and the daytime pool exhaustion?',
        options: [
          'Both run a streamed db:select per item and read only the first row; Mule keeps each result (cursor and, outside a transaction, the connection) open until it is fully consumed or the event ends',
          'Oracle is undersized and needs more CPU',
          'The pooling profile minPoolSize is too low',
          'ORA-01000 is caused by the network between CloudHub and Oracle',
        ],
        answer: 0,
        explain: 'Inside one transaction the cursors pile up on one session (ORA-01000 at the OPEN_CURSORS limit). Without a transaction each lookup holds a pooled connection, so the pool runs dry. Same pattern, two symptoms.',
      },
      {
        type: 'single',
        prompt: 'What is the best immediate mitigation?',
        options: [
          'Roll back customer-sync to v4.0 (before the enrichment) so the API and the nightly job are stable, and run the missed sync',
          'Ask the DBA to raise OPEN_CURSORS to 50,000',
          'Raise maxPoolSize to 500',
          'Restart the app every hour',
        ],
        answer: 0,
        explain: 'Raising limits only delays the failure and moves the load into Oracle. Rolling back removes the leak while the code is fixed.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the permanent fix?',
        options: [
          'Replace the per-customer lookup with one set-based query (join or IN list per chunk) — no N+1 selects',
          'Where a single-row lookup remains, limit it (maxRows="1") and fully consume the result immediately in a Transform, instead of leaving a stream half read',
          'Keep the nightly transaction per chunk of customers, not around the whole 18,450-item loop',
          'Add a load test with realistic volumes and a dashboard of pool usage and Oracle open cursors per session',
          'Disable streaming in Oracle by setting OPEN_CURSORS to unlimited',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Remove the N+1 pattern, release resources promptly, keep transactions small and measure. Unlimited cursors just let one session consume database memory.',
      },
      {
        type: 'match',
        prompt: 'Match each symptom to what it tells you.',
        pairs: [
          ['ORA-01000 in a transactional loop', 'Too many open cursors on one Oracle session'],
          ['DB:CONNECTIVITY waiting for a pool connection, active = max', 'All pooled connections are held by the application'],
          ['Oracle sessions idle with many open cursors', 'The client keeps resources open without using them'],
        ],
        explain: 'Reading the symptoms together points to a client-side leak rather than a slow or broken database.',
      },
    ],
  },
  description: `
## Symptoms
- Since Tuesday the nightly **customer-sync** job fails after ~40 seconds with \`ORA-01000: maximum open cursors exceeded\`; 0 customers are synchronised (the transaction rolls back).
- During the day, the \`GET /customers/batch\` endpoint of the same app intermittently hangs for 30 s and fails with a pool error; other endpoints using Oracle fail at the same time.

## Change / Context
- Release v4.1.0 (Monday) added "address enrichment": inside a For Each over customers, a \`db:select\` fetches addresses per customer and the flow uses \`payload[0]\` as the primary address. The same sub-flow is reused by the batch endpoint (up to 50 ids per request).
- The nightly job wraps the whole loop in a Try with \`transactionalAction="ALWAYS_BEGIN"\`.
- Pooling profile: \`maxPoolSize="20"\`, \`maxWait="30" maxWaitUnit="SECONDS"\`. Oracle \`OPEN_CURSORS = 300\`.

## Logs
\`\`\`
01:00:02 INFO  [customer-sync] Nightly sync started: 18,450 changed customers (Try ALWAYS_BEGIN)
01:00:41 ERROR [customer-sync] DB:QUERY_EXECUTION - ORA-01000: maximum open cursors exceeded (iteration 301)
09:15:03 ERROR [customer-api] DB:CONNECTIVITY - could not obtain a connection from the pool within maxWait
          (maxPoolSize=20, active=20)
09:16:00 [DBA] Session CUSTOMER_API: 20 sessions, mostly idle, each with many open cursors
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
    'db:select results are streamed: rows are read from an open cursor as the flow consumes them.',
    'A result that is only partly read (payload[0]) keeps its statement and cursor — and, outside a transaction, its connection — until it is fully consumed or the event completes.',
    'In one long transaction all selects share one session, so cursors accumulate until ORA-01000 (OPEN_CURSORS).',
    'Without a transaction, each lookup holds its own pooled connection, so a loop drains the pool (DB:CONNECTIVITY waiting for a connection).',
    'Fix: set-based queries instead of N+1, fully consume or limit single-row lookups immediately, transactions per chunk, monitoring of pool and cursors.',
    'Raising OPEN_CURSORS or maxPoolSize only postpones the failure.',
  ],
  solution: `
> **Accuracy note:** MuleSoft's public docs do not state when a partly read \`db:select\` result releases its cursor and connection. Treat that part of this scenario as a hypothesis: prove it on your connector version with a small pool and a flow that reads only \`payload[0]\` before stating it as fact in an interview.

**Diagnosis.** v4.1.0 runs a \`db:select\` per customer and reads only the first row. A streamed result that is not fully consumed stays open until the event finishes.
- **Nightly job:** the loop runs inside one transaction, so all 18,450 selects use the **same Oracle session**. Open cursors pile up and at iteration 301 Oracle raises **ORA-01000** (limit 300). The transaction rolls back.
- **Batch endpoint:** no transaction, so each lookup takes **its own pooled connection** and keeps it until the request ends. A request with 25 ids needs 25 connections; the pool has 20 — the request waits \`maxWait\` (30 s) and fails, and every other Oracle endpoint is starved meanwhile.
The DBA view (idle sessions, many open cursors) confirms a client-side leak.

**Immediate mitigation.** Roll back to v4.0; run the missed nightly sync; tell the API consumers the batch endpoint is stable again. Do not raise OPEN_CURSORS or the pool size as the "fix".

**Root cause.** An N+1 query pattern combined with results that are never fully read, so Mule cannot release the statement, cursor and connection until the event completes; one long transaction made it worse.

**Permanent fix.**
- One set-based query per chunk: \`SELECT ... FROM addresses WHERE customer_id IN (...) AND is_primary = 'Y'\` (or a join in the main query), then match addresses to customers in DataWeave.
- If a single-row lookup is unavoidable: \`maxRows="1"\` and fully consume the result right away in a Transform (e.g. map it to a plain object), so it is closed immediately.
- Transaction per chunk (e.g. 500 customers), not around the whole run.
- Cap the batch endpoint (\`ids\` ≤ 50) and use one query for all ids.

**Prevention.** Load tests with production-like volumes; dashboard and alerts for pool active/max and wait time, and Oracle open cursors per session; code review rule: no DB call inside For Each without justification.
`,
  followUps: [
    { q: 'Why did tests not catch it?', a: 'Test data had a handful of customers per run, far below OPEN_CURSORS and the pool size. Resource leaks only show at volume, which is why load tests need realistic data.' },
    { q: 'Would repeatable in-memory streaming instead of file-stored change anything?', a: 'Not the root problem: the strategy decides how consumed data is buffered for re-reading, not whether the cursor is left half read. Fully consuming or limiting the result is what releases it.' },
    { q: 'What does OPEN_CURSORS control?', a: 'The maximum number of cursors one Oracle session can have open at once. It protects the database from a single session leaking cursors; it is a guard rail, not something to raise until an app stops failing.' },
  ],
}

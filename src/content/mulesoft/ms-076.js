export default {
  id: 'ms-076',
  category: 'mulesoft',
  title: 'Database Transactions and Error Handling: Rollbacks, Duplicate Keys and Deadlock Retries',
  level: 'ADVANCED',
  tags: ['database', 'transactions', 'error-handling', 'oracle', 'sql-server', 'idempotency', 'retry'],
  estMinutes: 35,
  quiz: [
    {
      type: 'single',
      prompt: 'An order header and its lines must be inserted into Oracle all-or-nothing. Which design is correct?',
      options: [
        'A Try scope with transactionalAction="ALWAYS_BEGIN" containing both inserts on the same db:config; an error propagated out of the Try rolls both back',
        'Two separate flows, each with its own db:insert, called with flow-ref',
        'A Parallel For Each that inserts header and lines at the same time',
        'An Until Successful scope around the line inserts only',
      ],
      answer: 0,
      explain: 'Database operations inside a transactional Try join the local transaction (same connection). If the Try ends with an error that propagates, the transaction rolls back; if it completes, it commits.',
    },
    {
      type: 'single',
      prompt: 'Inside the transactional Try, the error handler uses **On Error Continue** for DB:QUERY_EXECUTION. What happens to the transaction?',
      options: [
        'It is committed, because On Error Continue completes the Try successfully — the inserts that worked are kept',
        'It is always rolled back, whatever the handler type',
        'It stays open until the flow ends',
        'Mule retries the failed statement automatically',
      ],
      answer: 0,
      explain: 'On Error Propagate rolls the transaction back; On Error Continue treats the error as handled and commits. Using Continue here can leave a header without lines.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each failure to the Mule error type it raises.',
      pairs: [
        ['The pool cannot obtain a connection: listener refused / host unreachable', 'DB:CONNECTIVITY'],
        ['ORA-00001 unique constraint violated on insert', 'DB:QUERY_EXECUTION'],
        ['A typo in a table name in the SQL text', 'DB:BAD_SQL_SYNTAX'],
        ['Reconnection attempts used up without success', 'DB:RETRY_EXHAUSTED'],
      ],
      explain: 'Vendor errors raised while a statement runs (constraints, deadlocks, timeouts) arrive as DB:QUERY_EXECUTION; inspect the vendor code in the error to decide what to do.',
    },
    {
      type: 'single',
      prompt: 'A payments queue delivers the same message twice. The second insert fails with SQL Server error 2627 on the payment_ref primary key. What is the right handling?',
      options: [
        'Treat it as "already processed": catch DB:QUERY_EXECUTION, check the vendor code is 2627/2601, and acknowledge without error',
        'Retry the insert with Until Successful until it succeeds',
        'Send the message to the DLQ as a technical failure',
        'Drop the primary key so duplicates can be inserted',
      ],
      answer: 0,
      explain: 'A unique key on the business reference makes the consumer idempotent: a duplicate violation means the work was done already. Retrying a duplicate will never succeed; only check the specific code so real errors still fail.',
    },
    {
      type: 'multi',
      prompt: 'A Mule app writes to a database and retries transient failures a small number of times with backoff. Which two of these errors should it retry?',
      options: [
        'SQL Server error 1205, chosen as deadlock victim',
        '`DB:CONNECTIVITY` during a short database failover',
        'ORA-00001, unique constraint violated',
        '`DB:BAD_SQL_SYNTAX` from a typo in a table name',
      ],
      answer: [0, 1],
      explain: 'Deadlock victims and brief connectivity loss are transient, so the same work usually succeeds on retry. Duplicate keys and syntax errors fail the same way every time.',
    },
    {
      type: 'order',
      prompt: 'Order the steps of a retry for a deadlocked transactional unit of work.',
      items: [
        'Transactional Try begins and runs the updates',
        'SQL Server picks this transaction as deadlock victim (1205) and rolls it back',
        'On Error Propagate ends the Try, so Mule rolls back its side as well',
        'An outer Until Successful (or retry logic) waits briefly and runs the whole transactional Try again',
      ],
      explain: 'Retry the **whole** transaction, not a single statement: after a deadlock the database has already rolled back everything done in that transaction.',
    },
  ],
  description: `
A payments platform writes to **Oracle** (orders) and **SQL Server** (settlement) from Anypoint MQ consumers. Volumes: 400,000 messages per day, at-least-once delivery.

Recent defects:
- An order header was saved without its lines after a line insert failed.
- Redelivered payment messages fail with \`Violation of PRIMARY KEY constraint 'PK_payment'. Cannot insert duplicate key\` (error 2627) and end up in the DLQ, where support replays them — and they fail again.
- At month end, settlement updates fail with \`Transaction (Process ID 71) was deadlocked on lock resources with another process and has been chosen as the deadlock victim. Rerun the transaction.\`
- A developer wrapped every DB operation in Until Successful with 10 retries "to be safe".

**Questions**
1. How do you make header and lines atomic in Mule 4, and how do error handlers affect commit and rollback?
2. Which DB errors are transient and which are permanent? Map them to Mule error types.
3. How should the consumer handle a duplicate key (ORA-00001 / 2627) idempotently?
4. How should deadlocks be retried, and what is wrong with "retry everything"?
`,
  answerTemplate: `## Local transactions

## Error classification

## Idempotent duplicates

## Deadlock retries
`,
  keyPoints: [
    'Try with transactionalAction="ALWAYS_BEGIN": DB operations on the same config inside it join one local transaction.',
    'On Error Propagate rolls the transaction back; On Error Continue commits it — choose deliberately.',
    'DB:CONNECTIVITY (cannot connect), DB:QUERY_EXECUTION (vendor error while running SQL: constraints, deadlocks), DB:BAD_SQL_SYNTAX, DB:RETRY_EXHAUSTED.',
    'Duplicate keys (ORA-00001, SQL Server 2627/2601) are permanent: with a unique business key they mean "already processed" for an idempotent consumer.',
    'Deadlock victim (1205) and short connectivity loss are transient: retry the whole transaction a few times with backoff.',
    'Never blanket-retry: permanent errors waste time, hold resources and flood DLQs.',
  ],
  solution: `
**1. Atomic header and lines.**
\`\`\`xml
<try transactionalAction="ALWAYS_BEGIN">
  <db:insert config-ref="oracleOrders"> <!-- header --> </db:insert>
  <db:bulk-insert config-ref="oracleOrders"> <!-- lines --> </db:bulk-insert>
  <error-handler>
    <on-error-propagate type="DB:QUERY_EXECUTION"/>   <!-- rollback, let the caller decide -->
  </error-handler>
</try>
\`\`\`
Both operations use the same config, so they share the transaction's connection. Propagate rolls back; Continue would commit the header without lines.

**2. Classification.**

| Error | Mule type | Nature |
|---|---|---|
| Cannot connect / failover | DB:CONNECTIVITY | Transient |
| Deadlock victim 1205 | DB:QUERY_EXECUTION | Transient |
| ORA-00001, 2627/2601 duplicate | DB:QUERY_EXECUTION | Permanent (or "already done") |
| Bad SQL | DB:BAD_SQL_SYNTAX | Permanent (bug) |
| Reconnection exhausted | DB:RETRY_EXHAUSTED | Infrastructure problem |

Because several cases share DB:QUERY_EXECUTION, inspect the vendor code (from the error's cause/message) to tell them apart.

**3. Idempotent duplicates.** Put a unique constraint on the business reference (payment_ref). On DB:QUERY_EXECUTION with 2627/2601 (or ORA-00001), log "duplicate, already processed" and acknowledge the message. Optionally use MERGE (SQL Server) or an insert-if-not-exists pattern to avoid the error entirely. Never DLQ duplicates.

**4. Deadlocks.** Wrap the transactional Try in Until Successful (3 attempts, short and slightly varied delay) that retries only for the deadlock case; everything else propagates. Reduce deadlocks at the source: update rows in a consistent key order, keep transactions short, index the columns in the WHERE clause. "Retry everything ten times" retries permanent errors, holds connections and threads, and multiplies load during an outage.
`,
  followUps: [
    {
      q: 'Can one local transaction span Oracle and SQL Server?',
      a: 'No. A local transaction is bound to one connection/config. Across two resources you need XA (with its cost and driver requirements) or, more commonly, a saga with idempotent steps and compensation.',
    },
    {
      q: 'Why not retry DB:CONNECTIVITY forever?',
      a: 'A long outage needs alerting and back-pressure, not endless retries holding messages and threads. Retry briefly, then let the message go back to the broker (or DLQ) and alert.',
    },
    {
      q: 'What does the reconnection strategy on the db:config cover?',
      a: 'Re-establishing connections (at startup or when a connection fails). It does not retry failed statements or business logic — that is your error handling.',
    },
  ],
}

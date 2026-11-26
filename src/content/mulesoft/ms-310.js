export default {
  id: 'ms-310',
  category: 'mulesoft',
  title: 'Oracle Staging Tables Under Load: Statistics, Truncate, Temporary Tables, LOBs and Flashback',
  level: 'EXPERT',
  tags: ['myproject', 'oracle', 'staging', 'performance', 'statistics', 'lob'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'A staging table is empty when the nightly statistics job runs, then holds 2 million rows during the load. The step that joins it becomes very slow. Why?',
      options: [
        'The table has no primary key, so Oracle scans the whole table once for each joined row',
        'The optimizer thinks the table is nearly empty and picks a plan poor for 2 million rows',
        'The undo for the load fills up and slows every query on the table',
        'The connection pool is too small for the join to run in parallel',
      ],
      answer: 1,
      explain: 'A plan such as nested loops suits a few rows, not 2 million. Statistics describe the table at the time they were gathered.',
    },
    {
      type: 'multi',
      prompt: 'What are common fixes for statistics on staging tables?',
      options: [
        'Gather statistics with DBMS_STATS after the load and before the heavy queries',
        'Gather once when the table is full and lock those statistics',
        'Rely on dynamic sampling where the DBA agrees',
        'Run ANALYZE TABLE ... VALIDATE STRUCTURE before the load',
        'Gather statistics right after the TRUNCATE, before the load starts',
      ],
      answer: [0, 1, 2],
      explain: 'Gathering after the load, locking statistics from a full table, or dynamic sampling all give the optimizer a true picture of the rows. VALIDATE STRUCTURE checks for corruption and gathers no statistics. Statistics gathered on an empty table tell the optimizer there are no rows, which is the problem in the first place. The DBA usually has a standard. Discuss before changing anything.',
    },
    {
      type: 'single',
      prompt: 'A transactional Try scope runs TRUNCATE TABLE ITEM_STAGE and then loads the new file. The load fails and the scope rolls back. What does ITEM_STAGE hold now?',
      options: [
        'The old rows, since the rollback undoes the TRUNCATE together with the load',
        'The rows loaded before the failure, since the TRUNCATE ended the transaction',
        'The old rows, but only when the Try scope runs as an XA transaction',
        'No rows, since TRUNCATE is DDL and committed before the load started',
      ],
      answer: 3,
      explain: 'TRUNCATE is DDL, so Oracle commits it at once and no rollback can undo it, XA or not. The inserts after it run in a new transaction on the same connection, and the rollback removes them, so the table ends up empty. Clear the table outside the transaction only when losing the old rows is fine, or delete by run ID inside the transaction instead.',
    },
    {
      type: 'single',
      prompt: 'A global temporary table is defined with ON COMMIT PRESERVE ROWS. What surprise can a Mule app with a pool get?',
      options: [
        'None, since the pool clears temporary tables when a connection is returned',
        'Rows stay after commit, and a later flow on the same pooled session sees them',
        'All sessions share the rows, so parallel flows see each other’s data',
        'The rows stay on disk after the session ends until a DBA purges them',
      ],
      answer: 1,
      explain: 'Data in a temporary table is private to the session. With pools, delete your rows at the end, or use ON COMMIT DELETE ROWS.',
    },
    {
      type: 'single',
      prompt: 'You store the received JSON message in Oracle. It can be 2 MB. Which column type fits?',
      options: [
        'VARCHAR2(4000), with longer messages split across several rows',
        'CLOB, or a JSON type where the version has one, read and written as a stream',
        'RAW(2000), since a binary column holds text of any size',
        'LONG, since Oracle recommends it for large new text columns',
      ],
      answer: 1,
      explain: 'VARCHAR2 is limited to 4,000 bytes, or 32,767 with extended sizes. Many teams keep large payloads in blob storage and store a pointer.',
    },
    {
      type: 'single',
      prompt: 'Support asks what a staging table looked like 30 minutes ago, before a bad load. What can help?',
      options: [
        'DBA_TAB_MODIFICATIONS, which keeps the old values of rows changed since the last statistics run',
        'A flashback query on the table with AS OF TIMESTAMP',
        'The Mule log, since the Database connector logs each staged row',
        'A ROLLBACK TO SAVEPOINT, using a savepoint the load set before its first insert',
      ],
      answer: 1,
      explain: 'For example SELECT ... AS OF TIMESTAMP SYSTIMESTAMP - INTERVAL \'30\' MINUTE. It depends on undo retention and needs rights. After a TRUNCATE, flashback query cannot read the old rows. DBA_TAB_MODIFICATIONS holds counts of inserts, updates and deletes, not row values. The connector does not log each row. A commit ends the transaction and its savepoints, so there is nothing to roll back to.',
    },
  ],
  description: `
Larkfield Grocers loads item, barcode and stock messages into Oracle staging tables that are cleared and refilled every night. The loads got slower as volumes grew, a temporary table showed rows from an earlier run, and a large JSON message did not fit its column.

**Questions**
1. Why does the step that joins the staging table slow down, and what fixes it?
2. How should you clear staging tables between runs?
3. What do you need to know about global temporary tables with a connection pool?
4. Where do large payloads go?
5. How can you look at data from before a bad load?
`,
  answerTemplate: `## Statistics

## Clearing tables

## Temporary tables and pools

## Large payloads

## Looking back
`,
  keyPoints: [
    'Statistics gathered on an empty table give bad plans for full ones.',
    'Gather after load, or lock representative statistics.',
    'TRUNCATE is fast but commits. Delete by run ID if runs share a table.',
    'Temporary table rows belong to the session, which a pool reuses.',
    'Large payloads go in CLOBs or in blob storage with a pointer.',
    'Flashback query reads old versions while undo keeps them.',
  ],
  solution: `
**1. Statistics.** The optimizer uses table statistics to estimate row counts. If they were gathered when the table was empty, it expects a few rows and may pick nested loops or skip a hash join. Gather statistics with \`DBMS_STATS.GATHER_TABLE_STATS\` after the load and before the heavy step, or gather once when the table is full and lock them. Agree the approach with the DBA.

**2. Clearing tables.** \`TRUNCATE\` removes all rows with little undo and resets the high water mark, so later full scans are fast. It is DDL and commits. When runs can overlap or a run must be rerun alone, use a run ID column and delete by run ID, or use partitions per run or day.

**3. Temporary tables and pools.** Global temporary table data is private to a session. With \`ON COMMIT PRESERVE ROWS\`, rows stay until the session ends, and a pooled connection lives on, so the next flow sees them. Use \`ON COMMIT DELETE ROWS\` when the work fits one transaction, or delete your rows at the end in a finally style step.

**4. Large payloads.** A VARCHAR2 is limited to 4,000 bytes by default. Use a CLOB, or a native JSON type where available, and stream it. Many designs keep the payload in blob storage and store the path in Oracle.

**5. Looking back.** A flashback query \`SELECT ... AS OF TIMESTAMP\` reads the table as it was, while undo still holds the old versions. It needs rights and does not work across a TRUNCATE. For a lasting audit trail, keep run IDs and history tables instead.
`,
  followUps: [
    {
      q: 'Would you make staging tables NOLOGGING?',
      a: 'It can speed direct path loads but affects recovery and standby databases. That is the DBA call, not the integration team.',
    },
    {
      q: 'Why can indexes on a staging table slow the load?',
      a: 'Every insert updates every index. Some loads drop or disable indexes before a large load and rebuild after, if the DBA allows it.',
    },
    {
      q: 'How do you find the slow statement?',
      a: 'Ask the DBA for the SQL ID and its plan from AWR or the SQL monitor, and compare estimated with actual rows.',
    },
  ],
}

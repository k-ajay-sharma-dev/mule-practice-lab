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
        'The table has no primary key',
        'The optimizer believes the table is nearly empty and picks a plan, such as nested loops, that is poor for 2 million rows',
        'Oracle limits staging tables',
        'The pool is too small',
      ],
      answer: 1,
      explain: 'Statistics describe the table at the time they were gathered.',
    },
    {
      type: 'multi',
      prompt: 'What are common fixes for statistics on staging tables?',
      options: [
        'Gather statistics with DBMS_STATS after the load and before the heavy queries',
        'Gather once when the table is full and lock those statistics',
        'Rely on dynamic sampling where the DBA agrees',
        'Drop all indexes',
      ],
      answer: [0, 1, 2],
      explain: 'The DBA usually has a standard. Discuss before changing anything.',
    },
    {
      type: 'single',
      prompt: 'Why is TRUNCATE often preferred to DELETE to clear a staging table between runs?',
      options: [
        'It can be rolled back',
        'It removes all rows quickly with little undo and resets the high water mark, but it commits and cannot be rolled back',
        'It keeps the rows for audit',
        'It runs triggers',
      ],
      answer: 1,
      explain: 'TRUNCATE is DDL. If several runs share the table, delete by run ID instead.',
    },
    {
      type: 'single',
      prompt: 'A global temporary table is defined with ON COMMIT PRESERVE ROWS. What surprise can a Mule app with a pool get?',
      options: [
        'None',
        'Rows stay in the session after commit, and the pooled session is reused by a later flow that then sees old rows',
        'The table is shared by all sessions',
        'Rows are written to disk forever',
      ],
      answer: 1,
      explain: 'Data in a temporary table is private to the session. With pools, delete your rows at the end, or use ON COMMIT DELETE ROWS.',
    },
    {
      type: 'single',
      prompt: 'You store the received JSON message in Oracle. It can be 2 MB. Which column type fits?',
      options: [
        'VARCHAR2(4000)',
        'CLOB, or a JSON type on versions that have one, read and written as a stream',
        'NUMBER',
        'RAW(2000)',
      ],
      answer: 1,
      explain: 'VARCHAR2 is limited to 4,000 bytes, or 32,767 with extended sizes. Many teams keep large payloads in blob storage and store a pointer.',
    },
    {
      type: 'single',
      prompt: 'Support asks what a staging table looked like 30 minutes ago, before a bad load. What can help?',
      options: [
        'Nothing',
        'A flashback query, SELECT ... AS OF TIMESTAMP SYSTIMESTAMP - INTERVAL \'30\' MINUTE, if undo still holds the old versions',
        'Restore the whole database',
        'Read the Mule log',
      ],
      answer: 1,
      explain: 'It depends on undo retention and needs rights. After a TRUNCATE, flashback query cannot read the old rows.',
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

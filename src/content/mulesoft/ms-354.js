export default {
  id: 'ms-354',
  category: 'mulesoft',
  title: 'Commit Size in Long Oracle Staging Loads: Undo, ORA-01555, Locks and Restarting Halfway',
  level: 'EXPERT',
  tags: ['myproject', 'oracle', 'staging', 'transactions', 'large-files', 'design'],
  estMinutes: 30,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each commit choice to its main risk.',
      pairs: [
        ['One commit at the end of a 3 hour load', 'Huge undo use, long held locks and a full rollback on any failure'],
        ['A commit per row', 'Very slow loads from round trips and log syncs'],
        ['A commit per block of a few thousand rows', 'A failure leaves part of the run loaded, so restarts must handle it'],
      ],
      explain: 'Block commits are the usual middle ground, as long as the run can be cleaned or resumed.',
    },
    {
      type: 'single',
      prompt: 'A long running report query fails with ORA-01555 snapshot too old while the staging load runs. What does it mean?',
      options: [
        'The table is too large',
        'The query needed old row versions from undo to keep a consistent view, but the load overwrote that undo',
        'The session timed out',
        'The index is corrupt',
      ],
      answer: 1,
      explain: 'Undo retention and undo size decide how long old versions stay. Frequent commits on the same table can make it worse for long readers.',
    },
    {
      type: 'single',
      prompt: 'The load commits per block and fails at block 340 of 600. What must the restart do?',
      options: [
        'Start from block 1 and insert again',
        'Either delete the run\'s rows by run ID and start again, or skip blocks the block log marks as committed',
        'Continue from a random block',
        'Ignore the failure',
      ],
      answer: 1,
      explain: 'Both work. Pick one, and make the block log and the commit happen in the same transaction.',
    },
    {
      type: 'single',
      prompt: 'Why write the block log row in the same transaction as the block\'s rows?',
      options: [
        'It is faster',
        'So the log can never say a block is done when its rows were rolled back, or the other way round',
        'Oracle requires it',
        'It saves undo',
      ],
      answer: 1,
      explain: 'Job log rows about the whole run can be autonomous. Block markers must match the data.',
    },
    {
      type: 'multi',
      prompt: 'Readers must not see a half loaded run. Which designs help?',
      options: [
        'Load with a run ID and a status of LOADING, and have readers use only runs marked COMPLETE',
        'Load a separate staging table and switch a synonym or view after the load',
        'Use partition exchange to swap a fully loaded partition in',
        'Ask readers to wait until morning',
      ],
      answer: [0, 1, 2],
      explain: 'These let you commit often without exposing partial data.',
    },
    {
      type: 'single',
      prompt: 'The load takes ORA-00054 resource busy when it truncates a staging table. What happened?',
      options: [
        'The table is full',
        'Another session holds a lock on the table, often an uncommitted insert or update in another session, and TRUNCATE does not wait by default',
        'The user lacks a role',
        'The undo is full',
      ],
      answer: 1,
      explain: 'Find the session holding the lock. Do not loop TRUNCATE in a tight retry.',
    },
  ],
  description: `
Fenwick Supply's product data hub loads about 9 million inventory transaction rows into Oracle staging each night. The current flow commits once at the end. Last week it failed after 2 hours 50 minutes, rolled back for 40 minutes, and the ERP batch started on an empty table. A DBA also reported ORA-01555 errors in a report that runs during the load.

**Questions**
1. What are the risks of one commit at the end, and of very frequent commits?
2. Why did the report fail with ORA-01555?
3. How do you commit in blocks and still restart cleanly?
4. How do you keep readers away from a half loaded run?
`,
  answerTemplate: `## Commit size risks

## ORA-01555

## Block commits and restarts

## Protecting readers
`,
  keyPoints: [
    'One huge transaction means big undo, long locks and a long rollback.',
    'Commit per row is too slow, commit per block is the middle ground.',
    'ORA-01555 means needed undo was overwritten.',
    'Restart by run ID cleanup or by skipping committed blocks.',
    'Write block markers in the same transaction as the block.',
    'Readers use only completed runs, or a swapped table or partition.',
  ],
  solution: `
**1. Commit size risks.** One commit at the end holds undo and locks for hours, and any failure rolls everything back, which itself takes a long time. A commit per row is very slow. Commits per block of a few thousand rows balance speed and risk.

**2. ORA-01555.** The report needs old versions of rows to give a consistent view from its start time. Those versions live in undo. The load changes many rows and the undo for them can be overwritten before the report finishes. More undo space, a suitable undo retention, a shorter report, or running it outside the load window all help. Agree the fix with the DBA.

**3. Block commits and restarts.** Commit each block with a block log row in the same transaction. On restart, either delete the run's rows by run ID and load again, or skip blocks the block log marks as done. Both need a run ID on every row.

**4. Protecting readers.** Mark the run LOADING and switch it to COMPLETE at the end. Readers and the ERP batch read only complete runs. Or load a separate table and switch a synonym, or exchange a partition. The ERP job should check the run status, not the clock.
`,
  followUps: [
    {
      q: 'How do you pick the block size?',
      a: 'Test a few sizes on realistic data. Look at rows per second, undo use and lock time, then pick a size where throughput stops rising.',
    },
    {
      q: 'Can a Mule batch aggregator commit per block?',
      a: 'Yes. Each aggregator bulk insert can run in its own transaction, with the block marker insert in the same transaction.',
    },
    {
      q: 'What about the job log row written when the run starts?',
      a: 'Commit it on its own at once, so the run is visible even if the load later rolls back.',
    },
  ],
}

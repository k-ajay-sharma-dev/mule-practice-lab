export default {
  id: 'ms-351',
  category: 'mulesoft',
  title: 'TRUNCATE, DELETE or Swap Tables for a Nightly Reload in SQL Server: Explain the Difference',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'sql-server', 'reload', 'staging', 'planning-platform', 'trade-offs'],
  estMinutes: 20,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each way of clearing a table to its main trait.',
      pairs: [
        ['DELETE FROM table', 'Removes rows one by one with full logging, can use a WHERE clause and fires delete triggers'],
        ['TRUNCATE TABLE', 'Removes all rows fast with little logging, resets identity and needs no WHERE clause'],
        ['Load a shadow table, then swap', 'Readers keep the old data until a fast switch to the new data'],
      ],
      explain: 'Each fits a different need. The interviewer wants to hear when you would pick each one.',
    },
    {
      type: 'single',
      prompt: 'Can a TRUNCATE be rolled back in SQL Server?',
      options: [
        'Never',
        'Yes, inside an explicit transaction that has not committed',
        'Only when the database uses the full recovery model',
        'Only if the table has no index',
      ],
      answer: 1,
      explain: 'A common myth says no. In SQL Server it can, inside a transaction. Other databases differ.',
    },
    {
      type: 'single',
      prompt: 'The nightly flow runs TRUNCATE, then loads 4 million forecast rows over 25 minutes. What do readers see?',
      options: [
        'The old data until the end',
        'An empty table, then a table that fills up, for the whole 25 minutes',
        'An error',
        'The new data at once',
      ],
      answer: 1,
      explain: 'That is why reports showed zero forecast for some stores at 02:10.',
    },
    {
      type: 'multi',
      prompt: 'Which can stop TRUNCATE from working on a table?',
      options: [
        'Another table has a foreign key that points to it',
        'The account lacks ALTER permission on the table',
        'The table is used in an indexed view',
        'The table has more than one million rows',
      ],
      answer: [0, 1, 2],
      explain: 'Row count does not matter. Permissions and references do.',
    },
    {
      type: 'single',
      prompt: 'How can a swap be done in SQL Server?',
      options: [
        'Copy the rows twice',
        'Rename the tables with sp_rename inside a short transaction, or switch partitions with ALTER TABLE ... SWITCH',
        'Drop the live table first',
        'Use a view and never change it',
      ],
      answer: 1,
      explain: 'A view that points to one of two tables and is altered after the load is another option.',
    },
    {
      type: 'single',
      prompt: 'Only one store needs its forecast reloaded. Which is best?',
      options: [
        'TRUNCATE the whole table',
        'DELETE the rows of that store in batches, then insert its new rows, in a transaction',
        'Swap the whole table',
        'Drop the table',
      ],
      answer: 1,
      explain: 'DELETE with a WHERE clause fits partial reloads. Deleting in batches keeps the log and locks small.',
    },
  ],
  description: `
Larkfield Grocers reloads its store forecast table in SQL Server each night from the planning platform. Today the flow truncates the table and inserts about 4 million rows. Replenishment reports that run early show missing stores, and one night the load failed halfway and left the table half full until morning.

**Questions**
1. What is the difference between DELETE, TRUNCATE and a swap?
2. What do readers see with each approach?
3. What can stop TRUNCATE, and can it be undone?
4. Which approach would you use here, and for a single store reload?
`,
  answerTemplate: `## The three approaches

## What readers see

## Limits of TRUNCATE

## The choice here
`,
  keyPoints: [
    'DELETE logs each row and can filter, TRUNCATE clears all rows fast.',
    'TRUNCATE can be rolled back inside a transaction in SQL Server.',
    'Foreign keys, permissions and indexed views can block TRUNCATE.',
    'Truncate and load leaves readers with an empty table.',
    'A shadow table and swap keeps the old data visible until the switch.',
    'Partial reloads use DELETE with a WHERE clause in batches.',
  ],
  solution: `
**1. The three approaches.** DELETE removes rows with full logging, can filter with WHERE and fires triggers. TRUNCATE removes all rows by releasing the data pages, which is fast and logs little, and resets identity values. A swap loads a second table and then switches names or partitions.

**2. What readers see.** With DELETE or TRUNCATE followed by a load, readers see an empty or half filled table during the load. A failed load leaves it that way. With a swap, they see the old data until a switch that takes a moment.

**3. Limits of TRUNCATE.** It needs ALTER permission and fails when a foreign key points at the table or an indexed view uses it. In SQL Server it can be rolled back inside an explicit transaction, but keeping a transaction open across a long load is a bad idea.

**4. The choice here.** Load a shadow table, check counts per store, and swap only when the checks pass. Keep the old table until the next night for a quick switch back. For one store, DELETE that store's rows in batches and insert the new ones in a transaction.
`,
  followUps: [
    {
      q: 'What happens to indexes and statistics on the shadow table?',
      a: 'Build indexes after the bulk load, then update statistics before the swap, so the first queries get good plans.',
    },
    {
      q: 'How does Mule run the swap?',
      a: 'A Database execute script or a stored procedure call after the load and the count check, with the result written to the job log.',
    },
    {
      q: 'What permissions does the Mule account need for this?',
      a: 'Insert on the shadow table, plus ALTER for TRUNCATE and rename. Many teams wrap the swap in a procedure so the account needs only EXECUTE.',
    },
  ],
}

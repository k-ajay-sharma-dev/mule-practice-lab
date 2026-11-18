export default {
  id: 'ms-309',
  category: 'mulesoft',
  title: 'Many Mule Workers on One Oracle Work Table: FOR UPDATE SKIP LOCKED, Locks and Deadlocks',
  level: 'EXPERT',
  tags: ['myproject', 'oracle', 'locking', 'skip-locked', 'concurrency', 'deadlocks'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'Four Mule workers poll a table of pending outbound rows. Each selects WHERE STATUS = \'NEW\'. What goes wrong?',
      options: [
        'Nothing',
        'Several workers read the same rows and send them twice',
        'Oracle refuses the second SELECT',
        'The rows are deleted',
      ],
      answer: 1,
      explain: 'A plain SELECT takes no locks in Oracle. Readers never block each other or writers.',
    },
    {
      type: 'single',
      prompt: 'What does SELECT ... FOR UPDATE SKIP LOCKED do?',
      options: [
        'Locks the whole table',
        'Locks the rows it returns and passes over rows that another session has locked, so each worker gets different rows',
        'Reads without locks',
        'Deletes locked rows',
      ],
      answer: 1,
      explain: 'Plain FOR UPDATE would wait for the other session. NOWAIT would fail with ORA-00054.',
    },
    {
      type: 'single',
      prompt: 'Why must the claim and the status update happen in one transaction?',
      options: [
        'For speed',
        'The row locks last only until commit. If the worker commits before marking the rows, another worker can claim them',
        'Oracle requires it',
        'To save undo',
      ],
      answer: 1,
      explain: 'Claim, then UPDATE SET STATUS = \'IN_PROGRESS\', WORKER = :w, then commit. Send after the commit.',
    },
    {
      type: 'single',
      prompt: 'A query uses FOR UPDATE SKIP LOCKED with WHERE ROWNUM <= 100. Workers sometimes get few or no rows while hundreds are free. Why?',
      options: [
        'The index is missing',
        'ROWNUM is applied before rows are skipped, so the first 100 candidates may all be locked by others',
        'SKIP LOCKED is broken',
        'The table is empty',
      ],
      answer: 1,
      explain: 'A common fix is to open the cursor without the row limit and fetch only the number you need, so the database locks rows as they are fetched.',
    },
    {
      type: 'multi',
      prompt: 'ORA-00060 deadlock detected shows up when two loads update the same item rows. What reduces it?',
      options: [
        'Update rows in the same order in every flow, such as by key',
        'Keep transactions short',
        'Give each worker a different partition of keys',
        'Turn off foreign key indexes',
      ],
      answer: [0, 1, 2],
      explain: 'Unindexed foreign keys are a known source of extra locking. Index them, do not remove them.',
    },
    {
      type: 'single',
      prompt: 'A worker claims rows, sets IN_PROGRESS, commits, then crashes. What brings the rows back?',
      options: [
        'Oracle releases them on its own',
        'A claim time and a sweep that resets IN_PROGRESS rows older than a limit to NEW, with an attempt counter',
        'Restarting the database',
        'Nothing, they are lost',
      ],
      answer: 1,
      explain: 'After too many attempts, move the row to FAILED and alert, so one bad row does not loop forever.',
    },
  ],
  description: `
Quayle Freight generates outbound messages into an Oracle table with status NEW. Mule runs on four workers and each worker polls the table every 30 seconds to send the rows. Partners report duplicate messages, and at busy times the database shows ORA-00060 deadlocks between the sender flow and a nightly load.

**Questions**
1. Why do workers send the same rows?
2. How do you let each worker claim different rows?
3. What happens to rows a crashed worker had claimed?
4. Why do deadlocks happen and how do you reduce them?
`,
  answerTemplate: `## Duplicate sends

## Claiming rows

## Crashed workers

## Deadlocks
`,
  keyPoints: [
    'Oracle reads do not lock, so plain polling double sends.',
    'Use SELECT ... FOR UPDATE SKIP LOCKED to claim rows.',
    'Mark claimed rows in the same transaction, then commit and send.',
    'A row limit with ROWNUM can starve workers. Fetch a limited number instead.',
    'Sweep stale IN_PROGRESS rows with an attempt counter.',
    'Update in a fixed key order and keep transactions short.',
  ],
  solution: `
**1. Duplicate sends.** A plain SELECT takes no row locks in Oracle, so all four workers can read the same NEW rows at the same moment and send them.

**2. Claiming rows.** In one transaction, select candidate rows with \`FOR UPDATE SKIP LOCKED\`, update them to IN_PROGRESS with the worker name and claim time, and commit. Each worker gets rows no other worker has locked. Send after the commit, then mark rows SENT. A ROWNUM filter is applied before skipping, so a worker can get fewer rows than are free. Fetching only the number you need from the cursor avoids that. A procedure that does the claim and returns the claimed keys keeps this logic in one place.

**3. Crashed workers.** Rows stay IN_PROGRESS after a crash. A sweep resets rows whose claim time is older than a limit back to NEW and adds one to an attempt counter. After a set number of attempts, mark them FAILED and alert. The partner side should still handle a rare duplicate by message ID.

**4. Deadlocks.** Two sessions each hold a row the other wants. Process keys in the same order in every flow, keep transactions short, avoid long running loads at peak sending times, and make sure foreign key columns are indexed. Oracle breaks a deadlock by failing one statement, so that flow should roll back and retry.
`,
  followUps: [
    {
      q: 'Could you use a Mule cluster primary node only poller instead?',
      a: 'Yes, one poller avoids the race, but it limits throughput to one node. SKIP LOCKED lets all nodes work.',
    },
    {
      q: 'What about Oracle Advanced Queuing?',
      a: 'It gives queue semantics inside the database. Many teams prefer a status table or a message broker that Mule supports well.',
    },
    {
      q: 'Does SKIP LOCKED help with fairness?',
      a: 'No. Order the cursor, for example by creation time, so old rows are claimed first.',
    },
  ],
}

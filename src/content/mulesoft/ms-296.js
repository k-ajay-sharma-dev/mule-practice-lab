export default {
  id: 'ms-296',
  category: 'mulesoft',
  title: 'Deadlocks in SQL Server: Error 1205, Victims, Retries From Mule and Prevention',
  level: 'ADVANCED',
  tags: ['myproject', 'sql-server', 'deadlocks', 'retries', 'locking', 'error-handling'],
  estMinutes: 22,
  quiz: [
    {
      type: 'single',
      prompt: 'What is a deadlock?',
      options: [
        'A query that runs for a long time',
        'Two or more sessions each hold a lock the other needs, so none can continue',
        'A connection pool that is full',
        'A table with no index',
      ],
      answer: 1,
      explain: 'Blocking clears when the holder finishes. A deadlock never clears by itself, so SQL Server must step in.',
    },
    {
      type: 'single',
      prompt: 'What does SQL Server do when it finds a deadlock?',
      options: [
        'It waits forever',
        'It picks a victim, rolls back that transaction and returns error 1205 to it',
        'It restarts the server',
        'It commits both',
      ],
      answer: 1,
      explain: 'The victim is chosen by deadlock priority and then by the cost to roll back. The other session continues.',
    },
    {
      type: 'single',
      prompt: 'A Mule flow gets error 1205 in the middle of a transaction with three statements. What should it retry?',
      options: [
        'Only the statement that failed',
        'The whole transaction from the start, after a short random delay, with a limit on attempts',
        'Nothing, 1205 is permanent',
        'Only the commit',
      ],
      answer: 1,
      explain: 'The victim\'s transaction was rolled back completely, so all its statements must run again. A random delay stops the two sessions from colliding again.',
    },
    {
      type: 'multi',
      prompt: 'Which changes reduce deadlocks?',
      options: [
        'Access tables and rows in the same order in every code path',
        'Keep transactions short and do no remote calls inside them',
        'Add indexes so updates touch fewer rows and pages',
        'Run more parallel workers on the same rows',
      ],
      answer: [0, 1, 2],
      explain: 'More parallel writers on the same rows raise the chance of a deadlock.',
    },
    {
      type: 'single',
      prompt: 'Where can a DBA find the graph of a deadlock that already happened?',
      options: [
        'In the Mule logs only',
        'In the system_health Extended Events session, which records deadlock reports by default',
        'In the transaction log backup',
        'Nowhere after it happens',
      ],
      answer: 1,
      explain: 'The deadlock graph shows the sessions, statements, locks and the victim. It is the starting point for a fix.',
    },
    {
      type: 'single',
      prompt: 'Two Mule workers bulk update inventory rows for the same stores, in different orders. What is a structural fix?',
      options: [
        'Use NOLOCK',
        'Sort each block by the table key before writing, or route each store to one worker so writers do not overlap',
        'Turn off the retry',
        'Make the blocks larger',
      ],
      answer: 1,
      explain: 'Writing in key order means sessions take locks in the same order, so they block briefly instead of deadlocking.',
    },
  ],
  description: `
Brindle Outdoor runs a Mule app on two workers that updates on hand stock in SQL Server from store files, before the nightly extract for the planning platform. A stored procedure in another app adjusts the same rows for transfers. A few times a night, one side fails with error 1205, and some updates are lost.

**Questions**
1. What is a deadlock, and how does SQL Server resolve it?
2. How should Mule react to 1205?
3. How do you find what deadlocked?
4. What would you change to prevent it?
`,
  answerTemplate: `## Deadlocks and the victim

## Reacting in Mule

## Finding the cause

## Prevention
`,
  keyPoints: [
    'A deadlock is a cycle of sessions waiting on each other\'s locks.',
    'SQL Server rolls back a victim and returns 1205.',
    'Retry the whole transaction after a random delay, with a limit.',
    'The system_health session keeps deadlock graphs.',
    'Same access order, short transactions and good indexes prevent most deadlocks.',
    'Sort blocks by key or route rows so writers do not overlap.',
  ],
  solution: `
**1. Deadlocks and the victim.** Session A holds a lock on row 1 and wants row 2, while session B holds row 2 and wants row 1. Neither can finish. SQL Server's lock monitor finds the cycle, picks a victim by deadlock priority and rollback cost, rolls it back and returns error 1205.

**2. Reacting in Mule.** The victim's transaction is gone, so the app must run the whole unit again. Wrap the transactional block in an until successful scope, or an error handler with a retry, that matches the deadlock error by its vendor code and retries after a short random delay, two or three times. Other database errors should not be retried this way. Log each retry, because frequent deadlocks need a fix, not more retries.

**3. Finding the cause.** Ask the DBA for the deadlock graph from the system_health Extended Events session. It shows the statements, the locked objects and which side was the victim.

**4. Prevention.** Sort each block by the table key before the bulk update, so all writers take locks in the same order. Make the procedure use the same order. Keep transactions short with no remote calls inside. Add or fix indexes so updates seek to rows instead of scanning. If needed, route each store to one worker so two Mule writers never touch the same rows.
`,
  followUps: [
    {
      q: 'Can you choose which session becomes the victim?',
      a: 'Yes, with SET DEADLOCK_PRIORITY. A batch job can set itself LOW so interactive work wins, then retry.',
    },
    {
      q: 'Does read committed snapshot remove deadlocks?',
      a: 'It removes most deadlocks between readers and writers, because readers stop taking shared locks. Writer against writer deadlocks remain.',
    },
    {
      q: 'Why is a random delay better than a fixed one?',
      a: 'Two victims with the same fixed delay can collide again at the same moment. A random delay spreads them out.',
    },
  ],
}

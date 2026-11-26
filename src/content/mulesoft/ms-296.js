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
      prompt: 'Flow A updates item 10, then item 20. Flow B updates item 20, then item 10, at the same moment. Flow C reads item 10 while a 5 minute report transaction holds a lock on it. Which is a deadlock?',
      options: [
        'C, since it waits behind a long running transaction until the report ends',
        'A and B, since each holds a row the other needs, so neither can go on',
        'Both cases, since any wait on a lock held by another session is a deadlock',
        'Neither, since SQL Server takes row locks here, and row locks cannot deadlock',
      ],
      answer: 1,
      explain: 'A and B each wait for a lock the other holds, so neither can finish, and SQL Server must step in. C is blocking: it clears when the report transaction ends. Row locks can deadlock too, like page or table locks, when two sessions take them in opposite orders.',
    },
    {
      type: 'single',
      prompt: 'Flows A and B both run at deadlock priority NORMAL. A has updated 5,000 rows and B has updated 3 rows when they deadlock. What happens?',
      options: [
        'A is chosen as the victim because it started first, and gets error 1205',
        'Both wait until the lock timeout, then both fail with a timeout error',
        'Only the last statement of each is rolled back, and both carry on',
        'B is chosen as the victim, being cheaper to roll back, and gets error 1205',
      ],
      answer: 3,
      explain: 'SQL Server picks a victim by deadlock priority first and then by the cost to roll back, so with equal priority the session with 3 rows loses. The victim\'s whole transaction is rolled back and it gets error 1205. The other session continues. SQL Server does not wait for a lock timeout, and start time does not decide the victim.',
    },
    {
      type: 'single',
      prompt: 'A Mule flow gets error 1205 in the middle of a transaction with three statements. What should it retry?',
      options: [
        'Only the statement that failed, since the earlier ones are still held open',
        'The whole transaction, after a short random delay, a few times at most',
        'Nothing, because the other session has already done the work',
        'The failed statement, then the commit, without any delay',
      ],
      answer: 1,
      explain: 'Retry from the start of the transaction, with a limit on attempts. The victim\'s transaction was rolled back completely, so all its statements must run again. A random delay stops the two sessions from colliding again.',
    },
    {
      type: 'multi',
      prompt: 'Which changes reduce deadlocks?',
      options: [
        'Access tables and rows in the same order in every code path',
        'Keep transactions short and do no remote calls inside them',
        'Add indexes so updates touch fewer rows and pages',
        'Run more parallel workers on the same rows, so each finishes sooner',
        'Add WITH (NOLOCK) to the UPDATE statements',
        'Retry the deadlock victim after a short delay',
      ],
      answer: [0, 1, 2],
      explain: 'The same access order removes the lock cycle, short transactions hold locks for less time, and good indexes lock fewer rows and pages. More parallel writers on the same rows raise the chance of a deadlock. NOLOCK is not allowed on the target of an UPDATE, and writers take exclusive locks anyway. A retry handles error 1205 when it happens, but it does not make deadlocks rarer.',
    },
    {
      type: 'single',
      prompt: 'Where can a DBA find the graph of a deadlock that already happened?',
      options: [
        'In the SQL Server error log, where deadlocks are written by default',
        'In the system_health Extended Events session, on by default',
        'In the transaction log, read with a log reader tool',
        'In sys.dm_tran_locks, which keeps past lock waits',
      ],
      answer: 1,
      explain: 'The system_health session records deadlock reports by default. The error log has them only when trace flag 1222 or 1204 is on. The deadlock graph shows the sessions, statements, locks and the victim. It is the starting point for a fix.',
    },
    {
      type: 'single',
      prompt: 'Two Mule workers bulk update inventory rows for the same stores, in different orders. What is a structural fix?',
      options: [
        'Add WITH (NOLOCK) to the update statements',
        'Sort blocks by table key, or route each store to one worker',
        'Raise the deadlock priority of both workers to HIGH',
        'Make the blocks larger, so there are fewer transactions',
      ],
      answer: 1,
      explain: 'Routing each store to one worker means writers do not overlap. NOLOCK does not apply to updates, and equal priorities change nothing. Writing in key order means sessions take locks in the same order, so they block briefly instead of deadlocking.',
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

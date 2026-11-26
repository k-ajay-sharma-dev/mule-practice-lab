export default {
  id: 'ms-358',
  category: 'mulesoft',
  title: 'A Batch Job Runs Six Times Slower Than Last Month: What to Check First',
  level: 'ADVANCED',
  tags: ['myproject', 'batch', 'production-support', 'performance', 'code-map', 'oracle'],
  estMinutes: 25,
  quiz: [
    {
      type: 'order',
      prompt: 'Put the first checks for a slow batch job in order.',
      items: [
        'Compare record counts and run times with earlier runs in the job log',
        'Find which step takes the time, from per step or per block timing logs',
        'Look inside that step for a call per record: a lookup, an HTTP call or a single row query',
        'Check resources: database pool waits, worker CPU, memory and temp disk',
      ],
      explain: 'First decide whether the data grew or the work per record grew.',
    },
    {
      type: 'single',
      prompt: 'Record counts are the same, and the lookup step now takes 90 ms per record. A release added a code map query per record. What is the fix?',
      options: [
        'Raise max concurrency so more records query the code map at once',
        'Load the code map once before the job and look codes up in memory',
        'Add an index on the code map table so each query takes less time',
        'Raise the block size so each thread handles more records per block',
      ],
      answer: 1,
      explain: 'Keep the map in a variable or a cache. A few thousand map rows fit in memory. One query instead of millions is the real fix. More concurrency or an index only makes each of the millions of queries a little cheaper, and adds load on the database.',
    },
    {
      type: 'single',
      prompt: 'Max concurrency is 16 and the database pool has 5 connections. What happens in the load step?',
      options: [
        'The threads take turns on the 5 connections, so all 16 keep full speed',
        'Most threads wait for a connection, so they add waiting, not speed',
        'The pool grows past 5 when threads wait, up to the concurrency',
        'The extra threads fail with a connection error and the records fail',
      ],
      answer: 1,
      explain: 'Size the pool to match the concurrency of the steps that use it, within what the database can take.',
    },
    {
      type: 'multi',
      prompt: 'Which signs point to the database, not Mule, as the slow part?',
      options: [
        'The bulk insert time per block grew while the block size stayed the same',
        'The DBA sees lock waits or a full scan on the staging table',
        'Indexes or triggers were added to the staging table',
        'The worker CPU is at 100 percent in DataWeave',
        'The gap between blocks grew while the insert time per block stayed flat',
        'Heap use and garbage collection pauses on the worker grew',
      ],
      answer: [0, 1, 2],
      explain: 'A longer insert for the same block size, lock waits or a full scan, and new indexes or triggers all put the time inside the database. High CPU in DataWeave points at the mapping, not at the database. A flat insert time with longer gaps means Mule takes longer to build each block. Heap and garbage collection trouble is on the worker too.',
    },
    {
      type: 'single',
      prompt: 'The job seems stuck: no new block log rows for 20 minutes, and On Complete never ran. What do you check?',
      options: [
        'Restart the app at once, since the batch job resumes where it stopped',
        'A thread dump, and the database for blocking sessions',
        'The worker CPU graph, since a stuck job shows as 100 percent CPU',
        'The scheduler, in case it started a second run that took the lock',
      ],
      answer: 1,
      explain: 'Look for threads waiting on a pool, a lock or a remote call without a timeout. Calls without timeouts can wait forever, often with low CPU. Find what they wait on before a restart erases the evidence.',
    },
    {
      type: 'single',
      prompt: 'After the fix, how do you show it worked?',
      options: [
        'Time one run in a test environment with a small sample of the supplier file',
        'Compare run time and records per second per step, before and after',
        'Check that no errors were logged during the next nightly run',
        'Check that the worker CPU is lower than before the fix',
      ],
      answer: 1,
      explain: 'Numbers from the same job log make the case and set a baseline for alerts.',
    },
  ],
  description: `
Marrow & Pine Home's product data hub loads supplier items with a batch job: a lookup step that translates codes with code maps, and a load step whose aggregator bulk inserts into Oracle staging, with a row by row fallback. The job used to take 6 minutes. Since a release two weeks ago it takes 40, and last night it seemed to hang.

**Questions**
1. What do you check first?
2. How do you tell a Mule problem from a database problem?
3. What could the release have changed?
4. What do you do when the job seems stuck?
`,
  answerTemplate: `## First checks

## Mule or database

## What the release changed

## A stuck job
`,
  keyPoints: [
    'Compare counts and times in the job log first.',
    'Find the slow step from per step or per block timings.',
    'Look for a call per record inside the slow step.',
    'Load code maps once and look up in memory.',
    'Match pool size and concurrency.',
    'Take a thread dump before restarting a stuck job.',
  ],
  solution: `
**1. First checks.** Compare record counts and run times in the job log with earlier runs. If counts are the same, the work per record grew. Then find the slow step from per step or per block timings.

**2. Mule or database.** If insert time per block grew, or the DBA sees locks, scans or new triggers on staging, the database is slow. If CPU is high in DataWeave, or a step makes a call per record, Mule is. A pool smaller than the step's concurrency shows as waiting for connections.

**3. What the release changed.** Look for a new query or HTTP call per record, such as a code map lookup moved into the lookup step, a larger payload per record, or changed block size and concurrency. The fix for a per record lookup is to load the map once before the job and look up in memory.

**4. A stuck job.** Take a thread dump and see what threads wait on: a pool, a lock or a remote call without a timeout. Ask the DBA for blocking sessions. Then fix and restart, with idempotent writes keyed by run ID so a rerun does no harm.
`,
  followUps: [
    {
      q: 'How would you catch this before production?',
      a: 'Run a performance test with a realistic file in a test environment, and compare records per second per step with the last release.',
    },
    {
      q: 'What if the code map is too large for memory?',
      a: 'Load only the codes used in this file, gathered in one pass, or join in the database with one set based query.',
    },
    {
      q: 'Can the row by row fallback cause the slowdown?',
      a: 'Yes. If many blocks fail, each falls back to single inserts. Check the reject counts and the reason blocks fail.',
    },
  ],
}

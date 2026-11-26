export default {
  id: 'ms-352',
  category: 'mulesoft',
  title: 'A SQL Server Query From Mule Got Slow Overnight: What to Check First',
  level: 'ADVANCED',
  tags: ['myproject', 'sql-server', 'production-support', 'performance', 'jdbc', 'troubleshooting'],
  estMinutes: 25,
  quiz: [
    {
      type: 'order',
      prompt: 'The sales extract query went from 40 seconds to 15 minutes. Put the first checks in order.',
      items: [
        'Check whether the query is running or waiting, and on what, with the DBA or the dynamic management views',
        'Check for blocking by another session, such as a long load on the same table',
        'Compare the current plan with an older one from the Query Store, if it is on',
        'Check what changed: data volume, statistics, indexes, parameters or the Mule release',
      ],
      explain: 'Waiting on a lock and running a bad plan need very different fixes.',
    },
    {
      type: 'single',
      prompt: 'The extract waits on LCK_M_S. Its blocker is a session with an open transaction whose last statement ended an hour ago. What is the likely cause?',
      options: [
        'The extract reads pages from a slow disk, and the engine shows that as a lock wait',
        'Mule fetches the rows slowly, so SQL Server keeps the read lock on the table',
        'The extract waits for memory to start its sort, which shows as a shared lock',
        'Another job left a write transaction open, and its locks block the shared read',
      ],
      answer: 3,
      explain: 'LCK_M_S is a wait for a shared lock. A blocker that is idle but has an open transaction still holds its write locks, often a job that started earlier and never committed. Find the head blocker with the DBA and have that job commit or roll back. Disk, network and memory waits have their own wait types, such as PAGEIOLATCH, ASYNC_NETWORK_IO and RESOURCE_SEMAPHORE.',
    },
    {
      type: 'single',
      prompt: 'The plan shows an index scan with CONVERT_IMPLICIT on the store_code column, which is VARCHAR. What is the likely cause?',
      options: [
        'The index on store_code was dropped, so a scan is the only choice',
        'The driver sends the parameter as NVARCHAR, so the column is converted',
        'The statistics on store_code are stale, so the optimiser chose a scan',
        'The store_code column holds NULLs, which an index seek cannot match',
      ],
      answer: 1,
      explain: 'JDBC drivers send string parameters as NVARCHAR by default. SQL Server then converts the VARCHAR column, shown as CONVERT_IMPLICIT, and cannot seek the index. With the Microsoft driver, the sendStringParametersAsUnicode=false URL setting is one known fix. Test it, since it affects all string parameters. A dropped index or stale statistics would not add CONVERT_IMPLICIT.',
    },
    {
      type: 'single',
      prompt: 'The same procedure is fast for most stores and very slow for the largest one, depending on which ran first after a restart. What is this?',
      options: [
        'Blocking: the largest store’s rows are locked by the nightly load',
        'Parameter sniffing: a plan built for a small store is reused',
        'Stale statistics: the largest store grew since they were updated',
        'Pool limits: the largest store waits longest for a connection',
      ],
      answer: 1,
      explain: 'Options include OPTION (RECOMPILE) for that query, or plan guidance. Pick with the DBA.',
    },
    {
      type: 'multi',
      prompt: 'Which Mule side causes can make a query look slow?',
      options: [
        'The connection pool is exhausted, so the flow waits for a connection before the query starts',
        'Fetch size is small and the result is large, so many round trips are made',
        'The flow loads the whole result into memory and the worker spends its time in garbage collection',
        'The query uses named parameters instead of values written into the SQL text',
        'The query timeout on the operation is set too low',
        'The database config uses a pooling profile instead of a new connection per call',
      ],
      answer: [0, 1, 2],
      explain: 'Waiting for a pooled connection, many small fetch round trips and long garbage collection pauses all add time on the Mule side. Measure the time at the database and in the flow. If the database says 4 seconds and the flow says 40, look at Mule. Named parameters are the safe way to pass values and do not slow the query. A low timeout makes the query fail fast, not run slow. Pooling saves time, since a new connection per call is the slow path.',
    },
    {
      type: 'single',
      prompt: 'Statistics on the sales table were last updated before a 30 million row backfill. What can happen?',
      options: [
        'Nothing, since SQL Server reads the real row count at run time',
        'The optimiser misjudges row counts and picks a plan that fits badly',
        'The table stays locked for writes until the statistics are updated',
        'The query fails with an error until someone runs UPDATE STATISTICS',
      ],
      answer: 1,
      explain: 'The plan is built from statistics, not from a live count. Auto update may not have run, or may have sampled poorly, after a large load. Update statistics after large loads, or ask the DBA to schedule it.',
    },
  ],
  description: `
Brindle Outdoor extracts daily store sales from SQL Server for the planning platform. The query ran in 40 seconds for months. Last night it took 15 minutes and the file reached the platform late. Nobody changed the query. There was a release of the Mule app the day before, and a backfill of old sales on the weekend.

**Questions**
1. What do you check first?
2. How do you tell blocking from a bad plan?
3. Which causes from the driver and from the data would you look for?
4. What can be slow on the Mule side?
`,
  answerTemplate: `## First checks

## Blocking or a bad plan

## Driver and data causes

## The Mule side
`,
  keyPoints: [
    'Find out whether the query runs or waits, and on what.',
    'Lock waits point to blocking, find the head blocker.',
    'NVARCHAR parameters on VARCHAR columns can stop index seeks.',
    'Parameter sniffing can give a plan that fits one value only.',
    'Stale statistics after big loads give bad estimates.',
    'Pool waits, fetch size and memory make Mule look slow.',
  ],
  solution: `
**1. First checks.** With the DBA, see whether the query is running or waiting, and on which wait type. Check what changed: the release, the backfill, statistics, indexes.

**2. Blocking or bad plan.** Lock waits such as LCK_M_S mean another session holds locks. Find the head blocker. If the query runs but reads far more than before, compare its plan with the older one, for example in the Query Store.

**3. Driver and data causes.** The JDBC driver can send strings as NVARCHAR. Against a VARCHAR column this causes CONVERT_IMPLICIT and a scan instead of a seek. A release that changed the URL or the parameter types can do this. Parameter sniffing can build a plan for one store that is bad for another. The backfill may have left statistics stale.

**4. The Mule side.** Waiting for a pool connection, a small fetch size on a large result, or loading all rows into memory can add minutes. Compare the time the database reports with the time in the flow logs.
`,
  followUps: [
    {
      q: 'How do you prove the implicit conversion is the cause?',
      a: 'Run the same query in a tool with a VARCHAR parameter and with an NVARCHAR one, and compare the plans and reads.',
    },
    {
      q: 'Is NOLOCK a fix for blocking here?',
      a: 'No. It can return rows twice or skip them during the backfill. Fix the blocker or use snapshot isolation with the DBA.',
    },
    {
      q: 'What would you log in the flow to spot this faster?',
      a: 'Time to get a connection, time for the query, and row count, with the run ID, so a slow step stands out.',
    },
  ],
}

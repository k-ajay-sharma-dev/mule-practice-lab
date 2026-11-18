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
      prompt: 'The query waits on LCK_M_S. What does it mean?',
      options: [
        'The disk is slow',
        'It waits for a shared lock that another session blocks, often an open write transaction',
        'The network is down',
        'The plan is bad',
      ],
      answer: 1,
      explain: 'Find the head blocker. Often it is another job that started earlier or never committed.',
    },
    {
      type: 'single',
      prompt: 'The plan shows an index scan with CONVERT_IMPLICIT on the store_code column, which is VARCHAR. What is the likely cause?',
      options: [
        'A missing index',
        'The JDBC driver sends string parameters as NVARCHAR by default, so SQL Server converts the column and cannot seek the index',
        'Too many rows',
        'A wrong join',
      ],
      answer: 1,
      explain: 'With the Microsoft driver, the sendStringParametersAsUnicode=false URL setting is one known fix. Test it, since it affects all string parameters.',
    },
    {
      type: 'single',
      prompt: 'The same procedure is fast for most stores and very slow for the largest one, depending on which ran first after a restart. What is this?',
      options: [
        'A network problem',
        'Parameter sniffing: the cached plan was built for a small store and reused for a large one',
        'A deadlock',
        'Encryption overhead',
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
        'The query text is in a properties file',
      ],
      answer: [0, 1, 2],
      explain: 'Measure the time at the database and in the flow. If the database says 40 seconds, look at Mule.',
    },
    {
      type: 'single',
      prompt: 'Statistics on the sales table were last updated before a 30 million row backfill. What can happen?',
      options: [
        'Nothing',
        'The optimiser estimates few rows and picks a plan that is bad for the real volume',
        'The table locks',
        'The query fails',
      ],
      answer: 1,
      explain: 'Update statistics after large loads, or ask the DBA to schedule it.',
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

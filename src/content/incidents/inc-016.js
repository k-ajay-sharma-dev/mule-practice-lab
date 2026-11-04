export default {
  id: 'inc-016',
  category: 'incidents',
  title: 'All Endpoints Time Out After a New Reporting Endpoint Goes Live',
  level: 'INTERMEDIATE',
  tags: ['database', 'connection-pool', 'performance', 'bulkhead'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '08:59:58.001 INFO  [health] GET /health 200 (2 ms)', relevant: false },
      { text: '09:01:12.004 INFO  [customer-sapi] GET /reports/customer-activity user=mgr07 corrId=a01f', relevant: true, why: 'Sales managers open the new report at 09:00; each query holds a DB connection for 40 to 90 s.' },
      { text: '09:01:15.300 INFO  [metrics] db.pool active=10 idle=0 waiting=23', relevant: true, why: 'All 10 pooled connections are in use and requests are queuing for one.' },
      { text: '09:01:31.882 INFO  [customer-sapi] GET /customers/C-118223 corrId=bb21', relevant: false },
      { text: '09:02:01.890 ERROR [customer-sapi] DB:CONNECTIVITY Could not obtain connection from data source: checkout timed out corrId=bb21', relevant: true, why: 'The fast endpoint waits exactly maxWait (30 s) for a connection and then fails: pool exhaustion, not a slow query.' },
      { text: '09:02:01.893 ERROR [customer-sapi] Returning 500 for GET /customers/C-118223 corrId=bb21', relevant: false },
      { text: '09:02:05.000 INFO  [metrics] cpu=12% heap=38%', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the most likely root cause?',
        options: [
          'The long report queries occupy all 10 connections of the shared pool, so other endpoints time out waiting for one',
          'The database server is overloaded',
          'The /customers query lost its index',
          'The app runs out of CPU at 09:00',
        ],
        answer: 0,
        explain: 'The error is a connection checkout timeout after 30 s (maxWait), the DB runs only 10 queries, and the app CPU is low. Threads wait for the pool.',
      },
      {
        type: 'single',
        prompt: 'What do you do **right now**?',
        options: [
          'Raise maxPoolSize to 100',
          'Disable or limit the report endpoint (rate limit or maxConcurrency) so critical endpoints get connections',
          'Restart the app every morning at 09:30',
          'Increase maxWait to 120 s',
        ],
        answer: 1,
        explain: 'Protect the critical traffic first. A bigger pool shifts load to the DB, and a longer maxWait makes the web shop wait longer before failing.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix**?',
        options: [
          'A separate small pool (bulkhead) for reporting, ideally against a read replica',
          'queryTimeout on DB operations and a short maxWait for interactive endpoints',
          'Make the report cheap: indexes, pre-aggregated tables and short caching',
          'Monitor pool active, idle and waiting counts',
          'Run all endpoints in one flow with maxConcurrency=1',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Isolate heavy workloads, bound how long anything can hold a connection, and make the report itself cheaper.',
      },
      {
        type: 'order',
        prompt: 'Put the incident response in order.',
        items: [
          'Correlate the 09:00 slowdowns with the report release and pool usage',
          'Disable or throttle the report endpoint',
          'Confirm /customers latency is normal again',
          'Move reporting to its own pool and a read replica, with query timeouts',
          'Load-test new endpoints together with the normal traffic mix',
        ],
        explain: 'Diagnose, protect critical traffic, verify, isolate the workload, and test properly next time.',
      },
    ],
  },
  description: `
## Symptoms
- \`customer-sapi\` serves \`GET /customers/{id}\` (normally ~40 ms) to the web shop and call centre.
- Since Monday, **every weekday around 09:00** all endpoints slow down and many requests fail after ~30 s. By 09:45 it recovers on its own.
- CPU on the app is low; the database team says DB CPU is moderate but they see **10 long-running queries** from the Mule app at the same time.

## Change / Context
- Last Friday a new endpoint \`GET /reports/customer-activity\` was released for the sales team's dashboard, which **10 sales managers open at 09:00**. Its query scans six months of activity and takes **40–90 s**.
- All endpoints use the **same** \`Database_Config\` with \`<db:pooling-profile maxPoolSize="10" maxWait="30" maxWaitUnit="SECONDS"/>\`.
- No query timeout is set on any DB operation.

## Logs
\`\`\`
09:01:12.004 INFO  [customer-sapi] GET /reports/customer-activity user=mgr07 corrId=a01f
09:01:31.882 INFO  [customer-sapi] GET /customers/C-118223 corrId=bb21
09:02:01.890 ERROR [customer-sapi] DB:CONNECTIVITY Could not obtain connection from data source
  Caused by: An attempt by a client to checkout a Connection has timed out. corrId=bb21
09:02:01.893 ERROR [customer-sapi] Returning 500 for GET /customers/C-118223 corrId=bb21
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do **right now**?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Identifies connection pool exhaustion: 10 report queries each hold one of the 10 pooled connections for 40–90 s, so other requests wait 30 s (maxWait) and fail with DB:CONNECTIVITY.',
    'Explains why CPU is low and the DB is not overloaded: requests are waiting for a connection, not working.',
    'Immediate: disable/rate-limit the report endpoint or move the dashboard refresh off 09:00, and confirm the main endpoints recover.',
    'Permanent fix: bulkhead — a separate DB config/pool (ideally against a read replica or reporting store) for reporting, plus query timeouts and query/index optimisation.',
    'Considers pre-computing the report (scheduled job/materialised view) instead of running a heavy query per request.',
    'Prevention: monitor pool usage/wait time and query durations, and load test new endpoints together with existing traffic.',
  ],
  solution: `
**Diagnosis.** All endpoints share one pool of **10 connections**. At 09:00 the ten managers open the dashboard, and each report query holds a connection for **40–90 s**. The pool is empty, so \`GET /customers/{id}\` waits up to \`maxWait\` = **30 s** for a connection and then fails with **DB:CONNECTIVITY** ("checkout ... timed out"). The app's CPU is low because threads are *waiting*; the DB is fine because it's only running 10 queries. When the reports finish, the pool frees up and everything recovers — matching the 09:45 recovery.

**Immediate mitigation.** Protect the critical endpoints: temporarily **disable** \`/reports/customer-activity\` or limit it (e.g. API Manager rate limit / spike control on that resource, or a flow \`maxConcurrency\` of 2). Ask sales to use yesterday's export meanwhile. Confirm \`/customers\` latency is back to normal.

**Root cause.** A heavy, long-running analytical workload was added to an **OLTP connection pool** shared with latency-sensitive traffic, with no isolation (bulkhead) and no query timeout.

**Permanent fix.**
- **Bulkhead**: a separate \`Reporting_Database_Config\` with its own small pool, pointing to a **read replica** or reporting database. Better still, a separate reporting API.
- **Timeouts**: set \`queryTimeout\` on DB operations so a runaway query can't hold a connection forever; keep \`maxWait\` short for interactive endpoints so they fail fast.
- **Make the report cheap**: indexes, a pre-aggregated table or materialised view refreshed by a scheduled job, and caching the result for a few minutes.

**Prevention.** Monitor pool active/idle/waiting counts and connection wait time, plus slow-query logs on the DB; load test new endpoints *together* with the normal traffic mix; design review question: "which pool/resource does this share with critical traffic?".
`,
  followUps: [
    { q: 'Why not just increase maxPoolSize to 50?', a: 'It may hide the problem for a while, but the reports would then use more DB resources and still compete with interactive traffic; the database has its own connection limits. Isolation and making the report cheap fix the cause.' },
    { q: 'How would you prove it is pool exhaustion and not a slow database?', a: 'The error is a checkout timeout, not a query timeout; failing requests wait almost exactly maxWait; the DB shows only ~10 active sessions from the app (all the report query) and the problem starts when the report is called.' },
    { q: 'What is a bulkhead in integration design?', a: 'Isolating resources (pools, threads, apps) per workload so one workload\'s failure or slowness cannot exhaust resources needed by another, like compartments in a ship.' },
  ],
}

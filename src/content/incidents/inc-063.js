export default {
  id: 'inc-063',
  category: 'incidents',
  title: 'Scaling Inventory API for Peak Locks Every App Out of Oracle (ORA-12519)',
  level: 'ADVANCED',
  tags: ['retail', 'supply-chain', 'oracle', 'connection-pool', 'scaling', 'cloudhub'],
  estMinutes: 35,
  investigation: {
    logs: [
      { text: '08:00:05.000 INFO  [runtime-mgr] inventory-sapi scaled from 2 to 12 replicas (peak readiness plan)', relevant: true, why: 'Each new replica brings its own connection pools: the total connections the app can open grew six-fold.' },
      { text: '08:00:06.100 INFO  [config] inventory-sapi Inventory_DB maxPoolSize=20, Reservation_DB maxPoolSize=20 (same Oracle service SCMPRD)', relevant: true, why: 'Two pools of 20 per replica: 12 x 40 = 480 possible sessions from this one app.' },
      { text: '09:14:22.410 INFO  [inventory-sapi] GET /availability?sku=88120&store=0412 200 (42 ms)', relevant: false },
      { text: '09:14:30.882 ERROR [order-papi] DB:CONNECTIVITY Listener refused the connection with the following error: ORA-12519, TNS:no appropriate service handler found', relevant: true, why: 'A different app cannot get a new session: the database has hit its PROCESSES/SESSIONS limit and the listener blocks new connections.' },
      { text: '09:14:31.020 ERROR [returns-sapi] DB:CONNECTIVITY ORA-12519, TNS:no appropriate service handler found', relevant: false },
      { text: '09:15:00.000 INFO  [dba] v$resource_limit processes current=500 limit=500; 470 sessions from program=inventory-sapi, status INACTIVE', relevant: true, why: 'The limit is reached and almost all sessions belong to inventory-sapi and are idle, held open by its pools.' },
      { text: '09:15:02.000 INFO  [health] GET /health 200 (2 ms)', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why are other apps getting ORA-12519?',
        options: [
          'Scaling inventory-sapi to 12 replicas multiplied its connection pools, and their mostly idle sessions used up the database PROCESSES limit',
          'The Oracle listener crashed',
          'The new replicas use a wrong password',
          'The database is out of CPU',
        ],
        answer: 0,
        explain: 'Pools are per replica. 12 replicas x 2 pools x 20 = 480 sessions against a limit of 500, so every other app is refused new connections.',
      },
      {
        type: 'single',
        prompt: 'What is the quickest safe **mitigation**?',
        options: [
          'Scale inventory-sapi back to a lower replica count (or redeploy with smaller maxPoolSize) to release sessions, then confirm other apps recover',
          'Restart the Oracle database during trading hours',
          'Ask the DBA to kill random sessions every 10 minutes',
          'Increase maxPoolSize so inventory-sapi gets connections faster',
        ],
        answer: 0,
        explain: 'Reduce the total demand from the app that caused it. Killing sessions or restarting the DB is disruptive, and larger pools make the problem worse.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and prevention**?',
        options: [
          'Budget connections: replicas x pools x maxPoolSize for every app must fit within the database limit with headroom',
          'Size pools per replica from measured concurrency, and release idle connections (e.g. maxIdleTime)',
          'Use a separate Oracle service per workload so limits and monitoring are clear per app',
          'Add a check to the scaling runbook and alert on DB sessions approaching the limit',
          'Remove connection pooling so connections are only opened when needed',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Treat database connections as a shared capacity. Without pooling each request would open a new session, which is slower and still hits the limit under load.',
      },
      {
        type: 'order',
        prompt: 'Put the response in order.',
        items: [
          'Correlate the ORA-12519 errors with the 08:00 scale-out',
          'Check v$resource_limit and sessions per program with the DBA',
          'Scale inventory-sapi down or reduce its pool size',
          'Confirm order-papi and returns-sapi connect again',
          'Agree a connection budget per app and add it to the scaling runbook',
        ],
        explain: 'Correlate, confirm with DB evidence, reduce demand, verify, then make capacity planning explicit.',
      },
    ],
  },
  description: `
## Symptoms
- From ~09:10, \`order-papi\`, \`returns-sapi\` and the store replenishment batch fail to connect to Oracle with **ORA-12519**. Click-and-collect orders cannot be placed.
- \`inventory-sapi\` itself works normally.
- The database is not busy: CPU ~30%.

## Change / Context
- For the holiday peak, \`inventory-sapi\` on CloudHub 2.0 was scaled from **2 to 12 replicas** at 08:00.
- Each replica has two Database configs to the same Oracle service, each with \`maxPoolSize="20"\`.
- The Oracle \`PROCESSES\` parameter is **500**; about 30 sessions are normally used by other apps and background processes.

## Logs
\`\`\`
08:00:05.000 INFO  [runtime-mgr] inventory-sapi scaled from 2 to 12 replicas
09:14:30.882 ERROR [order-papi] DB:CONNECTIVITY Listener refused the connection with the
  following error: ORA-12519, TNS:no appropriate service handler found
09:15:00.000 INFO  [dba] v$resource_limit processes current=500 limit=500;
  470 sessions from program=inventory-sapi, status INACTIVE
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
    'ORA-12519 here means the database reached its PROCESSES/SESSIONS limit and the listener refuses new connections.',
    'Connection pools are per replica: 12 replicas x 2 pools x 20 = 480 possible sessions from inventory-sapi alone.',
    'The sessions are mostly INACTIVE: pools hold idle connections opened during bursts.',
    'Immediate: scale down or shrink pools to release sessions; verify the other apps reconnect.',
    'Fix: a connection budget per app, pools sized from measured concurrency with idle release, per-workload DB services, alerts on session usage, scaling runbook check.',
  ],
  solution: `
**Diagnosis.** Each CloudHub replica runs its own copy of every connection pool. After the scale-out, \`inventory-sapi\` could open **12 x 2 x 20 = 480** sessions. During the morning burst its pools grew, and the connections stayed open (INACTIVE) in the pools. Together with the ~30 normal sessions the database reached \`PROCESSES=500\`, and the listener started refusing new connections with **ORA-12519, TNS:no appropriate service handler found**. Apps that already had connections (inventory-sapi) kept working; apps that needed new ones failed with **DB:CONNECTIVITY**.

**Immediate mitigation.** Scale \`inventory-sapi\` down (e.g. to 6 replicas) or redeploy with \`maxPoolSize="5"\` per pool. Sessions are released as replicas stop. Confirm with the DBA that the session count drops and that \`order-papi\` and \`returns-sapi\` connect again; replay or let the replenishment batch rerun.

**Root cause.** The scale-out was planned for CPU and throughput only. Nobody multiplied the per-replica pool sizes by the replica count and compared that with the database limit.

**Permanent fix.**
- A **connection budget**: for each app, replicas x pools x maxPoolSize, summed across apps, must stay below the DB limit with headroom.
- Size pools from measured concurrency (often 5–10 per replica is plenty), and let idle connections close (\`maxIdleTime\` in the pooling profile).
- If one app needs few connections, consider merging its two configs into one pool.
- Give each workload its own Oracle service so the DBA can see and limit usage per app.

**Prevention.** A scaling runbook step for DB connections, alerts on sessions/processes above 80% of the limit, and load tests at the planned replica count.
`,
  followUps: [
    { q: 'Why did inventory-sapi keep working while others failed?', a: 'Its pools already held open sessions and reused them; only new connection attempts are refused, and the other apps needed new connections.' },
    { q: 'Would increasing PROCESSES on Oracle be a valid fix?', a: 'It can be part of capacity planning but costs memory on the DB server and requires a restart; without a connection budget the next scale-out would hit the new limit too.' },
    { q: 'How would you size maxPoolSize per replica?', a: 'Measure concurrent DB operations per replica under peak (roughly requests per second x DB time per request). Add some headroom, and keep it well below the share of the DB limit allocated to that app.' },
  ],
}

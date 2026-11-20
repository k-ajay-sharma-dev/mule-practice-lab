export default {
  id: 'inc-165',
  category: 'incidents',
  title: 'One Team\'s Thread Pool Change Throttles Every App on a Shared Mule Instance: schedulers-pools.conf Is Global',
  level: 'ADVANCED',
  tags: ['deployment', 'performance', 'threading', 'uber-pool', 'on-prem', 'back-pressure', 'environments'],
  estMinutes: 35,
  investigation: {
    logs: [
      { text: '2026-11-16 05:00:12 INFO  [change] Mule instance restarted after OS patching; conf/schedulers-pools.conf changed on 2026-11-12: org.mule.runtime.scheduler.uber.threadPool.maxSize=16', relevant: true, why: 'This is the first startup since the file changed four days earlier, and Mule configures the thread pool at startup, so this is when the global limit most likely took effect.' },
      { text: '2026-11-16 05:03:44 INFO  [mule_ee] 14 applications DEPLOYED', relevant: false },
      { text: '2026-11-16 08:58:10 WARN  [exp-web-orders] Flow \'exp-web-orders-main\' is unable to accept new events at this time', relevant: true, why: 'This is the documented back-pressure message: threads are busy or concurrency is exceeded.' },
      { text: '2026-11-16 08:58:10 WARN  [sys-inventory] Flow \'sys-inventory-main\' is unable to accept new events at this time', relevant: true, why: 'A different app has the same message at the same moment, which suggests a shared limit, because the UBER pool is shared by all apps.' },
      { text: '2026-11-16 08:58:11 INFO  [lb] exp-web-orders 503 rate 21%', relevant: true, why: 'An `http:listener` might return 503 under back-pressure, so this is user impact.' },
      { text: '2026-11-16 08:59:02 INFO  [threaddump] uber threads: 16 of 16 busy; 13 in [prc-reporting].export-flow.BLOCKING', relevant: true, why: 'The pool is at the new limit, and one app\'s blocking work holds most of it.' },
      { text: '2026-11-16 08:59:20 INFO  [os] CPU 19%, load 3.1, memory 61%', relevant: true, why: 'Low CPU shows threads are waiting, not computing, so the host has capacity to spare.' },
      { text: '2026-11-16 09:00:00 INFO  [health] GET /api/health 200 (2 ms)', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause?',
        options: [
          'The global UBER pool limit of 16 is shared by all apps, and one app’s blocking work filled it',
          'The OS patch reduced the cores Mule can see, so the default pool size dropped',
          'Each app read the file into its own pool of 16, which is too small for the peak',
          'The load balancer started throttling the server after the 05:00 restart',
        ],
        answer: 0,
        explain: 'The configuration is global, and the UBER pool is shared across all apps in the instance. The restart is most likely when it took effect, not the cause.',
      },
      {
        type: 'single',
        prompt: 'Which documented behaviour best fits the quiet period between 12 November and the Monday morning?',
        options: [
          'Mule sets up the pool at startup, so the edit waited for the Monday restart',
          'Mule re-reads the file hourly, but only applies a smaller pool when it is idle',
          'The Runtime Manager agent pushes `conf` changes only after an OS restart',
          'The new limit applied at once, but no traffic reached 16 threads until Monday',
        ],
        answer: 0,
        explain: 'The Execution Engine page says Mule configures the pool at startup. It does not state when the file is read, so this is the best reading of the timeline, not a quoted rule. A latent configuration change is a classic trap: the first restart after it may be for an unrelated reason, like OS patching, so that change gets the blame.',
      },
      {
        type: 'single',
        prompt: 'What is the right immediate action?',
        options: [
          'Restore the default `schedulers-pools.conf`, then restart the instance in a controlled way',
          'Set `workQueue.size` to a large number so that waiting events queue instead',
          'Raise `maxConcurrency` on the flows that log back-pressure, then redeploy them',
          'Redeploy `exp-web-orders`, so that it picks up a fresh pool of its own',
        ],
        answer: 0,
        explain: 'The limit lies in the global file. Raising `maxConcurrency` adds no threads to the pool, and a queue would only hide the waiting. The docs do not say that a running instance re-reads the file, so plan on a restart.',
      },
      {
        type: 'multi',
        prompt: 'The reporting team\'s original goal was to stop `prc-reporting` overloading its database. Which options are better?',
        options: [
          'Set `maxConcurrency` on the reporting flow, as the tuning guide suggests when a backend is affected by high concurrency',
          'Size and time-limit the database connection pool and queries',
          'Move the export job to a time outside the peak, or to a separate instance',
          'Load test all apps together before any thread change',
          'Lower the global pool further',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Limit the app that causes the pressure, not the shared engine. `ee:scheduler-pools` is another option, but it creates a new set of pools for the app and adds threads to the instance.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Confirm that several apps show back-pressure at the same time',
          'Take thread dumps and check CPU',
          'Find the configuration difference from the baseline',
          'Restore the default and restart in a controlled way',
          'Verify that the 503 rate and the back-pressure messages stop',
          'Agree a change control rule for files under `$MULE_HOME/conf`',
        ],
        explain: 'Back-pressure in many apps at once points to something shared. Evidence comes before the restart, because a restart destroys it.',
      },
    ],
  },
  description: `
## Symptoms
- Monday 08:58: \`exp-web-orders\` returns **503** to about 21% of requests. Support then reports that other apps on the same server are slow.
- Logs from several apps show \`Flow '...' is unable to accept new events at this time\`.
- Host CPU is 19%. Memory looks fine. Backends other than the reporting database are healthy.

## Change / Context
- One standalone Mule instance on 8 cores hosts **14 apps**. It was restarted at 05:00 on Monday after OS patching, which is being blamed.
- On Thursday, a developer from the reporting team, trying to stop \`prc-reporting\` from swamping its database, set this line in \`$MULE_HOME/conf/schedulers-pools.conf\`:

\`\`\`properties
org.mule.runtime.scheduler.uber.threadPool.maxSize=16
\`\`\`

- The developer believed the file was read per app. No load test was done, and the file is not in version control.
- \`prc-reporting\` runs a slow export every Monday at 08:45, with long database operations.

## Logs
\`\`\`
05:00:12 INFO [change] Mule restarted; schedulers-pools.conf changed 2026-11-12: uber maxSize=16
08:58:10 WARN [exp-web-orders] Flow 'exp-web-orders-main' is unable to accept new events at this time
08:58:10 WARN [sys-inventory] Flow 'sys-inventory-main' is unable to accept new events at this time
08:59:02 INFO [threaddump] uber threads: 16 of 16 busy; 13 in [prc-reporting].export-flow.BLOCKING
08:59:20 INFO [os] CPU 19%, load 3.1, memory 61%
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do right now?
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
    'The UBER pool is shared by all apps in a Mule instance, and `schedulers-pools.conf` is global.',
    'The docs say Mule configures the pool at startup, which fits a change that showed no effect until the next restart.',
    'The back-pressure message appears when threads are busy or `maxConcurrency` is exceeded. `http:listener` might return 503.',
    'Back-pressure in several apps at once points to something shared.',
    'Low CPU with busy threads means threads are waiting, here on blocking database work.',
    'Thread names such as `[prc-reporting].export-flow.BLOCKING` show who holds the threads.',
    'MuleSoft does not recommend changing the pool strategy or values, and asks for load tests with all apps when you do.',
    'To protect a backend, use `maxConcurrency` on that flow and sensible connection limits.',
    'App-level `ee:scheduler-pools` creates a new set of pools and does not change the instance defaults.',
  ],
  solution: `
**Diagnosis.** Back-pressure hits unrelated apps at the same second, and the host is mostly idle. This suggests a shared limit. The thread dump shows the UBER pool at 16 of 16, with 13 threads in blocking work from \`prc-reporting\`. A comparison with the baseline finds the Thursday change. OS patching did nothing except restart Mule.

**Immediate mitigation.**
- Take thread dumps before any restart: they are the evidence.
- If there is a second instance, shift traffic to it. Otherwise agree a short restart.
- Restore the original \`schedulers-pools.conf\`, so that \`maxSize\` is back to \`max(2, cores + ((mem - 245760) / 5120))\`, and restart the instance.
- If \`prc-reporting\` is still causing harm, pause its export. Schedulers on hybrid servers can be disabled in Runtime Manager; otherwise stop that app.
- Confirm that 503s and back-pressure messages stop.

**Root cause.** A global setting was changed to solve a local problem, with no load test and no change control. A slow job then took most of a smaller shared pool during the peak.

**Permanent fix.**
- Protect the reporting database at the app level: \`maxConcurrency\` on the export flow, a right-sized connection pool, query timeouts, and a different schedule.
- If the job is heavy by nature, give it a separate Mule instance.
- Keep the defaults for the instance. If there is ever a real case for changing them, test with all apps under realistic load.

**Prevention.** Put \`$MULE_HOME/conf\` under version control and change control. Compare configuration against a baseline after each restart. Train teams on what is shared in a Mule instance. Add alerts on the back-pressure message and on 503 rates.
`,
  followUps: [
    {
      q: 'Why not give the reporting app its own pools with ee:scheduler-pools?',
      a: 'It does isolate that app\'s threads, and it leaves the instance defaults alone. But it creates a completely new set of pools, which adds to what the instance runs, and the docs recommend default settings. Use it only after testing, and fix the actual backend pressure first.',
    },
    {
      q: 'Would a work queue have helped?',
      a: 'It would have turned quick rejections into hidden waits, and it is another global change. The default of 0 is what the docs give, and they advise against changing it.',
    },
    {
      q: 'Is 16 a wrong number in itself?',
      a: 'Any number chosen without a test is risky. The documented formula grows with cores and memory, while a fixed 16 left little room for 14 apps with blocking work.',
    },
    {
      q: 'What if only one app logged back-pressure?',
      a: 'Then look first at that flow\'s `maxConcurrency` and its dependencies. A shared pool problem usually touches more than one app.',
    },
  ],
}

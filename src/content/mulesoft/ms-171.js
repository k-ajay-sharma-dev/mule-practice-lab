export default {
  id: 'ms-171',
  category: 'mulesoft',
  title: 'Tuning the UBER Scheduler: schedulers-pools.conf, App-Level Pools, Thread Names and Why the Default Is Usually Right',
  level: 'EXPERT',
  tags: ['deployment', 'performance', 'threading', 'uber-pool', 'tuning', 'on-prem', 'hybrid'],
  estMinutes: 40,
  quiz: [
    {
      type: 'single',
      detail: true,
      prompt: 'A standalone Mule 4.9 instance runs 14 apps. How many UBER pools does it have with default settings, and who uses them?',
      options: [
        'One pool, managed by Mule and shared across all apps in the instance',
        'One pool per app, sized from the app\'s vCores',
        'Three pools, for CPU_LITE, BLOCKING and CPU_INTENSIVE work',
        'One pool per flow',
      ],
      answer: 0,
      explain: 'Since Mule 4.3 there is one unique thread pool shared across all apps in the same instance. Three separate pools exist only with the legacy DEDICATED strategy.',
    },
    {
      type: 'multi',
      detail: true,
      prompt: 'Which are the documented default values of the UBER strategy?',
      options: [
        '`org.mule.runtime.scheduler.uber.threadPool.coreSize=cores`',
        '`org.mule.runtime.scheduler.uber.threadPool.maxSize=max(2, cores + ((mem - 245760) / 5120))`',
        '`org.mule.runtime.scheduler.uber.workQueue.size=0`',
        '`org.mule.runtime.scheduler.uber.threadPool.threadKeepAlive=30000`',
        '`org.mule.runtime.scheduler.uber.threadPool.maxSize=2*cores`',
      ],
      answer: [0, 1, 2, 3],
      explain: 'The maximum is derived from cores and memory. `2*cores` appears in the DEDICATED strategy, for the cpuLight and cpuIntensive pools. A queue size of 0 means the pool holds no queue of waiting tasks.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'An operator changes `MULE_HOME/conf/schedulers-pools.conf` to suit one app on a shared instance. What is the scope of the change?',
      options: [
        'The configuration is global and affects the entire Mule instance',
        'It applies only to the app whose name is in the file',
        'It applies only to apps deployed after the change',
        'It applies only to the primary node of a cluster',
      ],
      answer: 0,
      explain: 'The Execution Engine page says this directly. MuleSoft also does not recommend changing the strategy or its values, and asks for load and stress tests with all apps involved if you do.',
    },
    {
      type: 'single',
      prompt: 'An app declares `<ee:scheduler-pools poolStrategy="UBER" ...>`. What happens?',
      options: [
        'Mule creates a completely new set of thread pools for that app, and the instance defaults stay as they are',
        'The values overwrite `schedulers-pools.conf` for every app',
        'The element is ignored on premises',
        'The app stops using threads from any pool',
      ],
      answer: 0,
      explain: 'App-level configuration creates separate pools for the app. That is important on an instance with many apps, because those threads are added to what the instance already runs.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A log line shows the thread `[MuleRuntime].uber.07: [echo].echoFlow.CPU_LITE @63e7e52c`. What does it tell you?',
      options: [
        'The thread is number 07 of the UBER pool, the app is `echo`, the flow is `echoFlow`, and the work is CPU_LITE',
        'Seven events are queued for `echoFlow`',
        'The event has been retried seven times',
        'The flow has `maxConcurrency` set to 7',
      ],
      answer: 0,
      explain: 'Thread names are the fastest way to map a log line or a thread dump to a pool, app, flow and processing type.',
    },
    {
      type: 'match',
      prompt: 'Match each item to how Mule treats it.',
      pairs: [
        ['Logger and HTTP Request operation', 'CPU Light (quick work or nonblocking I/O)'],
        ['`db:select` and `sftp:read`', 'Blocking I/O'],
        ['Transform Message (`ee:transform`)', 'CPU Intensive'],
        ['NIO selectors created by a connector', 'Custom thread pool outside the UBER pool'],
      ],
      explain: 'Each processor declares a processing type and each task goes to the UBER pool. If none is specified, the default is CPU Light. Besides the UBER pool, connectors can create NIO selectors and recurring task pools.',
    },
    {
      type: 'single',
      prompt: 'A flow runs inside an active transaction. How does that change threading?',
      options: [
        'All thread switches are suspended, and processors participating in the transaction run in the same thread',
        'Each processor still moves to a thread that matches its processing type',
        'The transaction gets a dedicated pool',
        'The flow switches to the DEDICATED strategy',
      ],
      answer: 0,
      explain: 'This is a documented exception to the normal task model, and it is why long transactions hold a thread from start to finish.',
    },
    {
      type: 'single',
      detail: true,
      needsScenario: true,
      prompt: 'After a move to Mule 4.9, a consultant wants to keep the custom pool values from a Mule 4.2 instance. What is the documented advice?',
      options: [
        'Test the apps with default settings first; if a custom setup still seems necessary, suspect a resource management problem, and try customising UBER before reverting to DEDICATED',
        'Always keep custom values, because defaults are for small servers',
        'Always switch to DEDICATED after an upgrade',
        'Delete `schedulers-pools.conf`',
      ],
      answer: 0,
      explain: 'The upgrade notes warn that a custom configuration can lead to inefficient use of resources and might hide underlying issues.',
    },
  ],
  description: `
A logistics company runs **14 Mule apps on one standalone instance** (8 cores). During the Monday morning peak some flows respond slowly, and the logs contain:

\`\`\`
WARN  Flow 'prc-shipments-main' is unable to accept new events at this time
\`\`\`

A consultant proposes three changes:
1. Raise \`org.mule.runtime.scheduler.uber.threadPool.maxSize\` in \`schedulers-pools.conf\`.
2. Set a work queue so requests wait instead of being rejected.
3. Go back to the \`DEDICATED\` strategy, because "I/O should not compete with CPU work".

A second team wants to add \`<ee:scheduler-pools>\` to its reporting app so that it "gets its own threads".

**Questions**
1. Describe the Mule 4 threading model on this instance.
2. What are the defaults, and where do they apply?
3. What does the back-pressure message mean, and what are its possible causes?
4. Evaluate the consultant's proposals and the reporting team's proposal.
5. How would you investigate before changing anything?
`,
  answerTemplate: `## Threading model

## Defaults and scope

## Reading back-pressure

## Evaluating the proposals

## How to investigate
`,
  keyPoints: [
    'Since Mule 4.3 there is one UBER pool, shared across all apps in an instance. Mule tunes it at startup from cores and memory.',
    'Processors declare CPU Light, Blocking I/O or CPU Intensive. The default is CPU Light. The strings appear in logs and thread names.',
    'UBER defaults: `coreSize=cores`, `maxSize=max(2, cores + ((mem - 245760) / 5120))`, `workQueue.size=0`, `threadKeepAlive=30000`.',
    '`MULE_HOME/conf/schedulers-pools.conf` applies on premises and is global for the instance. MuleSoft does not recommend changing the strategy or its values.',
    '`ee:scheduler-pools` in an app creates a completely new set of pools for that app. It does not change the instance settings.',
    'DEDICATED is the legacy mode: cpuLight and cpuIntensive at `2*cores`, io with the same maximum formula as UBER, and UBER parameters ignored.',
    'NIO selectors and recurring task pools exist outside the UBER pool.',
    'Back-pressure occurs when threads are busy or `maxConcurrency` is exceeded. Mule logs the condition and notifies the source; `http:listener` might return 503.',
    'In a transaction all thread switches are suspended, so participating processors run on one thread.',
    'Any change needs load and stress tests with all apps. A custom setup can hide an underlying resource problem.',
  ],
  solution: `
**1. Threading model.** Each operation is a task that declares its processing type. All tasks go to one UBER pool managed by Mule, shared by all 14 apps. Following the Proactor pattern, threads return to the main loop quickly, so the system keeps accepting work while I/O tasks are blocked and waiting. Separately from that pool, connectors can create NIO selectors, and some components create recurring task pools (expiration monitors, queue consumers).

**2. Defaults and scope.** \`coreSize=cores\`, \`maxSize=max(2, cores + ((mem - 245760) / 5120))\`, \`workQueue.size=0\`, \`threadKeepAlive=30000\`. Mule calculates them at startup. The file \`MULE_HOME/conf/schedulers-pools.conf\` can change these formulas on premises, and a change affects the whole instance.

**3. Back-pressure.** The message means Mule could not handle an event at that moment, because all threads were busy and could not take the handoff, or because the flow's \`maxConcurrency\` was already exceeded. Mule then notifies the source, and what happens next depends on that source: \`http:listener\` might return 503, a broker listener might wait or drop the message, and some sources might disconnect and reconnect later. Check first whether this flow has a \`maxConcurrency\` value at all: the Flow scope sets none by default.

**4. Evaluation.**
- *Raise maxSize.* This is global, so it changes all 14 apps. If threads are waiting on a slow backend, more threads only move the queue to that backend. Do this only after finding the bottleneck and after a load test with all apps.
- *Add a work queue.* It is also a global change. It trades a quick rejection for hidden waiting. The defaults use 0, and the docs advise against changing them.
- *Return to DEDICATED.* The docs call it legacy and suggest it mainly so old customisations keep working. They ask you to test the default first and to try customising UBER before reverting.
- *\`ee:scheduler-pools\` in the reporting app.* It does give that app separate pools, but it adds a new set of threads to an instance that is already busy. It also does not fix anything in the other apps. If the aim is to protect a backend, a \`maxConcurrency\` value on the reporting flow is a far smaller change. However, the tuning guide says to use defaults unless a lower concurrency is really required.

**5. Investigation.**
- Take several thread dumps during the peak and group them by thread name (\`uber.NN\`, app, flow, processing type).
- Compare CPU with thread activity: low CPU with many threads waiting suggests a slow dependency.
- Check \`sar\` for CPU, memory, disk and network, and GC logs for pressure, as in the Performance Monitoring page.
- Look at backend latency: the tuning guide treats backend response time as a limit on scalability.
- Only then change one setting, on a copy of the full set of apps, under load.

The upgrade guidance sums up the attitude: a custom configuration might hide underlying issues.
`,
  followUps: [
    {
      q: 'What about the Grizzly threads you see in old posts about HTTP tuning?',
      a: 'The Mule 4 tuning pages do not document any Grizzly setting. They describe NIO selectors as additional pools that a connector can create. If an old article gives a Grizzly property, verify it with MuleSoft Support for your version before relying on it.',
    },
    {
      q: 'Can you state how many threads maxSize gives on this server?',
      a: 'Not reliably from the docs. The Execution Engine page gives the formula with `cores` and `mem` but does not define the unit of `mem`. So read the real number from a thread dump or profiler rather than quoting a calculation.',
    },
    {
      q: 'What is gracefulShutdownTimeout on ee:scheduler-pools?',
      a: 'The maximum time in milliseconds to wait until all tasks in the artifact thread pools complete when the scheduler service stops.',
    },
    {
      q: 'Do you need any of this on CloudHub?',
      a: '`schedulers-pools.conf` is an on-premises file. App-level pools can be set elsewhere, but the docs warn that fractional vCores have less memory, so be careful with worker size.',
    },
  ],
}

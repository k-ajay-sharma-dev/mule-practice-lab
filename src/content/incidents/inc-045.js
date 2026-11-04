export default {
  id: 'inc-045',
  category: 'incidents',
  title: 'Whole App Freezes When a Custom Connector Waits on a Legacy System',
  level: 'EXPERT',
  tags: ['threads', 'mule-sdk', 'thread-dump', 'cpu-lite', 'performance'],
  estMinutes: 40,
  investigation: {
    logs: [
      { text: '14:02:00.000 INFO  [metrics] cpu=6% heap=44% mainframe-gw p95=4.2 s', relevant: true, why: 'Near-idle CPU while everything freezes: threads are waiting, not working, and the mainframe is slow.' },
      { text: '"[MuleRuntime].cpuLight.04: [policy-papi].mf-lookup.CPU_LITE @..." RUNNABLE at java.net.SocketInputStream.socketRead0(Native Method)', relevant: true, why: 'A thread scheduled as CPU_LITE is stuck in a blocking socket read.' },
      { text: '   at com.acme.mf.internal.MfOperations.lookup(MfOperations.java:58)', relevant: true, why: 'The blocking call comes from the custom SDK connector operation declared as CPU_LITE.' },
      { text: '"[MuleRuntime].cpuLight.05: ... CPU_LITE" same stack / "cpuLight.06" same stack ... (most cpuLight threads in socketRead)', relevant: true, why: 'Most threads of the small CPU_LITE pool are blocked, so every flow that needs CPU_LITE scheduling stalls, including /health.' },
      { text: '"http.listener.01 SelectorRunner" RUNNABLE', relevant: false },
      { text: '"GC task thread#0 (ParallelGC)" RUNNABLE', relevant: false },
      { text: '14:01:58.120 INFO  [policy-papi] GET /policies/P-4410/summary (no mainframe call) received', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why does a slow mainframe freeze unrelated endpoints?',
        options: [
          'The connector declares a blocking socket read as CPU_LITE, tying up the few CPU_LITE threads that every flow needs',
          'The mainframe gateway sends too much data and fills the heap',
          'The HTTP listener has too few selector threads',
          'The app runs out of file handles',
        ],
        answer: 0,
        explain: 'CPU_LITE work must never block. When it does, routing, logging and HTTP responses for all flows wait behind the blocked threads.',
      },
      {
        type: 'multi',
        prompt: 'Which are sensible **immediate** mitigations?',
        options: [
          'Restart to release stuck threads (short-term relief)',
          'maxConcurrency on the flow calling the mainframe and a strict read timeout in the vendor library',
          'Route mainframe calls through a separate app temporarily',
          'Add more heap memory',
        ],
        answer: [0, 1, 2],
        explain: 'Free the threads and limit the blast radius. Heap is normal, so more memory does nothing.',
      },
      {
        type: 'single',
        prompt: 'What is the correct fix in the connector?',
        options: [
          'Change the operation to @Execution(ExecutionType.BLOCKING), or implement a real non-blocking operation with a CompletionCallback and its own executor, plus timeouts',
          'Change it to CPU_INTENSIVE',
          'Increase the CPU_LITE pool size to 1,000 threads',
          'Wrap the call in an Async scope',
        ],
        answer: 0,
        explain: 'I/O belongs on the pool sized for waiting. CPU_INTENSIVE is for computation, not waiting on a socket.',
      },
      {
        type: 'match',
        prompt: 'Match the work to the right processing type.',
        pairs: [
          ['Socket, DB or file I/O', 'BLOCKING'],
          ['Short, non-blocking routing logic', 'CPU_LITE'],
          ['Heavy computation (e.g. large transformation)', 'CPU_INTENSIVE'],
        ],
        explain: 'Declaring the wrong type starves the pool the engine expects to return quickly.',
      },
    ],
  },
  description: `
## Symptoms
- \`policy-papi\` on a dedicated on-prem runtime: when the legacy mainframe gateway gets slow (2–5 s per call), **every** endpoint of the app freezes — even \`/health\` and endpoints that never call the mainframe.
- CPU is near **idle**, heap is normal, there are no errors for a while — then a flood of timeouts at the clients.
- With the mainframe responding normally (50 ms), there is no problem.

## Change / Context
- An in-house team built a **custom Mule SDK connector** \`mf-connector\` wrapping a vendor's synchronous socket library. Its operation is annotated \`@Execution(ExecutionType.CPU_LITE)\` "because it is just a quick lookup".
- The runtime uses the legacy **DEDICATED** scheduler strategy (\`org.mule.runtime.scheduler.SchedulerPoolStrategy=DEDICATED\` in \`conf/schedulers-pools.conf\`), so CPU_LITE, BLOCKING and CPU_INTENSIVE work run on separate pools.

## Thread dump (excerpt)
\`\`\`
"[MuleRuntime].cpuLight.04: [policy-papi].mf-lookup.CPU_LITE @..." RUNNABLE
   at java.net.SocketInputStream.socketRead0(Native Method)
   at com.vendor.mf.Session.readReply(Session.java:211)
   at com.acme.mf.internal.MfOperations.lookup(MfOperations.java:58)
"[MuleRuntime].cpuLight.05: ... CPU_LITE" same stack
"[MuleRuntime].cpuLight.06: ... CPU_LITE" same stack
... (most cpuLight threads in socketRead)
"http.listener.01 SelectorRunner" RUNNABLE
\`\`\`

## Your tasks
1. Why does a slow mainframe freeze unrelated endpoints?
2. What do you do immediately?
3. What is the correct fix in the connector and the app?
4. How do you prevent this class of issue?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Mule schedules work by processing type: CPU_LITE work is expected to be non-blocking and runs on a small dedicated pool (2 threads per core with the DEDICATED strategy).',
    'A blocking socket read declared as CPU_LITE ties up those few threads, so all flows that need CPU_LITE scheduling (most components, including the HTTP response path) stall.',
    'Thread dump evidence: many cpuLight threads stuck in socketRead, CPU idle — waiting, not working.',
    'Immediate: put a strict timeout on the vendor socket and/or isolate the call (e.g. maxConcurrency, separate app); restart to clear stuck threads.',
    'Fix: annotate the operation as BLOCKING (or implement it truly non-blocking with a CompletionCallback and its own executor) with timeouts.',
    'Prevention: SDK code review checklist on @Execution type, load test with a slowed dependency, routine thread-dump analysis.',
  ],
  solution: `
## Diagnosis
Mule 4's scheduler assigns each operation to a pool based on its **processing type**: CPU_LITE (short, non-blocking work), BLOCKING (I/O), CPU_INTENSIVE. CPU_LITE work is assumed never to block, so with the DEDICATED strategy it gets a small fixed pool (2 × cores). (With the default UBER pool since Mule 4.3 everything shares one larger elastic pool, so the starvation is less abrupt, but declaring blocking I/O as CPU_LITE is still wrong.) The custom connector declares a **blocking socket read** as CPU_LITE. When the mainframe is slow, those threads sit in \`socketRead0\` for seconds. Other flows also need CPU_LITE scheduling for routing, logging, setting the HTTP response, etc., so the whole app stalls behind the blocked threads — even \`/health\`. CPU is idle because threads are **waiting**, not computing; the thread dump shows exactly that.

## Immediate mitigation
- Restart to release stuck threads (short-term relief only).
- Reduce blast radius: \`maxConcurrency\` on the flow that calls the mainframe, and a strict socket/read timeout in the vendor library if configurable.
- If possible, temporarily route mainframe calls via a separate app so other endpoints stay up.

## Root cause
Wrong execution type on a custom SDK operation: blocking I/O declared as CPU_LITE, violating Mule's threading model, combined with no timeout on the vendor socket.

## Permanent fix
- Change the operation to \`@Execution(ExecutionType.BLOCKING)\` (blocking is the safe default for I/O) so it runs on the I/O pool, which is sized for waiting.
- Or implement a genuinely non-blocking operation using a \`CompletionCallback\` with its own bounded executor.
- Add connect/read timeouts and a circuit breaker / fallback around the mainframe calls.

## Prevention
- SDK development checklist: any network/file/DB I/O = BLOCKING; justify every CPU_LITE.
- Load test with fault injection (slow downstream) before release.
- Teach the team to take and read thread dumps: thread names include the processing type, which makes this pattern easy to spot.
`,
  followUps: [
    { q: 'What happens if you do CPU-heavy work in a CPU_LITE operation?', a: 'Similar starvation: the few CPU_LITE threads are busy computing, so other flows wait; heavy computation should be CPU_INTENSIVE.' },
    { q: 'How do you get a thread dump from a Mule runtime?', a: 'On-prem with jstack/jcmd against the JVM PID (or kill -3); on CloudHub through support/diagnostic tooling or Runtime Manager features where available.' },
    { q: 'Why did it only happen when the mainframe was slow?', a: 'At 50 ms per call each thread is released quickly enough; at 2–5 s, all CPU_LITE threads are occupied simultaneously under normal traffic.' },
  ],
}

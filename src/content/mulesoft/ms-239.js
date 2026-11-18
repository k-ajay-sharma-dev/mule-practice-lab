export default {
  id: 'ms-239',
  category: 'mulesoft',
  title: 'Hunting a Memory Leak: Heap Graphs, OutOfMemoryError, Heap Dumps and Mule-Specific Causes',
  level: 'EXPERT',
  tags: ['memory', 'heap-dump', 'jvm', 'troubleshooting', 'object-store', 'caching', 'performance', 'operations', 'utilities'],
  estMinutes: 25,
  quiz: [
    {
      type: 'single',
      prompt: 'Heap use goes up and down all day, but the low point after each garbage collection rises a little every day until the app fails. What does this suggest?',
      options: [
        'A leak: something keeps objects that are never released',
        'One large payload at a fixed time',
        'Too many CPU cores',
        'A normal pattern that needs no action',
      ],
      answer: 0,
      explain: 'A rising floor means memory that survives every collection. A single large payload shows as a spike that falls back.',
    },
    {
      type: 'single',
      prompt: 'Which JVM option writes a heap dump when the heap runs out?',
      options: ['-XX:+HeapDumpOnOutOfMemoryError', '-Xss512k', '-XX:+UseCompressedOops', '-Dmule.env=prod'],
      answer: 0,
      explain: 'With this option, and a dump path with enough disk space, the JVM writes the heap to a file at the moment of the error.',
    },
    {
      type: 'single',
      prompt: 'In a heap analyser, one map holds 2 million entries keyed by request id, owned by an in-memory object store. What is the likely cause?',
      options: [
        'A store or cache that adds an entry per request and never expires them',
        'A slow database',
        'Too many flows in the app',
        'A large log file',
      ],
      answer: 0,
      explain: 'Keys that are unique per request never repeat, so without a TTL or a maximum size the store only grows.',
    },
    {
      type: 'multi',
      prompt: 'Which are likely causes of a slow leak in a Mule app?',
      options: [
        'A Cache scope keyed on a value that is unique per request, with no expiry',
        'Custom Java code that adds to a static collection and never removes',
        'An in-memory object store with no TTL and no maximum entries',
        'One 300 MB file processed once a day with streaming',
      ],
      answer: [0, 1, 2],
      explain: 'A daily large file causes a spike, not a rising floor, and streaming keeps even that spike small.',
    },
    {
      type: 'single',
      prompt: 'An on-premises runtime fails with a Metaspace error after many redeploys of the same app, while the heap looks fine. What is a likely explanation?',
      options: [
        'Classes from old versions of the app are not released after each redeploy',
        'The payloads are too large',
        'The log level is DEBUG',
        'The app has too many sub-flows',
      ],
      answer: 0,
      explain: 'Metaspace holds class data. If something keeps a reference to an old app class loader, its classes stay loaded. A runtime restart clears it while you find the cause.',
    },
    {
      type: 'order',
      prompt: 'Order the steps of a leak investigation.',
      items: [
        'Confirm the rising floor on the heap graph over several days',
        'Capture a heap dump, on the error or near the peak',
        'Open it in an analyser and find what holds the most memory',
        'Trace that holder back to app code or configuration',
        'Fix it and run a long soak test to prove the floor stays flat',
      ],
      explain: 'A leak is proven by time, so the fix must be proven by time too.',
    },
  ],
  description: `
Carrow Water runs a meter readings API on two standalone Mule servers. Every 4 to 5 days each server fails with an OutOfMemoryError and is restarted by the night team. Adding heap only made the gap a day longer.

Someone suggests restarting the servers every night on a schedule. The operations manager wants the cause found instead.

**Questions**
1. How do you tell a leak from a heap that is too small or a large payload?
2. How do you capture a heap dump, and what do you look for in it?
3. Which Mule features most often cause slow leaks?
4. What else must you think about when you handle heap dumps?
`,
  answerTemplate: `## Leak, small heap or large payload

## Heap dumps

## Common Mule causes

## Handling dumps safely
`,
  keyPoints: [
    'A rising floor after garbage collection means a leak. A spike that falls back means a large payload.',
    'More heap only delays a leak.',
    '-XX:+HeapDumpOnOutOfMemoryError writes a dump at the moment of failure.',
    'An analyser shows which objects hold the most memory and what keeps them alive.',
    'Unbounded caches and object stores are common Mule causes.',
    'Heap dumps hold payload data, so treat them as sensitive.',
  ],
  solution: `
**1. Leak or not.** Look at heap use over days, not minutes. After each garbage collection the heap falls to a floor. If that floor rises steadily, something keeps objects that are never released: a leak. A spike that falls back is a large payload or a burst of traffic. A heap that is too small fails under load and recovers when load drops. Adding heap to a leak only moves the failure, which matches what Carrow saw.

**2. Heap dumps.** On a standalone runtime, add \`-XX:+HeapDumpOnOutOfMemoryError\` and a \`-XX:HeapDumpPath\` with enough disk to the JVM settings in \`wrapper.conf\`. You can also take a dump on demand with JDK tools such as \`jcmd\` when memory is near its peak. Open the dump in an analyser such as Eclipse Memory Analyzer and look at the largest holders and the path that keeps them alive. On CloudHub you have less access to the JVM, so reproduce the problem in a test environment or work with MuleSoft support.

**3. Common Mule causes.**
- A Cache scope or object store keyed on something unique per request, such as a request id, with no TTL or maximum size.
- In-memory object stores used as a "seen before" list that never forgets.
- Custom Java code that keeps data in static collections.
- Variables that hold large payloads inside long loops, which is usually a spike but can look like a leak under steady load.
- Metaspace growth after many redeploys on the same runtime, when old class loaders are not released.

**4. Handling dumps.** A heap dump holds whatever was in memory: payloads, tokens, personal data. Store it like production data, share it only with people who need it, and delete it when the investigation ends.
`,
  followUps: [
    {
      q: 'Is a nightly restart an acceptable fix?',
      a: 'Only as a short-term guard while the cause is found. It hides the growth, and a traffic peak can still hit the limit before the restart.',
    },
    {
      q: 'How do you prove the fix worked?',
      a: 'Run a soak test with realistic traffic for longer than the old failure cycle, and check that the heap floor stays flat.',
    },
    {
      q: 'The dump shows the leak is in a third-party library. What now?',
      a: 'Check for a newer version that fixes it, report it to the vendor, and limit the damage meanwhile, for example by bounding what the app passes to that library.',
    },
  ],
}

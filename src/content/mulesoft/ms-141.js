export default {
  id: 'ms-141',
  category: 'mulesoft',
  title: 'JVM Settings for On-Premises Mule: wrapper.conf, Heap, Metaspace, Startup Timeouts and Several Instances per Host',
  level: 'ADVANCED',
  tags: ['deployment', 'on-prem', 'jvm', 'memory', 'wrapper', 'environments'],
  estMinutes: 25,
  quiz: [
    {
      type: 'single',
      prompt: 'Which file do you edit to change the heap of an on-premises Mule runtime?',
      options: [
        '`$MULE_HOME/conf/wrapper.conf`, then restart the runtime',
        '`$MULE_HOME/conf/wrapper-additional.conf`, with no restart',
        '`mule-artifact.json` in each app',
        '`$MULE_HOME/conf/mule-agent.yml`',
      ],
      answer: 0,
      explain: 'The Java Service Wrapper starts the JVM. Do not edit `wrapper-additional.conf`, because the runtime regenerates that file.',
    },
    {
      type: 'single',
      prompt: 'A team sets `wrapper.java.maxmemory=2048` and also adds a `-Xmx4096m` additional line. What is the documented advice?',
      options: [
        'Use the wrapper memory properties, not a mix with `-Xms`/`-Xmx` lines, so one setting does not silently override the other',
        'Always use both, because they control different pools',
        'Use only `-Xmx`, because the wrapper properties are deprecated',
        'Mule adds the two values together',
      ],
      answer: 0,
      explain: '`wrapper.java.initmemory` and `wrapper.java.maxmemory` are in megabytes and map to `-Xms` and `-Xmx`.',
    },
    {
      type: 'single',
      prompt: 'A 16 GB host runs only Mule. A colleague proposes `wrapper.java.maxmemory=16384`. Why is that wrong?',
      options: [
        'Heap is not the full RAM of the host: memory must be left for the operating system and for Metaspace, a separate pool',
        'Heap cannot exceed the vCore size of the licence',
        'The value is in gigabytes',
        'Mule ignores any value above 8192',
      ],
      answer: 0,
      explain: 'The docs say not to set `wrapper.java.maxmemory` equal to the host RAM, and that the CloudHub vCore model does not apply on-premises.',
    },
    {
      type: 'single',
      prompt: 'Startup fails with `OutOfMemoryError: Metaspace`. What is the right change?',
      options: [
        'Increase Metaspace in `wrapper.conf`, for example with `-XX:MaxMetaspaceSize` on an unused index; raising heap alone does not address it',
        'Double `wrapper.java.maxmemory`',
        'Set `wrapper.java.initmemory` equal to the maximum',
        'Raise `wrapper.startup.timeout`',
      ],
      answer: 0,
      explain: 'Heap and Metaspace are separate pools. Each one has its own limit.',
    },
    {
      type: 'match',
      prompt: 'Match each symptom to the documented response.',
      pairs: [
        ['`Timed out waiting for signal from JVM` during startup', 'Increase `wrapper.startup.timeout` in `wrapper.conf`'],
        ['`Pinging the JVM took...` persists and the wrapper restarts the JVM', 'Fix heap, CPU and GC before raising ping timeouts'],
        ['You need evidence after a heap failure', 'Add `-XX:+HeapDumpOnOutOfMemoryError` and `-XX:HeapDumpPath` lines'],
        ['`Unsupported class file major version 61`', 'Run the runtime on the JDK that this Mule version requires'],
      ],
      explain: 'Timeouts treat a symptom. A long ping delay usually means that the JVM is struggling, so raising the timeout only hides that.',
    },
    {
      type: 'single',
      prompt: 'Two lines in `wrapper.conf` both use `wrapper.java.additional.14`. What happens?',
      options: [
        'The wrapper keeps one and ignores the other',
        'Mule refuses to start and logs a parse error',
        'Both are passed to the JVM',
        'The wrapper renumbers them automatically',
      ],
      answer: 0,
      explain: 'Always use the next unused index. The ignored line has no effect, so check the running JVM\'s arguments after a change.',
    },
    {
      type: 'multi',
      prompt: 'Two Mule instances will share one host. Which rules apply?',
      options: [
        'Each instance has its own install directory and `MULE_HOME`',
        'Apps need unique HTTP and other listener ports',
        'Wrapper and cluster ports must not collide',
        'On Windows, each instance is installed as its own service from its own `bin` directory',
        'Both instances can run from the same unpacked zip if they use different `wrapper.conf` files',
      ],
      answer: [0, 1, 2, 3],
      explain: 'The docs say not to run two instances from the same unpacked zip.',
    },
  ],
  description: `
A logistics company runs Mule 4 on-premises on two hosts with 32 GB of RAM each. It is moving from a CloudHub-style sizing guide to a host it controls, and it has these open items:

- Developers ask for "2 vCores" per app, as they did in CloudHub.
- A consultant has left \`-Xmx\` lines in \`wrapper.conf\` next to the wrapper memory properties.
- The runtime has 14 apps, and startup sometimes takes longer than the wrapper allows.
- The last incident left no diagnostic evidence, because the JVM was restarted before anyone looked at it.
- To save licence cost, a manager proposes a second Mule instance on the same host for a noisy batch app.

**Questions**
1. Where are JVM settings made, and how do you set heap correctly?
2. How do you size memory on a host you own?
3. Explain Metaspace and how to change it.
4. What settings help with slow starts and with evidence after a failure?
5. Can you run a second instance on the host, and what does it mean for licensing?
`,
  answerTemplate: `## Where JVM settings live

## Sizing memory

## Metaspace

## Startup and diagnostics

## A second instance
`,
  keyPoints: [
    'The Java Service Wrapper starts the JVM. Set heap, Metaspace and timeouts in $MULE_HOME/conf/wrapper.conf and restart the runtime.',
    'wrapper.java.initmemory and wrapper.java.maxmemory are in megabytes and map to -Xms and -Xmx. Do not mix them with -Xms/-Xmx lines.',
    'wrapper-additional.conf is regenerated by the runtime, so do not edit it.',
    'Each wrapper.java.additional.<n> needs an unused index: with two equal indexes, one line is silently ignored.',
    'Heap is not the host RAM. Leave room for the operating system and Metaspace; the CloudHub vCore model does not apply.',
    'OutOfMemoryError: Metaspace needs more Metaspace, not only more heap.',
    'wrapper.startup.timeout handles slow starts. Persistent ping warnings need heap, CPU and GC fixes first.',
    'Each instance needs its own directory and MULE_HOME, with no port collisions. Licensing is based on cores visible to the JVM, per VM or container.',
  ],
  solution: `
**Where JVM settings live.** Mule uses the Java Service Wrapper (Tanuki) to control the JVM. All memory and timeout settings go in \`$MULE_HOME/conf/wrapper.conf\`, and you restart the runtime after changing the file.

\`\`\`properties
wrapper.java.initmemory=1024
wrapper.java.maxmemory=2048
\`\`\`
These are megabytes and map to \`-Xms\` and \`-Xmx\`. Remove the consultant's \`-Xmx\` lines, because the docs warn that with a mix, one setting can silently override the other. Leave \`wrapper-additional.conf\` alone, since the runtime regenerates it.

**Sizing memory.** The vCore model does not apply on-premises: you size CPU, heap and RAM yourself. Heap is not the host's RAM, so leave memory for the operating system and Metaspace. The requirements page lists 1 GB of RAM as the Mule minimum, 4 GB as the minimum recommended for hybrid deployments and 8 GB or more for production. Adjust for latency and for the size and number of simultaneous messages. All apps in one runtime share this JVM, so the answer to "2 vCores per app" is that you size the runtime for the combined load and verify it with load tests.

**Metaspace.** It is a separate pool from heap. To cap it, add an unused index:
\`\`\`properties
wrapper.java.additional.<n>=-XX:MaxMetaspaceSize=512m
\`\`\`
If startup fails with \`OutOfMemoryError: Metaspace\`, increase this value rather than only increasing heap. If two lines share the same index, one is ignored, so number new lines carefully.

**Startup and diagnostics.**
- \`Timed out waiting for signal from JVM\`: raise \`wrapper.startup.timeout\` (seconds).
- \`Pinging the JVM took\`: the wrapper can kill and restart the JVM when this persists. Fix heap, CPU and GC before you raise ping timeouts.
- Evidence: add \`-XX:+HeapDumpOnOutOfMemoryError\` and \`-XX:HeapDumpPath=path/to/dumps\` as \`wrapper.java.additional\` lines, on a disk with room for a dump.
- When Mule runs as a service, status does not appear in the console. Read \`$MULE_HOME/logs/mule_ee.log\`.

**A second instance.** It is allowed, but it needs its own unpacked distribution and \`MULE_HOME\`, for example \`/opt/mule-runtime-a\` and \`/opt/mule-runtime-b\`. Listener ports must be unique, and wrapper and cluster ports must not collide. Do not expect a licence saving automatically: licensing is based on the maximum allocated cores consumed. The count comes from the cores visible to the JVM, and each VM or container is metered separately. If cores are not explicitly allocated, the cores reported by the OS are what count. Check this with your account team. CPU affinity can bind a process to specific CPUs, and the number configured must stay within your subscription.
`,
  followUps: [
    { q: 'Why might Mule fail to load a native library on a hardened Linux host?', a: 'JNA loads libraries from a temporary directory. If that directory is mounted with noexec, loading fails. Add a wrapper.java.additional line that sets -Djna.tmpdir to a directory that permits execution.' },
    { q: 'Can you run systemctl start mule after mule install?', a: 'No. mule install registers a wrapper daemon and does not create a systemd unit named mule.service. Use $MULE_HOME/bin/mule start.' },
    { q: 'How would you confirm which JVM arguments are really active?', a: 'Read the running process command line on the host, for example with ps or jcmd, and compare it with wrapper.conf. This is general JVM practice rather than a Mule feature, and it catches a line ignored because of a duplicate index.' },
  ],
}

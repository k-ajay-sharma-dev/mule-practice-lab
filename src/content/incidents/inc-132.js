export default {
  id: 'inc-132',
  category: 'incidents',
  title: 'OutOfMemoryError: Metaspace Survives a Heap Increase Because a wrapper.conf Line Was Ignored',
  level: 'INTERMEDIATE',
  tags: ['deployment', 'on-prem', 'jvm', 'memory', 'wrapper', 'observability'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '09:12:44 ERROR [mule_ee] Application \'prc-customs-docs\' failed to deploy: java.lang.OutOfMemoryError: Metaspace', relevant: true, why: 'The exhausted pool is named: Metaspace, not heap.' },
      { text: '09:13:02 INFO  [grafana] mule-int-02 heap used 1.9 GB of 4.0 GB', relevant: true, why: 'Heap has plenty of room, so more heap does not address this failure.' },
      { text: '09:40:10 INFO  [change] wrapper.java.maxmemory 4096 -> 8192, runtime restarted', relevant: true, why: 'The first fix targeted the wrong pool.' },
      { text: '09:46:31 ERROR [mule_ee] Application \'prc-customs-docs\' failed to deploy: java.lang.OutOfMemoryError: Metaspace', relevant: true, why: 'The same error after a heap increase confirms that heap was not the limit.' },
      { text: '10:05:11 INFO  [grep] wrapper.conf: wrapper.java.additional.18=-XX:MaxMetaspaceSize=256m', relevant: true, why: 'This is the older line at index 18.' },
      { text: '10:05:11 INFO  [grep] wrapper.conf: wrapper.java.additional.18=-XX:MaxMetaspaceSize=768m', relevant: true, why: 'The new line reuses index 18. With a duplicate index, the wrapper keeps one line and ignores the other.' },
      { text: '10:05:40 INFO  [ps] java ... -Xmx8192m ... -XX:MaxMetaspaceSize=256m ...', relevant: true, why: 'The running JVM proves that the 768m line had no effect.' },
      { text: '10:06:02 INFO  [health] GET /api/health 200 (6 ms)', relevant: false },
      { text: '10:06:30 INFO  [mule_agent] heartbeat OK', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why did raising `wrapper.java.maxmemory` not help?',
        options: [
          'Heap and Metaspace are separate pools, so more heap does not raise the Metaspace limit',
          'The value needs a restart of the host',
          'The value is limited by the Mule licence',
          'Only `-Xmx` lines take effect',
        ],
        answer: 0,
        explain: 'The docs say to increase Metaspace in `wrapper.conf` rather than only increasing heap.',
      },
      {
        type: 'single',
        prompt: 'Why did the first attempt at raising Metaspace also fail?',
        options: [
          'The new line reused index 18, so the wrapper kept one of the two lines and ignored the other',
          'Metaspace cannot be changed on Mule 4',
          '`wrapper-additional.conf` overwrote the setting because it was not edited as well',
          'The value must be in bytes',
        ],
        answer: 0,
        explain: 'If two additional properties share an index, the wrapper keeps one and ignores the other. Do not edit `wrapper-additional.conf`, because the runtime regenerates it.',
      },
      {
        type: 'single',
        prompt: 'What is the immediate fix?',
        options: [
          'Keep a single `MaxMetaspaceSize` line with a suitable value, remove the duplicate, restart the runtime, and confirm the value on the running process',
          'Add a third line with the same index',
          'Raise `wrapper.startup.timeout`',
          'Undeploy the other apps permanently',
        ],
        answer: 0,
        explain: 'Changes to `wrapper.conf` need a restart. Reading the running process is the proof, not reading the file.',
      },
      {
        type: 'multi',
        prompt: 'Which follow-up actions make sense?',
        options: [
          'Return heap to a level that leaves memory for the OS and Metaspace, instead of the emergency value',
          'Use the wrapper memory properties only, without `-Xms`/`-Xmx` lines',
          'Keep `wrapper.conf` under version control and review changes',
          'Add a post-change check of actual JVM arguments',
          'Set `wrapper.java.maxmemory` equal to the host RAM to be safe',
        ],
        answer: [0, 1, 2, 3],
        explain: 'The docs say not to set `wrapper.java.maxmemory` equal to the host RAM. The 8 GB value was a reaction to the wrong symptom on a 12 GB host.',
      },
    ],
  },
  description: `
## Symptoms
- Tuesday 09:12: a new app, \`prc-customs-docs\`, fails to deploy on the on-premises server \`mule-int-02\`, with \`java.lang.OutOfMemoryError: Metaspace\`.
- Twenty apps already on that runtime keep running.
- An engineer doubles the heap and restarts. The error is unchanged.
- A second engineer adds a Metaspace line, restarts, and the error is **still** unchanged.

## Change / Context
- The host has 12 GB of RAM. Heap was 4 GB before the incident.
- \`prc-customs-docs\` is the 21st app on the runtime, and brings several large libraries for document handling.
- \`wrapper.conf\` has been edited by hand by several people over the years.
- Nobody has compared the file with the running process.

## Logs
\`\`\`
09:12:44 ERROR [mule_ee] 'prc-customs-docs' failed to deploy:
          java.lang.OutOfMemoryError: Metaspace
09:13:02 INFO  [grafana] heap used 1.9 GB of 4.0 GB
09:40:10 INFO  [change] wrapper.java.maxmemory 4096 -> 8192, runtime restarted
09:46:31 ERROR [mule_ee] 'prc-customs-docs' failed to deploy:
          java.lang.OutOfMemoryError: Metaspace
10:05:11 wrapper.java.additional.18=-XX:MaxMetaspaceSize=256m
10:05:11 wrapper.java.additional.18=-XX:MaxMetaspaceSize=768m
10:05:40 [ps] java ... -Xmx8192m ... -XX:MaxMetaspaceSize=256m ...
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
    'The error names the pool. Metaspace is separate from heap, so more heap does not help.',
    'Heap at 1.9 GB of 4 GB already showed that heap was not the constraint.',
    'wrapper.java.additional lines need an unused index. With a duplicate, the wrapper keeps one and ignores the other.',
    'Which line wins is not something to rely on, so check the running process.',
    'Changes to wrapper.conf need a runtime restart.',
    'wrapper-additional.conf is regenerated by the runtime and must not be edited.',
    'Do not set maxmemory to the host RAM: leave memory for the OS and Metaspace.',
    'Treat wrapper.conf as controlled configuration, and verify changes against the live JVM.',
  ],
  solution: `
**Diagnosis.** There are two separate mistakes.
1. The error says Metaspace, and the dashboard shows heap at less than half. So the heap increase could not help.
2. The Metaspace change was made, but the \`ps\` output shows the JVM still using 256m. The file has two lines with index 18, and the wrapper keeps only one of them. In this case, it kept the old one. The docs do not say which one survives, so do not rely on either.

**Immediate mitigation.**
- The existing apps are running, so there is no need to rush a further restart during peak hours.
- Replace both lines with a single line, using an index that no other line uses, and pick the value from measured use.
- Restart in a quiet period, and confirm the live value with \`ps\` or \`jcmd\`.
- Redeploy \`prc-customs-docs\` and check \`mule_ee.log\`.
- Put the heap back to a planned value.

**Root cause.** The runtime hit its Metaspace limit of 256m when the 21st app was added, and that limit was set years earlier. The docs say to increase Metaspace in \`wrapper.conf\` rather than only increasing heap, as these are separate pools. The attempted fix then failed because of a duplicated \`wrapper.java.additional\` index.

**Permanent fix.**
- Clean up \`wrapper.conf\`: one line for each setting, sequential indexes and no \`-Xms\` or \`-Xmx\` lines beside \`wrapper.java.initmemory\` and \`wrapper.java.maxmemory\`.
- Re-size the host for the number of apps. Heap, Metaspace and the OS must all fit in 12 GB.
- Consider moving heavy apps to another server, because all apps on the runtime share one JVM.

**Prevention.**
- Keep \`wrapper.conf\` in version control, and deploy it with configuration management.
- After any change, compare the live JVM arguments with the expected ones.
- Monitor Metaspace as well as heap, with an alert before the limit.
- Add a capacity check to the release checklist when adding apps to a shared runtime.
`,
  followUps: [
    { q: 'What if the error had been Java heap space?', a: 'Then capture evidence first. Add -XX:+HeapDumpOnOutOfMemoryError and -XX:HeapDumpPath through wrapper.java.additional lines, and investigate before raising heap.' },
    { q: 'What if the runtime times out while starting 21 apps?', a: 'Timed out waiting for signal from JVM points to wrapper.startup.timeout in wrapper.conf, which is in seconds.' },
    { q: 'Could the upgrade tool lose this setting?', a: 'It compares configuration files and stops on conflicts it cannot resolve, so that changes are not lost. In a fully manual upgrade, you replicate custom wrapper.conf settings yourself.' },
  ],
}

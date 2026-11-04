export default {
  id: 'inc-010',
  category: 'incidents',
  title: 'On-Prem Mule Server Stops Processing: Disk Full of Logs',
  level: 'BEGINNER',
  tags: ['logging', 'log4j2', 'disk', 'on-prem'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '03:39:58.112 DEBUG [invoice-sapi] Line payload: {"invoiceNo":"INV-7712","line":14,"sku":"A-221","qty":3,...}', relevant: true, why: 'A DEBUG Logger prints the full payload for every invoice line, which explains the huge log volume.' },
      { text: '03:39:59.003 INFO  [scheduler] Poll for new orders: 0 found', relevant: false },
      { text: '03:40:12.004 ERROR [file-export] Error writing /data/export/orders_0340.csv: java.io.IOException: No space left on device', relevant: true, why: 'A different app fails because the shared filesystem is full.' },
      { text: '03:40:15.611 ERROR [order-store] Failed to store key ORD-8812 in object store: No space left on device', relevant: true, why: 'The persistent Object Store also writes to disk, so it fails too: a symptom, not the cause.' },
      { text: '03:40:30.210 INFO  [health] GET /health 200 (5 ms)', relevant: false },
      { text: '03:41:02.330 ERROR StatusLogger Unable to write to stream /opt/mule/logs/invoice-sapi.log', relevant: true, why: 'The 41 GB invoice-sapi.log is the file that filled /opt; even logging now fails.' },
      { text: '03:41:30.500 WARN  [agent] Connection to Anypoint control plane lost, retrying', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause of the outage?',
        options: [
          'invoice-sapi logs the full payload per line at DEBUG and the appender has no size cap or retention, so the disk filled',
          'The Object Store is corrupted',
          'The Runtime Manager agent crashed and took the server down',
          'The export folder has wrong permissions',
        ],
        answer: 0,
        explain: '"No space left on device" in several apps is the symptom. The 41 GB invoice-sapi.log is the cause, created by a debugging change left in production.',
      },
      {
        type: 'single',
        prompt: 'How do you free the space safely while invoice-sapi is running?',
        options: [
          'rm invoice-sapi.log',
          'Lower the log level to INFO, then truncate the file or compress and move it',
          'Restart the whole server without changing anything',
          'Delete the Object Store data folder',
        ],
        answer: 1,
        explain: 'Stop the growth first. Deleting a file that a process holds open does not release the space until the process restarts; truncating does.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix**?',
        options: [
          'RollingFile with a SizeBasedTriggeringPolicy, DefaultRolloverStrategy max and a Delete action',
          'Ship logs to a central platform and keep local files small',
          'Log identifiers, not payloads',
          'Disk usage alerts and separate filesystems for logs and data',
          'Disable logging for invoice-sapi entirely',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Bound the logs, centralise them and monitor disk. Turning logs off removes your ability to troubleshoot next time.',
      },
      {
        type: 'order',
        prompt: 'Put the incident response in order.',
        items: [
          'Find which file fills /opt (invoice-sapi.log, 41 GB)',
          'Set com.example.invoice back to INFO and remove the payload Logger',
          'Truncate or move the log file to free space',
          'Re-run failed exports and check Object Store writes',
          'Add size-based rollover, retention and disk alerts',
        ],
        explain: 'Find the cause, stop the growth, free space, recover the affected apps, then prevent recurrence.',
      },
    ],
  },
  description: `
## Symptoms
- On the on-prem Mule 4 server \`mule-prd-02\`, several apps started failing at **03:40**.
- File-based flows can't write output, an app using a persistent Object Store throws errors, and the Runtime Manager agent shows the server as *disconnected* intermittently.
- \`df -h\` shows the \`/opt\` filesystem at **100%**. \`/opt/mule/logs\` is **46 GB**; the file \`invoice-sapi.log\` alone is 41 GB.

## Change / Context
- Two days ago a developer troubleshooting \`invoice-sapi\` set the log level of \`com.example.invoice\` to **DEBUG** and added a Logger that prints \`#[payload]\` inside a For Each over invoice lines.
- \`log4j2.xml\` for \`invoice-sapi\` uses a **RollingFile** appender with a **TimeBasedTriggeringPolicy** (daily) and no size limit or delete rule.

## Logs
\`\`\`
03:40:12.004 ERROR [file-export] Error writing /data/export/orders_0340.csv
  ... java.io.IOException: No space left on device
03:40:15.611 ERROR [order-store] Failed to store key 'ORD-8812' in object store
  ... No space left on device
03:41:02.330 ERROR StatusLogger Unable to write to stream /opt/mule/logs/invoice-sapi.log
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
    'Identifies disk exhaustion caused by the DEBUG level plus payload logging inside a loop in invoice-sapi.',
    'Explains why unrelated apps fail: they share the same filesystem for files, persistent object stores and logs.',
    'Immediate: set the logger back to INFO (Runtime Manager logging levels or log4j2 change), remove the payload logger, then free space by compressing/moving/truncating the oversized log, and verify apps recover.',
    'Permanent fix: RollingFile with a size-based trigger, a DefaultRolloverStrategy max and a Delete action (or log shipping), plus async logging.',
    'Prevention: disk usage alerts (e.g. 80%/90%), a rule that DEBUG changes in prod are time-boxed, and never logging full payloads in loops.',
  ],
  solution: `
**Diagnosis.** \`invoice-sapi\` is logging at **DEBUG** and printing the **whole payload once per invoice line**, so log volume exploded (41 GB in two days). The rolling appender only rolls daily and never deletes or caps files, so the disk filled. Everything on that filesystem then fails: file writes, the persistent Object Store, log writing and even the agent. The \`No space left on device\` errors are the symptom; the log file is the cause.

**Immediate mitigation.**
1. Lower \`com.example.invoice\` back to **INFO** (Runtime Manager → app → Logging, or edit \`log4j2.xml\`) and remove/disable the payload Logger.
2. Free space safely: compress or move the big file to other storage. If you must **truncate** it, do so (e.g. \`: > invoice-sapi.log\`) instead of deleting it while the process holds it open — a deleted-but-open file keeps using disk space until the process restarts.
3. Check that each app recovered: re-run failed file exports and check the Object Store–dependent app for lost writes.

**Root cause.** A debugging change was left in production with no time limit, combined with a log configuration that has **no size limit and no retention**. There was also no disk monitoring to warn before 100%.

**Permanent fix.**
- \`log4j2.xml\`: \`RollingFile\` with \`SizeBasedTriggeringPolicy\` (e.g. 100 MB) **and** time-based policy, \`DefaultRolloverStrategy max="10"\` plus a \`Delete\` action for old files; use \`AsyncLogger\` / async appenders.
- Ship logs to a central platform (Splunk/ELK/Anypoint Monitoring) so local files can be kept small.
- Log identifiers and sizes, not payloads; if payload logging is needed, log it once and truncated, at DEBUG.

**Prevention.** Alerts on disk usage (80%/90%) and log growth; a change rule that prod DEBUG is temporary with an owner and end time; separate filesystems for logs and application data so logs can't break processing.
`,
  followUps: [
    { q: 'Why does deleting an open log file sometimes not free any disk space?', a: 'On Linux the inode stays allocated while a process holds the file open, so the space is only released when the handle closes (e.g. app restart). Truncating the file frees the space immediately.' },
    { q: 'How is this different on CloudHub?', a: 'On CloudHub logs are managed by the platform with size/retention limits, so the disk usually doesn\'t fill, but excessive logging can still hurt performance and older entries get dropped. Disabling CloudHub logs and forwarding to an external system is common for volume.' },
    { q: 'What would you put in the post-mortem?', a: 'Timeline, which apps were affected and why (shared disk), the DEBUG change and missing log limits as root cause, the lack of disk alerts as a detection gap, and actions: log4j2 limits, alerts, time-boxed debug changes.' },
  ],
}

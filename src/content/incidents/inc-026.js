export default {
  id: 'inc-026',
  category: 'incidents',
  title: 'Batch Job Stuck for 20 Hours With 19 Instances Queued Behind It',
  level: 'EXPERT',
  tags: ['batch', 'database', 'timeouts', 'locks', 'data-freshness'],
  estMinutes: 50,
  investigation: {
    logs: [
      { text: '01:55:00.120 INFO  [dba] ALTER INDEX ALL ON price REBUILD started (maintenance window until 03:00)', relevant: true, why: 'The index rebuild locks the price table, five minutes before the 02:00 run.' },
      { text: '02:00:03.114 INFO  [price-loader] Created instance 6a1f... for batch job priceLoadBatch (prices_0200.csv)', relevant: false },
      { text: '02:00:09.430 INFO  [price-loader] Started execution of instance 6a1f...', relevant: true, why: 'The last progress from this instance: its bulk upsert waits on the lock, with no queryTimeout, forever.' },
      { text: '03:00:08.775 INFO  [price-loader] Instance 91c0... queued, another instance is executing', relevant: true, why: 'ORDERED_SEQUENTIAL runs one instance at a time, so every new hourly instance queues behind the stuck one.' },
      { text: '06:00:00.004 INFO  [health] GET /health 200 (2 ms)', relevant: false },
      { text: '09:00:41.200 INFO  [price-loader] Resuming instance 6a1f... after restart', relevant: true, why: 'Batch instances are persistent, so a restart resumes the same stuck instance and it blocks again.' },
      { text: '09:05:00.000 INFO  [metrics] cpu=0% disk=71% (+2%/h)', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why have no prices been updated since 02:00?',
        options: [
          'The 02:00 instance hangs on the index-rebuild lock with no queryTimeout, and ORDERED_SEQUENTIAL queues every later instance behind it',
          'The SFTP server stopped delivering files',
          'The Batch Aggregator size of 500 is too small',
          'The database ran out of disk',
        ],
        answer: 0,
        explain: 'CPU 0%, no errors and queued instances point to one blocked instance. The rebuild started 5 minutes before it and still holds the lock.',
      },
      {
        type: 'single',
        prompt: 'Why did the 09:00 restart not help?',
        options: [
          'Batch job instances are persisted on disk and resume after restart, hitting the same lock again',
          'The restart was too fast',
          'The Scheduler skipped the next run',
          'Restarts reset the DB connection pool size',
        ],
        answer: 0,
        explain: 'Batch queues survive restarts by design. The lock was still there, so the resumed instance blocked again.',
      },
      {
        type: 'multi',
        prompt: 'Which are right in the **immediate mitigation**?',
        options: [
          'With the DBA, stop or finish the index rebuild to release the lock',
          'Because files are full snapshots, load the latest file directly instead of replaying 19 hours of superseded files',
          'Keep the source files so nothing is lost if queued instances are discarded',
          'Tell the business when prices will be current',
          'Restart the app every hour until it works',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Remove the blocker, then take the shortest correct path to fresh prices. Restarts do not release a DB lock.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and prevention**?',
        options: [
          'queryTimeout on every DB operation, with retry and clear failure on lock timeouts',
          'Skip snapshot files superseded by a newer waiting file',
          'Alerts on instance duration, queued instances and "last price update older than 2 hours"',
          'Pause the job during DB maintenance on integration-owned tables',
          'Switch to ROUND_ROBIN for all batch jobs',
        ],
        answer: [0, 1, 2, 3],
        explain: 'ROUND_ROBIN is only safe when instances are independent; for ordered price data it can apply an older file after a newer one.',
      },
    ],
  },
  description: `
## Symptoms
- \`price-loader\` loads hourly price files from SFTP into the pricing database with a **Batch Job**. Since **02:00 yesterday** no prices have been updated; the web shop shows yesterday's prices.
- Runtime Manager shows the app **running**, CPU ~0%. Disk usage on the worker is slowly growing.
- Every hour a new batch job instance is created, but it never starts; there are now **19 queued instances**.
- Ops restarted the app once at 09:00; after the restart the logs showed the **same** stuck instance resuming and nothing else changed.

## Change / Context
- Batch Job \`priceLoadBatch\` uses the default scheduling strategy (**ORDERED_SEQUENTIAL**). One step with a **Batch Aggregator** (size 500) does a DB bulk upsert into \`price\`. No \`queryTimeout\` on the DB operation.
- At 01:55 yesterday the DBA team started an **index rebuild on \`price\`** as part of maintenance. The job was supposed to end by 03:00 but is still running; it holds a lock on the table.
- Files are full price snapshots for a subset of SKUs; each hourly file supersedes earlier ones for the same SKUs.

## Logs
\`\`\`
02:00:03.114 INFO  [price-loader] Created instance 6a1f... for batch job 'priceLoadBatch' (prices_0200.csv)
02:00:09.002 INFO  [price-loader] Finished loading phase for instance 6a1f... 48,000 records
02:00:09.430 INFO  [price-loader] Started execution of instance 6a1f...
03:00:02.981 INFO  [price-loader] Created instance 91c0... for batch job 'priceLoadBatch' (prices_0300.csv)
03:00:08.774 INFO  [price-loader] Finished loading phase for instance 91c0... 47,500 records
03:00:08.775 INFO  [price-loader] Instance 91c0... queued, another instance is executing
... (no further log lines from instance 6a1f...)
\`\`\`

## Your tasks
1. What is the most likely root cause, and why did the restart not help?
2. What do you do **right now** to get fresh prices to the shop as fast as possible? (Think about the 19 queued instances.)
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
    'Identifies that the DB bulk upsert in instance 6a1f is blocked by the index-rebuild lock on the price table and, with no query timeout, waits indefinitely.',
    'Explains ORDERED_SEQUENTIAL: only one instance of the job executes at a time, so all later instances queue behind the stuck one.',
    'Explains why the restart did not help: batch instances and their records are persisted in batch queues on disk, so the stuck instance resumes and hits the same lock (and disk grows from the queued records).',
    'Immediate: get the DBA to finish/kill the rebuild (release the lock) — then processing resumes; but since each hourly file supersedes older ones, the fastest path to fresh prices is to load the latest snapshot(s) rather than replaying all 19 instances in order.',
    'Permanent fix: queryTimeout on DB operations, sensible error handling (maxFailedRecords, retries for lock timeouts), and alerting when an instance exceeds its expected duration or instances queue up.',
    'Prevention: maintenance windows coordinated with integration schedules (pause the job during DB maintenance), and freshness monitoring on the business outcome (last price update time).',
  ],
  solution: `
**Diagnosis.** Instance \`6a1f\` started at 02:00:09, five minutes after the **index rebuild** began locking \`price\`. Its aggregator's bulk upsert is **waiting for the table lock**, and because there is **no \`queryTimeout\`**, it waits forever: CPU 0%, no errors, no progress. The job uses **ORDERED_SEQUENTIAL** scheduling, so **only one instance executes at a time**; every hourly instance since 03:00 finishes its *load* phase (records written to the batch queues) and then **queues** behind \`6a1f\` — hence 19 queued instances and growing disk usage.

**Why the restart didn't help:** batch job instances are **persistent** — their records live in the batch queues on the worker's disk and survive a restart. After restart, \`6a1f\` resumed, re-issued the same upsert, and blocked on the same lock.

**Immediate mitigation.**
1. **Release the lock**: with the DBA, stop or finish the overrunning index rebuild (or kill the blocking session). Confirm in the DB that the Mule session is no longer waiting.
2. Think about the backlog before letting it run: instances then execute **one by one in order** — ~20 hours of hourly files, each 48k records. Because **each file is a full snapshot that supersedes earlier ones**, replaying all of them in order gives correct but very late prices.
   - Fastest correct option: let \`6a1f\` finish (or not), and **load the latest file(s) directly**. Then the queued instances are redundant; discarding them requires clearing the app's batch queues, e.g. redeploying in a way that starts with clean working storage. Verify how your deployment target handles batch queue data before relying on it, and keep the source files so nothing is lost.
   - If files are *not* superseding (deltas), you must process them in order — then only throughput can be improved (bigger aggregator, more threads) once the lock is gone.
3. Tell the business when prices will be current; consider freezing promotions until then.

**Root cause.** A DB operation without timeout ran into a long maintenance lock; the sequential batch strategy turned one stuck instance into a total stop; there was no alert on job duration, queue build-up or data freshness, and the DB maintenance wasn't coordinated with the integration schedule.

**Permanent fix.**
- \`queryTimeout\` on every DB operation (e.g. 60 s), so a lock produces an error instead of a hang.
- Batch error handling: retry lock-timeout errors with backoff, then fail the records/instance clearly; set \`maxFailedRecords\` deliberately and report failures.
- For snapshot feeds: before running, **skip files that are superseded** by a newer one already waiting (or make the job pick only the newest file), so a backlog collapses to one run.
- Consider \`ROUND_ROBIN\` scheduling only if instances are independent — not for ordered data.

**Prevention.** Alerts: instance running > 2× normal duration, more than N queued instances, and **"last successful price update older than 2 hours"** (business freshness). Change management: DB maintenance on integration-owned tables requires pausing the job (stop the flow/scheduler) and a defined end time with rollback. Runbook: how to inspect, skip or discard batch instances on your platform.
`,
  followUps: [
    { q: 'What is the difference between ORDERED_SEQUENTIAL and ROUND_ROBIN batch scheduling?', a: 'ORDERED_SEQUENTIAL runs one job instance at a time in creation order, which preserves order but lets one slow instance block the rest. ROUND_ROBIN lets instances share resources and progress concurrently, which is fine only when instances are independent.' },
    { q: 'How do you prove the batch is waiting on a DB lock?', a: 'A thread dump shows the batch thread inside the JDBC driver waiting on a socket read; on the database side the session from the Mule app is in a lock-wait state blocked by the index-rebuild session.' },
    { q: 'How would you have detected this within an hour instead of a day?', a: 'An alert on batch instance duration or queued instances, and a business freshness check (time since last price update) — both would fire long before customers noticed stale prices.' },
  ],
}

export default {
  id: 'ms-328',
  category: 'mulesoft',
  title: 'Scheduler Overlap, Restarts and Idempotent Writes in Batch Jobs',
  level: 'ADVANCED',
  tags: ['myproject', 'batch', 'scheduler', 'idempotency', 'restart', 'locking'],
  estMinutes: 22,
  quiz: [
    {
      type: 'single',
      prompt: 'A scheduler runs every 15 minutes and starts a batch job that takes 25 minutes. What happens?',
      options: [
        'The scheduler waits for the job',
        'The flow ends as soon as the records are queued, so the next trigger starts a second job, which may read the same data',
        'Mule merges the two jobs',
        'The second trigger fails',
      ],
      answer: 1,
      explain: 'The batch job runs on its own threads. The scheduler sees a short flow and fires again.',
    },
    {
      type: 'multi',
      prompt: 'Which ways stop two runs from working on the same data?',
      options: [
        'Move or rename the file to a processing folder before the job starts',
        'Take a lock, such as a row in a lock table or a key in an object store with a time limit',
        'Pick rows with a status update, so each run claims its own rows',
        'Lower the block size',
      ],
      answer: [0, 1, 2],
      explain: 'Block size has nothing to do with overlap.',
    },
    {
      type: 'single',
      prompt: 'The app runs on two workers. How many times does each scheduler trigger fire?',
      options: [
        'Twice, once per worker',
        'It depends on the deployment. In a cluster, schedulers usually run on the primary node only. On separate workers each may fire, so add a lock',
        'Never',
        'Once per core',
      ],
      answer: 1,
      explain: 'Know how your platform handles schedulers with more than one replica, and do not rely on it alone.',
    },
    {
      type: 'single',
      prompt: 'The runtime restarts during a job. Records in the queues continue after the restart. What risk is left?',
      options: [
        'None',
        'Records that were in progress when it stopped may run again, so the writes must be safe to repeat',
        'All records are lost',
        'The job starts from the first record',
      ],
      answer: 1,
      explain: 'A record can be written to the target and still count as not done when the runtime stops.',
    },
    {
      type: 'single',
      prompt: 'Which write is safe to repeat?',
      options: [
        'INSERT with a new sequence number each time',
        'A MERGE or upsert on a business key, or an insert that a unique key refuses as a duplicate',
        'An UPDATE that adds 1 to a counter',
        'An email',
      ],
      answer: 1,
      explain: 'Idempotent means running it twice gives the same result as running it once.',
    },
    {
      type: 'single',
      prompt: 'A job keeps state in an object store. The worker is replaced on redeploy. What should you check?',
      options: [
        'Nothing',
        'That the object store is persistent and shared, not in memory on one worker, so a new worker sees the state',
        'That the object store is encrypted only',
        'That the job has a name',
      ],
      answer: 1,
      explain: 'Batch queues on a lost worker are gone too. Keep a way to rerun from the source.',
    },
  ],
  description: `
Thornbury Freight polls a database table every 15 minutes and loads new rows into a partner system with a batch job. On busy days the job takes 25 minutes. The partner reported duplicate shipments, and the log shows two job instances for the same rows. Last week a runtime restart in the middle of a job also left some shipments sent twice.

**Questions**
1. Why did two jobs process the same rows?
2. How do you stop overlap?
3. What happens to a job when the runtime restarts?
4. How do you make the writes safe to repeat?
`,
  answerTemplate: `## Why two jobs

## Stopping overlap

## Restarts

## Safe writes
`,
  keyPoints: [
    'The scheduler flow ends once records are queued, so triggers overlap.',
    'Claim the work: move the file, lock, or update row status first.',
    'Know how schedulers behave with more than one worker.',
    'Queued records resume after a restart, and in progress records may repeat.',
    'Use MERGE, unique keys or idempotency keys for writes.',
    'Keep state in a persistent, shared store.',
  ],
  solution: `
**1. Why two jobs.** The Batch Job scope returns once the records are queued. The scheduler flow ended after a few seconds, so the next trigger started a second job. It selected rows that the first job had not marked done yet.

**2. Stopping overlap.** Claim the rows at the start: update their status to IN_PROGRESS with the run ID and select only rows with that run ID. Or take a lock in a lock table or an object store key with a time limit, and release it in On Complete. Check how schedulers behave on your deployment with more than one worker.

**3. Restarts.** Batch queues are kept on disk by default, so the job continues after the restart. A record that was being sent when the runtime stopped may be sent again, since the job never saw its result.

**4. Safe writes.** Send an idempotency key to the partner, such as the shipment ID, if the API supports it. In databases use MERGE on a business key or a unique constraint. Mark each row SENT with the run ID after success, and skip rows already marked.
`,
  followUps: [
    {
      q: 'What if the lock holder crashes and never releases the lock?',
      a: 'Give the lock a time to live longer than the longest normal run, and log when a run takes over an expired lock.',
    },
    {
      q: 'Does the Scheduler have a setting to avoid overlap?',
      a: 'Setting the flow max concurrency to 1 stops overlapping runs of the flow itself. Here the flow ends when the batch is queued, so it does not help.',
    },
    {
      q: 'How do you test idempotency?',
      a: 'Run the same input twice in a test and compare the target. Counts and values must be the same after the second run.',
    },
  ],
}

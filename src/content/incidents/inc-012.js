export default {
  id: 'inc-012',
  category: 'incidents',
  title: 'Invoices Sent Twice After Scaling to Two Replicas',
  level: 'INTERMEDIATE',
  tags: ['scheduler', 'scaling', 'clustering', 'idempotency', 'cloudhub-2'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '17:12:03.400 INFO  [runtime] Deployment invoice-dispatch scaled: replicas 1 -> 2 (clustering: disabled)', relevant: true, why: 'Two independent runtimes without clustering means each one runs its own Scheduler.' },
      { text: '06:00:00.013 INFO  [invoice-dispatch-6f7c9-abcde] Scheduler fired: dispatchInvoices', relevant: true, why: 'The job fires on replica abcde...' },
      { text: '06:00:00.019 INFO  [invoice-dispatch-6f7c9-xyz12] Scheduler fired: dispatchInvoices', relevant: true, why: '...and in the same second on replica xyz12.' },
      { text: '06:00:00.402 INFO  [invoice-dispatch-6f7c9-abcde] Selected 1,284 invoices with status READY', relevant: false },
      { text: '06:00:00.415 INFO  [invoice-dispatch-6f7c9-xyz12] Selected 1,284 invoices with status READY', relevant: true, why: 'Both runs select the same invoices because the status is only updated after sending.' },
      { text: '06:00:00.900 INFO  [invoice-dispatch-6f7c9-abcde] GET /health 200 (2 ms)', relevant: false },
      { text: '06:00:01.133 INFO  [invoice-dispatch-6f7c9-xyz12] Sent INV-2026-118812 -> 202', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the most likely root cause?',
        options: [
          'With 2 replicas and no clustering, the Scheduler runs on both and each run sends the same READY invoices',
          'The e-invoicing provider retries every submission',
          'The cron expression fires twice per day',
          'The database update to SENT failed',
        ],
        answer: 0,
        explain: 'The Scheduler fired at the same second on two different replica names. Without clustering each replica is independent, and select-then-update is not atomic.',
      },
      {
        type: 'single',
        prompt: 'What do you do **right now**?',
        options: [
          'Scale back to 1 replica before the next run and work with finance to cancel or credit duplicates',
          'Change the cron to run every hour',
          'Delete all SENT invoices',
          'Add a third replica for more capacity',
        ],
        answer: 0,
        explain: 'Stop the next double run first, then repair the business impact with finance and inform customers if needed.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix**?',
        options: [
          'Enable clustering so the Scheduler runs on the primary node only, or move jobs to a single-replica app',
          'Claim work atomically, e.g. UPDATE ... SET status=PROCESSING WHERE status=READY',
          'Send the invoice number as an idempotency key to the provider',
          'Add a random delay before the Scheduler fires on each replica',
        ],
        answer: [0, 1, 2],
        explain: 'Run once, be safe if run twice anyway, and let the provider reject duplicates. A random delay only makes the race less likely.',
      },
      {
        type: 'order',
        prompt: 'Put the incident response in order.',
        items: [
          'Notice the Scheduler firing on two replica names at 06:00',
          'Scale to 1 replica before the next run',
          'List and cancel duplicate invoices with finance',
          'Enable clustering and atomic claiming of invoices',
          'Add singletons to the scaling checklist',
        ],
        explain: 'Diagnose, prevent the next duplicate run, repair, fix properly, update the process.',
      },
    ],
  },
  description: `
## Symptoms
- Customers complain they received **two identical invoice emails** this morning.
- The finance system shows each invoice for today's run was **posted twice** to the e-invoicing provider.
- Yesterday and earlier: no duplicates.

## Change / Context
- \`invoice-dispatch\` runs a **Scheduler** (cron \`0 0 6 * * ?\`) that selects invoices with \`status = 'READY'\`, sends them, then updates them to \`SENT\`.
- Yesterday afternoon the platform team scaled the app on **CloudHub 2.0** from **1 to 2 replicas** "for high availability". Clustering was not enabled on the deployment.
- The select and the update are separate steps; sending takes ~2 minutes for the whole batch.

## Logs
\`\`\`
06:00:00.013 INFO  [invoice-dispatch-6f7c9-abcde] Scheduler fired: dispatchInvoices
06:00:00.019 INFO  [invoice-dispatch-6f7c9-xyz12] Scheduler fired: dispatchInvoices
06:00:00.402 INFO  [invoice-dispatch-6f7c9-abcde] Selected 1,284 invoices with status READY
06:00:00.415 INFO  [invoice-dispatch-6f7c9-xyz12] Selected 1,284 invoices with status READY
06:00:01.120 INFO  [invoice-dispatch-6f7c9-abcde] Sent INV-2026-118812 -> 202
06:00:01.133 INFO  [invoice-dispatch-6f7c9-xyz12] Sent INV-2026-118812 -> 202
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
    'Identifies that each replica runs its own Scheduler, so the job fired twice (two replica names in the logs at 06:00:00).',
    'Explains the race: both replicas select READY invoices before either updates them to SENT, so both send the same invoices.',
    'Immediate: scale back to 1 replica (or stop the scheduler on one), then work with finance to cancel/credit the duplicate invoices and notify customers.',
    'Permanent fix: enable cluster mode so the Scheduler runs on the primary node only, or move scheduled work to a single-replica app; and make the job safe to run concurrently (atomic claim, e.g. UPDATE ... SET status=PROCESSING WHERE status=READY).',
    'Adds idempotency at the boundary: send a stable invoice id / idempotency key so the provider rejects duplicates.',
    'Prevention: scaling changes reviewed for schedulers and singletons; alert on duplicate sends.',
  ],
  solution: `
**Diagnosis.** The logs show the Scheduler firing at the same second on **two different replicas**. Without clustering, each replica is an independent Mule runtime with its own Scheduler, so the cron job now runs twice. Both runs select the same 1,284 invoices (status still \`READY\`), both send them, and both update to \`SENT\`. The job was never safe to run concurrently; with one replica that never mattered.

**Immediate mitigation.**
1. Scale back to **1 replica** (or disable the scheduler flow on one) before the next run.
2. With finance: list invoices sent twice (provider logs / both replica logs), cancel or credit the duplicates at the provider, and send a customer notice if needed.

**Root cause.** Horizontal scaling assumed the app was stateless, but it contains a **singleton job** with a non-atomic "select then update" pattern and no duplicate protection.

**Permanent fix.**
- **Run the Scheduler once**: enable clustering on the deployment so schedulers run on the **primary node only** (the default for the Scheduler source in a cluster). Or move scheduled jobs into a separate app that always has exactly one replica.
- **Make the job concurrency-safe anyway**: claim work atomically — \`UPDATE invoices SET status='PROCESSING', owner=:node WHERE status='READY' ...\` and only process what you claimed — so even an accidental second run finds nothing.
- **Idempotency at the provider**: send a stable key (the invoice number) so a duplicate submission is rejected or ignored.

**Prevention.** Add "does this app have schedulers or other singletons?" to the scaling checklist; test with 2 replicas in a lower environment; alert when the same invoice id is sent more than once.
`,
  followUps: [
    { q: 'How does Scheduler behaviour differ between CloudHub 1.0 workers and CloudHub 2.0 replicas?', a: 'On CloudHub 1.0, multi-worker apps had schedulers coordinated by the platform so they run on one worker. On CloudHub 2.0 and Runtime Fabric, replicas behave like independent runtimes unless clustering is enabled, so each replica fires its own schedulers.' },
    { q: 'Is clustering alone enough?', a: 'It removes the duplicate trigger, but a failover or a manual "run now" can still overlap a running job. An atomic claim in the database and an idempotency key at the provider make the job safe regardless of how often it is triggered.' },
    { q: 'How do you prove the root cause?', a: 'The same scheduler log line appears from two replica ids at the same timestamp. The scaling change time falls right before the first duplicate run. The provider receives each invoice id twice, a few milliseconds apart.' },
  ],
}

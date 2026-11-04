export default {
  id: 'inc-078',
  category: 'incidents',
  title: 'Consumer Lag Climbs During an Outage, Then Records Repeat: MANUAL Ack With No Commit on the Error Path',
  level: 'ADVANCED',
  tags: ['kafka', 'offsets', 'consumer-groups', 'ack-mode', 'error-handling', 'utilities'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '2026-10-30 01:00:03 INFO  [meter-loader] Listener started group=meter-loader ackMode=MANUAL topic=meter.reads partitions=12', relevant: true, why: 'MANUAL means the flow must call Commit itself. Nothing is committed unless the flow does it.' },
      { text: '2026-10-30 01:20:11 INFO  [meter-loader] Committed read M-4418802 partition=4 offset=88120331', relevant: false },
      { text: '2026-10-30 01:42:07 ERROR [meter-loader] HTTP:SERVICE_UNAVAILABLE billing-sapi 503 for M-4418977 partition=4 offset=88120506', relevant: true, why: 'The billing outage begins, so every record now goes down the error path.' },
      { text: '2026-10-30 01:42:07 WARN  [meter-loader] On Error Continue: parked M-4418977 in METER_ERRORS partition=4 offset=88120506', relevant: true, why: 'The record is handled and the flow finishes successfully, but there is no commit in this log, unlike the success path.' },
      { text: '2026-10-30 02:15:00 INFO  [health] GET /api/health 200 (2 ms)', relevant: false },
      { text: '2026-10-30 03:30:00 WARN  [kafka-monitor] group=meter-loader lag=1,840,212 (threshold 100,000)', relevant: true, why: 'Lag is measured from the committed offset. The flow is busy handling records, yet the committed offset has stopped moving.' },
      { text: '2026-10-30 04:05:40 INFO  [billing-sapi] Service restored, GET /health 200', relevant: false },
      { text: '2026-10-30 04:30:18 INFO  [meter-loader] Replica restarted by rolling deployment; resuming from committed offset partition=4 offset=88120506', relevant: true, why: 'A consumer resumes from the last committed offset, so everything parked since 01:42 is read again.' },
      { text: '2026-10-30 04:30:19 WARN  [meter-errors] Duplicate parked record M-4418977 partition=4 offset=88120506 (second occurrence)', relevant: true, why: 'This is the repeat: the same offset is being processed a second time, as a direct result of the missing commit.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause of the lag and the repeats?',
        options: [
          'With MANUAL ack, the On Error Continue path has no Commit, so handled records were never committed',
          'The topic has too few partitions for the load',
          'AUTO ack commits only every hour',
          'Kafka resent the records because the billing API failed',
        ],
        answer: 0,
        explain: 'The docs require Commit at the end of the flow when it finishes successfully, including through On Error Continue. The committed offset stood still during the outage, so a restart resumed from there. Kafka has no knowledge of the billing API.',
      },
      {
        type: 'single',
        prompt: 'The lag alert is firing and a replica restart has started repeats. What should you do first?',
        options: [
          'Stop the rolling restart if you can, and check that repeats cannot double-bill before anything else is reprocessed',
          'Delete the topic to clear the lag',
          'Change the group ID so the lag number resets',
          'Add parallel consumers to clear the lag faster',
        ],
        answer: 0,
        explain: 'Repeats are a business risk here, so protect billing first. A new group ID hides the metric and changes where consumption starts, and more consumers would just reprocess faster.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the permanent fix?',
        options: [
          'Call Commit at the end of the On Error Continue path as well as the success path',
          'Store the Consumer Commit Key in a variable early in the flow',
          'Make the billing write and the error table idempotent on meter id and read time',
          'Add an MUnit test that drives the error path and verifies Commit is called',
          'Switch to IMMEDIATE ack, so commits can never be forgotten',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Commit on every path that ends successfully, and design for repeats. IMMEDIATE commits before the flow runs, so a failure after receipt would no longer be covered by the commit logic at all.',
      },
      {
        type: 'order',
        prompt: 'Order the recovery.',
        items: [
          'Confirm that the committed offset stopped at the start of the outage',
          'Check whether downstream writes are safe to repeat, and pause reprocessing if not',
          'Release the flow with Commit on the error path',
          'Let the consumers catch up and watch lag fall',
          'Reconcile parked records and billing, and remove any duplicates',
        ],
        explain: 'Prove the cause, protect billing, fix the commit, recover, and then clean up what the repeats created.',
      },
    ],
  },
  description: `
## Symptoms
- Billing was down from 01:42 to 04:05. The Kafka dashboard for \`meter-loader\` showed lag climbing to **1.8 million** during that time, although the app logged steady activity.
- After a routine rolling deployment at 04:30, the error table began to show the **same records a second time**.
- The app is healthy, and billing is working again.

## Change / Context
- \`meter-loader\` is a Message Listener on \`meter.reads\` (12 partitions) with **MANUAL** ack. The flow posts each read to \`billing-sapi\` and then calls \`kafka:commit\`.
- Last month the team added an **On Error Continue** that writes a failed read to \`METER_ERRORS\`, so an outage would not stop the flow. That path ends after the insert.

## Logs
\`\`\`
01:42:07 ERROR [meter-loader] HTTP:SERVICE_UNAVAILABLE billing-sapi 503 for M-4418977 partition=4 offset=88120506
01:42:07 WARN  [meter-loader] On Error Continue: parked M-4418977 in METER_ERRORS partition=4 offset=88120506
03:30:00 WARN  [kafka-monitor] group=meter-loader lag=1,840,212 (threshold 100,000)
04:30:18 INFO  [meter-loader] Replica restarted by rolling deployment; resuming from committed offset partition=4 offset=88120506
04:30:19 WARN  [meter-errors] Duplicate parked record M-4418977 partition=4 offset=88120506 (second occurrence)
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
    'With MANUAL ack the flow must call Commit, at the end of a successful flow and also when On Error Continue handled an error.',
    'On Error Continue means the flow finishes successfully, so the error path needs its own Commit.',
    'Lag is measured against the committed offset, so it grew although records were being handled.',
    'A consumer resumes from the last committed offset, so a restart read the outage records again.',
    'Immediate: protect billing from repeats, release the fix, then reconcile.',
    'Fix: Commit on every successful path, idempotent writes, and a test of the error path.',
  ],
  solution: `
**Diagnosis.** The listener uses MANUAL ack, so only \`kafka:commit\` records progress. The success path has it, but the On Error Continue path ends after the insert. During the outage every record took that path, so the committed offset stayed at the start of the outage while the flow kept working. Consumer lag is measured from the committed offset, which is why it climbed. When a replica restarted, the consumer resumed from that offset, as any Kafka consumer does, and read the same records again.

The connector reference does not say what happens if Commit is not called, including whether the listener keeps polling. So rest the diagnosis on the requirement it does state, on what these logs show, and on the general Kafka rule that a group resumes from its committed offset.

**Immediate mitigation.**
- Stop further restarts while you assess the repeats.
- Confirm whether the billing write can tolerate a repeated read. If not, pause consumption until it can.
- Release the fix, then let the consumers catch up. Records still in \`METER_ERRORS\` need replaying to billing, since the outage is over.

**Root cause.** The error handler was added without considering the ack mode. The docs state that with MANUAL, Commit is needed when the flow finishes successfully, which includes finishing through On Error Continue.

**Permanent fix.**
- Store the **Consumer Commit Key** from the Kafka Record Attributes in a variable early in the flow.
- Call \`kafka:commit\` at the end of the On Error Continue path, after the record is safely parked.
- Make the billing call and \`METER_ERRORS\` idempotent on meter id and read time.
- If the flow has no need for manual control, consider AUTO, which commits if the flow finishes successfully.

**Prevention.** Add an MUnit test for the error path that verifies Commit is called. Alert on lag and on the age of the committed offset. Add ack mode to the review checklist for any change to an error handler.
`,
  followUps: [
    { q: 'Why not use On Error Propagate instead?', a: 'Then the flow fails, and no successful commit is due. The record stays uncommitted, but the reference does not say when it would be read again, so test that. It also does not park the record. Decide deliberately for each error type.' },
    { q: 'Does AUTO fix this by itself?', a: 'AUTO commits if the flow finishes successfully, so this omission could not happen. You lose the choice of the exact commit point, so check that nothing in the flow needs it.' },
    { q: 'What could go wrong with the Commit itself?', a: 'The operation lists errors such as ALREADY_COMMITTED, TIMEOUT and CONNECTIVITY. Handle them so a failed commit is logged with the partition and offset.' },
  ],
}

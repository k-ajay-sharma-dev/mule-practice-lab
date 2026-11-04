export default {
  id: 'inc-079',
  category: 'incidents',
  title: 'New Fraud Analytics Consumer Group Sees None of the 30 Days of History',
  level: 'INTERMEDIATE',
  tags: ['kafka', 'consumer-groups', 'offsets', 'replay', 'configuration', 'banking'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '2026-11-03 07:00:05 INFO  [deploy] fraud-analytics v1.0.0 started group=fraud-analytics-v1 topic=card.transactions', relevant: true, why: 'This is a new group, so it has no committed offsets. Where it starts depends on Auto offset reset.' },
      { text: '2026-11-03 07:00:06 INFO  [kafka-config] bootstrap=kafka-01:9092 autoOffsetReset=LATEST isolationLevel=READ_UNCOMMITTED', relevant: true, why: 'LATEST is the default. A group with no offset starts at the end of the log.' },
      { text: '2026-11-03 07:00:07 INFO  [kafka-consumer] partition=0 no committed offset; position set to latest offset=641220871', relevant: true, why: 'The consumer began at the current end of the partition, so everything before this offset is skipped.' },
      { text: '2026-11-03 07:00:30 INFO  [fraud-analytics] Processed txn T-99120411 partition=0 offset=641220872', relevant: true, why: 'The first record processed is new, and was published after the app started.' },
      { text: '2026-11-03 07:05:00 INFO  [health] GET /api/health 200 (2 ms)', relevant: false },
      { text: '2026-11-03 09:00:00 INFO  [kafka-monitor] topic=card.transactions retention=30d size=8.1TB', relevant: true, why: 'The history is still on the topic, so it can still be recovered until retention removes it.' },
      { text: '2026-11-03 09:00:00 INFO  [kafka-monitor] group=fraud-analytics-v1 lag=214', relevant: false },
      { text: '2026-11-03 09:10:12 INFO  [settlement] Batch 7781 settled', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why did the new group miss the history?',
        options: [
          'Auto offset reset defaults to LATEST, so a group with no offset starts at the end of the log',
          'A new group always receives only the last 24 hours',
          'Retention had already deleted the data',
          'The listener is using IMMEDIATE ack',
        ],
        answer: 0,
        explain: 'The log shows no committed offset and a position set to latest. Retention is 30 days, so the data still exists. Ack mode decides when commits happen, not where a new group starts.',
      },
      {
        type: 'single',
        prompt: 'The group has now committed offsets. A developer changes Auto offset reset to EARLIEST and restarts the same group. What happens?',
        options: [
          'Nothing changes: the setting applies only when there is no initial offset, or the current offset no longer exists',
          'The group goes back to the start of every partition',
          'The app fails to start',
          'Only the current day is reloaded',
        ],
        answer: 0,
        explain: 'The group has a valid position, so it resumes from there. To replay, use a new group ID with EARLIEST, or move the consumer with kafka:seek.',
      },
      {
        type: 'multi',
        prompt: 'Which are valid ways to load the 30 days of history?',
        options: [
          'Start a new group ID with Auto offset reset set to EARLIEST',
          'Use kafka:seek with the topic, partition and offset for each partition',
          'Ask the source team to republish 30 days of data to the same topic, as the first option',
          'Raise the Amount of parallel consumers, which reads older offsets',
        ],
        answer: [0, 1],
        explain: 'A new group with EARLIEST starts from the earliest available offset. Seek sets the offset directly. Republishing would duplicate data for every other group, and parallel consumers have no effect on the starting position.',
      },
      {
        type: 'order',
        prompt: 'Order the recovery.',
        items: [
          'Confirm that the history is still within retention',
          'Make sure the analytics load is idempotent, because records already seen will be read again',
          'Deploy with a new group ID and Auto offset reset EARLIEST',
          'Watch lag fall, and watch the load on the brokers and the target store',
          'Reconcile record counts against the topic for the 30 days',
        ],
        explain: 'Time matters, because the oldest data ages out each day. Replaying is safe only if repeats do no harm, so check that before starting.',
      },
    ],
  },
  description: `
## Symptoms
- The fraud team launched \`fraud-analytics\` this morning to build customer spending profiles from \`card.transactions\`.
- The models need **30 days** of history, but only transactions since 07:00 today appear.
- There are no errors, and lag is close to zero.

## Change / Context
- It is a new app, with a new consumer group \`fraud-analytics-v1\`, using a Message Listener.
- The topic has 30-day retention, and other groups have used it for years.
- The consumer configuration has only Bootstrap Server URLs, Group ID and Topic Subscription Patterns. Everything else is at its default.

## Logs
\`\`\`
07:00:05 INFO  [deploy] fraud-analytics v1.0.0 started group=fraud-analytics-v1 topic=card.transactions
07:00:06 INFO  [kafka-config] bootstrap=kafka-01:9092 autoOffsetReset=LATEST isolationLevel=READ_UNCOMMITTED
07:00:07 INFO  [kafka-consumer] partition=0 no committed offset; position set to latest offset=641220871
07:00:30 INFO  [fraud-analytics] Processed txn T-99120411 partition=0 offset=641220872
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
    'Auto offset reset defaults to LATEST, so a new group starts at the end of the log.',
    'It applies when there is no initial offset, or the current offset no longer exists on the server.',
    'Once the group has committed offsets, changing the setting and restarting does nothing.',
    'Replay options: a new group ID with EARLIEST, or kafka:seek with topic, partition and offset.',
    'Low lag only shows the group is keeping up from where it started. It says nothing about history.',
    'The replay reads records again, so the load must be idempotent. Retention sets the deadline.',
  ],
  solution: `
**Diagnosis.** The group is new, so it had no committed offset. **Auto offset reset** was left at its default of **LATEST**, so each partition started at the end of the log. Nothing failed, and lag is low because the group is keeping up from that point. The 30 days are still on the topic.

**Immediate mitigation.**
- Confirm retention. The oldest day ages out every day, so do not delay.
- Check that the load is idempotent, because records since 07:00 will be read again.
- Deploy with a **new group ID** and Auto offset reset set to **EARLIEST**. A new group has no offset, so it starts from the earliest available offset.
- Alternatively, use \`kafka:seek\` to set the offset for each partition.

Changing the setting on the existing group will not work, because the group now has a valid position.

**Root cause.** A requirement to read history met a default that reads only new data. The configuration did not state where the group should start.

**Permanent fix.**
- Set Auto offset reset explicitly in every consumer configuration, with a comment saying why.
- Plan the replay: expect heavy reads on the brokers and a heavy load on the target store, and control it with the number of consumers.

**Prevention.** Add "where does this group start?" to the design checklist for new consumers. Consider **ERROR** for consumers that must never start from a guessed position: it throws an error if no previous offset is found for the group. Test new consumers in a lower environment against a topic with existing data.
`,
  followUps: [
    { q: 'What if the group had started with EARLIEST and restarted later?', a: 'It would resume from its committed offset. EARLIEST only decides the starting point when there is no valid offset, so a normal restart does not replay the topic.' },
    { q: 'Can EARLIEST reach data older than retention?', a: 'No. It starts at the earliest offset still available, so deleted data cannot be recovered from the topic.' },
    { q: 'Why not always use EARLIEST?', a: 'A new consumer on a large topic would start a large replay by surprise. Some consumers only want new events. Choose per consumer and state it explicitly.' },
  ],
}

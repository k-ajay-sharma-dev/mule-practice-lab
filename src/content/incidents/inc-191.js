export default {
  id: 'inc-191',
  category: 'incidents',
  title: 'Kafka Lag Climbs While Records Repeat: 500 Slow Records per Poll Outlast max.poll.interval.ms and Trigger Endless Rebalances',
  level: 'EXPERT',
  tags: ['kafka', 'consumer-groups', 'rebalance', 'performance', 'idempotency'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '2026-11-18 16:00:00 INFO  [loyalty-consumer pod=a] Poll returned records=500 partition=4', relevant: true, why: 'Each poll hands the app 500 records.' },
      { text: '2026-11-18 16:00:01 INFO  [loyalty-consumer pod=a] Points API call durationMs=780 memberId=LM-7710', relevant: true, why: 'Each record waits close to a second on the points API.' },
      { text: '2026-11-18 16:05:01 WARN  [loyalty-consumer pod=a] Consumer left group: poll interval exceeded max.poll.interval.ms=300000', relevant: true, why: 'Five minutes passed between polls, so Kafka removed the consumer from the group.' },
      { text: '2026-11-18 16:05:04 INFO  [loyalty-consumer pod=b] Partitions assigned [4,5] committed offset partition=4 offset=88120', relevant: true, why: 'Pod b starts again from the last committed offset, which is before the records pod a worked on.' },
      { text: '2026-11-18 16:05:05 INFO  [loyalty-consumer pod=b] Points awarded memberId=LM-7710 points=40', relevant: true, why: 'The same record gives points a second time.' },
      { text: '2026-11-18 16:05:30 INFO  [loyalty-consumer pod=a] GET /health 200', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why does the consumer leave the group?',
        options: [
          'Working through 500 records at nearly a second each takes longer than max.poll.interval.ms, so Kafka thinks the consumer is stuck',
          'The broker is down',
          'The topic has too few partitions',
          'The health check failed',
        ],
        answer: 0,
        explain: 'The consumer must call poll again within max.poll.interval.ms. 500 records at about 0.8 seconds is close to 400 seconds, past the 300 second limit.',
      },
      {
        type: 'single',
        prompt: 'Why do records repeat?',
        options: [
          'The offsets were not committed before the consumer was removed, so the next owner starts again from the last commit',
          'Kafka sends every record twice',
          'The producer retries',
          'The points API repeats its answers',
        ],
        answer: 0,
        explain: 'Work done after the last commit is done again by the new owner of the partition. Then the same thing happens on that consumer, so it can loop.',
      },
      {
        type: 'multi',
        prompt: 'Which changes break the loop?',
        options: [
          'Lower max.poll.records so one poll can finish well inside the interval',
          'Raise max.poll.interval.ms with care, above the real worst case for one poll',
          'Make the points award idempotent on the event ID',
          'Restart the pods every hour',
        ],
        answer: [0, 1, 2],
        explain: 'Smaller polls or a longer interval keep the consumer in the group. Idempotency makes the repeats that still happen harmless. Restarts cause more rebalances.',
      },
      {
        type: 'single',
        prompt: 'What does a much longer max.poll.interval.ms cost?',
        options: [
          'A consumer that really hangs keeps its partitions longer before Kafka moves them, so recovery is slower',
          'Nothing at all',
          'Kafka drops records',
          'It doubles disk use on the broker',
        ],
        answer: 0,
        explain: 'The interval is how Kafka spots a stuck consumer. Raise it only as far as the real work needs.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Confirm the poll interval and the records per poll from the logs',
          'Lower the records per poll so one batch finishes well inside the interval',
          'Find members who were given points twice and correct them',
          'Make the award idempotent on the event ID',
          'Alert on consumer group rebalances and on lag',
        ],
        explain: 'Prove the cause, stop the loop, repair the damage, make repeats harmless, then watch the signs.',
      },
    ],
  },
  description: `
## Symptoms
- Consumer lag on the \`loyalty-events\` topic grows all afternoon.
- Some members get the same points two or three times.
- The pods look healthy and CPU is low.

## Change / Context
- \`loyalty-consumer\` runs on three pods in one consumer group. It commits offsets after each poll's records are done.
- For each record it calls the points API, which slowed to about 800 ms this week after a database change on the points side.
- The consumer uses the default poll settings: up to 500 records per poll and a five minute poll interval.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 16:00:00 INFO  [loyalty-consumer pod=a] Poll returned records=500 partition=4
2026-11-18 16:05:01 WARN  [loyalty-consumer pod=a] Consumer left group: poll interval exceeded max.poll.interval.ms=300000
2026-11-18 16:05:04 INFO  [loyalty-consumer pod=b] Partitions assigned [4,5] committed offset partition=4 offset=88120
2026-11-18 16:05:05 INFO  [loyalty-consumer pod=b] Points awarded memberId=LM-7710 points=40
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
    'A consumer must poll again within max.poll.interval.ms or it is removed from the group.',
    'Records per poll times time per record must fit well inside the interval.',
    'Work after the last commit is done again after a rebalance.',
    'Fewer records per poll is the safest first change.',
    'A longer interval slows recovery from a really stuck consumer.',
    'Idempotency on the event ID makes repeats harmless.',
  ],
  solution: `
**Diagnosis.** One poll hands over 500 records. At about 0.8 seconds each, the batch takes close to 400 seconds, longer than the 300 second poll interval. Kafka removes the consumer, gives its partitions to another pod, and that pod starts again from the last committed offset. The same records are processed again, and the same thing can happen on the new pod.

**Immediate mitigation.**
- Lower the records per poll, for example to 100, so one batch takes well under the interval.
- Find members who were given the same event more than once and correct their points.

**Root cause.** The batch size was sized for a fast points API. When the API slowed down, a full batch no longer fit in the poll interval. Nothing alerted on rebalances.

**Permanent fix.**
- Size records per poll from the slowest normal time per record, with a wide margin.
- Make the award idempotent: store the event ID with the award and skip one already seen.
- Put a time limit on the points API call so one record cannot take minutes.

**Prevention.** Alert on rebalances and on lag. Load test the consumer with a slow downstream, not only a fast one.
`,
  followUps: [
    { q: 'Why does more replicas not help?', a: 'Each pod hits the same limit with its own batch. More pods only add more rebalances.' },
    { q: 'Could you commit after each record?', a: 'It narrows the repeat window but adds load on the broker, and it does not keep the consumer in the group. Fix the batch size first.' },
    { q: 'What is the difference between session timeout and poll interval?', a: 'The session timeout covers heartbeats from the client. The poll interval covers time between calls to poll by the app, which is what was exceeded here.' },
    { q: 'Where do you set these in a Mule app?', a: 'In the consumer configuration of the Kafka connector. Check the connector version for the exact field names.' },
  ],
}

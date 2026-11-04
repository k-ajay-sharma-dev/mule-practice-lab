export default {
  id: 'inc-080',
  category: 'incidents',
  title: 'Parcel Tracking Shows Delivered Before Out for Delivery: Lost Kafka Keys and In-Flight Retries',
  level: 'ADVANCED',
  tags: ['kafka', 'partitions', 'ordering', 'producers', 'logistics', 'production'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '2026-10-21 05:30:02 INFO  [deploy] tracking-publisher v4.0.0 started (refactor: shared publish sub-flow)', relevant: true, why: 'The misordering begins with this release, which moved the publish step into a shared sub-flow.' },
      { text: '2026-10-21 09:14:11 INFO  [tracking-publisher] Published parcel=P-7741902 status=OUT_FOR_DELIVERY key=null partition=3 offset=5512088', relevant: true, why: 'The key is null, so nothing ties this parcel to a single partition.' },
      { text: '2026-10-21 09:14:12 INFO  [tracking-publisher] Published parcel=P-7741902 status=DELIVERED key=null partition=9 offset=4410276', relevant: true, why: 'The next event for the same parcel went to another partition. Kafka gives no order across partitions.' },
      { text: '2026-10-21 09:14:12 INFO  [tracking-consumer] Applied P-7741902 DELIVERED partition=9', relevant: true, why: 'The consumer of partition 9 ran ahead of the consumer of partition 3, so the statuses went backwards.' },
      { text: '2026-10-21 09:14:13 INFO  [tracking-consumer] Applied P-7741902 OUT_FOR_DELIVERY partition=3', relevant: true, why: 'The earlier status is applied last, so the customer sees the parcel go backwards.' },
      { text: '2026-10-21 09:15:00 INFO  [health] GET /api/health 200 (2 ms)', relevant: false },
      { text: '2026-10-24 02:11:40 WARN  [kafka-producer] Retrying send to partition=6 (attempt 1): leader not available; retries=3 max.in.flight=5', relevant: true, why: 'Three days after keys were restored: with more than one request in flight, a retried batch can land after a later one.' },
      { text: '2026-10-24 02:11:41 INFO  [tracking-consumer] Applied P-7790012 ARRIVED_AT_DEPOT offset=6120450 after SORTED offset=6120449 (same partition, source order reversed)', relevant: true, why: 'Same key, same partition, wrong order. This is a second cause, and only the producer retries can explain it.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What caused the misordering after v4.0.0?',
        options: [
          'The refactor dropped the key from kafka:publish, so one parcel\'s events spread across partitions',
          'The consumers were using DUPS_OK',
          'The topic has too many partitions for ordering to work at all',
          'The consumer group was reset to LATEST',
        ],
        answer: 0,
        explain: 'Key is optional on Publish, so losing it raises no error. The log shows key=null and two partitions for one parcel. Kafka orders records only within a partition.',
      },
      {
        type: 'single',
        prompt: 'Keys are restored, but three days later two events for one parcel swap order **within one partition** during a broker leader change. What explains it?',
        options: [
          'Retries with more than one request in flight: a retried batch can land after a later one',
          'The key was hashed differently on the retry',
          'The consumer read the partition backwards',
          'Auto offset reset moved the consumer',
        ],
        answer: 0,
        explain: 'The offsets themselves show the order that was written. The connector warns that retries without a single in-flight request can change the order of records. Maximum in flight requests defaults to 5.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the permanent fix?',
        options: [
          'Set key = parcelId in the shared publish sub-flow and fail fast if it is empty',
          'Set Maximum in flight requests to 1 on the producer, and measure the throughput',
          'Enable idempotence with its required settings, so that retries do not write duplicates',
          'Make the consumer ignore a status older than the current one, using the event timestamp',
          'Reduce the topic to one partition',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Restore the key, close the retry window, and make the consumer tolerant of the rest. One partition would keep order but give up all parallelism across 200,000 parcels a day.',
      },
      {
        type: 'order',
        prompt: 'Order the response to the first incident.',
        items: [
          'Compare the partitions used by events of one affected parcel',
          'Find the release that removed the key',
          'Release the fix that restores the key',
          'Rebuild the status of affected parcels from their event timestamps',
          'Add a test that fails if a record is published without a key',
        ],
        explain: 'Prove the cause from the evidence, stop new damage, repair the data, and then guard against it returning.',
      },
    ],
  },
  description: `
## Symptoms
- From Wednesday morning, customers see parcels go from **Delivered** back to **Out for Delivery**. The call centre has logged about 3,000 complaints.
- Roughly 2% of 200,000 parcels a day are affected.
- There are no errors in the publisher or the consumer.
- After a fix on Wednesday evening, a few swaps still appeared on Saturday during a broker maintenance window.

## Change / Context
- \`tracking-publisher\` sends status events to \`parcel.status\` (12 partitions). Consumers apply each event to the tracking database.
- Release v4.0.0 moved \`kafka:publish\` into a shared sub-flow used by three flows. The \`key\` setting was not carried over.
- The producer connection uses its defaults for Enable idempotence and Maximum in flight requests, and Retries is set to 3.

## Logs
\`\`\`
09:14:11 INFO  [tracking-publisher] Published parcel=P-7741902 status=OUT_FOR_DELIVERY key=null partition=3 offset=5512088
09:14:12 INFO  [tracking-publisher] Published parcel=P-7741902 status=DELIVERED key=null partition=9 offset=4410276
09:14:12 INFO  [tracking-consumer] Applied P-7741902 DELIVERED partition=9
09:14:13 INFO  [tracking-consumer] Applied P-7741902 OUT_FOR_DELIVERY partition=3
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
    'Kafka orders records only within a partition, and the same key maps to the same partition.',
    'Key is optional on kafka:publish, so losing it raises no error.',
    'Retries without a single in-flight request can change record order. Maximum in flight requests defaults to 5.',
    'With idempotence off, a retried message can be duplicated.',
    'Idempotence requires in-flight of 5 or less, retries above 0 and acks ALL.',
    'Consumers should tolerate stale events by comparing timestamps or sequence numbers.',
  ],
  solution: `
**Diagnosis.** There are two causes, seen at different times.
- **Wednesday:** the refactor lost the \`key\`. Each parcel's events spread over partitions, and two consumers working on two partitions can apply them in any order.
- **Saturday:** keys were back, so both events were on one partition, but they were written in the wrong order. Maintenance caused send failures and retries. With up to 5 requests in flight, a retried batch landed after a later one.

**Immediate mitigation.**
- Restore \`key = parcelId\` and release.
- Rebuild the status of affected parcels from event timestamps, and tell the call centre which parcels were corrected.
- For Saturday's cases, apply the same repair and schedule the producer change before the next maintenance.

**Root cause.** Ordering depended on a setting that fails silently, and the producer defaults allow reordering during retries. Neither is a defect: both are documented behaviour.

**Permanent fix.**
- Set the key in the shared sub-flow, and make the flow fail if the parcel id is empty.
- Set **Maximum in flight requests** to **1** where order per key matters. Measure throughput, because this limits what the producer can send at once.
- Enable idempotence so a retried message is not duplicated. It requires in-flight of 5 or less, retries above 0 and Producer Acknowledge Mode ALL, whose default is NONE. Incompatible values raise a \`ConnectionException\`.
- Make the consumer ignore an event older than the status it already holds.

**Prevention.** Add a test that fails on a null key. Alert on records published without a key, and on status changes that move backwards. Run a failover test in a lower environment with order checks.
`,
  followUps: [
    { q: 'Why did 98% of parcels look fine?', a: 'Events for one parcel are usually minutes apart, which hides the race. Only events close together on different partitions could swap.' },
    { q: 'Would more consumers have made this better?', a: 'No. More parallel work across partitions makes order across them less predictable. Only a shared partition gives order for a key.' },
    { q: 'Should the key be the parcel id or the customer id?', a: 'It should match what needs ordering, which is the parcel. A customer id would also keep order, but a customer with heavy volume could overload one partition.' },
  ],
}

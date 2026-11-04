export default {
  id: 'inc-084',
  category: 'incidents',
  title: 'Every Shipment Notification Goes Out Twice After the Salesforce Event Listener Is Scaled to Two Workers',
  level: 'ADVANCED',
  tags: ['salesforce', 'platform-events', 'replay', 'cloudhub', 'duplicates', 'quota', 'logistics'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '2026-10-19 21:04:11 INFO  [runtime] shipment-events scaled from 1 to 2 workers (change CHG-4471)', relevant: true, why: 'The duplicates begin after this change. It is the only change to the app.' },
      { text: '2026-10-20 08:15:02 INFO  [worker-0] Replay channel /event/Shipment_Update__e replayId=48211907 shipment=SHP-90233', relevant: true, why: 'The first worker receives the event.' },
      { text: '2026-10-20 08:15:02 INFO  [worker-1] Replay channel /event/Shipment_Update__e replayId=48211907 shipment=SHP-90233', relevant: true, why: 'The second worker receives the same replay ID at the same moment, so both are subscribed. This is not a redelivery.' },
      { text: '2026-10-20 08:15:03 INFO  [worker-0] POST /v2/notifications 202 shipment=SHP-90233', relevant: false },
      { text: '2026-10-20 08:15:03 INFO  [worker-1] POST /v2/notifications 202 shipment=SHP-90233', relevant: true, why: 'Nothing downstream detects the second copy, so the customer gets two messages.' },
      { text: '2026-10-20 08:20:00 INFO  [health] GET /api/health 200 (3 ms)', relevant: false },
      { text: '2026-10-20 09:00:00 WARN  [sf-limits] Delivered platform events today 18,204, about double the normal rate at this hour', relevant: true, why: 'Each delivery counts against the allocation, so two subscribers use it twice as fast.' },
      { text: '2026-10-20 09:02:41 INFO  [notification-platform] Queue depth 12, latency 140 ms', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause of the duplicate notifications?',
        options: [
          'The Replay Channel Listener runs on both workers, and each worker consumes every event',
          'Salesforce publishes each platform event twice when load is high',
          'The notification platform retries each POST once',
          'The object store lost the replay ID, so old events are being replayed',
        ],
        answer: 0,
        explain: 'Both workers log the same replay ID at the same time. The connector docs state that with multiple workers in non-cluster mode the source runs on all the nodes, which causes duplicate consumption.',
      },
      {
        type: 'single',
        prompt: 'What is the right immediate action?',
        options: [
          'Scale the listener app back to one worker, then identify the shipments notified twice since the change',
          'Add a second channel so that each worker has its own',
          'Switch the Replay Option to ALL',
          'Add a reconnection strategy to the connector configuration',
        ],
        answer: 0,
        explain: 'One subscriber stops the duplicates and the double quota use. ALL would redeliver every event Salesforce still holds, and reconnection has nothing to do with this failure.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the permanent fix?',
        options: [
          'Keep the listener on a single worker and pass messages to the other workers through a shared queue',
          'Make the notification step idempotent, keyed on the replay ID or shipment event',
          'Monitor event consumption and not only app status',
          'Add a second flow on the same channel so that both workers share the load',
          'Treat "one subscriber per channel" as a design rule for all Replay sources',
        ],
        answer: [0, 1, 2, 4],
        explain: 'The docs suggest a single worker with a shared queue on CloudHub. A second flow on the same channel consumes the events again from the quota.',
      },
      {
        type: 'order',
        prompt: 'Order the response steps.',
        items: [
          'Compare the log lines of both workers and confirm the same replay IDs on each',
          'Scale shipment-events back to one worker',
          'Confirm that each replay ID now appears once',
          'Check the event allocation used so far today',
          'List the affected shipments and agree the customer communication',
          'Redesign with a shared queue and idempotent notification before scaling again',
        ],
        explain: 'Confirm the cause, stop the duplicates, verify, check the side effect on quota, deal with the customer impact, then fix the design.',
      },
    ],
  },
  description: `
## Symptoms
- Tuesday morning: customers complain that they receive **every shipment message twice**. The customer service queue grows by 300 tickets in two hours.
- The Salesforce administrator reports that delivered platform events are running at about **double the normal rate**.
- No errors in the app. Both workers are healthy.

## Change / Context
- \`shipment-events\` runs on CloudHub with no clustering. It subscribes to the platform event \`/event/Shipment_Update__e\` with the **Replay Channel Listener** and calls the notification platform.
- Volume is about 40,000 events per day.
- On Monday evening the app was **scaled from 1 to 2 workers** ahead of the peak season, under change CHG-4471. The ticket says "more workers, more throughput".
- The notification platform does not deduplicate.

## Logs
\`\`\`
21:04:11 INFO  [runtime] shipment-events scaled from 1 to 2 workers
08:15:02 INFO  [worker-0] Replay channel ... replayId=48211907 shipment=SHP-90233
08:15:02 INFO  [worker-1] Replay channel ... replayId=48211907 shipment=SHP-90233
08:15:03 INFO  [worker-0] POST /v2/notifications 202 shipment=SHP-90233
08:15:03 INFO  [worker-1] POST /v2/notifications 202 shipment=SHP-90233
09:00:00 WARN  [sf-limits] Delivered platform events today 18,204
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
    'The same replay ID on both workers at the same moment means two subscribers, not a redelivery.',
    'The connector docs: the source must run on the primary node; with multiple workers in non-cluster mode it runs on all nodes and events are consumed twice.',
    'Running on several nodes can also corrupt the object store data that holds the replay IDs.',
    'Each delivery counts against the event allocation, so a second subscriber uses it twice as fast.',
    'Immediate: back to one worker, verify, check the allocation, identify affected shipments.',
    'Permanent: one worker for the listener, a shared queue to scale processing, and idempotent consumers.',
  ],
  solution: `
**Diagnosis.** Both workers log the same replay ID in the same second, and the duplicates start right after the scale-out. Salesforce delivers each event to each subscriber, and there are now two subscribers.

**Immediate mitigation.**
- Scale \`shipment-events\` back to **one worker** and confirm that each replay ID appears once.
- Check how much of the daily event allocation has been used. If \`403::Organization total events daily limit exceeded\` appears, the docs say that reconnecting will not restore it, so stop the listener and wait for the reset.
- Check the replay state, because running the source on several nodes can corrupt the object store data. Restart with a known replay ID if in doubt, within the Salesforce retention window (the connector docs give both 72 and 24 hours, so verify it).
- List the affected shipments from the logs and agree the customer communication.

**Root cause.** A streaming source was scaled like a stateless API. The Replay Channel Listener is a subscriber: in non-cluster mode with several workers it runs on every worker, so each one consumes every event. Nothing downstream was idempotent, so the duplicates reached customers.

**Permanent fix.**
- Follow the docs: keep the listener on **a single worker** and pass messages through a **shared queue** (such as Anypoint MQ), so that processing scales on the consumer side.
- Make the notification step **idempotent** on the replay ID or a business event key. The docs also warn that on CloudHub the last replay ID may not be found and all events can replay on restart, so duplicates remain possible even with one worker.

**Prevention.** Add a design rule and a review check for scaling any app with a subscriber source. Monitor event consumption, not only app status. Add a test that counts deliveries per replay ID in a pre-production environment with the production replica count.
`,
  followUps: [
    { q: 'Would Primary Node Only have prevented this?', a: 'That parameter applies when Mule instances run in a cluster, where it keeps the source on the primary node. This app ran with no clustering, so each worker was on its own. The docs give a single worker and a shared queue as the way to avoid it on CloudHub.' },
    { q: 'Could the single listener worker become a bottleneck?', a: 'It now only receives the event and publishes to a queue, which is far lighter than calling the notification platform. Cache Events In Memory can also reduce quota use when processing is slow.' },
    { q: 'Should each team get its own flow on the same channel?', a: 'No. Several flows on the same channel consume the events several times from the quota, so the docs advise putting the logic in a single flow and fanning out from there.' },
  ],
}

export default {
  id: 'inc-190',
  category: 'incidents',
  title: 'Large Orders Shipped Twice After a Credit Check Is Added: Processing Outlives the Anypoint MQ Acknowledgement Timeout',
  level: 'ADVANCED',
  tags: ['myproject', 'anypoint-mq', 'acknowledgement', 'redelivery', 'idempotency', 'timeouts'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '2026-11-18 14:00:01 INFO  [fulfil-app replica=1] Message received messageId=m-7731 orderId=SO-55820 lines=240', relevant: true, why: 'A large order is taken by replica 1.' },
      { text: '2026-11-18 14:00:02 INFO  [fulfil-app replica=1] Credit check started orderId=SO-55820', relevant: false },
      { text: '2026-11-18 14:01:02 INFO  [fulfil-app replica=2] Message received messageId=m-7731 orderId=SO-55820 lines=240 deliveryCount=2', relevant: true, why: 'Sixty seconds later the same message is delivered again to replica 2.' },
      { text: '2026-11-18 14:01:33 INFO  [fulfil-app replica=1] Shipment created orderId=SO-55820 shipmentId=SH-90112 durationMs=92010', relevant: true, why: 'Replica 1 needed 92 seconds, longer than the 60 second acknowledgement timeout.' },
      { text: '2026-11-18 14:02:35 INFO  [fulfil-app replica=2] Shipment created orderId=SO-55820 shipmentId=SH-90113 durationMs=93140', relevant: true, why: 'Replica 2 creates a second shipment for the same order.' },
      { text: '2026-11-18 14:02:36 INFO  [config] subscriber acknowledgementTimeout=60 SECONDS', relevant: true, why: 'The message lock lasts 60 seconds.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why was the same message processed by two replicas?',
        options: [
          'It was not acknowledged within 60 seconds, so Anypoint MQ made it available again and another replica took it',
          'The publisher sent it twice',
          'Both replicas share one subscriber thread',
          'The queue is a FIFO queue',
        ],
        answer: 0,
        explain: 'A message being processed is locked only for the acknowledgement timeout. After that it can be delivered again, even while the first consumer is still working on it.',
      },
      {
        type: 'single',
        prompt: 'Why did this start this week?',
        options: [
          'The new credit check made large orders take about 90 seconds, past the 60 second timeout',
          'The queue was renamed',
          'Replica 2 was added this week',
          'The order format changed',
        ],
        answer: 0,
        explain: 'Small orders still finish in time. Only orders slow enough to pass 60 seconds are delivered twice.',
      },
      {
        type: 'multi',
        prompt: 'Which changes stop the double shipments?',
        options: [
          'Raise the acknowledgement timeout above the slowest processing time, with a margin',
          'Make shipment creation idempotent on the order ID',
          'Put a time limit on the credit check call so processing has an upper bound',
          'Run a single replica forever',
        ],
        answer: [0, 1, 2],
        explain: 'A longer lock removes the cause, the idempotency check makes a repeat harmless, and a time limit keeps processing inside the lock. One replica only hides the problem and removes capacity.',
      },
      {
        type: 'single',
        prompt: 'Why is a longer timeout alone not enough?',
        options: [
          'Processing can still exceed any fixed value on a bad day, and a crash after the work but before the acknowledgement also causes a repeat',
          'Long timeouts are not allowed',
          'It makes the queue slower for every message',
          'It turns off redelivery',
        ],
        answer: 0,
        explain: 'Queues deliver at least once. The consumer must cope with a repeat, so idempotency is the real protection.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Find orders with more than one shipment and stop the extra ones',
          'Raise the acknowledgement timeout above the slowest processing time',
          'Add a time limit to the credit check call',
          'Make shipment creation idempotent on the order ID',
          'Alert when a message is delivered more than once',
        ],
        explain: 'Contain the damage, remove the cause, cap the slow call, make repeats harmless, then watch for it.',
      },
    ],
  },
  description: `
## Symptoms
- Since Monday, some customers receive two shipments for one order.
- Only orders with many lines are affected.

## Change / Context
- \`fulfil-app\` runs on two replicas and reads orders from an Anypoint MQ queue.
- The subscriber acknowledges a message when the flow finishes. Its acknowledgement timeout is 60 seconds.
- On Monday a credit check call was added before the shipment is created. For large orders it takes up to 90 seconds.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 14:00:01 INFO  [fulfil-app replica=1] Message received messageId=m-7731 orderId=SO-55820 lines=240
2026-11-18 14:01:02 INFO  [fulfil-app replica=2] Message received messageId=m-7731 orderId=SO-55820 lines=240 deliveryCount=2
2026-11-18 14:01:33 INFO  [fulfil-app replica=1] Shipment created orderId=SO-55820 shipmentId=SH-90112 durationMs=92010
2026-11-18 14:02:35 INFO  [fulfil-app replica=2] Shipment created orderId=SO-55820 shipmentId=SH-90113 durationMs=93140
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
    'A message being processed is locked only for the acknowledgement timeout.',
    'Processing longer than the timeout lets another consumer take the same message.',
    'The new credit check pushed large orders past the timeout.',
    'Raise the timeout above the slowest processing, with a margin.',
    'Bound slow calls with a time limit.',
    'Make the consumer idempotent, because delivery is at least once.',
  ],
  solution: `
**Diagnosis.** Large orders now take about 90 seconds. The acknowledgement timeout is 60 seconds, so the message lock ends while replica 1 is still working. Anypoint MQ delivers the message again, replica 2 takes it, and both create a shipment.

**Immediate mitigation.**
- Find orders with two shipments and cancel the extra ones before they leave the warehouse.
- Raise the acknowledgement timeout well above the slowest processing time.

**Root cause.** A slow call was added without checking the consumer timeout, and the consumer was not idempotent, so a repeat delivery created real duplicates.

**Permanent fix.**
- Put a time limit on the credit check, so processing has a known upper bound below the lock time.
- Before creating a shipment, check whether one already exists for the order ID. Store the order ID with the shipment, and treat a repeat as done.

**Prevention.** Alert on messages delivered more than once. When a change adds time to a consumer, compare the new worst case with the acknowledgement timeout in the review.
`,
  followUps: [
    { q: 'Why did small orders never repeat?', a: 'They finish well inside 60 seconds and are acknowledged before the lock ends.' },
    { q: 'Would one replica fix it?', a: 'No. With one replica the message would come back to the same app later and still be processed twice.' },
    { q: 'Is a very long timeout a problem?', a: 'If the app crashes, the message waits that long before another consumer can take it. Size it from real processing times.' },
    { q: 'Where do you keep the idempotency record?', a: 'In the shipment system itself or a persistent store shared by all replicas, keyed by the order ID.' },
  ],
}

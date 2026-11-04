export default {
  id: 'inc-060',
  category: 'incidents',
  title: 'Black Friday Checkout Hangs Because the Broker Store Is Full',
  level: 'ADVANCED',
  tags: ['retail', 'activemq', 'jms', 'flow-control', 'capacity', 'e-commerce'],
  estMinutes: 35,
  investigation: {
    logs: [
      { text: '10:02:11.004 INFO  [orders-exp] POST /orders 201 (180 ms) order=W-99120031', relevant: false },
      { text: '10:05:40.700 WARN  [amq-a] Usage Manager Store is Full, 100% of 10737418240. Stopping producer to prevent flooding queue://ORDER.CREATED. See producer-flow-control for more info (blocking for: 31s)', relevant: true, why: 'The broker has hit its storeUsage limit and is blocking producers (producer flow control).' },
      { text: '10:05:41.020 WARN  [orders-exp] POST /orders still waiting on jms:publish to ORDER.CREATED after 30 s corrId=c71a (web shop client timed out and disconnected)', relevant: true, why: 'The publish inside the checkout request blocks, so the web shop times out.' },
      { text: '10:06:00.000 INFO  [amq-console] ORDER.CREATED pending=820 consumers=6 | ANALYTICS.ORDERS.COPY pending=9 410 200 consumers=0 | ActiveMQ.DLQ pending=212 000', relevant: true, why: 'Almost all of the store is taken by a copy queue with no consumer and an old DLQ, not by live orders.' },
      { text: '10:06:02.000 INFO  [health] GET /health 200 (2 ms)', relevant: false },
      { text: '10:06:05.300 INFO  [amq-a] composite destination ORDER.CREATED forwards to ORDER.CREATED, ANALYTICS.ORDERS.COPY', relevant: true, why: 'Every order is also copied into the analytics queue, whose consumer was decommissioned in August.' },
      { text: '10:06:30.000 INFO  [metrics] orders-exp cpu=9% threads.waiting=240', relevant: false },
      { text: '10:07:00.000 INFO  [fulfil] Wave 4412 released to DC-West', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is blocking checkout?',
        options: [
          'The broker store is full, mostly with an unconsumed analytics copy queue and an old DLQ, so ActiveMQ blocks producers and the synchronous publish in checkout hangs',
          'The order consumers are too slow for Black Friday volumes',
          'The web shop is sending malformed orders',
          'The Mule app ran out of CPU',
        ],
        answer: 0,
        explain: 'ORDER.CREATED itself has only 820 pending with 6 consumers. The 9.4 million messages in a queue nobody reads filled storeUsage, and producer flow control blocks every publisher.',
      },
      {
        type: 'single',
        prompt: 'What is the fastest safe **immediate** action?',
        options: [
          'Raise the store limit to 100 GB without checking disk',
          'After confirming with the data team it is no longer needed, purge ANALYTICS.ORDERS.COPY (and export then purge old DLQ messages) to free store space',
          'Restart the broker',
          'Stop all order consumers to reduce load',
        ],
        answer: 1,
        explain: 'Freeing the dead copy queue releases most of the space immediately. A restart keeps the persisted messages; raising the limit beyond the real disk risks a hard failure.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and prevention**?',
        options: [
          'Remove the composite destination copy (or give it a real consumer and expiry)',
          'Alert on store and memory percentUsage and on queues with pending messages and zero consumers',
          'Set a publish timeout and fallback in checkout (e.g. store the order and publish later) so a blocked broker does not hang customers',
          'Give the DLQ an expiry or a regular review and replay process',
          'Turn off persistence for ORDER.CREATED to save store space',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Remove the waste, watch capacity, and make checkout resilient. Non-persistent orders would be lost on a broker restart.',
      },
      {
        type: 'match',
        prompt: 'Match each ActiveMQ Classic limit to what it bounds.',
        pairs: [
          ['memoryUsage', 'Non-persistent messages and cursors held in broker memory'],
          ['storeUsage', 'Persistent messages in the KahaDB store'],
          ['tempUsage', 'Non-persistent messages spooled to temporary storage'],
        ],
        explain: 'When any of these reaches 100% for a destination, producer flow control can block or fail producers.',
      },
    ],
  },
  description: `
## Symptoms
- Black Friday, 10:05: the web shop checkout starts timing out. Customers see "We could not place your order".
- \`orders-exp\` publishes each order, with Persistent Delivery enabled, to ActiveMQ Classic queue \`ORDER.CREATED\` inside the HTTP request and only then returns 201.
- CPU is low everywhere. The order consumers are keeping up with \`ORDER.CREATED\`.

## Change / Context
- A year ago a **composite destination** was added on the broker so every \`ORDER.CREATED\` message is also copied to \`ANALYTICS.ORDERS.COPY\` for a reporting tool. The reporting tool was decommissioned in August; nobody removed the copy.
- \`ActiveMQ.DLQ\` has never been cleaned.
- Broker \`systemUsage\`: \`storeUsage limit="10 gb"\`. Producer flow control is on (default).

## Logs
\`\`\`
10:05:40.700 WARN  [amq-a] Usage Manager Store is Full, 100% of 10737418240. Stopping producer
  to prevent flooding queue://ORDER.CREATED (blocking for: 31s)
10:05:41.020 WARN  [orders-exp] POST /orders still waiting on jms:publish to ORDER.CREATED after 30 s corrId=c71a
10:06:00.000 INFO  [amq-console] ORDER.CREATED pending=820 consumers=6
  | ANALYTICS.ORDERS.COPY pending=9410200 consumers=0 | ActiveMQ.DLQ pending=212000
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
    'storeUsage hit 100%; ActiveMQ producer flow control blocks producers, so the synchronous publish in checkout hangs.',
    'The space is consumed by ANALYTICS.ORDERS.COPY (no consumer since August) and an uncleaned DLQ, not by live orders.',
    'Immediate: confirm and purge the dead copy queue, export and purge old DLQ messages, verify checkout recovers.',
    'Note: KahaDB can only reclaim a journal file when no message in it is still referenced, so space returns after cleanup and log GC.',
    'Fix: remove the composite copy, alert on store usage and zero-consumer queues, DLQ expiry/review, publish timeout and fallback in checkout.',
  ],
  solution: `
**Diagnosis.** The broker's persistent store reached its **10 GB storeUsage** limit. With producer flow control, ActiveMQ **blocks producers** until space is freed, so the \`jms:publish\` inside the checkout request waits and the web shop times out. The live queue is healthy; the space is taken by **9.4 million** messages in \`ANALYTICS.ORDERS.COPY\`, a composite-destination copy with **no consumer** since August, plus 212,000 messages in an uncleaned DLQ. Black Friday volume pushed it over the edge.

**Immediate mitigation.** Confirm with the data team that the copy queue is not needed, then **purge** it (console or JMX). Export DLQ messages to a file for later review and purge them. Watch store usage drop (KahaDB frees journal files once no live message references them, at its next cleanup) and checkout succeed again. Post a status update for the e-commerce team.

**Root cause.** A forgotten destination with no consumer, a never-reviewed DLQ, no capacity monitoring, and a checkout path that depends synchronously on the broker accepting the message.

**Permanent fix.**
- Remove the composite destination forward (or give the copy queue a real consumer and a message expiry).
- DLQ policy: per-queue DLQs, expiry or regular review and replay.
- Checkout resilience: bound the publish time and, on failure, write the order to a local outbox table in Oracle and publish it later, so the customer still gets an order confirmation.
- Size the store for peak, with headroom, on disk that really has that space.

**Prevention.** Alerts on store/memory/temp percentUsage (e.g. 70%), on queues with pending messages and **consumers=0**, and on DLQ growth; a peak-readiness checklist that includes broker capacity.
`,
  followUps: [
    { q: 'Can ActiveMQ fail the send instead of blocking?', a: 'Yes, with sendFailIfNoSpace (or sendFailIfNoSpaceAfterTimeout) on systemUsage the producer gets an exception instead of blocking, which lets the app fail fast and use its fallback.' },
    { q: 'Why did restarting the broker not help?', a: 'The messages are persistent, so after the restart the store is just as full; only consuming, purging or expiring them frees space.' },
    { q: 'What is the outbox pattern here?', a: 'Checkout writes the order and an outbox row in one database transaction, and a separate process publishes outbox rows to the broker, so a broker outage delays messages but never loses or blocks orders.' },
  ],
}

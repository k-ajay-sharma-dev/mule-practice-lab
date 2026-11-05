export default {
  id: 'inc-145',
  category: 'incidents',
  title: 'Orders Stranded in a Fallback Queue: "Using fallback queue directly is not supported" After Failover Is Disabled',
  level: 'ADVANCED',
  tags: ['cloudhub-2', 'deployment', 'anypoint-mq', 'failover', 'disaster-recovery', 'retail'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '2026-11-03 04:12:40 WARN  [prc-orders] Anypoint MQ us-east-1 unavailable for orders.inbound (HTTP 503), switching to fallback queue', relevant: true, why: 'Failover worked as designed: the connector moved to the fallback queue when the region returned server errors.' },
      { text: '2026-11-03 05:30:02 INFO  [prc-orders] primary region reachable, publishing to orders.inbound', relevant: true, why: 'The connector switched back. The consumer should continue to read from the fallback queue until it is empty.' },
      { text: '2026-11-03 05:42:19 INFO  [audit] MQ queue orders.inbound: cross-region failover disabled, user p.nowak', relevant: true, why: 'Failover was disabled while messages remained in the fallback queue.' },
      { text: '2026-11-03 05:47:55 INFO  [runtime] prc-orders restarted, 3 replicas STARTED', relevant: true, why: 'After the restart, the connector no longer consumes from the fallback queue.' },
      { text: '2026-11-03 06:15:12 INFO  [mq-stats] orders.inbound_fb (us-east-2): 1,932 messages in queue, 0 in flight', relevant: true, why: 'The messages are still there and retained. They are stranded, not lost.' },
      { text: '2026-11-03 06:40:31 ERROR [prc-orders-drain] java.lang.IllegalArgumentException: Using fallback queue directly is not supported', relevant: true, why: 'The drain app reads orders.inbound_fb directly while the failover property is still true in that app.' },
      { text: '2026-11-03 06:41:00 INFO  [exp-checkout] POST /v1/orders 202 (41 ms)', relevant: false },
      { text: '2026-11-03 06:45:00 INFO  [health] GET /api/health 200 (2 ms)', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why are 1,932 orders not being processed?',
        options: [
          'Failover was disabled and the apps restarted, so the connector no longer consumes from the fallback queue, and the messages remain there until something processes them',
          'The messages were replicated to the primary queue and are waiting there',
          'Messages in a fallback queue are deleted when failover is disabled',
          'The us-east-2 region is still down',
        ],
        answer: 0,
        explain: 'The docs say apps can still consume messages that remain in the fallback queue after failover is disabled. But it takes deliberate action, and the connector does not do it for you after the restart.',
      },
      {
        type: 'single',
        prompt: 'Why does the drain app fail with `Using fallback queue directly is not supported`?',
        options: [
          'While failover is enabled for an app, the connector manages the `_fb` queue and prevents direct operations on it',
          'Fallback queues cannot be read by any Mule app',
          'The connector version is too new',
          'The queue name must omit the `_fb` suffix',
        ],
        answer: 0,
        explain: 'The property `cross.region.failover.feature.enabled` is true in the drain app, so the connector rejects the direct use.',
      },
      {
        type: 'single',
        prompt: 'How do you process the stranded messages?',
        options: [
          'In the drain app, set the Queue field to `orders.inbound_fb`, and set `cross.region.failover.feature.enabled` to false on the Properties tab',
          'Delete the fallback queue, so that messages return to the primary',
          'Use the Message Sender in the Anypoint MQ UI to move them',
          'Ask MuleSoft Support to replicate the queue',
        ],
        answer: 0,
        explain: 'This is the documented procedure. You cannot delete a fallback queue, and the Message Sender and Message Browser do not support the failover feature.',
      },
      {
        type: 'multi',
        prompt: 'Which statements are correct for the review after the incident?',
        options: [
          'Failover gives resiliency, not data redundancy: messages are not replicated between the primary and fallback queues',
          'The fallback queue inherits settings such as message TTL, so waiting is not free of risk',
          'The drain flow should be idempotent by order ID, because standard queues are at-least-once',
          'The runbook should say to wait until the fallback queue is empty before disabling failover',
          'After failover, the primary queue always holds a copy of every fallback message',
        ],
        answer: [0, 1, 2, 3],
        explain: 'After recovery, the consumer continues to read from the fallback queue until all messages in it are processed, so patience would have avoided this incident.',
      },
      {
        type: 'order',
        prompt: 'Order the response steps.',
        items: [
          'Confirm the message count in `orders.inbound_fb` and check its TTL',
          'Prepare the drain app with the fallback queue name and the failover property set to false',
          'Run the drain at a controlled rate into idempotent order processing',
          'Reconcile processed orders against checkout records',
          'Decide whether to re-enable failover, and if so restart all apps that use the queue',
        ],
        explain: 'Protect the data first, drain under control, prove nothing is missing, then restore resilience. Re-enabling failover reinstates the same fallback queue, and apps must be restarted when the setting changes.',
      },
    ],
  },
  description: `
## Symptoms
- Tuesday 06:15: stores report 1,932 web orders with no confirmation. All were accepted at checkout between 04:12 and 05:30.
- \`orders.inbound\` in \`us-east-1\` is empty and new orders flow normally.
- \`orders.inbound_fb\` in \`us-east-2\` holds 1,932 messages and is not draining.
- A hurried drain app fails at start with an \`IllegalArgumentException\`.

## Change / Context
- \`orders.inbound\` is a standard queue with **cross-region failover** enabled, and \`prc-orders\` has \`cross.region.failover.feature.enabled=true\`.
- During an Anypoint MQ disruption in \`us-east-1\`, the connector switched to the fallback queue, as designed.
- After the primary region returned, an engineer disabled failover at 05:42 "to get things back to normal" and restarted \`prc-orders\`, as the docs require after a change to failover.
- The engineer then copied \`prc-orders\` to create \`prc-orders-drain\`, with its queue name changed to \`orders.inbound_fb\`.

## Logs
\`\`\`
04:12:40 WARN  [prc-orders] us-east-1 unavailable (HTTP 503), switching to fallback queue
05:30:02 INFO  [prc-orders] primary region reachable, publishing to orders.inbound
05:42:19 INFO  [audit] MQ queue orders.inbound: cross-region failover disabled
05:47:55 INFO  [runtime] prc-orders restarted, 3 replicas STARTED
06:15:12 INFO  [mq-stats] orders.inbound_fb (us-east-2): 1,932 messages in queue
06:40:31 ERROR [prc-orders-drain] java.lang.IllegalArgumentException:
         Using fallback queue directly is not supported
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
    'Failover switches new publishing and consuming to a fallback queue named with the _fb suffix. It does not replicate messages.',
    'When the primary returns, the connector switches back, and the consumer continues to read from the fallback queue until it is empty.',
    'After failover is disabled and apps restart, the connector no longer publishes to or consumes from the fallback queue.',
    'With the failover property enabled, the connector refuses direct use of a fallback queue with an IllegalArgumentException.',
    'To drain directly: set the queue to the _fb name and set cross.region.failover.feature.enabled to false in that app.',
    'Fallback queues cannot be deleted, and they inherit settings such as message TTL.',
    'The Message Sender and Message Browser do not support failover.',
  ],
  solution: `
**Diagnosis.** The orders are safe in \`orders.inbound_fb\`. The count matches the outage window, and the region is healthy. The audit log shows failover being disabled while the queue still held messages. The drain error is a separate, documented guard.

**Immediate mitigation.**
- Check the message TTL, which the fallback queue inherits from the primary, to see how long you have.
- In \`prc-orders-drain\`, keep the destination \`orders.inbound_fb\` and set \`cross.region.failover.feature.enabled\` to false on the **Properties** tab.
- Drain at a controlled rate into idempotent processing, and reconcile against checkout records.
- Tell the stores when confirmations will arrive.

**Root cause.** Failover was disabled before the fallback queue was empty. Consumers would otherwise have kept reading it until all messages were processed. The team saw failover as a state to switch off after recovery, not as a mechanism with its own drain phase.

**Permanent fix.**
- Write the failback steps into the runbook: leave failover on, watch the \`_fb\` count reach zero, and only then consider any change.
- Keep a tested drain app and a procedure for using it.
- Decide whether to keep failover on permanently. If you re-enable it, the same fallback queue is reinstated, and all apps must be restarted.

**Prevention.**
- Monitor the \`_fb\` queue with the Anypoint MQ Stats API, not only the primary.
- Rehearse a failover, including failback, in a test environment.
- Remember the Message Browser limits: during an outage, UI tools do not follow the failover.
- Check that the fallback region is acceptable for data residency, as the fallback for some regions is in another country.
`,
  followUps: [
    { q: 'Could messages still be in the primary queue after the outage?', a: 'Yes. Messages already in the primary queue are not copied to the fallback queue. They remain in the primary region and are retained until the service returns.' },
    { q: 'How often does the connector check the fallback queue?', a: 'By default, when the primary region is down, it checks the fallback queue for new messages every five minutes. You can change that frequency. Each check counts against the API request quota.' },
    { q: 'Would this work for a FIFO queue?', a: 'No. Failover is supported for standard queues only, not FIFO queues or message exchanges.' },
  ],
}

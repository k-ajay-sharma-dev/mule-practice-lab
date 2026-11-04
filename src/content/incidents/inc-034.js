export default {
  id: 'inc-034',
  category: 'incidents',
  title: 'Publisher Says "Sent" but Anypoint MQ Consumer Never Receives',
  level: 'INTERMEDIATE',
  tags: ['anypoint-mq', 'configuration', 'environments', 'messaging'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '06:00:00.512 INFO  [warehouse-consumer] Anypoint MQ subscriber started destination=orders-created url=https://mq-eu-west-1.anypoint.mulesoft.com/api/v1', relevant: true, why: 'The consumer listens on the EU region queue.' },
      { text: '06:00:01.004 INFO  [order-events-publisher] Anypoint MQ config url=https://mq-us-east-1.anypoint.mulesoft.com/api/v1', relevant: true, why: 'The publisher still uses the US East broker URL copied from an old properties file.' },
      { text: '06:10:02.118 INFO  [order-events-publisher] Published OrderCreated orderId=O-77120 to destination=orders-created messageId=6b3f...', relevant: true, why: 'Publishing succeeds because a queue with the same name exists in US East, so nothing errors.' },
      { text: '06:10:30.000 INFO  [health] GET /health 200 (2 ms)', relevant: false },
      { text: '06:15:00.220 INFO  [order-events-publisher] GET /orders/O-77120 200 (40 ms)', relevant: false },
      { text: '06:30:00.000 INFO  [warehouse-consumer] heartbeat: messages processed in last 30 min = 0', relevant: false },
      { text: '06:31:00.000 INFO  [anypoint-mq] us-east-1 queue orders-created: 212 messages, TTL 7 days | eu-west-1 queue orders-created: 0 messages', relevant: true, why: 'The messages are piling up in the US queue; the EU queue the consumer reads is empty.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Where are the missing orders?',
        options: [
          'In the US East queue `orders-created`, because the publisher uses the US broker URL and queues are regional',
          'They were lost because the consumer did not ACK them',
          'In the EU queue, but the consumer lacks permission to read them',
          'In the dead-letter queue after failing processing',
        ],
        answer: 0,
        explain: 'Anypoint MQ queues are **regional**; a same-named queue in another region is a different queue. The publisher writes to US, the consumer reads EU.',
      },
      {
        type: 'single',
        prompt: 'What must you check **first** before draining?',
        options: [
          'The message TTL on the US queue, to know how much time you have before messages expire',
          'The consumer heap size',
          'The publisher worker size',
          'The Anypoint MQ client app secret rotation date',
        ],
        answer: 0,
        explain: 'Messages expire after their TTL; knowing it tells you how urgent the drain is.',
      },
      {
        type: 'multi',
        prompt: 'Which steps restore the flow **without losing orders**?',
        options: [
          'Fix the publisher `mq.url` to the EU endpoint and redeploy',
          'Drain the US queue with a temporary consumer that re-publishes the messages to the EU queue',
          'Make sure the consumer is idempotent in case of duplicates',
          'Purge the US queue so it cannot confuse anyone',
        ],
        answer: [0, 1, 2],
        explain: 'Stop new messages going to the wrong region, move the backlog, and handle duplicates. Purging before draining loses orders; delete the US queue only after it is empty.',
      },
      {
        type: 'order',
        prompt: 'Put the response in order.',
        items: [
          'Compare publisher and consumer MQ URLs and find the region mismatch',
          'Check the US queue depth and TTL',
          'Fix the publisher URL to EU and redeploy',
          'Drain the US backlog into the EU flow',
          'Delete the duplicate US queue and add queue depth / zero-throughput alerts',
        ],
        explain: 'Diagnose, size the urgency, stop the leak, recover the backlog, then make the misconfiguration fail loudly next time.',
      },
    ],
  },
  description: `
## Symptoms
- \`order-events-publisher\` publishes \`OrderCreated\` events to Anypoint MQ queue \`orders-created\`; \`warehouse-consumer\` subscribes to it.
- After moving both apps to the **EU (Ireland) region** of the US control plane last night, warehouse has received **zero** orders this morning.
- The publisher logs show successful publishes; the consumer logs show it is "listening" with no errors.
- In Anypoint MQ (EU region) the queue \`orders-created\` shows **0 in flight / 0 messages**.

## Change / Context
- The publisher's \`mq.url\` property was copied from an old properties file and still points to the **US East** region broker URL. Credentials are for a client app in the same business group/environment.
- The consumer was configured correctly for the EU region.
- Someone created \`orders-created\` in **both** regions during testing.

## Logs
\`\`\`
# publisher
06:10:02.118 INFO  [order-events-publisher] Published OrderCreated orderId=O-77120 to destination=orders-created messageId=6b3f...
# consumer
06:00:00.512 INFO  [warehouse-consumer] Anypoint MQ subscriber started destination=orders-created
06:30:00.000 INFO  [warehouse-consumer] heartbeat: messages processed in last 30 min = 0
\`\`\`

## Your tasks
1. Where are the messages?
2. How do you restore the flow without losing orders?
3. What is the permanent fix?
4. How do you prevent environment/region drift?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Anypoint MQ queues are regional: a queue with the same name in another region is a different queue.',
    'The publisher is writing to the US East queue; the consumer reads the EU queue — both "work", nothing errors.',
    'Immediate: fix the publisher URL and drain the messages already in the US queue (temporary consumer or re-publish) before they expire (TTL).',
    'Delete the duplicate queue in the wrong region so misconfiguration fails fast instead of silently.',
    'Prevention: region/URL as environment-managed properties, end-to-end synthetic message checks, and alerts on queue depth and consumer throughput.',
  ],
  solution: `
## Diagnosis
Anypoint MQ is **regional**. The publisher uses the **US East** broker URL, and because a queue named \`orders-created\` also exists there (left over from testing), publishing succeeds. The consumer listens on the **EU** queue with the same name, which is empty. Both apps are "healthy"; messages are piling up in the US queue.

## Immediate mitigation
1. Check the US East queue in Anypoint MQ: confirm the messages are there and note the message TTL so you know how much time you have.
2. Fix the publisher's \`mq.url\` to the EU endpoint and redeploy.
3. Drain the US queue: temporarily point a consumer (or a small one-off app) at the US queue and re-publish the messages to the EU queue (messages cannot be shared between regions). Make sure the consumer is idempotent in case of duplicates.

## Root cause
Region-specific configuration copied from an old file, combined with a duplicate queue name in the wrong region, so the error was silent.

## Permanent fix
- Region URL defined once per environment (deployment properties / shared config), not copied per app.
- Remove the unused US queue so a wrong URL produces a clear "destination not found" error.

## Prevention
- Synthetic end-to-end check (publish a test event, assert it is consumed).
- Alerts on queue depth growing and on consumer throughput dropping to zero during business hours.
- Migration checklist that lists every region-specific setting (MQ URL, Object Store, control plane URLs).
`,
  followUps: [
    { q: 'Would a DLQ have caught this?', a: 'No — the messages were never delivered and failed; a DLQ only receives messages that exceed the max delivery attempts on the queue they are in.' },
    { q: 'What happens if the messages exceed their TTL?', a: 'Anypoint MQ deletes them when the TTL expires, so you would have to re-send them from the source system.' },
  ],
}

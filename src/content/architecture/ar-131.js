import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-131',
  category: 'architecture',
  title: 'A Queue with a Dead-Letter Queue',
  level: 'BEGINNER',
  tags: ['messaging', 'queues', 'dlq', 'error-handling', 'async'],
  estMinutes: 10,
  diagram: {
    task: 'draw a queue that sends failed messages aside. Use five boxes: an Experience API, a Queue, a Process API, a Dead-letter queue, and a Monitoring box. Draw Async message lines from the Experience API to the Queue, from the Queue to the Process API, and from the Queue to the Dead-letter queue. Then draw a line from the Dead-letter queue to Monitoring.',
    checks: [
      { label: 'New messages go onto the queue', rule: { type: 'edge', from: 'experience-api', to: 'queue', kind: 'async' } },
      { label: 'The consumer reads from the queue', rule: { type: 'edge', from: 'queue', to: 'process-api', kind: 'async' } },
      { label: 'Failed messages move from the queue to the dead-letter queue', rule: { type: 'edge', from: 'queue', to: 'dlq', kind: 'async' } },
      { label: 'Only the queue feeds the dead-letter queue', rule: { type: 'only-via', target: 'dlq', from: 'queue' } },
      { label: 'Someone is told about failed messages', rule: { type: 'edge', from: 'dlq', to: 'monitoring' } },
    ],
    reference: diagram(
      {
        exp: ['experience-api', 'Address change API'],
        q: ['queue', 'address-changes'],
        prc: ['process-api', 'Address update API'],
        dlq: ['dlq', 'address-changes-dlq'],
        mon: ['monitoring', 'Alerts for support'],
      },
      ['exp ~> q', 'q ~> prc', 'q ~> dlq', 'dlq -> mon'],
    ),
  },
  description: `
A bank queues customer address changes. Some messages have a bad postcode, so they fail every time and keep coming back. A message like this is called a **poison message**.

A **dead-letter queue** (DLQ) is a separate queue that holds messages which failed too many times. They stop being retried, and a person can look at them later.

**Questions:**
- Draw the design.
- What happens to a poison message?
`,
  answerTemplate: `## Design

## The poison message
`,
  keyPoints: [
    'A poison message fails every time, so retrying it wastes work.',
    'After a set number of failed deliveries, the message moves to the DLQ.',
    'Good messages keep flowing while the bad one waits aside.',
    'A DLQ needs an alert and an owner, or failed messages sit there unseen.',
  ],
  solution: `
**Design.**
\`\`\`
 Address change API ┄► address-changes ┄► Address update API
                             ┆
                             └┄► address-changes-dlq ─► Alerts for support
\`\`\`
The line to the DLQ starts at the queue, not at the consumer. The messaging service moves the message after too many failed deliveries.

**The poison message.** The Process API fails on it and the queue delivers it again. When it reaches the limit, it moves to the DLQ. Monitoring alerts support, who correct the address and put the message back on the main queue.
`,
  followUps: [
    {
      q: 'Why not retry forever?',
      a: 'A bad postcode will never fix itself. Endless retries waste work and hide the problem.',
    },
    {
      q: 'Where is this set in Anypoint MQ?',
      a: 'On the queue. You give it a dead letter queue and a maximum number of deliveries.',
    },
  ],
}

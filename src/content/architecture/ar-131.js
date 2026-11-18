import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-131',
  category: 'architecture',
  title: 'A Queue with a Dead-Letter Queue',
  level: 'BEGINNER',
  tags: ['myproject', 'messaging', 'queues', 'dlq', 'error-handling', 'async'],
  estMinutes: 15,
  diagram: {
    task: 'draw a queue that sends failed messages aside. Use five boxes: an Experience API, a Queue, a Process API, a Dead-letter queue, and a Monitoring box. Draw Async message lines from the Experience API to the Queue, from the Queue to the Process API, and from the Queue to the Dead-letter queue. Then draw a line from the Dead-letter queue to Monitoring.',
    checks: [
      { label: 'New messages go onto the queue', rule: { type: 'edge', from: 'experience-api', to: 'queue', kind: 'async' } },
      { label: 'The consumer reads from the queue', rule: { type: 'edge', from: 'queue', to: 'process-api', kind: 'async' } },
      { label: 'Failed messages move from the queue to the dead-letter queue', rule: { type: 'edge', from: 'queue', to: 'dlq', kind: 'async' } },
      { label: 'Only the queue feeds the dead-letter queue', rule: { type: 'only-via', target: 'dlq', from: 'queue' } },
      { label: 'Someone is told about failed messages', rule: { type: 'edge', from: 'dlq', to: 'monitoring' } },
      { label: 'The producer never calls the consumer directly', rule: { type: 'no-edge', from: 'experience-api', to: 'process-api' } },
      { label: 'Every line to or from the main queue is an async message', rule: { type: 'lines', touching: 'queue', kind: 'async' } },
      { label: 'Failed messages reach the dead-letter queue as async messages', rule: { type: 'lines', to: 'dlq', kind: 'async' } },
    ],
    reference: diagram(
      {
        exp: ['experience-api', 'Address change API'],
        q: ['queue', 'address-changes', { maxRedelivery: 3 }],
        prc: ['process-api', 'Address update API'],
        dlq: ['dlq', 'address-changes-dlq'],
        mon: ['monitoring', 'Alerts for support'],
      },
      ['exp ~> q', 'q ~> prc', 'q ~> dlq', 'dlq -> mon'],
    ),
    simulation: {
      tests: [
        {
          name: 'A batch of poison messages',
          about: 'For fifteen minutes, 10 address changes a second arrive and every one has a bad postcode, so each fails every time. After three deliveries each one must move to the DLQ. Nothing is lost, and the main queue never holds more than 2,500 messages.',
          traffic: [{ name: 'address changes', from: 'experience-api', rps: 10, to: 'process-api', kind: 'write' }],
          incidents: [{ errors: 'process-api', rate: 1 }],
          durationMin: 15,
          expect: { dlq: { min: 3000 }, lost: { max: 0 }, backlog: [{ queue: 'queue', maxPeak: 2500 }] },
        },
        {
          name: 'The Address update API is down',
          about: 'The Address update API stops at minute 2 and comes back at minute 12. Good messages wait in the queue instead of going to the DLQ, and the queue is empty again by the end.',
          traffic: [{ name: 'address changes', from: 'experience-api', rps: 10, to: 'process-api', kind: 'write' }],
          incidents: [{ down: 'process-api', at: 2, forMin: 10 }],
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.99 }], dlq: { max: 0 }, lost: { max: 0 }, backlog: [{ queue: 'queue', maxEnd: 50 }] },
        },
      ],
    },
  },
  description: `
A bank queues customer address changes. Some messages have a bad postcode, so they fail every time and keep coming back. A message like this is called a **poison message**.

A **dead-letter queue** (DLQ) is a separate queue that holds messages which failed too many times. They stop being retried, and a person can look at them later.

About **10** address changes arrive each second. A message that fails **three** deliveries must move to the DLQ, and no address change may be lost. When the Address update API is down for **ten minutes**, the good messages must wait in the queue, not go to the DLQ.

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
    'Set the limit on the queue (3 deliveries here). With no limit a poison message loops forever, and with a limit but no DLQ it is dropped.',
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

**Settings.** The queue has a limit of 3 deliveries and the DLQ drawn from it. With no limit, poison messages come back every minute and the queue keeps growing. With a limit but no DLQ, they are dropped and the address changes are lost. A consumer that is down takes no messages, so an outage does not count as failed deliveries. The messages wait in the queue and the consumer catches up when it returns.
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

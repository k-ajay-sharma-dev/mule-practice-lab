import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-129',
  category: 'architecture',
  title: 'One Producer, One Queue, One Consumer',
  level: 'BEGINNER',
  tags: ['messaging', 'queues', 'async', 'event-driven'],
  estMinutes: 10,
  diagram: {
    task: 'draw a parcel booking going through one queue. Use four boxes: a Web app, an Experience API as the producer, a Queue, and a Process API as the consumer. Draw a Sync call line from the Web app to the Experience API. Draw Async message lines from the Experience API to the Queue, and from the Queue to the Process API. Draw no line between the two APIs.',
    checks: [
      { label: 'There is one queue', rule: { type: 'node', match: 'queue', min: 1, max: 1 } },
      { label: 'The website sends the booking to the Experience API with a sync call', rule: { type: 'edge', from: 'web-app', to: 'experience-api', kind: 'sync' } },
      { label: 'The producer puts each booking on the queue', rule: { type: 'edge', from: 'experience-api', to: 'queue', kind: 'async' } },
      { label: 'The consumer takes bookings from the queue', rule: { type: 'edge', from: 'queue', to: 'process-api', kind: 'async' } },
      { label: 'The producer never calls the consumer directly', rule: { type: 'no-edge', from: 'experience-api', to: 'process-api' } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: ['queue', 'topic', 'event-stream', 'cloud-queue', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Booking website'],
        exp: ['experience-api', 'Booking API (producer)'],
        q: ['queue', 'label-requests'],
        prc: ['process-api', 'Label API (consumer)'],
      },
      ['web -> exp', 'exp ~> q', 'q ~> prc'],
    ),
  },
  description: `
A shipping company takes parcel bookings on its website. Printing a label is slow, so customers wait on a spinner.

The company adds a **queue**, a waiting line for messages. A **producer** adds messages. A **consumer** takes them out when it is ready.

**Questions:**
- Draw the design.
- What does the customer gain?
`,
  answerTemplate: `## Design

## What the customer gains
`,
  keyPoints: [
    'A queue sits between a producer and a consumer, so neither one waits for the other.',
    'The producer only needs the queue to accept the message. It can answer the customer straight away.',
    'The consumer works at its own speed. Messages wait in the queue when it is busy.',
  ],
  solution: `
**Design.**
\`\`\`
 Website ─► Booking API ┄► label-requests queue ┄► Label API
\`\`\`
The solid line is a sync call: the website waits for the answer. The other two lines are async messages: nobody waits.

**What the customer gains.** The Booking API puts the request on the queue and replies at once, so the customer sees "booking received" with no spinner. The label is printed a little later.
`,
  followUps: [
    {
      q: 'What happens if the Label API is down for ten minutes?',
      a: 'Bookings still work. Messages wait in the queue, and the Label API catches up when it returns.',
    },
    {
      q: 'Can two consumers read from one queue?',
      a: 'Yes. Each message goes to one of them, so they share the work.',
    },
  ],
}

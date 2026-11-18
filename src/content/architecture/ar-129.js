import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-129',
  category: 'architecture',
  title: 'One Producer, One Queue, One Consumer',
  level: 'BEGINNER',
  tags: ['myproject', 'messaging', 'queues', 'async', 'event-driven'],
  estMinutes: 20,
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
        exp: ['experience-api', 'Booking API (producer)', { vCores: '0.2' }],
        q: ['queue', 'label-requests'],
        prc: ['process-api', 'Label API (consumer)', { vCores: '0.5' }],
      },
      ['web -> exp', 'exp ~> q', 'q ~> prc'],
    ),
    simulation: {
      tests: [
        {
          name: 'Peak bookings',
          about: 'The website sends 80 bookings a second for fifteen minutes. Customers are answered fast, the Label API keeps up so the queue stays short, and the design stays inside 1 vCore.',
          traffic: [{ name: 'bookings', from: 'web-app', rps: 80, to: 'process-api', kind: 'write' }],
          durationMin: 15,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 200 }], backlog: [{ queue: 'queue', maxEnd: 100 }], vCores: { max: 1 } },
        },
        {
          name: 'The Label API is down for ten minutes',
          about: 'At peak the Label API stops at minute 2 and comes back at minute 12. Customers still get "booking received", the bookings wait in the queue, and the backlog is gone within ten minutes of its return.',
          traffic: [{ name: 'bookings', from: 'web-app', rps: 80, to: 'process-api', kind: 'write' }],
          incidents: [{ down: 'process-api', at: 2, forMin: 10 }],
          durationMin: 22,
          expect: { answers: [{ minSuccess: 0.99 }], backlog: [{ queue: 'queue', minPeak: 10000, maxEnd: 50 }], lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
A shipping company takes parcel bookings on its website. Printing a label is slow, so customers wait on a spinner.

The company adds a **queue**, a waiting line for messages. A **producer** adds messages. A **consumer** takes them out when it is ready.

At peak the website takes **80** bookings a second. The Label API is sometimes down for up to **ten minutes**. Customers must still be able to book while it is down, and the labels must catch up within ten minutes of its return. The budget for the APIs is **1 vCore**.

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
    'Size the consumer for more than the normal rate, so it has spare capacity to clear a backlog after an outage.',
  ],
  solution: `
**Design.**
\`\`\`
 Website ─► Booking API ┄► label-requests queue ┄► Label API
\`\`\`
The solid line is a sync call: the website waits for the answer. The other two lines are async messages: nobody waits.

**What the customer gains.** The Booking API puts the request on the queue and replies at once, so the customer sees "booking received" with no spinner. The label is printed a little later.

**Sizing.** The Booking API takes 80 bookings a second, so it needs 0.2 vCore. The Label API must do more than keep up. After a ten minute outage about 48,000 bookings wait in the queue. With 0.5 vCore it handles about 250 a second, so its spare 170 a second clears the backlog in about five minutes. With 0.2 vCore it would keep up on a normal day but need about forty minutes to catch up. The queue keeps its messages persistent, so nothing is lost while the Label API is down.
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

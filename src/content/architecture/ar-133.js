import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-133',
  category: 'architecture',
  title: 'A Kafka Event Stream Between Orders and Shipping',
  level: 'BEGINNER',
  tags: ['kafka', 'event-driven', 'events', 'messaging', 'async'],
  estMinutes: 15,
  diagram: {
    task: 'draw orders reaching shipping through Kafka. Use five boxes: a Process API for the order API, a Database, an Event stream (Kafka), a System API for the shipping API, and a Transport mgmt (TMS) box. Draw Sync call lines from the Process API to the Database, and from the System API to the TMS. Draw Async message lines from the Process API to the Event stream, and from the Event stream to the System API. Draw no line between the two APIs.',
    checks: [
      { label: 'The order API saves the order', rule: { type: 'edge', from: 'process-api', to: 'database' } },
      { label: 'The order API publishes to the event stream', rule: { type: 'edge', from: 'process-api', to: 'event-stream', kind: 'async' } },
      { label: 'The shipping API reads from the event stream', rule: { type: 'edge', from: 'event-stream', to: 'system-api', kind: 'async' } },
      { label: 'The shipping API books the transport with a sync call', rule: { type: 'edge', from: 'system-api', to: 'tms', kind: 'sync' } },
      { label: 'The order API never calls the shipping API directly', rule: { type: 'no-edge', from: 'process-api', to: 'system-api' } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: ['queue', 'topic', 'event-stream', 'cloud-queue', 'dlq'], kind: 'async' } },
      { label: 'Reads and writes to a data store are sync calls', rule: { type: 'lines', to: ['database', 'oracle-db', 'sql-server', 'cache'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        ord: ['process-api', 'Order API'],
        db: ['database', 'Orders database'],
        ks: ['event-stream', 'orders-placed'],
        shp: ['system-api', 'Shipping API', { vCores: '0.5' }],
        tms: ['tms', 'TMS'],
      },
      ['ord -> db', 'ord ~> ks', 'ks ~> shp', 'shp -> tms'],
    ),
    simulation: {
      systems: [{ match: 'tms', latencyMs: 300, maxRps: 100 }],
      tests: [
        {
          name: 'Shipping is down for twenty minutes',
          about: 'The shop takes 30 orders a second. The Shipping API stops at minute 2 and comes back at minute 22. Orders are still taken, the events wait in Kafka, and every order is booked in the TMS by minute 45.',
          traffic: [{ name: 'orders', from: 'process-api', rps: 30, to: ['database', 'tms'], kind: 'write' }],
          incidents: [{ down: 'system-api', at: 2, forMin: 20 }],
          durationMin: 45,
          expect: {
            answers: [{ minSuccess: 0.99 }],
            delivered: [{ to: 'tms', min: 0.99 }],
            backlog: [{ queue: 'event-stream', maxEnd: 50 }],
            lost: { max: 0 },
          },
        },
        {
          name: 'Kafka restarts during an outage',
          about: 'The Shipping API is down from minute 2 to minute 12, and Kafka restarts at minute 6. The events are kept in the log, so none is lost and every order still reaches the TMS.',
          traffic: [{ name: 'orders', from: 'process-api', rps: 30, to: ['database', 'tms'], kind: 'write' }],
          incidents: [{ down: 'system-api', at: 2, forMin: 10 }, { restart: 'event-stream', at: 6 }],
          durationMin: 30,
          expect: { delivered: [{ to: 'tms', min: 0.99 }], lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
An online shop saves each order, and then shipping books a carrier in the **TMS**, the transport management system.

The team places **Kafka** between the two APIs. Kafka is an **event stream**: a log of events, or facts such as "order placed". Readers keep their own place in the log, and an event stays there after it is read.

The shop takes about **30** orders a second. The TMS takes at most **100** bookings a second and answers in about **300 ms**. The Shipping API can be down for up to **twenty minutes**, and every order must still be booked within about twenty minutes of its return.

**Questions:**
- Draw the design.
- How is this different from a queue?
`,
  answerTemplate: `## Design

## Event stream or queue
`,
  keyPoints: [
    'The order API publishes an event and does not know who reads it.',
    'If the shipping API is down, events stay in the log. It catches up if it returns before the retention period ends.',
    'A queue removes a message once it is consumed. A Kafka event stays until its retention period ends.',
    'Each reader tracks its own place, called an offset, so a new reader can start from older events.',
    'Size the reader for more than the normal rate, so it can catch up after an outage. Here the TMS limit of 100 a second sets how fast that is.',
  ],
  solution: `
**Design.**
\`\`\`
 Orders database ◄─ Order API ┄► orders-placed ┄► Shipping API ─► TMS
\`\`\`

**Event stream or queue.** With a queue, a consumed message is gone. With Kafka, the event stays in the log for a set retention period. Shipping reads it, and a later reader such as a fraud check can read the same events from its own place.

**Sizing and failure handling.** After a twenty minute outage, 36,000 events wait in the log. The Shipping API gets 0.5 vCore, so it can read as fast as the TMS allows, 100 a second. With 30 new orders a second, it clears the backlog in under ten minutes. At 0.1 vCore it could do only about 50 a second and would need about half an hour. Kafka keeps its events through a restart, so nothing is lost.
`,
  followUps: [
    {
      q: 'Why save the order before publishing?',
      a: 'An event states a fact. If you publish first and the save fails, shipping acts on an order that does not exist.',
    },
    {
      q: 'What is an offset?',
      a: 'The position of an event in the log. A reader stores the offset it has reached, so it knows where to carry on.',
    },
  ],
}

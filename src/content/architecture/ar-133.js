import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-133',
  category: 'architecture',
  title: 'A Kafka Event Stream Between Orders and Shipping',
  level: 'BEGINNER',
  tags: ['kafka', 'event-driven', 'events', 'messaging', 'async'],
  estMinutes: 10,
  diagram: {
    task: 'draw orders reaching shipping through Kafka. Use five boxes: a Process API for the order API, a Database, an Event stream (Kafka), a System API for the shipping API, and a Transport mgmt (TMS) box. Draw Sync call lines from the Process API to the Database, and from the System API to the TMS. Draw Async message lines from the Process API to the Event stream, and from the Event stream to the System API. Draw no line between the two APIs.',
    checks: [
      { label: 'The order API saves the order', rule: { type: 'edge', from: 'process-api', to: 'database' } },
      { label: 'The order API publishes to the event stream', rule: { type: 'edge', from: 'process-api', to: 'event-stream', kind: 'async' } },
      { label: 'The shipping API reads from the event stream', rule: { type: 'edge', from: 'event-stream', to: 'system-api', kind: 'async' } },
      { label: 'The shipping API books the transport', rule: { type: 'edge', from: 'system-api', to: 'tms' } },
      { label: 'The order API never calls the shipping API directly', rule: { type: 'no-edge', from: 'process-api', to: 'system-api' } },
    ],
    reference: diagram(
      {
        ord: ['process-api', 'Order API'],
        db: ['database', 'Orders database'],
        ks: ['event-stream', 'orders-placed'],
        shp: ['system-api', 'Shipping API'],
        tms: ['tms', 'TMS'],
      },
      ['ord -> db', 'ord ~> ks', 'ks ~> shp', 'shp -> tms'],
    ),
  },
  description: `
An online shop saves each order, and then shipping books a carrier in the **TMS**, the transport management system.

The team places **Kafka** between the two APIs. Kafka is an **event stream**: a log of events, or facts such as "order placed". Readers keep their own place in the log, and an event stays there after it is read.

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
  ],
  solution: `
**Design.**
\`\`\`
 Orders database ◄─ Order API ┄► orders-placed ┄► Shipping API ─► TMS
\`\`\`

**Event stream or queue.** With a queue, a consumed message is gone. With Kafka, the event stays in the log for a set retention period. Shipping reads it, and a later reader such as a fraud check can read the same events from its own place.
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

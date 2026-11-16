import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-130',
  category: 'architecture',
  title: 'A Topic Fanning Out to Two Subscribers',
  level: 'BEGINNER',
  tags: ['messaging', 'pub-sub', 'fan-out', 'async', 'event-driven'],
  estMinutes: 20,
  diagram: {
    task: 'draw one price change reaching two subscribers. Use five boxes: an ERP, a System API, a Topic / exchange, and two Process API boxes, one for each subscriber. Draw a Sync call line from the ERP to the System API. Draw Async message lines from the System API to the Topic, and from the Topic to each Process API. Draw no line from the System API to a Process API.',
    checks: [
      { label: 'Price changes leave the ERP and reach the topic', rule: { type: 'path', from: 'erp', to: 'topic' } },
      { label: 'The ERP hands each price change to the System API with a sync call', rule: { type: 'edge', from: 'erp', to: 'system-api', kind: 'sync' } },
      { label: 'The System API publishes to the topic', rule: { type: 'edge', from: 'system-api', to: 'topic', kind: 'async' } },
      { label: 'There are two subscribers', rule: { type: 'node', match: 'process-api', min: 2 } },
      { label: 'Every subscriber gets its messages from the topic', rule: { type: 'each', of: 'process-api', edgeFrom: 'topic', kind: 'async' } },
      { label: 'The publisher never calls a subscriber directly', rule: { type: 'no-edge', from: 'system-api', to: 'process-api' } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: ['queue', 'topic', 'event-stream', 'cloud-queue', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        erp: ['erp', 'ERP'],
        sys: ['system-api', 'Price System API (publisher)', { vCores: '0.5' }],
        top: ['topic', 'price-changed'],
        web: ['process-api', 'Website prices (subscriber)', { vCores: '0.5' }],
        pos: ['process-api', 'Store tills (subscriber)', { vCores: '0.5' }],
      },
      ['erp -> sys', 'sys ~> top', 'top ~> web', 'top ~> pos'],
    ),
    simulation: {
      tests: [
        {
          name: 'Every subscriber gets each price',
          about: 'The ERP sends 5 price changes a second for ten minutes. The website and the store tills each get every one of them.',
          traffic: [{ name: 'price changes', from: 'erp', rps: 5, kind: 'write' }],
          expect: {
            delivered: [
              { to: { type: 'process-api', label: 'website' }, min: 0.99 },
              { to: { type: 'process-api', label: 'till' }, min: 0.99 },
            ],
          },
        },
        {
          name: 'The weekly price update',
          about: 'Once a week the ERP sends 150 price changes a second for ten minutes. The publisher takes them all, and both subscribers have every price within twenty minutes. The APIs stay inside 2.5 vCores.',
          traffic: [{ name: 'price changes', from: 'erp', rps: 150, kind: 'write', forMin: 10 }],
          durationMin: 20,
          expect: {
            delivered: [
              { to: { type: 'process-api', label: 'website' }, min: 0.99 },
              { to: { type: 'process-api', label: 'till' }, min: 0.99 },
            ],
            backlog: [{ queue: 'topic', maxEnd: 100 }],
            vCores: { max: 2.5 },
          },
        },
        {
          name: 'The tills are offline when the broker restarts',
          about: 'The store tills stop at minute 2 and come back at minute 22. At minute 10 the broker restarts. The prices waiting for the tills must survive the restart, so the tills get every price once they return.',
          traffic: [{ name: 'price changes', from: 'erp', rps: 5, kind: 'write' }],
          incidents: [{ down: { type: 'process-api', label: 'till' }, at: 2, forMin: 20 }, { restart: 'topic', at: 10 }],
          durationMin: 40,
          expect: { delivered: [{ to: { type: 'process-api', label: 'till' }, min: 0.99 }], lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
A retailer changes prices in its **ERP**, the main business system. The website and the store tills both need each new price.

A **topic** delivers one message to many readers. The sender is the **publisher**. Each reader is a **subscriber**, and each one gets its own copy. Sending one message to many readers is called **fan out**.

On a normal day the ERP sends about **5** price changes a second. Once a week a full price update sends **150** a second for ten minutes, and both subscribers must have every price within **twenty minutes**. The store tills can be offline for twenty minutes, and the broker may restart in that time. No price may be lost. The budget for the APIs is **2.5 vCores**.

**Questions:**
- Draw the design.
- How do you add a third subscriber?
`,
  answerTemplate: `## Design

## Adding a third subscriber
`,
  keyPoints: [
    'A queue gives each message to one consumer. A topic gives every subscriber its own copy.',
    'The publisher sends once and does not know who the subscribers are.',
    'A new subscriber needs no change to the publisher.',
    'In Anypoint MQ this is an exchange, and each subscriber reads from its own queue bound to the exchange.',
    'Each subscriber must keep up with the weekly update on its own, so each one is sized for 150 a second.',
    'Persistent messages keep the waiting prices through a broker restart.',
  ],
  solution: `
**Design.**
\`\`\`
                                              ┌┄► Website prices
 ERP ─► Price System API ┄► price-changed topic
                                              └┄► Store tills
\`\`\`
The first line points away from the ERP because the ERP sends out each price change.

**Adding a third subscriber.** Connect the new subscriber to the topic. The System API does not change, because it only knows the topic.

**Sizing and failure handling.** In the weekly update the publisher and each subscriber take 150 messages a second. One vCore handles about 500 simple requests a second, so 0.5 vCore each leaves room, 1.5 vCores in all. With 0.1 vCore a subscriber builds a backlog that takes far longer than twenty minutes to clear. When the tills are offline, their copies wait in the topic. The messages are persistent, so a broker restart does not lose them, and the tills catch up when they return.
`,
  followUps: [
    {
      q: 'Why not have the System API call both subscribers?',
      a: 'Then it must know every subscriber, and a slow or failed one can hold it up. Each new subscriber would also mean a code change.',
    },
    {
      q: 'What is the Anypoint MQ name for a topic?',
      a: 'An exchange. You bind one queue to it for each subscriber, so a subscriber that is down can catch up from its own queue.',
    },
  ],
}

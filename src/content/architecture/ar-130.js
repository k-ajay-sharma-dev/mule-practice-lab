import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-130',
  category: 'architecture',
  title: 'A Topic Fanning Out to Two Subscribers',
  level: 'BEGINNER',
  tags: ['messaging', 'pub-sub', 'fan-out', 'async', 'event-driven'],
  estMinutes: 10,
  diagram: {
    task: 'draw one price change reaching two subscribers. Use five boxes: an ERP, a System API, a Topic / exchange, and two Process API boxes, one for each subscriber. Draw a Sync call line from the ERP to the System API. Draw Async message lines from the System API to the Topic, and from the Topic to each Process API. Draw no line from the System API to a Process API.',
    checks: [
      { label: 'Price changes leave the ERP and reach the topic', rule: { type: 'path', from: 'erp', to: 'topic' } },
      { label: 'The System API publishes to the topic', rule: { type: 'edge', from: 'system-api', to: 'topic', kind: 'async' } },
      { label: 'There are two subscribers', rule: { type: 'node', match: 'process-api', min: 2 } },
      { label: 'Every subscriber gets its messages from the topic', rule: { type: 'each', of: 'process-api', edgeFrom: 'topic', kind: 'async' } },
      { label: 'The publisher never calls a subscriber directly', rule: { type: 'no-edge', from: 'system-api', to: 'process-api' } },
    ],
    reference: diagram(
      {
        erp: ['erp', 'ERP'],
        sys: ['system-api', 'Price System API (publisher)'],
        top: ['topic', 'price-changed'],
        web: ['process-api', 'Website prices (subscriber)'],
        pos: ['process-api', 'Store tills (subscriber)'],
      },
      ['erp -> sys', 'sys ~> top', 'top ~> web', 'top ~> pos'],
    ),
  },
  description: `
A retailer changes prices in its **ERP**, the main business system. The website and the store tills both need each new price.

A **topic** delivers one message to many readers. The sender is the **publisher**. Each reader is a **subscriber**, and each one gets its own copy. Sending one message to many readers is called **fan out**.

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

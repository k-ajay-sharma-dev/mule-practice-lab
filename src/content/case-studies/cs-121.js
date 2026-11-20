export default {
  id: 'cs-121',
  category: 'case-studies',
  title: 'Restaurant Chain Sending Online Orders to 900 Kitchens When Store Networks Drop',
  level: 'ADVANCED',
  tags: ['myproject', 'restaurants', 'store-and-forward', 'queues', 'idempotency', 'edge'],
  estMinutes: 45,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Store broadband drops several times a week, sometimes for 20 minutes. How should orders reach the kitchen?',
      options: [
        'A durable queue per store, with each order kept until the store confirms it',
        'A direct call to the store POS, retried 3 times over 30 seconds before failing',
        'One shared queue for all stores, read by a consumer that calls each POS',
        'Orders held in the order API\'s memory until the store answers again',
      ],
      answer: 0,
      explain: 'A durable per store queue keeps orders safe while a store is offline and delivers them in order when it returns. Retries over 30 seconds do not outlast a 20 minute drop. With one shared queue, an offline store\'s orders block or delay the others. Memory is lost on a restart.',
    },
    {
      type: 'single',
      prompt: 'An order is delivered twice after a link comes back, and the kitchen cooks it twice. What prevents this?',
      options: [
        'The store side records each order id it has accepted and ignores a second copy',
        'The queue is set to exactly-once delivery so no copy is ever sent twice',
        'The store connector acknowledges each message before it hands it to the POS',
        'The order API checks for duplicate order ids before it publishes',
      ],
      answer: 0,
      explain: 'Redelivery after a network break is normal in at least once delivery. An idempotent receiver that remembers accepted order ids turns a duplicate into a no-op. No broker gives exactly-once delivery over an unreliable link. Acknowledging first loses the order if the POS call then fails. A check before publishing does not stop the broker redelivering.',
    },
    {
      type: 'multi',
      needsScenario: true,
      prompt: 'The customer app must say whether the kitchen has the order. Which two signals give an honest status?',
      options: [
        'An acknowledgement from the store when the POS has accepted the order',
        'A timer that marks orders as late if no acknowledgement arrives within a few minutes',
        'The time the order was published to the queue',
        'The order total and the payment status',
      ],
      answer: [0, 1],
      explain: 'Only the store can say it has the order. A timer turns silence into an action, such as calling the restaurant or offering a refund. Publishing to the queue says nothing about the kitchen.',
    },
    {
      type: 'match',
      prompt: 'Match each data flow to the pattern that fits it.',
      pairs: [
        ['New online order to one store', 'Per store queue with acknowledgement'],
        ['Menu and price changes to all stores', 'Publish once, each store keeps its own copy'],
        ['Store sales totals to finance', 'Batch upload at the end of the day'],
        ['Item sold out at one store', 'Event from the store to the ordering platform'],
      ],
      explain: 'Orders need guaranteed, ordered delivery to one place. Menu changes go to many. Sales totals can wait. A sold out item must reach the app quickly so customers stop ordering it.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Head office asks for Mule runtimes in every store so orders can be handled locally. What do you advise?',
      options: [
        'Keep the logic central, with a small store connector that receives and acknowledges',
        'Run a Mule runtime in every store, so orders are handled when the link is down',
        'Run Mule runtimes in 30 regional hubs, each serving the stores near it',
        'Let the cloud write orders straight into each POS database over a VPN',
      ],
      answer: 0,
      explain: 'Store hardware is limited and 900 runtimes would need patching, monitoring and licences. A thin connector with durable delivery gives the resilience needed while logic stays in one place. Orders come from the cloud, so a store runtime cannot receive them while the link is down anyway. Regional hubs still sit on the far side of the store link. Writing into the POS database bypasses the POS and still fails when the link drops.',
    },
    {
      type: 'order',
      prompt: 'Order the rollout.',
      items: [
        'Measure how often and how long store links drop',
        'Build the per store queue, acknowledgement and late order timer',
        'Pilot in 20 stores with the worst links',
        'Roll out by region with the old direct path as a fallback',
        'Remove the direct path when acknowledgements look healthy',
      ],
      explain: 'Real outage data sets the design limits, the pilot proves it where it is hardest, and the old path stays until the new one is trusted.',
    },
  ],
  description: `
**Context.** A quick service restaurant chain has **900 restaurants**. Online orders come from its app, its website and three delivery platforms.

| Today | Problem |
|---|---|
| The order API calls each store POS directly over HTTP | When the store link drops, the order fails and the sale is lost |
| No confirmation from the kitchen | Customers wait for food the kitchen never received |
| Menu changes are pushed store by store at night | Sold out items keep being sold online for hours |

**Facts gathered so far**
- Store links drop several times a week, mostly for under 20 minutes.
- Each store has a small in-store server that runs the POS. It has little spare memory.
- The POS vendor offers a local API to create an order and to report sold out items.
- Peak load is Friday evening: about 40 orders a minute at the busiest stores.

**Opinions**
- Head of digital: "Put a Mule runtime in every store."
- Head of stores: "Whatever you do, staff must not see the same order twice."
- Finance: "Every lost online order is lost revenue. Show me how many we lose today."

**Your task.** Design how orders, acknowledgements, menu changes and sold out signals flow between the platforms and the stores. Explain how it behaves when a store is offline.
`,
  answerTemplate: `## Decision

## Order delivery to stores

## Duplicates and acknowledgements

## Menu and sold out flows

## What runs in the store

## Rollout and measures

## Risks
`,
  keyPoints: [
    'Orders go to a durable queue per store, so an offline store loses nothing.',
    'The store side acknowledges each order when the POS accepts it; the app shows that status.',
    'A late order timer turns a missing acknowledgement into an action.',
    'Delivery is at least once, so the store side ignores order ids it has already accepted.',
    'Menu changes are published once and kept by each store; sold out events flow back quickly.',
    'A thin store connector instead of 900 runtimes keeps cost and patching low.',
    'Measure link drops and lost orders first, to size the design and prove the gain.',
  ],
  solution: `
**Decision.** Central integration with durable delivery to each store and a thin store connector.

**Order delivery.** The order API saves the order and publishes it to a queue for that store. The store connector receives from its own queue when the link is up. An order stays on the queue until the POS has accepted it, so a 20 minute drop only delays orders.

**Duplicates and acknowledgements.** Delivery is at least once, so after a drop a message can arrive twice. The connector keeps the ids of accepted orders and ignores repeats. When the POS accepts an order, the connector sends an acknowledgement back, and the app shows "kitchen has your order". If no acknowledgement arrives within a few minutes, a timer alerts the contact centre or offers a refund.

**Menu and sold out.** Menu and price changes are published once, and each store keeps its own copy. Sold out items are events from the store to the ordering platform, so the app hides them within a minute.

**In the store.** A small connector, not a Mule runtime: it receives orders, calls the local POS API and sends acknowledgements. Logic stays central, where it is deployed and patched once.

**Rollout.** Measure drops and lost orders, pilot in the worst connected stores, roll out by region with the old path as a fallback.

**Risks.** Store server capacity, connector updates across 900 stores, and the POS vendor's local API limits at peak.
`,
  followUps: [
    { q: 'Why one queue per store instead of one shared queue?', a: 'Each store must receive only its own orders, in order, and an offline store must not hold up others. A queue per store gives that.' },
    { q: 'How long should orders wait on the queue?', a: 'Not forever. An order that waits past the time a customer would accept should expire and trigger a refund or a call, instead of reaching the kitchen hours late.' },
    { q: 'What does the store connector need to remember?', a: 'The ids of orders it has accepted, for long enough to cover any redelivery window, so a repeat is ignored.' },
    { q: 'How do you prove the change to finance?', a: 'Count orders that failed or were never acknowledged before and after, per store and per week.' },
  ],
}

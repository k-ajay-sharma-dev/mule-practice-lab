import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-056',
  category: 'case-studies',
  title: 'DIY Retailer Modernising Store Integrations for Sites With Unreliable Connectivity',
  level: 'INTERMEDIATE',
  tags: ['retail', 'store-systems', 'activemq', 'jms', 'store-and-forward', 'pricing', 'sap'],
  estMinutes: 45,
  diagram: {
    task: 'draw the store integration: price and promotion changes published once and delivered durably to each store server, the store server applying them to the tills, store sales sent back store-and-forward to a queue, a Process API posting to SAP, and the colleague app using an Experience API.',
    checks: [
      { label: 'Price changes are published once to a topic by a Process API', rule: { type: 'edge', from: 'process-api', to: 'topic', kind: 'async' } },
      { label: 'Stores receive price changes asynchronously (durable delivery, not a nightly file)', rule: { type: 'edge', from: ['topic', 'queue'], to: 'device', kind: 'async' } },
      { label: 'The store server applies prices to the tills locally', rule: { type: 'edge', from: 'device', to: 'pos' } },
      { label: 'Store sales are sent store-and-forward to a central queue', rule: { type: 'edge', from: 'device', to: ['queue', 'event-stream'], kind: 'async' } },
      { label: 'A Process API turns store sales into SAP postings', rule: { type: 'path', from: ['queue', 'event-stream'], to: 'erp', via: 'process-api' } },
      { label: 'SAP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Messages that keep failing go to a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
      { label: 'The colleague app calls an Experience API', rule: { type: 'each', of: 'internal-app', edgeTo: 'experience-api' } },
    ],
    reference: diagram(
      {
        app: ['internal-app', 'Store colleague app'],
        agent: ['device', 'Store server (local broker + agent)'],
        es: ['experience-api', 'exp-store-colleague-api'],
        pd: ['process-api', 'prc-price-distribution'],
        ss: ['process-api', 'prc-store-sales'],
        inv: ['process-api', 'prc-store-inventory'],
        pt: ['topic', 'price-changes (virtual topic)'],
        sq: ['queue', 'store-sales'],
        dlq: ['dlq', 'store-sales DLQ'],
        spr: ['system-api', 'sys-pricing-api'],
        ssap: ['system-api', 'sys-sap-retail-api'],
        pp: ['saas', 'Pricing & promotions engine'],
        sap: ['erp', 'SAP S/4HANA Retail'],
        pos: ['pos', 'Store tills'],
      },
      [
        'pd -> spr', 'spr -> pp', 'pd ~> pt', 'pt ~> agent', 'agent -> pos', 'agent ~> sq', 'sq ~> ss',
        'sq ~> dlq', 'ss -> ssap', 'ssap -> sap', 'app -> es', 'es -> inv', 'inv -> ssap',
      ],
    ),
  },
  description: `
**Context.** A DIY and garden retailer runs 300 stores. About a third are in rural or retail-park locations where the WAN link drops several times a week (4G backup is slow and metered). Each store server downloads a price file and uploads a sales file by FTP overnight.

**The problem today.** When the transfer fails:
- Tills open with yesterday's prices.
- The store's sales arrive in SAP a day late, breaking replenishment.

Weekend promotions are often wrong in a handful of stores.

**Goals**
- Price and promotion changes reach every store within 15 minutes when the link is up, and are applied in order when it comes back.
- Sales and stock movements reach SAP within 30 minutes of the link being available, without loss or duplication.
- Store colleagues can check stock in nearby stores from a handheld app.

**Constraints**
| Item | Detail |
|---|---|
| Store server | One Linux server per store; IT can install software on it |
| Messaging | Central ActiveMQ Classic cluster already operated by the infrastructure team |
| Tills | Read prices from the store server's local database; cannot call central systems |
| Volume | 2–5 million price lines in a big promotional week; ~1.5 million sale lines a day |
| Outages | Store links can be down for up to 2 days |

**Your task.** Propose:
- the store integration design for price distribution, sales upload and the colleague app
- how you handle outages
`,
  answerTemplate: `## Why the FTP batch fails

## Price and promotion distribution

## Sales and stock movements back to SAP

## Behaviour during and after an outage

## Colleague app

## Rollout and operations
`,
  keyPoints: [
    'Put a small broker (or store-and-forward agent) on each store server so messages are persisted locally and forwarded when the link returns, instead of depending on one nightly transfer.',
    'Price changes are published once to a topic; each store gets its own durable queue (ActiveMQ virtual topic) so a store that is offline for two days still receives every change in order.',
    'Messages carry effective dates and sequence numbers, so the store applies prices in the right order and ignores stale ones.',
    'Sales flow back to a central queue and are posted to SAP by a Process API through a System API, with idempotency on store + transaction ID and a DLQ for poison messages.',
    'The colleague app reads central stock through an Experience API; it degrades gracefully to local store data when the link is down.',
  ],
  solution: `
**Phases**
1. **Pilot (10 stores, 2 months).** Install a small ActiveMQ broker on each store server with a network connector to the central cluster (ActiveMQ store-and-forward: messages are persisted locally and forwarded when the bridge reconnects). A store agent (lightweight Mule app or the vendor's agent) consumes price messages and writes them to the local till database.
2. **Price distribution.** \`prc-price-distribution\` polls or receives changes from the pricing engine via \`sys-pricing-api\`, splits by store cluster and publishes to a virtual topic \`VirtualTopic.price-changes\`; each store has its own consumer queue, so changes are kept while a store is offline. Each message has an effective-from date, a price version and a sequence; the agent applies only newer versions.
3. **Sales upload.** Tills write sales locally; the agent publishes them in small batches to the local broker, which forwards to the central \`store-sales\` queue. \`prc-store-sales\` consumes with a transacted \`jms:listener\`, aggregates per store and posts to SAP via \`sys-sap-retail-api\` (POS inbound IDoc or API), using store + till + transaction ID as idempotency key.
4. **Colleague app.** \`exp-store-colleague-api\` → \`prc-store-inventory\` → SAP stock, cached for a few minutes. If the store link is down the app shows local stock only.
5. **Roll out** in waves of 30 stores, rural stores early because they benefit most.

**Outages.** Price changes queue centrally per store; sales queue locally. On reconnect, the backlog drains in order. Alerts when a store queue has not been consumed for more than X hours, and when a store's sales stop arriving.

**Governance.** Store server builds managed centrally (config management), broker versions kept in step; message contracts versioned.

**Risks.** Disk full on a store server during long outages (sizing and alerts), price storms after a big promotion load (throttle publishing, prioritise near-dated changes), poison messages (ActiveMQ redelivery policy then DLQ), operating 300 small brokers (automation, standard configuration).
`,
  followUps: [
    { q: 'Why not let tills call a central price API directly?', a: 'Tills must keep trading when the link is down, so prices must already be in the store. A central API would make each till depend on the WAN.' },
    { q: 'Why a virtual topic instead of a plain topic with durable subscribers?', a: 'Virtual topics give each store a normal queue, which is easier to monitor, can have multiple consumers and fits load balancing and DLQ handling better than durable topic subscriptions.' },
    { q: 'How do you stop an old price overwriting a newer one after an outage?', a: 'Each price carries a version or effective timestamp; the store agent compares it to the stored version and discards older messages.' },
  ],
}

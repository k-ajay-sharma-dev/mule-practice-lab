import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-068',
  category: 'architecture',
  title: 'Hub-and-Spoke Store Connectivity over Unreliable Networks',
  level: 'ADVANCED',
  tags: ['retail', 'activemq', 'jms', 'store-and-forward', 'network-of-brokers', 'oracle', 'resilience'],
  estMinutes: 35,
  diagram: {
    task: 'draw the store-to-HQ hub and spoke: how POS sales reach Oracle through the store and HQ brokers, how failures are isolated, and how price changes flow back to the stores.',
    checks: [
      { label: 'The POS publishes sales asynchronously to a store-local broker', rule: { type: 'edge', from: 'pos', to: ['queue', 'event-stream'], kind: 'async' } },
      { label: 'The store broker forwards to the HQ hub broker (store-and-forward)', rule: { type: 'edge', from: 'queue', to: ['queue', 'event-stream'], kind: 'async' } },
      { label: 'An HQ Process API consumes from the hub', rule: { type: 'edge', from: ['queue', 'event-stream'], to: 'process-api', kind: 'async' } },
      { label: 'Oracle is reached only through a System API', rule: { type: 'only-via', target: ['erp', 'database'], from: 'system-api' } },
      { label: 'The POS never calls HQ APIs directly over the WAN', rule: { type: 'no-edge', from: 'pos', to: ['experience-api', 'process-api', 'system-api'] } },
      { label: 'Messages that keep failing are moved to a dead-letter queue', rule: { type: 'edge', from: ['process-api', 'queue'], to: 'dlq' } },
      { label: 'Price changes are published from HQ asynchronously', rule: { type: 'edge', from: 'process-api', to: ['topic', 'queue', 'event-stream'], kind: 'async' } },
      { label: 'Price changes reach the store POS', rule: { type: 'path', from: 'process-api', to: 'pos' } },
    ],
    reference: diagram(
      {
        pos: ['pos', 'Store POS (x400 stores)'],
        sq: ['queue', 'Store ActiveMQ: store.sales.out (KahaDB)'],
        hq: ['queue', 'HQ ActiveMQ hub: hq.store.sales'],
        dlq: ['dlq', 'hq.store.sales DLQ'],
        prc: ['process-api', 'prc-store-sales'],
        serp: ['system-api', 'sys-oracle-retail'],
        erp: ['erp', 'Oracle Retail (sales, stock)'],
        price: ['process-api', 'prc-price-distribution'],
        pq: ['queue', 'Hub: store.<id>.prices (per-store, durable)'],
        spq: ['queue', 'Store ActiveMQ: store.prices.in'],
      },
      [
        'pos ~> sq', 'sq ~> hq', 'hq ~> prc', 'prc -> serp', 'serp -> erp', 'prc ~> dlq',
        'price -> serp', 'price ~> pq', 'pq ~> spq', 'spq ~> pos',
      ],
    ),
  },
  description: `
A fashion retailer runs **400 stores across 3 countries**. Each store has a back-office server, a POS system and a **4G-backup broadband link** that drops several times a week (from seconds to a full day). HQ runs **Oracle Retail** and an **ActiveMQ** cluster.

Today stores call an HQ REST API for every sale. When the link drops, the POS queues sales in memory and has lost data twice after a reboot.

Requirements:
- Every sale reaches Oracle **exactly once in effect**, within 5 minutes when the link is up.
- Price and promotion changes (up to 50,000 per night) must reach **every** store, including stores offline at the time.
- A single store that floods the hub (bug, replay of a week of data) must not slow down the other 399.
- Store IT is minimal: anything at the store must be zero-touch.

**Questions:**
- Draw the topology: what runs in the store, what runs at HQ, how they are connected.
- How does a sale survive an outage and a store reboot?
- How do you keep stores isolated from each other?
- How do price changes reach offline stores, and what if they arrive late?
`,
  answerTemplate: `## Store components

## Store to HQ link (store-and-forward)

## HQ consumption and Oracle

## HQ to store (prices)

## Isolation and operations
`,
  keyPoints: [
    'Hub and spoke with a small persistent ActiveMQ broker per store, connected to an HQ hub by network connectors (network of brokers).',
    'The POS only ever talks to the local broker; persistence on local disk survives both WAN outages and reboots.',
    'HQ consumes from the hub with Mule jms:listener, writes through sys-oracle-retail, and makes the write idempotent (sale id) because forwarding is at-least-once.',
    'Downstream traffic uses durable per-store destinations; price messages carry versions/effective dates so late arrivals do not overwrite newer prices.',
    'Isolation: per-store destinations or message groups, producer flow control and per-store limits, and a DLQ so one bad store or message cannot block the rest.',
  ],
  solution: `
\`\`\`
  STORE (x400)                                   HQ
 ┌──────────────────────────┐            ┌────────────────────────────────────────────┐
 │ POS ─► store.sales.out   │═══ duplex ═►  hq.store.sales ─► prc-store-sales ─► sys-oracle-retail ─► Oracle
 │        (local ActiveMQ,   │  network   │        │                └─► DLQ (after N redeliveries)
 │         KahaDB on disk)   │  connector │  store.<id>.prices ◄─ prc-price-distribution ◄─ Oracle price events
 │ POS ◄─ store.prices.in ◄══╪════════════│                                              │
 └──────────────────────────┘            └────────────────────────────────────────────┘
\`\`\`

**Store.** A lightweight ActiveMQ broker on the back-office server, deployed and configured by an image (zero touch). The POS publishes each sale as a **persistent** message to the local queue; the broker writes it to disk before acknowledging, so a reboot does not lose it.

**Store → HQ.** A **duplex network connector** from the store broker to the HQ hub (the store dials out, so no inbound firewall holes at the store). When the link is down, messages simply accumulate locally; when it returns they are forwarded. Forwarding is at-least-once, so the HQ consumer must be idempotent.

**HQ consumption.** \`prc-store-sales\` uses a \`jms:listener\` on the hub queue with MANUAL ack (or a transaction). It calls \`sys-oracle-retail\`, which does an Oracle **MERGE keyed by store id + transaction id** (duplicate = no-op). After the configured redelivery limit, poison messages go to a **DLQ** with the store id in the properties for triage.

**HQ → stores.** \`prc-price-distribution\` publishes to a **durable per-store destination** (\`store.<id>.prices\`) that the network connector forwards when the store is online. Messages carry \`priceVersion\` and \`effectiveFrom\`; the store applies only versions newer than what it has. A JMS expiration can drop superseded messages for stores offline for days, followed by a full price snapshot on reconnect.

**Isolation.**
- One store's backlog lives in **its own** destination or is spread with message groups (\`JMSXGroupID\` = store id) so a flood from one store cannot starve the others' ordering.
- Producer flow control and memory/store limits on the hub, plus per-store monitoring of forward backlog age.
- The HQ consumer has bounded concurrency; Oracle is protected by the System API.

**Trade-offs:** 400 brokers to monitor (automate with templates and central metrics), duplicate deliveries to handle, and network-of-brokers tuning (TTL/hops, duplex, conduit subscriptions) that the team must learn.
`,
  followUps: [
    { q: 'Why not let the store Mule app call HQ with until-successful?', a: 'until-successful keeps state in memory (or a non-durable store) and blocks a thread; a reboot during a long outage loses data. A persistent local broker survives both and decouples the POS from the WAN entirely.' },
    { q: 'How do you rebuild a store whose disk died?', a: 'Sales still on that disk are lost unless the POS also keeps its own journal; mitigate with the POS journal or RAID. For downstream data, trigger a full price/promotion snapshot to the store queue on re-provisioning.' },
    { q: 'Would you put the stores directly on the HQ broker over the WAN instead of a local broker?', a: 'Only with a client that can buffer offline; a plain JMS client connected to a remote broker cannot send while disconnected, which is exactly the failure we must handle.' },
  ],
}

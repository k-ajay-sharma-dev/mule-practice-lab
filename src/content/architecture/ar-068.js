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
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: ['queue', 'topic', 'event-stream', 'cloud-queue', 'dlq'], kind: 'async' } },
      { label: 'Sales pass a store broker and then the HQ hub broker, so a WAN outage loses nothing', rule: { type: 'path', from: 'pos', via: ['queue', 'event-stream'], to: ['queue', 'event-stream'], kind: 'async' } },
      { label: 'Every sale reaches Oracle through the brokers and the System API', rule: { type: 'path', from: 'pos', via: 'system-api', to: ['erp', 'database'] } },
      { label: 'The POS gets prices only from a broker, never from a call over the WAN', rule: { type: 'only-via', target: 'pos', from: ['queue', 'topic', 'event-stream'] } },
      { label: 'Price changes reach the POS as async messages all the way', rule: { type: 'path', from: 'process-api', to: 'pos', kind: 'async' } },
      { label: 'Every System API connects to its backend', rule: { type: 'each', of: 'system-api', edgeTo: ['erp', 'database'] } },
      { label: 'APIs call each other with sync calls. Async work goes through a broker', rule: { type: 'lines', from: 'process-api', to: 'system-api', kind: 'sync' } },
    ],
    reference: diagram(
      {
        pos: ['pos', 'Store POS (x400 stores)'],
        sq: ['queue', 'Store ActiveMQ: store.sales.out (KahaDB)'],
        hq: ['queue', 'HQ ActiveMQ hub: hq.store.sales'],
        dlq: ['dlq', 'hq.store.sales DLQ'],
        prc: ['process-api', 'prc-store-sales', { vCores: '0.2' }],
        serp: ['system-api', 'sys-oracle-retail', { vCores: '0.2', rateLimit: 80 }],
        erp: ['erp', 'Oracle Retail (sales, stock)'],
        price: ['process-api', 'prc-price-distribution', { vCores: '0.2' }],
        pq: ['queue', 'Hub: store.<id>.prices (per-store, durable)'],
        spq: ['queue', 'Store ActiveMQ: store.prices.in'],
      },
      [
        'pos ~> sq', 'sq ~> hq', 'hq ~> prc', 'prc -> serp', 'serp -> erp', 'prc ~> dlq',
        'price -> serp', 'price ~> pq', 'pq ~> spq', 'spq ~> pos',
      ],
    ),
    simulation: {
      systems: [{ match: 'erp', latencyMs: 200, maxRps: 100 }],
      tests: [
        {
          name: 'A store replays a week of sales',
          about: 'The stores send 30 sales a second. For five minutes a store with a bug replays its sales at 300 a second more. The hub absorbs the flood, Oracle never gets more than the 90 writes a second the DBA allows, and the backlog is gone before the run ends.',
          traffic: [{ name: 'sales', from: 'pos', rps: 30, to: 'erp', kind: 'write', spikes: [{ at: 2, forMin: 5, rps: 330 }] }],
          durationMin: 45,
          expect: { answers: [{ minSuccess: 0.99 }], peakRps: [{ node: 'erp', max: 90 }], vCores: { max: 2 }, backlog: [{ queue: 'queue', maxEnd: 100 }], lost: { max: 0 } },
        },
        {
          name: 'Oracle is down and the brokers restart',
          about: 'Oracle Retail is down for 20 minutes, and in the middle of it the brokers restart for patching. The tills keep selling, no sale is lost, and the backlog reaches Oracle once it is back.',
          traffic: [{ name: 'sales', from: 'pos', rps: 30, to: 'erp', kind: 'write' }],
          incidents: [{ down: 'erp', at: 5, forMin: 20 }, { restart: 'queue', at: 15 }],
          durationMin: 50,
          expect: { answers: [{ minSuccess: 0.99 }], backlog: [{ queue: 'queue', maxEnd: 100 }], lost: { max: 0 }, dlq: { max: 0 } },
        },
        {
          name: 'Price changes reach an offline store',
          about: 'HQ publishes the nightly price changes at 80 a second for ten minutes while the store is offline for 30 minutes, and its broker restarts. Every price change still reaches the store POS.',
          traffic: [{ name: 'prices', from: { type: 'process-api', label: 'price' }, rps: 80, forMin: 10, to: 'pos', kind: 'write' }],
          incidents: [{ down: 'pos', forMin: 30 }, { restart: 'queue', at: 20 }],
          durationMin: 45,
          expect: { delivered: [{ to: 'pos', min: 0.99 }], backlog: [{ queue: 'queue', maxEnd: 100 }], lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
A fashion retailer runs **400 stores across 3 countries**. Each store has a back-office server, a POS system and a **4G-backup broadband link** that drops several times a week (from seconds to a full day). HQ runs **Oracle Retail** and an **ActiveMQ** cluster.

Today stores call an HQ REST API for every sale. When the link drops, the POS queues sales in memory and has lost data twice after a reboot.

Requirements:
- Every sale reaches Oracle **exactly once in effect**, within 5 minutes when the link is up.
- Price and promotion changes (up to 50,000 per night) must reach **every** store, including stores offline at the time.
- A single store that floods the hub (bug, replay of a week of data) must not slow down the other 399.
- Store IT is minimal: anything at the store must be zero-touch.

Numbers for sizing:
- At peak the stores send **30 sales a second** in total. A store with a bug once replayed a week of sales at **300 a second** on top of that for five minutes.
- Oracle Retail takes about **200 ms** per write and accepts at most **100 writes a second**. The DBA wants the integration to stay at **90 a second or less**, so Oracle keeps room for its own jobs.
- Oracle can be down for **20 minutes**, and the brokers restart for patching.
- The nightly price run publishes **80 changes a second** for ten minutes; a store can be offline for 30 minutes of it.
- The budget for the HQ Mule apps is **2 vCores**.

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
    'Persistent queues survive broker restarts; a rate limit on the Oracle System API makes the hub drain a flood at a pace Oracle can take.',
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

**Sizing and failure handling.**
- Every broker queue is **persistent**, so a broker restart during an outage loses nothing.
- \`prc-store-sales\` and \`sys-oracle-retail\` run on 0.2 vCore each (about 100 requests a second). A rate limit of 80 a second on \`sys-oracle-retail\` keeps Oracle under the 90 writes a second the DBA allows, so a replay drains from the hub at about 50 sales a second over the normal load instead of hitting Oracle at once.
- \`prc-price-distribution\` needs 0.2 vCore for 80 price changes a second. The per-store queues hold them while a store is offline.
- In total 0.6 vCore, well inside the 2 vCore budget.

**Trade-offs:** 400 brokers to monitor (automate with templates and central metrics), duplicate deliveries to handle, and network-of-brokers tuning (TTL/hops, duplex, conduit subscriptions) that the team must learn.
`,
  followUps: [
    { q: 'Why not let the store Mule app call HQ with until-successful?', a: 'until-successful keeps state in memory (or a non-durable store) and blocks a thread; a reboot during a long outage loses data. A persistent local broker survives both and decouples the POS from the WAN entirely.' },
    { q: 'How do you rebuild a store whose disk died?', a: 'Sales still on that disk are lost unless the POS also keeps its own journal; mitigate with the POS journal or RAID. For downstream data, trigger a full price/promotion snapshot to the store queue on re-provisioning.' },
    { q: 'Would you put the stores directly on the HQ broker over the WAN instead of a local broker?', a: 'Only with a client that can buffer offline; a plain JMS client connected to a remote broker cannot send while disconnected, which is exactly the failure we must handle.' },
  ],
}

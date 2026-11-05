export default {
  id: 'ar-067',
  category: 'architecture',
  title: 'Store-to-HQ Messaging: ActiveMQ, Anypoint MQ or Kafka',
  level: 'INTERMEDIATE',
  tags: ['retail', 'supply-chain', 'activemq', 'jms', 'anypoint-mq', 'kafka', 'messaging'],
  estMinutes: 20,
  quiz: [
    {
      type: 'single',
      prompt: 'A store loses its WAN link for 4 hours on a Saturday. Which design keeps POS sales from being lost and delivers them to HQ when the link returns?',
      options: [
        'A small ActiveMQ broker in the store with persistent messages, forwarding to the HQ broker (store-and-forward) when the link is up',
        'The store Mule app calls the HQ Process API over HTTPS with until-successful (5 retries, 10 s apart)',
        'The POS publishes directly to an Anypoint MQ queue in the cloud',
        'A non-durable JMS topic at HQ that the stores publish to',
      ],
      answer: 0,
      explain: 'Only a **local persistent broker** absorbs hours of outage: messages are written to its store and forwarded when the network connector reconnects. Retries over HTTPS or a direct cloud publish both need the network at the moment of the sale.',
    },
    {
      type: 'match',
      prompt: 'Match each requirement of the retailer to the technology that fits it best.',
      pairs: [
        ['Replay the last 7 days of sales events to rebuild the analytics model', 'Kafka (retained, replayable log)'],
        ['Queue between two CloudHub 2.0 apps with no broker to operate', 'Anypoint MQ (managed queues and exchanges)'],
        ['In-store buffer that forwards to HQ when the WAN returns', 'ActiveMQ network of brokers (store-and-forward)'],
      ],
      explain: 'Kafka keeps a retained log you can re-read; Anypoint MQ is a managed cloud service; ActiveMQ can run as a small broker per store and forward over network connectors.',
    },
    {
      type: 'single',
      prompt: 'A grocery chain has hundreds of stores on broadband links that often go down. An architect proposes that each store POS publishes directly to Anypoint MQ, a cloud message broker. What is the main weakness of this design?',
      options: [
        'Anypoint MQ does not persist messages, so a restart loses them',
        'A store with no internet cannot publish, so it still needs a local buffer',
        'Mule 4 apps cannot consume from Anypoint MQ, so HQ would need a bridge',
        'Anypoint MQ works only between CloudHub apps, so a POS cannot connect',
      ],
      answer: 1,
      explain: 'Anypoint MQ is a durable managed broker and Mule consumes it natively, but it is a cloud service and needs internet at the moment of publishing. Offline stores still need a local persistent buffer. There are smaller concerns too: every store needs its own client credentials and outbound HTTPS access, and usage is metered on messages and API requests, so chatty publishing from hundreds of stores adds cost.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'An architect proposes a Kafka cluster in every store "for consistency with HQ". What is the strongest objection?',
      options: [
        'A production Kafka cluster needs several brokers plus controller quorum to be highly available — far too heavy to operate in 400 back offices',
        'Kafka cannot store messages on disk',
        'Kafka does not support ordering at all',
        'Mule 4 has no Kafka connector',
      ],
      answer: 0,
      explain: 'Kafka is excellent at HQ for high-volume fan-out and replay, but a resilient cluster per store is an operational burden. A single lightweight broker per store with store-and-forward is the usual edge pattern.',
    },
    {
      type: 'single',
      prompt: 'HQ sends price changes to all 400 stores. Some stores are offline when the change is published. How should HQ publish so that every store still receives it?',
      options: [
        'Durable delivery per store: a queue per store (or a virtual topic with one consumer queue per store) that is forwarded when the store reconnects',
        'A plain non-durable JMS topic — offline stores catch up from the next price file',
        'HTTP POST to each store with a 30 s timeout',
        'Anypoint MQ FIFO queue shared by all stores so they compete for messages',
      ],
      answer: 0,
      explain: 'Non-durable topic subscribers miss messages sent while they are offline, and a single shared queue would deliver each price change to only ONE store. Each store needs its own durable destination.',
    },
    {
      type: 'order',
      prompt: 'Put the journey of a POS sale into HQ Oracle in order (store-and-forward design).',
      items: [
        'POS app publishes the sale as a persistent message to the in-store ActiveMQ queue',
        'The store broker writes it to its local store (KahaDB) and acknowledges the producer',
        'When the WAN is up, the network connector forwards the message to the HQ broker',
        'The HQ Mule app (jms:listener) consumes it and calls sys-oracle-retail',
        'After Oracle commits, the message is acknowledged and removed from the HQ queue',
      ],
      explain: 'Each hop hands over responsibility only after the next one has persisted the message, which is what makes store-and-forward safe across outages.',
    },
  ],
  description: `
A grocery chain has **400 stores** and an HQ data centre running **Oracle Retail** and a growing set of Mule apps on **CloudHub 2.0**. Today each store's back-office PC uploads a sales CSV over SFTP every night.

The business wants:
- POS sales, store receipts and stock counts at HQ **within minutes**, not overnight.
- Price and promotion changes pushed **from HQ to every store**.

Facts:
- Store WAN links are cheap broadband: **outages of minutes to hours** happen weekly.
- A small central integration team (4 people) and one store-IT team.

Three options are on the table: **ActiveMQ** (one already runs at HQ for the WMS), **Anypoint MQ**, and **Kafka** (the analytics team wants it).

**Questions:**
- Which broker(s) would you use at the store, between store and HQ, and inside HQ? Why?
- How do sales survive a WAN outage?
- How do price changes reach stores that are offline when they are published?
`,
  answerTemplate: `## Store edge

## Store to HQ transport

## Inside HQ

## Offline stores (both directions)
`,
  keyPoints: [
    'The deciding constraint is intermittent store connectivity: the store needs a local persistent buffer.',
    'ActiveMQ fits the edge: a lightweight broker per store with network connectors that store-and-forward to the HQ hub.',
    'Anypoint MQ suits cloud-to-cloud decoupling between CloudHub apps but is a cloud service — it cannot replace a local buffer.',
    'Kafka fits HQ for high-volume fan-out and replay to analytics, not as a cluster in every store.',
    'HQ-to-store messages need durable per-store delivery (queue per store or virtual topic), not a non-durable topic.',
  ],
  solution: `
**Recommendation: use each broker where its strengths matter.**

\`\`\`
 STORE (x400)                         HQ
 POS ──► ActiveMQ (local, KahaDB) ═══► ActiveMQ hub ──► Mule prc-store-sales ──► sys-oracle-retail ──► Oracle
                 ▲   network connector          │
                 └══ store.<id>.prices ◄────────┘ prc-price-distribution
                                                 └──► (optional) Kafka for analytics fan-out / replay
\`\`\`

**Store edge — ActiveMQ.** A single small broker per store (or the store's existing server) accepts persistent messages from the POS even when the WAN is down. It is cheap to run, speaks JMS (and other protocols such as STOMP/AMQP/MQTT for non-Java POS software) and supports **network connectors** that forward messages to the hub when connectivity is available.

**Store → HQ — network of brokers.** Messages move from the store broker to the HQ hub over a duplex network connector. Each hop only drops the message after the next broker has persisted it. The HQ Mule app consumes from the hub with a \`jms:listener\` and calls the Oracle System API.

**Inside HQ.**
- Keep ActiveMQ as the hub, since stores already speak it.
- **Anypoint MQ** is a good fit for decoupling CloudHub apps from each other (no broker to patch), but stores should not depend on it directly: it needs internet at the moment of publishing, and 400 sets of credentials.
- **Kafka** is justified if analytics need high-volume fan-out and **replay**; a Mule app (or a broker bridge) can publish canonical sales events from the hub into Kafka. Running Kafka in every store would be heavy to operate.

**HQ → stores.** Price changes go to a **durable per-store destination**: a queue per store, or a virtual topic where each store has its own consumer queue. Changes are forwarded when the store reconnects. A non-durable topic loses messages for offline stores; one shared queue gives each message to only one store.

**Trade-offs to state:** two broker technologies to run instead of one; network-of-brokers configuration needs care (duplex connectors, TTLs on price messages so stale prices are not applied, monitoring of forward backlogs per store).
`,
  followUps: [
    { q: 'A store is offline for 3 days; when it reconnects it receives 40 price changes for the same SKU. What do you do?', a: 'Give price messages an effective date and version and let the store apply only the latest per SKU; optionally set a JMS expiration so superseded messages are discarded rather than replayed.' },
    { q: 'How do you monitor 400 store brokers with a small team?', a: 'Expose broker metrics (queue depth, forward backlog, store usage) via JMX/Jolokia or the broker metrics plugin into central monitoring, and alert on per-store backlog age rather than on every disconnect.' },
    { q: 'Could the store just write to a local database table instead of a broker?', a: 'Yes — a local outbox table plus a forwarding job is a valid store-and-forward design; the broker gives you delivery, retries and acknowledgement out of the box, the table gives you simpler tooling. Either way the buffer must be local and persistent.' },
  ],
}

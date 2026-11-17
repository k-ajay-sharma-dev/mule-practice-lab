import { diagram } from '../../arch/dsl.js'

const reads = [
  { name: 'web shop', from: 'web-app', rps: 400, to: { type: 'database', label: 'web' } },
  { name: 'store tills', from: 'internal-app', rps: 200, to: { type: 'database', label: 'store' } },
  { name: 'marketplaces', from: 'partner', rps: 100, to: { type: 'database', label: 'marketplace' } },
]

export default {
  id: 'ar-144',
  category: 'architecture',
  title: 'Nine Systems Hammering a Product Master: Event-Carried State Transfer, a Compacted Topic and Local Read Copies',
  level: 'EXPERT',
  tags: ['event-carried-state-transfer', 'kafka', 'log-compaction', 'read-models', 'decoupling', 'retail'],
  estMinutes: 60,
  diagram: {
    task: 'draw the product data flow: one change publisher that reads the PIM and publishes every product change to a compacted Kafka topic, and three consumer Process APIs (web shop, store tills, marketplaces) that each keep their own read copy of the catalogue and answer their channel\'s Experience API from it.',
    checks: [
      { label: 'Only the change publisher talks to the PIM', rule: { type: 'only-via', target: 'saas', from: ['batch-job', 'system-api'] } },
      { label: 'The publisher puts product changes on an event stream', rule: { type: 'edge', from: ['batch-job', 'system-api'], to: 'event-stream', kind: 'async' } },
      { label: 'At least three consumers read the product stream, each getting every change', rule: { type: 'each', of: 'event-stream', edgeTo: 'process-api', kind: 'async', count: 3 } },
      { label: 'Each consumer keeps exactly one read copy of its own', rule: { type: 'each', of: 'process-api', min: 3, edgeTo: { type: 'database', label: ['copy', 'catalogue'] }, max: 1 } },
      { label: 'No read copy is shared between consumers', rule: { type: 'each', of: { type: 'database', label: ['copy', 'catalogue'] }, edgeFrom: 'process-api', max: 1 } },
      { label: 'No channel reaches the PIM with sync calls at request time', rule: { type: 'no-path', from: ['web-app', 'internal-app', 'partner'], to: 'saas', kind: 'sync' } },
      { label: 'Each channel has its own Experience API', rule: { type: 'each', of: ['web-app', 'internal-app', 'partner'], min: 3, edgeTo: 'experience-api', max: 1 } },
      { label: 'Each Experience API reads through a consumer Process API', rule: { type: 'each', of: 'experience-api', min: 3, edgeTo: 'process-api' } },
      { label: 'Every line into or out of Kafka is async', rule: { type: 'lines', touching: 'event-stream', kind: 'async' } },
    ],
    reference: diagram(
      {
        pim: ['saas', 'Product information management (PIM)'],
        pub: ['batch-job', 'Product change publisher (reads the PIM change feed every minute)', { vCores: '1' }],
        topic: ['event-stream', 'product-catalogue (compacted, key = productId)'],
        web: ['web-app', 'Web shop'],
        expW: ['experience-api', 'exp-web-shop-api', { vCores: '1' }],
        prcW: ['process-api', 'prc-web-catalogue (consumer)', { vCores: '1' }],
        dbW: ['database', 'Web catalogue read copy'],
        till: ['internal-app', 'Store till app'],
        expS: ['experience-api', 'exp-store-api', { vCores: '0.5' }],
        prcS: ['process-api', 'prc-store-catalogue (consumer)', { vCores: '0.5' }],
        dbS: ['database', 'Store catalogue read copy'],
        mkt: ['partner', 'Marketplaces'],
        expM: ['experience-api', 'exp-marketplace-feed-api', { vCores: '0.5' }],
        prcM: ['process-api', 'prc-marketplace-catalogue (consumer)', { vCores: '0.5' }],
        dbM: ['database', 'Marketplace catalogue read copy'],
      },
      [
        'pub -> pim', 'pub ~> topic',
        'topic ~> prcW', 'topic ~> prcS', 'topic ~> prcM',
        'web -> expW', 'expW -> prcW', 'prcW -> dbW',
        'till -> expS', 'expS -> prcS', 'prcS -> dbS',
        'mkt -> expM', 'expM -> prcM', 'prcM -> dbM',
      ],
    ),
    simulation: {
      systems: [
        { match: 'saas', latencyMs: 300, maxRps: 100 },
        { match: 'database', latencyMs: 5 },
      ],
      tests: [
        {
          name: 'Saturday peak',
          about: 'The web shop, the tills and the marketplaces read 700 products a second in total. Every read is answered from a local copy and no read reaches the PIM.',
          traffic: reads,
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 200 }], notReached: [{ node: 'saas' }] },
        },
        {
          name: 'The PIM is down for two hours',
          about: 'The PIM vendor has an outage during trading. Reads go on as before from the local copies. Only new product changes wait.',
          traffic: reads,
          incidents: [{ down: 'saas', at: 10, forMin: 120 }],
          durationMin: 150,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
        {
          name: 'A price change for the whole range',
          about: 'A new price list changes 300 products a second for 20 minutes. The publisher puts every change on the topic, and all three read copies get every change and are up to date within the run.',
          traffic: [{ name: 'changes', from: ['batch-job', 'system-api'], rps: 300, forMin: 20, to: [{ type: 'database', label: 'web' }, { type: 'database', label: 'store' }, { type: 'database', label: 'marketplace' }], kind: 'write' }],
          durationMin: 40,
          expect: {
            delivered: [
              { to: { type: 'database', label: 'web' }, min: 0.99 },
              { to: { type: 'database', label: 'store' }, min: 0.99 },
              { to: { type: 'database', label: 'marketplace' }, min: 0.99 },
            ],
            backlog: [{ queue: 'event-stream', maxEnd: 0 }],
            lost: { max: 0 },
          },
        },
      ],
    },
  },
  description: `
A DIY retail chain keeps its **400,000 products** in a SaaS **PIM** (product information management) system. Nine systems need product data: the web shop, the store tills, three marketplaces, search, pricing, the warehouse and the data team. Each one calls \`sys-pim-api\` when it needs a product.

Facts:
- On Saturdays the callers send about **700 product reads a second**. The PIM licence allows **100 calls a second**, and the PIM answers in about 300 ms.
- The team added caches with a one hour time to live. Hit rates are good, but a product that is blocked for safety reasons can still be sold for up to an hour. The rule is: **a change must reach every channel within 5 minutes**.
- The PIM offers a **change feed**: "every product changed since time T", with the full product each time.
- The PIM vendor had two outages last year, of 2 and 3 hours. The web shop could not show products during both.
- A new marketplace is due next quarter. It needs the **whole catalogue** on its first day.
- The company already runs a managed Kafka service.

**Questions:**
- Draw a design where no channel depends on the PIM at request time.
- How does a product change reach each channel, and how fast?
- How does the new marketplace get all 400,000 products on day one?
- What can go wrong with local copies, and how do you deal with it?
`,
  answerTemplate: `## Design

## How a change travels

## Loading a new consumer

## Ordering, duplicates and deletes

## What can go wrong

## When not to use this
`,
  keyPoints: [
    'Event-carried state transfer: each event holds the full product, so consumers never call back to the PIM to fill in details.',
    'One publisher reads the PIM change feed. The PIM sees one reader instead of nine, far under its 100 calls a second.',
    'Each consumer keeps its own read copy, shaped for its channel. Reads never leave the consumer, so a PIM outage does not stop sales.',
    'Key the topic by productId, so every change to one product lands on one partition, in order.',
    'Turn on log compaction: Kafka keeps at least the latest event for every key, so a new consumer reads the topic from the start and gets the whole catalogue.',
    'Deletes are events too: a tombstone (the key with no value) tells consumers to remove the product, and compaction removes it from the topic later.',
    'Consumers must be idempotent and keep the newest version, comparing a version or change time, because a restart replays events.',
    'The copies are eventually consistent. Here the rule is 5 minutes, and a feed read every minute meets it. Data that must be exact at the moment, such as stock for the last unit, still needs a live check.',
  ],
  solution: `
**Design**
\`\`\`
PIM ◄─ Product change publisher ~► product-catalogue (Kafka, compacted, key = productId)
                                        ~► prc-web-catalogue         ─► Web catalogue read copy
                                        ~► prc-store-catalogue       ─► Store catalogue read copy
                                        ~► prc-marketplace-catalogue ─► Marketplace catalogue read copy
Web shop    ─► exp-web-shop-api         ─► prc-web-catalogue
Store tills ─► exp-store-api            ─► prc-store-catalogue
Marketplaces ─► exp-marketplace-feed-api ─► prc-marketplace-catalogue
\`\`\`

**How a change travels.**
1. Every minute the publisher asks the PIM change feed for products changed since its last checkpoint, and keeps the checkpoint only after the events are published.
2. It publishes one event per product, keyed by \`productId\`, holding the full product and a \`version\`.
3. Each consumer reads the topic in its own consumer group and upserts the product into its read copy if the version is newer than the one it has.
4. A change reaches every channel in about a minute plus processing, well within 5 minutes.

**Loading a new consumer.** The topic is **compacted**, so Kafka keeps the latest event for each product however old it is. The new marketplace consumer starts with a new consumer group from the earliest offset, reads about 400,000 events, and then carries on with live changes. Nobody runs a bulk export from the PIM.

**Ordering, duplicates and deletes.**
- All events for one product share a key, so they stay in order on one partition.
- After a restart a consumer may see an event again. The version check makes that harmless.
- A product taken off sale is first published with its blocked flag, so every channel stops selling it. A product removed from the catalogue is published as a tombstone, and each consumer deletes it from its copy.

**What can go wrong.**
- A consumer falls behind: monitor consumer lag in seconds for each group, and alert well before 5 minutes.
- A read copy is lost or corrupted: rebuild it from the compacted topic, as for a new consumer.
- The PIM is down: reads go on, and the publisher catches up from its checkpoint when the PIM returns.
- A bad event: the consumer parks it with the error and goes on, so one product does not stop the stream.

**Sizing.** The publisher needs 1 vCore to publish a full price change of 300 products a second. Each consumer must apply those changes too, so none can stay at the smallest size, and the web consumer also answers 400 reads a second.

**When not to use this.** For a handful of callers and a PIM that can carry the load, a cache with a short time to live is simpler. Here nine systems, an hour of stale safety data and a rate limit make the copies worth their cost.
`,
  followUps: [
    {
      q: 'Why not let each system call the change feed itself?',
      a: 'Nine pollers mean nine checkpoints to manage and nine times the calls on the PIM. One publisher and a topic give every system the same events, in the same order, and a new system needs no PIM access at all.',
    },
    {
      q: 'Why put the full product in each event, not only the productId?',
      a: 'With only the ID, every consumer would call the PIM for the details, and you are back to 700 calls a second. A full event lets each consumer work alone.',
    },
    {
      q: 'Does compaction keep only one event per product?',
      a: 'It keeps at least the latest one. Older events for the same key are removed in the background, so a reader can still see a few older versions. That is why consumers compare versions.',
    },
    {
      q: 'What if one consumer only needs 10 of the 200 product fields?',
      a: 'It still reads the full event and stores only what it needs. Its read copy is shaped for its channel, which is one of the benefits of keeping a copy per consumer.',
    },
  ],
}

import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-058',
  category: 'case-studies',
  title: 'Grocery Chain Replacing a Point-to-Point ActiveMQ and Oracle Estate With API-Led and Events',
  level: 'ADVANCED',
  tags: ['retail', 'supply-chain', 'activemq', 'jms', 'oracle', 'api-led', 'events', 'migration'],
  estMinutes: 55,
  diagram: {
    task: 'draw the target state: channels on Experience APIs, item/price and fulfilment Process APIs, the Oracle merchandising database and the WMS behind System APIs, item and price changes published once to a topic for POS, WMS, analytics and a legacy bridge, and a DLQ for failed deliveries.',
    checks: [
      { label: 'The e-commerce site and the store app each call an Experience API', rule: { type: 'each', of: ['web-app', 'internal-app'], min: 2, edgeTo: 'experience-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'The Oracle merchandising database is reached only through a System API (no DB links or shared schemas)', rule: { type: 'only-via', target: 'database', from: 'system-api' } },
      { label: 'The WMS is reached only through a System API', rule: { type: 'only-via', target: 'wms', from: 'system-api' } },
      { label: 'Item and price changes are captured once and published asynchronously', rule: { type: 'edge', from: 'system-api', to: ['topic', 'event-stream'], kind: 'async' } },
      { label: 'One published change fans out to at least three consumers', rule: { type: 'edge', from: ['topic', 'event-stream'], kind: 'async', min: 3 } },
      { label: 'A bridge keeps not-yet-migrated legacy consumers working', rule: { type: 'path', from: ['topic', 'event-stream'], to: 'legacy' } },
      { label: 'Failed deliveries end up on a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'E-commerce site'],
        app: ['internal-app', 'Store colleague app'],
        ew: ['experience-api', 'exp-ecom-api'],
        es: ['experience-api', 'exp-store-api'],
        pi: ['process-api', 'prc-item-price-api'],
        pf: ['process-api', 'prc-order-fulfilment-api'],
        tp: ['topic', 'item-price-changed (VirtualTopic)'],
        dlq: ['dlq', 'Per-consumer DLQs'],
        smer: ['system-api', 'sys-oracle-merch-api'],
        swms: ['system-api', 'sys-wms-api'],
        spos: ['system-api', 'sys-store-pos-api'],
        mer: ['database', 'Oracle merchandising DB'],
        wms: ['wms', 'DC WMS'],
        pos: ['pos', 'Store POS estate'],
        leg: ['legacy', 'Legacy consumers (old queues)'],
        dw: ['data-warehouse', 'Analytics platform'],
      },
      [
        'web -> ew', 'app -> es', 'ew -> pi', 'es -> pi', 'ew -> pf', 'pi -> smer', 'pf -> swms', 'pf -> smer',
        'smer -> mer', 'swms -> wms', 'smer ~> tp', 'tp ~> spos', 'tp ~> swms', 'tp ~> dw', 'tp ~> leg',
        'spos -> pos', 'spos ~> dlq',
      ],
    ),
  },
  description: `
**Context.** A grocery chain (450 stores, 5 DCs, home delivery) has grown its integrations over 15 years. An inventory of the estate found:

| Pattern | Count | Example |
|---|---|---|
| ActiveMQ Classic queues used point to point, each with its own XML format | 140 | \`ITEM.TO.POS.V2\`, \`ITEM.TO.WMS\`, \`ITEM.TO.ECOM\` all carrying the same item change in different shapes |
| Oracle DB links and shared schemas between applications | 60 | The e-commerce platform reads prices straight from the merchandising schema |
| PL/SQL triggers that write to queues via a Java bridge | 35 | A price change fires a trigger that sends to five queues |
| Custom Java consumers on a single VM | 70 | No owner for about half of them |

Item and price changes take between 5 minutes and 24 hours to reach channels, a schema change in merchandising broke e-commerce for a day last quarter, and nobody can say which systems consume a given queue.

**Goals**
- Decouple applications from the Oracle merchandising schema.
- Publish each business change once, in one canonical format, to any number of consumers.
- Move the e-commerce and store app to supported APIs.
- Retire the custom Java consumers and DB links over 18 months without a freeze on business change.

**Constraints**
- Stores and DCs must not lose a price or item change during migration.
- ActiveMQ skills exist in-house; the company is open to ActiveMQ Artemis or Anypoint MQ but not to running Kafka themselves.
- Oracle merchandising stays for at least five years.

**Your task.** Propose the target architecture, migration strategy, governance and the main risks.
`,
  answerTemplate: `## Assessment: what is wrong with the current estate

## Target architecture (API-led plus events)

## Canonical events and contracts

## Migration strategy and sequencing

## Coexistence with legacy consumers

## Governance and ownership

## Risks
`,
  keyPoints: [
    'Start with an inventory: map every queue, DB link, trigger and consumer to an owner and a business capability before designing the target.',
    'System APIs own access to the Oracle merchandising schema and the WMS; DB links and shared-schema reads are replaced one by one.',
    'Business changes (ItemChanged, PriceChanged) are captured once, published in a canonical format to a topic (virtual topic in ActiveMQ) and consumed through per-consumer queues with their own DLQs.',
    'Migrate by business capability (strangler): a bridge republishes canonical events into old queue formats so legacy consumers keep working until they are moved.',
    'Governance: event catalogue with owners and schemas, API contracts in Exchange, and a rule that no new DB link or point-to-point queue is created.',
  ],
  solution: `
**Phases**
1. **Discover (months 0–2).** Catalogue queues (producers, consumers, message counts from broker statistics), DB links and triggers; assign owners; group into capabilities: item and price, stock, orders and fulfilment, store sales. Kill unused queues.
2. **Foundations (months 2–4).** \`sys-oracle-merch-api\` with read APIs for item and price, and change capture: a \`db:listener\` on an outbox table filled by the existing triggers (replacing their Java bridge) with a watermark column, publishing canonical \`ItemChanged\`/\`PriceChanged\` events to \`VirtualTopic.item-price-changed\`. Event schemas published in Exchange.
3. **Item and price capability (months 4–8).** Consumers move one at a time to their own consumer queue: POS (via \`sys-store-pos-api\`), WMS, analytics. A legacy bridge flow subscribes and republishes to the old \`ITEM.TO.*\` queues in their old formats, so nothing changes for consumers not yet migrated. The e-commerce site stops reading the schema and calls \`exp-ecom-api\` → \`prc-item-price-api\`.
4. **Stock and orders (months 8–14).** Same pattern for stock movements and fulfilment (\`prc-order-fulfilment-api\` over \`sys-wms-api\`).
5. **Retire (months 14–18).** Remove the bridge per old queue once its last consumer moves; drop DB links; decommission the Java consumer VM.

**Messaging choice.** Keep ActiveMQ for now (skills, low risk) but move to Artemis or Anypoint MQ as part of the programme; the canonical events and per-consumer queues make the broker replaceable.

**Governance.** Integration design authority with a "no new point-to-point" rule; event catalogue; consumer onboarding is a request to subscribe, not a new queue from the producer; DBA team removes DB links only after the replacing API is live.

**Risks.** Hidden consumers discovered late (broker statistics, temporary logging on old queues before removal), ordering of price changes (sequence numbers per item, consumers ignore older versions), outbox lag at peak (monitoring, index on watermark column), and dual-running costs during the 18 months.
`,
  followUps: [
    { q: 'Why a virtual topic and not one plain JMS topic?', a: 'Each consumer gets its own queue, so a slow or offline consumer builds its own backlog without affecting others, can scale with competing consumers and has its own DLQ.' },
    { q: 'Why keep the existing triggers at all?', a: 'They already know when prices and items change. Pointing them at an outbox table is a small, low-risk change; a CDC tool is an alternative if the DBA prefers to remove triggers.' },
    { q: 'How do you find out who really consumes an old queue?', a: 'Broker consumer statistics and connection details, application logs, and a period of logging on the queue before removal, combined with asking the owners found in the inventory.' },
    { q: 'How do you avoid recreating point-to-point inside Mule?', a: 'Enforce the layers in design reviews, publish canonical events once, and track reuse: new consumers subscribe to existing events or call existing APIs.' },
  ],
}

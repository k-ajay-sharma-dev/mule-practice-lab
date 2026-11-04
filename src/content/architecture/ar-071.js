import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-071',
  category: 'architecture',
  title: 'Oracle Change Events: CDC vs Database Listener Polling',
  level: 'INTERMEDIATE',
  tags: ['supply-chain', 'retail', 'oracle', 'cdc', 'kafka', 'db-listener', 'events'],
  estMinutes: 30,
  diagram: {
    task: 'draw how stock and order changes in Oracle become business events for Shopify, Salesforce and analytics, using change data capture rather than polling.',
    checks: [
      { label: 'Changes are captured from Oracle asynchronously into a stream or queue', rule: { type: 'edge', from: ['database', 'erp'], to: ['event-stream', 'queue', 'topic'], kind: 'async' } },
      { label: 'A Process API consumes the raw change feed', rule: { type: 'edge', from: ['event-stream', 'queue', 'topic'], to: 'process-api', kind: 'async' } },
      { label: 'It publishes canonical business events (not raw row changes)', rule: { type: 'edge', from: 'process-api', to: ['topic', 'event-stream', 'queue'], kind: 'async' } },
      { label: 'Several independent consumers subscribe (fan-out)', rule: { type: 'edge', from: ['topic', 'event-stream', 'queue'], to: 'process-api', min: 3 } },
      { label: 'Shopify and Salesforce are reached only through System APIs', rule: { type: 'only-via', target: ['saas', 'crm'], from: 'system-api' } },
      { label: 'Events that cannot be processed go to a dead-letter queue', rule: { type: 'edge', from: 'process-api', to: 'dlq' } },
      { label: 'Analytics receives Oracle changes end to end', rule: { type: 'path', from: ['database', 'erp'], to: 'data-warehouse' } },
    ],
    reference: diagram(
      {
        db: ['database', 'Oracle (INV_ONHAND, ORDERS)'],
        raw: ['event-stream', 'Kafka cdc.raw.* (GoldenGate / Debezium)'],
        prc: ['process-api', 'prc-inventory-events (map rows to events)'],
        canon: ['topic', 'inventory.changed / order.updated'],
        dlq: ['dlq', 'cdc mapping DLQ'],
        pecom: ['process-api', 'prc-ecommerce-stock-sync'],
        sshop: ['system-api', 'sys-shopify'],
        shop: ['saas', 'Shopify'],
        pcrm: ['process-api', 'prc-crm-order-sync'],
        scrm: ['system-api', 'sys-salesforce'],
        crm: ['crm', 'Salesforce'],
        dw: ['data-warehouse', 'Analytics lake'],
      },
      [
        'db ~> raw', 'raw ~> prc', 'prc ~> canon', 'prc ~> dlq', 'raw ~> dw',
        'canon ~> pecom', 'pecom -> sshop', 'sshop -> shop', 'canon ~> pcrm', 'pcrm -> scrm', 'scrm -> crm',
      ],
    ),
  },
  description: `
A home-improvement retailer keeps stock and orders in a **legacy Oracle 19c** application. The vendor will not add APIs or events. Three consumers need changes:
- **Shopify** stock levels (within 1 minute),
- **Salesforce** order status for the contact centre,
- the **analytics lake** (every change, including deletes).

The first implementation is a Mule \`db:listener\` polling \`INV_ONHAND\` every 10 seconds with a watermark on \`LAST_UPDATED\`. Problems found:
- Some vendor batch jobs **do not update \`LAST_UPDATED\`**, so changes are missed.
- **Deletes are invisible**.
- At 2 million rows, the poll query does full scans; the DBA is unhappy.
- Two updates within the same second sometimes produce only one event.

The DBA offers **Oracle GoldenGate**; a platform engineer suggests **Debezium** (LogMiner-based) into Kafka.

**Questions:**
- Compare db:listener polling with log-based CDC for this case. When is polling still the right choice?
- Draw the target flow from Oracle to all three consumers.
- Why should consumers not receive raw row-change events?
- What new operational concerns does CDC bring?
`,
  answerTemplate: `## Polling vs CDC

## Target flow

## Raw changes vs business events

## Operational concerns
`,
  keyPoints: [
    'db:listener polling depends on a reliable watermark column, misses deletes, adds query load, and has time-resolution gaps; it is fine for small tables you control.',
    'Log-based CDC (GoldenGate, Debezium with LogMiner) reads the redo log: captures every insert/update/delete in commit order without changing the application or polling tables.',
    'Raw CDC records mirror the vendor schema; a Mule Process API maps them to canonical business events so consumers are decoupled from table design.',
    'Publish once to a topic/stream and fan out to independent consumers (Shopify sync, Salesforce sync, analytics), each behind System APIs.',
    'CDC brings new concerns: supplemental logging, DBA privileges, schema-change handling, lag monitoring and initial snapshots.',
  ],
  solution: `
**Polling vs CDC.**

| | db:listener (watermark) | Log-based CDC |
|---|---|---|
| Missed changes | Yes, if the watermark is not maintained | No — reads committed redo |
| Deletes | Invisible (unless soft delete) | Captured |
| Load on Oracle | Repeated queries; needs an index on the watermark | Reads logs; needs supplemental logging |
| Ordering | By watermark value; ties can be lost | Commit order |
| Setup | Mule only | DBA involvement, extra platform (GoldenGate or Kafka Connect) |

Polling remains a good choice for **small tables you own**, with an indexed watermark or a status column you can flip, or as a stop-gap.

**Target flow.**
\`\`\`
 Oracle ──redo──► GoldenGate / Debezium ──► Kafka cdc.raw.INV_ONHAND
                                         │        └──► analytics lake (raw history incl. deletes)
                                         └──► prc-inventory-events (Mule) ─► inventory.changed / order.updated
                                                         └─► DLQ                 ├─► prc-ecommerce-stock-sync ─► sys-shopify
                                                                                 └─► prc-crm-order-sync ─► sys-salesforce
\`\`\`

**Business events, not rows.** Raw CDC records carry before/after images of vendor tables (\`INV_ONHAND.QTY\`, internal codes). \`prc-inventory-events\` translates them into canonical events (\`sku\`, \`location\`, \`availableQty\`, \`sequence\`), filters noise (technical updates), and keys the stream by SKU so per-SKU order is kept. If the vendor changes the table, only this mapper changes.

**Operational concerns.**
- Supplemental logging and LogMiner/GoldenGate privileges — needs DBA buy-in and licensing (GoldenGate is a separate Oracle licence).
- **Initial snapshot** before streaming, and re-snapshot after outages longer than log retention.
- **Lag monitoring** (capture and consumer lag) and alerts.
- Schema changes in the source tables can break the connector or mapping — version the canonical event instead.
- Delivery is at-least-once: consumers must be idempotent.
`,
  followUps: [
    { q: 'You cannot get GoldenGate or Kafka approved this year. How do you make polling safer?', a: 'Ask for (or add) a trigger-fed change table or an indexed, reliably maintained watermark, poll that small table instead of the big one, use soft deletes or a deletion log, and use idColumn plus the watermark to avoid duplicates.' },
    { q: 'Why not let Shopify sync read the raw CDC topic directly?', a: 'It would couple Shopify logic to the vendor tables and duplicate the mapping in every consumer; one mapper producing canonical events keeps consumers stable when the source changes.' },
    { q: 'How do you keep per-SKU order through Kafka and Mule?', a: 'Key the canonical events by SKU (or SKU + location) so they land in one partition, and avoid parallel processing of the same key in the consumer.' },
  ],
}

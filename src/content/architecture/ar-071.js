import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-071',
  category: 'architecture',
  title: 'Oracle Change Events: CDC vs Database Listener Polling',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'supply-chain', 'retail', 'oracle', 'cdc', 'kafka', 'db-listener', 'events'],
  estMinutes: 45,
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
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: ['queue', 'topic', 'event-stream', 'cloud-queue', 'dlq'], kind: 'async' } },
      { label: 'Reads and writes to a data store are sync calls', rule: { type: 'lines', to: ['database', 'oracle-db', 'sql-server', 'cache'], kind: 'sync' } },
      { label: 'Shopify and Salesforce get the canonical events a Process API publishes, never the raw rows', rule: { type: 'path', from: 'process-api', via: ['topic', 'event-stream', 'queue'], to: ['saas', 'crm'], min: 2 } },
      { label: 'Mule does not poll the Oracle tables. Changes come from the log', rule: { type: 'no-edge', from: ['process-api', 'batch-job'], to: ['database', 'erp'] } },
      { label: 'Every System API connects to its backend', rule: { type: 'each', of: 'system-api', edgeTo: ['saas', 'crm'] } },
      { label: 'APIs call each other with sync calls. Async work goes through a broker', rule: { type: 'lines', from: 'process-api', to: 'system-api', kind: 'sync' } },
    ],
    reference: diagram(
      {
        db: ['database', 'Oracle (INV_ONHAND, ORDERS)'],
        raw: ['event-stream', 'Kafka cdc.raw.* (GoldenGate / Debezium)'],
        prc: ['process-api', 'prc-inventory-events (map rows to events)', { vCores: '1' }],
        canon: ['topic', 'inventory.changed / order.updated'],
        dlq: ['dlq', 'cdc mapping DLQ'],
        pecom: ['process-api', 'prc-ecommerce-stock-sync', { vCores: '0.5' }],
        sshop: ['system-api', 'sys-shopify', { vCores: '0.5' }],
        shop: ['saas', 'Shopify'],
        pcrm: ['process-api', 'prc-crm-order-sync', { vCores: '0.5' }],
        scrm: ['system-api', 'sys-salesforce', { vCores: '0.5' }],
        crm: ['crm', 'Salesforce'],
        dw: ['data-warehouse', 'Analytics lake'],
      },
      [
        'db ~> raw', 'raw ~> prc', 'prc ~> canon', 'prc ~> dlq', 'raw ~> dw',
        'canon ~> pecom', 'pecom -> sshop', 'sshop -> shop', 'canon ~> pcrm', 'pcrm -> scrm', 'scrm -> crm',
      ],
    ),
    simulation: {
      systems: [
        { match: 'saas', latencyMs: 300, maxRps: 100 },
        { match: 'crm', latencyMs: 400, maxRps: 100 },
      ],
      tests: [
        {
          name: 'Every change reaches all three consumers',
          about: 'Oracle commits 30 stock and order changes a second. Each one reaches Shopify, Salesforce and the analytics lake, and nothing waits at the end.',
          traffic: [{ name: 'changes', from: 'database', rps: 30, to: ['saas', 'crm', 'data-warehouse'], kind: 'write' }],
          expect: { delivered: [{ to: 'saas', min: 0.99 }, { to: 'crm', min: 0.99 }, { to: 'data-warehouse', min: 0.99 }], backlog: [{ queue: ['topic', 'queue', 'event-stream'], maxEnd: 200 }], lost: { max: 0 } },
        },
        {
          name: 'Salesforce is down for 30 minutes',
          about: 'Salesforce is down for 30 minutes. Shopify and the lake keep up, and the Salesforce backlog drains once it is back, with no change lost.',
          traffic: [{ name: 'changes', from: 'database', rps: 30, to: ['saas', 'crm', 'data-warehouse'], kind: 'write' }],
          incidents: [{ down: 'crm', at: 5, forMin: 30 }],
          durationMin: 60,
          expect: { delivered: [{ to: 'saas', min: 0.99 }, { to: 'crm', min: 0.99 }], backlog: [{ queue: ['topic', 'queue', 'event-stream'], maxEnd: 200 }], lost: { max: 0 } },
        },
        {
          name: 'A vendor batch job changes 72,000 rows',
          about: 'For four minutes a vendor batch job adds 300 changes a second to the normal 30. The mapper and both sync flows work through the burst within the run, inside the 4 vCore budget.',
          traffic: [{ name: 'changes', from: 'database', rps: 30, to: ['saas', 'crm', 'data-warehouse'], kind: 'write', spikes: [{ at: 2, forMin: 4, rps: 330 }] }],
          durationMin: 40,
          expect: { delivered: [{ to: 'saas', min: 0.99 }, { to: 'crm', min: 0.99 }], backlog: [{ queue: ['topic', 'queue', 'event-stream'], maxEnd: 200 }], lost: { max: 0 }, vCores: { max: 4 } },
        },
      ],
    },
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

Numbers for sizing:
- Oracle commits about **30 stock and order changes a second**. Vendor batch jobs add up to **300 a second** for a few minutes (about 72,000 rows). Shopify and Salesforce must be caught up within about **30 minutes** of a burst.
- Shopify answers in about 300 ms and accepts **100 calls a second**; Salesforce answers in about 400 ms and accepts **100 calls a second**.
- Salesforce has maintenance windows of **30 minutes**; no change may be lost. The broker redelivers a failed message about **once a minute**.
- A change that cannot be mapped must be set aside in a dead-letter queue.
- The budget for the Mule apps is **4 vCores**.

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
    'Size each sync flow to send faster than changes arrive, so its copy of the events drains after a batch burst or a Salesforce outage.',
  ],
  solution: `
**Polling vs CDC.**

| | db:listener (watermark) | Log-based CDC |
|---|---|---|
| Missed changes | Yes, if the watermark is not maintained | No: reads committed redo |
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
- Supplemental logging and LogMiner/GoldenGate privileges: needs DBA buy-in and licensing (GoldenGate is a separate Oracle licence).
- **Initial snapshot** before streaming, and re-snapshot after outages longer than log retention.
- **Lag monitoring** (capture and consumer lag) and alerts.
- Schema changes in the source tables can break the connector or mapping. Version the canonical event instead.
- Delivery is at-least-once: consumers must be idempotent.

**Sizing and failure handling.**
- The canonical events go on a **topic**, so each sync flow gets its own copy. On a queue, Shopify and Salesforce would compete and each would see about half of the changes.
- \`prc-inventory-events\` runs on 1 vCore to keep up with a batch burst. Each sync flow (\`prc-ecommerce-stock-sync\` with \`sys-shopify\`, \`prc-crm-order-sync\` with \`sys-salesforce\`) runs on 0.5 vCore per app, so it can send at the full 100 calls a second and catch up after a burst or an outage.
- While Salesforce is down, its copy of the events waits on the topic; Shopify is not affected. No redelivery limit is set on the topic itself (or one well above 30), because with redelivery once a minute a 30 minute outage would push good events out after a few tries. Events the mapper cannot handle go to the DLQ from \`prc-inventory-events\`.
- In total 3 vCores, inside the 4 vCore budget.
`,
  followUps: [
    { q: 'You cannot get GoldenGate or Kafka approved this year. How do you make polling safer?', a: 'Ask for (or add) a trigger-fed change table or an indexed, reliably maintained watermark, and poll that small table instead of the big one. Use soft deletes or a deletion log, and use idColumn plus the watermark to avoid duplicates.' },
    { q: 'Why not let Shopify sync read the raw CDC topic directly?', a: 'It would couple Shopify logic to the vendor tables and duplicate the mapping in every consumer; one mapper producing canonical events keeps consumers stable when the source changes.' },
    { q: 'How do you keep per-SKU order through Kafka and Mule?', a: 'Key the canonical events by SKU (or SKU + location) so they land in one partition, and avoid parallel processing of the same key in the consumer.' },
  ],
}

import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-053',
  category: 'case-studies',
  title: 'Homewares Retailer Replacing a Nightly Oracle Stock Batch With Near-Real-Time Inventory',
  level: 'INTERMEDIATE',
  tags: ['retail', 'supply-chain', 'inventory', 'oracle', 'activemq', 'jms', 'events'],
  estMinutes: 30,
  diagram: {
    task: 'draw the near-real-time inventory flow: store POS and warehouse stock movements sent as messages, one inventory Process API updating Oracle through a System API, stock-changed events fanned out, and the web shop reading stock through an Experience API with a cache.',
    checks: [
      { label: 'Store POS sales and warehouse movements are sent as messages, not a nightly file', rule: { type: 'edge', from: ['pos', 'wms', 'system-api'], to: ['queue', 'topic', 'event-stream'], kind: 'async', min: 2 } },
      { label: 'An inventory Process API consumes the stock movements', rule: { type: 'edge', from: ['queue', 'topic', 'event-stream'], to: { type: 'process-api', label: ['inventory', 'stock'] } } },
      { label: 'The Oracle stock database is reached only through a System API', rule: { type: 'only-via', target: 'database', from: 'system-api' } },
      { label: 'Stock-changed events are published once and fanned out to several consumers', rule: { type: 'edge', from: 'topic', kind: 'async', min: 2 } },
      { label: 'The commerce platform receives stock updates from the events', rule: { type: 'path', from: 'topic', to: 'saas' } },
      { label: 'The web shop reads stock through an Experience API backed by a cache', rule: { type: 'path', from: 'web-app', to: 'cache', via: 'experience-api' } },
      { label: 'A nightly reconciliation job still corrects drift in Oracle', rule: { type: 'path', from: 'batch-job', to: 'database' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Web shop storefront'],
        ew: ['experience-api', 'exp-web-stock-api'],
        inv: ['process-api', 'prc-inventory-api'],
        rec: ['batch-job', 'Nightly stock reconciliation'],
        sq: ['queue', 'stock-movements (ActiveMQ)'],
        tp: ['topic', 'stock-changed (ActiveMQ topic)'],
        sora: ['system-api', 'sys-oracle-stock-api'],
        scom: ['system-api', 'sys-commerce-api'],
        pos: ['pos', 'Store POS (120 stores)'],
        wms: ['wms', 'Warehouse WMS'],
        ora: ['database', 'Oracle merchandising DB'],
        com: ['saas', 'Commerce platform'],
        cache: ['cache', 'Stock cache (Object Store)'],
        dw: ['data-warehouse', 'Sales & stock analytics'],
      },
      [
        'pos ~> sq', 'wms ~> sq', 'sq ~> inv', 'inv -> sora', 'sora -> ora', 'inv ~> tp',
        'tp ~> scom', 'scom -> com', 'tp ~> dw', 'web -> ew', 'ew -> cache', 'ew -> inv', 'rec -> sora',
      ],
    ),
  },
  description: `
**Context.** A homewares retailer with 120 stores, one distribution centre (DC) and a growing web shop keeps stock in an Oracle merchandising database.

**How stock is updated today**
1. Store POS systems upload the day's sales after closing.
2. A PL/SQL batch at 02:00 recalculates stock per store and the DC.
3. A CSV of stock levels is pushed by SFTP to the commerce platform at 06:00.

**The problem today.** By mid-afternoon the website is selling items that sold out in stores that morning. Click-and-collect cancellations are running at 7%.

**Goals**
- Web stock reflects store and DC movements within 5 minutes.
- Cut click-and-collect cancellations caused by stale stock.
- Keep the Oracle merchandising database as the stock system of record.

**Constraints**
| Item | Detail |
|---|---|
| Messaging | The company already runs an ActiveMQ Classic broker pair for a few internal feeds |
| Oracle | DBA team will not allow other systems to write to stock tables directly; all access must use agreed SQL or stored procedures |
| POS | The POS vendor can publish each sale as a JMS message; older tills in 15 stores can only send files every 15 minutes |
| Volume | ~400,000 sale lines a day, 4x on promotional weekends |
| Team | Two Mule developers, first event-driven project |

**Your task.** Propose:
- the target integration for stock movements
- how the website reads stock
- how you keep Oracle accurate
`,
  answerTemplate: `## Current problem in one sentence

## Stock movement flow (POS, DC to Oracle)

## How stock changes reach the web shop

## How the website reads stock

## Reconciliation and error handling

## Rollout plan
`,
  keyPoints: [
    'Replace the once-a-day batch with stock movement messages (sale, return, receipt, adjustment) sent as they happen; older tills send small 15-minute files that are turned into the same messages.',
    'One inventory Process API owns the stock update logic; Oracle is written only through a System API using parameterised SQL or the DBA-approved stored procedure.',
    'After updating Oracle, publish a stock-changed event to a topic so commerce, analytics and later consumers each get their own copy.',
    'The website reads stock through an Experience API with a short-lived cache, so web traffic never hits Oracle directly.',
    'Keep a nightly reconciliation job to correct drift, plus DLQ handling and idempotency on movement IDs so redelivered messages do not double-count.',
  ],
  solution: `
**Phases**
1. **Foundation (weeks 1–4).** \`sys-oracle-stock-api\` wraps the DBA-approved procedure (\`db:stored-procedure\` with IN parameters for SKU, location, quantity delta and movement ID). The JDBC driver is added as a dependency/shared library. Idempotency: the procedure (or a MERGE into a processed-movements table) ignores a movement ID it has already applied.
2. **Movements (weeks 5–8).** POS publishes each sale to the \`stock-movements\` ActiveMQ queue. \`prc-inventory-api\` uses a \`jms:listener\` with MANUAL ack (or a local transaction) so a message is only acknowledged after Oracle commits. The DC WMS sends receipts and picks to the same queue. The 15 older stores drop a file every 15 minutes on SFTP; a small flow splits it into the same movement messages.
3. **Fan-out (weeks 9–10).** After each successful update the Process API publishes \`stock-changed\` (SKU, location, new on-hand) to an ActiveMQ topic. \`sys-commerce-api\` subscribes (durable subscription or a virtual-topic consumer queue) and updates the commerce platform in small batches; analytics subscribes too.
4. **Read path (week 11).** \`exp-web-stock-api\` serves the storefront from an Object Store cache (TTL 60 seconds) and falls back to the Process API on a miss.

**Architecture.** Channels → Experience → Process → messaging → System → Oracle. Nothing outside \`sys-oracle-stock-api\` holds Oracle credentials.

**Migration.** Run the new flow in parallel with the batch for two weeks, comparing the event-driven stock figures with the 02:00 batch output per store. Switch the commerce feed when differences are explained, then turn off the 06:00 CSV. Keep the 02:00 job as a reconciliation that logs and corrects differences.

**Governance.** Message contract for a stock movement agreed with the POS vendor and DC team (fields, movement types, IDs). Alerts on queue depth, DLQ depth and reconciliation differences above a threshold.

**Risks.**
- Double counting on redelivery (idempotent movement IDs).
- Poison messages blocking the queue (ActiveMQ redelivery policy then \`ActiveMQ.DLQ\` or an individual DLQ).
- Oracle contention at peaks (consumer concurrency tuned with the DBA, connection pool sized).
- Commerce rate limits (batch updates).
`,
  followUps: [
    { q: 'Why publish a stock-changed event instead of having the commerce System API read Oracle?', a: 'The event pushes changes as they happen and lets more consumers subscribe later without touching Oracle. Polling Oracle from every consumer adds load and delay.' },
    { q: 'What happens if the same sale message is delivered twice?', a: 'The movement ID is checked before applying the delta (processed-movements table or MERGE), so the second delivery is acknowledged without changing stock.' },
    { q: 'Do you still need the nightly batch?', a: 'Yes, as reconciliation. Missed or late messages, till clock problems and manual adjustments cause drift, so a nightly comparison corrects and reports differences.' },
  ],
}

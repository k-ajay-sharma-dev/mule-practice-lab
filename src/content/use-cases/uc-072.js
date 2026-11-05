import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-072',
  category: 'use-cases',
  title: 'Marketplace Order and Stock Sync (Amazon- and eBay-Style)',
  level: 'INTERMEDIATE',
  tags: ['retail', 'marketplace', 'inventory', 'activemq', 'oracle', 'oracle-ebs', 'throttling', 'polling'],
  estMinutes: 30,
  diagram: {
    task: 'draw the marketplace integration: inventory-change events from Oracle feeding a stock Process API that coalesces updates before calling one System API per marketplace, a scheduled order poller queuing marketplace orders for the order Process API, and Oracle EBS Order Management behind a System API.',
    checks: [
      { label: 'Each marketplace has its own System API', rule: { type: 'edge', from: 'system-api', to: 'external-api', min: 2 } },
      { label: 'Marketplaces are reached only through System APIs', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'Stock changes reach the stock Process API as events', rule: { type: 'edge', from: ['topic', 'queue', 'event-stream'], to: 'process-api', kind: 'async' } },
      { label: 'Stock updates are buffered and coalesced to respect marketplace throttling', rule: { type: 'edge', from: 'process-api', to: ['cache', 'database'] } },
      { label: 'A scheduled poller pulls marketplace orders and queues them', rule: { type: 'edge', from: 'batch-job', to: ['queue', 'topic'], kind: 'async' } },
      { label: 'Oracle EBS is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Marketplace orders reach EBS end to end', rule: { type: 'path', from: 'batch-job', to: 'erp' } },
    ],
    reference: diagram(
      {
        tstock: ['topic', 'INVENTORY.CHANGED (ActiveMQ)'],
        tship: ['topic', 'SHIPMENT.CONFIRMED'],
        qord: ['queue', 'MARKETPLACE.ORDERS'],
        prcst: ['process-api', 'prc-marketplace-stock'],
        prcord: ['process-api', 'prc-marketplace-orders'],
        job: ['batch-job', 'Order poller (every 5 min)'],
        flush: ['batch-job', 'Stock flush (every 10 min)'],
        sinv: ['system-api', 'sys-inventory-atp'],
        sa: ['system-api', 'sys-marketplace-a'],
        sb: ['system-api', 'sys-marketplace-b'],
        serp: ['system-api', 'sys-oracle-ebs-om'],
        buf: ['cache', 'Pending stock deltas'],
        ora: ['database', 'Oracle ATP tables'],
        mpa: ['external-api', 'Marketplace A (Amazon-style)'],
        mpb: ['external-api', 'Marketplace B (eBay-style)'],
        ebs: ['erp', 'Oracle EBS Order Management'],
      },
      [
        'sinv -> ora', 'sinv ~> tstock', 'tstock ~> prcst', 'prcst -> buf', 'flush -> prcst', 'prcst -> sa', 'prcst -> sb',
        'job -> sa', 'job -> sb', 'job ~> qord', 'qord ~> prcord', 'prcord -> serp', 'serp -> ebs', 'serp ~> tship', 'tship ~> prcord',
        'prcord -> sa', 'prcord -> sb', 'sa -> mpa', 'sb -> mpb',
      ],
    ),
  },
  description: `
An outdoor-equipment retailer sells **60,000 SKUs** on its own website and on **two marketplaces** (one Amazon-style, one eBay-style). Stock is shared: the same units can sell on any channel. Orders are fulfilled from the retailer's DCs and booked in **Oracle EBS Order Management**. Available-to-promise (ATP) quantities live in **Oracle** tables updated by EBS and the WMS.

Marketplace rules:
- **Stock** must be updated quickly — overselling leads to cancellations, which marketplaces penalise. Target: change visible within **15 minutes**.
- Marketplace APIs are **throttled** (e.g. a bucket of requests per second, bulk "feed" endpoints for many SKUs) — one call per stock change is not possible on busy days (~200,000 stock changes/day).
- **Orders** must be pulled (polling every few minutes) and **acknowledged within 1 hour**, otherwise the marketplace may cancel them.
- **Shipment confirmation** with carrier and tracking within **24 hours** of dispatch.
- Each marketplace has its own SKU IDs, order format and status model.

**Questions:**
1. Draw the architecture.
2. How do you keep stock in sync without exceeding throttling limits, and how do you avoid overselling?
3. How do orders get from the marketplaces into EBS, and back to the marketplace when shipped?
4. What happens if a marketplace API is down for an hour?
`,
  answerTemplate: `## Architecture

## Stock sync

## Order intake

## Shipment confirmation

## Failures and throttling

## Monitoring
`,
  keyPoints: [
    'One System API per marketplace hides its auth, throttling, SKU mapping and payload format; Process APIs work with canonical stock, order and shipment models.',
    'Inventory changes are events; prc-marketplace-stock coalesces deltas per SKU (latest wins) and flushes them in bulk feeds every 10 minutes within the throttle budget.',
    'Overselling avoided with a per-channel buffer (publish ATP minus safety stock, or an allocation per marketplace).',
    'A scheduler polls new orders per marketplace (watermark on last-updated time), queues them, creates EBS sales orders idempotently on marketplace order ID, and acknowledges within the hour.',
    'Shipment events from EBS/WMS trigger shipment confirmation with tracking; outages are absorbed by queues and retries with back-off.',
  ],
  solution: `
\`\`\`
 sys-inventory-atp (Oracle) ~> [INVENTORY.CHANGED] ~> prc-marketplace-stock -> pending deltas
 flush (10 min) -> prc-marketplace-stock -> sys-marketplace-a / sys-marketplace-b (bulk feed)
 poller (5 min) -> sys-marketplace-a/b (new orders) ~> [MARKETPLACE.ORDERS] ~> prc-marketplace-orders -> sys-oracle-ebs-om -> EBS
 EBS ship confirm ~> [SHIPMENT.CONFIRMED] ~> prc-marketplace-orders -> sys-marketplace-a/b (tracking)
\`\`\`

**Stock sync.**
- Inventory changes are published by sys-inventory-atp (from a \`db:listener\` on a change table, with watermark column, or from EBS business events).
- prc-marketplace-stock stores the **latest** quantity per SKU in a buffer (Object Store or an Oracle table with MERGE). 200,000 changes/day collapse to far fewer distinct SKUs per 10-minute window.
- Every 10 minutes the flush sends one bulk feed per marketplace with the changed SKUs (mapped to marketplace SKU IDs), staying within the throttle budget. Sell-out (quantity 0) is sent immediately as a priority update.
- **Overselling**: publish \`ATP − safety stock\` (e.g. 2 units) per marketplace, or allocate a share of stock for slow-moving items.

**Orders.**
- The poller asks each System API for orders updated since the stored watermark, publishes one message per order to the queue, then advances the watermark.
- prc-marketplace-orders maps to the canonical order and creates the EBS order through sys-oracle-ebs-om (open interface / API wrapper). The marketplace order ID is the **unique original system reference**, so a duplicate is skipped.
- On success it acknowledges the order on the marketplace; if stock is gone it rejects/cancels the line straight away rather than letting it age.

**Shipment confirmation.** EBS ship-confirm publishes an event; the Process API maps carrier codes to the marketplace's list and sends tracking. Failures are retried; anything not confirmed within 20 hours is alerted.

**Failures.** Marketplace down or throttling (429-style responses) → the System API retries with back-off (Until Successful with limited attempts) and the queued orders/deltas wait. Because stock is "latest wins", a delayed flush sends correct data when the marketplace returns. Orders whose ack deadline is near are highlighted on the dashboard.
`,
  followUps: [
    { q: 'Why not send each stock change immediately?', a: 'The volume would exceed marketplace throttles on busy days, and most intermediate values are useless — only the latest quantity matters. Coalescing reduces calls dramatically while staying within the 15-minute SLA.' },
    { q: 'How do you add a third marketplace?', a: 'Build sys-marketplace-c with its mapping and throttling and register it in the channel configuration; the Process APIs stay the same.' },
    { q: 'Why poll orders rather than wait for notifications?', a: 'Many marketplaces offer notifications but recommend polling as the reliable source; you can use notifications to trigger an earlier poll, but the poller with a watermark guarantees nothing is missed.' },
  ],
}

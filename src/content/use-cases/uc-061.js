import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-061',
  category: 'use-cases',
  title: '3PL Fulfilment for a D2C Brand (EDI 940/945/846 over SFTP)',
  level: 'INTERMEDIATE',
  tags: ['supply-chain', '3pl', 'edi', 'x12', 'sftp', 'shopify', 'netsuite', 'anypoint-mq', 'batching'],
  estMinutes: 30,
  diagram: {
    task: 'draw the D2C-to-3PL integration: Shopify webhooks into a queue, the fulfilment Process API with an order staging table, the scheduled 940 batch and 945/846 poller, the 3PL SFTP exchange, and the System APIs for Shopify and NetSuite.',
    checks: [
      { label: 'Shopify order webhooks land on an Experience API and are queued', rule: { type: 'edge', from: 'experience-api', to: ['queue', 'topic'], kind: 'async' } },
      { label: 'Shopify and NetSuite are reached only through System APIs', rule: { type: 'only-via', target: ['saas', 'erp'], from: 'system-api' } },
      { label: 'The 3PL is never called directly — files are exchanged over SFTP', rule: { type: 'no-edge', from: ['process-api', 'system-api', 'batch-job', 'experience-api'], to: 'wms' } },
      { label: 'A System API writes and reads the EDI files on the SFTP server', rule: { type: 'edge', from: 'system-api', to: 'file-store' } },
      { label: 'Scheduled jobs build 940 batches and collect 945/846 files', rule: { type: 'edge', from: 'batch-job', to: 'system-api', min: 2 } },
      { label: 'Orders are staged in a database until they are batched', rule: { type: 'edge', from: ['process-api', 'batch-job'], to: 'database' } },
      { label: 'Shipment confirmations update both Shopify and NetSuite', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 2 } },
    ],
    reference: diagram(
      {
        shop: ['saas', 'Shopify Plus'],
        hook: ['experience-api', 'exp-shopify-webhooks'],
        qord: ['queue', 'd2c-orders'],
        prc: ['process-api', 'prc-d2c-fulfilment'],
        stg: ['database', 'Order staging'],
        b940: ['batch-job', '940 batch builder (15 min)'],
        p945: ['batch-job', '945 / 846 poller (10 min)'],
        qshp: ['queue', 'd2c-shipments'],
        s3pl: ['system-api', 'sys-3pl-edi'],
        sftp: ['file-store', '3PL SFTP (in / out)'],
        tpl: ['wms', '3PL WMS'],
        sshop: ['system-api', 'sys-shopify'],
        sns: ['system-api', 'sys-netsuite'],
        ns: ['erp', 'NetSuite'],
      },
      [
        'shop -> hook', 'hook ~> qord', 'qord ~> prc', 'prc -> stg', 'b940 -> stg', 'b940 -> s3pl', 's3pl -> sftp', 'tpl -> sftp',
        'p945 -> s3pl', 'p945 ~> qshp', 'qshp ~> prc', 'prc -> sshop', 'prc -> sns', 'sshop -> shop', 'sns -> ns',
      ],
    ),
  },
  description: `
A direct-to-consumer skincare brand sells on **Shopify Plus** and keeps finance and inventory valuation in **NetSuite**. It has just outsourced warehousing to a **3PL**. The 3PL WMS only speaks **X12 EDI files over SFTP**:

| Doc | Meaning | Direction | Timing |
|---|---|---|---|
| **940** | Warehouse shipping order | Brand → 3PL | 3PL picks up files every 15 min |
| **945** | Warehouse shipping advice (shipped, tracking, lots) | 3PL → brand | when cartons leave |
| **846** | Inventory advice (on hand per SKU) | 3PL → brand | every night at 01:00 |
| **944** | Stock transfer receipt (inbound from manufacturer) | 3PL → brand | when a container is received |

Volumes and SLAs:
- ~3,000 orders/day normally; **25,000/day** during the November promotion.
- Orders paid before **14:00** must ship the same day (3PL cut-off for the last 940 file: 14:15).
- Customers must get a shipping email with tracking within **1 hour** of the 945.
- Orders can be **cancelled or edited** in Shopify until they are sent to the 3PL.

**Questions:**
1. Describe the flows for orders, shipments, inventory and receipts.
2. How do you handle cancellations and address edits?
3. How do you make sure every paid order reaches the 3PL and every shipped order is invoiced in NetSuite?
`,
  answerTemplate: `## Order flow (Shopify → 940)

## Shipment flow (945 → Shopify + NetSuite)

## Inventory and receipts (846 / 944)

## Cancellations and edits

## Reconciliation and monitoring
`,
  keyPoints: [
    'Webhook intake is thin: verify the Shopify HMAC, respond 200 fast and queue the order; processing is asynchronous.',
    'Orders are staged in a database and batched into one 940 file every 15 minutes, which gives a natural window for cancellations and edits before the cut-off.',
    'The 3PL is integrated only via SFTP files behind sys-3pl-edi (write to temp name then rename; move processed inbound files to archive).',
    '945 → Shopify fulfilment with tracking (triggers the customer email) and NetSuite item fulfilment/invoice; 846 → inventory reconciliation with NetSuite and Shopify levels.',
    'Daily reconciliation: paid orders vs 940 sent vs 997 received vs 945 received; anything older than SLA is alerted.',
  ],
  solution: `
\`\`\`
 Shopify --webhook--> exp-shopify-webhooks --> [d2c-orders] --> prc-d2c-fulfilment --> staging DB
 940 batch job (15 min) --> staging DB --> sys-3pl-edi --> SFTP /in --> 3PL WMS
 3PL WMS --> SFTP /out --> 945/846 poller --> sys-3pl-edi --> [d2c-shipments] --> prc --> sys-shopify / sys-netsuite
\`\`\`

**Order flow.** Shopify \`orders/paid\` webhook → Experience API verifies the HMAC signature, publishes to an Anypoint MQ queue and returns 200 within Shopify's timeout. The Process API maps to a canonical order and inserts it into the staging table (status READY, unique key on Shopify order ID → duplicates ignored). Every 15 minutes the batch job selects READY orders, builds one X12 940 interchange (one transaction set per order), uploads it through **sys-3pl-edi** to \`/in\` with a temporary name then renames it, and marks the orders SENT with the interchange control number. A 997 from the 3PL marks them ACCEPTED.

**Cancellations and edits.** \`orders/cancelled\` and \`orders/updated\` webhooks update the staging row while it is READY. If it is already SENT, the Process API sends a 940 cancel (or an email to the 3PL for brands whose 3PL does not support cancel) and flags the order for manual follow-up.

**Shipment flow.** The poller lists \`/out\`, downloads 945s, moves them to \`/archive\`, and queues one message per shipment. The Process API:
- creates the **Shopify fulfilment** with carrier and tracking number (Shopify sends the customer email),
- creates the **NetSuite item fulfilment** and invoice for the shipped lines, including lot numbers,
- handles short shipments (partial fulfilment + backorder flag).

**Inventory and receipts.** The nightly 846 is compared with NetSuite on-hand per SKU; differences above a threshold create an adjustment proposal for the inventory team rather than auto-adjusting. Shopify availability is set from the 846 minus open (READY/SENT) orders. 944 receipts post item receipts against the NetSuite transfer order.

**Error handling.** Malformed EDI → file moved to \`/error\`, alert. NetSuite concurrency limits → retry with back-off on 429-type responses; failed messages go to a DLQ with replay. Every file and order carries a correlation ID.

**Peak.** 25,000 orders/day is ~17 per minute — the queue absorbs bursts; the 940 batch size grows but the file count stays at 4/hour. Run an extra 940 batch at 14:10 to guarantee the cut-off.
`,
  followUps: [
    { q: 'Why batch 940s every 15 minutes instead of one file per order?', a: 'The 3PL only polls every 15 minutes anyway, fewer files are easier to track and reconcile, and the delay gives a free window for cancellations and edits.' },
    { q: 'How do you know the 3PL actually received a file?', a: 'By the 997 functional acknowledgement matched on the interchange control number. A file with no 997 after 30 minutes triggers an alert.' },
    { q: 'What would you change if the 3PL later offers a REST API?', a: 'Only sys-3pl-edi\'s implementation changes (or a new sys-3pl-api); the Process API keeps working with the canonical order and shipment models.' },
  ],
}

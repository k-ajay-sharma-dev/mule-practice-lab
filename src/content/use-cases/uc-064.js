import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-064',
  category: 'use-cases',
  title: 'Drop-Ship Orders to 250 Suppliers across EDI, API and CSV',
  level: 'ADVANCED',
  tags: ['supply-chain', 'retail', 'drop-ship', 'edi', 'sftp', 'activemq', 'oracle', 'sla', 'b2b'],
  estMinutes: 35,
  diagram: {
    task: 'draw the drop-ship integration: order intake and queue, the drop-ship Process API with its Oracle state table, one System API per vendor channel (EDI/VAN, SFTP files), API vendors through the gateway, the OMS System API and the SLA watchdog.',
    checks: [
      { label: 'Drop-ship orders are handed to the Process API asynchronously', rule: { type: 'edge', from: ['queue', 'topic'], to: 'process-api', kind: 'async' } },
      { label: 'The Process API reaches vendors through several channel System APIs', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 3 } },
      { label: 'The VAN for EDI vendors is reached only through a System API', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'CSV vendors exchange files via SFTP behind a System API', rule: { type: 'only-via', target: 'file-store', from: 'system-api' } },
      { label: 'API vendors come in through the gateway to a vendor Experience API', rule: { type: 'path', from: 'partner', to: 'experience-api', via: 'api-gateway' } },
      { label: 'Per-order drop-ship state is persisted', rule: { type: 'edge', from: 'process-api', to: 'database' } },
      { label: 'An SLA watchdog job escalates or re-routes late vendors', rule: { type: 'edge', from: 'batch-job', to: 'process-api' } },
      { label: 'The OMS is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
    ],
    reference: diagram(
      {
        ven: ['partner', 'API vendors (150)'],
        gw: ['api-gateway', 'Gateway (OAuth, per-vendor SLA tier)'],
        expo: ['experience-api', 'exp-order-intake'],
        expv: ['experience-api', 'exp-vendor-portal-api'],
        qd: ['queue', 'DROPSHIP.ORDERS (ActiveMQ)'],
        dlq: ['dlq', 'DLQ.DROPSHIP.ORDERS'],
        prc: ['process-api', 'prc-dropship'],
        sla: ['batch-job', 'SLA watchdog (15 min)'],
        state: ['database', 'DS_ORDER_STATE (Oracle)'],
        sedi: ['system-api', 'sys-vendor-edi'],
        sfile: ['system-api', 'sys-vendor-files'],
        soms: ['system-api', 'sys-oms'],
        van: ['external-api', 'VAN (40 EDI vendors)'],
        sftp: ['file-store', 'Vendor SFTP (60 CSV vendors)'],
        oms: ['erp', 'OMS'],
      },
      [
        'oms -> expo', 'expo ~> qd', 'qd ~> prc', 'qd ~> dlq', 'ven -> gw', 'gw -> expv', 'expv -> prc', 'prc -> state',
        'prc -> sedi', 'prc -> sfile', 'prc -> soms', 'sedi -> van', 'sfile -> sftp', 'soms -> oms', 'sla -> prc',
      ],
    ),
  },
  description: `
A home-goods retailer sells **180,000 drop-ship SKUs** online that it never stocks; the vendor ships directly to the customer. Orders come from **Salesforce Commerce Cloud** and are owned by the retailer's **OMS**.

| Vendor group | Count | How they connect |
|---|---|---|
| Large | 40 | EDI X12 via VAN: **850** in, **855** ack, **856** ship notice, **810** invoice, **846** stock |
| Mid-size | 150 | REST API (vendor portal): pull orders, post ack/shipment/invoice |
| Small | 60 | CSV files on SFTP, twice a day |

Volumes and rules:
- ~12,000 drop-ship order lines/day; one customer order can split across several vendors.
- Vendor must **acknowledge within 24 h** and **ship within 48 h**; otherwise the line is cancelled with the vendor and re-sourced to an alternative vendor (if any) or cancelled with the customer.
- Vendor stock (846 / API / CSV) must hide out-of-stock items on the website within **4 hours**.
- Invoices are paid only if they match the shipped quantity and agreed cost (2-way match against the drop-ship PO + 856).
- The customer must see one consolidated order with tracking per vendor shipment.

**Questions:**
1. Draw the architecture. How do you support three vendor channels without three copies of the business logic?
2. How do you track SLAs and re-source late lines?
3. How are invoices matched, and what happens on mismatch?
4. How do you deal with a vendor that sends the same 856 twice or sends it before the 855?
`,
  answerTemplate: `## Architecture and canonical model

## Order flow per channel

## SLA tracking and re-sourcing

## Shipments and customer visibility

## Invoice matching

## Idempotency, ordering and errors
`,
  keyPoints: [
    'One canonical drop-ship model (DropShipPO, Ack, Shipment, Invoice, StockLevel) in prc-dropship; channel System APIs (EDI/VAN, SFTP files, vendor API) only translate.',
    'Vendor profile table decides the channel per vendor; adding a vendor is configuration, not code.',
    'An Oracle state table per PO line (SENT → ACKED → SHIPPED → INVOICED / CANCELLED) drives SLAs: a watchdog job finds overdue lines and re-sources or cancels them.',
    'Shipments update the OMS with carrier + tracking so the customer sees per-vendor tracking on one order.',
    'Invoices 2-way matched (PO cost × shipped qty) with tolerance; mismatches held for AP review instead of auto-paid.',
    'Idempotency per vendor document ID; early 856 accepted as implicit acknowledgement.',
  ],
  solution: `
\`\`\`
 OMS  -> exp-order-intake ~> [DROPSHIP.ORDERS] ~> prc-dropship --> DS_ORDER_STATE (Oracle)
                                                     |--> sys-vendor-edi   -> VAN   (850 out / 855,856,810,846 in)
                                                     |--> sys-vendor-files -> SFTP  (CSV out / in)
                                                     |--> sys-oms          -> OMS   (status, tracking, cancellations)
 API vendors -> gateway -> exp-vendor-portal-api -> prc-dropship
 SLA watchdog -> prc-dropship (re-source / cancel)
\`\`\`

**Order flow.** The OMS sends each drop-ship order (already split by vendor) through exp-order-intake to an ActiveMQ queue. prc-dropship consumes it, creates a **drop-ship PO** per vendor, stores line state (status SENT, due-by timestamps) and routes by vendor profile:
- EDI → X12 850 via sys-vendor-edi;
- API → the PO becomes visible at \`GET /vendors/me/orders?status=NEW\`;
- CSV → appended to the next outbound CSV batch (08:00 and 14:00) written by sys-vendor-files.

Inbound documents from all channels are mapped to the same canonical Ack/Shipment/Invoice/StockLevel and handled by the same flows.

**SLA tracking.** The watchdog runs every 15 minutes: \`SELECT ... WHERE status = 'SENT' AND ack_due < SYSTIMESTAMP\` (and the same for shipping). Overdue lines → send a cancel to the vendor (860 / API / CSV), look up an alternative vendor in the sourcing table and create a new PO. Or tell the OMS to cancel and refund the line. Vendor scorecards are produced from the same table.

**Shipments.** An 856 / API shipment / CSV line sets SHIPPED and calls sys-oms with carrier and tracking number; the OMS notifies the customer.

**Stock.** Vendor stock messages update a stock table; items at zero are published to the commerce catalogue within the 4-hour SLA; stale feeds (no update for 24 h) mark the vendor's items as unavailable.

**Invoices.** Match each invoice line against PO cost × shipped quantity with a tolerance (e.g. 1 % or 2 currency units). Match → send to AP in the ERP; mismatch → hold with reason for AP review.

**Idempotency and ordering.** Unique key per vendor + document ID; duplicates are acknowledged and ignored. A shipment that arrives before the acknowledgement is accepted and counts as acknowledgement. Transactional JMS listener; poison messages go to the DLQ after the redelivery limit.

**Errors.** One vendor's failures never block the others (per-vendor error handling and queues can be split later). \`DB:CONNECTIVITY\` → redelivery; mapping errors → vendor-specific error report emailed to vendor operations.
`,
  followUps: [
    { q: 'Why keep state in Oracle instead of relying on the OMS status?', a: 'The OMS knows the customer line, not the vendor document lifecycle (due dates, document IDs, re-sourcing attempts). A dedicated state table makes SLA queries simple and fast.' },
    { q: 'How would you onboard vendor number 251?', a: 'Add a vendor profile row (channel, IDs, mapping variant, SLAs) and partner configuration in the VAN or SFTP; no new flows if they fit an existing channel.' },
    { q: 'What if a vendor sends 50,000 stock updates at once?', a: 'Process stock feeds in their own flow with batching (bulk upserts via MERGE) and queue them separately from orders so stock bursts never delay order processing.' },
  ],
}

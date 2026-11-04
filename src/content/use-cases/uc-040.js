import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-040',
  category: 'use-cases',
  title: 'Stock Transfers between Warehouses',
  level: 'ADVANCED',
  tags: ['wms', 'erp', 'state-machine', 'in-transit', 'logistics', 'reconciliation'],
  estMinutes: 30,
  diagram: {
    task: 'draw the stock-transfer integration: SAP, the canonical Warehouse System API in front of both the cloud WMS and the FTP-based legacy WMS, the event intake, the Stock Transfer Process API with its state table, and the reconciliation job.',
    checks: [
      { label: 'A Stock Transfer Process API orchestrates the SAP and Warehouse System APIs', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 2 } },
      { label: 'SAP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'The cloud WMS is reached only through the Warehouse System API', rule: { type: 'only-via', target: 'saas', from: 'system-api' } },
      { label: 'The Warehouse System API writes fixed-width files for the legacy WMS', rule: { type: 'edge', from: 'system-api', to: 'file-store' } },
      { label: 'Nothing calls the legacy WMS directly — it only exchanges files', rule: { type: 'no-edge', from: ['system-api', 'process-api', 'experience-api', 'batch-job'], to: 'legacy' } },
      { label: 'Warehouse confirmations reach the Process API asynchronously through a queue', rule: { type: 'edge', from: ['queue', 'topic', 'event-stream'], to: 'process-api', kind: 'async' } },
      { label: 'The Process API keeps per-STO integration state in a database', rule: { type: 'edge', from: 'process-api', to: 'database' } },
      { label: 'A reconciliation job compares SAP in-transit stock with WMS movements', rule: { type: 'edge', from: 'batch-job', to: 'system-api', min: 2 } },
    ],
    reference: diagram(
      {
        cwms: ['saas', 'Cloud WMS (3 DCs)'],
        hook: ['experience-api', 'exp-wms-webhook-listener'],
        poll: ['batch-job', 'Legacy confirmation file poller'],
        q: ['queue', 'sto-events'],
        err: ['dlq', 'sto-error-queue'],
        prc: ['process-api', 'prc-stock-transfer-api'],
        state: ['database', 'STO state table'],
        rec: ['batch-job', 'In-transit ageing + month-end reconciliation'],
        ssap: ['system-api', 'sys-sap-logistics-api'],
        swh: ['system-api', 'sys-warehouse-api (canonical)'],
        sap: ['erp', 'SAP S/4HANA'],
        ftp: ['file-store', 'Legacy FTP folders (fixed-width)'],
        lwms: ['legacy', 'Legacy on-prem WMS'],
      },
      [
        'cwms -> hook', 'hook ~> q', 'poll -> ftp', 'poll ~> q', 'ssap ~> q', 'q ~> prc', 'q ~> err', 'prc -> state', 'prc -> ssap', 'prc -> swh',
        'ssap -> sap', 'swh -> cwms', 'swh -> ftp', 'lwms -> ftp', 'rec -> ssap', 'rec -> swh',
      ],
    ),
  },
  description: `
A grocery wholesaler runs **4 distribution centres (DCs)**. Three use a modern cloud **WMS**; the oldest DC still runs a legacy **on-prem WMS** that only exchanges **fixed-width flat files over FTP**. Stock and finance are in **SAP S/4HANA**.

Facts:
- Planners create **stock transfer orders (STOs)** in SAP to rebalance stock: ~1,200 STOs/day, 1–200 lines each.
- Flow per STO: SAP STO → sending DC picks and ships (**goods issue**) → truck in transit (4–30 hours) → receiving DC receives (**goods receipt**), often with **short or damaged quantities**.
- Stock must be visible as **"in transit"** in SAP between issue and receipt, so it is not sold twice nor lost.
- Chilled goods have **batch numbers and best-before dates** that must travel with the stock.
- Cloud WMS: REST APIs + webhooks. Legacy WMS: drops files every 15 minutes, reads inbound files every 15 minutes.
- Finance requires that at month end every unit shipped is either received or explained.

**Describe your solution:**
- What messages and APIs are needed through the STO lifecycle?
- How do you integrate the legacy WMS alongside the cloud WMS?
- How do you handle short receipts, damages and batches?
- How do you make sure nothing gets lost in transit (technically and physically)?
`,
  answerTemplate: `## Lifecycle and events

## APIs and layers

## Legacy WMS integration

## Discrepancies and batches

## Ordering and idempotency

## Reconciliation and monitoring
`,
  keyPoints: [
    'STO lifecycle modelled as states (created → released to DC → shipped → in transit → received/closed) with SAP as the stock/financial owner.',
    'Canonical Warehouse System API hides cloud WMS (REST/webhooks) vs legacy WMS (fixed-width files over FTP) behind the same operations.',
    'Goods issue in SAP posts stock to in-transit; goods receipt posts actual received quantities with batch and best-before data.',
    'Short/damaged quantities create discrepancy records and follow-up (claim, write-off, or second shipment) instead of silently closing the STO.',
    'Events processed idempotently and in order per STO (issue before receipt; out-of-order receipt parked until issue posted).',
    'Daily in-transit ageing report and month-end reconciliation between SAP and WMS movements.',
  ],
  solution: `
**Lifecycle and events.**
1. STO created/released in SAP → **outbound delivery** to the sending DC (IDoc/OData event).
2. Sending DC confirms pick/ship → **goods issue** posted in SAP (stock moves to *in transit* at the receiving plant), with batches and quantities shipped.
3. Receiving DC gets an **advance shipping notice (ASN)** with expected items, batches and best-before dates.
4. Receiving DC confirms receipt → **goods receipt** in SAP for actual quantities; discrepancies recorded.

**APIs and layers.**
- **SAP System API** (SAP connector/OData): read STO/delivery, post goods issue, post goods receipt.
- **Warehouse System API** with a canonical model (\`shipmentOrder\`, \`shipmentConfirmation\`, \`asn\`, \`receiptConfirmation\`) and two implementations: cloud WMS and legacy WMS.
- **Stock Transfer Process API** orchestrating the lifecycle and tracking state per STO (a small database table: STO, state, timestamps, quantities).

**Legacy WMS integration.** Outbound: DataWeave writes **fixed-width** files (flat-file schema) and uploads them to the legacy FTP inbound folder using a temp name then rename, so the WMS never reads a half-written file. Inbound: a Scheduler/FTP listener picks up confirmation files, parses them with a flat-file schema, moves processed files to archive and rejects malformed ones to an error folder with an alert. File sequence numbers detect gaps.

**Discrepancies and batches.** Receipt quantities per batch are compared with shipped quantities:
- short → GR for received quantity; the difference stays in transit and a **discrepancy case** is opened (driver claim, loss write-off approved by finance, or a follow-up shipment);
- damaged → received into a blocked stock type;
- batch/best-before data carried from goods issue → ASN → receipt; mismatches flagged for quality.

**Ordering and idempotency.** Events are keyed by STO + delivery + message ID. A receipt arriving before the goods issue posted (possible with file delays) is **parked** and retried when the issue is confirmed. Duplicate confirmations are ignored using stored message IDs. SAP posting errors (period closed, batch missing) go to an error queue with a business-readable message.

**Reconciliation and monitoring.** Daily **in-transit ageing** report: STOs shipped but not received after 48 hours alert logistics. Month end: compare SAP in-transit stock with open shipments in all WMSs; every difference needs a discrepancy case. Dashboards show STOs by state and errors per DC.
`,
  followUps: [
    { q: 'Why keep state in the Process API when SAP already has the STO status?', a: 'SAP knows financial status, not integration status (e.g. ASN sent, receipt parked). A small state table makes troubleshooting and reprocessing much easier; SAP remains the system of record for stock.' },
    { q: 'How do you replace the legacy WMS later?', a: 'Only the legacy implementation of the Warehouse System API changes; the Process API and SAP side stay as they are.' },
  ],
}

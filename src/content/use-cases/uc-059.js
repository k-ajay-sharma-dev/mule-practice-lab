import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-059',
  category: 'use-cases',
  title: 'Supplier PO Lifecycle: 850 → 855 → 856 ASN → Goods Receipt in Oracle EBS',
  level: 'INTERMEDIATE',
  tags: ['supply-chain', 'edi', 'x12', 'oracle-ebs', 'oracle', 'activemq', 'jms', 'asn', 'goods-receipt'],
  estMinutes: 30,
  diagram: {
    task: 'draw the supplier PO lifecycle: the outbound 850 path from Oracle EBS to suppliers, the inbound AS2 endpoint and ActiveMQ queue for 855/856, the PO Process API with its EDI tracking table, and the DC WMS that receives against the ASN.',
    checks: [
      { label: 'Suppliers send 855/856 documents to a B2B Experience API', rule: { type: 'edge', from: 'partner', to: 'experience-api' } },
      { label: 'Inbound EDI is acknowledged quickly and queued asynchronously', rule: { type: 'edge', from: 'experience-api', to: ['queue', 'topic'], kind: 'async' } },
      { label: 'The PO Process API consumes inbound documents from the queue', rule: { type: 'edge', from: ['queue', 'topic'], to: 'process-api', kind: 'async' } },
      { label: 'Oracle EBS is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'The WMS receives the expected ASN only through a System API', rule: { type: 'only-via', target: 'wms', from: 'system-api' } },
      { label: 'Documents that keep failing are moved to a dead-letter queue', rule: { type: 'edge', from: ['queue', 'process-api'], to: 'dlq' } },
      { label: 'EDI control numbers and document status are tracked in a database', rule: { type: 'edge', from: 'process-api', to: 'database' } },
      { label: 'Outbound 850s reach the VAN/AS2 network through a System API', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
    ],
    reference: diagram(
      {
        sup: ['partner', 'Suppliers (420, AS2/VAN)'],
        expb: ['experience-api', 'exp-b2b-edi-inbound (AS2)'],
        poll: ['batch-job', 'Approved-PO poller (5 min)'],
        qin: ['queue', 'EDI.INBOUND (ActiveMQ)'],
        dlq: ['dlq', 'DLQ.EDI.INBOUND'],
        prc: ['process-api', 'prc-supplier-po'],
        trk: ['database', 'EDI tracking table (Oracle)'],
        sebs: ['system-api', 'sys-oracle-ebs-purchasing'],
        sedi: ['system-api', 'sys-b2b-edi-outbound'],
        swms: ['system-api', 'sys-dc-wms'],
        ebs: ['erp', 'Oracle EBS (PO + Receiving)'],
        van: ['external-api', 'VAN / AS2 gateway'],
        wms: ['wms', 'DC WMS'],
      },
      [
        'sup -> expb', 'expb ~> qin', 'qin ~> prc', 'qin ~> dlq', 'poll -> prc', 'prc -> sebs', 'prc -> sedi', 'prc -> swms', 'prc -> trk',
        'sebs -> ebs', 'sedi -> van', 'swms -> wms', 'wms ~> qin',
      ],
    ),
  },
  description: `
A home-improvement retailer buys from **420 suppliers**. Purchasing runs on **Oracle E-Business Suite (EBS) 12.2** on an Oracle 19c database. The two regional DCs run a modern **WMS** that publishes events to **ActiveMQ Artemis**.

Today buyers email PDFs; the business wants a full EDI X12 lifecycle:

| Step | Document | Direction | Volume |
|---|---|---|---|
| Approved PO | **850** | Retailer → supplier | ~6,000 POs/day, 1–300 lines |
| PO acknowledgement | **855** (accept / change / reject per line) | Supplier → retailer | within 24 h of the 850 |
| Advance ship notice | **856** with SSCC pallet labels | Supplier → retailer | at dispatch |
| Goods receipt | WMS receipt confirmation | DC → EBS | when the truck is unloaded |

Constraints:
- Suppliers connect over **AS2** (large ones) or a **VAN** mailbox (small ones). Every interchange needs a **997** functional acknowledgement.
- An 855 can change quantity, price or date — buyers must approve price changes; quantity reductions are auto-accepted.
- The DC needs the ASN **at least 2 hours before the truck arrives** to plan dock doors.
- Receipts must post in EBS within **15 minutes** of unload so stock becomes sellable.
- Duplicated or out-of-order documents are common (an 856 arriving before the 855).

**Questions:**
1. Which APIs and flows do you build for each step?
2. How do you get approved POs out of EBS, and how do you post ASNs and receipts into it?
3. How do you handle duplicates, out-of-order documents and failures?
4. How does finance know which POs are stuck?
`,
  answerTemplate: `## Flows per document

## Getting data out of / into Oracle EBS

## Messaging and ordering

## Error handling and DLQ

## Tracking and monitoring
`,
  keyPoints: [
    'Outbound: a scheduled poller (watermark on approval date) reads approved POs through sys-oracle-ebs-purchasing, maps to X12 850 and sends via the AS2/VAN System API; a 997 closes the loop.',
    'Inbound: the AS2 endpoint only validates the envelope, stores the raw file, returns the MDN and publishes to an ActiveMQ queue — business processing is asynchronous.',
    'ASNs and receipts are posted through EBS open interfaces (RCV_HEADERS_INTERFACE / RCV_TRANSACTIONS_INTERFACE) processed by the Receiving Transaction Processor, wrapped in the System API.',
    'An EDI tracking table keyed by PO number + document type + ISA/GS control numbers gives idempotency, out-of-order parking and a PO lifecycle view.',
    'JMS listener in a transaction: errors roll back and ActiveMQ redelivers; after the retry limit messages go to a DLQ with an alert and a replay procedure.',
    '855 price changes go to a buyer approval task; quantity reductions are applied automatically.',
  ],
  solution: `
\`\`\`
 EBS --(poll approved POs)--> prc-supplier-po --> sys-b2b-edi-outbound --> VAN/AS2 --> Supplier
 Supplier --AS2--> exp-b2b-edi-inbound --> [EDI.INBOUND] --> prc-supplier-po --> sys-oracle-ebs-purchasing --> EBS
                                                 |                         \\--> sys-dc-wms --> WMS (expected receipt)
 WMS --receipt events--> [EDI.INBOUND / WMS.RECEIPTS] --> prc-supplier-po --> EBS receiving interface
\`\`\`

**Outbound 850.** A Scheduler every 5 minutes calls the Process API, which asks **sys-oracle-ebs-purchasing** for POs approved since the last watermark. It runs \`db:select\` against a read-only view over PO_HEADERS_ALL / PO_LINES_ALL with \`:lastRun\` as a bind parameter, never string concatenation. DataWeave maps to the X12 850; the trading-partner profile (ISA/GS IDs, AS2 or VAN, item-number style) comes from a config table. The watermark is stored only after the send succeeds.

**Inbound 855/856.** The AS2 endpoint (Experience API) validates the envelope, writes the raw interchange to the tracking table and returns the MDN. It then publishes one message per transaction set to the \`EDI.INBOUND\` ActiveMQ queue with \`docType\` and \`poNumber\` as JMS properties. A 997 is generated after syntax validation.

**Processing in the Process API** (JMS listener, transactional, ackMode handled by the transaction):
- **855:** per line — accept, quantity change (auto-apply), price/date change (create a buyer approval task, do not touch the PO). Acceptance is recorded in EBS through a PL/SQL wrapper called with \`db:stored-procedure\`.
- **856:** map HL loops (shipment → order → pack/SSCC → item) into RCV_HEADERS_INTERFACE / RCV_TRANSACTIONS_INTERFACE rows as an ASN; the Receiving Transaction Processor validates them. In parallel the expected receipt (SSCCs, quantities, ETA) is sent to the WMS via **sys-dc-wms**.
- **Receipt confirmation** from the WMS: posted as a receipt against the ASN shipment lines through the same interface; differences are flagged.

**Idempotency and ordering.** The tracking table has a unique key (sender ID + control number + doc type). A duplicate is acknowledged and ignored. An 856 that arrives before its 855 is processed anyway (EBS allows ASNs on approved POs). But an ASN for an unknown PO is **parked** with status WAITING and retried by the poller for 24 hours.

**Error handling.**
- \`DB:CONNECTIVITY\` → the transaction rolls back; ActiveMQ redelivers (redelivery delay with back-off). After 5 attempts the broker moves the message to \`DLQ.EDI.INBOUND\`.
- Business errors (unknown item, closed PO line) → no retry; status REJECTED in the tracking table and an email to the buyer.
- Interface errors from the Receiving Transaction Processor (PO_INTERFACE_ERRORS) are read back by a job and surfaced on the dashboard.

**NFRs and monitoring.** A PO lifecycle view (850 sent → 997 → 855 → 856 → received) built from the tracking table; alerts for POs with no 855 after 24 h and ASNs without receipt 48 h after ETA. Oracle JDBC driver added as a dependency of each Mule app; connection pool sized for the listener concurrency.
`,
  followUps: [
    { q: 'Why not let the AS2 endpoint post straight into EBS?', a: 'The supplier only needs the MDN; posting synchronously would tie the AS2 session to EBS availability and make retries the supplier\'s problem. Queuing decouples them and lets you replay safely.' },
    { q: 'How do you avoid losing POs if the poller crashes mid-batch?', a: 'Advance the watermark only after the batch is sent, and make sending idempotent by PO number + revision in the tracking table, so a rerun re-sends nothing twice.' },
    { q: 'What changes if a supplier sends EDIFACT DESADV instead of an 856?', a: 'Only the inbound mapping for that partner profile changes; both map into the same canonical ASN before the Process API posts to EBS.' },
  ],
}

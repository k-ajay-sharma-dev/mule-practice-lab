import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-096',
  category: 'use-cases',
  title: 'Customer EDI 850 Orders into SAP with 855 and 856 Back',
  level: 'INTERMEDIATE',
  tags: ['edi', 'x12', 'sap', 'idoc', 'asn', 'b2b', 'supply-chain', 'idempotency'],
  estMinutes: 30,
  diagram: {
    task: 'draw the supplier side of retail EDI: the AS2 endpoint and queue for inbound 850s, the Process API with its tracking table, SAP through its IDoc System API, the queue for outbound DESADV and INVOIC IDocs, and the AS2 gateway for 855, 856 and 810.',
    checks: [
      { label: 'Retailers send 850s to a B2B Experience API', rule: { type: 'edge', from: 'partner', to: 'experience-api' } },
      { label: 'Inbound EDI is queued before any SAP work starts', rule: { type: 'edge', from: 'experience-api', to: ['queue', 'topic'], kind: 'async' } },
      { label: 'No synchronous chain runs from the AS2 endpoint to SAP', rule: { type: 'no-path', from: 'experience-api', to: 'erp', kind: 'sync' } },
      { label: 'SAP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Outbound 855, 856 and 810 leave through a System API', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'SAP shipment and invoice IDocs reach the Process API through a queue', rule: { type: 'path', from: 'erp', via: ['queue', 'topic'], to: 'process-api' } },
      { label: 'Control numbers and document status are tracked in a database', rule: { type: 'edge', from: 'process-api', to: 'database' } },
      { label: 'Documents that keep failing go to a dead-letter queue', rule: { type: 'edge', from: ['queue', 'topic', 'process-api'], to: 'dlq' } },
    ],
    reference: diagram(
      {
        ret: ['partner', 'Retail customers (35, AS2)'],
        exp: ['experience-api', 'exp-b2b-as2-inbound'],
        qin: ['queue', 'edi-inbound'],
        dlq: ['dlq', 'edi-inbound-dlq'],
        prc: ['process-api', 'prc-customer-edi-orders'],
        trk: ['database', 'EDI tracking table'],
        ssap: ['system-api', 'sys-sap-idoc-api'],
        sap: ['erp', 'SAP ECC 6.0 (SD)'],
        qout: ['queue', 'sap-outbound-idocs'],
        sedi: ['system-api', 'sys-b2b-as2-outbound'],
        gw: ['external-api', 'AS2 gateway to retailers'],
      },
      [
        'ret -> exp', 'exp ~> qin', 'qin ~> prc', 'qin ~> dlq', 'prc -> trk', 'prc -> ssap', 'ssap -> sap',
        'sap ~> ssap', 'ssap ~> qout', 'qout ~> prc', 'prc -> sedi', 'sedi -> gw',
      ],
    ),
  },
  description: `
A consumer-goods manufacturer sells to **35 retail chains**. The retailers send purchase orders as **EDI X12 850** over **AS2** and expect documents back. Orders and deliveries run in **SAP ECC 6.0 SD**. Mule 4 is the integration platform; SAP is reached with the SAP connector (IDocs and BAPIs).

| Document | Direction | Rule from the retailers |
|---|---|---|
| 850 purchase order | Retailer → you | about **4,000 POs a day**, peak 9,000 before holidays |
| 997 functional ack | You → retailer | within **1 hour** of each interchange |
| 855 PO acknowledgement | You → retailer | within **24 hours**, per line: accepted, changed or backordered |
| 856 ASN | You → retailer | when the truck leaves, before it arrives |
| 810 invoice | You → retailer | after goods issue |

Facts:
- Retailers resend an 850 when they get no 997, so duplicates happen every day.
- A retailer charges a **chargeback of 250 USD** for each late or wrong ASN.
- SAP sends delivery (\`DESADV\`) and billing (\`INVOIC\`) IDocs when goods issue and billing are posted.
- Each retailer has its own 850 variant (item numbers by UPC or by buyer part number, ship-to codes).

**Questions:**
1. What does the AS2 endpoint do, and what does it not do?
2. How do you create the SAP sales order and stop duplicates?
3. How do the 855, 856 and 810 get out?
4. How do you see which POs are missing a document before a chargeback arrives?
`,
  answerTemplate: `## Inbound 850 and 997

## Sales orders in SAP

## Outbound 855, 856 and 810

## Tracking and chargebacks
`,
  keyPoints: [
    'The AS2 Experience API checks the envelope, stores the raw file, returns the MDN and queues the transactions; SAP is never called inside the AS2 session.',
    'The Process API maps each partner variant to a canonical order and posts an ORDERS05 IDoc or BAPI through sys-sap-idoc-api.',
    'The tracking table is keyed by retailer id plus PO number, so a resent 850 is acknowledged and dropped instead of creating a second order.',
    'SAP DESADV and INVOIC IDocs are received by the System API, queued, and mapped by the Process API to 856 and 810 sent through the AS2 outbound System API.',
    'A dashboard over the tracking table shows POs without 855 or 856 against each retailer deadline.',
  ],
  solution: `
\`\`\`
Retailer --AS2--> exp-b2b-as2-inbound --> [edi-inbound] --> prc-customer-edi-orders --> sys-sap-idoc-api --> SAP
                                                                   |    ^                        |
                                                                   |    \\--- [sap-outbound-idocs] <-- DESADV / INVOIC
                                                                   \\--> sys-b2b-as2-outbound --> AS2 gateway --> Retailer
\`\`\`

**Inbound.** The AS2 endpoint decrypts, checks the signature and the ISA/GS envelope, writes the raw interchange to storage and returns the MDN. It publishes one message per 850 to \`edi-inbound\`. The 997 is generated after syntax validation and sent back through the outbound System API.

**Sales order.** The Process API reads the retailer profile (item key type, ship-to mapping) and maps the 850 to a canonical order. It inserts a row in the **tracking table** with a unique key on retailer id and PO number. If the insert fails because the row exists, the message is a resend: it is acknowledged and dropped. Otherwise it calls **sys-sap-idoc-api** to post an \`ORDERS05\` IDoc. The 855 is built from the order confirmation: lines that SAP could not confirm in full become backordered lines.

**Outbound.** SAP sends \`DESADV\` at goods issue and \`INVOIC\` at billing to the IDoc listener in **sys-sap-idoc-api**. The listener only puts each IDoc on \`sap-outbound-idocs\` and returns, so SAP is never blocked by a retailer. The Process API maps DESADV to an 856 (shipment, order, pack with SSCC, item) and INVOIC to an 810, and sends them through **sys-b2b-as2-outbound**.

**Tracking.** Every document updates the tracking row: 850 received, order number, 855 sent, 997 received, 856 sent, 810 sent. A dashboard lists POs where the truck left but no 856 was sent, so the team acts before the retailer issues a chargeback.

**Errors.** A mapping error (unknown UPC) goes to the DLQ and the customer service team fixes the item cross-reference and replays it. SAP connection errors are redelivered with back-off.
`,
  followUps: [
    { q: 'Why not call the SAP BAPI inside the AS2 request?', a: 'The retailer only needs the MDN. If SAP is slow the AS2 session times out and the retailer resends, which creates more duplicates.' },
    { q: 'How do you add a new retailer with a different 850 variant?', a: 'Add a partner profile and a mapping to the canonical order. The Process API and the SAP side do not change.' },
    { q: 'What do you do when the 997 from the retailer never comes back?', a: 'The tracking row stays at sent. An alert after the agreed window lets the team resend the same interchange with the same control number.' },
  ],
}

import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-021',
  category: 'architecture',
  title: 'B2B/EDI Architecture with Trading Partners',
  level: 'ADVANCED',
  tags: ['b2b', 'edi', 'x12', 'partner-onboarding'],
  estMinutes: 30,
  diagram: {
    task: 'draw the B2B platform end to end: inbound purchase orders from retailers into SAP, outbound ASNs/invoices back to them, and where documents are buffered and tracked.',
    checks: [
      { label: 'Retailers reach SAP only through the B2B gateway layer (AS2/SFTP, MDN)', rule: { type: 'path', from: 'partner', to: 'erp', via: 'api-gateway' } },
      { label: 'Retailers never call the order process, System API or SAP directly', rule: { type: 'no-edge', from: 'partner', to: ['process-api', 'system-api', 'erp'] } },
      { label: 'Canonical POs are queued after the technical ack, so SAP outages cause delay, not rejections', rule: { type: 'edge', from: ['experience-api', 'api-gateway', 'process-api'], to: 'queue', kind: 'async' } },
      { label: 'One Order Process API sits between the B2B layer and SAP', rule: { type: 'path', from: 'queue', to: 'erp', via: 'process-api' } },
      { label: 'SAP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Outbound ASNs/invoices flow from SAP back to the partner gateway', rule: { type: 'path', from: 'erp', to: 'api-gateway' } },
      { label: 'Inbound and outbound documents are tracked (control numbers, PO number)', rule: { type: 'edge', to: 'monitoring', min: 2 } },
      { label: 'Documents that keep failing go to a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: ['queue', 'topic', 'event-stream', 'cloud-queue', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        ret: ['partner', 'Retailers (X12 / EDIFACT over AS2, SFTP)'],
        sml: ['partner', 'Small retailers (CSV portal)'],
        gw: ['api-gateway', 'B2B gateway (AS2/SFTP, MDN, Partner Manager)'],
        edi: ['experience-api', 'exp-b2b-inbound (parse, 997/CONTRL, map)'],
        pq: ['queue', 'canonical-po-q'],
        dlq: ['dlq', 'po-dlq'],
        po: ['process-api', 'prc-order-api (dedupe partner + PO)'],
        ssap: ['system-api', 'sys-sap-order-api'],
        sap: ['erp', 'SAP'],
        oq: ['queue', 'outbound-docs-q'],
        ob: ['process-api', 'prc-outbound-asn-invoice'],
        trk: ['monitoring', 'B2B document tracking'],
      },
      [
        'ret -> gw', 'sml -> gw', 'gw -> edi', 'edi ~> pq', 'pq ~> po', 'pq ~> dlq',
        'po -> ssap', 'ssap -> sap', 'edi -> trk',
        'sap ~> ssap', 'ssap ~> oq', 'oq ~> ob', 'ob -> gw', 'ob -> trk',
      ],
    ),
  },
  description: `
A consumer-goods manufacturer sells to **120 retailers**. Retailers send **purchase orders** and expect **order acknowledgements, advance ship notices (ASN) and invoices** back.

- Big US retailers use **ANSI X12** (850, 855, 856, 810) over **AS2**; European retailers use **EDIFACT** (ORDERS, ORDRSP, DESADV, INVOIC) over AS2 or SFTP; ~30 small retailers can only upload CSV through a portal or send email.
- An old EDI VAN contract is expensive and ends in 9 months.
- The ERP is **SAP** (orders created via IDoc/BAPI).
- Retailers impose **chargebacks** if ASNs are late or wrong. Onboarding a new retailer currently takes 6 weeks.
- Volume: ~8,000 POs/day, peaks of 5× before holidays.

**Questions:**
- What is the end-to-end architecture for inbound POs and outbound ASNs/invoices?
- How do you separate partner-specific concerns (protocols, formats, IDs) from the core order process?
- How do you handle acknowledgements (technical and business) and tracking for support?
- How do you cut onboarding time for new partners?
`,
  answerTemplate: `## End-to-end architecture

## Partner-specific vs canonical layer

## Acknowledgements and tracking

## Partner onboarding

## Peaks and failure handling
`,
  keyPoints: [
    'Layered design: partner connectivity (AS2, SFTP, portal) → EDI parsing/validation (X12/EDIFACT) → canonical order model → Process API → SAP System API.',
    'Partner-specific settings (identifiers, protocol endpoints, certificates, maps, validation rules) are configuration/profiles, not custom code per partner — e.g. managed in Anypoint Partner Manager.',
    'Technical acknowledgements (AS2 MDN, X12 997/999 or EDIFACT CONTRL) are generated automatically and quickly; business acknowledgements (855/ORDRSP) come after SAP accepts the order.',
    'Every document is tracked end to end with partner, document type, control numbers and business keys (PO number) so support can answer "did we get PO 12345?".',
    'Inbound is decoupled with a queue/persistence after receipt, so a slow or down SAP does not cause rejected transmissions; outbound ASNs are monitored against partner SLAs to avoid chargebacks.',
  ],
  solution: `
**End-to-end architecture (inbound).**
\`\`\`
Retailer → AS2 / SFTP / portal upload
  → B2B gateway layer: receive, decrypt/verify signature, send MDN
  → EDI layer: X12/EDIFACT parse + validate, generate 997/999 or CONTRL
  → map to canonical PurchaseOrder (JSON)  → persist / queue
  → Order Process API (business rules, dedupe on partner + PO number)
  → SAP Order System API (IDoc/BAPI)
\`\`\`
**Outbound:** SAP events (order confirmed, delivery posted, invoice created) → Process API → canonical ASN/Invoice → partner map → X12 856/810 or EDIFACT DESADV/INVOIC → AS2/SFTP → track MDN/997.

**Tooling.** Mule 4 provides **X12 and EDIFACT** connectors (parse/validate/write) and an **AS2** connector; **Anypoint Partner Manager** (part of MuleSoft's B2B offering) manages partner profiles, identifiers, certificates, endpoints, maps and message tracking without coding each partner. CSV portal partners land in the same canonical model via a simple mapping.

**Partner vs canonical.** Everything partner-specific (ISA/UNB IDs, qualifiers, AS2 certificates, map variations, which segments they send) lives in **partner configuration**. The **canonical PurchaseOrder** is the contract between the B2B layer and the core process — the Order Process API never knows whether a PO came from X12, EDIFACT or CSV. New partner = new profile + map variant, not a new flow.

**Acknowledgements and tracking.**
- *Transport:* AS2 **MDN** (sync or async) confirms receipt.
- *Syntax:* **997/999** (X12) or **CONTRL** (EDIFACT) after validation — sent within minutes even if SAP is down.
- *Business:* **855 / ORDRSP** only after SAP accepts (or rejects lines).
- Track per document: partner, type, interchange/group/transaction control numbers, PO number, status timeline. Monitor for **missing inbound 997s** on outbound documents and alert.

**Onboarding.** Partner templates per standard/version (e.g. "X12 4010 retail"), self-service test (partner sends test files, automated validation report), certificate exchange checklist. Target: days instead of 6 weeks. Prioritise migrating the VAN partners first (contract deadline), by volume.

**Peaks and failures.** After receipt and technical ack, **persist/queue** the canonical PO, so SAP slowness causes delay, not rejected EDI. Scale the processing consumers for the 5× holiday peak; SAP throughput is usually the limit (batch IDocs). Outbound ASNs: alerts when a shipment has no ASN within the retailer's SLA window — chargebacks are a business KPI for this platform.
`,
  followUps: [
    { q: 'Why not let SAP\'s own EDI/IDoc tooling talk directly to partners?', a: 'You could for a few partners, but you lose a protocol/partner management layer, central tracking and the reuse of canonical orders for other channels (portal, API customers). The B2B layer absorbs partner variety so SAP sees one format.' },
    { q: 'A retailer sends the same PO twice. What happens?', a: 'Interchange control numbers detect technical duplicates, and the Order Process API dedupes on partner ID + PO number before creating a sales order; a true change arrives as a PO change (860/ORDCHG), not a resend.' },
    { q: 'How do you justify the cost of the B2B platform versus renewing the VAN?', a: 'Compare VAN per-message fees and onboarding time with platform licence and run cost; add chargeback reduction from better ASN tracking and the reuse of the canonical order process for non-EDI channels.' },
  ],
}

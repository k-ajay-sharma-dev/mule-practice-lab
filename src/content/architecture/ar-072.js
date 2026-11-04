import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-072',
  category: 'architecture',
  title: 'B2B Gateway for 300 Suppliers: Profiles, AS2/SFTP and 997 Tracking',
  level: 'ADVANCED',
  tags: ['supply-chain', 'edi', 'x12', 'b2b', 'as2', 'sftp', 'oracle', 'wms'],
  estMinutes: 40,
  diagram: {
    task: 'draw the B2B gateway: how 300 suppliers connect, how inbound documents are parsed and routed to Oracle and the WMS, how outbound POs and acknowledgements go back, and how missing 997s are tracked.',
    checks: [
      { label: 'Suppliers connect only through a B2B edge gateway (AS2 / SFTP endpoint)', rule: { type: 'each', of: 'partner', edgeTo: 'api-gateway' } },
      { label: 'Inbound processing looks up partner profiles', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'cache'], label: ['profile', 'partner'] } } },
      { label: 'Raw EDI files are archived', rule: { type: 'edge', from: 'process-api', to: 'file-store' } },
      { label: 'Inbound and outbound documents are decoupled with queues', rule: { type: 'edge', from: ['process-api', 'system-api'], to: ['queue', 'topic', 'event-stream'], kind: 'async', min: 2 } },
      { label: 'Oracle and the WMS are reached only through System APIs', rule: { type: 'only-via', target: ['erp', 'wms'], from: 'system-api' } },
      { label: 'Documents that fail parsing or mapping go to a DLQ', rule: { type: 'edge', from: 'process-api', to: 'dlq' } },
      { label: 'Outbound documents leave through the same gateway', rule: { type: 'edge', from: 'process-api', to: 'api-gateway' } },
      { label: 'Overdue 997 acknowledgements are tracked and alerted', rule: { type: 'edge', from: 'process-api', to: 'monitoring' } },
    ],
    reference: diagram(
      {
        sup: ['partner', '300 suppliers (AS2 / SFTP / VAN)'],
        gw: ['api-gateway', 'B2B gateway: AS2 endpoint + SFTP (DMZ)'],
        pin: ['process-api', 'prc-b2b-inbound (envelope, parse X12, 997)'],
        prof: ['database', 'Partner profiles, control numbers, 997 tracking'],
        fs: ['file-store', 'Raw EDI archive (7 yrs)'],
        inq: ['queue', 'b2b.inbound.canonical'],
        pdoc: ['process-api', 'prc-supplier-documents (855 / 856 / 810)'],
        serp: ['system-api', 'sys-oracle-erp'],
        erp: ['erp', 'Oracle EBS (PO, AP)'],
        swms: ['system-api', 'sys-wms'],
        wms: ['wms', 'WMS (receiving)'],
        outq: ['queue', 'b2b.outbound'],
        pout: ['process-api', 'prc-b2b-outbound (850, 997)'],
        dlq: ['dlq', 'b2b DLQ'],
        mon: ['monitoring', 'B2B tracking dashboard'],
      },
      [
        'sup -> gw', 'gw -> pin', 'pin -> prof', 'pin -> fs', 'pin ~> inq', 'pin ~> dlq', 'pin -> mon',
        'inq ~> pdoc', 'pdoc -> serp', 'serp -> erp', 'pdoc -> swms', 'swms -> wms',
        'serp ~> outq', 'outq ~> pout', 'pout -> prof', 'pout -> fs', 'pout -> gw',
      ],
    ),
  },
  description: `
A DIY retailer buys from **300 suppliers**. Today a VAN mailbox and a 15-year-old translator handle EDI, and onboarding a supplier takes **6 weeks**. You are asked to design a Mule-based B2B gateway.

Facts:
- Documents: outbound **850** (PO), inbound **855** (PO ack), **856** (ASN), **810** (invoice); every document is acknowledged with a **997**.
- 40 large suppliers use **AS2**; 230 use **SFTP** (some push to us, some expect us to pull); 30 small suppliers will use a web portal (out of scope here).
- Each supplier has its own ISA/GS IDs, X12 version (4010 or 5010), separators, and some send non-standard segments.
- **Oracle EBS** owns POs and invoices; the **WMS** needs ASNs before trucks arrive.
- Volume: 20,000 documents/day, peaks of 2,000/hour on Monday mornings.
- Audit requires the raw files for 7 years. Buyers complain they never know when a supplier "did not get" a PO.

**Questions:**
- Draw the gateway and processing layers.
- Where do partner-specific settings live, and how does onboarding become configuration instead of code?
- How do you handle 997s in both directions and detect missing ones?
- How do you isolate one supplier sending garbage from the other 299?
`,
  answerTemplate: `## Topology

## Partner profiles and onboarding

## 997 handling and tracking

## Error isolation

## Scaling for Monday peaks
`,
  keyPoints: [
    'An edge layer terminates AS2 and SFTP (DMZ), then a generic inbound flow handles envelopes, parsing (X12 module), validation and 997 generation.',
    'Partner profiles (IDs, version, transport, endpoints, certificates, mapping variants, control numbers) live in data, so onboarding a standard supplier is configuration.',
    'Documents are converted to a canonical model and queued; business flows (PO ack, ASN, invoice) call Oracle and the WMS only through System APIs.',
    'Outbound 850s get control numbers and are tracked until a 997 arrives; overdue acknowledgements raise alerts to buyers.',
    'Raw files are archived before processing; per-document failures go to a DLQ with partner context, so one bad partner does not block the rest.',
  ],
  solution: `
\`\`\`
 Suppliers ─AS2/SFTP─► B2B gateway (DMZ) ─► prc-b2b-inbound ──► archive (raw, 7 yrs)
                                              │  ├─ partner profile lookup (IDs, version, map variant)
                                              │  ├─ X12 parse + validate ─► 997 back to partner
                                              │  └─ errors ─► DLQ (partnerId, docType, control #)
                                              └~► b2b.inbound.canonical ~► prc-supplier-documents
                                                         855 ─► sys-oracle-erp (PO ack)   856 ─► sys-wms (expected receipt)
                                                         810 ─► sys-oracle-erp (AP, 3-way match)
 Oracle PO released ~► b2b.outbound ~► prc-b2b-outbound ─► profile + control # ─► gateway ─► supplier
\`\`\`

**Edge.** AS2 endpoint (signing, encryption, MDN) and SFTP (inbound folders per partner, scheduled pulls for those who expect us to collect) in a DMZ. Identify the partner from the AS2 ID or SFTP account; nothing partner-specific is hard-coded.

**Partner profiles.** A profile store holds ISA/GS qualifiers and IDs, X12 version, separators, transport and endpoints, certificate references, which mapping variant to use, and the next control numbers. Standard suppliers onboard by adding a profile and running a certification test; only suppliers with non-standard segments need a mapping variant.

**Inbound.** Archive first (claim check), then parse with the X12 module, validate, generate a **997** (accepted / accepted with errors / rejected) and send it back. Valid documents are mapped to canonical JSON and queued. \`prc-supplier-documents\` routes by type: 855 updates PO lines in Oracle, 856 creates expected receipts in the WMS, 810 goes to AP for matching. Duplicates are detected by sender + control number.

**Outbound.** When Oracle releases a PO, an event triggers \`prc-b2b-outbound\`, which builds the 850 with the partner's version and control numbers, sends it, and records "awaiting 997". A scheduled check flags POs without a 997 after N hours (per profile) and alerts the buyer — this answers "the supplier never got it".

**Isolation and peaks.** Queues absorb Monday peaks; consumers scale horizontally. A partner sending malformed files gets 997 rejections and DLQ entries without blocking others; per-partner concurrency limits stop one big batch from starving everyone.

**Trade-offs:** Mule-built B2B gives full control but you own AS2 certificate rotation and partner management UI; a managed B2B/VAN service or Partner Manager can take over that edge if onboarding volume grows.
`,
  followUps: [
    { q: 'An ASN arrives before the 855 for the same PO. What happens?', a: 'Process each document independently against the PO in Oracle/WMS; the ASN creates the expected receipt even if the PO ack is late. Only reject when the PO itself is unknown, and park those in a retry queue for a while before raising an exception.' },
    { q: 'What is the difference between a 997 and an 855?', a: 'A 997 is a functional acknowledgement that the document was received and is syntactically valid; an 855 is a business answer to the PO (accepted, changed, back-ordered).' },
    { q: 'How do you rotate AS2 certificates for 40 partners without downtime?', a: 'Track certificate expiry in the profile store, exchange new certificates in advance, accept both old and new during an overlap window, and switch the signing certificate per partner on an agreed date.' },
    { q: 'Where would Anypoint Partner Manager fit?', a: 'It provides partner profiles, X12/EDIFACT handling, AS2/SFTP endpoints and tracking as a managed capability, replacing much of the custom edge and profile store; the Process and System APIs behind it stay the same.' },
  ],
}

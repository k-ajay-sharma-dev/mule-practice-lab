import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-054',
  category: 'case-studies',
  title: 'Electronics Distributor Moving EDI Off a VAN to AS2 and Partner APIs',
  level: 'INTERMEDIATE',
  tags: ['supply-chain', 'edi', 'x12', 'as2', 'b2b', 'oracle', 'oracle-ebs'],
  estMinutes: 35,
  diagram: {
    task: 'draw the B2B integration: top partners on direct AS2, smaller resellers on a REST API behind a gateway, the remaining VAN mailbox polled by a job, all inbound orders queued into one purchase-order Process API in front of Oracle EBS, and outbound documents driven by ERP events.',
    checks: [
      { label: 'Every partner channel enters through the gateway or an Experience API', rule: { type: 'each', of: 'partner', min: 2, edgeTo: ['api-gateway', 'experience-api'] } },
      { label: 'Inbound documents from AS2, API and the VAN are queued before processing', rule: { type: 'edge', from: ['experience-api', 'batch-job'], to: 'queue', kind: 'async', min: 2 } },
      { label: 'One purchase-order Process API handles orders from every channel', rule: { type: 'path', from: 'queue', to: 'erp', via: { type: 'process-api', label: ['order', 'po', 'purchase'] } } },
      { label: 'Oracle EBS is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Documents that cannot be processed go to a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
      { label: 'Order status changes leave the ERP as asynchronous events', rule: { type: 'edge', from: ['erp', 'system-api'], to: ['topic', 'queue', 'event-stream'], kind: 'async' } },
      { label: 'Outbound 855/856/810 documents are built by a Process API and sent to partner endpoints', rule: { type: 'path', from: ['topic', 'queue', 'event-stream'], to: 'external-api', via: 'process-api' } },
    ],
    reference: diagram(
      {
        p1: ['partner', 'Top 40 partners (AS2)'],
        p2: ['partner', 'Resellers (REST API)'],
        gw: ['api-gateway', 'API Manager (client ID, rate limit)'],
        eas2: ['experience-api', 'exp-as2-inbound'],
        eapi: ['experience-api', 'exp-partner-orders-api'],
        van: ['batch-job', 'VAN mailbox poller'],
        prc: ['process-api', 'prc-purchase-orders'],
        out: ['process-api', 'prc-outbound-documents'],
        inq: ['queue', 'b2b-inbound'],
        dlq: ['dlq', 'b2b-inbound DLQ'],
        ev: ['topic', 'order-status-events'],
        sebs: ['system-api', 'sys-ebs-orders-api'],
        ebs: ['erp', 'Oracle EBS (Order Management)'],
        trk: ['database', 'Partner profiles & message tracking'],
        vanfs: ['file-store', 'VAN mailbox'],
        pend: ['external-api', 'Partner AS2 / API endpoints'],
      },
      [
        'p1 -> eas2', 'p2 -> gw', 'gw -> eapi', 'eas2 ~> inq', 'eapi ~> inq', 'van -> vanfs', 'van ~> inq',
        'inq ~> prc', 'inq ~> dlq', 'prc -> trk', 'prc -> sebs', 'sebs -> ebs', 'sebs ~> ev', 'ev ~> out', 'out -> trk', 'out -> pend',
      ],
    ),
  },
  description: `
**Context.** An electronics distributor exchanges X12 EDI with 300 trading partners (retailers, resellers and a few manufacturers) through a value-added network (VAN).

**How it works today**
- Inbound 850 purchase orders arrive in a VAN mailbox, are downloaded every 30 minutes and parsed by a PL/SQL package into Oracle EBS interface tables.
- Outbound 855 acknowledgements, 856 ship notices and 810 invoices are built by the same package.

**The problem today**
- VAN charges per kilocharacter are now significant.
- The PL/SQL code is understood by one retiring developer.

**Goals**
- Move the top 40 partners (about 80% of volume) to direct AS2.
- Offer a simple REST order API for smaller resellers who struggle with EDI.
- Keep the VAN for the long tail until they can move.
- Track every document and its 997 functional acknowledgement in one place.

**Constraints**
| Item | Detail |
|---|---|
| ERP | Oracle EBS 12.2; orders created through the standard order import interface |
| Partners | Each AS2 partner needs its own certificates, IDs and test cycle |
| Volume | 6,000 850s a day, peaks of 3x in Q4 |
| SLA | 855 back to the partner within 2 hours of the 850 |

**Your task.** Propose:
- the B2B architecture
- a canonical order model
- the partner migration approach
- how you monitor documents
`,
  answerTemplate: `## Channels (AS2, API, VAN)

## Inbound flow to Oracle EBS

## Outbound documents (855, 856, 810)

## Acknowledgements and tracking

## Partner migration plan

## Risks
`,
  keyPoints: [
    'Three entry channels (AS2, REST API, VAN poller) converge on one queue and one purchase-order Process API using a canonical order model, so the EBS logic is written once.',
    'Oracle EBS is reached only through a System API that uses the standard order import interface, replacing the hand-written PL/SQL parser.',
    'Outbound 855/856/810 are triggered by ERP events and rendered per partner from profile data (IDs, versions, delivery channel).',
    'Every document is tracked with its control numbers and 997 status, and failures go to a DLQ with alerts, so the 2-hour SLA is visible.',
    'Partners are migrated in waves by volume, each with a test cycle and a fallback to the VAN until sign-off.',
  ],
  solution: `
**Phases**
1. **Build the core (months 1–2).** Canonical \`PurchaseOrder\` model; \`prc-purchase-orders\` validates, de-duplicates (partner ID + PO number) and calls \`sys-ebs-orders-api\`, which loads the EBS order import interface and starts the import. The VAN poller is moved into Mule first (\`batch-job\` downloading the mailbox), so the PL/SQL parser can be retired before any partner changes.
2. **AS2 waves (months 3–6).** \`exp-as2-inbound\` receives AS2 messages, returns the MDN, parses X12 with the X12 module, sends 997s and places the canonical order on the \`b2b-inbound\` queue. Partners move in waves of 5–10, ordered by volume, each with certificate exchange and a test cycle.
3. **Partner API (month 4 onward).** \`exp-partner-orders-api\` behind API Manager (client ID enforcement, rate limiting) for resellers; same canonical model, same queue.

**Outbound.** When orders are booked or shipped, EBS business events (or a \`db:listener\` on an agreed status table with a watermark column) are published by \`sys-ebs-orders-api\` to \`order-status-events\`. \`prc-outbound-documents\` reads the partner profile and builds an 855, 856 or 810 (or a JSON webhook for API partners) and sends it over the partner's channel.

**Tracking.** A tracking table records interchange/group/transaction control numbers, status and 997 result for every document. A dashboard shows documents without a 997 after X hours and 850s without an 855 near the 2-hour SLA.

**Governance.** Partner profiles (IDs, X12 version, channel, certificates and expiry dates) managed as configuration, not code. Certificate expiry alerts 30 days ahead. A B2B onboarding checklist per partner.

**Risks.** Certificate expiry stopping a channel; duplicate POs if a partner resends (idempotency key); partner-specific X12 variations (maps per partner on top of the canonical model); VAN contract end date forcing the pace.
`,
  followUps: [
    { q: 'Why not let each AS2 flow write straight into Oracle EBS?', a: 'The order logic would be copied per channel. Queuing a canonical order into one Process API means validation, de-duplication and EBS import are built and tested once.' },
    { q: 'What is the difference between the AS2 MDN and the X12 997?', a: 'The MDN confirms the AS2 message was received and its signature verified at the transport level; the 997 confirms the EDI content was syntactically accepted.' },
    { q: 'How do you prove you met the 2-hour 855 SLA?', a: 'Track the 850 receipt time and the 855 send time per PO in the tracking store and report or alert on any order approaching the limit.' },
  ],
}

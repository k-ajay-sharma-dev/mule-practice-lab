import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-035',
  category: 'case-studies',
  title: 'Freight Forwarder Automating Customs Declarations',
  level: 'INTERMEDIATE',
  tags: ['logistics', 'edi', 'b2b', 'partner-manager', 'compliance'],
  estMinutes: 40,
  diagram: {
    task: 'draw the customs automation: EDI and portal inbound flows converging on a canonical shipment Process API, specialist review for uncertain goods, the broker application, the customs gateway, status events and the audit archive.',
    checks: [
      { label: 'EDI trading partners enter through a B2B/EDI System API (or the portal through an Experience API)', rule: { type: 'each', of: 'partner', edgeTo: ['system-api', 'experience-api', 'api-gateway'] } },
      { label: 'EDI and portal uploads converge on one canonical shipment Process API', rule: { type: 'edge', from: ['queue', 'topic', 'experience-api', 'system-api'], to: 'process-api', min: 2 } },
      { label: 'Uncertain classifications are routed to a specialist review queue (human in the loop)', rule: { type: 'edge', from: 'process-api', to: { type: ['queue', 'internal-app'], label: ['review', 'specialist', 'manual'] } } },
      { label: 'The customs-broker application is reached only through a System API', rule: { type: 'only-via', target: { type: ['saas', 'legacy', 'erp'], label: ['broker'] }, from: 'system-api' } },
      { label: 'The customs system is reached only through a customs gateway System API', rule: { type: 'only-via', target: { type: ['external-api', 'legacy'], label: ['customs'] }, from: 'system-api' } },
      { label: 'Customs status changes are published asynchronously as events', rule: { type: 'edge', to: { type: ['topic', 'queue', 'event-stream'], label: ['status'] }, kind: 'async' } },
      { label: 'Customers are notified of status changes', rule: { type: 'path', from: ['topic', 'queue', 'event-stream'], to: 'notification' } },
      { label: 'Raw inbound and outbound messages are archived for audit', rule: { type: 'edge', from: 'system-api', to: ['file-store', 'database'], min: 2 } },
    ],
    reference: diagram(
      {
        edi: ['partner', 'Shipper EDI (AS2 / SFTP)'],
        portal: ['web-app', 'Customer portal (CSV upload)'],
        eapi: ['experience-api', 'exp-customer-portal-api'],
        ship: ['process-api', 'prc-shipments-api (canonical + validation)'],
        cus: ['process-api', 'prc-customs-api'],
        sub: ['process-api', 'prc-declaration-submission'],
        nf: ['process-api', 'prc-status-notifier'],
        q: ['queue', 'inbound-shipments'],
        rev: ['queue', 'specialist-review'],
        st: ['topic', 'declaration-status'],
        sedi: ['system-api', 'sys-b2b-edi-api (X12 / EDIFACT)'],
        sbr: ['system-api', 'sys-broker-app-api'],
        scg: ['system-api', 'sys-customs-gateway-api'],
        cls: ['database', 'Product classification store'],
        br: ['saas', 'Customs-broker application'],
        cust: ['external-api', 'National customs system'],
        notif: ['notification', 'Customer notifications'],
        arc: ['file-store', 'Immutable message archive'],
      },
      [
        'edi -> sedi', 'sedi ~> q', 'q ~> ship', 'portal -> eapi', 'eapi -> ship', 'ship -> cus', 'cus -> cls', 'cus ~> rev', 'cus -> sbr',
        'sbr -> br', 'sub -> sbr', 'sub -> scg', 'scg -> cust', 'scg ~> st', 'st ~> nf', 'nf -> sbr', 'nf -> notif',
        'sedi -> arc', 'scg -> arc',
      ],
    ),
  },
  description: `
**Context.** A freight forwarder handles imports and exports for ~2,000 shipper customers.
- Customers send shipment and commercial-invoice data as EDI (X12 and EDIFACT), CSV uploads and occasionally PDFs.
- Customs declarations are lodged with two national customs systems through their electronic interfaces (XML messages over a secure gateway).
- Responses (accepted, query, rejected, released) come back asynchronously.

**The problem today.** Declarations are assembled by hand in a customs-broker application.

**Goals**
- 70% of declarations created automatically from customer data within a year.
- Customs status (query, release) visible to customers in near real time.
- Every message sent to and received from customs is retained for audit.

**Constraints**
- Customs interfaces have strict schemas, certification testing and submission deadlines.
- Tariff classification still needs a licensed customs specialist for unclear goods.
- Customer data quality varies widely; many customers use slightly different EDI implementation guides.
- The customs-broker application stays the system of record for declarations.

**Your task.** Propose the B2B integration design, the human-in-the-loop process and audit approach.
`,
  answerTemplate: `## Inbound customer data (EDI, CSV, other)

## Canonical shipment model and validation

## Declaration assembly and human review

## Outbound to customs and asynchronous responses

## Visibility, audit and retention

## Risks
`,
  keyPoints: [
    'B2B onboarding and EDI handling (X12/EDIFACT parsing, partner-specific guides, acknowledgements) use B2B tooling such as Anypoint Partner Manager or the X12/EDIFACT connectors, with per-partner configuration.',
    'All inbound formats are mapped to a canonical shipment model and validated before any declaration is built.',
    'Automation creates draft declarations; low-confidence items (classification, valuation issues) are routed to a specialist work queue — human in the loop, not full autopilot.',
    'Customs submissions and responses are asynchronous and correlated by declaration reference, with status events published to customers.',
    'Every raw inbound/outbound message is stored immutably with metadata for the retention period required.',
  ],
  solution: `
**Inbound.** EDI partners are configured as trading partners (Anypoint Partner Manager where licensed, or X12/EDIFACT connectors in Mule apps) with their identifiers, transport (AS2, SFTP) and implementation-guide variations. Functional acknowledgements (997/CONTRL) are returned automatically. CSV uploads come through a customer portal API; PDFs go to an OCR/document-extraction service and are always reviewed by staff.

**Canonical model.** \`Shipment\` (parties, goods lines with description, HS code if supplied, value, origin, weights, transport). DataWeave maps each partner format; partner-specific maps are versioned. Validation checks mandatory fields, code lists (country, currency, units) and totals.

**Declaration assembly.** \`customs-papi\` applies rules: known products → reuse previous approved classification from a product-classification store; unknown or ambiguous goods → work queue for a licensed specialist. The result is a draft declaration created in the customs-broker application via its API.

**Outbound to customs.** Once approved in the broker app, a submission event triggers \`customs-gateway-sapi\` to build the schema-valid XML, sign/transport it as the customs interface requires, and record the reference. Responses arrive asynchronously (polling or inbound listener), are correlated by reference, update the broker app, and publish \`DeclarationStatusChanged\` events (to customer notifications and the tracking portal).

**Audit.** Raw messages (inbound EDI, outbound XML, customs responses) stored in immutable storage with hashes, timestamps and correlation IDs; searchable by shipment and declaration. Retention and deletion follow the regulator's period (kept generic here).

**Rollout.** Start with the top 20 customers by volume who already send clean EDI, one customs system, and simple goods. Track automation rate, rework rate and time to release.

**Risks.** Customs certification delays (plan test cycles early), wrong classification (specialist review, confidence thresholds), partner EDI variations (partner-specific maps, onboarding test suite), and deadline breaches (alerts on declarations close to cut-off).
`,
  followUps: [
    { q: 'Why not let the automation submit everything directly to customs?', a: 'Classification and valuation errors have legal and financial consequences. Automating the easy, known cases and routing uncertain ones to specialists improves speed without moving liability to an algorithm.' },
    { q: 'How do you handle a customer whose EDI differs from the standard?', a: 'Treat it as partner-specific configuration: a dedicated map or validation profile for that partner, tested with their sample files before go-live, without changing the canonical model.' },
    { q: 'What do you do when a customs response never arrives?', a: 'Each submission has an expected response time; a scheduled check flags overdue declarations, re-queries status through the customs interface, and alerts operations.' },
  ],
}

import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-019',
  category: 'case-studies',
  title: 'Pharma Company Exchanging Serialization Data With Partners',
  level: 'ADVANCED',
  tags: ['pharma', 'serialization', 'b2b', 'epcis', 'compliance'],
  estMinutes: 45,
  diagram: {
    task: 'draw the serialization B2B architecture: partners connecting through a B2B gateway driven by partner profiles, inbound documents buffered for validation, the traceability Process API, the System APIs for the repository, ERP and regulatory hubs, and the audit archive.',
    checks: [
      { label: 'Wholesalers and CMOs connect through a B2B gateway (AS2/SFTP), not straight into core processing', rule: { type: 'each', of: 'partner', min: 2, edgeTo: ['experience-api', 'api-gateway'] } },
      { label: 'Partner transport and format come from partner profiles (configuration, not code)', rule: { type: 'edge', from: ['experience-api', 'api-gateway', 'process-api'], to: { type: ['database', 'cache', 'file-store'], label: ['profile', 'partner'] } } },
      { label: 'Inbound EPCIS documents are buffered for asynchronous validation and processing', rule: { type: 'edge', from: ['experience-api', 'api-gateway'], to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'The serialization repository (system of record) is reached only through a System API', rule: { type: 'only-via', target: { type: ['database', 'saas', 'legacy'], label: ['serial', 'repository'] }, from: 'system-api' } },
      { label: 'The ERP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Government / industry hubs are reached only through System APIs', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'Every message payload is archived for audit and retention', rule: { type: 'edge', from: ['experience-api', 'api-gateway', 'process-api'], to: 'file-store' } },
      { label: 'Rejected or failing events land in an exception queue for the operations team', rule: { type: 'edge', to: 'dlq' } },
    ],
    reference: diagram(
      {
        wh: ['partner', 'Wholesalers / 3PLs'],
        cmo: ['partner', 'CMOs'],
        b2b: ['experience-api', 'b2b-gateway (AS2 / SFTP)'],
        trace: ['process-api', 'traceability-papi'],
        q: ['queue', 'inbound-epcis'],
        exq: ['dlq', 'serialization-exceptions'],
        sser: ['system-api', 'serialization-repo-sapi'],
        serp: ['system-api', 'erp-shipments-sapi'],
        shub: ['system-api', 'regulatory-hub-sapi'],
        prof: ['database', 'Partner profiles'],
        repo: ['database', 'Serialization repository (system of record)'],
        erp: ['erp', 'ERP (orders, shipments)'],
        hub: ['external-api', 'Regulatory hub API'],
        arch: ['file-store', 'Message archive + tracking'],
      },
      [
        'wh -> b2b', 'cmo -> b2b', 'b2b -> prof', 'b2b -> arch', 'b2b ~> q',
        'q ~> trace', 'q ~> exq', 'trace -> b2b',
        'trace -> sser', 'trace -> serp', 'trace -> shub',
        'sser -> repo', 'serp -> erp', 'shub -> hub',
      ],
    ),
  },
  description: `
**Context.** A pharmaceutical manufacturer must serialize every saleable pack (unique serial number per pack, aggregated into cases and pallets) and share traceability data with wholesalers, contract manufacturers (CMOs), third-party logistics providers and national verification systems in several markets. Regulations differ per market (keep them generic) but all require accurate, timely event data.

**Landscape**
- ERP (orders, shipments), a serialization/Level 4 site system per plant, and a corporate serialization repository (Level 4/5) that is the system of record for serial numbers and events.
- Partners exchange data as GS1 EPCIS XML documents over AS2 or SFTP; some markets require submitting data to a government or industry hub via its API.
- CMOs send commissioning and aggregation events for products they pack.

**Goals**
- Shipment event data reaches each wholesaler before or with the physical goods.
- Partner onboarding (new wholesaler/CMO) in weeks, not months.
- Full traceability and audit of every message sent and received.

**Constraints**
- Messages can be very large (pallets with tens of thousands of serials).
- Partners have different EPCIS versions and quirks.
- Errors in serialization data can block product from being sold.

**Your task.** Propose the B2B integration architecture, data handling and operating model.
`,
  answerTemplate: `## Architecture and system of record

## Partner connectivity and onboarding

## Message processing (large EPCIS documents)

## Validation, errors and exceptions

## Audit and compliance

## Risks
`,
  keyPoints: [
    'The serialization repository is the single system of record; Mule integrates it with ERP, plants, partners and regulatory hubs rather than storing serial data itself.',
    'Partner connectivity (AS2/SFTP/API) and partner-specific formats are separated from core processing via a partner profile/configuration, so onboarding is mostly configuration.',
    'Large EPCIS XML is processed with streaming (no full DOM load), and outbound documents are generated in chunks where partners allow it.',
    'Inbound CMO events are validated (schema, product master data, aggregation hierarchy) before loading, with clear rejection responses.',
    'Every message is tracked end to end (received, validated, delivered, acknowledged, e.g. AS2 MDN) with correlation to shipments, and stored for the retention period required.',
    'Shipment events are sent before or with dispatch; missing acknowledgements raise alerts to a business operations team.',
  ],
  solution: `
**Architecture.**
- **System of record**: corporate serialization repository. ERP shipment events trigger outbound EPCIS generation; plant systems and CMOs feed commissioning/aggregation events.
- **Mule layers**: \`serialization-repo-sapi\`, \`erp-shipments-sapi\`, \`regulatory-hub-sapi\` (one per market hub), \`b2b-gateway\` for partner transport, and \`traceability-papi\` orchestrating flows.
- **B2B transport**: AS2 and SFTP endpoints (Anypoint Partner Manager / B2B capabilities if licensed, or AS2 and SFTP connectors with your own partner configuration). AS2 with signing, encryption and MDNs.

**Partner profiles.** Each partner has a profile: identifiers (GLN), transport, EPCIS version, mapping variant, contacts, SLA. Onboarding = create profile, exchange certificates, run test messages against a validation suite, then go live.

**Processing large documents.** Use streaming XML reading in DataWeave (\`streaming=true\` reader property / deferred output) and repeatable file-store streams; avoid loading full documents into memory. For outbound, query aggregation hierarchies from the repository in pages and write the document progressively.

**Validation.** Inbound events checked for schema, known GTINs, valid serial ranges, consistent aggregation (no serial in two cases). Rejections returned to the CMO with reasons; partial acceptance only if the business process allows it. Exceptions land in a work queue for the serialization operations team.

**Audit.** Message store with metadata (partner, shipment, document ID, hashes, timestamps, MDN), payload archive in secure storage per retention rules, and dashboards: messages sent vs shipments, unacknowledged messages.

**Delivery plan.** Start with one market and the top wholesalers; build the partner-profile model early; add CMOs and further markets in waves.

**Risks.** Partner variance (strict conformance tests), document size and performance, certificate expiry for AS2 (alerts), and master data errors (GTIN/product data quality).
`,
  followUps: [
    { q: 'Would you store serial numbers in Mule (e.g. Object Store)?', a: 'No. Mule is the integration layer; serial numbers and events belong in the serialization repository, which is validated and audited. Mule keeps only message-tracking metadata.' },
    { q: 'How do you onboard a partner in weeks?', a: 'Templated partner profiles and mappings, a self-test suite partners run against, and a standard checklist (certificates, identifiers, test scenarios) owned by a B2B operations team.' },
    { q: 'How do you measure success?', a: 'Percentage of shipments with event data delivered before goods arrive, onboarding time per partner, rejected-message rate and number of saleability blocks caused by data errors.' },
  ],
}

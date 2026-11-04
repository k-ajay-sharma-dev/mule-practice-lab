import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-059',
  category: 'case-studies',
  title: '3PL Onboarding 200 Clients Onto a Configurable Warehouse Integration Platform',
  level: 'ADVANCED',
  tags: ['supply-chain', '3pl', 'wms', 'edi', 'x12', 'multi-tenant', 'b2b', 'onboarding'],
  estMinutes: 55,
  diagram: {
    task: 'draw the multi-client platform: clients on EDI, file and API channels normalised into a canonical warehouse-order queue, one warehouse-orders Process API using client profiles to create WMS orders, and WMS shipment events routed back to each client endpoint.',
    checks: [
      { label: 'Every client channel enters through the gateway or an Experience API', rule: { type: 'each', of: 'partner', min: 2, edgeTo: ['api-gateway', 'experience-api'] } },
      { label: 'Inbound orders from several channels are normalised onto a queue', rule: { type: 'edge', from: ['experience-api', 'batch-job'], to: 'queue', kind: 'async', min: 2 } },
      { label: 'One warehouse-orders Process API creates orders in the WMS', rule: { type: 'path', from: 'queue', to: 'wms', via: { type: 'process-api', label: ['order', 'warehouse'] } } },
      { label: 'The WMS is reached only through a System API', rule: { type: 'only-via', target: 'wms', from: 'system-api' } },
      { label: 'Client-specific behaviour comes from a profile/configuration store, not code', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'cache'], label: ['profile', 'config', 'client', 'partner'] } } },
      { label: 'Shipment confirmations leave the WMS as events', rule: { type: 'edge', from: ['wms', 'system-api'], to: ['topic', 'event-stream', 'queue'], kind: 'async' } },
      { label: 'An outbound Process API sends confirmations to each client endpoint', rule: { type: 'path', from: ['topic', 'event-stream'], to: 'external-api', via: 'process-api' } },
      { label: 'Messages that cannot be processed go to a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
    ],
    reference: diagram(
      {
        cedi: ['partner', 'EDI clients (X12 940 over AS2)'],
        capi: ['partner', 'API clients (e-commerce)'],
        gw: ['api-gateway', 'API Manager (client ID per client)'],
        eedi: ['experience-api', 'exp-edi-inbound'],
        eapi: ['experience-api', 'exp-client-orders-api'],
        sftp: ['batch-job', 'SFTP file intake (CSV clients)'],
        pwo: ['process-api', 'prc-warehouse-orders'],
        pout: ['process-api', 'prc-client-outbound'],
        oq: ['queue', 'canonical-warehouse-orders'],
        dlq: ['dlq', 'warehouse-orders DLQ'],
        sh: ['topic', 'shipment-confirmed'],
        swms: ['system-api', 'sys-wms-api'],
        wms: ['wms', 'Multi-client WMS'],
        prof: ['database', 'Client profiles & mapping config'],
        fs: ['file-store', 'Client SFTP folders'],
        cend: ['external-api', 'Client endpoints (AS2 / SFTP / webhooks)'],
      },
      [
        'cedi -> eedi', 'capi -> gw', 'gw -> eapi', 'eedi ~> oq', 'eapi ~> oq', 'sftp -> fs', 'sftp ~> oq',
        'oq ~> pwo', 'oq ~> dlq', 'pwo -> prof', 'pwo -> swms', 'swms -> wms', 'swms ~> sh', 'sh ~> pout',
        'pout -> prof', 'pout -> cend',
      ],
    ),
  },
  description: `
**Context.** A third-party logistics (3PL) company runs 12 warehouses for about 200 clients (retail brands, e-commerce sellers, consumer-goods manufacturers) on one multi-client WMS. Each client integration was built separately: some send X12 940 warehouse shipping orders and expect 945 confirmations and 846 inventory reports over AS2; others drop CSV files on SFTP; newer e-commerce clients want REST APIs and webhooks; two large clients send SAP IDocs. Onboarding a new client takes about three months of developer time, and sales says they lose deals because of it.

**Goals**
- Onboard a typical new client in two weeks, mostly by configuration.
- Support EDI, file and API channels with the same processing logic.
- Give each client visibility of their orders and inventory.
- Stop one client's peak (e.g. a flash sale) from delaying others.

**Constraints**
| Item | Detail |
|---|---|
| WMS | Exposes an order import API and publishes shipment and inventory events; licence charges per API call bundle |
| Volume | 150,000 orders a day normally, 5x in November; the largest client is 20% of volume |
| Contracts | SLAs per client, e.g. orders received by 14:00 ship same day |
| Security | Clients must never see each other's data |

**Your task.** Propose the integration platform architecture, the onboarding model, multi-tenancy controls and operating model.
`,
  answerTemplate: `## Canonical model (orders, receipts, shipments, inventory)

## Channels and adapters

## Core processing and the WMS

## Client configuration and onboarding

## Multi-tenancy: isolation and fairness

## Monitoring, SLAs and client visibility

## Risks
`,
  keyPoints: [
    'Define a canonical warehouse model (order, receipt/ASN, shipment confirmation, inventory snapshot); channels only translate between client formats and the canonical model.',
    'Channel adapters (EDI over AS2, SFTP files, REST/webhooks, IDocs) converge on one queue and one warehouse-orders Process API in front of the WMS System API.',
    'Client behaviour (IDs, formats, mapping overrides, endpoints, SLA cut-offs) lives in a profile store, so onboarding is mostly configuration plus testing.',
    'Every message carries the client ID; isolation is enforced at the gateway (client credentials per client), in the data layer and in outbound routing; fairness via per-client limits or separate queues for the largest clients.',
    'Outbound confirmations are driven by WMS events and routed per client profile; dashboards show each client its orders against SLA.',
  ],
  solution: `
**Phases**
1. **Canonical model and core (months 1–3).** Canonical messages for orders, receipts, shipments and inventory. \`prc-warehouse-orders\` validates against the client profile, de-duplicates on client + order number and calls \`sys-wms-api\` (batching calls where the WMS licence model rewards it).
2. **Adapters (months 2–5).** \`exp-edi-inbound\` (AS2 + X12 940/943 → canonical), \`exp-client-orders-api\` (REST behind API Manager, a client ID per client), an SFTP intake job for CSV clients with a configurable column mapping, and an IDoc adapter for the two SAP clients. All publish to \`canonical-warehouse-orders\`.
3. **Outbound (months 4–6).** WMS shipment and inventory events → \`sys-wms-api\` → \`shipment-confirmed\` topic → \`prc-client-outbound\`, which reads the profile and sends a 945, a CSV or a webhook.
4. **Migrate existing clients (months 6–15).** Move in waves by channel type, parallel-running with comparison of outputs, oldest custom code first.

**Multi-tenancy.** Client ID in every message and log; client credentials scoped per client; outbound routing only from the profile; separate queues (or message priority/limits) for the top clients so a flash sale cannot starve others; per-client rate limits on the API.

**Onboarding model.** A template project and checklist: create profile, choose channel, configure mappings, generate test messages, client test cycle, go-live. Target two weeks; only unusual clients need code (custom mapping module plugged in by profile).

**Governance.** Canonical model owned by a product owner; changes versioned. Client profiles stored with audit history. Operations runbook per channel.

**Risks.** Canonical model too rigid (extension fields per client, versioning), profile mistakes sending data to the wrong client (four-eyes approval on endpoint changes, automated tests), WMS API costs (batching, caching reference data), November peak (load tests at 5x, pre-scaled workers).
`,
  followUps: [
    { q: 'Would you build one Mule application per client?', a: 'No. Per-client apps multiply deployment and runtime costs and bring back the three-month onboarding. Shared adapters plus profiles cover most clients; only exceptional mappings are plugged in.' },
    { q: 'How do you stop one big client delaying others?', a: 'Give the largest clients their own queues and consumers or apply per-client limits on the shared queue, and size workers for the combined peak.' },
    { q: 'How do clients see their own order status?', a: 'An Experience API over a status store fed by the same events, filtered by the client ID from their credentials, plus scheduled reports for EDI clients.' },
  ],
}

import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-051',
  category: 'case-studies',
  title: 'Logistics Company Combining API-Led Layers With an Event-Driven Backbone',
  level: 'ADVANCED',
  tags: ['api-led', 'event-driven', 'async-api', 'schema-ownership', 'anypoint-mq'],
  estMinutes: 50,
  diagram: {
    task: 'draw the target state: System APIs publishing domain events to a backbone, a tracking Process API building a read model, Experience APIs answering tracking queries from it, and partner webhooks replacing polling.',
    checks: [
      { label: 'Depot scans enter through a scan System API (replacing the point-to-point script)', rule: { type: 'each', of: 'device', edgeTo: 'system-api' } },
      { label: 'System APIs publish domain events (scans, TMS, telematics) to the backbone', rule: { type: 'edge', from: 'system-api', to: ['event-stream', 'topic', 'queue'], kind: 'async', min: 3 } },
      { label: 'The backbone fans out to several independent consumers', rule: { type: 'edge', from: ['event-stream', 'topic'], kind: 'async', min: 3 } },
      { label: 'A tracking Process API consumes events and builds the tracking read model', rule: { type: 'path', from: ['event-stream', 'topic'], to: ['database', 'cache'], via: 'process-api' } },
      { label: 'The portal and shippers come in through the gateway', rule: { type: 'each', of: ['web-app', 'partner'], min: 2, edgeTo: 'api-gateway' } },
      { label: 'Tracking queries are answered from the read model, never by live calls from the Experience layer to System APIs', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Status changes are pushed to shippers by webhook', rule: { type: 'edge', from: ['experience-api', 'process-api'], to: 'external-api' } },
      { label: 'Failed webhook deliveries are parked in a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
    ],
    reference: diagram(
      {
        scanner: ['device', 'Depot scanners'],
        portal: ['web-app', 'Customer tracking portal'],
        ship: ['partner', 'Large shippers'],
        gw: ['api-gateway', 'API Manager (SLA tiers)'],
        eportal: ['experience-api', 'exp-tracking-portal-api'],
        epart: ['experience-api', 'exp-partner-tracking-api (+ webhooks)'],
        trk: ['process-api', 'prc-tracking'],
        ntf: ['process-api', 'prc-customer-notify'],
        bb: ['event-stream', 'Event backbone (ParcelScanned, ShipmentPlanned…)'],
        dlq: ['dlq', 'webhook-dlq'],
        sscan: ['system-api', 'sys-scan-api'],
        stms: ['system-api', 'sys-tms-api'],
        stel: ['system-api', 'sys-telematics-adapter'],
        rm: ['database', 'Tracking read model'],
        tms: ['legacy', 'TMS'],
        tel: ['saas', 'Telematics platform'],
        hooks: ['external-api', 'Shipper webhook endpoints'],
        notif: ['notification', 'Email / SMS'],
      },
      [
        'scanner -> sscan', 'sscan ~> bb', 'stms -> tms', 'stms ~> bb', 'stel -> tel', 'stel ~> bb',
        'bb ~> trk', 'bb ~> ntf', 'bb ~> epart', 'trk -> rm', 'ntf -> notif',
        'portal -> gw', 'ship -> gw', 'gw -> eportal', 'gw -> epart', 'eportal -> trk', 'epart -> trk', 'epart -> hooks', 'epart ~> dlq',
      ],
    ),
  },
  description: `
**Context.** A parcel and freight company (8 countries, ~2M shipments/week) uses Anypoint Platform with ~70 APIs in API-led layers. Systems: a **transport management system** (TMS), **warehouse management** (WMS) per country, a **telematics** platform for 4,000 trucks, SAP for finance, Salesforce for customer service, and a customer tracking portal plus partner APIs for large shippers.

**Problems today**
- Tracking status is assembled at request time by calling TMS, WMS and telematics: \`GET /shipments/{id}/tracking\` p95 is 2.5 s and fails when any system is down.
- Large shippers poll the tracking API every few minutes for thousands of parcels — 80% of all API traffic.
- Scan events from depots are sent point-to-point to 6 systems by a legacy script.
- A pilot with Kafka-style event streaming was started by one team, and another uses Anypoint MQ; nobody knows who decides event formats.

**Goals.** Real-time tracking for customers and partners, fewer polling calls, resilient flows, and a clear architecture for when to use APIs and when to use events.

**Your task.** Design the target architecture combining API-led connectivity with an event-driven backbone: decision rules for sync vs async, key events and APIs, event schema ownership and governance, and a migration path.
`,
  answerTemplate: `## Decision rules: when sync APIs, when events

## Target architecture

## Key events and their ownership

## Event schema governance

## Partner and customer access (reducing polling)

## Migration path and risks
`,
  keyPoints: [
    'Clear decision rules: synchronous APIs for queries needing an immediate answer and commands needing a direct result; events for facts that happened and must reach many consumers, for decoupling, and for high-volume streams.',
    'Positions events within API-led: System APIs (or adapters) publish domain events from source systems; Process-layer components consume, correlate and build read models; Experience APIs serve queries from read models and offer webhooks/streams to partners.',
    'Builds a tracking read model fed by scan, TMS and telematics events so tracking queries no longer depend on all source systems being up.',
    'Event ownership: the producing domain owns the event schema and its versioning; a registry/catalogue (e.g. AsyncAPI specs in Exchange) and compatibility rules govern changes.',
    'Reduces partner polling with webhooks or event subscriptions plus a bulk status endpoint, with rate-limit tiers for remaining polling.',
    'Pragmatic platform choice: a broker for durable queues/pub-sub (Anypoint MQ) and a streaming platform where replay and very high throughput are needed, with clear guidance; incremental migration from the legacy scan script.',
  ],
  solution: `
**Decision rules.**

| Use a synchronous API when… | Use an event when… |
|---|---|
| The caller needs an answer now (quote a price, check a slot) | Something has happened that others may care about (parcel scanned, truck arrived) |
| A command needs an immediate accept/reject (book a pickup) | Many consumers need the same fact, now or later |
| Low volume, request-driven | High volume, continuous streams (telematics, scans) |
| Strong consistency for that interaction | Eventual consistency is acceptable, and producers must not depend on consumers being up |

Often both: \`POST /pickups\` (sync accept, returns booking ID) → \`PickupBooked\` event for downstream systems.

**Target architecture.**

\`\`\`
 Depot scanners  TMS        WMS (x8)     Telematics
      |           |            |              |
 sys-scan-api  sys-tms-api  sys-wms-api   sys-telematics-adapter     (System layer: own source,
      \\           |            |             /                         publish domain events)
       ===================== EVENT BACKBONE =====================
         ParcelScanned  ShipmentPlanned  ParcelStored  VehiclePositionUpdated
       ==========================================================
           |                    |                     |
  prc-tracking (consumes,   prc-billing-events   prc-customer-notify     (Process layer)
  correlates -> tracking         -> SAP              -> email/SMS
  read model)
           |
  exp-tracking-portal-api   exp-partner-tracking-api (+ webhooks)      (Experience layer)
\`\`\`

- **System layer** keeps its role (unlock each system) and adds event publication: the scan API publishes \`ParcelScanned\` after accepting a scan; adapters convert TMS/WMS changes into domain events.
- **Process layer** subscribes, correlates events into a **tracking read model** (shipment timeline) and drives other processes (billing, notifications).
- **Experience layer** answers \`GET /tracking\` from the read model (fast, available even if TMS is down) and pushes updates to partners.

**Key events and ownership.**
| Event | Owner (producing domain) | Main consumers |
|---|---|---|
| ParcelScanned | Depot operations | Tracking, billing, customer notifications |
| ShipmentPlanned / RouteChanged | Transport planning (TMS) | Tracking, warehouse, ETA |
| ParcelStored / ParcelPicked | Warehouse | Tracking, inventory reporting |
| VehiclePositionUpdated | Fleet (telematics) | ETA calculation only — high volume, not sent to everyone |
| DeliveryCompleted | Last-mile | Tracking, billing, Salesforce |

**Schema governance.**
- The **producing domain owns** the event schema — like a System API owns its contract.
- Specs as **AsyncAPI** assets in Exchange alongside RAML/OAS; standard envelope (eventId, type, version, occurredAt, correlationId, source) plus a business payload.
- Compatibility rules: additive changes only within a major version; breaking changes publish a new event version in parallel for a migration period.
- Consumers must be idempotent (eventId) and tolerate out-of-order events (use sequence/timestamps per parcel).
- C4E reviews new event types for naming and to avoid "CRUD events" that leak database tables.

**Partners and polling.** Offer **webhooks** (partner registers a URL; \`exp-partner-tracking-api\` pushes status changes, signed, with retries and a DLQ) and a **bulk** \`POST /tracking/search\` for reconciliation. Keep polling but with SLA tiers so it can't dominate capacity. Expected result: most of the 80% polling traffic disappears.

**Platform choice.** Use Anypoint MQ (or the existing broker) for queues and pub/sub between Mule apps; where long retention, replay and very high throughput are needed (telematics, scan streams), a streaming platform consumed via the relevant Mule connector. Write the guidance down so teams stop choosing ad hoc.

**Migration path.**
1. Publish \`ParcelScanned\` from the scan API, keep the legacy script running in parallel; move the 6 consumers one by one, then retire the script.
2. Build the tracking read model and switch \`GET /tracking\` to it behind the same contract (consumers notice only the speed).
3. Launch partner webhooks with two pilot shippers; then the rest.
4. Add telematics-based ETA.

**Risks.** Eventual consistency confusing customers (show "last updated" time), duplicate/out-of-order events (idempotency, sequencing), schema sprawl (ownership and review), and operational maturity (DLQ monitoring, replay procedures, tracing with correlation IDs across async hops).
`,
  followUps: [
    { q: 'Does event-driven architecture replace API-led connectivity?', a: 'No, they complement each other. APIs remain the way to query and command; events distribute facts. The layered thinking — unlock systems, compose processes, tailor experiences — applies to both.' },
    { q: 'Who should own the ParcelScanned schema — the tracking team or depot operations?', a: 'Depot operations, the producing domain, because it knows what a scan means and is accountable for publishing it correctly. Consumers request changes but do not own the contract.' },
    { q: 'How do you make webhooks reliable?', a: 'Retry with backoff on failure, sign payloads so partners can verify them, include an event ID for deduplication, park repeated failures in a DLQ with alerts, and offer a bulk query endpoint so partners can reconcile missed events.' },
  ],
}

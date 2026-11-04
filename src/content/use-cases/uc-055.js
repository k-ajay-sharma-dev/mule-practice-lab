import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-055',
  category: 'use-cases',
  title: 'API-Led: Shipment Tracking for Customers, B2B Partners and Ops',
  level: 'ADVANCED',
  tags: ['api-led', 'application-network', 'logistics', 'event-driven', 'b2b', 'webhooks'],
  estMinutes: 40,
  diagram: {
    task: 'draw the tracking application network: the three channels and their Experience APIs, the query, event-normaliser and notification Process APIs, the event ingestion (scans via Kafka, carrier EDI, TMS), the read-model store and the webhook path to shippers.',
    checks: [
      { label: 'Public web/app, shipper systems and the control tower each call an Experience API', rule: { type: 'each', of: ['web-app', 'mobile-app', 'partner', 'internal-app'], min: 3, edgeTo: 'experience-api' } },
      { label: 'Every Experience API goes through a Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'CQRS: the query Process API reads the read model and never calls the TMS', rule: { type: 'no-edge', from: { type: 'process-api', label: ['shipment-tracking', 'query'] }, to: { type: 'system-api', label: ['tms'] } } },
      { label: 'Scanner events are consumed asynchronously from Kafka', rule: { type: 'edge', from: 'event-stream', to: ['system-api', 'process-api'], kind: 'async' } },
      { label: 'The event normaliser publishes milestone events asynchronously', rule: { type: 'edge', from: 'process-api', to: ['topic', 'queue', 'event-stream'], kind: 'async' } },
      { label: 'Milestone events reach shipper webhooks through the notification Process API', rule: { type: 'path', from: ['topic', 'queue'], via: 'process-api', to: 'partner' } },
      { label: 'Webhooks that still fail after 24 h of retries go to a dead-letter queue', rule: { type: 'edge', from: ['process-api', 'queue', 'topic'], to: 'dlq' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Public tracking page / app'],
        shipper: ['partner', 'Shipper systems (pull + webhooks)'],
        ops: ['internal-app', 'Ops control tower'],
        epub: ['experience-api', 'exp-public-tracking'],
        eb2b: ['experience-api', 'exp-b2b-tracking'],
        eops: ['experience-api', 'exp-ops-control-tower'],
        ptrk: ['process-api', 'prc-shipment-tracking (query)'],
        pevt: ['process-api', 'prc-tracking-events (normaliser)'],
        pnot: ['process-api', 'prc-tracking-notifications'],
        ms: ['topic', 'ShipmentMilestoneReached'],
        dlq: ['dlq', 'webhook-dlq'],
        scans: ['event-stream', 'Kafka scans topic'],
        scanner: ['device', 'Handheld scanners'],
        sscan: ['system-api', 'sys-scan-events'],
        sedi: ['system-api', 'sys-carrier-edi'],
        stms: ['system-api', 'sys-tms-shipments'],
        sstore: ['system-api', 'sys-tracking-store'],
        carriers: ['external-api', 'Subcontracted carriers (AS2 / EDI)'],
        tms: ['database', 'TMS (Oracle)'],
        rm: ['database', 'Tracking read model'],
      },
      [
        'web -> epub', 'shipper -> eb2b', 'ops -> eops', 'epub -> ptrk', 'eb2b -> ptrk', 'eb2b -> pnot', 'eops -> ptrk', 'ptrk -> sstore',
        'scanner ~> scans', 'scans ~> sscan', 'sscan ~> pevt', 'carriers -> sedi', 'sedi ~> pevt', 'stms ~> pevt', 'pevt -> stms', 'stms -> tms',
        'pevt -> sstore', 'sstore -> rm', 'pevt ~> ms', 'ms ~> pnot', 'pnot -> shipper', 'pnot ~> dlq',
      ],
    ),
  },
  description: `
A European freight and parcel logistics company wants a single **shipment tracking** capability. Today each channel queries the back ends directly and they report different statuses for the same shipment.

| Channel | Who | Needs | Volume |
|---|---|---|---|
| **Public tracking page + app** | Consignees (anonymous with tracking number) | Status, ETA window, proof of delivery (signature photo only with postcode check) | 3 M lookups/day, peak 900/s |
| **B2B tracking API** | 2,500 shipper customers (e-commerce merchants, manufacturers) | Pull status for their shipments **and** push notifications (webhooks) on milestones | 600 k pull calls/day + webhooks |
| **Ops control tower** (internal) | 200 dispatchers | Exceptions (delays, failed delivery, customs hold), full event history, vehicle position | Live dashboard |

| Source | Provides | Interface |
|---|---|---|
| **TMS** (transport management, Oracle DB) | Shipments, legs, planned route | DB + nightly batch |
| **Handheld scanners** (depots, couriers) | Scan events: pickup, hub in/out, out for delivery, delivered (+ signature) | Events via Kafka (~25 M events/day) |
| **Telematics** (vehicle GPS) | Vehicle position every 30 s | REST push/webhook from vendor |
| **Subcontracted carriers** (last mile in 6 countries) | Status messages | EDI **IFTSTA** / X12 **214** over AS2, some REST |
| **Customs broker system** | Customs holds/releases | SOAP |

Constraints:
- One **canonical status model** (e.g. 12 milestones) across all channels.
- Status visible to customers within **2 minutes** of a scan.
- B2B shippers must only access their own shipments; webhooks must be reliable (at-least-once, retries for 24 h).
- TMS cannot handle query load beyond ~50 queries/s.

**Questions:**
1. Design the application network. Which APIs are request/response, which are event-driven?
2. How do you serve 900 lookups/s without hitting the TMS?
3. Describe the flow from a courier's "delivered" scan to the shipper's webhook.
4. What is reused when the company adds a **returns** product next year?
`,
  answerTemplate: `## Experience APIs

## Process APIs (including event-driven processes)

## System APIs

## Tracking read model (how you serve the load)

## Sequence: scan → webhook

## Security / partner isolation

## Reuse (returns product)

## NFRs
`,
  keyPoints: [
    'System APIs (and event adapters) per source: sys-tms-shipments, sys-scan-events (Kafka consumer), sys-telematics, sys-carrier-edi (AS2 + EDIFACT/X12 via B2B/Partner Manager), sys-customs.',
    'A Process-layer event normaliser (prc-tracking-events) maps every source event to the canonical milestone model and updates a tracking read model (CQRS) — the query path never touches the TMS.',
    'prc-shipment-tracking serves queries from the read model; prc-tracking-notifications fans milestones out to shipper webhooks with retries, DLQ and per-subscriber delivery state.',
    'Experience APIs: exp-public-tracking (anonymous, minimal data, cached), exp-b2b-tracking (OAuth per shipper, pull + subscription management), exp-ops-control-tower (full history, exceptions).',
    'Shipper isolation is enforced by mapping client ID → shipper account and filtering in the Process layer; PoD photos require an extra verification.',
    'Returns reuses the scan/EDI ingestion, canonical model, read model and webhook machinery — new milestones and one Process API only.',
  ],
  solution: `
**API inventory**

| Layer | API | Type | Key resources / events | Responsibility | Consumers |
|---|---|---|---|---|---|
| Experience | **exp-public-tracking** | REST | \`GET /trackings/{trackingNo}\`, \`POST /trackings/{trackingNo}/proof-of-delivery\` (postcode check) | Minimal public view, CDN/HTTP caching | Web page, app |
| Experience | **exp-b2b-tracking** | REST | \`GET /v1/shipments/{id}\`, \`GET /v1/shipments?updatedSince=\`, \`POST/GET/DELETE /v1/webhook-subscriptions\` | Partner contract, shipper scoping | Shipper systems |
| Experience | **exp-ops-control-tower** | REST + SSE/WebSocket feed | \`GET /exceptions\`, \`GET /shipments/{id}/events\`, \`GET /vehicles/{id}/position\` | Ops views | Control tower UI |
| Process | **prc-shipment-tracking** | REST | \`GET /shipments/{id}\`, \`GET /shipments?shipperId=&updatedSince=\`, \`GET /shipments/{id}/events\` | Query canonical status from read model; ETA calculation | all Experience APIs |
| Process | **prc-tracking-events** | Event-driven | consumes scan, carrier, customs, TMS events → publishes \`ShipmentMilestoneReached\` | Normalise to 12 milestones, dedupe, ordering, update read model, detect exceptions | — |
| Process | **prc-tracking-notifications** | Event-driven + REST | consumes \`ShipmentMilestoneReached\`; \`/subscriptions\` | Match subscriptions, sign and deliver webhooks, retry 24 h, DLQ | exp-b2b-tracking |
| System | **sys-tms-shipments** | REST + CDC | \`GET /shipments/{id}\`, change events | Wrap TMS DB (low rate) | prc-tracking-events |
| System | **sys-scan-events** | Kafka consumer | \`scans\` topic | Decode scanner events | prc-tracking-events |
| System | **sys-telematics** | Webhook receiver | \`POST /positions\` | Vendor positions → canonical | prc-tracking-events, ops |
| System | **sys-carrier-edi** | AS2 + REST | IFTSTA / 214 in | Partner Manager / X12 & EDIFACT connectors → JSON | prc-tracking-events |
| System | **sys-customs** | REST over SOAP | \`GET /declarations/{id}\` + status events | Wrap broker system | prc-tracking-events |
| System | **sys-tracking-store** | REST | read model (e.g. PostgreSQL/Elastic/Redis) | Persist canonical shipment + event history | Process APIs |

\`\`\`
 [Public web/app]     [Shipper systems]          [Control tower]
        |                 |       ^ webhooks           |
 exp-public-tracking  exp-b2b-tracking  |      exp-ops-control-tower    Experience
        |                 |       |                     |
        +--------+--------+-------+---------------------+
                 v                |
        prc-shipment-tracking   prc-tracking-notifications              Process
                 |                ^
                 v                | ShipmentMilestoneReached (Anypoint MQ / Kafka)
          sys-tracking-store <-- prc-tracking-events
                                  ^    ^     ^      ^      ^
 sys-scan-events  sys-carrier-edi  sys-telematics  sys-customs  sys-tms-shipments  System
   (Kafka)          (AS2/EDI)        (webhook)      (SOAP)        (CDC/DB)
\`\`\`

**Serving 900 lookups/s.** The query path is **CQRS**: prc-tracking-events writes a denormalised read model in sys-tracking-store; prc-shipment-tracking reads only from it. The TMS sees only change capture and occasional enrichment calls. exp-public-tracking adds HTTP caching (short TTL, e.g. 30–60 s) or a CDN in front for repeat lookups of the same tracking number.

**Sequence — "delivered" scan to shipper webhook**
1. Courier scans → event on Kafka \`scans\` → sys-scan-events consumer.
2. prc-tracking-events: dedupe (scan ID), map to milestone **DELIVERED**, check ordering (ignore an older "out for delivery" arriving later), store PoD reference, update read model.
3. Publish \`ShipmentMilestoneReached { shipmentId, shipperId, milestone, timestamp }\`.
4. prc-tracking-notifications: find shipper subscriptions for DELIVERED, POST signed payload (HMAC header) to each URL, with timeouts. 2xx → delivered; otherwise exponential retries for 24 h via a retry queue, then DLQ + shipper-visible delivery log.
5. Elapsed < 2 minutes at normal load; queue depth and end-to-end lag are monitored.

**Partner isolation.** Each shipper has an API Manager client application; exp-b2b-tracking maps client ID → shipperId and passes it down; prc-shipment-tracking filters every query by shipperId. Webhook subscriptions are owned by the shipper and can only target HTTPS URLs they registered. Public tracking returns only status/ETA; proof-of-delivery image requires tracking number **and** delivery postcode.

**Reuse for returns.** Returns adds new milestones (RETURN_CREATED, RETURN_RECEIVED) and a **prc-returns** Process API (label creation, drop-off points) plus resources on the Experience APIs. Reused unchanged: all ingestion System APIs, prc-tracking-events (new mappings only), sys-tracking-store, prc-tracking-notifications and the webhook contract (new event types are additive).

**Errors and NFRs.**
- Out-of-order and duplicate events are normal: idempotent upserts keyed by source event ID; milestone precedence rules.
- Unknown tracking numbers in EDI → parked for reconciliation, not dropped.
- Scaling: event consumers partitioned by shipment ID to keep ordering per shipment while scaling horizontally.
- B2B SLA tiers; \`updatedSince\` polling limited (e.g. 1 call/min) to push heavy shippers towards webhooks.
- Observability: correlation by shipment ID across all layers; dashboards for lag scan→read model and webhook success rate per shipper.
`,
  followUps: [
    { q: 'Isn\'t a read model duplicating the TMS data?', a: 'Yes, deliberately: it is a query-optimised projection built from events. The TMS stays the system of record for planning; the read model serves high-volume reads and is rebuildable by replaying events.' },
    { q: 'Why not let shippers subscribe to Kafka directly?', a: 'Exposing internal Kafka topics to 2,500 external parties creates security and coupling problems. Webhooks behind an Experience API give a stable, governed contract with per-shipper filtering and delivery tracking.' },
    { q: 'A shipper\'s endpoint is down for two days. What happens?', a: 'Retries stop after 24 h and events go to a per-shipper DLQ/delivery log; the shipper can catch up via the pull API with updatedSince, and the subscription may be suspended with an alert to them.' },
  ],
}

import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-057',
  category: 'case-studies',
  title: 'Pharma Distributor Proving Cold Chain Compliance for Temperature-Sensitive Shipments',
  level: 'INTERMEDIATE',
  tags: ['supply-chain', 'cold-chain', 'pharma', 'iot', 'tms', 'compliance', 'events'],
  estMinutes: 45,
  diagram: {
    task: 'draw the cold chain platform: logger readings entering through a gateway and an ingest Experience API onto an event stream, raw readings archived for audit, an excursion-detection Process API enriched with shipment data from the TMS, and excursion events fanned out to QA case handling and alerts.',
    checks: [
      { label: 'Loggers and vehicle gateways send readings through the API gateway to an ingest Experience API', rule: { type: 'path', from: 'device', to: 'experience-api', via: 'api-gateway' } },
      { label: 'Readings are buffered on an event stream or queue, not processed inline', rule: { type: 'edge', from: 'experience-api', to: ['event-stream', 'queue'], kind: 'async' } },
      { label: 'An excursion-detection Process API consumes the readings', rule: { type: 'edge', from: ['event-stream', 'queue'], to: { type: 'process-api', label: ['excursion', 'temperature', 'cold'] } } },
      { label: 'Every raw reading is archived for audit evidence', rule: { type: 'path', from: ['event-stream', 'queue'], to: ['data-warehouse', 'file-store'] } },
      { label: 'Excursion detection looks up shipment and product limits from the TMS', rule: { type: 'path', from: { type: 'process-api', label: ['excursion', 'temperature', 'cold'] }, to: 'tms' } },
      { label: 'Excursions are published once and fanned out to several consumers', rule: { type: 'edge', from: 'topic', kind: 'async', min: 2 } },
      { label: 'QA and drivers are alerted', rule: { type: 'path', from: 'topic', to: 'notification' } },
      { label: 'The TMS and the quality system are reached only through System APIs', rule: { type: 'only-via', target: ['tms', 'saas'], from: 'system-api' } },
    ],
    reference: diagram(
      {
        dev: ['device', 'Data loggers & vehicle gateways'],
        gw: ['api-gateway', 'API gateway (client ID, mTLS)'],
        ei: ['experience-api', 'exp-telemetry-ingest-api'],
        ex: ['process-api', 'prc-excursion-detection'],
        qa: ['process-api', 'prc-qa-case'],
        al: ['process-api', 'prc-alerting'],
        ts: ['event-stream', 'temperature-readings'],
        at: ['topic', 'excursion-events'],
        stms: ['system-api', 'sys-tms-api'],
        sqms: ['system-api', 'sys-qms-api'],
        tms: ['tms', 'Transport management (TMS)'],
        qms: ['saas', 'Quality management system'],
        lake: ['data-warehouse', 'Compliance data lake'],
        notif: ['notification', 'QA on-call & driver alerts'],
      },
      [
        'dev -> gw', 'gw -> ei', 'ei ~> ts', 'ts ~> ex', 'ts ~> lake', 'ex -> stms', 'stms -> tms', 'ex ~> at',
        'at ~> qa', 'at ~> al', 'qa -> sqms', 'sqms -> qms', 'al -> notif',
      ],
    ),
  },
  description: `
**Context.** A pharmaceutical wholesaler distributes vaccines, biologics and insulin from four temperature-controlled warehouses to hospitals and pharmacies using its own refrigerated fleet and two subcontracted carriers. Data loggers record temperatures, but data is downloaded from loggers only when they come back to the depot, so excursions are found days later. An inspector recently asked how the company knows each delivery stayed within 2–8 °C, and the answer took two weeks to assemble.

**Goals**
- Detect temperature excursions within 5 minutes during transport and storage.
- Open a quality case automatically and alert QA and the driver.
- Produce a complete temperature record for any shipment on request.

**Constraints**
| Item | Detail |
|---|---|
| Devices | 1,500 connected loggers and vehicle gateways, sending a reading every 1–5 minutes; they buffer when out of coverage |
| Shipments | TMS knows which logger travels with which shipment and the product temperature limits |
| Quality | QMS is a SaaS product with a REST API for opening deviations |
| Compliance | Records must be complete, tamper-evident and kept for several years (GDP expectations, kept generic) |
| Carriers | Subcontracted carriers use their own loggers and portals |

**Your task.** Propose the architecture for telemetry ingestion, excursion detection, quality cases and audit evidence.
`,
  answerTemplate: `## Data sources and volumes

## Ingestion and buffering

## Excursion detection (limits, duration, shipment context)

## Quality case and alerting

## Audit evidence and retention

## Subcontracted carriers

## Risks
`,
  keyPoints: [
    'Ingest readings through a secured gateway into a thin Experience API that only validates and publishes to an event stream, so bursts of buffered readings never overload processing.',
    'Excursion rules need shipment context (product limits, allowed time out of range) from the TMS, cached per shipment, not hard-coded thresholds.',
    'Excursions become events fanned out to QA case creation in the QMS and to alerting; the QMS is reached only through a System API.',
    'Every raw reading is archived immutably for audit, separate from operational processing; gaps in readings are themselves detected and reported.',
    'Subcontracted carriers are integrated through their portals/APIs into the same reading model so the shipment record is complete.',
  ],
  solution: `
**Phases**
1. **Ingest (months 1–2).** Loggers and gateways post batches of readings to \`exp-telemetry-ingest-api\` behind the gateway (client ID per device fleet, mTLS). The API validates and publishes each reading (device ID, timestamp in UTC, temperature, location) to the \`temperature-readings\` stream, keyed by device so order is kept per device.
2. **Archive (month 2).** A consumer writes every reading to a compliance data lake (write-once storage, retention policy). Out-of-order readings from buffered devices are stored by device timestamp, not arrival time.
3. **Detect (months 3–4).** \`prc-excursion-detection\` resolves device → shipment → product limits via \`sys-tms-api\` (cached per shipment), evaluates rules (outside 2–8 °C for longer than the allowed duration, missing readings for more than N minutes) and publishes \`ExcursionDetected\` to \`excursion-events\`.
4. **Act (months 4–5).** \`prc-qa-case\` opens a deviation in the QMS through \`sys-qms-api\`, linking the shipment and readings; \`prc-alerting\` notifies QA on-call and the driver. When QA releases or rejects the stock, the decision is recorded against the shipment.
5. **Carriers (month 6).** Poll or receive carrier logger data and publish it to the same stream with the same model.

**Governance.** Validated system approach for the parts that make GxP decisions (documented requirements, testing, change control). Clocks synchronised; time zones handled as UTC.

**Risks.** Late readings from devices that were out of coverage (event-time processing, allow late arrivals), false alarms during door openings (duration rules), device-to-shipment mapping errors (validated at dispatch scan), and carrier data gaps (contractual requirements and gap alerts).
`,
  followUps: [
    { q: 'Why not let the ingest API check thresholds itself?', a: 'It would need shipment context and rule logic, making it slow and hard to change. Keeping it thin means it only accepts and publishes, and the detection logic evolves separately.' },
    { q: 'How do you handle readings that arrive hours late?', a: 'Process them by device timestamp, re-evaluate the affected shipment window, and raise an excursion even if late; the archive is ordered by event time.' },
    { q: 'What makes the archive acceptable as audit evidence?', a: 'It is complete (gap detection), unchanged after writing (write-once storage or hashing), retained for the required period and traceable to device and shipment.' },
  ],
}

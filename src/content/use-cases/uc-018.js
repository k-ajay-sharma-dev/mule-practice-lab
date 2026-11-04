import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-018',
  category: 'use-cases',
  title: 'IoT Telemetry from Refrigerated Trucks',
  level: 'ADVANCED',
  tags: ['iot', 'mqtt', 'kafka', 'streaming', 'alerting'],
  estMinutes: 35,
  diagram: {
    task: 'draw the telemetry architecture: trucks publishing over MQTT, the Kafka log, the archive and time-series stores, excursion detection and Mule alert enrichment, the 5-minute TMS push, and the history API for customer portals.',
    checks: [
      { label: 'Truck gateways publish to an MQTT broker', rule: { type: 'edge', from: 'device', to: ['topic', 'event-stream', 'queue'] } },
      { label: 'A durable log (Kafka) sits between the broker and the alert flow', rule: { type: 'path', from: 'device', via: 'event-stream', to: 'notification' } },
      { label: 'Raw data is archived for 5 years', rule: { type: 'path', from: 'event-stream', to: ['file-store', 'data-warehouse'] } },
      { label: 'Alerts are enriched with shipment context from the TMS', rule: { type: 'path', from: ['event-stream', 'topic'], to: { type: ['saas', 'erp', 'legacy', 'database'], label: ['tms', 'transport'] } } },
      { label: 'A scheduled job sends the TMS one position update per shipment every 5 minutes', rule: { type: 'path', from: 'batch-job', to: { type: ['saas', 'erp', 'legacy'], label: ['tms', 'transport'] } } },
      { label: 'The TMS is reached only through a System API', rule: { type: 'only-via', target: { type: ['saas', 'erp', 'legacy', 'database'], label: ['tms', 'transport'] }, from: 'system-api' } },
      { label: 'Customer portals get history from a store, not from Kafka', rule: { type: 'path', from: 'web-app', to: ['database', 'data-warehouse', 'file-store'] } },
      { label: 'The history API never reads the raw stream directly', rule: { type: 'no-edge', from: 'experience-api', to: ['event-stream', 'topic'] } },
    ],
    reference: diagram(
      {
        truck: ['device', 'Truck gateways (MQTT)'],
        mqtt: ['topic', 'MQTT broker / IoT hub'],
        kraw: ['event-stream', 'Kafka telemetry.raw (by truck)'],
        det: ['process-api', 'Excursion detector (stream processing)'],
        kal: ['event-stream', 'Kafka telemetry.alerts'],
        alert: ['process-api', 'prc-alert-enrichment (Mule)'],
        stms: ['system-api', 'sys-tms-api'],
        tms: ['saas', 'TMS'],
        notif: ['notification', 'Customer alerts / on-call'],
        arch: ['file-store', 'S3 archive (5 years)'],
        ts: ['database', 'Time-series DB'],
        tmsjob: ['batch-job', 'TMS position push (every 5 min)'],
        portal: ['web-app', 'Customer portal'],
        eh: ['experience-api', 'exp-shipment-telemetry-api'],
      },
      [
        'truck ~> mqtt', 'mqtt ~> kraw', 'kraw ~> det', 'det ~> kal', 'kal ~> alert', 'alert -> stms', 'stms -> tms', 'alert -> notif',
        'kraw ~> arch', 'kraw ~> ts', 'tmsjob -> ts', 'tmsjob -> stms', 'portal -> eh', 'eh -> ts',
      ],
    ),
  },
  description: `
A cold-chain logistics company runs **2,500 refrigerated trucks**. Each truck has a gateway that sends telemetry over **MQTT**: temperature (per compartment), door open/closed, GPS position and engine status.

Facts:
- One message every **10 seconds** per truck (≈ 250 msg/s, ~22 million/day); trucks lose connectivity in tunnels and rural areas and then send **buffered backlogs** (out of order, up to 6 hours old).
- Pharmaceutical customers require an **alert within 2 minutes** when a compartment is outside its range (e.g. 2–8 °C) for more than 5 consecutive minutes.
- Raw data must be retained **5 years** for audits (GDP – Good Distribution Practice).
- The **TMS** (transport management system, REST API) needs the latest position and ETA every 5 minutes per active shipment.
- Customers' portals call an API to get the temperature history of their shipment.

**Describe the architecture:**
- How do you ingest the stream and where does Mule fit (and where does it not)?
- How do you detect "out of range for 5 minutes" reliably with late and out-of-order data?
- How do you feed the TMS without flooding it?
- How do you store data for 5 years and serve the history API?
`,
  answerTemplate: `## Ingestion architecture

## Role of Mule

## Excursion detection

## TMS updates

## Storage and history API

## Operations
`,
  keyPoints: [
    'MQTT broker (managed IoT hub) bridges into a durable log such as Kafka; Mule is not the raw broker and does not hold 22M messages/day in memory or Object Store.',
    'Mule used for integration edges: consuming aggregated/alert topics, enriching with shipment context, calling the TMS and alerting systems, and exposing the history API.',
    'Excursion detection uses event time (device timestamp) with per-truck/compartment state; ideally in a stream processor, otherwise a stateful consumer keyed by truck with ordered partitions.',
    'TMS receives a throttled, de-duplicated latest position per shipment every 5 minutes, not every raw message.',
    'Raw data landed in cheap object storage/time-series store with lifecycle policies for 5-year retention; history API queries that store, not Kafka.',
    'Late backlog data is processed (excursions in the past still recorded and reported) and gaps in telemetry are themselves alerted.',
  ],
  solution: `
**Ingestion architecture.**
1. Truck gateways publish to an **MQTT broker** (e.g. a managed cloud IoT service) with per-device certificates/credentials.
2. A bridge streams messages into **Apache Kafka** (topic \`telemetry.raw\`, partitioned by truck ID so each truck's data stays ordered).
3. Consumers:
   - **Archive sink** → object storage (e.g. S3, compressed, partitioned by date/truck) for 5-year retention, plus a **time-series database** for recent queries.
   - **Stream processing** (Kafka Streams/Flink or the IoT platform's rules engine) for windowed excursion detection → topic \`telemetry.alerts\`.
   - **Position aggregator** → topic \`shipment.position\` with the latest position per truck.

**Role of Mule.** Mule is excellent at integrating systems but is not a high-volume stream processor or long-term store. Use it where business context and APIs meet:
- Consume \`telemetry.alerts\` (Apache Kafka connector), enrich with **shipment and customer** (TMS System API: which shipment is on this truck, which temperature range applies), and send alerts (customer notification API, on-call tool, email/SMS).
- Push positions/ETAs to the TMS.
- Expose the **Shipment Telemetry API** for customer portals.
Mule *could* subscribe to MQTT directly (there is an MQTT connector) for small volumes, but at 250 msg/s with backlog bursts a durable log in between is the safer design.

**Excursion detection.**
- Use **event time** (device timestamp), not arrival time. Keep state per truck+compartment: when did the current out-of-range run start?
- Trigger an alert when the run exceeds 5 minutes of event time; send *recovery* when back in range.
- Out-of-order/late data: windowing with an allowed lateness; backlog data that reveals a past excursion still produces an alert flagged **late** ("excursion between 02:10 and 02:40 detected on reconnect") — the customer still needs it for product release decisions.
- Missing data is a risk too: no telemetry from an active truck for 15 minutes → "connectivity lost" alert.
- If no stream processor is available, a Mule consumer can keep this state in a fast external store keyed by truck — but call out that this is the weaker option.

**TMS updates.** A Mule scheduled flow every 5 minutes reads the latest position per active shipment (from the aggregator topic/state or time-series DB) and sends **one bulk update** (or one call per shipment, throttled) — ~2,500 updates per 5 minutes instead of 75,000 raw messages. Skip trucks that have not moved.

**Storage and history API.** \`GET /shipments/{id}/temperatures?from&to\` resolves the truck and time window of the shipment and queries the **time-series DB** (recent) or the archive (older, via a query engine over object storage). Page or downsample results (e.g. 1-minute averages with min/max) to keep responses small. Secure with OAuth 2.0 and enforce that customers see only their own shipments. Object storage lifecycle rules move data to colder tiers and delete after 5 years.

**Operations.** Monitor Kafka consumer lag (the true indicator of the 2-minute alert SLA), alert-flow error rates and DLQ. Reprocessing is possible by resetting consumer offsets because Kafka retains raw data for days.
`,
  followUps: [
    { q: 'Why not put Anypoint MQ between MQTT and Mule?', a: 'It works for moderate volumes, but for a continuous 250+ msg/s stream with replay needs and per-key ordering, a partitioned log like Kafka is a better fit; Anypoint MQ shines for business messaging between integrations.' },
    { q: 'How do you avoid alert storms when a truck flaps around 8 °C?', a: 'Hysteresis (alert above 8.0, recover below 7.5), the 5-minute duration rule, and de-duplication so one excursion yields one alert plus one recovery.' },
    { q: 'How do you test the excursion logic?', a: 'Feed recorded or synthetic event sequences (in order, out of order, with gaps) into the detector and assert the alerts; replay real incidents from the archive as regression tests.' },
  ],
}

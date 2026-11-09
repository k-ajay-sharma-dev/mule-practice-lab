import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-114',
  category: 'use-cases',
  title: 'Wind Farm Turbine Telemetry with Store-and-Forward Site Buffers',
  level: 'ADVANCED',
  tags: ['iot', 'buffering', 'mqtt', 'kafka', 'streaming', 'sap'],
  estMinutes: 40,
  diagram: {
    task: 'draw the telemetry platform: turbines publishing to a site buffer, the central ingress and Kafka telemetry topic, the time-series store and data lake, the fault detector and fault topic, the Mule work order flow into SAP PM, the 5 minute grid availability report, and the operator dashboard API.',
    checks: [
      { label: 'Turbines publish to a buffer at the site first', rule: { type: 'edge', from: 'device', to: { type: ['queue', 'topic', 'event-stream'], label: ['site', 'edge', 'buffer'] }, kind: 'async' } },
      { label: 'Telemetry reaches Kafka only by async hops', rule: { type: 'path', from: 'device', to: 'event-stream', kind: 'async' } },
      { label: 'Turbines never call central APIs synchronously', rule: { type: 'no-path', from: 'device', to: ['experience-api', 'process-api', 'system-api', 'erp'], kind: 'sync' } },
      { label: 'Raw telemetry is kept in a data lake', rule: { type: 'path', from: 'event-stream', to: ['file-store', 's3-bucket', 'azure-blob', 'data-warehouse'] } },
      { label: 'Faults are published on their own topic', rule: { type: 'node', match: { type: ['event-stream', 'topic', 'queue'], label: ['fault', 'alarm', 'alert'] } } },
      { label: 'Work orders are created from fault events through Mule', rule: { type: 'path', from: { type: ['event-stream', 'topic', 'queue'], label: ['fault', 'alarm', 'alert'] }, via: 'process-api', to: 'erp' } },
      { label: 'The raw telemetry stream does not feed SAP directly', rule: { type: 'no-path', from: { type: 'event-stream', label: 'telemetry' }, to: 'erp', unless: { type: ['event-stream', 'topic', 'queue'], label: ['fault', 'alarm', 'alert'] } } },
      { label: 'SAP PM is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'A scheduled job reads the time-series store for the grid report', rule: { type: 'edge', from: 'batch-job', to: 'database' } },
      { label: 'The grid operator is reached only through a System API', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'The dashboard reads the time-series store through its Experience API', rule: { type: 'path', from: 'internal-app', via: 'experience-api', to: 'database' } },
      { label: 'The dashboard API never reads Kafka directly', rule: { type: 'no-edge', from: 'experience-api', to: ['event-stream', 'topic'] } },
    ],
    reference: diagram(
      {
        scada: ['device', 'Turbine controllers (SCADA, 1 Hz)'],
        edge: ['queue', 'Site edge buffer (72 h store and forward)'],
        hub: ['topic', 'Central MQTT ingress'],
        k: ['event-stream', 'Kafka turbine.telemetry (key turbineId)'],
        ts: ['database', 'Time-series DB (90 days)'],
        lake: ['s3-bucket', 'Data lake (raw, 10 years)'],
        det: ['process-api', 'Fault detector (stream job)'],
        fault: ['event-stream', 'Kafka turbine.faults'],
        wo: ['process-api', 'prc-maintenance-orders'],
        ssap: ['system-api', 'sys-sap-pm-api'],
        sap: ['erp', 'SAP PM'],
        rep: ['batch-job', 'Grid availability report (5 min)'],
        sgrid: ['system-api', 'sys-grid-operator-api'],
        grid: ['external-api', 'Grid operator API'],
        dash: ['internal-app', 'Control room dashboard'],
        exp: ['experience-api', 'exp-fleet-telemetry-api'],
      },
      [
        'scada ~> edge', 'edge ~> hub', 'hub ~> k', 'k ~> ts', 'k ~> lake', 'k ~> det', 'det ~> fault', 'fault ~> wo', 'wo -> ssap', 'ssap -> sap',
        'rep -> ts', 'rep -> sgrid', 'sgrid -> grid', 'dash -> exp', 'exp -> ts',
      ],
    ),
  },
  description: `
An energy company operates **600 wind turbines on 15 wind farms**, many offshore or in remote hills.

Facts:
- Each turbine controller (SCADA) produces about **200 values per second** (wind speed, rotor speed, power, pitch, temperatures, vibration). A site gateway sends 10 second summaries centrally: about **60 messages per second** in total, plus raw 1 Hz data on request.
- Site links (microwave, 4G, satellite) **drop for hours**, sometimes 2 days in winter storms. No data may be lost: the regulator and the turbine warranty both need complete history.
- Fault codes (for example gearbox oil temperature high) must create a **maintenance work order in SAP PM** within 10 minutes of reaching the centre. A turbine can repeat the same fault code hundreds of times while it lasts.
- The **grid operator** needs each farm's available capacity every 5 minutes through its REST API.
- The control room dashboard shows the last 24 hours of any turbine.
- Data must be kept **10 years**.

**Describe the architecture:**
- How does data get from the turbine to the centre, and what happens when a link is down?
- Where does Mule fit, and where does it not?
- How do you turn a stream of repeated fault codes into one work order?
- How do you feed the grid operator when some sites are offline?
`,
  answerTemplate: `## Site buffering

## Central ingestion

## Role of Mule

## Faults to work orders

## Grid report and dashboards

## Operations
`,
  keyPoints: [
    'Each site has a store-and-forward buffer (local broker or edge gateway with disk queue) sized for 72 hours; it forwards with QoS 1 and resends from where it stopped.',
    'Central ingress (MQTT or IoT hub) bridges into Kafka keyed by turbineId, so each turbine stays ordered; storage and analytics read Kafka, not Mule.',
    'Every reading carries the turbine timestamp, so backlog data after an outage is stored at the right time and flagged as late.',
    'A stream job turns raw readings into fault events (start and clear); Mule consumes only the fault topic and creates one SAP PM notification per open fault.',
    'Work orders are idempotent: key by turbine and fault episode, and update the open order instead of creating a new one for repeats.',
    'The grid report is a scheduled job that reads the time-series store and marks farms with stale data as "unknown" instead of reporting old values.',
  ],
  solution: `
\`\`\`
 SCADA ~> site edge buffer (72 h) ~> central MQTT ingress ~> Kafka turbine.telemetry (key turbineId)
   Kafka ~> time-series DB, data lake (10 years), fault detector ~> Kafka turbine.faults
   turbine.faults ~> prc-maintenance-orders -> sys-sap-pm-api -> SAP PM
 grid report job (5 min) -> time-series DB, -> sys-grid-operator-api -> grid operator
 dashboard -> exp-fleet-telemetry-api -> time-series DB
\`\`\`

**Site buffering.** Each farm runs an edge gateway with a **persistent local queue** (a local MQTT broker with disk persistence, or the gateway's store-and-forward feature). Size it for 72 hours: 4 messages per second per site × 72 h ≈ 1 million messages, a few GB. On reconnect it sends the backlog oldest first, with a throttle so the backlog does not swamp the link and live data is not delayed for hours. Live and backlog data can go on two topics so live alarms stay current.

**Central ingestion.** The MQTT ingress bridges into **Kafka** \`turbine.telemetry\`, keyed by \`turbineId\`. Kafka is the durable log: 7 days of retention for replay. Sink connectors write to the **time-series DB** (90 days) and the **data lake** (Parquet by date and farm, lifecycle rules to cold storage, deleted after 10 years).

**Role of Mule.** Mule does not ingest 60 messages per second of raw sensor data into SAP, and it is not the long-term store. It works at the business edges: consuming fault events, creating SAP work orders, sending the grid report and serving the dashboard API.

**Faults to work orders.** A stream job (Kafka Streams or the IoT platform rules) turns repeated fault codes into **fault episodes**: one \`FaultRaised\` and one \`FaultCleared\` per turbine and code. prc-maintenance-orders consumes \`turbine.faults\`, enriches with the SAP functional location of the turbine, and creates a PM notification with external key \`turbineId + faultCode + episodeStart\`. A repeat of the same episode updates the open notification; a cleared event adds a note. Late faults from a backlog still create orders, flagged with the original time.

**Grid report.** Every 5 minutes a Mule job reads the latest values per farm from the time-series DB, and sends one call per farm to the grid operator through sys-grid-operator-api. A farm with no data for 15 minutes is sent as **unknown** with the last known time, never as the old value.

**Operations.** Monitor buffer depth per site (from gateway heartbeats), Kafka consumer lag, SAP call errors and the DLQ of the work order flow.
`,
  followUps: [
    { q: 'Why not let the turbines call a Mule API directly?', a: 'A sync call fails whenever the link is down, and the turbine would need its own retry storage. A site buffer with store and forward keeps data safe through outages.' },
    { q: 'How do you stop a two day backlog from delaying live data?', a: 'Throttle the backlog and send live data on a separate topic or with priority. Consumers use the device timestamp, so arrival order does not change the stored time.' },
    { q: 'Why does Mule consume the fault topic and not the raw telemetry?', a: 'Fault detection on 60 messages per second is stream processing work. Mule adds value where business context and SAP are involved.' },
    { q: 'How is a repeated fault code kept from creating hundreds of work orders?', a: 'The stream job groups repeats into one episode. The work order uses turbine, code and episode start as its external key.' },
  ],
}

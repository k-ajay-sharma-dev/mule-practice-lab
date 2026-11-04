import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-038',
  category: 'case-studies',
  title: 'Mining Company Streaming Safety Telemetry From Remote Sites',
  level: 'ADVANCED',
  tags: ['mining', 'iot', 'edge', 'hybrid', 'store-and-forward'],
  estMinutes: 50,
  diagram: {
    task: 'draw one site plus the central platform: the edge runtime in the site DMZ reading the OT control system and store-and-forwarding prioritised data, and the central flows that enrich alarms and feed EHS, the ops centre and reporting.',
    checks: [
      { label: 'The site control system is read only by the site edge runtime (no central write-back)', rule: { type: 'only-via', target: 'legacy', from: { type: ['system-api', 'process-api', 'batch-job'], label: ['edge', 'site', 'dmz'] } } },
      { label: 'The edge persists messages locally before forwarding (store-and-forward)', rule: { type: 'edge', from: { label: ['edge', 'site', 'dmz'] }, to: ['database', 'file-store'] } },
      { label: 'Alarms travel on a separate high-priority channel from routine telemetry', rule: { type: 'edge', from: { label: ['edge', 'site', 'dmz'] }, to: ['queue', 'topic', 'event-stream'], kind: 'async', min: 2 } },
      { label: 'Alarms are enriched with the shift roster from HR', rule: { type: 'path', from: ['queue', 'topic', 'event-stream'], to: { type: ['saas', 'erp'], label: ['hr', 'roster'] } } },
      { label: 'Incidents are created in the EHS platform only through a System API', rule: { type: 'only-via', target: { type: 'saas', label: ['ehs', 'incident'] }, from: 'system-api' } },
      { label: 'Routine telemetry reaches the data platform for regulator reporting', rule: { type: 'path', from: ['queue', 'topic', 'event-stream'], to: 'data-warehouse' } },
      { label: 'The safety operations centre uses an Experience API, never the OT systems', rule: { type: 'path', from: 'internal-app', to: 'process-api', via: 'experience-api' } },
      { label: 'Edge health and backlog size are monitored centrally', rule: { type: 'edge', to: 'monitoring' } },
    ],
    reference: diagram(
      {
        ops: ['internal-app', 'Safety operations centre'],
        eapi: ['experience-api', 'exp-safety-ops-api'],
        safety: ['process-api', 'prc-safety-events-api'],
        loader: ['batch-job', 'Telemetry loader'],
        pq: ['queue', 'p1-alarms'],
        bq: ['queue', 'p2-p3-telemetry-batches'],
        edge: ['system-api', 'Site edge runtime (DMZ)'],
        shr: ['system-api', 'sys-hr-roster-api'],
        sehs: ['system-api', 'sys-ehs-api'],
        ctrl: ['legacy', 'Site control system (OT)'],
        buf: ['database', 'Local persistent buffer'],
        hr: ['saas', 'HR system (shift roster)'],
        ehs: ['saas', 'EHS platform (incidents)'],
        dw: ['data-warehouse', 'Data platform (regulator reports)'],
        mon: ['monitoring', 'Central health & backlog metrics'],
      },
      [
        'edge -> ctrl', 'edge -> buf', 'edge ~> pq', 'edge ~> bq', 'edge -> mon', 'pq ~> safety', 'bq ~> loader', 'loader -> dw',
        'safety -> shr', 'shr -> hr', 'safety -> sehs', 'sehs -> ehs', 'ops -> eapi', 'eapi -> safety',
      ],
    ),
  },
  description: `
**Context.** A mining company operates six remote sites (open-pit and underground). Each site has gas detectors, ventilation controls, personnel location tags and heavy-vehicle collision-avoidance systems, all feeding an on-site control system. Head office wants a central safety operations centre, incident management integration (a SaaS EHS platform), shift rosters from the HR system, and regulator reporting. Satellite links to sites are slow (2–10 Mbps) and drop for hours at a time.

**Goals**
- Critical alarms (gas, man-down) visible centrally within 10 seconds when the link is up.
- No telemetry lost during link outages; backlog synchronised when links return.
- Incidents automatically created in the EHS platform with the right context (who was on shift, location).
- Monthly safety reporting with full traceability.

**Constraints**
- On-site alarms and evacuation must never depend on the central systems or the WAN link.
- OT networks are segregated from IT; only specific outbound connections are allowed through a DMZ.
- ~2,000 sensors per site, readings every few seconds; most are routine.
- Site IT staff are minimal; deployments must be remote and repeatable.

**Your task.** Propose the edge/central architecture, prioritisation of data, and security across OT/IT boundaries.
`,
  answerTemplate: `## Safety principles and what stays local

## Edge architecture at each site

## Prioritisation and bandwidth use

## Central processing and EHS/HR integration

## OT/IT security boundary

## Deployment and operations

## Risks
`,
  keyPoints: [
    'Life-safety functions stay on-site in the control system; the integration platform only observes and distributes, never sits in the safety loop.',
    'Each site has an edge runtime in the DMZ that collects from the OT side and store-and-forwards to the centre using persistent local storage.',
    'Data is prioritised: alarms sent immediately on a high-priority channel, routine readings aggregated/compressed and sent in batches, raw data backfilled after outages.',
    'Only outbound connections from site DMZ to central (no inbound to OT); mutual TLS and certificate management for site identities.',
    'Central flows enrich alarms with roster and location data and create incidents idempotently in the EHS platform.',
    'Edge runtimes are managed centrally (e.g. Runtime Fabric or managed standalone runtimes) with automated deployment and health monitoring.',
  ],
  solution: `
**Principle.** Gas detection, ventilation control and evacuation alarms stay in the site control system, which is certified for that purpose. Central integration is for visibility, coordination and reporting. This boundary must be explicit in the design and in the risk register.

**Edge.** A Mule runtime (or small Runtime Fabric cluster for redundancy) per site in the DMZ. It reads from the OT control system via an OT-approved interface (OPC UA gateway, MQTT broker or a historian API — whatever the control vendor supports and the OT team approves). Messages are written first to a durable local store (persistent queue/disk-backed store) — store-and-forward — then forwarded to the centre.

**Prioritisation.**
- *Priority 1*: alarms and man-down events → sent immediately via a dedicated queue/flow, small payloads.
- *Priority 2*: personnel location changes, vehicle near-miss events → near-real-time batches every few seconds.
- *Priority 3*: routine readings → aggregated (min/max/avg per minute) and compressed; raw data backfilled overnight or after link recovery with bandwidth caps so backlog never starves Priority 1.
Each message has a site ID, sensor ID, event timestamp and sequence number for ordering and de-duplication.

**Central.** Messages land in central queues (Anypoint MQ or a streaming platform), processed by \`safety-events-papi\`:
- Enrich alarms with shift roster (\`hr-roster-sapi\`, cached per shift) and zone/location data.
- Create/update incidents in the EHS platform (\`ehs-sapi\`) using the alarm ID as idempotency key.
- Feed the safety operations dashboard and the data platform for reporting.
Monthly regulator reports are generated from the data platform with links back to raw events.

**Security.** OT → DMZ via a one-way or tightly firewalled path the OT team controls; DMZ → central outbound only over TLS with mutual authentication per site. Certificates rotated centrally. No remote write-back to OT systems from central.

**Operations.** Infrastructure-as-code builds each site edge; CI/CD deploys the same app versions to all sites; health and backlog-size metrics sent centrally; alert when a site has been offline beyond a threshold. Test link failure regularly.

**Risks.** Mistaking central visibility for a safety system (clear scope), backlog overwhelming links after long outages (rate-limited backfill), clock skew (use event timestamps from synchronised site clocks), and edge hardware failure (redundant nodes, local disk monitoring).
`,
  followUps: [
    { q: 'Why not connect sensors directly to a cloud IoT service and skip the edge?', a: 'Links drop for hours, and the OT network should not open outbound paths per device. An edge in the DMZ gives buffering, prioritisation and a single controlled crossing point.' },
    { q: 'How do you guarantee no data loss during an outage?', a: 'Persist every message locally before acknowledging it from the OT side, forward with acknowledgements from the centre, and remove locally only after central confirmation; sequence numbers allow gap detection.' },
    { q: 'What would you never let this platform do?', a: 'Send control commands into the OT network or be required for evacuation alarms. Its failure must not affect on-site safety.' },
  ],
}

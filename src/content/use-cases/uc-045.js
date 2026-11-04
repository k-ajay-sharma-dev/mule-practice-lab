import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-045',
  category: 'use-cases',
  title: 'Hospital ADT Event Hub for 20 Downstream Systems',
  level: 'EXPERT',
  tags: ['hl7', 'publish-subscribe', 'event-hub', 'healthcare', 'governance', 'replay'],
  estMinutes: 45,
  diagram: {
    task: 'draw the ADT event hub: ingest from the EHR, the durable per-patient event log, the per-consumer delivery adapters with their subscription registry and hold store, and a few representative downstream systems (e.g. lab, portal, analytics, HIE).',
    checks: [
      { label: 'The EHR sends ADT messages to a single MLLP ingest API', rule: { type: 'edge', from: ['legacy', 'erp', 'saas'], to: ['system-api', 'process-api', 'experience-api'] } },
      { label: 'Ingest publishes canonical events to a durable log asynchronously', rule: { type: 'edge', from: ['system-api', 'process-api', 'experience-api'], to: ['event-stream', 'topic'], kind: 'async' } },
      { label: 'Independent delivery adapters (one per consumer) each consume the log', rule: { type: 'edge', from: ['event-stream', 'topic'], to: ['process-api', 'system-api'], kind: 'async', min: 3 } },
      { label: 'No point-to-point: the EHR never feeds a downstream system directly', rule: { type: 'no-edge', from: 'legacy', to: ['saas', 'external-api', 'data-warehouse', 'erp', 'database'] } },
      { label: 'Adapters read filter / mapping rules from a subscription registry', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'cache', 'file-store'], label: ['subscription', 'registry', 'config'] } } },
      { label: 'The patient portal receives FHIR from the log', rule: { type: 'path', from: ['event-stream', 'topic'], to: { label: ['portal', 'fhir'] } } },
      { label: 'Analytics receives JSON events from the log', rule: { type: 'path', from: ['event-stream', 'topic'], to: 'data-warehouse' } },
      { label: 'Poison messages park only the affected patient in a hold store', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'dlq', 'queue'], label: ['hold', 'park', 'poison'] } } },
    ],
    reference: diagram(
      {
        ehr: ['legacy', 'EHR (HL7 v2 ADT)'],
        ing: ['system-api', 'sys-adt-ingest (MLLP)'],
        k: ['event-stream', 'adt.events (key = patientId)'],
        reg: ['database', 'Subscription registry'],
        hold: ['database', 'Per-patient hold store'],
        alab: ['process-api', 'prc-adt-delivery-lab'],
        apor: ['process-api', 'prc-adt-delivery-portal-fhir'],
        aana: ['process-api', 'prc-adt-delivery-analytics'],
        ahie: ['process-api', 'prc-adt-delivery-hie'],
        lab: ['saas', 'Lab system (HL7 2.3)'],
        portal: ['saas', 'Patient portal (FHIR R4)'],
        dw: ['data-warehouse', 'Analytics platform'],
        hie: ['external-api', 'Regional HIE (consented only)'],
      },
      [
        'ehr -> ing', 'ing ~> k', 'k ~> alab', 'k ~> apor', 'k ~> aana', 'k ~> ahie',
        'alab -> reg', 'apor -> reg', 'aana -> reg', 'ahie -> reg', 'alab -> hold',
        'alab -> lab', 'apor -> portal', 'aana -> dw', 'ahie -> hie',
      ],
    ),
  },
  description: `
A hospital network (6 hospitals) is replacing its old interface engine. The central **EHR** emits **HL7 v2 ADT** messages (admit, transfer, discharge, registration updates, merges) that **~20 downstream systems** need: lab, radiology, pharmacy, bed management, dietary, billing, nurse call, the patient portal (FHIR), a regional health information exchange and an analytics platform.

Facts:
- **~400,000 ADT messages/day**, peaks of 80/s in the morning. Messages for the **same patient must be processed in order** (e.g. A01 admit before A02 transfer before A03 discharge).
- Each consumer needs **different subsets**: dietary only inpatients of certain wards; nurse call only bed changes; the health information exchange only patients who consented.
- Formats: most consumers want HL7 v2 (some with custom Z-segments, different versions 2.3–2.5.1), the portal wants **FHIR R4**, analytics wants JSON events.
- **Patient merges (A40)** must be handled carefully: consumers need to re-link records from the old MRN to the surviving MRN.
- Consumers are sometimes down for maintenance for hours; when back, they must receive everything missed, in order.
- The old engine has **~150 point-to-point interfaces** with logic nobody fully understands. Migration must happen **without downtime** to clinical systems.
- Platform: Anypoint Platform with Runtime Fabric on-prem (patient data must stay in the data centre).

**Describe your solution:**
- What is the target architecture?
- How do you guarantee per-patient ordering while scaling throughput?
- How do you implement per-consumer filtering and transformation without creating 20 spaghetti flows?
- How do consumers catch up after downtime, and how do you replay?
- How do you migrate from the old interface engine safely?
`,
  answerTemplate: `## Target architecture

## Ingestion and canonical event

## Ordering and scaling

## Subscriptions: filtering and transformation

## Delivery, catch-up and replay

## Merges and special cases

## Migration plan

## Governance and operations
`,
  keyPoints: [
    'Ingest once (MLLP listener), persist and ACK, publish a canonical ADT event to a durable partitioned log keyed by patient ID (e.g. Kafka) so order is kept per patient while partitions scale.',
    'Original HL7 kept with each event for consumers that need it unchanged; canonical model used for routing/filtering.',
    'One delivery adapter per consumer (or a configuration-driven adapter) with its own filter, mapping (HL7 version/Z-segments, FHIR, JSON), offset and error handling — consumers isolated from each other.',
    'Consumer-owned offsets/retention allow catch-up after downtime and controlled replay from a point in time.',
    'Merges (A40) propagated in order with explicit re-link semantics; poison messages park only the affected patient stream, not the whole consumer.',
    'Strangler migration: parallel-run each consumer interface with output comparison against the old engine, then cut over one consumer at a time with rollback.',
  ],
  solution: `
**Target architecture.**
1. **ADT Ingest** (MLLP connector on Runtime Fabric): receives from EHR, validates, persists, ACKs.
2. **Event log**: Kafka (on-prem) topic \`adt.events\`, partitioned by **patient ID (enterprise MPI ID or MRN)**, long retention (e.g. 14 days) plus archive.
3. **Delivery adapters**: one Mule application (or one configuration) per consumer, each with its own consumer group.
4. **Subscription registry**: config (in Git/DB) describing for each consumer: filter, target format/version, mapping, endpoint, transport.
5. Monitoring/replay tooling.

**Ingestion and canonical event.** Parse HL7 (HL7 EDI connector or a parser) to extract key fields: event type, patient identifiers, visit number, ward/bed, consent flags, timestamps. Publish an envelope: canonical fields + **original HL7 message** + message control ID. ACK only after the publish is acknowledged by the log (\`acks=all\`) — no loss. Duplicate EHR sends are detected by message control ID.

**Ordering and scaling.** Kafka guarantees order **within a partition**; keying by patient ID means all events for a patient land in one partition in order, while throughput scales with partitions (e.g. 24) and consumers process partitions in parallel. Each adapter processes one partition sequentially (per-partition ordering) but many partitions concurrently. 80 msg/s is modest; the design is for ordering and isolation more than raw scale.

**Subscriptions: filtering and transformation.** Instead of 20 bespoke flows with copy-paste logic, build a **reusable adapter template** (shared library / custom module): consume → filter (DataWeave expression from config, e.g. inpatient AND ward in [...]) → transform → deliver → commit offset. Transform options:
- pass-through original HL7;
- HL7 version/Z-segment mapping (per-consumer DataWeave);
- FHIR R4 (Patient, Encounter) for the portal;
- JSON for analytics.

Consent rules for the regional exchange checked against the consent service before delivery. Each consumer's mapping is tested with MUnit using a shared library of real (de-identified) ADT samples.

**Delivery, catch-up and replay.** Each adapter owns its offset: if the bed-management system is down for 3 hours, its adapter retries with backoff, then pauses consuming (not skipping) and alerts. When the system returns, it resumes from its offset — all missed events, in order. **Replay**: reset a consumer group offset to a timestamp (via admin tooling with approvals) to resend after a consumer data loss. Other consumers are unaffected.

**Poison messages.** A message the target rejects permanently (AR) would block the partition. Park **only that patient's events** in a per-consumer hold store (subsequent events for that patient also parked to keep order) and continue other patients; an analyst fixes and releases them.

**Merges (A40).** Forward A40 to consumers in order; for FHIR/JSON consumers express the merge as a link (old ID replaced-by new ID). Ensure events after the merge use the surviving ID; analytics receives a merge event to re-key history.

**Migration plan (strangler).**
1. Inventory all 150 interfaces; group by consumer; reverse-engineer logic and document it as subscription configs.
2. **Shadow mode**: new hub receives a copy of EHR messages, adapters produce output to a comparison sink; automated diff against the old engine's output for weeks.
3. Cut over **one consumer at a time** in low-traffic windows, with rollback by switching the consumer back to the old engine (the old feed stays running in parallel until signed off).
4. Decommission old interfaces when all consumers are migrated.

**Governance and operations.** Per-consumer dashboards (lag, error rate, last delivered), alerts on lag > N minutes for critical consumers (pharmacy, bed management). Access control on replay tooling, audit of every delivery, PHI not logged. On-prem Runtime Fabric with HA (multiple replicas across nodes), Kafka with replication factor 3.
`,
  followUps: [
    { q: 'Why not Anypoint MQ instead of Kafka?', a: 'Patient data must stay on-prem here, and per-consumer replay from offsets with long retention is natural in Kafka. If cloud were allowed, Anypoint MQ FIFO queues per consumer could work, with replay handled by re-publishing from an archive.' },
    { q: 'What if a consumer needs ordering across patients (e.g. bed occupancy)?', a: 'Bed occupancy depends on several patients per bed; either key a dedicated stream by bed/ward for that consumer or have the consumer tolerate eventual consistency using event timestamps.' },
    { q: 'How do you prove nothing is lost?', a: 'Count reconciliation per day: messages received from EHR vs events in the log vs delivered/filtered per consumer, with every filtered event recorded as filtered rather than silently dropped.' },
  ],
}

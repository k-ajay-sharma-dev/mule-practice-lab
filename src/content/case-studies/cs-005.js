import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-005',
  category: 'case-studies',
  title: 'Hospital Integrating HL7 v2 and FHIR Between EHR and Labs',
  level: 'ADVANCED',
  tags: ['healthcare', 'hl7', 'fhir', 'mllp', 'security'],
  estMinutes: 45,
  diagram: {
    task: 'draw the replacement for the interface engine: HL7 v2 System APIs for the EHR and LIS, the FHIR System API for the reference lab, the lab-orders Process API with its buffer, and the FHIR facade for the patient app.',
    checks: [
      { label: 'The patient app reaches the FHIR Experience API through a gateway', rule: { type: 'path', from: 'mobile-app', to: 'experience-api', via: 'api-gateway' } },
      { label: 'The EHR and LIS (HL7 v2 / MLLP) are reached only through System APIs', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'The external reference lab (FHIR R4) is reached only through a System API', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'Inbound HL7 messages are persisted to a queue (persist first, then ACK)', rule: { type: 'edge', from: 'system-api', to: ['queue', 'event-stream'], kind: 'async' } },
      { label: 'The lab-orders Process API routes between at least three System APIs (EHR, LIS, reference lab)', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 3 } },
      { label: 'The FHIR facade never calls System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Unprocessable or repeatedly failing messages go to a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
      { label: 'Patient ID cross-reference and code mappings (local ↔ LOINC) live in a store, not in code', rule: { type: 'edge', from: ['process-api', 'system-api'], to: ['database', 'cache'] } },
    ],
    reference: diagram(
      {
        app: ['mobile-app', 'Patient app'],
        gw: ['api-gateway', 'Gateway (OAuth 2.0 / SMART scopes)'],
        eapi: ['experience-api', 'patient-fhir-eapi'],
        prc: ['process-api', 'lab-orders-papi'],
        q: ['queue', 'hl7-inbound (FIFO per patient)'],
        dlq: ['dlq', 'hl7-error-queue'],
        sehr: ['system-api', 'ehr-hl7-sapi'],
        slis: ['system-api', 'lis-hl7-sapi'],
        sref: ['system-api', 'reflab-fhir-sapi'],
        ehr: ['legacy', 'EHR (HL7 v2 / MLLP)'],
        lis: ['legacy', 'LIS (HL7 v2 / MLLP)'],
        ref: ['external-api', 'Reference lab FHIR R4'],
        xref: ['database', 'Patient ID xref + code maps'],
        mon: ['monitoring', 'Flow-gap and DLQ alerts'],
      },
      [
        'app -> gw', 'gw -> eapi', 'eapi -> prc',
        'sehr ~> q', 'slis ~> q', 'q ~> prc', 'q ~> dlq',
        'prc -> sehr', 'prc -> slis', 'prc -> sref', 'prc -> xref', 'prc -> mon',
        'sehr -> ehr', 'slis -> lis', 'sref -> ref',
      ],
    ),
  },
  description: `
**Context.** A hospital group (4 hospitals) runs one **EHR**. Lab tests are done by two systems: an in-house **LIS** (lab information system) and an external reference lab.
- The EHR and LIS speak **HL7 v2** over **MLLP**: orders (\`ORM^O01\`) out, results (\`ORU^R01\`) back, patient updates (\`ADT\`) to keep demographics in sync.
- The external lab only offers a **FHIR R4** REST API (\`ServiceRequest\`, \`DiagnosticReport\`, \`Observation\`).
- A new patient app needs to show lab results — the vendor wants **FHIR** too.

**Problems today**
- An old interface engine is end-of-life; when it stops, results stop and nobody notices for hours.
- Results sometimes attach to the wrong encounter after a patient merge (\`ADT^A40\`).

**Constraints**
- Clinical data: strict privacy rules (e.g. HIPAA/GDPR), full audit trail of who accessed what.
- The EHR and LIS are on-premises. Result delivery to clinicians should be under 1 minute.
- Message order matters per patient.

**Your task.** Propose the integration architecture to replace the interface engine and add FHIR, covering message handling, mapping, reliability, security and monitoring.
`,
  answerTemplate: `## Architecture and deployment

## HL7 v2 handling (MLLP, ACKs, ordering)

## HL7 v2 ↔ FHIR mapping

## Reliability and patient merges

## Security, privacy and audit

## Monitoring and migration
`,
  keyPoints: [
    'Runs MLLP listeners/senders on runtimes inside the hospital network (on-prem/hybrid), not exposing MLLP to the internet.',
    'Persists each HL7 message before sending the ACK (AA), and uses AE/AR NACKs for errors; uses MSH-10 control IDs for idempotency/de-duplication.',
    'Keeps per-patient ordering (e.g. sequential processing or ordered queue keyed by patient), not unbounded parallel processing.',
    'Maps HL7 v2 to a canonical/FHIR model (ORU → DiagnosticReport + Observation, ORM ↔ ServiceRequest) through System/Process APIs, with code mapping (local codes ↔ LOINC).',
    'Handles ADT merges (A40) by updating patient identifiers so later results resolve to the surviving patient, and flags results that cannot be matched.',
    'Security and ops: OAuth 2.0/SMART-style scopes for FHIR, TLS/mTLS, no PHI in logs, audit trail, alerts on message flow gaps and queue/error growth, parallel run before cutover.',
  ],
  solution: `
**Architecture.** Mule 4 runtimes on **on-prem / Runtime Fabric** inside the hospital network (MLLP never crosses the internet), managed from Anypoint.
- **System APIs**: \`ehr-hl7-sapi\` (MLLP in/out with the EHR), \`lis-hl7-sapi\` (MLLP with the LIS), \`reflab-fhir-sapi\` (FHIR R4 client for the external lab).
- **Process API**: \`lab-orders-papi\` routes orders to the right lab and results back to the EHR, using a **canonical model close to FHIR**.
- **Experience API**: \`patient-fhir-eapi\` — a read-only FHIR facade (\`DiagnosticReport\`, \`Observation\`) for the patient app, exposed through a gateway.

**HL7 v2 handling.**
- Receive with an MLLP listener; parse with the HL7 connector/DataWeave.
- **Persist first, then ACK**: write the message to a persistent queue, then return \`AA\`. Return \`AE\`/\`AR\` for invalid messages so the sender knows.
- Use **MSH-10** (message control ID) to drop duplicates when a sender resends after a lost ACK.
- **Ordering per patient**: process sequentially per patient (e.g. a FIFO queue or partitioning by patient ID) so an update never overtakes the original result.

**Mapping.**
- \`ORM^O01\` ↔ \`ServiceRequest\`; \`ORU^R01\` → \`DiagnosticReport\` + one \`Observation\` per OBX; \`ADT\` → \`Patient\` / \`Encounter\`.
- Keep a **code mapping table** (local test codes ↔ LOINC, units) owned by the lab team, not hard-coded.
- Unmappable messages go to an error queue for a human, never silently dropped.

**Reliability and merges.** Retries with backoff to each target, DLQs with alerts. For \`ADT^A40\` merges, update the patient identifier cross-reference so later results resolve to the surviving MRN; results with no matching patient/encounter are held and flagged instead of being attached to a guess.

**Security and audit.**
- TLS (mTLS for the external lab).
- OAuth 2.0 with patient-scoped access (SMART on FHIR-style) on the FHIR facade.
- **No PHI in logs** (log control IDs and correlation IDs only).
- Encryption at rest for queues/stores.
- An audit log of every access/disclosure.

**Monitoring and migration.** Alerts when no results have flowed for N minutes during working hours, on queue depth/age, NACK rate, and DLQ size. Migrate **interface by interface**: run the new flow in parallel with the old engine (shadow mode), compare outputs, then switch the MLLP endpoint and keep the old one ready for rollback.
`,
}

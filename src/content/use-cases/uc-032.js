import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-032',
  category: 'use-cases',
  title: 'Lab Results to the Patient Portal',
  level: 'INTERMEDIATE',
  tags: ['hl7', 'fhir', 'healthcare', 'mllp', 'security'],
  estMinutes: 25,
  diagram: {
    task: 'draw how HL7 results flow from the LIS to the FHIR patient portal: the MLLP listener, where messages are persisted before the ACK, the HL7→FHIR Process API, the hold store for sensitive results and the release job.',
    checks: [
      { label: 'The LIS sends results to an MLLP listener API', rule: { type: 'edge', from: ['legacy', 'database', 'erp', 'saas'], to: ['system-api', 'experience-api', 'process-api'] } },
      { label: 'The listener persists each message to a queue before ACKing (async)', rule: { type: 'edge', from: ['system-api', 'experience-api', 'process-api'], to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'A Process API consumes the queue and maps HL7 to FHIR', rule: { type: 'edge', from: ['queue', 'topic', 'event-stream'], to: 'process-api', kind: 'async' } },
      { label: 'The FHIR portal is reached only through a System API', rule: { type: 'only-via', target: ['saas', 'external-api'], from: 'system-api' } },
      { label: 'Sensitive and unmatched results are parked in a hold store', rule: { type: 'edge', from: ['process-api', 'batch-job'], to: ['database', 'cache'] } },
      { label: 'A scheduled job releases held results to the portal', rule: { type: 'path', from: 'batch-job', to: ['saas', 'external-api'] } },
    ],
    reference: diagram(
      {
        lis: ['legacy', 'LIS (HL7 v2 over MLLP)'],
        mllp: ['system-api', 'sys-lis-mllp-listener'],
        q: ['queue', 'lab-results (FIFO per MRN)'],
        prc: ['process-api', 'prc-lab-results-api'],
        hold: ['database', 'Hold / pending-patient store'],
        job: ['batch-job', 'Release job (72 h)'],
        sfhir: ['system-api', 'sys-portal-fhir-api'],
        portal: ['saas', 'Patient portal FHIR R4'],
      },
      ['lis -> mllp', 'mllp ~> q', 'q ~> prc', 'prc -> hold', 'prc -> sfhir', 'job -> hold', 'job -> sfhir', 'sfhir -> portal'],
    ),
  },
  description: `
A hospital group wants patients to see their **laboratory results** in its patient portal and mobile app.

Facts:
- The **laboratory information system (LIS)** sends results as **HL7 v2 ORU^R01** messages over **MLLP** (TCP) to the integration layer. It expects an **ACK** for every message.
- The patient portal vendor exposes a **FHIR R4 API** (\`Observation\`, \`DiagnosticReport\`, \`Patient\`).
- ~25,000 result messages/day; a message can contain a panel of up to 40 observations.
- Results can be **preliminary**, **final** or **corrected**; a correction must replace the earlier value, not add a second one.
- Clinical rule: some sensitive results (e.g. HIV, genetic tests, certain oncology) must be **held for 72 hours** or until a clinician releases them; the list of test codes is maintained by the medical board.
- Patients are identified in the LIS by the hospital's medical record number (MRN); the portal uses its own patient ID.

**Describe your solution:**
- How do you receive messages and when do you send the ACK?
- How do you map HL7 v2 to FHIR?
- How do you handle corrections and the release-delay rule?
- What do you do with results for patients not registered in the portal?
- What security measures are essential?
`,
  answerTemplate: `## Receiving HL7 and ACK

## Mapping to FHIR

## Corrections and status

## Release rules

## Patient matching

## Security and audit
`,
  keyPoints: [
    'MLLP listener receives ORU^R01; message persisted to a durable queue before the ACK (AA) is returned; malformed messages get AE/AR.',
    'HL7 v2 parsed (e.g. MuleSoft HL7 EDI connector) and mapped in DataWeave: OBR → DiagnosticReport, OBX → Observation, PID → Patient reference via MRN identifier.',
    'Corrections (result status C) update the existing FHIR resource using a stable business identifier (order + test code) instead of creating duplicates.',
    'Sensitive test codes held (scheduled release after 72h or clinician release event); the code list is configuration, not code.',
    'Unknown patients parked and retried/reconciled when they register, not dropped.',
    'PHI protection: TLS/VPN, encryption at rest, no clinical values in logs, audit trail of every message.',
  ],
  solution: `
**Receiving HL7 and ACK.** An **MLLP listener** (MLLP connector) receives ORU^R01. Parse the MSH segment, validate structure, and write the raw message to a **persistent queue** (Anypoint MQ or a JMS broker) — only then return **ACK AA**. Unparseable messages get **AE/AR** so the LIS keeps them for resend. Processing from the queue preserves order per patient (e.g. message groups keyed by MRN, or a FIFO queue) so a correction is never applied before the original.

**Mapping to FHIR (DataWeave).**
- **PID** → patient reference: MRN as an identifier (system = hospital MRN namespace); resolve to the portal patient via \`Patient?identifier=...\`.
- **OBR** → \`DiagnosticReport\` (code, status, effective time, performer, identifier = placer/filler order number).
- **OBX** → \`Observation\` each (LOINC code if provided, value with UCUM units, reference range, abnormal flag → interpretation), linked from \`DiagnosticReport.result\`.
- Status mapping: P → preliminary, F → final, C → corrected/amended.

Send as a FHIR **transaction Bundle** so the report and its observations are stored all-or-nothing.

**Corrections.** Use conditional update (\`PUT Observation?identifier=...\`) with a stable identifier (filler order number + test code), so a corrected result replaces the old one and keeps version history in the FHIR server.

**Release rules.** A configurable list of sensitive test codes (medical board-owned, stored in a DB or config file). Matching results are stored in a **hold store** with release time = now + 72h. A Scheduler releases due items; a clinician "release now" event from the EHR releases immediately. Non-sensitive results go straight through.

**Patient matching.** If the MRN has no portal account, park the result in a pending store. When the portal reports a new registration (event or nightly sync), the pending results for that MRN are delivered. Never match on name/date of birth alone.

**Security and audit.** MLLP over VPN/TLS, FHIR API via OAuth2 client credentials, secrets in secure properties, PHI encrypted at rest in queues and stores. Logs carry message control ID and correlation ID only. Every message has an auditable trail (received, ACKed, delivered, held, released) for compliance (e.g. HIPAA/GDPR).
`,
  followUps: [
    { q: 'Why not ACK immediately and then process?', a: 'ACKing before persisting risks losing results if the app crashes; ACKing only after delivery to the portal makes the LIS wait on a third party. Persist first, then ACK, is the safe middle.' },
    { q: 'How would you handle a portal outage of four hours?', a: 'Messages accumulate in the queue (sized for it); consumers retry with backoff and drain the backlog in order when the portal returns.' },
    { q: 'What if the LIS sends local test codes, not LOINC?', a: 'Maintain a local-code to LOINC mapping table and keep the original local code as a second coding in the Observation.' },
  ],
}

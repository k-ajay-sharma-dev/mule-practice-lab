import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-110',
  category: 'use-cases',
  title: 'HL7 v2 ADT Feed to a FHIR R4 Server for a Care App',
  level: 'INTERMEDIATE',
  tags: ['hl7', 'fhir', 'mllp', 'healthcare', 'anypoint-mq', 'dlq'],
  estMinutes: 30,
  diagram: {
    task: 'draw the ADT to FHIR flow: the EHR sending over MLLP, the listener that stores each message and ACKs, the raw archive, the queue, the Process API that maps to FHIR, the System API in front of the FHIR server, the dead-letter queue, and the care app reading FHIR through its Experience API.',
    checks: [
      { label: 'The EHR sends ADT messages to an MLLP listener API', rule: { type: 'edge', from: 'legacy', to: ['system-api', 'process-api'] } },
      { label: 'The listener puts each message on a queue before the ACK', rule: { type: 'edge', from: ['system-api', 'process-api'], to: 'queue', kind: 'async' } },
      { label: 'The EHR never waits on the FHIR server', rule: { type: 'no-path', from: 'legacy', to: 'saas', kind: 'sync' } },
      { label: 'A Process API reads the queue and maps to FHIR', rule: { type: 'edge', from: 'queue', to: 'process-api', kind: 'async' } },
      { label: 'The FHIR server is reached only through a System API', rule: { type: 'only-via', target: 'saas', from: 'system-api' } },
      { label: 'Raw HL7 is archived', rule: { type: 'path', from: 'legacy', to: ['file-store', 's3-bucket', 'azure-blob'] } },
      { label: 'Messages that fail mapping go to a dead-letter queue', rule: { type: 'edge', from: 'queue', to: 'dlq' } },
      { label: 'The care app reads FHIR through its Experience API', rule: { type: 'path', from: 'mobile-app', via: 'experience-api', to: 'saas' } },
      { label: 'The care app has no route to the EHR', rule: { type: 'no-path', from: 'mobile-app', to: 'legacy' } },
    ],
    reference: diagram(
      {
        ehr: ['legacy', 'EHR (HL7 v2.5 ADT over MLLP)'],
        lsn: ['system-api', 'sys-ehr-adt-listener (MLLP, RTF on-prem)'],
        arch: ['azure-blob', 'Raw HL7 archive (7 years)'],
        raw: ['queue', 'adt.inbound (FIFO, group by MRN)'],
        prc: ['process-api', 'prc-adt-to-fhir'],
        sfh: ['system-api', 'sys-fhir-api'],
        fhir: ['saas', 'FHIR R4 server (Patient, Encounter)'],
        dlq: ['dlq', 'adt.inbound.dlq'],
        app: ['mobile-app', 'Patient care app'],
        exp: ['experience-api', 'exp-care-app-api'],
      },
      ['ehr -> lsn', 'lsn -> arch', 'lsn ~> raw', 'raw ~> prc', 'prc -> sfh', 'sfh -> fhir', 'raw ~> dlq', 'app -> exp', 'exp -> sfh'],
    ),
  },
  description: `
A regional hospital group is launching a **patient care app**. The app reads patient and visit data from a cloud **FHIR R4 server**. The source is the hospital **EHR**, which only sends **HL7 v2.5 ADT** messages over **MLLP**.

Facts:
- Message types: **A01** admit, **A03** discharge, **A04** register outpatient, **A08** update patient, **A40** merge patients.
- About **60,000 ADT messages per day**, peaks of 15 per second at 08:00.
- The EHR waits for an HL7 **ACK** for each message and sends the next one only after it. If no ACK comes in 30 seconds it resends, and after 5 failures it stops the interface and pages the EHR team.
- The FHIR server allows conditional updates (\`PUT Patient?identifier=...\`) and returns 429 when overloaded.
- Messages for one patient must be applied in order (an A03 before its A01 would create a discharge for a visit that does not exist).
- Patient data must not leave the hospital network except to the approved FHIR server. Mule runs on **Runtime Fabric** on-prem plus CloudHub 2.0 in a private space.

**Describe your solution:**
- When do you ACK, and why?
- How do PID, PV1 and MRG segments map to FHIR resources?
- How is ordering per patient kept while processing in parallel?
- What happens with a message that cannot be mapped?
`,
  answerTemplate: `## Receiving and ACK

## Mapping to FHIR

## Ordering and retries

## Errors and merges

## Security
`,
  keyPoints: [
    'The MLLP listener stores the raw message (queue and archive) and then sends AA; FHIR calls happen later, so EHR throughput does not depend on the cloud.',
    'An AE or AR ACK is sent only for a message that cannot be parsed, because those will never succeed when retried.',
    'PID maps to Patient (identifier = MRN), PV1 to Encounter (identifier = visit number), A03 sets Encounter.status finished, A40 links or merges Patients.',
    'Conditional PUT by identifier makes each update idempotent, so a redelivery does not create duplicates.',
    'Ordering per patient comes from a FIFO queue grouped by MRN, or from a partitioned stream keyed by MRN.',
    'Mapping failures go to a DLQ with the raw message; later messages for that patient wait so they are not applied out of order.',
  ],
  solution: `
\`\`\`
 EHR -> sys-ehr-adt-listener (MLLP) -> raw archive
                                   ~> [adt.inbound, group by MRN] ~> prc-adt-to-fhir -> sys-fhir-api -> FHIR server
                                                                 ~> [DLQ]
 care app -> exp-care-app-api -> sys-fhir-api
\`\`\`

**Receiving and ACK.** The listener uses the **MLLP connector** and the **HL7 EDI connector** to parse the message. It writes the raw text to the archive, publishes it to \`adt.inbound\` and only then returns **AA** (application accept). This is "store and forward": the EHR is fast and decoupled, and nothing is lost after the ACK. A message that cannot be parsed gets **AR** so the EHR team sees it at once.

**Mapping to FHIR.**
- **PID** → \`Patient\`: identifier (MRN with the hospital system URI), name, birthDate, gender, address, telecom.
- **PV1** → \`Encounter\`: identifier (visit number), class (inpatient or outpatient), period.start, location (ward and bed), participant (attending doctor).
- **A03** → the same Encounter with \`status = finished\` and \`period.end\`.
- **A08** → an update of the Patient.
- **A40** (MRG segment) → mark the old Patient \`active = false\` with a \`replaced-by\` link, and move open Encounters to the surviving Patient.
Use **conditional PUT** by identifier, so a resend updates the same resource instead of creating a copy.

**Ordering and retries.** Anypoint MQ FIFO queues keep order within a message group. With the MRN as the group ID, different patients can be processed in parallel while each patient stays in order. On 429 or 5xx from the FHIR server, retry with backoff without moving to the next message of that patient.

**Errors.** A mapping error (unknown ward code, missing MRN) goes to the DLQ after retries, with the error in a message property. Operations fix the reference data and replay. Later messages of that MRN go to a hold list until the failed one is fixed, otherwise a discharge could be applied without its admission.

**Security.** MLLP stays inside the hospital network on RTF. The FHIR server is called over TLS with OAuth 2.0 client credentials. The app reads FHIR only through exp-care-app-api, which checks that the signed-in patient owns the record.
`,
  followUps: [
    { q: 'Why ACK after the queue write and not after the FHIR update?', a: 'The EHR sends the next message only after the ACK. Waiting for the cloud FHIR server would slow every message and stop the interface during an outage.' },
    { q: 'What is the difference between AA, AE and AR?', a: 'AA means accepted. AE means an application error and AR means the message was rejected. Use AE or AR only when a retry cannot help.' },
    { q: 'How do you handle an A40 merge in FHIR?', a: 'Deactivate the old Patient with a replaced-by link to the surviving one. Move its open Encounters to the surviving Patient.' },
    { q: 'Why use conditional PUT by identifier?', a: 'The same message may be delivered twice. A conditional update by MRN or visit number updates one resource instead of creating duplicates.' },
  ],
}

import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-052',
  category: 'use-cases',
  title: 'API-Led: Patient Registration for Kiosks, Front Desk and Partner Clinics',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'application-network', 'healthcare', 'fhir', 'mpi'],
  estMinutes: 30,
  diagram: {
    task: 'draw the API-led network for patient registration: kiosks, front desk and partner clinics with their Experience APIs, the check-in and registration Process APIs, the System APIs for EMPI, EHR, insurance and appointments, plus the eligibility cache and audit store.',
    checks: [
      { label: 'Kiosks, front desk and partner clinics each call their own Experience API', rule: { type: 'each', of: ['device', 'internal-app', 'partner'], min: 3, edgeTo: 'experience-api' } },
      { label: 'Every Experience API goes through a Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'The check-in Process API reuses the registration Process API', rule: { type: 'edge', from: { type: 'process-api', label: ['check'] }, to: { type: 'process-api', label: ['regist'] } } },
      { label: 'Partner clinics reach the EMPI only through the registration Process API (duplicate check)', rule: { type: 'path', from: 'partner', via: { type: 'process-api', label: ['regist'] }, to: { label: ['empi', 'master patient'] } } },
      { label: 'EMPI, EHR, insurance and appointments are reached only through System APIs', rule: { type: 'only-via', target: ['legacy', 'erp', 'saas', 'external-api', 'database'], from: 'system-api' } },
      { label: 'Paid insurance checks are cached per patient per day', rule: { type: 'edge', from: ['system-api', 'process-api'], to: 'cache' } },
      { label: 'Process APIs write every PHI access to an audit store', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'data-warehouse', 'monitoring', 'queue', 'topic'], label: ['audit'] } } },
    ],
    reference: diagram(
      {
        kiosk: ['device', 'Self-service kiosk'],
        fd: ['internal-app', 'Front-desk app'],
        clinic: ['partner', 'Partner clinic systems (FHIR)'],
        ek: ['experience-api', 'exp-kiosk'],
        ef: ['experience-api', 'exp-frontdesk'],
        ep: ['experience-api', 'exp-partner-fhir'],
        pchk: ['process-api', 'prc-patient-checkin'],
        preg: ['process-api', 'prc-patient-registration'],
        sempi: ['system-api', 'sys-empi'],
        sehr: ['system-api', 'sys-ehr-patients'],
        sins: ['system-api', 'sys-insurance-eligibility'],
        sappt: ['system-api', 'sys-appointments'],
        empi: ['legacy', 'EMPI (SOAP)'],
        ehr: ['legacy', 'EHR (HL7 v2 / FHIR)'],
        ins: ['external-api', 'Insurance clearing house'],
        appt: ['saas', 'Appointments system'],
        cache: ['cache', 'Eligibility cache (per patient/day)'],
        audit: ['monitoring', 'PHI audit store'],
      },
      [
        'kiosk -> ek', 'fd -> ef', 'clinic -> ep', 'ek -> pchk', 'ef -> pchk', 'ef -> preg', 'ep -> preg', 'pchk -> preg',
        'pchk -> sappt', 'pchk -> sins', 'preg -> sempi', 'preg -> sehr', 'sins -> cache', 'pchk -> audit', 'preg -> audit',
        'sempi -> empi', 'sehr -> ehr', 'sins -> ins', 'sappt -> appt',
      ],
    ),
  },
  description: `
A regional hospital group (4 hospitals) wants one way to **register patients** and find existing patient records, used by three channels.

| Channel | Users | Needs |
|---|---|---|
| **Self-service kiosks** (Android tablets in lobbies) | Patients arriving for appointments | Check in with appointment code + date of birth, confirm address/phone, update insurance card |
| **Front-desk app** (internal web) | Registration clerks | Search patients, register new patients, merge suspected duplicates, scan ID |
| **Partner clinics** (external, ~60 GP practices) | Clinic systems | Look up / pre-register a referred patient using **HL7 FHIR R4** |

| System | Holds | Interface |
|---|---|---|
| **EHR** (Epic / Cerner-style) | Patient demographics, encounters | HL7 v2 ADT (MLLP) inbound, FHIR read API |
| **Enterprise Master Patient Index (EMPI)** | Golden patient identity, cross-references to the hospitals' MRNs | SOAP (PIX/PDQ style) |
| **Insurance eligibility service** (clearing house) | Coverage verification | REST, ~2 s, per-call fee |
| **Appointments system** | Appointments, check-in status | REST |

Facts and constraints:
- ~6,000 registrations/check-ins per day; kiosk check-in must complete in **< 3 s**.
- **Duplicates** are a patient-safety risk: new registrations must search the EMPI first (probabilistic match) before creating a patient.
- Partner clinics are external: they must only see patients they referred, through a standards-based (FHIR) interface.
- Health data (PHI) must be protected end to end and every access audited.

**Questions:**
1. Design the application network (APIs per layer with resources).
2. Describe the kiosk check-in and the partner pre-registration journeys.
3. Explain where FHIR mapping and duplicate detection live.
`,
  answerTemplate: `## Experience APIs

## Process APIs

## System APIs

## Interactions & sequence (kiosk check-in, partner pre-registration)

## Duplicate detection and FHIR

## Security, audit and NFRs

## Reuse
`,
  keyPoints: [
    'System APIs: sys-empi (search/create/link identities), sys-ehr-patients (FHIR read + HL7 v2 ADT A04/A08 send), sys-insurance-eligibility, sys-appointments.',
    'prc-patient-registration owns "find or create patient": EMPI search first, thresholds for auto-match vs manual review, then create in EHR via ADT.',
    'prc-patient-checkin orchestrates appointment lookup, demographic update and insurance verification for kiosks and front desk.',
    'Partner clinics get exp-partner-fhir exposing FHIR R4 Patient/Appointment resources; FHIR mapping is an Experience concern while the Process layer keeps a canonical patient model.',
    'PHI controls: OAuth/mTLS per partner, scope by referral relationship, field-level minimisation per channel, audit log of every read and write.',
  ],
  solution: `
**API inventory**

| Layer | API | Key resources | Responsibility | Consumers |
|---|---|---|---|---|
| Experience | **exp-kiosk** | \`POST /check-ins\` (appointment code + DOB), \`PATCH /check-ins/{id}/contact\`, \`POST /check-ins/{id}/insurance-card\` | Minimal data back to a public device, session-scoped | Kiosks |
| Experience | **exp-frontdesk** | \`GET /patients?name=&dob=\`, \`POST /patients\`, \`POST /patients/{id}/merge-requests\`, \`POST /check-ins\` | Full clerk workflow | Front-desk app |
| Experience | **exp-partner-fhir** | \`GET /fhir/Patient?identifier=\`, \`POST /fhir/Patient\`, \`GET /fhir/Appointment\` | FHIR R4 facade, partner scoping | Partner clinic systems |
| Process | **prc-patient-registration** | \`POST /patients/match\`, \`POST /patients\`, \`PATCH /patients/{id}\`, \`POST /patients/{id}/merge-requests\` | Find-or-create with EMPI, push to EHR, canonical Patient model | All Experience APIs |
| Process | **prc-patient-checkin** | \`POST /check-ins\` | Appointment → patient → update demographics → verify insurance → mark arrived | exp-kiosk, exp-frontdesk |
| System | **sys-empi** | \`GET /identities?…\` (search with scores), \`POST /identities\`, \`POST /identities/{id}/links\` | Wrap EMPI SOAP | prc-patient-registration |
| System | **sys-ehr-patients** | \`GET /patients/{mrn}\`, \`POST /patients\` / \`PUT /patients/{mrn}\` (→ HL7 ADT A04/A08 via MLLP, waits for ACK) | Hide HL7 v2/FHIR details of the EHR | Process APIs |
| System | **sys-insurance-eligibility** | \`POST /eligibility-checks\` | Wrap clearing house, cache result per patient/day | prc-patient-checkin |
| System | **sys-appointments** | \`GET /appointments/{code}\`, \`PATCH /appointments/{id}/status\` | Wrap appointments REST | prc-patient-checkin |

\`\`\`
 [Kiosk]        [Front-desk app]        [Partner clinic EHRs]
    |                 |                         |  FHIR R4, mTLS
 exp-kiosk      exp-frontdesk           exp-partner-fhir         Experience
    |                 |                         |
    +--------+--------+------------+------------+
             v                     v
     prc-patient-checkin --> prc-patient-registration            Process
       |          |                  |            |
 sys-appoint-  sys-insurance-     sys-empi    sys-ehr-patients   System
 ments         eligibility           |            |  HL7 v2 / FHIR
    |             |                [EMPI]       [EHR]
\`\`\`

**Sequence — kiosk check-in**
1. Kiosk → exp-kiosk \`POST /check-ins { appointmentCode, dateOfBirth }\` (kiosk device client credentials + mTLS).
2. → prc-patient-checkin → sys-appointments: find appointment; verify DOB against the patient (via prc-patient-registration / sys-ehr-patients). Mismatch → generic "please see reception" (no data leakage).
3. Returns a short-lived check-in session; kiosk shows **masked** address/phone for confirmation.
4. Patient updates phone → \`PATCH /contact\` → prc-patient-registration \`PATCH /patients/{id}\` → sys-ehr-patients sends ADT **A08** (update) and EMPI updated.
5. Insurance verification via sys-insurance-eligibility (cached per patient per day because each call costs money); then sys-appointments status = ARRIVED.

**Sequence — partner pre-registration**
1. Clinic system → exp-partner-fhir \`POST /fhir/Patient\` (OAuth client credentials per clinic + mTLS; scope \`patient.write\`).
2. exp-partner-fhir validates the FHIR resource and maps FHIR Patient → canonical Patient; adds \`sourceClinicId\`.
3. prc-patient-registration \`POST /patients/match\` → sys-empi search: score ≥ high threshold → link to existing; between thresholds → create a **manual review task** (front desk merge queue) and return \`202\` with a pending identifier; below → create new identity in EMPI and in EHR (ADT **A04**/A28).
4. A referral record links clinic ↔ patient; future \`GET /fhir/Patient\` from that clinic only returns patients with such a link.

**Where things live.**
- **FHIR** is a contract for external consumers → Experience layer. Internally the Process layer uses a canonical model so kiosk/front desk aren't forced into FHIR complexity (though using FHIR as canonical model is also defensible).
- **Duplicate detection** is a business rule → prc-patient-registration, using EMPI scores. No channel can create a patient without it.

**Security and audit.** OAuth 2.0 + mTLS for partners (Client ID enforcement + JWT validation + IP allowlist); data minimisation per Experience API (kiosk never receives full records); TLS 1.2+ internally; an audit event (who, which patient, which operation, channel) published by Process APIs to a secure audit store; logs exclude PHI.

**Reuse.** sys-empi and sys-ehr-patients become the foundation for the patient portal and lab results projects; prc-patient-registration is the single identity entry point for every future channel.

**NFRs.** Kiosk < 3 s: parallel calls where possible, insurance check can complete asynchronously (show "verified" later to the clerk). MLLP send waits for the ACK with a timeout; if the EHR is down, the update is queued (persistent) and retried in order per patient.
`,
  followUps: [
    { q: 'Why not let partner clinics call the EHR\'s own FHIR API directly?', a: 'You would expose the EHR to the internet, lose control over scoping and duplicate checks, and couple 60 partners to one vendor. The Experience API is a governed façade that can stay stable if the EHR changes.' },
    { q: 'Why must ADT updates for one patient be processed in order?', a: 'An A08 applied before the A04 that created the patient, or two A08s swapped, leaves wrong demographics in the EHR. Ordering per patient (e.g. FIFO queue or message group key) avoids it.' },
    { q: 'Would you use FHIR as the canonical model in the Process layer?', a: 'It is a valid choice in healthcare-heavy networks because it is a recognised standard. The trade-off is complexity for simple internal consumers; many teams use a FHIR-aligned but simplified canonical model.' },
  ],
}

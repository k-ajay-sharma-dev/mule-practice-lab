import { diagram } from '../../arch/dsl.js'

const CLINICAL_DATA = ['saas', 'legacy', 'database']
const AUDIT = { type: ['data-warehouse', 'database', 'file-store'], label: ['audit'] }

export default {
  id: 'cs-101',
  category: 'case-studies',
  title: 'Regional Health Information Exchange Sharing Patient Summaries Across 30 Hospitals',
  level: 'EXPERT',
  tags: ['healthcare', 'fhir', 'hl7', 'mllp', 'api-led', 'security', 'oauth2', 'pii', 'governance', 'event-driven'],
  estMinutes: 60,
  diagram: {
    task: 'draw the exchange: clinicians reach a FHIR summary Experience API through the gateway, which checks tokens with the identity provider; one query Process API finds the patient in the MPI, checks consent, queries FHIR hospitals live and reads a central repository for hospitals that only send HL7 v2; v2 messages are queued and loaded into the repository; every access is audited asynchronously.',
    checks: [
      { label: 'Clinicians reach the summary API only through the gateway', rule: { type: 'only-via', target: 'experience-api', from: 'api-gateway' } },
      { label: 'The gateway validates tokens with the identity provider', rule: { type: 'link', from: 'api-gateway', to: 'identity-provider' } },
      { label: 'The query Process API finds the patient in the master patient index', rule: { type: 'path', from: 'process-api', to: { type: ['database', 'system-api', 'saas'], label: ['mpi', 'patient index'] } } },
      { label: 'Consent is checked on every query', rule: { type: 'path', from: 'process-api', to: { type: ['database', 'system-api', 'saas'], label: ['consent'] } } },
      { label: 'Every route from a clinician to patient data passes the query Process API', rule: { type: 'no-path', from: ['internal-app', 'web-app'], to: CLINICAL_DATA, unless: 'process-api' } },
      { label: 'FHIR hospitals are queried live with sync calls (at least two)', rule: { type: 'path', from: 'internal-app', to: { type: ['saas', 'legacy'], label: ['fhir'] }, kind: 'sync', min: 2 } },
      { label: 'Clinicians never query an HL7 v2-only hospital live', rule: { type: 'no-path', from: ['internal-app', 'web-app'], to: { type: ['legacy', 'saas', 'database'], label: ['v2'] } } },
      { label: 'HL7 v2 messages are queued as async messages, not loaded inline', rule: { type: 'edge', from: 'system-api', to: 'queue', kind: 'async' } },
      { label: 'A loader Process API fills the clinical data repository from the queue', rule: { type: 'path', from: 'queue', via: 'process-api', to: { type: 'database', label: ['repository', 'cdr'] } } },
      { label: 'Hospital systems and data stores are reached only through System APIs', rule: { type: 'only-via', target: CLINICAL_DATA, from: 'system-api' } },
      { label: 'Every access is audited through async messages', rule: { type: 'path', from: 'process-api', via: ['topic', 'queue', 'event-stream'], to: AUDIT, kind: 'async' } },
    ],
    reference: diagram(
      {
        cv: ['internal-app', 'Clinician viewer (launched from local EHR)'],
        idp: ['identity-provider', 'Regional identity (SMART on FHIR, OIDC)'],
        gw: ['api-gateway', 'API gateway (token, scopes, rate limits)'],
        efh: ['experience-api', 'exp-patient-summary-fhir-api'],
        pq: ['process-api', 'prc-federated-summary'],
        smpi: ['system-api', 'sys-mpi-api'],
        mpi: ['database', 'Master patient index'],
        scon: ['system-api', 'sys-consent-api'],
        con: ['database', 'Consent registry'],
        sfa: ['system-api', 'sys-hospital-a-fhir-api'],
        ehra: ['saas', 'Hospital A EHR (FHIR R4)'],
        sfb: ['system-api', 'sys-hospital-b-fhir-api'],
        ehrb: ['legacy', 'Hospital B EHR (FHIR R4)'],
        scdr: ['system-api', 'sys-cdr-api'],
        cdr: ['database', 'Clinical data repository (CDR)'],
        v2h: ['legacy', 'HL7 v2-only hospital systems (ADT, ORU)'],
        lis: ['system-api', 'sys-hl7v2-listener (MLLP)'],
        v2q: ['queue', 'hl7v2-clinical-messages'],
        load: ['process-api', 'prc-cdr-loader'],
        aud: ['topic', 'access-audit-events'],
        audit: ['data-warehouse', 'Access audit store'],
      },
      [
        'cv -> gw', 'gw -> idp', 'gw -> efh', 'efh -> pq',
        'pq -> smpi', 'smpi -> mpi', 'pq -> scon', 'scon -> con',
        'pq -> sfa', 'sfa -> ehra', 'pq -> sfb', 'sfb -> ehrb', 'pq -> scdr', 'scdr -> cdr',
        'v2h -> lis', 'lis ~> v2q', 'v2q ~> load', 'load -> scdr', 'pq ~> aud', 'aud ~> audit',
      ],
    ),
  },
  description: `
**Context.** A regional health information exchange (HIE) serves 30 hospitals, 400 GP practices and 2.8 million people. A clinician treating a patient should see a summary from every other organisation that has treated them: allergies, current medications, problems, recent lab results and discharge letters.

**What exists.**
- 18 hospitals run EHRs with FHIR R4 APIs (US Core or a national profile), of very different quality and capacity.
- 12 hospitals only send HL7 v2 messages (ADT, ORU results, MDM documents) and cannot answer queries.
- Each organisation has its own patient numbers; a regional master patient index (MPI) links them, with about 2% uncertain matches.
- A consent registry holds patient opt-outs and restrictions (for example, "do not share mental health records").

**Goals**
- A summary within 5 seconds for 95% of requests, launched from inside the clinician's own EHR.
- Clinicians see only patients they have a care relationship with; "break the glass" access is allowed but reviewed.
- Every access is recorded: who, which patient, what was returned, why.
- Hospitals keep control of their data and their systems are protected from overload.

**Constraints**
| Item | Detail |
|---|---|
| Volume | About 25,000 summary requests a day, 80 a second at the morning peak |
| Hospital APIs | Each FHIR hospital sets a limit (some as low as 5 requests a second) and has maintenance windows |
| Law | Health data is special category data; sharing for direct care only; patients can opt out |
| Governance | A data sharing agreement per organisation; a regional board approves new data types |
| Teams | A central team of 8; hospital IT teams vary from strong to one person |

**Your task.** Design the exchange architecture. Decide between querying hospitals live and copying data to a central store, and show how consent, identity, audit and hospital protection work.
`,
  answerTemplate: `## Federated, central or hybrid

## Clinician access and identity

## Patient matching

## Consent and restrictions

## The query path and its time budget

## HL7 v2-only hospitals

## Audit and break the glass

## Protecting hospital systems

## Governance and onboarding
`,
  keyPoints: [
    'A hybrid: FHIR hospitals are queried live through their own System APIs; v2-only hospitals feed a central repository, which is queried like one more source.',
    'One query Process API owns the order of work: MPI lookup, consent check, parallel queries with per-source timeouts, merge and de-duplicate, consent filtering of the result.',
    'Clinician identity and care relationship come from SMART on FHIR launch tokens validated at the gateway; scopes limit what can be asked.',
    'Every access writes an audit event asynchronously to an append-only store; break-the-glass access is flagged and reviewed.',
    'Each hospital System API enforces that hospital\'s rate limit and maintenance window, and returns partial results rather than failing the summary.',
    'Governance: data sharing agreements, an onboarding checklist and conformance tests per hospital, and a board for new data types.',
  ],
  solution: `
**Shape.** Hybrid. Querying FHIR hospitals live keeps data at the source and current. The 12 v2-only hospitals cannot be queried, so their messages are loaded into a clinical data repository (CDR) that \`prc-federated-summary\` reads like any other source.

**Access.** The clinician's EHR launches the viewer with SMART on FHIR. The gateway validates the token with the regional identity provider and checks scopes (\`patient/*.read\` for the launched patient only). \`exp-patient-summary-fhir-api\` returns a FHIR Bundle.

**Query path (5 second budget).**
1. MPI lookup through \`sys-mpi-api\` (100 ms). Uncertain matches are not merged; the clinician sees them as "possible matches" with a warning.
2. Consent check through \`sys-consent-api\`. Opted-out patients return nothing; restrictions remove sections later.
3. Parallel queries (scatter-gather) to every source the MPI lists: hospital FHIR System APIs and \`sys-cdr-api\`, each with its own timeout (3 seconds).
4. Merge, remove duplicates (the same lab result from two sources), apply consent restrictions and return. Sources that timed out are listed as "not available".

**Hospital protection.** Each hospital System API holds that hospital's rate limit, caches nothing clinical beyond a few minutes, and follows its maintenance calendar.

**v2 feed.** \`sys-hl7v2-listener\` accepts MLLP, ACKs after the message is on \`hl7v2-clinical-messages\`, and \`prc-cdr-loader\` maps ADT, ORU and MDM to FHIR resources in the CDR, keyed by source and message id.

**Audit.** \`prc-federated-summary\` publishes an access event (user, role, organisation, patient, sources, sections returned, purpose, break-the-glass flag) for every request. The audit store is append-only. Break-the-glass events go to a daily review list for privacy officers. Patients can request their access log.

**Governance.** Data sharing agreement and conformance tests before a hospital goes live; new data types (for example mental health) approved by the board with consent rules first.
`,
  followUps: [
    { q: 'Why not copy every hospital\'s data into one central store?', a: 'A full copy makes the exchange a second record that must be kept current, secured and governed for every data type. Querying at the source keeps data current and leaves control with the hospital.' },
    { q: 'What happens when one hospital is slow or down?', a: 'Its query times out after its own limit and the summary is returned without it. The viewer shows that source as not available.' },
    { q: 'How do you handle uncertain patient matches?', a: 'Do not merge records on an uncertain match. Show them as possible matches with a warning, and send them to the MPI data stewards.' },
    { q: 'How does break the glass work without becoming a back door?', a: 'The clinician must give a reason, and access is logged with a flag. Privacy officers review every such access, and misuse has consequences.' },
    { q: 'Where should consent be enforced, at the gateway or in the Process API?', a: 'In the Process API, because restrictions depend on the content returned. The gateway checks the token and scopes, but it cannot know which sections a patient restricted.' },
  ],
}

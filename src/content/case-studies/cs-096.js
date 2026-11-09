import { diagram } from '../../arch/dsl.js'

const IRT = { type: 'saas', label: ['irt'] }
const BLINDED = { type: ['topic', 'event-stream'], label: ['blinded'] }
const RESTRICTED = { type: ['queue', 'topic', 'event-stream'], label: ['restricted', 'unblind'] }
const BLINDED_SYSTEMS = { type: ['saas', 'data-warehouse'], label: ['edc', 'ctms', 'warehouse', 'analytics'] }

export default {
  id: 'cs-096',
  category: 'case-studies',
  title: 'Trial Sponsor Connecting IRT, EDC and CTMS Without Breaking the Blind',
  level: 'ADVANCED',
  tags: ['pharma', 'clinical-trials', 'events', 'pub-sub', 'compliance', 'pii', 'sap', 'governance'],
  estMinutes: 55,
  diagram: {
    task: 'draw the trial integration: IRT and EDC webhooks arriving at one Experience API, which publishes blinded trial events to a topic and unblinded kit data to a restricted queue; subject creation in EDC, visit tracking in CTMS and the blinded warehouse fed from the blinded topic; drug supply to the depot fed only from the restricted queue; and a monthly run that pays sites in SAP.',
    checks: [
      { label: 'IRT and EDC send their events to an Experience API', rule: { type: 'each', of: { type: 'saas', label: ['irt', 'edc'] }, edgeTo: 'experience-api', min: 2 } },
      { label: 'The webhook API publishes blinded trial events as async messages', rule: { type: 'edge', from: 'experience-api', to: BLINDED, kind: 'async' } },
      { label: 'Enrolment creates the subject in EDC through a Process API', rule: { type: 'path', from: BLINDED, via: 'process-api', to: { type: 'saas', label: 'edc' } } },
      { label: 'Completed visits reach the CTMS', rule: { type: 'path', from: BLINDED, to: { type: 'saas', label: 'ctms' } } },
      { label: 'The clinical data warehouse is fed from the blinded events', rule: { type: 'path', from: BLINDED, to: 'data-warehouse' } },
      { label: 'Every route from IRT to EDC, CTMS or the warehouse passes the blinded topic', rule: { type: 'no-path', from: IRT, to: BLINDED_SYSTEMS, unless: BLINDED } },
      { label: 'Kit and treatment data reaches the depot through a restricted queue', rule: { type: 'path', from: RESTRICTED, via: 'process-api', to: ['external-api', 'partner', 'wms'] } },
      { label: 'Unblinded data never reaches EDC, CTMS or the warehouse', rule: { type: 'no-path', from: RESTRICTED, to: BLINDED_SYSTEMS } },
      { label: 'A scheduled run pays sites in SAP', rule: { type: 'path', from: 'batch-job', via: 'process-api', to: 'erp' } },
      { label: 'SaaS systems, SAP and the depot are reached only through System APIs', rule: { type: 'only-via', target: ['saas', 'erp', 'external-api'], from: 'system-api' } },
    ],
    reference: diagram(
      {
        irt: ['saas', 'IRT (randomisation and supply)'],
        edc: ['saas', 'EDC (eCRF)'],
        ctms: ['saas', 'CTMS (visits and site payments)'],
        erp: ['erp', 'SAP S/4HANA (accounts payable)'],
        depot: ['external-api', 'Depot / clinical supply 3PL'],
        hook: ['experience-api', 'exp-trial-vendor-webhooks'],
        ev: ['topic', 'trial-events-blinded'],
        unq: ['queue', 'supply-restricted'],
        penr: ['process-api', 'prc-subject-enrolment'],
        pvis: ['process-api', 'prc-visit-tracking'],
        psup: ['process-api', 'prc-drug-supply'],
        ppay: ['process-api', 'prc-site-payments'],
        job: ['batch-job', 'monthly site payment run'],
        sedc: ['system-api', 'sys-edc-api'],
        sctms: ['system-api', 'sys-ctms-api'],
        sdep: ['system-api', 'sys-depot-api'],
        serp: ['system-api', 'sys-sap-ap-api'],
        dw: ['data-warehouse', 'Clinical data warehouse (blinded)'],
      },
      [
        'irt -> hook', 'edc -> hook', 'hook ~> ev', 'hook ~> unq',
        'ev ~> penr', 'penr -> sedc', 'sedc -> edc', 'ev ~> pvis', 'pvis -> sctms', 'sctms -> ctms', 'ev ~> dw',
        'unq ~> psup', 'psup -> sdep', 'sdep -> depot',
        'job -> ppay', 'ppay -> sctms', 'ppay -> serp', 'serp -> erp',
      ],
    ),
  },
  description: `
**Context.** A mid-size pharmaceutical sponsor runs 40 active clinical trials at 300 sites in 22 countries, with about 25,000 participants. Each trial uses three SaaS products from different vendors:
- **IRT** (interactive response technology) randomises participants to a treatment arm and assigns numbered drug kits.
- **EDC** (electronic data capture) holds the case report forms that site staff fill in at each visit.
- **CTMS** (clinical trial management) tracks site visits, monitoring and what each site is owed.

Sites are paid from SAP S/4HANA. A clinical supply depot ships kits to sites.

**The problem today.** Site staff enter each new participant in IRT and again in EDC. Visit dates are copied from EDC into CTMS by study managers, so site payments are often two months late. Last year a spreadsheet export that included treatment arm codes was shared with a study team, and the sponsor had to file a protocol deviation for a possible unblinding.

**Goals**
- A participant randomised in IRT appears in EDC within 5 minutes, with no re-keying.
- Completed visits in EDC update CTMS daily; sites are paid monthly from SAP.
- Kit assignments reach the depot so it can resupply sites.
- Treatment arm and kit-to-arm data never reaches blinded systems or people.

**Constraints**
| Item | Detail |
|---|---|
| Volume | About 600 randomisations and 9,000 visits a week across all trials |
| Vendors | All three products send webhooks and offer REST APIs; IRT webhooks can include the arm unless filtered |
| Regulation | Computerised systems in trials must be validated, with audit trails and controlled change (21 CFR Part 11, EU Annex 11) |
| Privacy | Participants are pseudonymised: only subject numbers leave the site; GDPR applies to EU trials |
| Blinding | Only the unblinded supply team and the depot may see kit numbers with arms |

**Your task.** Design the integration between IRT, EDC, CTMS, SAP and the depot, and show how the design protects the blind.
`,
  answerTemplate: `## Systems and data owners

## Receiving vendor webhooks

## Separating blinded and unblinded data

## Enrolment and visit flows

## Site payments

## Validation, audit and privacy

## Risks
`,
  keyPoints: [
    'Vendor webhooks land on one Experience API that verifies signatures and splits each message: blinded fields to a blinded topic, kit and arm data to a restricted queue.',
    'EDC, CTMS and the warehouse subscribe only to blinded events; no route from IRT reaches them except through the blinded topic.',
    'Only the drug supply Process API reads the restricted queue, with its own access controls, and sends kit data to the depot through a System API.',
    'Site payments run monthly from CTMS visit data into SAP through System APIs, so the finance team never touches trial data.',
    'The integration is validated like any GxP system: requirements, test evidence, change control and an audit trail of every message.',
    'Only subject numbers cross systems; mapping to real people stays at the site.',
  ],
  solution: `
**Webhook intake.** \`exp-trial-vendor-webhooks\` receives IRT and EDC webhooks, checks the vendor signature and the trial id, and answers 202. It then builds two messages:
- a blinded event (subject number, site, trial, randomisation date, visit completed) published to \`trial-events-blinded\`
- for IRT kit assignments only, an unblinded message (subject number, kit number, arm) published to \`supply-restricted\`

The arm field is removed by an allow-list mapping, not a deny-list, so a new vendor field cannot leak.

**Blinded consumers.**
- \`prc-subject-enrolment\` creates the subject in EDC through \`sys-edc-api\` (idempotent on trial and subject number).
- \`prc-visit-tracking\` updates the visit record in CTMS through \`sys-ctms-api\`.
- The clinical data warehouse subscribes to the blinded events for operational reporting.

**Unblinded consumer.** \`prc-drug-supply\` is the only app with permission to read \`supply-restricted\`. It sends kit assignments to the depot through \`sys-depot-api\`. The queue, the app and its logs sit in a separate business group with access for the unblinded supply team only.

**Site payments.** A monthly job starts \`prc-site-payments\`, which reads payable visits from CTMS and posts supplier invoices through \`sys-sap-ap-api\`.

**Validation and audit.** Each message carries a correlation id. Every message in and out is logged with its id and outcome (not its clinical content) to an audit store. Releases follow change control with documented tests. Personal data is limited to subject numbers.

**Risks.** A vendor adds the arm to another webhook field (allow-list mapping and contract tests), a misconfigured subscriber reads the restricted queue (access controls and periodic review), and validation slowing change (risk-based testing).
`,
  followUps: [
    { q: 'Why split the IRT webhook into two messages instead of filtering in each consumer?', a: 'If every consumer filters, one mistake in any consumer unblinds a study. Splitting at intake means blinded systems never receive the arm in the first place.' },
    { q: 'Why use an allow-list mapping for blinded events?', a: 'An allow-list copies only named fields, so a field the vendor adds later is dropped by default. A deny-list would pass any new field through, including a renamed arm field.' },
    { q: 'How do you make subject creation in EDC safe to retry?', a: 'Key the call on trial id and subject number, and treat an existing subject as success. A redelivered event then does nothing new.' },
    { q: 'What does validation mean for an integration in a clinical trial?', a: 'Documented requirements, tests that prove them, controlled change and an audit trail. Each release is traced back to the requirements it changes.' },
  ],
}

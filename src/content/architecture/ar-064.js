import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-064',
  category: 'architecture',
  title: 'Critique and Remediate a Badly Designed API-led Estate',
  level: 'EXPERT',
  tags: ['api-led', 'anti-patterns', 'remediation', 'architecture-review', 'roadmap'],
  estMinutes: 45,
  diagram: {
    task: 'draw the target architecture for the Policy & Claims domain that fixes the smells in the inventory.',
    checks: [
      { label: 'Every channel (mobile, broker, call centre…) calls an Experience API', rule: { type: 'each', of: ['mobile-app', 'web-app', 'partner', 'internal-app'], min: 3, edgeTo: 'experience-api' } },
      { label: 'Every Experience API calls Process APIs — no orchestration or eligibility rules at the edge (#11, #13)', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Experience APIs never call System APIs directly (#11)', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Exactly one Policy Process API shared by all channels (#7–#9)', rule: { type: 'node', match: { type: 'process-api', label: 'policy' }, min: 1, max: 1 } },
      { label: 'System APIs never call other System APIs (#6)', rule: { type: 'no-edge', from: 'system-api', to: 'system-api' } },
      { label: 'The policy mainframe is reached only through a System API (#14)', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'The claims database is reached only through a resource-oriented System API (#5)', rule: { type: 'only-via', target: 'database', from: 'system-api' } },
      { label: 'Notifications are triggered by events, off the critical path (#15)', rule: { type: 'edge', from: ['queue', 'topic', 'event-stream'], to: 'process-api', kind: 'async' } },
      { label: 'Every Experience API uses the one Policy Process API (#7–#9)', rule: { type: 'each', of: 'experience-api', edgeTo: { type: 'process-api', label: 'policy' } } },
      { label: 'Mobile and broker both get claim eligibility from the Claims Process API (#11, #13)', rule: { type: 'each', of: { type: 'experience-api', label: ['mobile', 'broker'] }, min: 2, edgeTo: { type: 'process-api', label: ['claim', 'eligib'] } } },
      { label: 'The Policy Process API reads policies through the one Policy System API (#1–#4)', rule: { type: 'each', of: { type: 'process-api', label: 'policy' }, edgeTo: { type: 'system-api', label: 'policy' } } },
      { label: 'Every System API is called by a Process API', rule: { type: 'each', of: 'system-api', edgeFrom: 'process-api' } },
      { label: 'Every System API connects to its backend', rule: { type: 'each', of: 'system-api', edgeTo: ['legacy', 'database', 'crm', 'notification', 'saas', 'erp', 'external-api'] } },
      { label: 'The Policy Process API publishes its events asynchronously (#15)', rule: { type: 'edge', from: { type: 'process-api', label: 'policy' }, to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'Events lead on to the SMS / email provider (#15)', rule: { type: 'path', from: ['queue', 'topic', 'event-stream'], to: 'notification' } },
      { label: 'No chain of sync calls joins an Experience API to the SMS / email provider (#15)', rule: { type: 'no-path', from: 'experience-api', to: 'notification', kind: 'sync' } },
      { label: 'APIs call each other with sync calls. Async work goes through a broker', rule: { type: 'lines', from: ['mobile-app', 'web-app', 'partner', 'internal-app', 'experience-api', 'process-api'], to: ['experience-api', 'process-api', 'system-api'], kind: 'sync' } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: ['queue', 'topic', 'event-stream', 'cloud-queue', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Mobile app'],
        brk: ['partner', 'Broker portal'],
        cc: ['internal-app', 'Call centre app'],
        em: ['experience-api', 'exp-mobile-api'],
        eb: ['experience-api', 'exp-broker-api'],
        ec: ['experience-api', 'exp-callcenter-api'],
        pp: ['process-api', 'prc-policy-api (premium rules once)'],
        pcl: ['process-api', 'prc-claims-api (eligibility)'],
        ev: ['topic', 'ClaimSubmitted / PolicyChanged'],
        pn: ['process-api', 'prc-notification (async subscriber)'],
        sp: ['system-api', 'sys-policy-api'],
        scl: ['system-api', 'sys-claims-api'],
        scrm: ['system-api', 'sys-crm-customer-api'],
        smsg: ['system-api', 'sys-messaging-api'],
        mf: ['legacy', 'Policy mainframe'],
        cdb: ['database', 'Claims DB'],
        crm: ['crm', 'CRM'],
        sms: ['notification', 'SMS / email provider'],
      },
      [
        'mob -> em', 'brk -> eb', 'cc -> ec', 'em -> pp', 'em -> pcl', 'eb -> pp', 'eb -> pcl', 'ec -> pp', 'ec -> pcl',
        'pp -> sp', 'pp -> scrm', 'pcl -> scl', 'pcl -> sp', 'sp -> mf', 'scl -> cdb', 'scrm -> crm',
        'pp ~> ev', 'pcl ~> ev', 'ev ~> pn', 'pn -> smsg', 'smsg -> sms',
      ],
    ),
  },
  description: `
You join an insurer as lead architect. The previous vendor delivered "API-led". Here is the inventory for the Policy & Claims domain:

| # | API | Layer | Observations |
|---|---|---|---|
| 1 | sys-policy-getpolicy-api | Sys | One operation only: GET by policy number |
| 2 | sys-policy-getcoverages-api | Sys | One operation: GET coverages for a policy |
| 3 | sys-policy-getinsured-api | Sys | One operation: GET insured persons |
| 4 | sys-policy-getpremium-api | Sys | One operation; exposes mainframe copybook field names |
| 5 | sys-claims-db-api | Sys | Generic \`POST /query\` accepting raw SQL from callers |
| 6 | sys-crm-customer-api | Sys | Fine; also calls #1 to "enrich" customer with policies |
| 7 | prc-policy-mobile-api | Proc | Built for the mobile app |
| 8 | prc-policy-web-api | Proc | Built for the web portal; 80% same code as #7 |
| 9 | prc-policy-broker-api | Proc | Built for brokers; same again with a different premium rule |
| 10 | prc-claims-api | Proc | Pass-through to #5, no logic |
| 11 | exp-mobile-api | Exp | Calls #1, #2, #3, #4, #6 and #10 directly; computes claim eligibility |
| 12 | exp-web-api | Exp | Calls #8 |
| 13 | exp-broker-api | Exp | Calls #9; has its own copy of claim eligibility logic |
| 14 | exp-callcenter-api | Exp | Calls the mainframe directly via the IBM MQ connector "for speed" |
| 15 | prc-notification-api | Proc | Called by #7, #8, #9 and #11 synchronously to send SMS/email; 3 s p95 |

Symptoms: mobile policy screen takes 3–4 s; a premium rule change took 3 releases and still differs between web and broker; a SQL injection finding on #5; 15 apps × 2 replicas × 1 vCore.

**Deliver:**
1. Identify each **smell**, mapped to API numbers, and explain why it hurts.
2. Propose the **target architecture** for this domain.
3. A **phased remediation roadmap** (what first, and why) that does not break existing consumers.
4. Governance changes so this does not happen again.
`,
  answerTemplate: `## Smells and impact

## Target architecture

## Remediation roadmap

## Governance changes
`,
  keyPoints: [
    'Chatty, operation-sized System APIs (1–4) and leaked copybook names force consumers to make many calls and couple them to the mainframe; consolidate into one resource-oriented Policy System API.',
    'Process APIs per consumer (7–9) duplicate business logic and cause rule drift; replace with one channel-agnostic Policy Process API and push differences up to Experience APIs.',
    'Layer violations: a System API calling another (6→1), an Experience API orchestrating six System APIs with business rules (11), and bypassing the System layer to the mainframe (14).',
    'Security/design defects: generic SQL-passing API (5) and a pass-through Process API (10); synchronous notifications on the critical path (15) should become asynchronous events.',
    'Remediation is risk- and value-ordered: fix the security hole first, then the shared Process API behind existing Experience contracts (strangler/facade), then consolidation and retirement driven by traffic analytics, with governance gates to prevent recurrence.',
  ],
  solution: `
**Smells and impact.**

| Smell | APIs | Why it hurts |
|---|---|---|
| Operation-per-API / chatty System APIs | 1–4 | Consumers need 4+ calls for one policy view → latency (3–4 s mobile), 4 apps to run, no cohesive resource model |
| Leaked SoR model | 4 | Copybook field names couple every consumer to the mainframe; a mainframe change ripples upward |
| Generic query / SQL pass-through | 5 | SQL injection; no contract; consumers coupled to the DB schema; impossible to govern |
| System calling System | 6 → 1 | Hidden coupling; CRM API now fails when Policy API fails; orchestration in the wrong layer |
| Process API per consumer | 7, 8, 9 | 80% duplicated code; premium rule diverged across channels — the exact problem API-led should prevent |
| Pass-through Process API | 10 | Hop, app and deployment with no value |
| Experience doing orchestration + business rules | 11, 13 | Eligibility logic duplicated in 11 and 13 → inconsistent answers; 6 synchronous calls from the edge |
| Layer bypass to the backend | 14 | Mainframe access logic and credentials outside the System layer; next mainframe change breaks it |
| Synchronous side-effects | 15 | 3 s notification latency added to user-facing calls; notification outage fails business transactions |
| Uniform oversizing | all | 30 vCores for a domain with modest traffic |

**Target architecture.**
\`\`\`
Experience:  exp-mobile-api   exp-web-api   exp-broker-api   exp-callcenter-api
                   \\              |              |                /
Process:            prc-policy-api (premium rules, policy view)
                    prc-claims-api (eligibility, claim lifecycle)
                          |                 |            --publish--> [events: ClaimSubmitted, PolicyChanged]
System:   sys-policy-api (/policies/{id}, /coverages, /insured, /premium)       |
          sys-claims-api (resource-oriented, parameterised queries)         prc-notification (async subscriber)
          sys-crm-customer-api (no calls to other System APIs)                    |
                                                                            sys-messaging-api (SMS/email)
\`\`\`
- **One** \`sys-policy-api\` (resource-oriented, clean field names), mapped from the mainframe.
- **One** \`prc-policy-api\`: premium rules once; broker-specific *business* differences (e.g. broker commission view) modelled as explicit business rules/parameters, not separate APIs.
- \`prc-claims-api\` gets real responsibility: claim eligibility moves here from 11 and 13.
- Notifications become **asynchronous** (events/queue), off the critical path.
- Experience APIs only shape and secure; 14 calls Process APIs.

**Remediation roadmap.**
- **Phase 0 (immediately, 1–2 weeks):** close the SQL injection in #5 — restrict to parameterised named queries / allowlisted operations; apply client-id enforcement and restrict callers. Security first.
- **Phase 1 (quick wins, ~1 month):** make notifications async (#15 publishes to a queue; callers fire-and-forget) → immediate latency win. Right-size low-traffic apps (fractional sizes, co-locate small ones) → cost win that funds the rest.
- **Phase 2 (~2–3 months):** build \`sys-policy-api\` (consolidating 1–4). Keep 1–4 running as **thin facades** delegating to it, so nothing breaks. Remove #6's call to #1 (move enrichment to a Process API).
- **Phase 3 (~3 months):** build \`prc-policy-api\` with one agreed premium rule (business sign-off needed — the divergence is a business decision, not just technical). Re-point #12, #13 and #11 *internally*; their external contracts stay unchanged. Move eligibility into \`prc-claims-api\`; #11 and #13 call it.
- **Phase 4:** re-point #14 to Process APIs and remove MQ/mainframe access from the Experience layer. Retire #7–#9, #10 (or give it real logic), and facades 1–4 once **analytics show zero traffic** by client id. Sunset dates published in Exchange.
- Each phase is measured: p95 of the mobile screen, number of rule implementations (target: 1), vCores, incidents.

**Governance changes.**
- Design review gate before a new API asset is created: layer, responsibility, "is there an existing one?".
- Standards: resource-oriented System APIs, no generic query endpoints, no System→System calls, no backend connectors outside the System layer, no business rules in Experience APIs.
- Spec governance rulesets + project templates enforcing naming and error contracts.
- Ownership: each API has one owning team; Process APIs are owned by domain teams, not channel teams.
- Reuse and cost dashboards reviewed quarterly by the C4E.
`,
  followUps: [
    { q: 'The broker premium rule genuinely differs. Doesn\'t that justify prc-policy-broker-api?', a: 'A different business rule for a different customer segment is still policy logic; model it as an explicit rule in the one Policy Process API (by distribution channel or product), so it is visible, tested and not silently duplicated.' },
    { q: 'How do you sell a 6-month remediation to a business that sees no new features?', a: 'Tie each phase to a measurable business outcome: security finding closed, mobile screen 3 s to under 1 s, vCore cost down, premium rule changes in one release instead of three. Deliver the quick wins first to build credibility.' },
    { q: 'Why keep facades for #1–#4 instead of migrating consumers immediately?', a: 'Facades decouple the consolidation from consumers\' release schedules, so you can ship the new System API without a big-bang cut-over and retire the facades when analytics show they are unused.' },
  ],
}

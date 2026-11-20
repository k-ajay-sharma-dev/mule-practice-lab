import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-064',
  category: 'architecture',
  title: 'Critique and Remediate a Badly Designed API-led Estate',
  level: 'EXPERT',
  tags: ['api-led', 'anti-patterns', 'remediation', 'architecture-review', 'roadmap'],
  estMinutes: 60,
  diagram: {
    task: 'draw the target architecture for the Policy & Claims domain that fixes the smells in the inventory.',
    checks: [
      { label: 'Every channel (mobile, broker, call centre…) calls an Experience API', rule: { type: 'each', of: ['mobile-app', 'web-app', 'partner', 'internal-app'], min: 3, edgeTo: 'experience-api' } },
      { label: 'Every Experience API calls Process APIs, with no orchestration or eligibility rules at the edge (#11, #13)', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Experience APIs never call System APIs directly (#11)', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Exactly one Policy Process API shared by all channels (#7 to #9)', rule: { type: 'node', match: { type: 'process-api', label: 'policy' }, min: 1, max: 1 } },
      { label: 'System APIs never call other System APIs (#6)', rule: { type: 'no-edge', from: 'system-api', to: 'system-api' } },
      { label: 'The policy mainframe is reached only through a System API (#14)', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'The claims database is reached only through a resource-oriented System API (#5)', rule: { type: 'only-via', target: 'database', from: 'system-api' } },
      { label: 'Notifications are triggered by events, off the critical path (#15)', rule: { type: 'edge', from: ['queue', 'topic', 'event-stream'], to: 'process-api', kind: 'async' } },
      { label: 'Every Experience API uses the one Policy Process API (#7 to #9)', rule: { type: 'each', of: 'experience-api', edgeTo: { type: 'process-api', label: 'policy' } } },
      { label: 'Mobile and broker both get claim eligibility from the Claims Process API (#11, #13)', rule: { type: 'each', of: { type: 'experience-api', label: ['mobile', 'broker'] }, min: 2, edgeTo: { type: 'process-api', label: ['claim', 'eligib'] } } },
      { label: 'The Policy Process API reads policies through the one Policy System API (#1 to #4)', rule: { type: 'each', of: { type: 'process-api', label: 'policy' }, edgeTo: { type: 'system-api', label: 'policy' } } },
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
        eb: ['experience-api', 'exp-broker-api', { auth: 'client-id' }],
        ec: ['experience-api', 'exp-callcenter-api'],
        pp: ['process-api', 'prc-policy-api (premium rules once)', { vCores: '0.2' }],
        pcl: ['process-api', 'prc-claims-api (eligibility)', { vCores: '0.2' }],
        ev: ['topic', 'ClaimSubmitted / PolicyChanged'],
        pn: ['process-api', 'prc-notification (async subscriber)'],
        sp: ['system-api', 'sys-policy-api', { vCores: '0.5' }],
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
    simulation: {
      systems: [
        { match: 'legacy', latencyMs: 300 },
        { match: 'database', latencyMs: 50 },
        { match: 'crm', latencyMs: 200 },
        { match: 'notification', latencyMs: 3000 },
      ],
      tests: [
        {
          name: 'Policy screens at peak on a 3 vCore budget',
          about: 'Mobile reads 30 policies a second, brokers 20 and the call centre 10, for ten minutes. Each answer takes under a second, and the whole domain uses at most 3 vCores.',
          traffic: [
            { name: 'mobile', from: 'mobile-app', rps: 30, to: 'legacy' },
            { name: 'brokers', from: 'partner', rps: 20, to: 'legacy' },
            { name: 'call centre', from: 'internal-app', rps: 10, to: 'legacy' },
          ],
          expect: { answers: [{ minSuccess: 0.99, maxMs: 1000 }], vCores: { max: 3 } },
        },
        {
          name: 'Claims are submitted without waiting for the SMS',
          about: 'Mobile users submit 10 claims a second. The SMS provider takes 3 seconds, but the claim is answered in under a second and the SMS still goes out.',
          traffic: [{ name: 'claims', from: 'mobile-app', rps: 10, kind: 'write', to: ['database', 'notification'] }],
          expect: { answers: [{ minSuccess: 0.99, maxMs: 1000 }], delivered: [{ to: 'notification', min: 0.95 }] },
        },
        {
          name: 'The SMS provider is down',
          about: 'The SMS and email provider is down from minute 2 to minute 7. Claims are still taken, and the waiting notifications go out once it is back, with none lost.',
          traffic: [{ name: 'claims', from: 'mobile-app', rps: 10, kind: 'write', to: ['database', 'notification'] }],
          incidents: [{ down: 'notification', at: 2, forMin: 5 }],
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.99 }], lost: { max: 0 }, backlog: [{ queue: ['queue', 'topic', 'event-stream'], maxEnd: 100 }] },
        },
        {
          name: 'Brokers need a client id',
          about: 'Brokers with a client id read 20 policies a second. A caller without one sends 5 a second and must be refused at the broker API.',
          traffic: [
            { name: 'brokers', from: 'partner', rps: 20, to: 'legacy' },
            { name: 'no client id', from: 'partner', rps: 5, to: 'legacy', auth: 'none' },
          ],
          expect: { answers: [{ flow: 'brokers', minSuccess: 0.99 }, { flow: 'no client id', minRefused: 0.99 }] },
        },
      ],
    },
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

Symptoms: mobile policy screen takes 3 to 4 s; a premium rule change took 3 releases and still differs between web and broker; a SQL injection finding on #5; 15 apps × 2 replicas × 1 vCore.

Numbers for the target design:
- At peak, mobile reads 30 policies a second, brokers 20 and the call centre 10. Mobile users also submit 10 claims a second.
- The mainframe answers in about 300 ms, the claims database in 50 ms and CRM in 200 ms. The SMS / email provider takes 3 s and has outages of several minutes.
- Policy screens and claim submissions must answer in under a second, and no notification may be lost.
- Brokers must present a client id; callers without one are refused.
- The budget for the domain is 3 vCores.

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
    'Chatty, operation-sized System APIs (1 to 4) and leaked copybook names force consumers to make many calls and couple them to the mainframe; consolidate into one resource-oriented Policy System API.',
    'Process APIs per consumer (7 to 9) duplicate business logic and cause rule drift; replace with one channel-agnostic Policy Process API and push differences up to Experience APIs.',
    'Layer violations: a System API calling another (6→1), an Experience API orchestrating six System APIs with business rules (11), and bypassing the System layer to the mainframe (14).',
    'Security/design defects: generic SQL-passing API (5) and a pass-through Process API (10); synchronous notifications on the critical path (15) should become asynchronous events.',
    'Remediation is risk- and value-ordered: fix the security hole first, then the shared Process API behind existing Experience contracts (strangler/facade), then consolidation and retirement driven by traffic analytics, with governance gates to prevent recurrence.',
    'Right-size by load: 0.1 vCore for most apps, 0.2 for the two Process APIs and 0.5 for the Policy System API that every read reaches, about 1.6 vCores instead of 30. Client id enforcement on the broker API.',
  ],
  solution: `
**Smells and impact.**

| Smell | APIs | Why it hurts |
|---|---|---|
| Operation-per-API / chatty System APIs | 1 to 4 | Consumers need 4+ calls for one policy view → latency (3 to 4 s mobile), 4 apps to run, no cohesive resource model |
| Leaked SoR model | 4 | Copybook field names couple every consumer to the mainframe; a mainframe change ripples upward |
| Generic query / SQL pass-through | 5 | SQL injection; no contract; consumers coupled to the DB schema; impossible to govern |
| System calling System | 6 → 1 | Hidden coupling; CRM API now fails when Policy API fails; orchestration in the wrong layer |
| Process API per consumer | 7, 8, 9 | 80% duplicated code; premium rule diverged across channels, the exact problem API-led should prevent |
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

**Sizing and failure handling.**
- At peak about 60 policy reads a second reach both Process APIs, and \`sys-policy-api\` carries the reads of both. 0.2 vCore for each Process API and 0.5 for \`sys-policy-api\` carry it; the other apps stay at 0.1. The domain uses about 1.6 vCores, inside a 3 vCore budget, against 30 today.
- A policy screen makes one call to the mainframe through one System API and answers in about 0.7 s.
- A claim is answered once it is stored and the event is published, in well under a second. The SMS goes out from the subscriber. When the provider is down, events wait on the persistent topic and go out once it is back.
- \`exp-broker-api\` enforces client id, so a caller without one never reaches the domain.

**Remediation roadmap.**
- **Phase 0 (immediately, 1 to 2 weeks):** close the SQL injection in #5: restrict to parameterised named queries / allowlisted operations; apply client-id enforcement and restrict callers. Security first.
- **Phase 1 (quick wins, ~1 month):** make notifications async (#15 publishes to a queue; callers fire-and-forget) → immediate latency win. Right-size low-traffic apps (fractional sizes, co-locate small ones) → cost win that funds the rest.
- **Phase 2 (about 2 to 3 months):** build \`sys-policy-api\` (consolidating 1 to 4). Keep 1 to 4 running as **thin facades** delegating to it, so nothing breaks. Remove #6's call to #1 (move enrichment to a Process API).
- **Phase 3 (~3 months):** build \`prc-policy-api\` with one agreed premium rule (business sign-off needed: the divergence is a business decision, not only a technical one). Re-point #12, #13 and #11 *internally*; their external contracts stay unchanged. Move eligibility into \`prc-claims-api\`; #11 and #13 call it.
- **Phase 4:** re-point #14 to Process APIs and remove MQ/mainframe access from the Experience layer. Retire #7 to #9, #10 (or give it real logic), and facades 1 to 4 once **analytics show zero traffic** by client id. Sunset dates published in Exchange.
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
    { q: 'Why keep facades for #1 to #4 instead of migrating consumers immediately?', a: 'Facades decouple the consolidation from consumers\' release schedules, so you can ship the new System API without a big-bang cut-over and retire the facades when analytics show they are unused.' },
  ],
}

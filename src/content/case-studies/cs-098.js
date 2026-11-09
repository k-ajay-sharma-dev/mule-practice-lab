import { diagram } from '../../arch/dsl.js'

const EXCHANGE_API = { type: 'system-api', label: ['exchange', 'agency', 'x-road'] }
const AUDIT = { type: ['database', 'file-store', 'data-warehouse'], label: ['audit'] }

export default {
  id: 'cs-098',
  category: 'case-studies',
  title: 'Benefits Agency Verifying Eligibility With Other Agencies\' Data',
  level: 'ADVANCED',
  tags: ['public-sector', 'government', 'api-led', 'process-api', 'security', 'pii', 'gdpr', 'governance', 'retries'],
  estMinutes: 55,
  diagram: {
    task: 'draw eligibility checking: citizens and caseworkers each reach their own Experience API through the gateway; both use one eligibility Process API, which updates the case system through a System API and asks other agencies through a single data exchange System API; every lookup is audited asynchronously; lookups that cannot finish are parked on a queue and retried.',
    checks: [
      { label: 'Citizens and caseworkers come in only through the gateway', rule: { type: 'only-via', target: 'experience-api', from: 'api-gateway' } },
      { label: 'Citizens and caseworkers each have their own Experience API', rule: { type: 'node', match: 'experience-api', min: 2 } },
      { label: 'Both Experience APIs share one eligibility Process API', rule: { type: 'each', of: 'process-api', edgeFrom: 'experience-api', count: 2, some: true } },
      { label: 'Channels never reach the data exchange without the eligibility Process API', rule: { type: 'no-path', from: ['web-app', 'internal-app', 'experience-api'], to: 'external-api', unless: 'process-api' } },
      { label: 'The data exchange is reached only through a System API', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'Only one System API talks to the data exchange', rule: { type: 'each', of: 'external-api', edgeFrom: 'system-api', max: 1 } },
      { label: 'Every lookup is recorded in an audit store', rule: { type: 'path', from: EXCHANGE_API, to: AUDIT } },
      { label: 'Audit records are written as async messages so audit never slows a lookup', rule: { type: 'lines', touching: AUDIT, kind: 'async' } },
      { label: 'Lookups that cannot finish are parked on a queue and retried', rule: { type: 'path', from: 'process-api', via: 'queue', to: EXCHANGE_API } },
      { label: 'The case management system is reached only through a System API', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
    ],
    reference: diagram(
      {
        cit: ['web-app', 'Citizen benefits portal'],
        cw: ['internal-app', 'Caseworker app'],
        idp: ['identity-provider', 'National digital identity (OIDC)'],
        gw: ['api-gateway', 'API gateway (JWT validation, scopes)'],
        ecit: ['experience-api', 'exp-citizen-claims-api'],
        ecw: ['experience-api', 'exp-caseworker-api'],
        pel: ['process-api', 'prc-eligibility-check'],
        pq: ['queue', 'pending-verifications'],
        pret: ['process-api', 'prc-verification-retry'],
        sx: ['system-api', 'sys-data-exchange-api'],
        xg: ['external-api', 'Government data exchange (tax, employment, civil registry)'],
        aq: ['queue', 'lookup-audit'],
        alog: ['database', 'Lookup audit store (write once)'],
        scase: ['system-api', 'sys-case-management-api'],
        cms: ['legacy', 'Case management system'],
      },
      [
        'cit -> gw', 'cw -> gw', 'gw -> idp', 'gw -> ecit', 'gw -> ecw', 'ecit -> pel', 'ecw -> pel',
        'pel -> sx', 'sx -> xg', 'sx ~> aq', 'aq ~> alog', 'pel -> scase', 'scase -> cms',
        'pel ~> pq', 'pq ~> pret', 'pret -> sx', 'pret -> scase',
      ],
    ),
  },
  description: `
**Context.** A national benefits agency pays housing and income support to 2.4 million households. To decide a claim it needs facts held by other agencies:
- income from the tax authority
- employment status from the employment registry
- address and household from the civil registry

Today claimants upload payslips and letters, and 900 caseworkers check them by hand. A new law lets the agency query the other agencies directly, through the government data exchange, if the claimant applies and only for the facts the law lists.

**Goals**
- 70% of new online claims get an eligibility answer within 30 seconds, without a caseworker.
- Caseworkers see the same verified facts in their app, with the source and date.
- Every query to another agency can be justified to an auditor: who asked, for which claim, under which legal purpose, and what came back.

**Constraints**
| Item | Detail |
|---|---|
| Data exchange | Government data exchange with mTLS and signed requests per agency; each agency sets a quota (tax: 50 queries a second) |
| Availability | The tax authority service is offline nightly 23:00 to 05:00 and slow during its own peaks |
| Minimisation | Ask yes or no questions where the source offers them ("income below threshold?") instead of fetching raw data |
| Identity | Citizens sign in with the national digital identity; caseworkers with the agency's directory |
| Case system | On-premises case management system with a SOAP interface, the record of every decision |
| Volume | About 40,000 new claims and 150,000 reassessments a month |

**Your task.** Design how the portal and caseworker app get verified facts, how the agency talks to the data exchange, and how lookups are audited and retried.
`,
  answerTemplate: `## Channels and identity

## Eligibility Process API

## One connection to the data exchange

## Minimisation and legal purpose

## Audit

## When an agency is unavailable

## Risks
`,
  keyPoints: [
    'Two Experience APIs (citizen and caseworker) share one eligibility Process API, so the rules and the legal purpose checks exist once.',
    'One System API owns the data exchange: certificates, request signing, quotas per agency and the mapping of each legal purpose to the questions allowed.',
    'No channel reaches the exchange except through the eligibility Process API, which knows the claim, the purpose and the claimant\'s consent.',
    'Every lookup writes an audit record (who, claim, purpose, agency, question, answer summary) asynchronously to a write-once store.',
    'When an agency is offline or over quota, the lookup is parked on a queue and retried later; the claim waits in "pending verification" instead of failing.',
    'Yes or no queries and field-level minimisation reduce the personal data the agency holds.',
  ],
  solution: `
**Channels.** The portal and the caseworker app go through the gateway, which validates the citizen or staff token with the identity provider. \`exp-citizen-claims-api\` exposes "start eligibility check" and "status". \`exp-caseworker-api\` adds the verified facts with source and date, and lets a caseworker trigger a re-check with a reason code.

**Eligibility.** \`prc-eligibility-check\` decides which facts the claim type needs under the law, builds the questions, calls \`sys-data-exchange-api\` for each agency in parallel (with a 20 second overall limit) and applies the rules. It writes the decision and the facts to the case system through \`sys-case-management-api\`.

**Data exchange System API.** \`sys-data-exchange-api\` is the only component holding the agency certificate and signing keys. It enforces quotas per target agency, maps each legal purpose to the services allowed, and refuses a call that does not carry a purpose code and a claim id. For every call it publishes an audit message (caller, claim id, purpose, agency, service, result code, a hash of the response) to \`lookup-audit\`, which is written to a write-once audit store.

**Unavailable agencies.** If the tax service is offline or returns a quota error, the Process API puts the lookup on \`pending-verifications\` and marks the claim "pending verification". \`prc-verification-retry\` works through the queue when the service is back, then updates the case.

**Minimisation.** Prefer threshold questions; where raw values are needed, keep only the fields the decision uses and set a retention period on them.

**Risks.** Quota exhaustion at month end (priority for new claims over reassessments), a legal purpose used too broadly (purpose codes reviewed by the data protection officer), and audit store growth (partitioned by month).
`,
  followUps: [
    { q: 'Why should only one System API talk to the data exchange?', a: 'The certificate, signing keys, quotas and purpose rules then live in one place. A second connection would bypass the quota and could skip the audit.' },
    { q: 'Why write audit records asynchronously?', a: 'The lookup should not wait for the audit store or fail because of it. A durable queue still guarantees the record is written.' },
    { q: 'What happens to a claim when the tax authority is offline at night?', a: 'The lookup is parked on a queue and the claim shows pending verification. A retry consumer completes it when the service returns, and the citizen is told when to expect an answer.' },
    { q: 'How do you show an auditor that a lookup was lawful?', a: 'Each audit record holds the caller, claim id, legal purpose, agency, service and result. The purpose code ties the lookup to the clause of the law that allows it.' },
  ],
}

import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-013',
  category: 'case-studies',
  title: 'Government Building a Citizen Services Portal',
  level: 'INTERMEDIATE',
  tags: ['government', 'experience-api', 'security', 'identity', 'legacy'],
  estMinutes: 40,
  diagram: {
    task: 'draw the citizen services architecture: portal and mobile app with national-identity login, the gateway, channel Experience APIs, the "my services" and payments Process APIs, department System APIs, and how office-hours systems are decoupled.',
    checks: [
      { label: 'Citizen login goes through the national digital identity service', rule: { type: 'edge', from: ['web-app', 'mobile-app', 'api-gateway'], to: 'identity-provider' } },
      { label: 'Both the portal and the mobile app go through the API gateway (token validation, rate limits)', rule: { type: 'each', of: ['web-app', 'mobile-app'], min: 2, edgeTo: 'api-gateway' } },
      { label: 'Separate Experience APIs for the portal and the mobile app', rule: { type: 'node', match: 'experience-api', min: 2 } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: '"My services" aggregates at least three department System APIs', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 3 } },
      { label: 'Department systems (mainframe, tax, case management) are reached only through System APIs', rule: { type: 'only-via', target: ['legacy', 'saas', 'erp', 'database'], from: 'system-api' } },
      { label: 'The payment gateway is reached only through a System API', rule: { type: 'only-via', target: 'payment', from: 'system-api' } },
      { label: 'Submissions to office-hours systems are queued asynchronously', rule: { type: 'edge', from: 'process-api', to: ['queue', 'topic'], kind: 'async' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Citizen portal'],
        mob: ['mobile-app', 'Citizen mobile app'],
        idp: ['identity-provider', 'National digital identity (OIDC)'],
        gw: ['api-gateway', 'API Manager (JWT validation, rate limits)'],
        eport: ['experience-api', 'portal-eapi'],
        emob: ['experience-api', 'mobile-eapi'],
        pcs: ['process-api', 'citizen-services-papi'],
        ppay: ['process-api', 'payments-papi'],
        q: ['queue', 'department-submissions'],
        sveh: ['system-api', 'vehicles-sapi'],
        stax: ['system-api', 'tax-sapi'],
        scase: ['system-api', 'cases-sapi'],
        spay: ['system-api', 'payments-sapi'],
        mf: ['legacy', 'Vehicles mainframe'],
        tax: ['saas', 'COTS tax system'],
        cm: ['saas', 'Case management (permits, benefits)'],
        pg: ['payment', 'Payment gateway'],
      },
      [
        'web -> idp', 'mob -> idp', 'web -> gw', 'mob -> gw', 'gw -> eport', 'gw -> emob',
        'eport -> pcs', 'emob -> pcs', 'eport -> ppay', 'emob -> ppay',
        'pcs -> sveh', 'pcs -> stax', 'pcs -> scase', 'pcs ~> q', 'q ~> scase', 'ppay -> spay',
        'sveh -> mf', 'stax -> tax', 'scase -> cm', 'spay -> pg',
      ],
    ),
  },
  description: `
**Context.** A regional government wants one citizen portal and mobile app for services now spread across separate websites: vehicle registration renewal, property tax payments, business permits and social benefit applications.

Each service is backed by a different department system:
- a mainframe (vehicles)
- a COTS tax system
- a case-management platform (permits, benefits)
- a payment gateway

A national digital identity service already exists for citizen login.

**Goals**
- One login and one "my services" dashboard showing status across departments.
- Reuse the same back-end APIs for the portal, the mobile app and later for call-centre staff.
- Accessibility and very high availability during deadline peaks (e.g. tax due date).

**Constraints**
- Departments own their systems and have different release cycles.
- Strict data protection rules: citizens see only their own data; access must be auditable.
- Some department systems are only available during office hours.

**Your task.** Propose the integration architecture, security model and delivery plan.
`,
  answerTemplate: `## API architecture

## Identity and authorisation

## Handling legacy and office-hours systems

## Peak load and availability

## Governance across departments

## Delivery plan
`,
  keyPoints: [
    'Experience APIs for portal/mobile, Process APIs for cross-department views (e.g. "my services"), System APIs per department system.',
    'Citizen login through the national digital identity service with OpenID Connect/OAuth 2.0; APIs validate tokens and derive the citizen ID from the token, never from a request parameter.',
    'Requests to office-hours or slow systems are queued and confirmed asynchronously, with status shown in the dashboard.',
    'Audit logging of who accessed which citizen record, with personal data masked in operational logs.',
    'Peak protection: rate limiting/spike control, caching of reference data, and independent scaling so one department outage does not take down the portal.',
    'Federated governance: shared standards and Exchange catalogue, but each department owns its System APIs.',
  ],
  solution: `
**Architecture.**
- **System APIs** owned by departments: \`vehicles-sapi\` (mainframe via existing connector/MQ/CICS gateway), \`tax-sapi\`, \`cases-sapi\`, \`payments-sapi\`.
- **Process APIs**: \`citizen-services-papi\` aggregates "my services" (status of applications, due payments) using parallel calls with per-source timeouts; \`payments-papi\` handles payment orchestration.
- **Experience APIs**: \`portal-eapi\`, \`mobile-eapi\` shaped for each client; later a \`staff-eapi\` with different authorisation.

**Identity.** Portal uses the national identity service via OIDC; APIs enforce **JWT validation / OAuth 2.0** policies in API Manager. The citizen identifier comes from token claims and is passed down; System APIs trust only the internal layer (client ID + network restrictions). Staff access uses the internal IdP with role-based scopes.

**Office-hours systems.** Submissions are accepted, stored and queued (Anypoint MQ); consumers process when the system is up. The dashboard shows "received / in progress / completed". Read-only data that changes rarely is cached or replicated.

**Peaks.** Load-test for deadline days; autoscale or pre-scale replicas; rate limiting per client; partial results in the dashboard if one department is down (graceful degradation rather than a full error).

**Governance.** A central team defines standards (naming, error model, security policies, logging) and runs the platform; departments build and own their System APIs with templates and reviews. Everything in Exchange.

**Delivery.** Start with one high-volume, low-complexity service (e.g. vehicle renewal) end to end, including login and payments; add services department by department.

**Risks.** Department priorities differ (executive sponsorship), mainframe capacity, accessibility compliance late in the project, and privacy incidents.
`,
  followUps: [
    { q: 'How do you stop one department’s outage from breaking the dashboard?', a: 'Call sources in parallel with per-source timeouts and return partial results with a status per service, plus circuit-breaker style fallbacks or cached last-known values.' },
    { q: 'Who owns the System APIs — the central team or departments?', a: 'Departments, because they know their systems and release cycles; the central team owns the platform, standards and the cross-department Process and Experience APIs.' },
    { q: 'How do you prioritise which services to move first?', a: 'By citizen volume and pain versus technical risk; a high-volume, simple service proves the platform and gives visible value early.' },
  ],
}

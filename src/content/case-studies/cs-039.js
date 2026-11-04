import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-039',
  category: 'case-studies',
  title: 'Telco Exposing 5G Network APIs to Partners',
  level: 'ADVANCED',
  tags: ['telecom', 'network-apis', 'api-management', 'oauth', 'flex-gateway'],
  estMinutes: 50,
  diagram: {
    task: 'draw the in-country data plane: partners getting OAuth tokens and calling capability APIs through the gateway, the layers down to the core-network exposure function, the consent check, and usage records flowing to billing.',
    checks: [
      { label: 'Partners obtain OAuth 2.0 tokens (with end-user consent where needed) from an identity provider', rule: { type: 'edge', from: 'partner', to: 'identity-provider' } },
      { label: 'All partner traffic enters through the in-country gateway', rule: { type: 'each', of: 'partner', edgeTo: 'api-gateway' } },
      { label: 'The gateway fronts at least two capability Experience APIs', rule: { type: 'edge', from: 'api-gateway', to: 'experience-api', min: 2 } },
      { label: 'The core-network function is reached only through a System API', rule: { type: 'only-via', target: { type: ['legacy', 'external-api', 'saas', 'erp'], label: ['network', 'nef', 'core'] }, from: 'system-api' } },
      { label: 'Subscriber consent is checked before location / SIM-swap data is returned', rule: { type: 'edge', from: ['process-api', 'experience-api'], to: { type: ['system-api', 'database', 'cache'], label: ['consent'] } } },
      { label: 'Every call produces a usage record published asynchronously', rule: { type: 'edge', to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'Usage records reach the mediation / billing system', rule: { type: 'path', from: ['queue', 'topic', 'event-stream'], to: { type: ['erp', 'saas', 'database'], label: ['billing', 'mediation'] } } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
    ],
    reference: diagram(
      {
        agg: ['partner', 'Aggregators / enterprise developers'],
        idp: ['identity-provider', 'OAuth server (scopes, consent)'],
        gw: ['api-gateway', 'Flex Gateway (in-country DMZ)'],
        nv: ['experience-api', 'exp-number-verification-api'],
        qod: ['experience-api', 'exp-quality-on-demand-api'],
        id: ['process-api', 'prc-identity-api'],
        qodp: ['process-api', 'prc-qod-sessions-api'],
        uq: ['queue', 'usage-records'],
        sne: ['system-api', 'sys-network-exposure-api'],
        scon: ['system-api', 'sys-consent-api'],
        sbill: ['system-api', 'sys-billing-mediation-api'],
        nef: ['legacy', 'Network exposure function (core network)'],
        con: ['database', 'Subscriber consent'],
        bill: ['erp', 'Mediation / billing'],
      },
      [
        'agg -> idp', 'agg -> gw', 'gw -> nv', 'gw -> qod', 'gw ~> uq', 'nv -> id', 'qod -> qodp', 'id -> sne', 'qodp -> sne',
        'id -> scon', 'scon -> con', 'sne -> nef', 'uq ~> sbill', 'sbill -> bill',
      ],
    ),
  },
  description: `
**Context.** A mobile operator wants to earn revenue by exposing network capabilities to enterprise developers and aggregators: number verification (fraud prevention), SIM-swap check, device location verification, and quality-on-demand (temporarily boosting a device's connection for a video call or drone). These capabilities live in core-network functions owned by the network engineering team, behind several internal gateways. Industry initiatives define standard API shapes for some of these capabilities, and aggregators expect them.

**Goals**
- Launch four APIs in 9 months, with self-service onboarding for vetted partners.
- Per-call billing and usage reporting by partner and by end customer.
- Subscriber consent respected for location and SIM-swap data.

**Constraints**
- Core-network functions must be protected — strict limits on call rates, and the network team owns their security.
- Some APIs need very low latency (number verification in a login flow: target < 500 ms).
- Traffic must stay in the country; some components run in the operator's own data centres.
- Fraudsters will try to abuse the APIs.

**Your task.** Propose the API product design, gateway/runtime topology, security model and commercial plumbing.
`,
  answerTemplate: `## API products and standards alignment

## Topology: gateways, runtimes and network functions

## Security, consent and anti-abuse

## Billing, usage and SLAs

## Delivery plan

## Risks
`,
  keyPoints: [
    'Align external API contracts with the industry-standard definitions where they exist, so aggregators can integrate once; internal network specifics stay behind System APIs.',
    'Topology in-country: gateways and runtimes deployed in the operator data centres (e.g. Runtime Fabric and/or Flex Gateway) with the control plane managing policies.',
    'OAuth 2.0 with partner identity plus end-user consent where required; scopes per capability; strict rate limits and quotas per partner to protect core functions.',
    'Anti-abuse: partner vetting, use-case declaration, anomaly detection on usage patterns, and the ability to suspend a partner quickly.',
    'Usage is metered from gateway analytics/events into billing with partner and end-customer dimensions, and reconciled monthly.',
    'Low-latency APIs use the shortest path (gateway → System API → network function) with caching where safe and no unnecessary orchestration hops.',
  ],
  solution: `
**Products.** Four API products published in Exchange and a partner portal, each with plans (sandbox, standard, premium with SLA). External contracts follow the standard API definitions where available; versioning follows the standard's release cycle.

**Topology.**
- Control plane: Anypoint Platform (API Manager, Exchange, Analytics). If policy requires, choose a regional or private control-plane option — confirm with the vendor.
- Data plane in-country: Flex Gateway or Mule gateways in the operator data centre DMZ; Mule apps on Runtime Fabric for System/Process APIs next to the network functions.
- Layers: \`number-verification-eapi\` → \`identity-papi\` → \`network-exposure-sapi\` (wrapping the internal network exposure function/gateway). Quality-on-demand needs a session lifecycle (create, extend, delete) and callbacks for status changes.

**Security.**
- Partners authenticate with OAuth 2.0 client credentials; for subscriber-data APIs, an authorisation-code style flow (or operator-defined consent mechanism) captures end-user consent; tokens carry scopes per capability. Policies: JWT validation/token introspection, mTLS for aggregators, IP allowlisting where agreed.
- Rate limiting and quotas per partner and per API; spike control in front of each network function at the safe maximum agreed with the network team.
- Anti-abuse: KYC-style partner vetting, declared use cases, monitoring for unusual patterns (many SIM-swap checks across random numbers), automatic throttling and manual suspension.
- Consent checks live in a consent service; responses never return more than needed (e.g. "location within area: true/false", not coordinates).

**Commercial plumbing.** Every call produces a usage record (partner, app, API, result, timestamp, end-customer reference) published to a queue → mediation/billing system. Monthly reconciliation between gateway counts and invoiced usage. SLA dashboards per premium partner.

**Delivery.** Months 1–3: number verification + SIM-swap with two pilot aggregators. Months 4–6: location verification with consent flow. Months 6–9: quality-on-demand (most complex, network-side changes). Each API goes through security review with the network team.

**Risks.** Overloading network functions (hard limits, load tests with network team), privacy breaches (consent and minimal responses), fraud (vetting, anomaly detection), and standards changes (version strategy, adapter layer).
`,
  followUps: [
    { q: 'Why put the data plane in the operator data centre instead of the cloud?', a: 'Residency and latency: subscriber-related traffic must stay in country, and the network functions are on-premises. A local data plane with a centrally managed control plane gives both governance and short paths.' },
    { q: 'How do you meet the 500 ms target for number verification?', a: 'Minimise hops (gateway straight to a lean System API), keep connections pooled to the network function, avoid synchronous logging to remote systems, and measure p95/p99 continuously against the target.' },
    { q: 'How do you bill accurately?', a: 'Meter at the gateway on every call with result codes, stream usage records to billing, and reconcile counts monthly; disputes are resolved from the raw usage records.' },
  ],
}

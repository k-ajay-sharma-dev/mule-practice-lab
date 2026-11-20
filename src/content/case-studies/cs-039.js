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
        gw: ['api-gateway', 'Flex Gateway (in-country DMZ)', { auth: 'oauth2', rateLimit: 100 }],
        nv: ['experience-api', 'exp-number-verification-api', { vCores: '0.5' }],
        qod: ['experience-api', 'exp-quality-on-demand-api'],
        id: ['process-api', 'prc-identity-api', { vCores: '0.5' }],
        qodp: ['process-api', 'prc-qod-sessions-api'],
        uq: ['queue', 'usage-records'],
        sne: ['system-api', 'sys-network-exposure-api', { vCores: '0.5' }],
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
    simulation: {
      systems: [
        { match: 'legacy', latencyMs: 150, maxRps: 100 },
        { match: 'identity-provider', latencyMs: 40 },
        { match: 'database', latencyMs: 20 },
      ],
      tests: [
        {
          name: 'A caller without a token',
          about: 'Partners send 30 number checks a second with valid tokens, and a fraudster sends 10 a second without one. The gateway refuses the fraudster, and the partners get answers in under 500 ms.',
          traffic: [
            { name: 'partners', from: 'partner', rps: 30, to: 'legacy', via: { label: 'number-verification' } },
            { name: 'fraudster', from: 'partner', rps: 10, to: 'legacy', via: { label: 'number-verification' }, auth: 'none' },
          ],
          expect: { answers: [{ flow: 'partners', minSuccess: 0.99, maxMs: 500 }, { flow: 'fraudster', minRefused: 0.99 }] },
        },
        {
          name: 'One partner floods the API',
          about: 'Partners send 30 number checks a second, and for 3 minutes a partner with a bug pushes the total to 300 a second. The network function takes at most 100 a second. The gateway answers the extra with 429, so the core network is never over its limit.',
          traffic: [{ name: 'partners', from: 'partner', rps: 30, to: 'legacy', via: { label: 'number-verification' }, spikes: [{ at: 4, forMin: 3, rps: 300 }] }],
          expect: { peakRps: [{ node: 'legacy', max: 100 }], answers: [{ minSuccess: 0.4, minLimited: 0.2 }] },
        },
      ],
    },
  },
  description: `
**Context.** A mobile operator wants to earn revenue by exposing network capabilities to enterprise developers and aggregators: number verification (fraud prevention), SIM-swap check, device location verification, and quality-on-demand (temporarily boosting a device's connection for a video call or drone). These capabilities live in core-network functions owned by the network engineering team, behind several internal gateways. Industry initiatives define standard API shapes for some of these capabilities, and aggregators expect them.

**Goals**
- Launch four APIs in 9 months, with self-service onboarding for vetted partners.
- Per-call billing and usage reporting by partner and by end customer.
- Subscriber consent respected for location and SIM-swap data.

**Constraints**
- Core-network functions must be protected with strict limits on call rates, and the network team owns their security.
- Some APIs need very low latency (number verification in a login flow: target < 500 ms).
- Traffic must stay in the country; some components run in the operator's own data centres.
- Fraudsters will try to abuse the APIs.
- Partners send about 30 number checks a second. The network function takes at most 100 a second, and a buggy partner can push 300 a second for 3 minutes.
- The in-country gateway validates OAuth 2.0 tokens and has a rate limit of 100 requests a second. Usage records go on a \`usage-records\` queue to billing.
- Name the APIs exp-number-verification-api, exp-quality-on-demand-api, prc-identity-api, prc-qod-sessions-api, sys-network-exposure-api, sys-consent-api and sys-billing-mediation-api. Give the number verification, identity and network exposure APIs 0.5 vCore each.

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
    'Low-latency APIs keep the path short (gateway → thin Experience API → Process API → System API → network function), all in the same data centre, with caching where safe and no extra orchestration hops.',
  ],
  solution: `
**Products.** Four API products published in Exchange and a partner portal, each with plans (sandbox, standard, premium with SLA). External contracts follow the standard API definitions where available; versioning follows the standard's release cycle.

**Topology.**
- Control plane: Anypoint Platform (API Manager, Exchange, Analytics). If policy requires, choose a regional or private control-plane option, and confirm it with the vendor.
- Data plane in-country: Flex Gateway or Mule gateways in the operator data centre DMZ; Mule apps on Runtime Fabric for System/Process APIs next to the network functions.
- Layers: \`exp-number-verification-api\` → \`prc-identity-api\` → \`sys-network-exposure-api\` (wrapping the internal network exposure function/gateway), with \`prc-identity-api\` also checking \`sys-consent-api\`. \`exp-quality-on-demand-api\` → \`prc-qod-sessions-api\` → \`sys-network-exposure-api\`. Quality-on-demand needs a session lifecycle (create, extend, delete) and callbacks for status changes.

**Security.**
- Partners authenticate with OAuth 2.0 client credentials; for subscriber-data APIs, an authorisation-code style flow (or operator-defined consent mechanism) captures end-user consent; tokens carry scopes per capability. Policies: JWT validation/token introspection, mTLS for aggregators, IP allowlisting where agreed.
- Rate limiting and quotas per partner and per API. The gateway limit of 100 requests a second matches the safe maximum agreed with the network team, so a flood gets 429 answers and never reaches the network function.
- Anti-abuse: KYC-style partner vetting, declared use cases, monitoring for unusual patterns (many SIM-swap checks across random numbers), automatic throttling and manual suspension.
- Consent checks live in a consent service; responses never return more than needed (e.g. "location within area: true/false", not coordinates).

**Commercial plumbing.** Every call produces a usage record (partner, app, API, result, timestamp, end-customer reference) published by the gateway to the \`usage-records\` queue → \`sys-billing-mediation-api\` → mediation/billing system. Monthly reconciliation between gateway counts and invoiced usage. SLA dashboards per premium partner.

**Delivery.** Months 1 to 3: number verification + SIM-swap with two pilot aggregators. Months 4 to 6: location verification with consent flow. Months 7 to 9: quality-on-demand (most complex, network-side changes). Each API goes through security review with the network team.

**Risks.** Overloading network functions (hard limits, load tests with network team), privacy breaches (consent and minimal responses), fraud (vetting, anomaly detection), and standards changes (version strategy, adapter layer).
`,
  followUps: [
    { q: 'Why put the data plane in the operator data centre instead of the cloud?', a: 'Residency and latency: subscriber-related traffic must stay in country, and the network functions are on-premises. A local data plane with a centrally managed control plane gives both governance and short paths.' },
    { q: 'How do you meet the 500 ms target for number verification?', a: 'Keep every hop thin and in the same data centre (no extra orchestration between the gateway and the System API), keep connections pooled to the network function, avoid synchronous logging to remote systems, and measure p95/p99 continuously against the target.' },
    { q: 'How do you bill accurately?', a: 'Meter at the gateway on every call with result codes, stream usage records to billing, and reconcile counts monthly; disputes are resolved from the raw usage records.' },
  ],
}

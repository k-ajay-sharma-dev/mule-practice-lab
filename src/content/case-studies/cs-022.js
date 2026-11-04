export default {
  id: 'cs-022',
  category: 'case-studies',
  title: 'Logistics Company Monetising APIs Through a Partner Programme',
  level: 'ADVANCED',
  tags: ['api-monetization', 'partner-programme', 'api-management', 'developer-portal', 'sla-tiers'],
  estMinutes: 45,
  quiz: [
    {
      type: 'single',
      prompt: 'How do you implement Free, Standard and Premium tiers on Anypoint Platform?',
      options: [
        'SLA tiers in API Manager with the Rate Limiting – SLA based policy; Free auto-approved, paid tiers approved manually after the contract',
        'A separate copy of the API deployed per tier',
        'An if/else on a "tier" header sent by the partner',
        'One shared rate limit for all partners, with premium partners asked to retry more often',
      ],
      answer: 0,
      explain: 'SLA tiers bind each client application to a contract with its own limits, and the SLA-based rate limiting policy enforces them. Trusting a header the partner sends lets anyone claim premium limits.',
    },
    {
      type: 'single',
      prompt: 'Anypoint Platform is not a billing system. How does usage reach the billing platform?',
      options: [
        'Meter billable calls per client app and API product (analytics export or explicit metering events), aggregate daily, send to the billing platform via its API, and reconcile against gateway counts',
        'Ask partners to report their own usage each month',
        'Bill a flat fee and ignore overage',
        'Store invoices in Exchange as assets',
      ],
      answer: 0,
      explain: 'Accurate per-partner metering plus a daily aggregation job feeding the billing platform keeps billing correct; reconciliation and a usage view on the portal head off disputes. Self-reported usage cannot support per-call overage.',
    },
    {
      type: 'multi',
      prompt: 'How do you stop partner traffic from starving internal consumers of the same back-end APIs?',
      options: [
        'Deploy the partner Experience APIs on their own replicas',
        'Apply per-consumer rate limits on the shared Process/System APIs so internal channels keep priority',
        'Pre-scale and load test before holiday peaks',
        'Let partners call the System APIs directly to skip a hop',
        'Remove spike control so peaks are absorbed faster',
      ],
      answer: [0, 1, 2],
      explain: 'Separate capacity for partner APIs, per-consumer limits on shared APIs and peak preparation isolate partners from internal traffic. Direct partner access to System APIs or removing spike control does the opposite.',
    },
    {
      type: 'order',
      prompt: 'Order the partner journey from signup to premium.',
      items: [
        'Developer signs up on the public portal',
        'Free-tier credentials issued immediately for the sandbox',
        'Partner requests an upgrade, creating a CRM opportunity',
        'Commercial contract is signed',
        'Tier change approved in API Manager (automated via platform APIs)',
      ],
      explain: 'Self-service gets developers to a first call fast; paid tiers are activated only after a commercial agreement, with the approval automated so it is not a manual bottleneck.',
    },
    {
      type: 'match',
      prompt: 'Match each concern to the right mechanism.',
      pairs: [
        ['Premium-only webhooks', 'A premium-only scope or separate API product'],
        ['Breaking changes for paying partners', 'Versioning with a published deprecation policy'],
        ['Premium availability and latency SLA', 'Per-tier monitoring with monthly SLA reports'],
        ['Free-tier abuse', 'Low limits, sandbox only, signup verification'],
      ],
      explain: 'Each commercial promise needs a concrete technical or process control; mixing them up (e.g. promising an SLA with no per-tier monitoring) is how partner programmes lose trust.',
    },
    {
      type: 'multi',
      prompt: 'Which KPIs show whether the partner programme is succeeding as a business?',
      options: [
        'Active partners and free-to-paid conversion',
        'API revenue',
        'Time to first successful call',
        'SLA attainment for premium partners',
        'Number of Mule flows in the partner APIs',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Adoption, conversion, revenue, onboarding speed and SLA attainment measure the programme. The number of flows is an implementation detail that says nothing about value.',
    },
  ],
  description: `
**Context.** A parcel logistics company has internal APIs for rate quotes, shipment booking, label generation and tracking, built on Anypoint Platform. E-commerce platforms, ERP vendors and large shippers want to integrate directly. The business wants to turn this into a partner programme with paid tiers: a free tier for developers, a standard tier included with shipping contracts, and a premium tier (higher limits, webhooks, SLA) charged monthly plus per-call overage.

**Goals**
- Self-service signup and a sandbox for developers; paid tiers activated after a commercial agreement.
- Usage measured accurately per partner and per API product for billing.
- Premium partners get a contractual availability and latency SLA.

**Constraints**
- Anypoint Platform is not a billing system; the company has an existing billing/invoicing platform.
- Tracking traffic peaks at 10x normal around holidays.
- Internal consumers use the same back-end APIs and must not be starved by partners.

**Your task.** Design the API products, tiers, access management, metering and billing integration, and operations model.
`,
  answerTemplate: `## API products and packaging

## Tiers, contracts and policies

## Onboarding and developer experience

## Metering and billing integration

## Capacity, SLA and isolation from internal traffic

## Programme governance and success measures
`,
  keyPoints: [
    'API products are packaged for partners (e.g. Shipping API = quote + book + label; Tracking API) as Experience APIs separate from internal APIs, with their own versioning and deprecation policy.',
    'Tiers are implemented as SLA tiers in API Manager with rate-limiting-SLA policies; free tier auto-approved, paid tiers manually approved after contract.',
    'Self-service developer portal (Exchange public portal / API Experience Hub) with docs, sandbox/mocks and credential management.',
    'Usage is metered per client application and API product (from analytics/monitoring data or a custom metering event), aggregated and sent to the billing platform, with reconciliation.',
    'Partner traffic is isolated from internal traffic (separate Experience API deployments/capacity, rate limits), and SLA is monitored per tier.',
    'Programme success is measured with business metrics (active partners, revenue, conversion from free to paid) as well as technical ones.',
  ],
  solution: `
**Products.** \`partner-shipping-api\` (quote, book, label), \`partner-tracking-api\` (status, events, webhooks for premium). Built as Experience APIs over the existing Process/System APIs. Versioned in the URL or header with a published deprecation policy (e.g. 12 months' notice).

**Tiers and policies.** API Manager **SLA tiers**: Free (low rate limit, sandbox only, auto-approve), Standard (production, moderate limits, manual approval linked to a shipping contract), Premium (high limits, webhooks, priority support). Policies: client ID/OAuth 2.0 enforcement, **rate limiting – SLA based**, spike control, JSON threat protection. Webhooks enabled by a premium-only scope or separate product.

**Onboarding.** Public portal (Exchange public portal or API Experience Hub) with getting-started guides, Postman collections, sandbox backed by mocks/test data. Signup → free tier key immediately. Upgrade request → CRM opportunity → contract → tier change approved in API Manager (automate via Anypoint Platform APIs).

**Metering and billing.** Count successful billable calls per client app and product. Sources: API analytics/monitoring data exported regularly, or an explicit metering event emitted by a custom policy or the Experience API to a queue/store (more control, easier to reconcile). A daily job aggregates usage per partner and sends it to the billing platform via its API. Reconciliation: totals vs gateway counts; partners can see their usage on the portal.

**Capacity and SLA.** Deploy partner Experience APIs on dedicated replicas; protect shared Process/System APIs with rate limits per consumer so internal channels keep priority. Holiday peaks: pre-scale, load test. SLA monitoring per tier (availability, p95 latency) with monthly SLA reports for premium partners.

**Governance.** Product manager owns the programme; change control for breaking changes; partner communication channel; security reviews and pen tests. KPIs: active partners, free → paid conversion, revenue, time to first call, support tickets per partner, SLA attainment.

**Risks.** Billing disputes (transparent usage data), abuse of free tier (limits, verification), internal outages caused by partner spikes, and breaking changes upsetting paying partners.
`,
  followUps: [
    { q: 'Where does the usage data for invoices come from?', a: 'Either exported API analytics per client ID, or — for more control and auditability — explicit metering events written per billable call and aggregated daily; either way reconcile against gateway counts before invoicing.' },
    { q: 'How do you price overage without surprising partners?', a: 'Show near-real-time usage on the portal, send threshold alerts (e.g. 80% of plan), and make the overage rate part of the contract tier.' },
    { q: 'How do you measure success of the programme?', a: 'Business: active and paying partners, revenue and conversion. Developer experience: time to first successful call. Operations: SLA attainment and support tickets per partner.' },
  ],
}

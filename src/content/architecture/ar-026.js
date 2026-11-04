export default {
  id: 'ar-026',
  category: 'architecture',
  title: 'Multi-Tenant API Platform Design',
  level: 'EXPERT',
  tags: ['multi-tenancy', 'sla-tiers', 'data-isolation', 'noisy-neighbour'],
  estMinutes: 40,
  quiz: [
    {
      type: 'single',
      prompt: 'Where does the API take the tenant ID from?',
      options: [
        'An X-Tenant-ID header sent by the client',
        'The tenantId claim of the validated OAuth token (or a client_id → tenant mapping), ignoring any tenant value in headers or body',
        'A query parameter',
        'The source IP address',
      ],
      answer: 1,
      explain: 'Anything the client can type, it can change. Only an identity proven by the gateway can decide whose data is returned.',
    },
    {
      type: 'match',
      prompt: 'Match each plan to its isolation model.',
      pairs: [
        ['Basic / Pro compute', 'Shared multi-replica Mule apps'],
        ['Basic / Pro data', 'Shared DB with tenant ID on every row (row-level security) or schema per tenant'],
        ['Enterprise with EU residency', 'Dedicated deployment cell and DB in an EU region'],
      ],
      explain: 'The pool keeps thousands of small tenants cheap; dedicated cells deliver residency and guaranteed capacity, priced into Enterprise.',
    },
    {
      type: 'multi',
      prompt: 'Which measures stop one marketplace\'s Black Friday traffic from slowing everyone else?',
      options: [
        'SLA-tier rate limiting per client application in API Manager',
        'Per-tenant quotas in front of shared DB and async processing',
        'Separate queues or consumer pools for big tenants\' webhooks',
        'Moving the biggest tenants to dedicated cells',
        'One shared queue for all tenants so load is spread evenly',
      ],
      answer: [0, 1, 2, 3],
      explain: 'A single shared queue means one tenant\'s backlog delays every other tenant\'s webhooks — the exact noisy-neighbour problem.',
    },
    {
      type: 'single',
      prompt: 'Where does tenant-specific configuration (plan, features, webhook URLs, limits, cell) live?',
      options: [
        'In per-tenant properties files, redeployed for each new tenant',
        'In a Tenant Registry (DB + Tenant Management API), cached by apps with a short TTL',
        'Hard-coded in a DataWeave lookup table',
        'In each tenant\'s own system',
      ],
      answer: 1,
      explain: 'With 3,000 tenants, onboarding must be an automated API flow with no redeploy.',
    },
    {
      type: 'multi',
      prompt: 'Which controls guarantee data isolation even if a developer forgets a WHERE clause?',
      options: [
        'A shared component that injects tenant_id into every query',
        'Database row-level security or separate schemas as a second line of defence',
        'Cache and Object Store keys prefixed with tenantId',
        'Automated CI tests where tenant A\'s token tries to read tenant B\'s shipment',
        'A code-review reminder in the wiki',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Defence in depth: central enforcement, database controls and tests that fail the build. A reminder alone does not stop a mistake.',
    },
    {
      type: 'single',
      prompt: 'Tenant A requests a shipment ID that belongs to tenant B. What does the API return?',
      options: ['200 with the shipment', '403 Forbidden', '404 Not Found', '500 Internal Server Error'],
      answer: 2,
      explain: '403 confirms the shipment exists, leaking information about another tenant. Within the caller\'s tenant scope, it simply does not exist.',
    },
  ],
  description: `
A logistics SaaS company is building a **shipment tracking & booking API** on Anypoint Platform (CloudHub 2.0) that it sells to **customers (tenants)**: e-commerce shops, freight forwarders, marketplaces.

- ~300 tenants at launch, target 3,000 in two years. Tenant sizes vary hugely: most send < 1 request/s, five big marketplaces send **200+ requests/s** each.
- Plans: **Basic, Pro, Enterprise** with different rate limits and features; Enterprise customers ask for **dedicated capacity** and **data residency in the EU**.
- Each tenant's shipment data must be **strictly isolated** — a data leak between tenants would be fatal for the business.
- Tenants want to configure webhooks for status updates.
- One big marketplace's **Black Friday** traffic last year slowed the old system down for everyone.

**Questions:**
- How do you identify the tenant on every request, and why must it not come from a free-form header?
- What isolation model do you choose (shared everything, shared apps with separate data, dedicated deployments), and for which tenants?
- How do you implement plans/rate limits and protect tenants from noisy neighbours?
- How do you handle tenant-specific configuration (webhooks, features) and onboarding at scale?
- How do you ensure data isolation is not broken by a coding mistake?
`,
  answerTemplate: `## Tenant identification

## Isolation model

## Plans, limits and noisy neighbours

## Tenant configuration and onboarding

## Guaranteeing data isolation
`,
  keyPoints: [
    'The tenant is derived from authenticated identity (OAuth token claim or client application mapped to a tenant in API Manager), never trusted from a client-supplied header or path alone.',
    'A tiered isolation model: shared apps and shared data stores with tenant-scoped data for Basic/Pro; dedicated deployments/data stores (e.g. in an EU region) for Enterprise tenants who pay for it.',
    'Plans map to SLA tiers in API Manager (SLA-based rate limiting per client application), with additional per-tenant limits/quotas protecting shared backends.',
    'Noisy neighbours are contained by per-tenant rate limits, separate queues or consumer pools for large tenants, and scaling shared capacity on aggregate load.',
    'Tenant configuration (features, webhooks, limits) lives in a tenant registry/config store with self-service onboarding via APIs, not in per-tenant code or properties.',
    'Data isolation is enforced centrally: every data access filtered by the authenticated tenant ID in a shared component, database-level controls (e.g. row-level security or separate schemas), and automated cross-tenant access tests.',
  ],
  solution: `
**Tenant identification.** Each tenant registers client applications (Exchange/API portal) → OAuth 2.0 client credentials from the company's IdP, with a **tenantId claim** in the token (or a mapping client_id → tenant). The gateway validates the token (JWT Validation / OAuth policy); the API reads tenantId **from the validated token** and ignores any tenant value in headers or body. If tenant came from a header, any tenant could read another's data by changing it.

**Isolation model (tiered).**
| Tier | Compute | Data | Why |
|---|---|---|---|
| Basic / Pro | Shared Mule apps (multi-replica) | Shared DB, tenant ID on every row (row-level security) or schema per tenant | Cost-efficient for thousands of small tenants |
| Enterprise | **Dedicated deployment** (own apps/replicas, possibly own Private Space in an EU region) | Dedicated DB/schema in-region | Residency, guaranteed capacity, contractual isolation |
The same artifact is deployed in both models; only configuration differs (deployment "cells"). Price Enterprise to cover dedicated cost.

**Plans, limits, noisy neighbours.**
- Plans = **SLA tiers** in API Manager; tenants' client apps get a tier; the **Rate Limiting – SLA-based** policy enforces requests per window per client app. Different features per plan are flags in tenant config (or separate API resources for premium features).
- **Protect shared resources:** per-tenant quotas in front of the DB and async processing; for event/webhook processing, **separate queues or consumer pools** for big tenants so a Black Friday backlog from one marketplace doesn't delay others' webhooks.
- Big marketplaces → move to Enterprise/dedicated cells, or at least their own replicas for heavy endpoints.
- Capacity planning on aggregate load plus the largest tenant's peak; monitor **per-tenant** metrics (requests, latency, errors) via structured logs with tenantId.

**Tenant config and onboarding.** A **Tenant Registry** (DB + Tenant Management API): plan, features, webhook URLs + secrets (encrypted), limits, region/cell. Onboarding is an API/portal flow: create tenant, register client app, assign SLA tier, configure webhooks — automated, no redeploy. Apps cache tenant config with a short TTL. Webhooks are delivered by a queue-based dispatcher with signing (HMAC), retries with backoff, per-tenant DLQ and auto-disable after repeated failures.

**Guaranteeing data isolation.**
- **Central enforcement:** a shared component/DataWeave module that injects \`tenant_id = :tenantId\` into every query; database **row-level security** (or separate schemas/DBs) as a second line of defence so a forgotten WHERE clause returns nothing.
- Cache keys and Object Store keys **prefixed with tenantId**; logs include tenantId but no cross-tenant payloads.
- **Automated tests** in CI: tenant A's token tries to access tenant B's shipment → must get 404 (not 403, to avoid revealing existence). Regular penetration tests.

**Trade-offs.** Shared-everything is cheapest but has the biggest blast radius and noisy-neighbour risk; dedicated cells isolate well but multiply ops effort. A tiered "pool + cells" model matches cost to what tenants pay for.
`,
  followUps: [
    { q: 'Why return 404 instead of 403 for another tenant\'s resource?', a: 'A 403 confirms the resource exists, leaking information about other tenants (e.g. shipment IDs). 404 treats it as not existing within the caller\'s tenant scope.' },
    { q: 'Tenants grow to 3,000 and API Manager contracts become hard to manage manually. What then?', a: 'Automate client app registration and tier assignment via the platform APIs from the onboarding flow, and keep the tenant registry as the source of truth. Manual approval should only exist for Enterprise contracts.' },
    { q: 'How do you justify dedicated cells to the CFO?', a: 'Dedicated cells are sold as part of the Enterprise price and cover residency and guaranteed capacity requirements that win large deals; their cost is attributed to those tenants, while small tenants stay on the efficient shared pool.' },
  ],
}

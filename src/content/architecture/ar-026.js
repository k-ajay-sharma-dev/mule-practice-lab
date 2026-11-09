import { diagram } from '../../arch/dsl.js'

const API = ['experience-api', 'process-api']
const DB = ['database', 'sql-server', 'oracle-db']
const QUEUE = ['queue', 'cloud-queue']
const BROKER = [...QUEUE, 'topic', 'event-stream']
const CELL_WORDS = ['enterprise', 'dedicated', 'cell']
const POOL = { type: API, label: ['shared', 'pool', 'basic'] }
const CELL = { type: API, label: CELL_WORDS }
const CELL_DB = { type: DB, label: CELL_WORDS }
const SHARED_DB = { type: DB, label: ['shared', 'row-level', 'tenant_id'] }
const REGISTRY = { label: ['registry', 'tenant config'] }
const DISPATCHER = { type: ['process-api', 'batch-job'], label: ['dispatch', 'webhook', 'sender', 'delivery'] }

export default {
  id: 'ar-026',
  category: 'architecture',
  title: 'Multi-Tenant API Platform Design',
  level: 'EXPERT',
  tags: ['multi-tenancy', 'sla-tiers', 'data-isolation', 'noisy-neighbour'],
  estMinutes: 40,
  diagram: {
    task: 'draw the "pool and cells" platform. Tenants enter through the gateway, which validates their tokens with the identity provider. Draw a shared pool Shipment API with its shared DB, an Enterprise cell Shipment API with its own dedicated DB, a tenant registry both read, and webhook queues that keep a big tenant\'s backlog away from the others.',
    checks: [
      { label: 'Every tenant enters through the gateway', rule: { type: 'each', of: 'partner', min: 2, edgeTo: 'api-gateway' } },
      { label: 'The gateway validates tokens with the identity provider, so the tenant comes from the token', rule: { type: 'link', from: 'api-gateway', to: 'identity-provider' } },
      { label: 'Tenants never reach a Shipment API without passing the gateway', rule: { type: 'no-path', from: 'partner', to: API, unless: 'api-gateway' } },
      { label: 'The gateway routes to the shared pool', rule: { type: 'edge', from: 'api-gateway', to: POOL } },
      { label: 'The gateway routes to the Enterprise cell', rule: { type: 'edge', from: 'api-gateway', to: CELL } },
      { label: 'The shared pool writes to the shared DB with row-level security', rule: { type: 'edge', from: POOL, to: SHARED_DB } },
      { label: 'The Enterprise cell writes to its own dedicated DB', rule: { type: 'edge', from: CELL, to: CELL_DB } },
      { label: 'The shared pool never touches the Enterprise DB', rule: { type: 'no-path', from: POOL, to: CELL_DB } },
      { label: 'Both the pool and the cell read tenant config from the registry', rule: { type: 'edge', from: API, to: REGISTRY, min: 2 } },
      { label: 'The shared pool publishes webhook events to a queue', rule: { type: 'edge', from: POOL, to: QUEUE, kind: 'async' } },
      { label: 'At least two webhook queues, each drained by a dispatcher, so one tenant\'s backlog does not delay the others', rule: { type: 'each', of: QUEUE, min: 2, edgeTo: DISPATCHER, kind: 'async' } },
      { label: 'Every webhook queue is fed by a Shipment API', rule: { type: 'each', of: QUEUE, edgeFrom: API, kind: 'async' } },
      { label: 'Every webhook dispatcher calls the tenant endpoints', rule: { type: 'each', of: DISPATCHER, edgeTo: 'external-api' } },
      { label: 'No chain of sync calls joins the gateway to the tenant webhook endpoints', rule: { type: 'no-path', from: 'api-gateway', to: 'external-api', kind: 'sync' } },
      { label: 'Gateway and API calls and data store reads are sync calls', rule: { type: 'lines', from: ['partner', 'api-gateway', ...API, 'system-api'], to: ['api-gateway', 'identity-provider', ...API, 'system-api', ...DB, 'cache', 'external-api'], kind: 'sync' } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: [...BROKER, 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        ten: ['partner', 'Basic and Pro tenants (shops, forwarders)'],
        big: ['partner', 'Big marketplaces and Enterprise tenants'],
        gw: ['api-gateway', 'API Manager: JWT validation, SLA tier rate limits'],
        idp: ['identity-provider', 'Company IdP (tenantId claim)'],
        pool: ['process-api', 'Shipment API (shared pool)'],
        cell: ['process-api', 'Shipment API (Enterprise cell, EU region)'],
        sdb: ['database', 'Shared DB (tenant_id and row-level security)'],
        cdb: ['database', 'Dedicated Enterprise DB (EU region)'],
        reg: ['database', 'Tenant registry (plan, features, webhooks, limits)'],
        qs: ['queue', 'Webhooks for most tenants'],
        qb: ['queue', 'Webhooks for the biggest marketplace'],
        da: ['process-api', 'Webhook dispatcher A'],
        dbg: ['process-api', 'Webhook dispatcher B (big tenant)'],
        wh: ['external-api', 'Tenant webhook endpoints (HMAC signed)'],
      },
      [
        'ten -> gw', 'big -> gw', 'gw -> idp', 'gw -> pool', 'gw -> cell', 'pool -> sdb', 'cell -> cdb', 'pool -> reg', 'cell -> reg',
        'pool ~> qs', 'pool ~> qb', 'cell ~> qb', 'qs ~> da', 'qb ~> dbg', 'da -> wh', 'dbg -> wh',
      ],
    ),
  },
  quiz: [
    {
      type: 'single',
      needsScenario: true,
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
      needsScenario: true,
      prompt: 'Match each plan to its isolation model.',
      pairs: [
        ['Basic / Pro compute', 'Shared multi-replica Mule apps'],
        ['Basic / Pro data', 'Shared DB with tenant ID on every row (row-level security) or schema per tenant'],
        ['Enterprise with EU residency', 'Dedicated deployment cell and DB in an EU region'],
      ],
      explain: 'The pool keeps thousands of small tenants cheap; dedicated cells deliver residency and guaranteed capacity, priced into Enterprise.',
    },
    {
      type: 'single',
      prompt: 'On a shared multi-tenant API platform, one marketplace\'s Black Friday surge creates a large webhook backlog. Other tenants\' webhooks must not be delayed. How should webhook processing be set up?',
      options: [
        'Separate queues or consumer pools for the biggest tenants',
        'One shared queue for all tenants, so load is spread evenly',
        'One shared queue, with more retries for each webhook',
        'A higher rate limit for the biggest tenants during the peak',
      ],
      answer: 0,
      explain: 'A single shared queue means one tenant\'s backlog delays every other tenant\'s webhooks. That is the noisy-neighbour problem. Separate queues or consumer pools keep the backlog away from other tenants. The wider defence also includes SLA-tier rate limiting per client application in API Manager, per-tenant quotas in front of the shared DB and async processing, and moving the biggest tenants to dedicated cells.',
    },
    {
      type: 'single',
      needsScenario: true,
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
      type: 'single',
      prompt: 'A multi-tenant API keeps all tenants\' rows in one shared database. A developer might forget the tenant filter in a query. What stops that query from returning another tenant\'s data?',
      options: [
        'Database row-level security, as a second line of defence',
        'A code-review reminder in the wiki',
        'A tenant ID header sent by the client on each request',
        'Logs that include the tenant ID of each call',
      ],
      answer: 0,
      explain: 'Row-level security (or separate schemas) works in the database, so a forgotten WHERE clause returns nothing. A reminder alone does not stop a mistake, logs do not block a query, and a client can change any header it sends. Defence in depth also includes a shared component that injects tenant_id into every query, cache and Object Store keys prefixed with tenantId, and automated CI tests where tenant A\'s token tries to read tenant B\'s shipment.',
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

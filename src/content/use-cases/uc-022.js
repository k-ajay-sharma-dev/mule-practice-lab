import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-022',
  category: 'use-cases',
  title: 'Self-Service Partner Onboarding Portal',
  level: 'ADVANCED',
  tags: ['api-management', 'exchange', 'developer-portal', 'oauth', 'automation'],
  estMinutes: 30,
  diagram: {
    task: 'draw the partner landscape: the developer portal, the OAuth identity provider, the gateway with SLA tiers, the partner APIs and their data-isolation mapping, the onboarding automation that checks Salesforce, and the legacy API-key route for migration.',
    checks: [
      { label: 'Partners call the APIs through the gateway', rule: { type: 'each', of: 'partner', edgeTo: 'api-gateway' } },
      { label: 'The gateway validates OAuth tokens from an identity provider', rule: { type: 'edge', from: 'api-gateway', to: 'identity-provider' } },
      { label: 'Partners register and request access in a developer portal', rule: { type: 'edge', from: 'partner', to: ['web-app', 'internal-app'] } },
      { label: 'Gateways front the partner Experience APIs', rule: { type: 'edge', from: 'api-gateway', to: 'experience-api', min: 2 } },
      { label: 'Data isolation: the client ID is mapped to a partner number', rule: { type: 'edge', from: ['process-api', 'experience-api'], to: { type: ['cache', 'database', 'crm'], label: ['client', 'partner', 'map'] } } },
      { label: 'An onboarding automation checks the contract in Salesforce', rule: { type: 'path', from: 'batch-job', to: 'crm' } },
      { label: 'The automation approves contracts through the Anypoint Platform APIs', rule: { type: 'path', from: 'batch-job', to: { type: ['external-api', 'saas'], label: ['anypoint', 'api manager', 'platform', 'contract'] } } },
      { label: 'Old API keys are still accepted on a legacy route during migration', rule: { type: 'node', match: { type: 'api-gateway', label: ['legacy', 'key', 'migration'] } } },
    ],
    reference: diagram(
      {
        part: ['partner', 'E-commerce partners'],
        portal: ['web-app', 'Developer portal (API Experience Hub)'],
        idp: ['identity-provider', 'OAuth IdP (client management)'],
        gw: ['api-gateway', 'API Manager: OAuth + SLA tier rate limiting'],
        lgw: ['api-gateway', 'Legacy API-key proxy (migration)'],
        eship: ['experience-api', 'exp-shipments-api'],
        etrack: ['experience-api', 'exp-tracking-api'],
        p: ['process-api', 'prc-shipments-api'],
        map: ['cache', 'Client ID → partner number map'],
        sship: ['system-api', 'sys-shipment-platform-api'],
        core: ['legacy', 'Shipment platform'],
        onb: ['batch-job', 'Onboarding automation'],
        anyp: ['external-api', 'Anypoint Platform APIs (contracts)'],
        ssf: ['system-api', 'sys-salesforce-accounts-api'],
        sf: ['crm', 'Salesforce (contracts)'],
      },
      [
        'part -> portal', 'part -> idp', 'part -> gw', 'part -> lgw', 'portal -> idp', 'gw -> idp', 'gw -> eship', 'gw -> etrack',
        'lgw -> eship', 'eship -> p', 'etrack -> p', 'p -> map', 'p -> sship', 'sship -> core', 'onb -> anyp', 'onb -> ssf', 'ssf -> sf',
      ],
    ),
  },
  description: `
A parcel delivery company wants **e-commerce partners** (webshops, marketplaces, software vendors) to integrate with its APIs: *Shipments*, *Tracking*, *Pickup Points* and *Rates*. Today onboarding takes **6 weeks** of emails, manual credential creation and spreadsheets.

Target:
- A **developer portal** where partners register, read docs, try APIs in a sandbox and request production access.
- Sandbox access **instantly**; production access after a **commercial contract check** in Salesforce (account must have an active contract) and a short certification test.
- **Tiers**: Free (Tracking only, 10 req/s), Business (all APIs, 50 req/s), Enterprise (200 req/s, custom).
- Partners must only see and act on **their own** shipments.
- ~300 new partners/year, 1,200 existing partners to migrate from old API keys within 6 months.
- Security team requires OAuth 2.0, secret rotation and the ability to revoke a partner immediately.

**Design the solution:**
- Which Anypoint Platform capabilities do you use for the portal, access requests and tiers?
- How do you automate the production approval with Salesforce?
- How do you enforce tiers and data isolation at runtime?
- How do you migrate existing partners without breaking them?
`,
  answerTemplate: `## Portal and API catalog

## Access requests and tiers

## Automated approval

## Runtime enforcement and data isolation

## Migration of existing partners

## Operations
`,
  keyPoints: [
    'APIs designed contract-first and published in Exchange; a public developer portal (Anypoint API Experience Hub / Exchange public portal) exposes docs, mocking/sandbox and access requests.',
    'API instances in API Manager have SLA tiers (Free/Business/Enterprise); Free auto-approved, higher tiers require approval; SLA-based rate limiting policy enforces tier limits.',
    'OAuth 2.0 client credentials with an identity provider configured for client management (or client ID enforcement), so credentials can be rotated and revoked centrally.',
    'Approval automated through the Anypoint Platform APIs (e.g. API Manager contracts) driven by a workflow that checks the Salesforce contract and certification result.',
    'Data isolation enforced in the API implementation: client ID mapped to partner/customer number and every query filtered by it, never trusting a partner ID from the request body.',
    'Migration: old API keys mapped to new client apps, both accepted in parallel for a transition period, usage of the old keys monitored until zero.',
  ],
  solution: `
**Portal and API catalog.** Design each API in RAML/OAS, publish to **Anypoint Exchange** with documentation pages, examples and a **mocking service** for early exploration. Expose a public partner portal — **Anypoint API Experience Hub** (Salesforce Experience Cloud based) or the **Exchange public portal** for a simpler setup. Partners self-register (portal identity), create a **client application** and request access to an API.

Two environments: a **sandbox** environment with test data (realistic fake shipments) and **production**.

**Access requests and tiers.** In **API Manager**, each production API instance defines **SLA tiers**: Free (auto-approve, Tracking only, 10 req/s), Business (manual approval, 50 req/s), Enterprise (manual, 200 req/s). Apply the **Rate limiting – SLA based** policy, which enforces the tier attached to the client's contract. Sandbox instances auto-approve everything with low limits. Authentication: **OAuth 2.0** — configure an external **identity provider for client management** (e.g. Okta, Azure AD, PingFederate) so client apps created from the portal are registered in the IdP; enforce JWT validation / OAuth token enforcement policies. Credentials can be rotated (client secret reset) and revoked (revoke contract or disable client) centrally.

**Automated approval.** When a partner requests Business/Enterprise access, a pending contract is created in API Manager. An **onboarding automation** (scheduled Mule app or event from the portal):
1. Reads pending access requests via the **Anypoint Platform APIs** (API Manager contracts) using a Connected App with least-privilege scopes.
2. Looks up the partner's organisation in **Salesforce**: active contract, tier purchased, credit status.
3. Checks **certification**: partner's sandbox client made the required test calls successfully (e.g. created and cancelled shipments) — from analytics/logs or a certification API that records test results.
4. Approves (or rejects with reason) the contract and records the client ID ↔ Salesforce account mapping; notifies the partner.
Manual override stays possible for Enterprise deals.

**Runtime enforcement and data isolation.** Policies handle *who can call* and *how often*; the implementation handles *which data*. Each request carries the authenticated client ID (from the token); the Process API maps it to the **partner/customer number** (cached mapping store) and filters every query and action by it — \`GET /shipments/{id}\` returns 404 for a shipment owned by another partner. Never accept the partner ID from the request body as proof of identity. Add IP allowlisting for Enterprise partners if they wish.

**Migration of existing partners.** Bulk-create client applications for the 1,200 partners via platform APIs and map them to Salesforce accounts and their current limits (tier). For a transition period, a gateway route/legacy proxy accepts the **old API key** and maps it to the partner, while new credentials are distributed through the portal. Track old-key usage per partner in analytics; communicate deadlines; switch off old keys when usage drops to zero (or on the hard deadline).

**Operations.** Analytics per client app (Anypoint Monitoring/API Manager analytics) for usage and billing of Enterprise overages, alerts on 4xx spikes per partner (broken integrations), and a revoke runbook (revoke contract → effect within token lifetime; keep tokens short-lived).
`,
  followUps: [
    { q: 'A partner is found abusing the API. How fast can you block them?', a: 'Revoke the contract or disable the client in API Manager/IdP; with short-lived tokens (e.g. 15–60 minutes) and contract checks at the gateway, access stops almost immediately. An IP block policy can act instantly as an emergency measure.' },
    { q: 'How do you version these APIs once 1,500 partners depend on them?', a: 'Semantic versioning in Exchange, additive changes within a major version, new major versions run in parallel with a published deprecation timeline, and analytics show who still uses the old version.' },
    { q: 'Why not issue simple API keys?', a: 'Static keys are hard to rotate and leak easily; OAuth 2.0 client credentials give short-lived tokens, central revocation and standard tooling, which the security team requires.' },
  ],
}

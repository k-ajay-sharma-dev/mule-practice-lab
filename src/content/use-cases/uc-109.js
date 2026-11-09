import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-109',
  category: 'use-cases',
  title: 'Partner Stock and Price API with Platinum, Gold and Bronze Tiers',
  level: 'INTERMEDIATE',
  tags: ['api-manager', 'sla-tiers', 'rate-limiting', 'policies', 'b2b', 'caching'],
  estMinutes: 30,
  diagram: {
    task: 'draw the partner API: partner clients of different tiers, the gateway with client ID and SLA tier policies, the identity provider, the Experience API, the Process API that combines stock and price, the price cache, the System APIs for SAP and the WMS, and usage monitoring.',
    checks: [
      { label: 'Partners connect to the gateway policies', rule: { type: 'path', from: 'partner', to: 'api-gateway' } },
      { label: 'No partner reaches the APIs or back ends without the gateway', rule: { type: 'no-path', from: 'partner', to: ['experience-api', 'process-api', 'system-api', 'erp', 'wms'], unless: 'api-gateway' } },
      { label: 'The gateway forwards to the partner Experience API', rule: { type: 'edge', from: 'api-gateway', to: 'experience-api' } },
      { label: 'Client tokens are checked with the identity provider', rule: { type: 'link', from: 'api-gateway', to: 'identity-provider' } },
      { label: 'Stock and price are combined in one Process API', rule: { type: 'each', of: 'process-api', edgeTo: 'system-api', count: 2, some: true } },
      { label: 'SAP and the WMS are reached only through System APIs', rule: { type: 'only-via', target: ['erp', 'wms'], from: 'system-api' } },
      { label: 'Prices are cached in front of SAP', rule: { type: 'edge', from: 'process-api', to: 'cache' } },
      { label: 'Usage per client is sent to monitoring', rule: { type: 'path', from: 'api-gateway', to: 'monitoring' } },
    ],
    reference: diagram(
      {
        p1: ['partner', 'Platinum partners (ERP to ERP)'],
        p2: ['partner', 'Bronze partners (garage apps)'],
        gw: ['api-gateway', 'API Manager: client ID + SLA tier rate limiting'],
        idp: ['identity-provider', 'OAuth provider (client credentials)'],
        exp: ['experience-api', 'exp-partner-catalog-api v1'],
        prc: ['process-api', 'prc-stock-and-price'],
        cache: ['cache', 'Price cache (10 min)'],
        ssap: ['system-api', 'sys-sap-pricing'],
        swms: ['system-api', 'sys-wms-stock'],
        sap: ['erp', 'SAP S/4HANA'],
        wms: ['wms', 'WMS (3 DCs)'],
        mon: ['monitoring', 'Anypoint Monitoring: usage per client'],
      },
      ['p1 -> gw', 'p2 -> gw', 'gw -> idp', 'gw -> exp', 'exp -> prc', 'prc -> cache', 'prc -> ssap', 'ssap -> sap', 'prc -> swms', 'swms -> wms', 'gw ~> mon'],
    ),
  },
  description: `
An auto parts distributor wants to open a **stock and price API** to about **300 partners**: large retail chains that connect their ERP, and small garages that use a partner app.

Facts:
- Endpoints: \`GET /parts/{sku}\` (price for that partner and stock per DC) and \`POST /parts/availability\` (up to 100 SKUs).
- Prices come from **SAP S/4HANA** (customer-specific conditions; one call takes 400 to 900 ms). Stock comes from the **WMS** of 3 DCs.
- Commercial tiers:
  - **Platinum**: 50 requests per second, 99.9 % availability target, approved by the account manager.
  - **Gold**: 10 requests per second.
  - **Bronze**: 1 request per second and 10,000 per day, approved automatically.
- One partner hammered the old SOAP service with 300 requests per second during a stocktake and slowed SAP for everyone.
- Partners must see their usage, and sales wants a monthly usage report per partner.

**Describe your solution:**
- How are tiers defined, assigned and enforced?
- How do partners get credentials, and how does the API know which partner is calling?
- How do you protect SAP from a partner within its tier limits?
- What does a partner see when it hits the limit?
`,
  answerTemplate: `## Onboarding and credentials

## SLA tiers and policies

## Protecting the back ends

## Errors and usage reporting
`,
  keyPoints: [
    'The API is published in Exchange; each partner requests access for its client app and picks a tier. Bronze is approved automatically, Platinum and Gold by a person.',
    'API Manager applies client ID enforcement (or OAuth 2.0 token validation) and the Rate Limiting SLA-based policy with the limits of each tier.',
    'Over the limit the gateway answers 429 with retry headers before any back end is called.',
    'A plain Rate Limiting or Spike Control policy on the whole API protects SAP from the sum of all partners, and a price cache cuts SAP calls further.',
    'The partner identity from the token decides which customer prices are returned; it is never taken from a request parameter.',
  ],
  solution: `
\`\`\`
 Partners -> API Manager policies (client ID / OAuth, SLA tier rate limit, spike control) -> exp-partner-catalog-api
          -> prc-stock-and-price -> price cache
                                 -> sys-sap-pricing -> SAP
                                 -> sys-wms-stock   -> WMS
 gateway ~> Anypoint Monitoring (usage per client)
\`\`\`

**Onboarding and credentials.** The RAML is published in **Exchange** with a public portal. A partner signs in, creates a client application and **requests access** to the API instance, choosing a tier. Bronze has auto-approval; Gold and Platinum go to the account manager. The client ID is then linked to the partner's SAP customer number (a contract table or a custom field in the identity provider).

**SLA tiers and policies.** In API Manager:
- define the three **SLA tiers** with their limits (Bronze also gets the daily limit);
- apply **Rate Limiting SLA-based**, which reads the client ID and applies the tier of that contract;
- apply **Client ID Enforcement**, or **OAuth 2.0 token enforcement** if partners use client credentials with the corporate identity provider.
Requests over the limit get **429 Too Many Requests** with \`X-Ratelimit-Remaining\` and reset headers. The Mule app never sees them.

**Protecting the back ends.** Tier limits are per partner. Fifty Platinum partners at full speed would still be 2,500 requests per second. So also:
- **Spike Control** on the API to smooth bursts to what SAP can take;
- a **price cache** keyed by customer and SKU with a 10 minute TTL (prices change overnight), which removes most SAP calls for repeated lookups;
- the bulk endpoint calls SAP once for up to 100 SKUs instead of 100 times.

**Partner identity.** The Process API reads the client ID that the policy validated (from the attributes) and maps it to the customer number. A \`customerId\` query parameter would let partners read each other's prices.

**Usage reporting.** API Analytics in Anypoint Monitoring shows requests per client app. A monthly job exports it for sales. Partners see their own usage in the portal.
`,
  followUps: [
    { q: 'What is the difference between Rate Limiting SLA-based and Spike Control?', a: 'SLA-based rate limiting counts requests per client contract and rejects the excess with 429. Spike Control smooths bursts for the API as a whole by queueing or rejecting above a rate.' },
    { q: 'Why must the customer number come from the token and not from the request?', a: 'A partner could change a request parameter and read another partner\'s prices. The validated client identity cannot be changed by the caller.' },
    { q: 'How do you move a partner from Bronze to Gold?', a: 'The partner requests a tier change on the contract in Exchange and the account manager approves it. The new limit applies without a redeploy.' },
    { q: 'Where is the rate limit counter kept when the API runs on several replicas?', a: 'Configure the policy for a cluster so the replicas share one counter. Otherwise each replica allows the full limit.' },
  ],
}

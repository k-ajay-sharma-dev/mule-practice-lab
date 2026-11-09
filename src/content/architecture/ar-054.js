import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-054',
  category: 'architecture',
  title: 'Experience APIs and the Backend-for-Frontend Pattern',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'experience-api', 'bff', 'mobile', 'partner'],
  estMinutes: 20,
  diagram: {
    task: 'draw the Experience layer for the three order consumers on top of the existing prc-order-api, including login and caching.',
    checks: [
      { label: 'The mobile app, the web portal and the marketplace partner each call an Experience API', rule: { type: 'each', of: ['mobile-app', 'web-app', 'partner'], min: 3, edgeTo: 'experience-api' } },
      { label: 'The partner has its own Experience API, separate from the digital channels', rule: { type: 'each', of: { type: 'experience-api', label: ['partner', 'marketplace'] }, edgeFrom: 'partner' } },
      { label: 'The mobile app and the web portal never use the partner Experience API', rule: { type: 'no-edge', from: ['mobile-app', 'web-app'], to: { type: 'experience-api', label: ['partner', 'marketplace'] } } },
      { label: 'Every Experience API reuses a Process API (the business rules live there)', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'The Experience APIs share the existing order Process API', rule: { type: 'each', of: 'process-api', edgeFrom: 'experience-api', count: 2, some: true } },
      { label: 'Experience APIs never call System APIs to "fill gaps"', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Both end-user channels log in through the identity provider', rule: { type: 'each', of: ['mobile-app', 'web-app'], min: 2, edgeTo: 'identity-provider' } },
      { label: 'The order list is cached with a short TTL at the Experience layer', rule: { type: 'edge', from: 'experience-api', to: 'cache' } },
      { label: 'Every System API is called by the Process API', rule: { type: 'each', of: 'system-api', edgeFrom: 'process-api' } },
      { label: 'Every System API connects to the order backend', rule: { type: 'each', of: 'system-api', edgeTo: ['erp', 'database', 'crm', 'saas', 'legacy'] } },
      { label: 'The order backend is reached only through a System API', rule: { type: 'only-via', target: ['erp', 'database', 'crm', 'saas', 'legacy'], from: 'system-api' } },
      { label: 'APIs call each other with sync calls. Async work goes through a broker', rule: { type: 'lines', from: ['mobile-app', 'web-app', 'partner', 'api-gateway', 'experience-api', 'process-api'], to: ['api-gateway', 'experience-api', 'process-api', 'system-api'], kind: 'sync' } },
      { label: 'Reads and writes to a data store are sync calls', rule: { type: 'lines', to: ['database', 'oracle-db', 'sql-server', 'cache'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Mobile app'],
        web: ['web-app', 'Web portal'],
        mkt: ['partner', 'Marketplace partner (M2M, 50 rps)'],
        idp: ['identity-provider', 'Customer IdP (OAuth 2.0 / OIDC)'],
        em: ['experience-api', 'exp-mobile-api (BFF: last 10 orders)'],
        ew: ['experience-api', 'exp-web-api (BFF: full history)'],
        ep: ['experience-api', 'exp-partner-order-api (client creds, SLA tier)'],
        cache: ['cache', 'Order list cache (short TTL)'],
        po: ['process-api', 'prc-order-api (return eligibility, status)'],
        so: ['system-api', 'sys-order-api'],
        erp: ['erp', 'Order system of record'],
      },
      ['mob -> idp', 'web -> idp', 'mob -> em', 'web -> ew', 'mkt -> ep', 'em -> cache', 'em -> po', 'ew -> po', 'ep -> po', 'po -> so', 'so -> erp'],
    ),
  },
  description: `
A retailer has a working \`prc-order-api\`. Three consumers now want order data:

| Consumer | Needs |
|---|---|
| **Mobile app** | Last 10 orders with status and thumbnail; small payloads (poor networks); one call per screen; end users log in |
| **Web portal** | Full order history with filters, invoices, return eligibility; end users log in |
| **Marketplace partner** | Orders they sold, in their own field naming; strict SLA; machine-to-machine; 50 rps contracted |

**Questions:**
1. One Experience API or several? Defend your choice using the **Backend-for-Frontend (BFF)** idea.
2. What exactly does each Experience API do differently (shape, pagination, security, caching, SLA)?
3. What must stay **out** of the Experience APIs?
4. The mobile team asks for GraphQL. How does that fit API-led?
`,
  answerTemplate: `## How many Experience APIs

## What each does

## What stays out

## GraphQL
`,
  keyPoints: [
    'Create a separate Experience API when contract, security model, SLA or lifecycle differ; channels with identical needs can share one (e.g. a "digital" API for web and mobile).',
    'BFF: each Experience API is owned by/for one front-end and shaped to its screens and network constraints, reducing round trips and over-fetching.',
    'The partner Experience API differs in security (client credentials/OAuth scopes, client-id enforcement with SLA tiers), naming, versioning stability and rate limits.',
    'Experience APIs only shape, secure and cache; business rules (e.g. return eligibility) stay in Process APIs so all channels agree.',
    'GraphQL can be an Experience-layer interface over the same Process APIs; it does not replace the lower layers.',
  ],
  solution: `
**How many?** Two or three, decided by differences — not by count of consumers:
- \`exp-partner-order-api\` — clearly separate: external machine client, different naming, SLA tier, independent and conservative versioning.
- Mobile and web: both authenticated end users, but different shapes and paging. Options: one \`exp-digital-api\` with \`view=summary|full\` and field selection, or two BFFs (\`exp-mobile-api\`, \`exp-web-api\`) if the teams and release cycles are separate. If the mobile team releases weekly and needs screen-shaped endpoints, separate BFFs reduce coordination.

**BFF principle:** "one backend per user experience" — the API is designed for (and ideally co-owned with) the front-end team; it aggregates and trims so the client makes one call per screen.

**Differences.**

| Aspect | Mobile | Web | Partner |
|---|---|---|---|
| Shape | \`GET /me/orders?limit=10\` → id, date, status, total, thumbnail URL | \`GET /me/orders?status=&from=&to=&page=\` → full detail, invoice links | \`GET /orders?soldBy=…\` in the partner's agreed field names |
| Pagination | Cursor, small pages | Page numbers for a table UI | Cursor, larger pages |
| Security | OAuth 2.0 (authorization code + PKCE via the identity provider), token validated by policy; customer id taken from token | Same IdP; possibly session-based front end | Client credentials / client-id enforcement; scoped to the partner's own orders |
| Caching | Short TTL on order list; HTTP caching headers | Similar | Usually none or very short |
| SLA / limits | Spike control | Spike control | SLA-based rate limiting (contracted 50 rps tier) |
| Versioning | Can move faster (app version gating) | Moderate | Slow, long deprecation windows |

**What stays out:** return-eligibility rules, pricing, status derivation, cross-system orchestration — all in \`prc-order-api\`. If the mobile Experience API computes "can return" and the web one computes it differently, customers get different answers. Experience APIs also never call System APIs to "fill gaps" without a deliberate decision.

**GraphQL.** It is a **consumer-facing interface style**, so it fits at the Experience layer: a GraphQL endpoint whose resolvers call Process APIs. MuleSoft offers APIkit for GraphQL to implement a GraphQL API in a Mule app, and Anypoint DataGraph historically offered a unified graph over REST APIs. Check current product availability. The System and Process layers stay REST. Mind: query-complexity limits, caching is harder than with GET URLs, and policies apply per endpoint rather than per resource.
`,
  followUps: [
    { q: 'Doesn\'t a BFF per channel duplicate code?', a: 'Some mapping code is duplicated, but that is cheap and intentional; what must not be duplicated is business logic, which stays in Process APIs. Shared DataWeave modules can remove repetitive mapping.' },
    { q: 'Who should own the mobile Experience API?', a: 'Ideally the mobile team or a team working closely with it, because it changes at the speed of the app. The Process and System APIs stay with domain/platform teams.' },
    { q: 'How do you stop the partner seeing other partners\' orders?', a: 'Derive the partner identity from the authenticated client (client id or token claims), never from a request parameter, and pass it as a mandatory filter to the Process API.' },
  ],
}

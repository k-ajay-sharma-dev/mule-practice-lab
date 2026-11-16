import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-054',
  category: 'architecture',
  title: 'Experience APIs and the Backend-for-Frontend Pattern',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'experience-api', 'bff', 'mobile', 'partner'],
  estMinutes: 30,
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
        em: ['experience-api', 'exp-mobile-api (BFF: last 10 orders)', { auth: 'oauth2', vCores: '0.2' }],
        ew: ['experience-api', 'exp-web-api (BFF: full history)', { auth: 'oauth2' }],
        ep: ['experience-api', 'exp-partner-order-api (client creds, SLA tier)', { auth: 'client-id', rateLimit: 50, vCores: '0.2' }],
        cache: ['cache', 'Order list cache (short TTL)', { ttlSec: 60 }],
        po: ['process-api', 'prc-order-api (return eligibility, status)', { vCores: '0.5' }],
        so: ['system-api', 'sys-order-api', { vCores: '0.5' }],
        erp: ['erp', 'Order system of record'],
      },
      ['mob -> idp', 'web -> idp', 'mob -> em', 'web -> ew', 'mkt -> ep', 'em -> cache', 'em -> po', 'ew -> po', 'ep -> po', 'po -> so', 'so -> erp'],
    ),
    simulation: {
      systems: [{ match: 'erp', latencyMs: 200, maxRps: 200 }],
      cache: { hitRatio: 0.5, atTtlSec: 60 },
      tests: [
        {
          name: 'Partner bursts over its contract',
          about: 'The mobile app asks for order lists 80 times a second and the web portal 30, while the partner sends 200 against its contract of 50. The partner gets 429 for the extra calls, both customer channels are answered, and the order system stays well under its 200 a second.',
          traffic: [
            { name: 'mobile', from: 'mobile-app', rps: 80, to: 'erp' },
            { name: 'web', from: 'web-app', rps: 30, to: 'erp' },
            { name: 'partner', from: 'partner', rps: 200, to: 'erp' },
          ],
          expect: {
            answers: [{ flow: 'mobile', minSuccess: 0.99 }, { flow: 'web', minSuccess: 0.99 }, { flow: 'partner', minLimited: 0.6 }],
            peakRps: [{ node: 'erp', max: 180 }],
          },
        },
        {
          name: 'Callers without credentials',
          about: 'Next to normal mobile traffic, a script calls the web Experience API without logging in and an unknown client calls the partner API without a client ID. Both must be refused.',
          traffic: [
            { name: 'mobile', from: 'mobile-app', rps: 20, to: 'erp' },
            { name: 'web without login', from: 'web-app', rps: 5, to: 'erp', auth: 'none' },
            { name: 'partner without client ID', from: 'partner', rps: 5, to: 'erp', auth: 'none' },
          ],
          expect: {
            answers: [
              { flow: 'mobile', minSuccess: 0.99 },
              { flow: 'web without login', minRefused: 0.99 },
              { flow: 'partner without client ID', minRefused: 0.99 },
            ],
          },
        },
      ],
    },
  },
  description: `
A retailer has a working \`prc-order-api\`. Three consumers now want order data:

| Consumer | Needs |
|---|---|
| **Mobile app** | Last 10 orders with status and thumbnail; small payloads (poor networks); one call per screen; end users log in |
| **Web portal** | Full order history with filters, invoices, return eligibility; end users log in |
| **Marketplace partner** | Orders they sold, in their own field naming; strict SLA; machine-to-machine; 50 rps contracted |

At peak the mobile app asks for order lists **80 times a second** and the web portal 30. The partner has sent bursts of **200 a second**, far over its contract. The order system answers in about 200 ms and takes at most **200 calls a second**. A short TTL of one minute on the mobile order list answers about half of the mobile reads.

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
    'In settings: client ID enforcement and a 50 a second rate limit on the partner API, an OAuth 2.0 policy on the mobile and web APIs, a one minute cache on the mobile order list, and 0.5 vCore for the shared Process and System APIs.',
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

**Settings that matter.**
- \`exp-partner-order-api\`: **client ID enforcement** and a **rate limit of 50 a second**, the contracted tier. A burst of 200 gets 429 for the extra 150, so the shared \`prc-order-api\` and the order system never see it. Without the limit the burst would push the order system past its 200 a second and mobile and web customers would get errors.
- \`exp-mobile-api\` and \`exp-web-api\`: an **OAuth 2.0 policy**, so calls without a logged-in user are refused before they reach the order rules.
- The mobile order list cache with a **TTL of 60 s** answers about half of the mobile reads. With it the order system gets about 120 calls a second at peak; without it, 160, which leaves little room.
- Sizing: \`prc-order-api\` and \`sys-order-api\` carry every channel, so they get 0.5 vCore each. The mobile and partner Experience APIs get 0.2, the web one stays at 0.1: 1.5 vCores in total.

**GraphQL.** It is a **consumer-facing interface style**, so it fits at the Experience layer: a GraphQL endpoint whose resolvers call Process APIs. MuleSoft offers APIkit for GraphQL to implement a GraphQL API in a Mule app, and Anypoint DataGraph historically offered a unified graph over REST APIs. Check current product availability. The System and Process layers stay REST. Mind: query-complexity limits, caching is harder than with GET URLs, and policies apply per endpoint rather than per resource.
`,
  followUps: [
    { q: 'Doesn\'t a BFF per channel duplicate code?', a: 'Some mapping code is duplicated, but that is cheap and intentional; what must not be duplicated is business logic, which stays in Process APIs. Shared DataWeave modules can remove repetitive mapping.' },
    { q: 'Who should own the mobile Experience API?', a: 'Ideally the mobile team or a team working closely with it, because it changes at the speed of the app. The Process and System APIs stay with domain/platform teams.' },
    { q: 'How do you stop the partner seeing other partners\' orders?', a: 'Derive the partner identity from the authenticated client (client id or token claims), never from a request parameter, and pass it as a mandatory filter to the Process API.' },
  ],
}

import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-009',
  category: 'case-studies',
  title: 'Car Manufacturer Exposing Inventory to Its Dealer Network',
  level: 'BEGINNER',
  tags: ['automotive', 'api-management', 'caching', 'rate-limiting', 'exchange'],
  estMinutes: 25,
  diagram: {
    task: 'draw the dealer API network: dealer DMS clients, the managed gateway, the dealer Experience API, the Process APIs that merge stock and handle orders, the System APIs, and how the ERP is kept under 20 requests/second.',
    checks: [
      { label: 'Every dealer DMS client goes through the API gateway (client ID, per-client rate limits)', rule: { type: 'each', of: 'partner', edgeTo: 'api-gateway' } },
      { label: 'Dealers reach the dealer Experience API through the gateway', rule: { type: 'path', from: 'partner', to: 'experience-api', via: 'api-gateway' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Vehicle availability merges ERP stock and logistics tracking (two System APIs)', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 2 } },
      { label: 'The ERP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'The logistics system is reached only through a System API', rule: { type: 'only-via', target: ['saas', 'legacy', 'external-api'], from: 'system-api' } },
      { label: 'Stock responses are cached so browsing stays under the ERP limit', rule: { type: 'edge', from: ['experience-api', 'process-api', 'system-api'], to: ['cache', 'database'] } },
      { label: 'A dealer order reaches the ERP end to end', rule: { type: 'path', from: 'partner', to: 'erp' } },
    ],
    reference: diagram(
      {
        dms: ['partner', 'Dealer DMS (own client ID)'],
        gw: ['api-gateway', 'API Manager (client ID, SLA tiers, spike control)'],
        ed: ['experience-api', 'dealer-eapi'],
        pav: ['process-api', 'vehicle-availability-papi'],
        pord: ['process-api', 'dealer-orders-papi'],
        cache: ['cache', 'Stock cache (TTL few min)'],
        serp: ['system-api', 'erp-vehicles-sapi'],
        slog: ['system-api', 'logistics-tracking-sapi'],
        erp: ['erp', 'ERP (stock, orders)'],
        log: ['saas', 'Logistics system'],
      },
      [
        'dms -> gw', 'gw -> ed', 'ed -> pav', 'ed -> pord',
        'pav -> cache', 'pav -> serp', 'pav -> slog', 'pord -> serp',
        'serp -> erp', 'slog -> log',
      ],
    ),
  },
  description: `
**Context.** A car manufacturer has 600 independent dealers. Dealers want to see vehicle stock (in factory, in transit, at other dealers), place vehicle orders and check order status. Today dealers get an emailed spreadsheet twice a week and order through a web form that a back-office team re-keys into the order system.

**Goals**
- Dealers' own dealer-management systems (DMS) can query stock and place orders via APIs.
- The manufacturer controls who calls what and how often.
- A simple self-service way for dealer IT vendors to get started.

**Constraints**
- Stock data lives in the ERP; vehicle tracking (in transit) is in a logistics system.
- The ERP must not receive more than ~20 requests per second.
- Dealers use about five different DMS vendors.

**Your task.** Propose the APIs, security and onboarding approach.
`,
  answerTemplate: `## APIs to build

## Security and access control

## Protecting the ERP

## Dealer onboarding

## Risks
`,
  keyPoints: [
    'Experience API for dealers (e.g. dealer-eapi) built on Process/System APIs for ERP stock/orders and logistics tracking.',
    'Each dealer (or DMS vendor) gets its own client application/credentials, so access can be tracked and revoked per dealer.',
    'API Manager policies: client ID enforcement or OAuth 2.0, plus SLA-based rate limiting per client.',
    'Stock queries are cached (short TTL) or served from a periodically refreshed read store so the ERP stays under its request limit.',
    'Dealers can only see/order for their own dealer code — enforced in the API, not just trusted from the request.',
    'API specs and docs are published to an Exchange portal so DMS vendors can self-serve and test against a mock or sandbox.',
  ],
  solution: `
**APIs.**
- \`erp-vehicles-sapi\` (stock, orders) and \`logistics-tracking-sapi\` (in-transit status).
- \`vehicle-availability-papi\` merges factory, in-transit and dealer stock into one view.
- \`dealer-eapi\`: \`GET /vehicles?model=...\`, \`POST /orders\`, \`GET /orders/{id}\`.

**Security.** Register each DMS vendor/dealer as a client app in Exchange; enforce **client ID** (or OAuth 2.0 client credentials via an identity provider) in API Manager. Map the client to a dealer code and check every order/status request against it so dealer A cannot read dealer B's orders.

**Protect the ERP.** SLA tiers with rate limits per client (e.g. 5 req/s) plus an overall spike-control policy. Cache stock responses for a few minutes (Cache scope / HTTP caching policy) or refresh a read store every 10 minutes and serve queries from it. Orders go through to the ERP but are few.

**Onboarding.** Publish RAML/OAS specs in Exchange with examples; enable the mocking service so vendors build before credentials are issued; publish a public/dealer portal with "request access" flows. Start with one DMS vendor as a pilot.

**Risks.** Stale stock leading to double-sold vehicles (confirm availability at order time against the ERP), uneven DMS vendor quality, and keeping credentials per dealer manageable.
`,
  followUps: [
    { q: 'How fresh does stock data need to be?', a: 'Browsing can tolerate minutes of staleness; ordering cannot. So cache reads, but the order flow reserves/checks the vehicle in the ERP synchronously.' },
    { q: 'Credentials per dealer or per DMS vendor?', a: 'Per dealer if the vendor can manage it, because you can then revoke and measure per dealer; otherwise per vendor with the dealer code in a signed token claim, not a free-text header.' },
    { q: 'What would you prioritise first?', a: 'Read-only stock availability, because it removes the spreadsheet and has low risk; ordering follows once security and dealer mapping are proven.' },
  ],
}

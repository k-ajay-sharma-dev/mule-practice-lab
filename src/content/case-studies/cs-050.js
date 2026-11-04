import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-050',
  category: 'case-studies',
  title: 'Designing the Application Network for a Retailer Moving to Composable Commerce',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'composable-commerce', 'headless', 'saas-integration', 'application-network'],
  estMinutes: 45,
  diagram: {
    task: 'draw the composable-commerce application network: a BFF per channel, Process APIs for catalog publication, availability and orders, System APIs over each SaaS and SAP, and the direct read-only search call from the storefront.',
    checks: [
      { label: 'The storefront and the mobile app each have their own BFF-style Experience API', rule: { type: 'each', of: ['web-app', 'mobile-app'], min: 2, edgeTo: 'experience-api' } },
      { label: 'Commerce engine, PIM and OMS are reached only through System APIs (anti-corruption layer)', rule: { type: 'only-via', target: { type: ['saas', 'erp'], label: ['commerce', 'pim', 'oms'] }, from: 'system-api' } },
      { label: 'SAP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'PIM changes arrive as events at the catalog-publication Process API', rule: { type: 'edge', to: { type: 'process-api', label: ['catalog', 'product'] }, kind: 'async' } },
      { label: 'Catalog publication pushes products to both search and commerce (no direct vendor-to-vendor connector)', rule: { type: 'edge', from: { type: 'process-api', label: ['catalog', 'product'] }, to: 'system-api', min: 2 } },
      { label: 'Availability is served from a cached read model, not a live SAP call per page view', rule: { type: 'edge', from: 'process-api', to: ['cache', 'database'] } },
      { label: 'Orders are handed to the OMS asynchronously via a queue', rule: { type: 'path', from: 'queue', to: { type: 'saas', label: ['oms'] } } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
    ],
    reference: diagram(
      {
        sf: ['web-app', 'Next.js storefront'],
        app: ['mobile-app', 'Mobile app'],
        ewbff: ['experience-api', 'exp-web-bff-api'],
        eapp: ['experience-api', 'exp-app-bff-api'],
        cat: ['process-api', 'prc-catalog-publication'],
        avail: ['process-api', 'prc-availability'],
        ord: ['process-api', 'prc-order'],
        q: ['queue', 'orders-to-oms'],
        spim: ['system-api', 'sys-pim'],
        ssearch: ['system-api', 'sys-search (indexing)'],
        scom: ['system-api', 'sys-commerce'],
        soms: ['system-api', 'sys-oms'],
        ssap: ['system-api', 'sys-sap-stock'],
        rm: ['cache', 'Availability read model'],
        pim: ['saas', 'PIM'],
        search: ['saas', 'Search service'],
        commerce: ['saas', 'Commerce engine (cart, checkout)'],
        oms: ['saas', 'OMS'],
        sap: ['erp', 'SAP S/4HANA'],
      },
      [
        'sf -> search', 'sf -> ewbff', 'app -> eapp', 'ewbff -> avail', 'eapp -> avail', 'ewbff -> ord', 'eapp -> ord',
        'spim -> pim', 'spim ~> cat', 'cat -> ssearch', 'cat -> scom', 'ssearch -> search', 'scom -> commerce',
        'avail -> rm', 'ssap -> sap', 'ssap ~> avail', 'ord -> scom', 'ord ~> q', 'q ~> soms', 'soms -> oms',
      ],
    ),
  },
  description: `
**Context.** A home-and-garden retailer (120 stores, online ~25% of revenue) is replacing its monolithic e-commerce platform with **composable commerce**:
- **Headless storefront** (React/Next.js) and a new **mobile app**
- SaaS **commerce engine** (cart, checkout), SaaS **search** service, headless **CMS**
- **PIM** for product data, **OMS** for order orchestration across stores and warehouses
- Existing **SAP S/4HANA** (finance, stock, purchasing), **payment provider**, and a **loyalty** platform
- Stores use a POS system that will stay for 3 years

**Goals**
- Swap any SaaS component later without rebuilding the storefront.
- Launch the new storefront in 9 months; mobile app 3 months later.
- Click-and-collect from stores with accurate store stock.

**Constraints**
- Some SaaS vendors push "direct" integrations to each other (e.g. PIM connector into the search service).
- The frontend team wants to call SaaS APIs directly from the browser for speed.
- Integration team: 6 Mule developers.

**Your task.** Design the application network: what goes through Anypoint (and in which layer), what can integrate directly, how the storefront talks to backends, and how data flows for products, stock, orders and customers.
`,
  answerTemplate: `## Principles and what goes through Mule

## Experience layer for storefront and app

## Process APIs (key capabilities)

## System APIs over SaaS and SAP

## Data flows: product, stock, order, customer

## Delivery plan and risks
`,
  keyPoints: [
    'Distinguishes what the storefront should call directly (vendor SDKs for search, CMS content, sometimes cart) from what needs orchestration or protection through Mule — avoids forcing every call through three layers.',
    'Uses System APIs as an anti-corruption layer over each SaaS and SAP so a component swap changes one System API, not every consumer.',
    'Defines Process APIs for business capabilities: product publication, availability (stock across stores/warehouses), order submission/orchestration hand-off to OMS, customer and loyalty.',
    'Uses a Backend-for-Frontend style Experience API per channel (web, app, possibly POS) handling aggregation, security and shaping.',
    'Chooses sync vs async per flow: product and stock updates via events/batch into search and commerce; orders via async hand-off to OMS with status events back.',
    'Plans delivery and governance: MVP flows for launch, contract-first specs, security (OAuth for customers), caching and peak capacity.',
  ],
  solution: `
**Principles.**
- *Composable* means each component is replaceable — so consumers must depend on **our** contracts, not vendor APIs, for anything business-critical.
- But not everything needs Mule. Read-only, frontend-specific vendor features (search queries, CMS content delivery) can be called directly through the vendor's CDN/SDK — adding hops there adds latency for no benefit, and replacing those vendors means frontend work anyway.
- Anything involving several systems, business rules, customer data, or SAP goes through the application network.

**Application network.**

\`\`\`
  Next.js storefront      Mobile app          POS (legacy)
        |   \\ (direct: search, CMS)  |              |
  exp-web-bff-api          exp-app-bff-api      exp-store-api
        \\_______________ ______|_______________/
                        |
  prc-catalog-publication  prc-availability  prc-order  prc-customer-loyalty
        |                     |                  |            |
  sys-pim  sys-search  sys-commerce  sys-oms  sys-sap-stock  sys-payment  sys-loyalty  sys-cms
\`\`\`

**Experience layer.** One BFF-style API per channel: aggregates (e.g. product page = commerce price + availability + loyalty points), applies OAuth 2.0 customer tokens, rate limits, caching, and channel-specific shapes. Cart/checkout calls go to the commerce engine through \`exp-web-bff-api\` so payment and order submission stay controlled.

**Process APIs.**
- \`prc-catalog-publication\`: PIM change events → enrich (prices from SAP/commerce) → push to search and commerce. Asynchronous; the vendor "direct PIM→search connector" is avoided because it bypasses enrichment and couples the two vendors.
- \`prc-availability\`: combines warehouse stock (SAP) and **store stock** (POS feeds via \`sys-pos-stock\`) into one availability view per SKU/location; serves click-and-collect checks. Uses a cached read model refreshed by stock events — no live SAP call for every page view.
- \`prc-order\`: takes a completed checkout, validates, hands off to OMS **asynchronously** (queue), publishes status events; OMS → SAP for finance via System APIs.
- \`prc-customer-loyalty\`: customer profile and loyalty balance across commerce and loyalty platforms.

**System APIs.** One per external system, with our canonical models: \`sys-commerce\`, \`sys-pim\`, \`sys-search\` (indexing side only), \`sys-oms\`, \`sys-sap-stock\`, \`sys-sap-finance\`, \`sys-payment\`, \`sys-loyalty\`, \`sys-pos-stock\`. Replacing, say, the search vendor means rewriting \`sys-search\` and adjusting the direct frontend search calls — nothing else.

**Data flows (summary).**
| Flow | Pattern |
|---|---|
| Product data | PIM event → prc-catalog-publication → search + commerce (async, retry, DLQ) |
| Stock | SAP/POS changes → events → availability read model; online reserve on checkout via OMS |
| Order | Storefront → BFF → commerce checkout → prc-order → queue → OMS → SAP; status events back to customer channels |
| Customer | Identity provider for login; profile/loyalty via prc-customer-loyalty |

**Delivery plan and risks.** Months 1–2: contracts, System APIs for commerce, PIM, SAP stock; months 3–6: catalog publication, availability, order flow; months 7–9: hardening, peak load tests, cutover; mobile reuses all Process APIs plus a new BFF. Risks: vendor lock-in through direct vendor-to-vendor integrations (governance rule), store stock accuracy (POS feed frequency), peak load (caching, rate limits, async orders), and a small team (prioritise MVP flows, use connectors and templates).
`,
  followUps: [
    { q: 'Why not let the frontend call every SaaS API directly?', a: 'It would spread business logic and vendor-specific models into the frontend, expose more credentials and make swapping a vendor a frontend rewrite. Direct calls are fine for read-only vendor features like search queries and CMS content; business transactions go through governed APIs.' },
    { q: 'What is a BFF and why use one per channel?', a: 'A Backend for Frontend is an Experience API tailored to one client type. Web and mobile need different payload shapes and caching, so separate BFFs avoid one compromise API that serves neither well.' },
    { q: 'How do you keep click-and-collect stock accurate?', a: 'Combine frequent stock events from SAP and POS into a read model, reserve stock at order time through the OMS, and show a safety buffer for low stock, accepting that the read model is eventually consistent.' },
  ],
}

import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-053',
  category: 'use-cases',
  title: 'API-Led: Manufacturer Dealer Portal for Orders and Warranty',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'application-network', 'manufacturing', 'b2b', 'sap'],
  estMinutes: 35,
  diagram: {
    task: 'draw the dealer application network including phase 2: the portal, sales-ops app and dealer-group DMS with their Experience APIs, the pricing, orders and warranty Process APIs, the System APIs and back ends, and the pricing cache.',
    checks: [
      { label: 'Dealer portal, sales-ops app and dealer DMS each call their own Experience API', rule: { type: 'each', of: ['web-app', 'internal-app', 'partner'], min: 3, edgeTo: 'experience-api' } },
      { label: 'Every Experience API goes through a Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Phase 2: the B2B Experience API reuses the existing pricing and orders Process APIs', rule: { type: 'edge', from: { type: 'experience-api', label: ['b2b', 'dms', 'partner', 'group'] }, to: 'process-api', min: 2 } },
      { label: 'SAP is reached only through System APIs', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Salesforce is reached only through a System API', rule: { type: 'only-via', target: 'crm', from: 'system-api' } },
      { label: 'Several Process APIs share the Salesforce dealer System API (dealer scoping)', rule: { type: 'edge', from: 'process-api', to: { type: 'system-api', label: ['salesforce', 'dealer'] }, min: 2 } },
      { label: 'Slow SAP pricing is cached per dealer', rule: { type: 'edge', from: ['process-api', 'system-api'], to: 'cache' } },
    ],
    reference: diagram(
      {
        portal: ['web-app', 'Dealer portal (Experience Cloud)'],
        ops: ['internal-app', 'Sales-ops app'],
        dms: ['partner', 'Dealer-group DMS (phase 2)'],
        ep: ['experience-api', 'exp-dealer-portal'],
        eo: ['experience-api', 'exp-salesops'],
        eb: ['experience-api', 'exp-dealer-b2b (NEW in phase 2)'],
        pprice: ['process-api', 'prc-parts-availability-pricing'],
        porder: ['process-api', 'prc-dealer-orders'],
        pwar: ['process-api', 'prc-warranty-claims'],
        cache: ['cache', 'Dealer price cache (15 min)'],
        smat: ['system-api', 'sys-sap-materials'],
        sprc: ['system-api', 'sys-sap-pricing'],
        sso: ['system-api', 'sys-sap-sales-orders'],
        ssf: ['system-api', 'sys-salesforce-dealers'],
        swar: ['system-api', 'sys-warranty-claims'],
        sap: ['erp', 'SAP S/4HANA'],
        sf: ['crm', 'Salesforce'],
        war: ['legacy', 'Warranty system (.NET)'],
      },
      [
        'portal -> ep', 'ops -> eo', 'dms -> eb', 'ep -> pprice', 'ep -> porder', 'ep -> pwar', 'eo -> porder', 'eo -> pwar', 'eb -> pprice', 'eb -> porder',
        'pprice -> cache', 'pprice -> smat', 'pprice -> sprc', 'pprice -> ssf', 'porder -> sso', 'porder -> ssf', 'pwar -> swar', 'pwar -> ssf',
        'smat -> sap', 'sprc -> sap', 'sso -> sap', 'ssf -> sf', 'swar -> war',
      ],
    ),
  },
  description: `
An agricultural machinery manufacturer sells through **1,100 independent dealers** in 25 countries. Dealers today phone and email for stock, prices and warranty claims. The company wants a **dealer portal** and, later, a direct API for large dealer groups' own DMS (dealer management systems).

| Channel | Users | Needs |
|---|---|---|
| **Dealer portal** (web, Experience Cloud) | Dealer staff | Check machine/parts availability and dealer-specific price, place parts orders, track orders, submit warranty claims with photos |
| **Dealer-group DMS integration** (phase 2) | 15 large dealer groups' systems | Parts availability + price, place orders, order status, system-to-system |
| **Internal sales-ops app** | 80 employees | See any dealer's orders and claims, approve claims |

| System | Holds | Interface |
|---|---|---|
| **SAP S/4HANA** | Materials, stock per plant, customer-specific pricing (condition records), sales orders, deliveries | OData / BAPI |
| **Salesforce** | Dealer accounts, contacts, dealer tier, territory | REST |
| **Warranty system** (custom, .NET) | Claims, machine serial registrations | REST |
| **Document storage** (S3) | Claim photos | S3 API |

Facts:
- ~50,000 availability/price checks/day; ~4,000 parts orders/day; ~600 warranty claims/day.
- Pricing comes from SAP condition records (pricing simulation is ~1.5 s per call).
- Dealers must only see their **own** prices and orders; dealer groups see all their member dealers.

**Questions:**
1. Decompose into Experience, Process and System APIs.
2. Describe the "check price & order parts" sequence.
3. Show what phase 2 (DMS integration) reuses.
`,
  answerTemplate: `## Experience APIs

## Process APIs

## System APIs

## Interactions & sequence

## Dealer data isolation

## Phase 2 reuse

## NFRs
`,
  keyPoints: [
    'System APIs: sys-sap-materials (stock), sys-sap-pricing (pricing simulation), sys-sap-sales-orders, sys-salesforce-dealers, sys-warranty-claims, sys-document-store.',
    'Process APIs: prc-parts-availability-pricing (stock + dealer price), prc-dealer-orders (validate dealer, create SAP order, status), prc-warranty-claims (validate serial/coverage, store photos, create claim).',
    'Experience APIs: exp-dealer-portal, exp-salesops, and in phase 2 exp-dealer-b2b — the only new API needed for the DMS integration.',
    'Dealer identity resolved from the token (portal user → dealer account) and enforced in Process APIs, with dealer-group hierarchy from Salesforce.',
    'Pricing simulation is slow and expensive: batch price requests per basket and cache dealer price lists for a short TTL.',
  ],
  solution: `
**API inventory**

| Layer | API | Key resources | Responsibility | Consumers |
|---|---|---|---|---|
| Experience | **exp-dealer-portal** | \`GET /parts/{partNo}/offer\`, \`POST /baskets/price\`, \`POST /orders\`, \`GET /orders\`, \`POST /warranty-claims\` | Portal shaping, dealer from session token | Experience Cloud portal |
| Experience | **exp-salesops** | \`GET /dealers/{id}/orders\`, \`GET /warranty-claims?status=\`, \`POST /warranty-claims/{id}/decision\` | Internal views + approvals | Sales-ops app |
| Experience | **exp-dealer-b2b** (phase 2) | \`POST /v1/price-availability\`, \`POST /v1/orders\`, \`GET /v1/orders/{id}\` | Stable, versioned B2B contract, OAuth client per dealer group | Dealer DMS systems |
| Process | **prc-parts-availability-pricing** | \`POST /price-availability\` (dealerId + list of parts) | Stock across plants + dealer price + lead time | portal, b2b |
| Process | **prc-dealer-orders** | \`POST /orders\`, \`GET /orders?dealerId=\`, \`GET /orders/{id}\` | Validate dealer status/credit block, create SAP sales order, map statuses and deliveries | portal, b2b, salesops |
| Process | **prc-warranty-claims** | \`POST /claims\`, \`GET /claims\`, \`POST /claims/{id}/decision\` | Check serial registration + coverage, upload photos, create claim, notify | portal, salesops |
| System | **sys-sap-materials** | \`GET /materials/{no}/stock\` | Wrap SAP OData | prc-parts-availability-pricing |
| System | **sys-sap-pricing** | \`POST /price-simulations\` | Wrap pricing BAPI / SD simulation | prc-parts-availability-pricing |
| System | **sys-sap-sales-orders** | \`POST /sales-orders\`, \`GET /sales-orders/{id}\` | Wrap SAP sales order BAPI/OData | prc-dealer-orders |
| System | **sys-salesforce-dealers** | \`GET /dealers/{id}\`, \`GET /dealer-groups/{id}/members\` | Dealer master data, hierarchy, SAP customer number | all Process APIs |
| System | **sys-warranty-claims** | \`POST /claims\`, \`GET /registrations/{serial}\` | Wrap .NET warranty REST | prc-warranty-claims |
| System | **sys-document-store** | \`POST /documents\` (pre-signed URL) | Wrap S3 | prc-warranty-claims |

\`\`\`
 [Dealer portal]      [Sales-ops app]      [Dealer DMS] (phase 2)
       |                    |                    |
 exp-dealer-portal     exp-salesops        exp-dealer-b2b          Experience
       |                    |                    |
       +---------+----------+---------+----------+
                 v                    v                v
  prc-parts-availability-   prc-dealer-orders   prc-warranty-claims  Process
  pricing
    |          |                 |      |            |        |
 sys-sap-   sys-sap-     sys-sap-sales-  sys-salesforce-  sys-warranty-  sys-document-   System
 materials  pricing      orders          dealers          claims         store
\`\`\`

**Sequence — dealer checks prices and orders parts**
1. Portal → exp-dealer-portal \`POST /baskets/price { parts: [...] }\`; the portal user's token carries the Salesforce contact → dealer account.
2. → prc-parts-availability-pricing \`POST /price-availability { dealerId, parts }\`.
3. Process API → sys-salesforce-dealers (cached): SAP customer number, tier, active status.
4. In parallel: sys-sap-materials stock per plant and sys-sap-pricing **one simulation for the whole basket** (not one per part).
5. Response: per part — available qty, plant, lead time, dealer net price.
6. Dealer submits → exp-dealer-portal \`POST /orders\` (Idempotency-Key) → prc-dealer-orders: re-validate dealer (credit block), create sales order through sys-sap-sales-orders, return SAP order number.

**Dealer data isolation.** The dealer ID is never taken from the request body for portal and B2B calls: the Experience API derives it from the token (portal user or B2B client ID → dealer/dealer group mapping). Process APIs check that requested orders/claims belong to that dealer, or to a member of that dealer group (hierarchy from Salesforce).

**Phase 2 reuse.**
| API | Phase 2 status |
|---|---|
| exp-dealer-b2b | **New** — B2B contract, versioned (\`/v1\`), published in an Exchange public portal |
| prc-parts-availability-pricing, prc-dealer-orders | **Reused** unchanged |
| All System APIs | **Reused** unchanged |
| prc-warranty-claims | Not exposed in phase 2 |

**Errors and NFRs.**
- SAP pricing slow: short cache of dealer price per material (e.g. 15 min; prices change at most daily) and per-call timeouts; if pricing fails, show availability with "price on request".
- SAP order creation: idempotency via an external reference (dealer PO + Idempotency-Key) checked before creating.
- Photos uploaded straight to S3 via pre-signed URLs, so large files don't pass through Mule.
- SLA tiers (Rate Limiting – SLA based) per dealer group on exp-dealer-b2b; Spike Control on SAP System APIs.
`,
  followUps: [
    { q: 'Why not let the dealer portal (Salesforce Experience Cloud) call SAP directly through Salesforce Connect?', a: 'It would bypass dealer-scoping rules and couple the portal to SAP. Every new channel (the DMS integration) would have to re-implement the same pricing and order logic.' },
    { q: 'What if a dealer group wants their DMS to receive order status changes automatically?', a: 'Add an event-driven notification: SAP order/delivery changes feed a Process API that calls registered dealer webhooks (or publishes to a per-group queue), reusing sys-sap-sales-orders and the dealer mapping.' },
    { q: 'Why is the B2B API versioned in the URL from day one?', a: 'External consumers upgrade slowly; a URL/major version lets you introduce breaking changes as /v2 while /v1 stays available during a deprecation period.' },
  ],
}

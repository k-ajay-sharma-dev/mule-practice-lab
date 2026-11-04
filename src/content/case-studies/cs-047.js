import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-047',
  category: 'case-studies',
  title: 'Mid-Size Distributor Starting Its First API-Led Project',
  level: 'BEGINNER',
  tags: ['api-led', 'pilot-project', 'system-apis', 'reuse', 'roadmap'],
  estMinutes: 35,
  diagram: {
    task: 'draw the pilot (B2B web shop stock and prices) across the three layers, plus project 2 (order history in Salesforce) reusing the same System APIs.',
    checks: [
      { label: 'The web shop reaches its Experience API through the gateway (client ID, rate limits)', rule: { type: 'path', from: 'web-app', to: 'experience-api', via: 'api-gateway' } },
      { label: 'A thin Process API combines customer price and branch stock', rule: { type: 'edge', from: { type: 'process-api', label: ['avail', 'stock', 'price'] }, to: 'system-api', min: 2 } },
      { label: 'Dynamics 365 is reached only through System APIs', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'The WMS database is reached only through a System API', rule: { type: 'only-via', target: { type: ['database', 'legacy'], label: ['wms', 'warehouse'] }, from: 'system-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Stock is cached briefly to protect the WMS database', rule: { type: 'edge', from: ['process-api', 'system-api', 'experience-api'], to: 'cache' } },
      { label: 'The customer System API is reused by both the pilot and project 2', rule: { type: 'edge', from: 'process-api', to: { type: 'system-api', label: ['customer'] }, min: 2 } },
      { label: 'Sales reps in Salesforce reach ERP order history through the API layers', rule: { type: 'path', from: 'internal-app', to: 'erp', via: 'process-api' } },
    ],
    reference: diagram(
      {
        shop: ['web-app', 'B2B web shop (SaaS)'],
        sales: ['internal-app', 'Salesforce (sales reps)'],
        gw: ['api-gateway', 'Client ID enforcement + rate limits'],
        eshop: ['experience-api', 'exp-b2b-shop-api'],
        esales: ['experience-api', 'exp-sales-account-api'],
        avail: ['process-api', 'prc-product-availability-api'],
        acct: ['process-api', 'prc-customer-account-api'],
        sprice: ['system-api', 'sys-erp-pricing-api'],
        scust: ['system-api', 'sys-erp-customer-api'],
        sstock: ['system-api', 'sys-wms-stock-api'],
        sorder: ['system-api', 'sys-erp-order-api'],
        cache: ['cache', 'Stock cache (short TTL)'],
        d365: ['erp', 'Dynamics 365 Finance'],
        wms: ['database', 'WMS (SQL Server)'],
      },
      [
        'shop -> gw', 'sales -> gw', 'gw -> eshop', 'gw -> esales', 'eshop -> avail', 'esales -> acct',
        'avail -> sprice', 'avail -> scust', 'avail -> sstock', 'avail -> cache', 'acct -> scust', 'acct -> sorder',
        'sprice -> d365', 'scust -> d365', 'sorder -> d365', 'sstock -> wms',
      ],
    ),
  },
  description: `
**Context.** A building-materials distributor (1,500 staff, 40 branches) has just bought Anypoint Platform. Today it has ~30 point-to-point integrations: nightly CSV exports, database links and a few scripts. Core systems: **Microsoft Dynamics 365 Finance** (ERP), **Salesforce** (sales), a legacy **warehouse management system** (WMS, SQL Server database), and a B2B web shop on a SaaS platform.

**Candidate first projects (the business wants one live in ~4 months)**
1. Show real-time stock and customer-specific prices in the B2B web shop (today: nightly file, often wrong).
2. Give sales reps order history and open invoices in Salesforce.
3. Replace the payroll file transfer to the external payroll provider.
4. A data warehouse load of all ERP tables.

**Constraints**
- Team: 2 newly trained Mule developers, 1 architect (you), help from a partner for the first 3 months.
- The CFO funded the platform on the promise of "faster delivery through reuse" and wants proof within a year.
- Leadership has never heard of System, Process or Experience APIs.

**Your task.** Choose the pilot and justify it, define the first System APIs, sketch the layers for the pilot, and show how projects 2 and 3 will demonstrate reuse.
`,
  answerTemplate: `## Choosing the pilot

## First System APIs

## Pilot design across the three layers

## What to set up besides the APIs

## Projects 2 and 3: demonstrating reuse

## Risks and how you explain API-led to leadership
`,
  keyPoints: [
    'Chooses the pilot by business value, visibility, feasibility and reuse potential: the B2B stock and pricing use case touches core systems (ERP, WMS) that later projects also need.',
    'Rejects poor pilots: payroll file transfer has little reuse, and a full ERP table data-warehouse load is a bulk/ETL job, not a good showcase for API-led.',
    'Defines a small set of well-designed System APIs (customers, products, prices, stock, orders) modelled on business entities, not database tables, and only the operations needed now.',
    'Sketches a thin Process API and an Experience API for the web shop, with the layers kept lean for a small team.',
    'Plans for projects 2 and 3 to reuse the same System APIs (Salesforce order history, an order-status or branch app), and tracks reuse from day one.',
    'Includes the foundations: Exchange publishing, naming/versioning standards, CI/CD, security policies, monitoring — light but in place from the pilot.',
  ],
  solution: `
**Choosing the pilot.** Score candidates on value, visibility, feasibility in 4 months, and **reuse potential**:

| Candidate | Value | Visible | Feasible | Reuse of its System APIs |
|---|---|---|---|---|
| 1. B2B stock and prices | High (lost sales, wrong prices) | Customers and sales | Yes, read-heavy | ERP customers/products/prices, WMS stock — needed everywhere |
| 2. Order history in Salesforce | Medium | Sales | Yes | Reuses ERP APIs |
| 3. Payroll file | Low | No | Yes | Little (one-off file) |
| 4. DWH load | Medium | No | Big | Bulk ETL — not an API showcase |

Pick **1**. It is read-mostly (lower risk for a new team), visible to customers, fixes a real problem, and builds the System APIs that projects 2 and 3 need. Payroll can stay as a managed file transfer for now; the DWH load is better served by a batch or ETL tool.

**First System APIs (only what the pilot needs, but designed for reuse).**
- \`sys-erp-customer-api\`: \`GET /customers/{id}\` (account, price group, credit status)
- \`sys-erp-product-api\`: \`GET /products\`, \`GET /products/{sku}\`
- \`sys-erp-pricing-api\`: \`POST /prices/search\` (customer + list of SKUs)
- \`sys-wms-stock-api\`: \`GET /stock?skus=...&branch=...\`

Model **business entities** with clean names, not ERP/SQL table names; hide Dynamics/WMS specifics (auth, paging, codes).

**Pilot design.**

\`\`\`
B2B web shop (SaaS)
     |
exp-b2b-shop-api        shop-shaped responses, caching, client-id + rate limits
     |
prc-product-availability-api   combines price + stock for a customer and branch
     |            |               |
sys-erp-pricing  sys-erp-customer  sys-wms-stock
     |                              |
 Dynamics 365                    WMS (SQL Server)
\`\`\`

For a small team, keep the Process API thin and justified: it holds the real logic (customer price group + branch stock rules) that other channels will also need.

**Foundations set up during the pilot.** API specs designed first and published in **Exchange**; naming and versioning conventions; a project template (logging with correlation IDs, error handling); CI/CD pipeline to sandbox and prod; Client ID Enforcement on every API; dashboards and alerts. Keep it lightweight — the partner helps set it up and coaches the two developers.

**Projects 2 and 3: proving reuse.**
- **Project 2 — order history and invoices in Salesforce**: new \`sys-erp-order-api\` and \`sys-erp-invoice-api\`, a \`prc-customer-account-api\`, reusing \`sys-erp-customer-api\`. Reuse: 1 of 4 APIs.
- **Project 3 — branch counter app / customer order-status page**: reuses \`prc-product-availability-api\`, \`sys-erp-order-api\`, \`sys-erp-customer-api\`; only a new Experience API is built. Reuse: 3 of 4, delivered noticeably faster.
- Record from day one: APIs per project, new vs reused, effort, and lead time — this is the evidence the CFO asked for.

**Risks and explaining API-led.** Explain it in business terms: "we build a reusable connection to each core system once; new apps plug into those instead of building new point-to-point links". Risks: over-engineering for a small team (keep layers thin, merge when no value), the WMS database's performance (cache stock briefly), and skills (partner pairing, code reviews).
`,
  followUps: [
    { q: 'Do you always need all three layers for the pilot?', a: 'No. Use the layers where they add value; for a small team a thin Experience API calling System APIs directly can be fine at first. Here a Process API is justified because the price-plus-stock logic will be reused by other channels.' },
    { q: 'How do you avoid designing System APIs for every possible future use?', a: 'Design the resource model properly (good entity names and fields) but implement only the operations needed now. Add operations when a real consumer needs them, without breaking the contract.' },
    { q: 'What would make the pilot fail even if the code is good?', a: 'No measured value: if stock accuracy, sales impact and reuse are not tracked, the CFO only sees cost. Agree success metrics before starting.' },
  ],
}

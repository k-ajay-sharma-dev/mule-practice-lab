import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-017',
  category: 'case-studies',
  title: 'Online Marketplace Onboarding Third-Party Sellers',
  level: 'INTERMEDIATE',
  tags: ['e-commerce', 'marketplace', 'partner-apis', 'multi-tenant', 'rate-limiting'],
  estMinutes: 35,
  diagram: {
    task: 'draw the seller platform: API sellers and the portal/CSV path, the gateway, Experience APIs that share the same Process APIs, the asynchronous bulk catalogue load, and the order and finance flows.',
    checks: [
      { label: 'API sellers go through the API gateway (own credentials, per-seller rate limits)', rule: { type: 'each', of: 'partner', edgeTo: 'api-gateway' } },
      { label: 'Both the seller API and the portal/CSV path reach the same catalogue Process API', rule: { type: 'edge', from: 'experience-api', to: { type: 'process-api', label: ['catalog', 'catalogue'] }, min: 2 } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Catalogue uploads are accepted asynchronously into a queue (job ID returned)', rule: { type: 'edge', from: 'process-api', to: ['queue', 'topic'], kind: 'async' } },
      { label: 'Uploads are loaded into the catalogue in bulk by a batch job', rule: { type: 'path', from: ['queue', 'topic'], to: { type: ['saas', 'database', 'erp', 'legacy'], label: ['catalog', 'catalogue'] }, via: 'batch-job' } },
      { label: 'Catalogue, order and finance systems are reached only through System APIs', rule: { type: 'only-via', target: ['saas', 'erp', 'database', 'legacy'], from: 'system-api' } },
      { label: 'Seller orders and shipments feed finance for commission and payouts', rule: { type: 'edge', from: 'process-api', to: { type: 'system-api', label: ['finance', 'payout'] } } },
    ],
    reference: diagram(
      {
        lsel: ['partner', 'Large seller (API)'],
        portal: ['web-app', 'Seller portal / CSV upload'],
        gw: ['api-gateway', 'Gateway (OAuth per seller, SLA tiers)'],
        esel: ['experience-api', 'seller-eapi'],
        eport: ['experience-api', 'seller-portal-eapi'],
        pcat: ['process-api', 'seller-catalog-papi'],
        pord: ['process-api', 'seller-orders-papi'],
        job: ['batch-job', 'Bulk catalogue loader'],
        qup: ['queue', 'catalog-uploads'],
        scat: ['system-api', 'catalog-sapi'],
        sord: ['system-api', 'orders-sapi'],
        sfin: ['system-api', 'finance-sapi'],
        cat: ['saas', 'Catalogue system (bulk)'],
        ord: ['erp', 'Order system'],
        fin: ['erp', 'Finance system'],
      },
      [
        'lsel -> gw', 'portal -> gw', 'gw -> esel', 'gw -> eport',
        'esel -> pcat', 'esel -> pord', 'eport -> pcat', 'eport -> pord',
        'pcat ~> qup', 'qup ~> job', 'job -> scat', 'scat -> cat',
        'pord -> sord', 'pord -> sfin', 'sord -> ord', 'sfin -> fin',
      ],
    ),
  },
  description: `
**Context.** An online retailer is opening its website to third-party sellers. Sellers must upload product catalogues and stock, receive orders, confirm shipments and get payout reports. Large sellers want APIs; small sellers use a seller portal or CSV uploads. The retailer's own catalogue, order and finance systems must handle both first-party and seller products.

**Goals**
- Onboard 500 sellers in the first year, with self-service for API integrators.
- Seller orders reach sellers within a minute; shipment confirmations update customers promptly.
- One seller's bad data or heavy traffic must not affect others.

**Constraints**
- Catalogue system accepts bulk updates but is slow for single-item calls.
- Sellers' data must be isolated from each other.
- Finance needs accurate data for commission and payouts.

**Your task.** Propose the seller-facing APIs, the integration flows behind them, and how you protect the platform.
`,
  answerTemplate: `## Seller-facing APIs and channels

## Catalogue and stock ingestion

## Order and shipment flows

## Isolation, security and fair use

## Onboarding and support
`,
  keyPoints: [
    'Seller Experience API(s) for catalogue, stock, orders and shipments, with a CSV/portal path that reuses the same Process APIs.',
    'Each seller authenticates with its own credentials (OAuth 2.0 client credentials or client ID) and the seller ID comes from the credential, enforcing data isolation.',
    'Catalogue/stock uploads are accepted asynchronously (validate, queue, return a job ID/status) and loaded to the catalogue in bulk.',
    'Per-seller rate limits/SLA tiers protect the platform from one heavy seller.',
    'Orders are delivered to sellers via webhooks and/or a pull API, with retries and acknowledgements.',
    'Shipments and orders feed finance for commission and payouts with reconciliation.',
  ],
  solution: `
**APIs.**
- \`seller-eapi\`: \`POST /catalog/uploads\` (returns job ID), \`GET /catalog/uploads/{jobId}\`, \`PUT /stock\`, \`GET /orders?status=NEW\`, \`POST /orders/{id}/acknowledge\`, \`POST /shipments\`, \`GET /payouts\`.
- Portal and CSV uploads call the same Process APIs: \`seller-catalog-papi\`, \`seller-orders-papi\`, \`payouts-papi\`.
- System APIs: \`catalog-sapi\` (bulk), \`orders-sapi\`, \`finance-sapi\`, \`notifications-sapi\`.

**Catalogue ingestion.** Validate schema and business rules per item (category, price, images), report errors per line, queue valid items and load them to the catalogue in **bulk batches**. Stock updates are small and frequent — accept them quickly, coalesce per SKU and push in batches.

**Orders and shipments.** When a customer order contains seller items, \`seller-orders-papi\` splits it per seller and publishes per-seller events. Delivery: webhook to the seller (signed, retried with backoff) and a pull API as a fallback. Seller acknowledgements and shipment confirmations update the order and trigger customer notifications.

**Isolation and fair use.** OAuth 2.0 client credentials per seller; the seller ID is derived from the token, and every query is filtered by it. SLA tiers (standard, high-volume) with rate limits per client; separate queues or fair scheduling so one large upload does not starve others.

**Finance.** Shipment events feed commission calculation; daily reconciliation between orders, shipments and payouts.

**Onboarding.** Public developer portal (Exchange / API Experience Hub) with specs, sandbox and examples; seller signup links to credential issuance after verification.

**Risks.** Poor seller data quality, webhook delivery failures, and isolation bugs (test negative cases explicitly).
`,
  followUps: [
    { q: 'Webhooks or polling for new orders?', a: 'Offer both: webhooks for low latency, plus a pull API for sellers who cannot expose endpoints or to recover missed webhooks. Acknowledgement closes the loop either way.' },
    { q: 'How do you test data isolation?', a: 'Automated negative tests where seller A’s credentials try to read or update seller B’s orders and products; these must fail with 403/404 in every release.' },
    { q: 'How do you measure success?', a: 'Time to onboard a seller, order-to-seller latency, upload error rates, and seller support tickets per integration.' },
  ],
}

import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-023',
  category: 'flows',
  title: 'Nightly Reconciliation Between ERP and E-commerce',
  level: 'ADVANCED',
  tags: ['reconciliation', 'scheduler', 'dataweave', 'join', 'reporting'],
  estMinutes: 35,
  flowChecks: [
    { label: 'The reconciliation runs nightly on a Scheduler', rule: { type: 'source', component: 'scheduler' } },
    {
      label: 'Paged APIs are read in a loop, page by page',
      rule: { type: 'inside', component: 'http-request', within: ['foreach', 'parallel-foreach'] },
    },
    {
      label: 'Extraction is split into separate flows called via Flow Reference',
      rule: { type: 'refs' },
    },
    { label: 'The report is emailed to finance', rule: { type: 'exists', component: 'email-send' } },
    {
      label: 'Price fixes run in a loop inside a Choice that enforces the nightly cap',
      rule: { type: 'inside', component: ['foreach', 'parallel-foreach', 'batch-job'], within: 'choice' },
    },
    {
      label: 'Above the cap, fixes are skipped and an alert is sent instead',
      rule: { type: 'inside', component: 'email-send', within: 'choice' },
    },
    {
      label: 'A failed extraction aborts the run with an alert (no partial report)',
      rule: { type: 'handler', component: ['on-error-propagate', 'on-error-continue'] },
    },
  ],
  referenceFlow: design(
    flow(
      'nightly-reconciliation',
      source('scheduler', { strategy: 'cron', expression: '0 0 2 * * ?' }),
      [
        router('scatter-gather', { timeout: 7200000, maxConcurrency: 2 }, [
          route({}, [step('flow-ref', { name: 'extract-sap' })]),
          route({}, [step('flow-ref', { name: 'extract-shopify' })]),
        ]),
        step('db-select', {
          sql: 'SELECT COALESCE(s.sku, p.sku) AS sku, s.price AS sap_price, p.price AS shop_price, s.stock AS sap_stock, p.stock AS shop_stock FROM recon_sap s FULL OUTER JOIN recon_shopify p ON s.sku = p.sku',
        }),
        step('transform', {
          target: 'variable',
          variableName: 'recon',
          script:
            '%dw 2.0\noutput application/java\n---\n{\n  missingInShopify: payload filter ((r) -> r.shop_price == null),\n  missingInSap: payload filter ((r) -> r.sap_price == null),\n  priceMismatch: payload filter ((r) -> r.sap_price != null and r.shop_price != null and r.sap_price != r.shop_price),\n  stockMismatch: payload filter ((r) -> r.sap_stock != null and r.shop_stock != null and abs(r.sap_stock - r.shop_stock) > 2)\n}',
        }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/csv\n---\nflatten([\n  vars.recon.missingInShopify map ((r) -> { issue: "MISSING_IN_SHOPIFY", sku: r.sku, sap: r.sap_price, shopify: null }),\n  vars.recon.missingInSap map ((r) -> { issue: "MISSING_IN_SAP", sku: r.sku, sap: null, shopify: r.shop_price }),\n  vars.recon.priceMismatch map ((r) -> { issue: "PRICE_MISMATCH", sku: r.sku, sap: r.sap_price, shopify: r.shop_price }),\n  vars.recon.stockMismatch map ((r) -> { issue: "STOCK_MISMATCH", sku: r.sku, sap: r.sap_stock, shopify: r.shop_stock })\n])',
        }),
        step('http-request', { method: 'PUT', path: '/recon-reports/{runDate}.csv' }),
        step('email-send', { toAddresses: 'finance@example.com', subject: 'Nightly SAP / Shopify reconciliation' }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[sizeOf(vars.recon.priceMismatch) <= 500]' }, [
              scope('foreach', { collection: '#[vars.recon.priceMismatch]', batchSize: 1 }, [
                step('http-request', { method: 'PUT', path: '/shopify/products/{sku}/price' }),
              ]),
            ]),
          ],
          {
            otherwise: [
              step('email-send', { toAddresses: 'finance@example.com', subject: 'HIGH: price mismatches above cap, no auto-fix' }),
            ],
          },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('email-send', { toAddresses: 'integration-ops@example.com', subject: 'Reconciliation aborted: extraction failed' }),
        ]),
      ],
    ),
    flow('extract-sap', null, [
      step('db-update', { sql: 'TRUNCATE TABLE recon_sap' }),
      step('http-request', { method: 'GET', path: '/sap/products/count' }),
      step('set-variable', { variableName: 'pages', value: '#[ceil(payload.total / 1000)]' }),
      scope('foreach', { collection: '#[1 to vars.pages]', batchSize: 1 }, [
        step('http-request', { method: 'GET', path: '/sap/products?page={page}&size=1000' }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/java\n---\npayload.items map ((p) -> {\n  sku: upper(trim(p.sku)),\n  price: p.price as Number,\n  stock: p.stock as Number\n})',
        }),
        step('db-bulk-insert', { sql: 'INSERT INTO recon_sap (sku, price, stock) VALUES (:sku, :price, :stock)' }),
      ]),
    ]),
    flow('extract-shopify', null, [
      step('db-update', { sql: 'TRUNCATE TABLE recon_shopify' }),
      step('set-variable', { variableName: 'cursor', value: '#[null]' }),
      step('flow-ref', { name: 'extract-shopify-page' }),
    ]),
    flow('extract-shopify-page', null, [
      scope('until-successful', { maxRetries: 5, millisBetweenRetries: 2000 }, [
        step('http-request', { method: 'GET', path: '/shopify/products?first=250&after={cursor}' }),
      ]),
      step('set-variable', { variableName: 'hasNextPage', value: '#[payload.pageInfo.hasNextPage]' }),
      step('set-variable', { variableName: 'cursor', value: '#[payload.pageInfo.endCursor]' }),
      step('transform', {
        script:
          '%dw 2.0\noutput application/java\n---\npayload.products map ((p) -> {\n  sku: upper(trim(p.sku)),\n  price: p.price as Number,\n  stock: p.inventoryQuantity as Number\n})',
      }),
      step('db-bulk-insert', { sql: 'INSERT INTO recon_shopify (sku, price, stock) VALUES (:sku, :price, :stock)' }),
      router('choice', {}, [
        route({ expression: '#[vars.hasNextPage default false]' }, [step('flow-ref', { name: 'extract-shopify-page' })]),
      ]),
    ]),
  ),
  description: `
Real-time sync between **SAP** (master for prices and stock) and **Shopify** (storefront) occasionally misses updates. Finance wants a **nightly reconciliation** at 02:00:

- ~300k SKUs in SAP (exposed via an SAP System API with paging), ~280k products in Shopify (GraphQL/REST with pagination and rate limits).
- Report: SKUs **missing in Shopify**, **missing in SAP**, and **price or stock mismatches** above a tolerance (price ≠, stock difference > 2 units).
- Auto-fix price mismatches (SAP wins) up to **500 per night**; above that, only report and alert (likely a systemic problem).
- Report emailed as CSV and stored for 90 days. Must finish by 05:00.

**Design the flow(s):** extraction, comparison, report, auto-fix with a safety cap, and scaling.
`,
  answerTemplate: `## Trigger and extraction

## Normalising both sides

## Comparison logic

## Report generation

## Auto-fix with safety cap

## Performance and memory
`,
  keyPoints: [
    'Scheduler (cron, timezone set) triggers a job that extracts both sides with paging, respecting each system\'s rate limits.',
    'Both datasets are normalised into the same key/shape (SKU, price, stock) with DataWeave before comparing.',
    'Comparison is a keyed join (e.g. dw::core::Arrays outerJoin or indexed lookup via groupBy) — not nested loops — producing missing-left, missing-right and mismatch sets.',
    'Mismatch report is written as CSV to storage and emailed; summary counts logged/alerted.',
    'Auto-fix only runs if mismatch count ≤ 500 (circuit breaker), otherwise alert only; fixes use the normal System API path.',
  ],
  solution: `
1. **Trigger:** **Scheduler** with a cron expression \`0 0 2 * * ?\` and explicit timezone; \`disallowConcurrentExecution\`.
2. **Extract SAP:** loop over pages (**For Each** over page numbers or a recursive flow-ref until no next page) calling the SAP System API; stream pages to a staging store (DB table or file) rather than holding everything in variables.
3. **Extract Shopify:** paginate with the cursor; handle 429/throttle with backoff. Stage the same way.
4. **Normalise (DataWeave):** both sides → \`{ sku, price, stock }\` (trim, uppercase SKUs, same decimal scale, currency).
5. **Compare:**
   - If staged in a DB: SQL \`FULL OUTER JOIN\` on SKU does the heavy lifting.
   - If in memory (300k small records fits a few hundred MB): DataWeave builds an index (\`groupBy\` on sku, giving an object keyed by SKU) for O(1) lookups, or uses \`outerJoin\` from \`dw::core::Arrays\`. Classify into \`missingInShopify\`, \`missingInSap\`, \`priceMismatch\`, \`stockMismatch\` (abs difference > 2).
6. **Report:** DataWeave \`output application/csv\` → Amazon S3 Put Object (lifecycle rule 90 days) → **Email Send** to finance with summary counts in the body and the CSV attached (or a link if large).
7. **Auto-fix:** Choice: \`sizeOf(priceMismatch) <= 500\` → For Each (or batched calls) to the Shopify System API to set SAP price, record results. Else → skip fixes and send a high-priority alert.
8. **Errors:** if either extraction fails, do **not** produce a report (a partial extract would show thousands of false "missing" items) — alert instead.
`,
  followUps: [
    { q: 'Why not compare with a nested map/filter in DataWeave?', a: 'That is O(n×m) — 300k × 280k comparisons would never finish. Index one side by key first, or let the database do the join.' },
    { q: 'Why cap the auto-fix at 500?', a: 'A large mismatch count usually means a broken extract or mapping; blindly "fixing" hundreds of thousands of prices could damage the storefront. The cap acts as a circuit breaker.' },
    { q: 'How would you reduce the nightly volume?', a: 'Reconcile only records changed in the last N days plus a rotating sample, or compare per-SKU hashes; do a full reconciliation weekly.' },
  ],
}

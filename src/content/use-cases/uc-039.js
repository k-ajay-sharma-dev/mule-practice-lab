import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-039',
  category: 'use-cases',
  title: 'Sales Tax Calculation Service at Checkout',
  level: 'ADVANCED',
  tags: ['tax', 'caching', 'fallback', 'e-commerce', 'erp', 'reconciliation'],
  estMinutes: 30,
  diagram: {
    task: 'draw the tax integration: who calls the Tax Process API for estimates and lifecycle events, the Tax System API over the engine, the estimate cache and fallback rate table, NetSuite, and the reconciliation job.',
    checks: [
      { label: 'Cart/checkout calls the Tax Process API for estimates', rule: { type: 'edge', from: ['web-app', 'mobile-app'], to: ['process-api', 'experience-api'] } },
      { label: 'The tax engine is reached only through a Tax System API', rule: { type: 'only-via', target: 'saas', from: 'system-api' } },
      { label: 'Estimates are cached to cut the 3 million daily calls', rule: { type: 'edge', from: 'process-api', to: 'cache' } },
      { label: 'A fallback rate table is used when the engine is down', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'cache', 'file-store'], label: ['fallback', 'rate'] } } },
      { label: 'Order lifecycle events (commit, refund, cancel) arrive asynchronously via a queue', rule: { type: 'edge', from: ['queue', 'topic', 'event-stream'], to: 'process-api', kind: 'async' } },
      { label: 'NetSuite is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'A reconciliation job compares tax in the engine and in the ERP', rule: { type: 'edge', from: 'batch-job', to: 'system-api', min: 2 } },
    ],
    reference: diagram(
      {
        chk: ['web-app', 'Cart / checkout service'],
        oms: ['internal-app', 'Order management'],
        q: ['queue', 'order-lifecycle-events'],
        prc: ['process-api', 'prc-tax-api'],
        cache: ['cache', 'Estimate cache (hash key, 30 min TTL)'],
        fb: ['database', 'Fallback rate table (by ZIP)'],
        stax: ['system-api', 'sys-tax-engine-api'],
        sns: ['system-api', 'sys-netsuite-api'],
        tax: ['saas', 'Tax engine (estimate / commit)'],
        ns: ['erp', 'NetSuite'],
        rec: ['batch-job', 'Daily tax reconciliation'],
      },
      ['chk -> prc', 'oms ~> q', 'q ~> prc', 'prc -> cache', 'prc -> fb', 'prc -> stax', 'stax -> tax', 'prc -> sns', 'sns -> ns', 'rec -> stax', 'rec -> sns'],
    ),
  },
  description: `
A US-based online retailer now has to collect **sales tax in 40+ states** and is adopting a SaaS **tax engine** (e.g. Avalara- or Vertex-style).

Facts:
- Tax must be shown in the **cart, at checkout and on the final order**. The tax engine has \`POST /transactions\` with two modes: *estimate* (not saved) and *commit* (recorded for filing).
- Cart/checkout pages generate **~3 million tax estimate requests/day**; ~40,000 orders/day are committed. The tax engine bills **per API call** and has an SLA of 99.9%.
- Orders can be **partially shipped, partially refunded, or cancelled**; the tax engine needs adjustments/refunds so filings are correct.
- The **ERP** (NetSuite) posts the tax liability; finance must be able to reconcile ERP tax vs the tax engine monthly.
- Products have **tax codes** (clothing is exempt in some states); some B2B customers have **exemption certificates**.
- Business rule: if the tax engine is down, **checkout must continue**.

**Describe your solution:**
- What APIs do you build and where are they called from?
- How do you reduce the 3 million estimate calls?
- What is the fallback when the tax engine is unavailable?
- How do you handle commits, returns and cancellations so filings and ERP match?
`,
  answerTemplate: `## API design

## Estimate vs commit

## Reducing calls (caching)

## Fallback strategy

## Post-order lifecycle

## Reconciliation
`,
  keyPoints: [
    'Tax System API over the engine plus a Tax Process API used by cart/checkout (estimate) and order management (commit/adjust/refund).',
    'Estimates are not committed; one commit per order at payment/fulfilment, with the order ID as the engine document code for idempotency.',
    'Estimate caching keyed by a hash of address, lines (SKU/tax code, quantity, price) and customer exemption; call only when cart or address changes.',
    'Fallback: rate table by ZIP/jurisdiction (refreshed periodically) used when the engine times out; orders flagged and re-taxed/committed later.',
    'Partial shipments, returns and cancellations become adjustments/refund transactions in the engine and matching ERP entries.',
    'Monthly (and daily) reconciliation of committed tax in the engine vs ERP postings by order.',
  ],
  solution: `
**API design.**
- **Tax System API**: wraps the engine (estimate, commit, adjust, void, refund), handles auth, timeouts, retries.
- **Tax Process API**: business rules — line mapping, tax codes, exemption lookup, caching, fallback.
- Called by the **cart/checkout** service (estimates) and **order management** (commit and lifecycle).

**Estimate vs commit.** Cart and checkout use *estimate* (not recorded for filing). The order is **committed once**, at payment capture or shipment depending on the state rules finance chooses. It uses the **order ID as the document code**, so a retried commit is recognised as the same transaction instead of a duplicate.

**Reducing calls.**
- Only re-estimate when something tax-relevant changes: ship-to address, items, quantities, prices, discounts, shipping fee.
- **Cache** estimates with key = hash(ship-to ZIP+4/address, line tax codes, quantities, amounts, customer exemption ID), TTL e.g. 30 minutes. Many carts are identical or reloaded repeatedly.
- Don't call on cart page if no ship-to address is known (show "calculated at checkout") — a product decision that removes a large share of calls.
- Address validation once per address (cached), not per call.

This can cut volume by a large factor — measure in load test and production.

**Fallback strategy.** Timeout ~1 s on estimates. If the engine fails or the circuit is open, use a **fallback rate table** (combined rate by ZIP code, refreshed weekly from the engine's rate export) and flag the order \`taxSource=FALLBACK\`. Flagged orders are **re-calculated and committed** asynchronously when the engine returns; differences are usually absorbed by the business (agreed policy) rather than charging the customer again.

**Post-order lifecycle.**
- Partial shipment (if tax is committed at shipment) → commit per shipment.
- Return/refund → refund/return transaction referencing the original document.
- Cancellation before commit → nothing; after commit → void/adjust.

Each lifecycle event comes from order management via a queue, processed idempotently (event ID).

**ERP and reconciliation.** The order's committed tax goes to NetSuite with the order (tax lines by jurisdiction). A daily job compares tax committed in the engine vs posted in ERP by order ID; mismatches go to a finance report. Month-end the engine's filing reports should equal ERP liability.

**Exemptions.** B2B exemption certificates are managed in the engine's certificate store (or ERP) and referenced by customer code in each call.
`,
  followUps: [
    { q: 'Is caching tax estimates legally risky?', a: 'Estimates are not filed; the committed transaction is calculated fresh at commit time. Keep the TTL short and invalidate on rate changes so customers rarely see a different amount.' },
    { q: 'Why commit through Mule and not directly from the ERP?', a: 'Either can work; the key is exactly one system commits. If the ERP has a native tax-engine integration, it may be the better commit point, with Mule only handling estimates at checkout.' },
  ],
}

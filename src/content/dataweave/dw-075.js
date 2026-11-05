export default {
  id: 'dw-075',
  category: 'dataweave',
  title: 'Enrich API Orders with an XML Product Master Lookup',
  level: 'EXPERT',
  tags: ['json', 'xml', 'lookup', 'multiple-inputs', 'recursion', 'effective-dating', 'file', 'rounding'],
  estMinutes: 45,
  description: `
An order API (\`payload\`, JSON) sends web-shop orders to Mule. The flow enriches each order before it goes to the invoicing system.

Prices and product data are **not** in the order. They come from a product master XML file that the ERP drops on a shared folder every night. The flow reads it with \`file:read\` into the variable \`productMaster\` (in the playground: the input \`productMaster\`; in the flow: \`vars.productMaster\`).

**Product master**
- \`product\` elements keyed by the \`sku\` attribute.
- A discontinued product has \`<replacedBy>\` with its successor SKU. Successors can themselves be replaced (a chain).
- \`prices\` holds \`price\` elements with \`validFrom\` and an optional \`validTo\` (both inclusive).

**Rules for each order line**
1. Resolve the ordered SKU through the \`replacedBy\` chain to the current SKU. Follow at most **5** replacements; a longer chain is treated as a loop.
2. The unit price is the price valid on the order's \`orderDate\`; if several are valid, the one with the latest \`validFrom\` wins.
3. \`netAmount = qty * unitPrice\`, \`vatAmount = netAmount * vatRate / 100\` rounded to 2 decimals, \`grossAmount = netAmount + vatAmount\`.
4. A line that cannot be priced is **not** an error for the whole order. It goes to \`unmatched\` with \`reason\`:
   - \`UNKNOWN_SKU\`: the SKU or a successor is not in the file
   - \`REPLACEMENT_LOOP\`: more than 5 replacements
   - \`NO_PRICE\`: no price valid on the order date

**Output**
- \`orderId\`, \`orderDate\`, \`currency\`
- \`lines\` (priced lines in input order) with \`lineId\`, \`orderedSku\`, \`sku\`, \`substituted\`, \`description\`, \`qty\`, \`unitPrice\`, \`vatRate\`, \`netAmount\`, \`vatAmount\`, \`grossAmount\`
- \`unmatched\` (\`lineId\`, \`sku\` as ordered, \`reason\`)
- \`totals\` (\`net\`, \`vat\`, \`gross\`) over the priced lines
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "orderId": "WEB-884120",
  "orderDate": "2026-07-03",
  "currency": "EUR",
  "lines": [
    { "lineId": 1, "sku": "LMP-100", "qty": 2 },
    { "lineId": 2, "sku": "LMP-090", "qty": 1 },
    { "lineId": 3, "sku": "CBL-005", "qty": 10 },
    { "lineId": 4, "sku": "XYZ-999", "qty": 1 },
    { "lineId": 5, "sku": "BK-200", "qty": 1 }
  ]
}`,
    },
    {
      name: 'productMaster',
      mime: 'application/xml',
      content: `<products generated="2026-07-02T23:00:00Z">
  <product sku="LMP-100">
    <description>Desk lamp LED, black</description>
    <vatRate>21</vatRate>
    <prices>
      <price validFrom="2026-01-01" validTo="2026-06-30">39.95</price>
      <price validFrom="2026-07-01">42.00</price>
    </prices>
  </product>
  <product sku="LMP-090" discontinued="true">
    <replacedBy>LMP-100</replacedBy>
  </product>
  <product sku="LMP-080" discontinued="true">
    <replacedBy>LMP-090</replacedBy>
  </product>
  <product sku="CBL-005">
    <description>USB-C cable 1 m</description>
    <vatRate>21</vatRate>
    <prices>
      <price validFrom="2026-01-01">4.99</price>
    </prices>
  </product>
  <product sku="BK-200">
    <description>Book: Enterprise Integration Patterns</description>
    <vatRate>9</vatRate>
    <prices>
      <price validFrom="2026-08-01">54.00</price>
    </prices>
  </product>
</products>`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "orderId": "WEB-884120",
  "orderDate": "2026-07-03",
  "currency": "EUR",
  "lines": [
    { "lineId": 1, "orderedSku": "LMP-100", "sku": "LMP-100", "substituted": false, "description": "Desk lamp LED, black", "qty": 2, "unitPrice": 42.00, "vatRate": 21, "netAmount": 84.00, "vatAmount": 17.64, "grossAmount": 101.64 },
    { "lineId": 2, "orderedSku": "LMP-090", "sku": "LMP-100", "substituted": true, "description": "Desk lamp LED, black", "qty": 1, "unitPrice": 42.00, "vatRate": 21, "netAmount": 42.00, "vatAmount": 8.82, "grossAmount": 50.82 },
    { "lineId": 3, "orderedSku": "CBL-005", "sku": "CBL-005", "substituted": false, "description": "USB-C cable 1 m", "qty": 10, "unitPrice": 4.99, "vatRate": 21, "netAmount": 49.90, "vatAmount": 10.48, "grossAmount": 60.38 }
  ],
  "unmatched": [
    { "lineId": 4, "sku": "XYZ-999", "reason": "UNKNOWN_SKU" },
    { "lineId": 5, "sku": "BK-200", "reason": "NO_PRICE" }
  ],
  "totals": { "net": 175.90, "vat": 36.94, "gross": 212.84 }
}`,
  },
  starterCode: `%dw 2.0
output application/json
fun round2(n) = round(n * 100) / 100
---
{
  orderId: payload.orderId,
  products: productMaster.products.*product map (p) -> p.@sku
}
`,
  hints: [
    'Index the XML **once**: `{ (productMaster.products.*product map (p) -> { (p.@sku): { ... } }) }` gives an object you can look up with `bySku[sku]` — much cheaper than a `filter` over all products for every line.',
    'Copy what you need into the index as plain values (`replacedBy`, `description`, `vatRate` as Number, and the prices as `{ from, to, amount }` with dates converted). In XML, attributes belong to the element (the key), so read them while you still have the element rather than relying on them after re-keying.',
    'Write a recursive `resolve(sku, hops)` that returns `{ sku, error }`: unknown → `UNKNOWN_SKU`, no `replacedBy` → done, `hops == 5` → `REPLACEMENT_LOOP`, else recurse with the successor.',
    'Valid price: `p.from <= d and (p.to == null or d <= p.to)`; then `orderBy $.from` and take `[-1]`.',
    'Map each line to `{ line, error }`, then split into priced lines and `unmatched` with two `filter`s.',
  ],
  solution: `%dw 2.0
output application/json
fun round2(n) = round(n * 100) / 100
var orderDate = payload.orderDate as Date
var bySku = {
  (productMaster.products.*product map (p) -> {
    (p.@sku): {
      replacedBy: p.replacedBy,
      description: p.description,
      vatRate: if (p.vatRate == null) null else p.vatRate as Number,
      prices: (p.prices.*price default []) map (pr) -> {
        from: pr.@validFrom as Date,
        to: if (pr.@validTo == null) null else pr.@validTo as Date,
        amount: pr as Number
      }
    }
  })
}
fun resolve(sku, hops) = do {
  var prod = bySku[sku]
  ---
  if (prod == null) { sku: sku, error: "UNKNOWN_SKU" }
  else if (prod.replacedBy == null) { sku: sku, error: null }
  else if (hops >= 5) { sku: sku, error: "REPLACEMENT_LOOP" }
  else resolve(prod.replacedBy, hops + 1)
}
fun priceOn(prod, d) =
  ((prod.prices filter (pr) -> pr.from <= d and (pr.to == null or d <= pr.to)) orderBy $.from)[-1]
var evaluated = (payload.lines default []) map (l) -> do {
  var r = resolve(l.sku, 0)
  var prod = bySku[r.sku]
  var price = if (r.error == null) priceOn(prod, orderDate) else null
  var error = if (r.error != null) r.error else if (price == null) "NO_PRICE" else null
  var net = if (error == null) l.qty * price.amount else 0
  var vat = if (error == null) round2(net * prod.vatRate / 100) else 0
  ---
  {
    error: error,
    line: {
      lineId: l.lineId,
      orderedSku: l.sku,
      sku: r.sku,
      substituted: r.sku != l.sku,
      description: prod.description,
      qty: l.qty,
      unitPrice: price.amount,
      vatRate: prod.vatRate,
      netAmount: net,
      vatAmount: vat,
      grossAmount: net + vat
    }
  }
}
var priced = (evaluated filter ($.error == null)) map $.line
var totalNet = sum(priced map $.netAmount)
var totalVat = sum(priced map $.vatAmount)
---
{
  orderId: payload.orderId,
  orderDate: payload.orderDate,
  currency: payload.currency,
  lines: priced,
  unmatched: (evaluated filter ($.error != null)) map (e) -> { lineId: e.line.lineId, sku: e.line.orderedSku, reason: e.error },
  totals: { net: totalNet, vat: totalVat, gross: totalNet + totalVat }
}`,
  explanation: `
**Two sources, one lookup.** The order (JSON from HTTP) and the product master (XML from a file) are joined on SKU. Turning the XML into a keyed object once — \`{ (array of { (sku): data }) }\` — makes every lookup a key access. Filtering the product list per line would be O(lines × products), which hurts with a 50,000-product master file.

**Normalise while indexing.** The index holds plain DataWeave values: numbers, \`Date\`s and a list of \`{ from, to, amount }\`. Attributes are read while the XML element is still at hand; after that the rest of the script never deals with XML again, and the price check is a simple date comparison.

**Recursion with a guard.** \`resolve\` follows \`replacedBy\` one hop at a time (LMP-080 → LMP-090 → LMP-100). Master data does contain cycles (A replaced by B, B by A) after manual edits; without the hop limit the script would recurse until it fails. Returning \`{ sku, error }\` instead of throwing lets each line fail on its own.

**Effective dating.** Prices change over time; the order date — not "today" — selects the price, so an order created on 30 June and processed on 1 July still gets the June price. Sorting the valid prices by \`validFrom\` and taking the last one resolves overlaps deterministically.

**Partial success.** An unknown SKU should not block the other lines from being invoiced. Separating priced lines and \`unmatched\` lets the flow invoice what it can and send the rest to a work queue for the master data team.

**Rounding.** VAT is rounded per line (as on the invoice) and the totals are sums of the rounded line values, so the invoice adds up.
`,
  tests: [
    {
      name: 'Two-hop replacement and first-half price',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "orderId": "WEB-870001", "orderDate": "2026-06-30", "currency": "EUR", "lines": [ { "lineId": 1, "sku": "LMP-080", "qty": 3 } ] }',
        },
        {
          name: 'productMaster',
          mime: 'application/xml',
          content:
            '<products><product sku="LMP-100"><description>Desk lamp LED, black</description><vatRate>21</vatRate><prices><price validFrom="2026-01-01" validTo="2026-06-30">39.95</price><price validFrom="2026-07-01">42.00</price></prices></product><product sku="LMP-090" discontinued="true"><replacedBy>LMP-100</replacedBy></product><product sku="LMP-080" discontinued="true"><replacedBy>LMP-090</replacedBy></product></products>',
        },
      ],
      expected:
        '{ "orderId": "WEB-870001", "orderDate": "2026-06-30", "currency": "EUR", "lines": [ { "lineId": 1, "orderedSku": "LMP-080", "sku": "LMP-100", "substituted": true, "description": "Desk lamp LED, black", "qty": 3, "unitPrice": 39.95, "vatRate": 21, "netAmount": 119.85, "vatAmount": 25.17, "grossAmount": 145.02 } ], "unmatched": [], "totals": { "net": 119.85, "vat": 25.17, "gross": 145.02 } }',
    },
    {
      name: 'Replacement loop, broken chain and overlapping prices',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "orderId": "WEB-870002", "orderDate": "2026-09-15", "currency": "EUR", "lines": [ { "lineId": 1, "sku": "A-1", "qty": 1 }, { "lineId": 2, "sku": "OLD-7", "qty": 1 }, { "lineId": 3, "sku": "MUG-01", "qty": 4 } ] }',
        },
        {
          name: 'productMaster',
          mime: 'application/xml',
          content:
            '<products><product sku="A-1"><replacedBy>B-1</replacedBy></product><product sku="B-1"><replacedBy>A-1</replacedBy></product><product sku="OLD-7"><replacedBy>NEW-7</replacedBy></product><product sku="MUG-01"><description>Coffee mug</description><vatRate>21</vatRate><prices><price validFrom="2026-01-01">6.50</price><price validFrom="2026-09-01" validTo="2026-09-30">5.00</price></prices></product></products>',
        },
      ],
      expected:
        '{ "orderId": "WEB-870002", "orderDate": "2026-09-15", "currency": "EUR", "lines": [ { "lineId": 3, "orderedSku": "MUG-01", "sku": "MUG-01", "substituted": false, "description": "Coffee mug", "qty": 4, "unitPrice": 5.00, "vatRate": 21, "netAmount": 20.00, "vatAmount": 4.20, "grossAmount": 24.20 } ], "unmatched": [ { "lineId": 1, "sku": "A-1", "reason": "REPLACEMENT_LOOP" }, { "lineId": 2, "sku": "OLD-7", "reason": "UNKNOWN_SKU" } ], "totals": { "net": 20.00, "vat": 4.20, "gross": 24.20 } }',
    },
  ],
  followUps: [
    {
      q: 'The product master is 80 MB and the API handles 20 orders per second. Is reading the file on every request acceptable?',
      a: 'No: parsing it per request costs CPU, memory and file I/O for every order. Load it once when the file arrives (file listener or scheduler), build the SKU index and store it in an Object Store or cache. Or better, load it into a database table and look up only the SKUs of the order.',
    },
    {
      q: 'Why return `unmatched` instead of raising an error for the order?',
      a: 'It is a business decision, but in most order-to-cash flows a data problem in one line should not stop the rest. The response tells the caller exactly which lines failed and why, and the flow can route them to a review queue while the priced lines are invoiced.',
    },
  ],
}

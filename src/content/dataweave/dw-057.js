export default {
  id: 'dw-057',
  category: 'dataweave',
  title: 'Three-Way Match of PO, Goods Receipts and Supplier Invoice',
  level: 'ADVANCED',
  tags: ['supply-chain', 'invoice-matching', 'three-way-match', 'lookup', 'multiple-inputs', 'tolerance'],
  estMinutes: 35,
  description: `
Accounts payable only pays a supplier invoice when it agrees with what was **ordered** and what was **received** — the classic **3-way match**. You get three inputs:

- \`payload\`: the supplier invoice (\`invoiceNo\`, \`poNumber\`, \`lines\` with \`poLine\`, \`qty\`, \`unitPrice\`)
- \`po\`: the purchase order (\`lines\` with \`line\`, \`sku\`, \`qty\`, \`unitPrice\`)
- \`receipts\`: goods receipts from the warehouse; a PO line can be received across **several** receipts

**Checks per invoice line**, producing a list of \`exceptions\` (in this order):
1. No PO line with that number → \`["NO_PO_LINE"]\` and no other checks.
2. \`QTY_EXCEEDS_RECEIPT\` when invoiced \`qty\` is greater than the **total received** for that PO line (0 if never received).
3. \`PRICE_VARIANCE\` when the invoice price is **more than 2 %** above the PO price. Invoicing below the PO price is fine.

**Output**
- \`invoiceNo\`
- \`lines\`: \`poLine\`, \`sku\`, \`invoicedQty\`, \`receivedQty\`, \`poPrice\`, \`invoicePrice\`, \`priceVariancePct\` (\`(invoice − po) / po × 100\`, rounded to 2 decimals), \`exceptions\`. Fields that cannot be known (no PO line) are \`null\`.
- \`invoiceTotal\`: Σ \`qty × unitPrice\` over all invoice lines
- \`matchedAmount\`: the same sum over lines **without** exceptions
- \`status\`: \`MATCHED\` when no line has exceptions, otherwise \`ON_HOLD\`
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "invoiceNo": "INV-77",
  "poNumber": "PO-900",
  "lines": [
    { "poLine": 1, "qty": 100, "unitPrice": 10.15 },
    { "poLine": 2, "qty": 50, "unitPrice": 4.12 },
    { "poLine": 3, "qty": 20, "unitPrice": 25 },
    { "poLine": 4, "qty": 1, "unitPrice": 9 }
  ]
}`,
    },
    {
      name: 'po',
      mime: 'application/json',
      content: `{
  "poNumber": "PO-900",
  "lines": [
    { "line": 1, "sku": "SKU-A", "qty": 100, "unitPrice": 10.00 },
    { "line": 2, "sku": "SKU-B", "qty": 50, "unitPrice": 4.00 },
    { "line": 3, "sku": "SKU-C", "qty": 20, "unitPrice": 25.00 }
  ]
}`,
    },
    {
      name: 'receipts',
      mime: 'application/json',
      content: `[
  { "grNo": "GR-1", "lines": [ { "poLine": 1, "qtyReceived": 60 }, { "poLine": 2, "qtyReceived": 50 } ] },
  { "grNo": "GR-2", "lines": [ { "poLine": 1, "qtyReceived": 40 } ] }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "invoiceNo": "INV-77",
  "lines": [
    { "poLine": 1, "sku": "SKU-A", "invoicedQty": 100, "receivedQty": 100, "poPrice": 10.00, "invoicePrice": 10.15, "priceVariancePct": 1.5, "exceptions": [] },
    { "poLine": 2, "sku": "SKU-B", "invoicedQty": 50, "receivedQty": 50, "poPrice": 4.00, "invoicePrice": 4.12, "priceVariancePct": 3, "exceptions": ["PRICE_VARIANCE"] },
    { "poLine": 3, "sku": "SKU-C", "invoicedQty": 20, "receivedQty": 0, "poPrice": 25.00, "invoicePrice": 25, "priceVariancePct": 0, "exceptions": ["QTY_EXCEEDS_RECEIPT"] },
    { "poLine": 4, "sku": null, "invoicedQty": 1, "receivedQty": 0, "poPrice": null, "invoicePrice": 9, "priceVariancePct": null, "exceptions": ["NO_PO_LINE"] }
  ],
  "invoiceTotal": 1730,
  "matchedAmount": 1015,
  "status": "ON_HOLD"
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  invoiceNo: payload.invoiceNo,
  lines: payload.lines
}
`,
  hints: [
    'Build two lookups keyed by PO line number (as a string): PO lines with `groupBy`, and received quantity with `receipts flatMap $.lines` → `groupBy` → `mapObject` to a sum.',
    'Decide "price too high" on the **unrounded** variance; round only for the output field: `round(x * 100) / 100`.',
    'Concatenate conditional one-element arrays: `(if (a) ["X"] else []) ++ (if (b) ["Y"] else [])`. Then reuse `isEmpty(l.exceptions)` for `matchedAmount` and `status`.',
  ],
  solution: `%dw 2.0
import every from dw::core::Arrays
output application/json

var tolerancePct = 2

var poLines = po.lines groupBy ($.line as String)

var receivedByLine = (receipts flatMap ($.lines default []))
  groupBy ($.poLine as String)
  mapObject (rows, key) -> { (key): sum(rows.qtyReceived) }

var lines = payload.lines map (il) -> do {
  var key = il.poLine as String
  var pl = poLines[key][0]
  var received = receivedByLine[key] default 0
  var variance = if (pl == null) null else (il.unitPrice - pl.unitPrice) / pl.unitPrice * 100
  var exceptions =
    if (pl == null) ["NO_PO_LINE"]
    else (if (il.qty > received) ["QTY_EXCEEDS_RECEIPT"] else [])
      ++ (if (variance > tolerancePct) ["PRICE_VARIANCE"] else [])
  ---
  {
    poLine: il.poLine,
    sku: pl.sku,
    invoicedQty: il.qty,
    receivedQty: received,
    poPrice: pl.unitPrice,
    invoicePrice: il.unitPrice,
    priceVariancePct: if (variance == null) null else round(variance * 100) / 100,
    exceptions: exceptions
  }
}

fun amount(ls) = sum(ls map ($.invoicedQty * $.invoicePrice))
---
{
  invoiceNo: payload.invoiceNo,
  lines: lines,
  invoiceTotal: amount(lines),
  matchedAmount: amount(lines filter (isEmpty($.exceptions))),
  status: if (lines every (isEmpty($.exceptions))) "MATCHED" else "ON_HOLD"
}`,
  explanation: `
The match is three joins on the PO line number, so the first job is to build **lookups** rather than search arrays per line:

- \`poLines\`: \`{ "1": [ {...} ], "2": [ ... ] }\` from \`groupBy\`.
- \`receivedByLine\`: receipts flattened with \`flatMap\`, grouped by line, then \`mapObject\` turns each group into its total — \`{ "1": 100, "2": 50 }\`. Line 3 is absent, hence \`default 0\`.

Keys are converted to strings because object keys are always strings; \`poLines[1]\` would be an index access, not a key lookup.

**Tolerance**: the variance is computed unrounded and compared with \`> 2\`, so exactly 2 % passes and 2.004 % fails. Rounding first would quietly widen the tolerance. Only increases are checked — a supplier that bills less is not blocked.

**Missing PO line**: \`pl\` is \`null\`, and \`null.sku\` / \`null.unitPrice\` are simply \`null\` in DataWeave, so the output record needs no special case.

\`every\` (imported from \`dw::core::Arrays\`) gives the header status; an empty invoice would count as \`MATCHED\`, which is worth raising with the business.

Common traps:
- Using only the **first** receipt for line 1 (60) and flagging a quantity exception that does not exist.
- Taking the absolute variance and blocking under-billing.
- Comparing \`variance > 0.02\` when the variance was computed as a percentage.
`,
  tests: [
    {
      name: 'Exactly at tolerance, under-billed, split receipt: MATCHED',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "invoiceNo": "INV-80", "poNumber": "PO-1", "lines": [ { "poLine": 1, "qty": 30, "unitPrice": 10.20 }, { "poLine": 2, "qty": 5, "unitPrice": 3.80 } ] }',
        },
        {
          name: 'po',
          mime: 'application/json',
          content: '{ "poNumber": "PO-1", "lines": [ { "line": 1, "sku": "X", "qty": 30, "unitPrice": 10 }, { "line": 2, "sku": "Y", "qty": 5, "unitPrice": 4 } ] }',
        },
        {
          name: 'receipts',
          mime: 'application/json',
          content: '[ { "grNo": "G1", "lines": [ { "poLine": 1, "qtyReceived": 10 } ] }, { "grNo": "G2", "lines": [ { "poLine": 1, "qtyReceived": 20 }, { "poLine": 2, "qtyReceived": 5 } ] }, { "grNo": "G3" } ]',
        },
      ],
      expected: `{
  "invoiceNo": "INV-80",
  "lines": [
    { "poLine": 1, "sku": "X", "invoicedQty": 30, "receivedQty": 30, "poPrice": 10, "invoicePrice": 10.20, "priceVariancePct": 2, "exceptions": [] },
    { "poLine": 2, "sku": "Y", "invoicedQty": 5, "receivedQty": 5, "poPrice": 4, "invoicePrice": 3.80, "priceVariancePct": -5, "exceptions": [] }
  ],
  "invoiceTotal": 325,
  "matchedAmount": 325,
  "status": "MATCHED"
}`,
    },
  ],
  followUps: [
    {
      q: 'The supplier sends a second invoice for the same PO line. What is missing from this logic?',
      a: 'Previously invoiced quantity. The real check is invoiced-to-date plus this invoice versus received-to-date, so the matcher needs the invoice history (usually from the ERP) as a fourth input.',
    },
    {
      q: 'Where would this run in a Mule architecture?',
      a: 'Often in a process API triggered by the invoice arriving (EDI 810, e-invoice or OCR output). It fetches the PO and receipts from the ERP, runs the match, and posts either a matched invoice or an invoice on hold with the reason codes. Many ERPs (SAP, Oracle) can match natively, so do it in the integration only when the ERP cannot.',
    },
    {
      q: 'Why keep the tolerance in a variable rather than inline?',
      a: 'Tolerances differ per supplier, category or currency and change without code releases. In a real project it comes from configuration (properties, a policy table or the supplier master) and is passed in as an input.',
    },
  ],
}

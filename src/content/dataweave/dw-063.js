export default {
  id: 'dw-063',
  category: 'dataweave',
  title: 'Store Stock Count Variance Report as CSV',
  level: 'INTERMEDIATE',
  tags: ['retail', 'inventory', 'csv', 'groupBy', 'distinctBy', 'full-outer-join', 'number-formatting'],
  estMinutes: 25,
  description: `
A store does a cycle count with handheld scanners. Produce the variance report the store manager must sign off before the counts are posted to the ERP.

**Inputs**
- \`payload\` (CSV): the scanner export, with one row per **location** where a SKU was counted. The same SKU can be on the shop floor and in the backroom.
- \`systemStock\` (JSON): the merchandise system's stock for the counted range.

**Rules**
- \`CountedQty\` of a SKU is the **sum** of all its scanner rows.
- Every SKU from either side is considered:
  - In the system but without any scanner row: \`CountedQty\` \`0\`, status \`NOT_COUNTED\`.
  - Scanned but unknown to the system: \`SystemQty\` \`0\`, empty \`Description\`, empty \`VarianceValue\`, status \`UNKNOWN_SKU\`.
  - Otherwise \`MATCH\` (variance 0), \`OVER\` (counted more) or \`SHORT\` (counted less). A SKU scanned with \`0\` **was** counted, so it is \`SHORT\`, not \`NOT_COUNTED\`.
- \`Variance\` = \`CountedQty - SystemQty\`; \`VarianceValue\` = \`Variance * unitCost\` formatted with exactly two decimals.
- \`MATCH\` rows are **not** written. The remaining rows are sorted by \`SKU\` ascending.
- Header: \`SKU,Description,SystemQty,CountedQty,Variance,VarianceValue,Status\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/csv',
      content: `location,sku,counted
SHELF-A1,100234,12
BACK-01,100234,6
SHELF-A2,100567,3
SHELF-A3,100890,20
SHELF-B1,999001,4
BACK-02,100567,0`,
    },
    {
      name: 'systemStock',
      mime: 'application/json',
      content: `[
  { "sku": "100234", "description": "Ceramic Mug 350ml", "onHand": 20, "unitCost": 2.75 },
  { "sku": "100567", "description": "Tea Towel Stripe", "onHand": 3, "unitCost": 1.90 },
  { "sku": "100890", "description": "Glass Tumbler", "onHand": 18, "unitCost": 1.25 },
  { "sku": "100912", "description": "Bamboo Tray", "onHand": 5, "unitCost": 6.40 }
]`,
    },
  ],
  expected: {
    mime: 'application/csv',
    content: `SKU,Description,SystemQty,CountedQty,Variance,VarianceValue,Status
100234,Ceramic Mug 350ml,20,18,-2,-5.50,SHORT
100890,Glass Tumbler,18,20,2,2.50,OVER
100912,Bamboo Tray,5,0,-5,-32.00,NOT_COUNTED
999001,,0,4,4,,UNKNOWN_SKU`,
  },
  starterCode: `%dw 2.0
output application/csv
---
payload
`,
  hints: [
    'Build two lookups keyed by SKU: the summed counts (`groupBy $.sku` then `mapObject`) and the system items (`systemStock groupBy $.sku`).',
    'The list of SKUs to report is the union of both sides: `(systemStock.sku ++ payload.sku) distinctBy $`. Remember that `.sku` on an empty array is `null`, not `[]`.',
    'CSV values arrive as strings: `"12" + "6"` fails — use `as Number`.',
    'Decide "not counted" by whether the SKU has a scanner row at all (`counted[sku] == null`), not by whether the sum is `0`.',
    '`(v * cost) as String {format: "0.00"}` gives `-32.00`; a `null` value is written as an empty CSV field.',
  ],
  solution: `%dw 2.0
output application/csv
var counted = (payload groupBy $.sku) mapObject (rows, sku) -> { (sku): sum(rows map ($.counted as Number)) }
var system = systemStock groupBy $.sku
var skus = ((systemStock.sku default []) ++ (payload.sku default [])) distinctBy $
---
((skus orderBy $) map (sku) -> do {
  var item = system[sku][0]
  var cnt = counted[sku]
  var sysQty = item.onHand default 0
  var v = (cnt default 0) - sysQty
  ---
  {
    SKU: sku,
    Description: item.description,
    SystemQty: sysQty,
    CountedQty: cnt default 0,
    Variance: v,
    VarianceValue: if (item == null) null else (v * item.unitCost) as String {format: "0.00"},
    Status:
      if (item == null) "UNKNOWN_SKU"
      else if (cnt == null) "NOT_COUNTED"
      else if (v == 0) "MATCH"
      else if (v > 0) "OVER"
      else "SHORT"
  }
}) filter ($.Status != "MATCH")`,
  explanation: `
This is a **full outer join** on SKU with an aggregation on one side.

**Aggregate the counts first.** \`groupBy $.sku\` + \`mapObject\` gives \`{ "100234": 18, "100567": 3, ... }\`. Summing per location before joining is essential: joining row by row would compare 12 and 6 separately against 20 and report two false variances.

**Union of keys.** \`distinctBy $\` on the concatenated SKU lists gives every SKU exactly once, from either side. The \`default []\` guards matter: \`payload.sku\` on an empty CSV is \`null\`, and \`[...] ++ null\` fails.

**Null means "absent".** \`counted[sku]\` is \`null\` only when the SKU has no scanner row. A row with \`0\` sums to \`0\`, which is a real count — in a store, "I looked and there are none" (SHORT, an inventory loss) is very different from "nobody counted this location" (NOT_COUNTED, a recount task).

**CSV output.** The writer takes the header from the keys of the first row, so every row must have the same keys in the same order — that is why \`Description\` and \`VarianceValue\` are present as \`null\` rather than omitted. \`null\` is written as an empty field.

**Formatting.** \`as String {format: "0.00"}\` always prints two decimals (\`-32.00\`, \`2.50\`). A plain number keeps whatever scale the arithmetic happened to produce (\`-2 * 4.5\` is written as \`-9\`), so two decimals are not guaranteed without it.

**Precedence.** \`(skus orderBy $) map ...\` needs the parentheses — written without them, \`orderBy $ map ...\` would put the \`map\` inside the \`orderBy\` lambda.
`,
  tests: [
    {
      name: 'Counted zero is SHORT and multi-location matches drop out',
      inputs: [
        {
          name: 'payload',
          mime: 'application/csv',
          content: 'location,sku,counted\nSHELF-1,200001,0\nSHELF-2,200002,4\nBACK-1,200002,5\nTOP-1,200002,1',
        },
        {
          name: 'systemStock',
          mime: 'application/json',
          content:
            '[ { "sku": "200001", "description": "Plant Pot Small", "onHand": 7, "unitCost": 0.85 }, { "sku": "200002", "description": "Plant Pot Large", "onHand": 10, "unitCost": 2.10 } ]',
        },
      ],
      expected: `SKU,Description,SystemQty,CountedQty,Variance,VarianceValue,Status
200001,Plant Pot Small,7,0,-7,-5.95,SHORT`,
    },
    {
      name: 'Nothing scanned',
      inputs: [
        { name: 'payload', mime: 'application/csv', content: 'location,sku,counted' },
        {
          name: 'systemStock',
          mime: 'application/json',
          content: '[ { "sku": "300001", "description": "Doormat", "onHand": 2, "unitCost": 4.5 } ]',
        },
      ],
      expected: `SKU,Description,SystemQty,CountedQty,Variance,VarianceValue,Status
300001,Doormat,2,0,-2,-9.00,NOT_COUNTED`,
    },
  ],
  followUps: [
    {
      q: 'Store managers complain about large variances caused by sales during the count. How would you deal with that?',
      a: 'Snapshot the system stock at the start of the count (or freeze the location) and adjust for POS sales and receipts posted between the snapshot and the scan time. The integration can pull the movements for the counted SKUs and correct `SystemQty` before comparing.',
    },
    {
      q: 'How would you add a tolerance so that a variance of 1 on cheap items is auto-accepted?',
      a: 'Add a rule such as `abs(VarianceValue) < 5 and abs(Variance) <= 1` → status `WITHIN_TOLERANCE`, and filter those out like MATCH (or send them in a separate auto-approve file). Keep the thresholds in configuration because loss prevention changes them.',
    },
    {
      q: 'The approved counts must be posted to SAP. What would you send?',
      a: 'A physical inventory posting, e.g. via the standard BAPIs or an IDoc for counts per plant/storage location, containing the counted quantity per material. SAP computes and posts the difference itself; sending the variance instead of the count would double-apply sales that happened in between.',
    },
  ],
}

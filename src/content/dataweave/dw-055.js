export default {
  id: 'dw-055',
  category: 'dataweave',
  title: 'Suggest Replenishment Orders from Reorder Points',
  level: 'INTERMEDIATE',
  tags: ['supply-chain', 'inventory', 'replenishment', 'lookup', 'groupBy', 'ceil'],
  estMinutes: 25,
  description: `
Every night the inventory positions per SKU and distribution centre are pulled from the WMS (\`payload\`) and the replenishment policies from the planning system (the \`policies\` input). Build the list of suggested purchase quantities for the buyers.

**Per inventory row**
- \`projected = onHand - allocated + onOrder\`
- Replenish when \`projected <= reorderPoint\`.
- Suggested quantity:
  1. \`need = maxLevel - projected\`
  2. round **up** to a whole number of cases (\`casePack\`)
  3. if the result is below the minimum order quantity \`moq\`, use \`moq\`

Policies are per **SKU** (they apply to every location).

**Output**
- \`suggestions\`: \`sku\`, \`location\`, \`projected\`, \`orderQty\` — sorted by \`sku\`, then \`location\`.
- \`noPolicy\`: SKUs that have inventory rows but no policy — each SKU **once**, sorted.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "sku": "SKU-20", "location": "DC1", "onHand": 5, "allocated": 5, "onOrder": 10 },
  { "sku": "SKU-10", "location": "DC2", "onHand": 100, "allocated": 10, "onOrder": 0 },
  { "sku": "SKU-10", "location": "DC1", "onHand": 40, "allocated": 15, "onOrder": 0 },
  { "sku": "SKU-30", "location": "DC1", "onHand": 0, "allocated": 0, "onOrder": 0 },
  { "sku": "SKU-40", "location": "DC1", "onHand": 8, "allocated": 2, "onOrder": 0 }
]`,
    },
    {
      name: 'policies',
      mime: 'application/json',
      content: `[
  { "sku": "SKU-10", "reorderPoint": 30, "maxLevel": 120, "casePack": 12, "moq": 24 },
  { "sku": "SKU-20", "reorderPoint": 10, "maxLevel": 30, "casePack": 6, "moq": 36 },
  { "sku": "SKU-40", "reorderPoint": 5, "maxLevel": 20, "casePack": 1, "moq": 1 }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "suggestions": [
    { "sku": "SKU-10", "location": "DC1", "projected": 25, "orderQty": 96 },
    { "sku": "SKU-20", "location": "DC1", "projected": 10, "orderQty": 36 }
  ],
  "noPolicy": ["SKU-30"]
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  suggestions: payload,
  noPolicy: []
}
`,
  hints: [
    'Build a lookup once: `var bySku = policies groupBy $.sku`, then `bySku[row.sku][0]` is the policy or `null`.',
    'Rounding up to a case: `ceil(need / casePack) * casePack`. For the minimum: `max([rounded, moq])`.',
    '`distinctBy $` removes duplicate SKUs from `noPolicy`.',
  ],
  solution: `%dw 2.0
output application/json

var bySku = policies groupBy $.sku

var evaluated = payload map (row) -> do {
  var policy = bySku[row.sku][0]
  var projected = row.onHand - row.allocated + row.onOrder
  ---
  {
    sku: row.sku,
    location: row.location,
    policy: policy,
    projected: projected
  }
}

fun orderQty(e) = do {
  var p = e.policy
  var cases = ceil((p.maxLevel - e.projected) / p.casePack) * p.casePack
  ---
  max([cases, p.moq])
}
---
{
  suggestions: evaluated
    filter ($.policy != null and $.projected <= $.policy.reorderPoint)
    orderBy ($.sku ++ "|" ++ $.location)
    map (e) -> {
      sku: e.sku,
      location: e.location,
      projected: e.projected,
      orderQty: orderQty(e)
    },
  noPolicy: (evaluated filter ($.policy == null) map $.sku)
    distinctBy $
    orderBy $
}`,
  explanation: `
Worked numbers for the sample:

| Row | projected | reorder? | need | cases | after MOQ |
|---|---|---|---|---|---|
| SKU-10 / DC1 | 40 − 15 + 0 = 25 | 25 ≤ 30 ✔ | 95 | ⌈95/12⌉ × 12 = 96 | 96 |
| SKU-10 / DC2 | 90 | ✘ | | | |
| SKU-20 / DC1 | 5 − 5 + 10 = 10 | 10 ≤ 10 ✔ | 20 | ⌈20/6⌉ × 6 = 24 | 36 |
| SKU-40 / DC1 | 6 | 6 > 5 ✘ | | | |

- The **lookup** (\`groupBy\` once, key access per row) keeps this linear even with tens of thousands of positions.
- \`onOrder\` counts toward the position — otherwise every night re-orders stock that is already on its way.
- \`ceil\` rounds up. \`round\` happens to give 8 cases for 95/12 = 7.9, but would turn 7.2 cases into 7 and leave the location below its max level.
- The comparison is \`<=\`, so SKU-20 sitting exactly at its reorder point is replenished.
- A negative \`projected\` (more allocated than on hand) is valid — it means backorders — and simply increases the need.

Common traps:
- Sorting by \`sku\` only — DC order then depends on input order.
- Listing SKU-30 once per location in \`noPolicy\`.
`,
  tests: [
    {
      name: 'Negative projection and a missing policy at two locations',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: `[
  { "sku": "B", "location": "DC2", "onHand": 2, "allocated": 10, "onOrder": 0 },
  { "sku": "Z", "location": "DC2", "onHand": 1, "allocated": 0, "onOrder": 0 },
  { "sku": "Z", "location": "DC1", "onHand": 1, "allocated": 0, "onOrder": 0 },
  { "sku": "A", "location": "DC9", "onHand": 0, "allocated": 0, "onOrder": 0 }
]`,
        },
        {
          name: 'policies',
          mime: 'application/json',
          content: '[{ "sku": "B", "reorderPoint": 0, "maxLevel": 10, "casePack": 5, "moq": 0 }]',
        },
      ],
      expected:
        '{ "suggestions": [ { "sku": "B", "location": "DC2", "projected": -8, "orderQty": 20 } ], "noPolicy": ["A", "Z"] }',
    },
  ],
  followUps: [
    {
      q: 'Where do these suggestions go next?',
      a: 'Typically into the ERP as purchase requisitions (for example via a BAPI or IDoc in SAP, or an interface table/REST API in Oracle Fusion), where buyers convert them into POs. Sending requisitions rather than POs keeps humans in control of supplier choice and price.',
    },
    {
      q: 'Inventory comes from the WMS every 15 minutes, but policies change weekly. How would you cache the policies?',
      a: 'Load them into an object store or a cache scope keyed by a version or date, and refresh on a schedule or on a change event. The DataWeave stays the same because `policies` is just another input.',
    },
    {
      q: 'How would you avoid ordering the same quantity again tomorrow if the PO is not yet in onOrder?',
      a: 'Include open requisitions in the projected position (or add them to onOrder) and make the suggestion idempotent per SKU, location and planning date so a rerun updates rather than duplicates.',
    },
  ],
}

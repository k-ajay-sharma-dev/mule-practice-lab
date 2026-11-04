export default {
  id: 'dw-016',
  category: 'dataweave',
  title: 'Regional Sales KPIs with countBy and sumBy',
  level: 'INTERMEDIATE',
  tags: ['groupBy', 'countBy', 'sumBy', 'arrays-module', 'json'],
  estMinutes: 20,
  description: `
The order service exports a day of orders. The sales manager wants one KPI line per region.

Each order has \`id\`, \`region\`, \`status\` (\`COMPLETED\`, \`CANCELLED\` or \`PENDING\`) and \`amount\`.

Output an array with one object per region that appears in the input, **sorted by \`region\` ascending**:

- \`region\`
- \`orderCount\` — all orders of the region, whatever their status
- \`completedCount\` — orders with status \`COMPLETED\`
- \`cancelledCount\` — orders with status \`CANCELLED\`
- \`completedRevenue\` — sum of \`amount\` over the **completed** orders only (\`0\` if none)

No orders → \`[]\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "id": 1, "region": "WEST", "status": "COMPLETED", "amount": 120.5 },
  { "id": 2, "region": "EAST", "status": "CANCELLED", "amount": 80 },
  { "id": 3, "region": "WEST", "status": "COMPLETED", "amount": 99.5 },
  { "id": 4, "region": "NORTH", "status": "PENDING", "amount": 40 },
  { "id": 5, "region": "EAST", "status": "COMPLETED", "amount": 300 },
  { "id": 6, "region": "WEST", "status": "CANCELLED", "amount": 15 }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "region": "EAST", "orderCount": 2, "completedCount": 1, "cancelledCount": 1, "completedRevenue": 300 },
  { "region": "NORTH", "orderCount": 1, "completedCount": 0, "cancelledCount": 0, "completedRevenue": 0 },
  { "region": "WEST", "orderCount": 3, "completedCount": 2, "cancelledCount": 1, "completedRevenue": 220 }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    '`payload groupBy $.region` gives an object keyed by region; `pluck` turns it back into an array.',
    '`countBy(array, (o) -> condition)` and `sumBy(array, (o) -> number)` live in `dw::core::Arrays` and must be imported.',
    'Wrap the whole `groupBy ... pluck (...) -> {...}` in parentheses before `orderBy`, or `orderBy` ends up inside the lambda.',
  ],
  solution: `%dw 2.0
import countBy, sumBy from dw::core::Arrays
output application/json
---
((payload groupBy $.region) pluck (orders, region) -> {
  region: region as String,
  orderCount: sizeOf(orders),
  completedCount: countBy(orders, (o) -> o.status == "COMPLETED"),
  cancelledCount: countBy(orders, (o) -> o.status == "CANCELLED"),
  completedRevenue: sumBy(orders filter ($.status == "COMPLETED"), (o) -> o.amount)
}) orderBy $.region`,
  explanation: `
\`countBy\` and \`sumBy\` replace the classic \`sizeOf(arr filter ...)\` and \`sum(arr filter ... map ...)\` patterns with one readable call each.

\`sumBy\` on an empty array returns \`0\` — so a region with no completed orders needs no special handling. By contrast, \`sum((orders filter ...).amount)\` would hit the empty-selector trap: \`[].amount\` is \`null\`, and \`sum(null)\` fails.

Grouping keys are \`Key\` values; \`region as String\` makes the output a plain string.
`,
  tests: [
    {
      name: 'No orders',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '[]',
    },
    {
      name: 'Single region, nothing completed',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "id": 9, "region": "SOUTH", "status": "CANCELLED", "amount": 10 }, { "id": 10, "region": "SOUTH", "status": "PENDING", "amount": 5 }]',
        },
      ],
      expected: '[{ "region": "SOUTH", "orderCount": 2, "completedCount": 0, "cancelledCount": 1, "completedRevenue": 0 }]',
    },
  ],
  followUps: [
    {
      q: 'How would you add the share of cancelled orders as a percentage with two decimals?',
      a: 'Compute `cancelledCount / orderCount * 100` and format it, e.g. `as String {format: "0.00"}`, or keep a number with `round(x * 100) / 100`. Division of two DataWeave numbers is exact decimal division, so format only at the end.',
    },
    {
      q: 'Can you do this without groupBy, in a single pass?',
      a: 'Yes, with `reduce`: accumulate an object keyed by region and update the counters per order. It is one pass, but harder to read; for daily batch sizes `groupBy` is usually the clearer choice.',
    },
  ],
}

export default {
  id: 'dw-004',
  category: 'dataweave',
  title: 'Order Summary with Line and Grand Totals',
  level: 'BEGINNER',
  tags: ['map', 'sum', 'variables', 'json'],
  estMinutes: 15,
  description: `
The checkout service sends an order with its lines. The ERP wants a summary:

- \`orderId\` and \`currency\` copied as-is
- \`lineCount\` — number of lines
- \`lines\` — each line reduced to \`sku\` and \`lineTotal\` (\`qty × unitPrice\`)
- \`orderTotal\` — sum of all line totals

An order may have **no lines**; the total must then be \`0\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "orderId": "SO-5501",
  "currency": "EUR",
  "lines": [
    { "sku": "A1", "qty": 2, "unitPrice": 9.99 },
    { "sku": "B7", "qty": 1, "unitPrice": 24.5 },
    { "sku": "C3", "qty": 3, "unitPrice": 0.75 }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "orderId": "SO-5501",
  "currency": "EUR",
  "lineCount": 3,
  "lines": [
    { "sku": "A1", "lineTotal": 19.98 },
    { "sku": "B7", "lineTotal": 24.5 },
    { "sku": "C3", "lineTotal": 2.25 }
  ],
  "orderTotal": 46.73
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Declare the transformed lines once in the header: `var lines = payload.lines map ...` so you can reuse them.',
    '`lines.lineTotal` selects every `lineTotal` from the array; `sum()` adds them.',
    'Careful: on an **empty** array, `lines.lineTotal` is `null`, not `[]` — and `sum(null)` fails. Use `default []`.',
  ],
  solution: `%dw 2.0
output application/json
var lines = payload.lines map (l) -> {
  sku: l.sku,
  lineTotal: l.qty * l.unitPrice
}
---
{
  orderId: payload.orderId,
  currency: payload.currency,
  lineCount: sizeOf(lines),
  lines: lines,
  orderTotal: sum(lines.lineTotal default [])
}`,
  explanation: `
DataWeave numbers are decimals, not floating point, so \`2 * 9.99\` is exactly \`19.98\` — no rounding surprises like in JavaScript.

The hidden test sends an order with no lines: a multi-value selector on an empty array returns \`null\`, so \`default []\` keeps \`sum\` working.
`,
  tests: [
    {
      name: 'Order without lines',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{ "orderId": "SO-1", "currency": "USD", "lines": [] }' }],
      expected: '{ "orderId": "SO-1", "currency": "USD", "lineCount": 0, "lines": [], "orderTotal": 0 }',
    },
  ],
}

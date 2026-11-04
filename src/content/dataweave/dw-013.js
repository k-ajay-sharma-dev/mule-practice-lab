export default {
  id: 'dw-013',
  category: 'dataweave',
  title: 'Format Invoice Amounts for Printing',
  level: 'BEGINNER',
  tags: ['numbers', 'format', 'coercion', 'json'],
  estMinutes: 15,
  description: `
The invoice PDF generator does no formatting of its own: it prints exactly the strings it receives. Prepare the invoice lines.

For each line in \`payload.lines\` (keep the input order) output:

- \`item\` — copied as-is
- \`qty\` — copied as-is (a number)
- \`unitPrice\` — formatted as a **string** with a comma thousands separator and **exactly 2 decimals**, e.g. \`1250\` → \`"1,250.00"\`
- \`lineTotal\` — \`qty × unitPrice\`, formatted the same way

Then add a top-level \`total\`: the sum of all line totals, formatted the same way. Output shape: \`{ "lines": [...], "total": "..." }\`.

An invoice with no lines has \`"lines": []\` and \`"total": "0.00"\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "lines": [
    { "item": "Server rack", "qty": 2, "unitPrice": 1250 },
    { "item": "Patch cable", "qty": 40, "unitPrice": 3.2 },
    { "item": "Support (hours)", "qty": 7.5, "unitPrice": 95.5 }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "lines": [
    { "item": "Server rack", "qty": 2, "unitPrice": "1,250.00", "lineTotal": "2,500.00" },
    { "item": "Patch cable", "qty": 40, "unitPrice": "3.20", "lineTotal": "128.00" },
    { "item": "Support (hours)", "qty": 7.5, "unitPrice": "95.50", "lineTotal": "716.25" }
  ],
  "total": "3,344.25"
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    '`n as String {format: "#,##0.00"}` uses Java DecimalFormat patterns: `,` is the grouping separator, `0` forces a digit.',
    'Compute the totals as **numbers** first and format only at the very end — you cannot add formatted strings.',
    'On an empty array, `lines.x` gives `null`; `sum(... default [])` keeps the total at `0`.',
  ],
  solution: `%dw 2.0
output application/json
fun money(n: Number): String = n as String {format: "#,##0.00"}
var totals = payload.lines map (l) -> l.qty * l.unitPrice
---
{
  lines: payload.lines map (l, i) -> {
    item: l.item,
    qty: l.qty,
    unitPrice: money(l.unitPrice),
    lineTotal: money(totals[i])
  },
  total: money(sum(totals))
}`,
  explanation: `
A small \`money\` function keeps the format pattern in one place. The pattern \`#,##0.00\` means: group thousands with commas, at least one digit before the point (so \`0.5\` becomes \`0.50\`, not \`.50\`), and always two decimals.

Line totals are computed once as numbers and reused for both the line and the grand total, so the total is the exact sum and is only rounded once.

**Common trap:** formatting first and summing afterwards (or summing rounded strings converted back), which loses precision and fails on the thousands separator.
`,
  tests: [
    {
      name: 'No lines',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{ "lines": [] }' }],
      expected: '{ "lines": [], "total": "0.00" }',
    },
    {
      name: 'Small and large values',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "lines": [{ "item": "Washer", "qty": 3, "unitPrice": 0.1 }, { "item": "Crane", "qty": 1, "unitPrice": 1234567.8 }] }',
        },
      ],
      expected:
        '{ "lines": [{ "item": "Washer", "qty": 3, "unitPrice": "0.10", "lineTotal": "0.30" }, { "item": "Crane", "qty": 1, "unitPrice": "1,234,567.80", "lineTotal": "1,234,567.80" }], "total": "1,234,568.10" }',
    },
  ],
  followUps: [
    {
      q: 'How is a value like 2.345 rounded by this format?',
      a: 'DataWeave rounds HALF_UP by default when formatting, so 2.345 becomes "2.35" (plain Java DecimalFormat would use HALF_EVEN and give "2.34"). If the business wants a different rule, pass a `roundMode` property, e.g. `{format: "#,##0.00", roundMode: "HALF_EVEN"}`.',
    },
    {
      q: 'How would you produce European formatting like "1.250,00"?',
      a: 'Add a locale: `n as String {format: "#,##0.00", locale: "de-DE"}`. The pattern stays the same; the locale decides which symbols are used for grouping and decimals.',
    },
    {
      q: 'Why does `3.2 * 40` give exactly 128 here, unlike JavaScript?',
      a: 'DataWeave numbers are arbitrary-precision decimals (BigDecimal), not binary floating point, so decimal arithmetic stays exact.',
    },
  ],
}

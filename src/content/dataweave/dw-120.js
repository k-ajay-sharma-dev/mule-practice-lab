export default {
  id: 'dw-120',
  category: 'dataweave',
  title: 'Build Fixed Length Invoice References',
  level: 'BEGINNER',
  tags: ['numbers', 'format', 'coercion', 'map', 'json'],
  estMinutes: 10,
  description: `
A billing system numbers its invoices \`42\`, \`1875\` and so on. The bank wants a reference of a fixed length on every payment file, so that all references line up.

For each invoice in \`payload\`, keep the input order and output:

- \`reference\`, the text \`INV-\` followed by the number as **6 digits**, with zeros added at the front. So \`42\` becomes \`INV-000042\`.
- \`customer\`, copied as it is

A number with more than 6 digits is written in full.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "invoiceNumber": 42, "customer": "Hall & Sons" },
  { "invoiceNumber": 1875, "customer": "Nordic Parts" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "reference": "INV-000042", "customer": "Hall & Sons" },
  { "reference": "INV-001875", "customer": "Nordic Parts" }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload map (inv) -> {
  reference: "INV-" ++ inv.invoiceNumber,
  customer: inv.customer
}
`,
  hints: [
    'Run the starter code. The number is added to the text, but no zeros appear.',
    '`as String` can take a `format` pattern. In a number pattern, each `0` means "always show a digit here".',
    'Six digits means six zeros in the pattern: `{ format: "000000" }`.',
  ],
  solution: `%dw 2.0
output application/json
---
payload map (inv) -> {
  reference: "INV-" ++ (inv.invoiceNumber as String { format: "000000" }),
  customer: inv.customer
}`,
  explanation: `
A number has no leading zeros, so they can only exist in text. \`as String { format: "000000" }\` makes that text.

Each \`0\` in the pattern is a place that must show a digit. If the number has fewer digits, a zero fills the gap, so \`42\` becomes \`000042\`. If it has more digits than the pattern, nothing is cut off, so \`1234567\` stays \`1234567\`.

\`++\` then joins the two Strings. The parentheses are there for the reader: they show that the format belongs to the number and not to the whole text.
`,
  tests: [
    {
      name: 'Zero, exactly six digits, and more than six',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[{ "invoiceNumber": 0, "customer": "A" }, { "invoiceNumber": 123456, "customer": "B" }, { "invoiceNumber": 1234567, "customer": "C" }]',
        },
      ],
      expected:
        '[{ "reference": "INV-000000", "customer": "A" }, { "reference": "INV-123456", "customer": "B" }, { "reference": "INV-1234567", "customer": "C" }]',
    },
  ],
  followUps: [
    {
      q: 'Is there another way to add the zeros?',
      a: '`leftPad` from `dw::core::Strings` does it too: `leftPad(42, 6, "0")` gives `"000042"`. You import it first with `import leftPad from dw::core::Strings`.',
    },
    {
      q: 'How would you show `0.125` as a percentage?',
      a: 'Use a percent pattern: `0.125 as String { format: "0.0%" }` gives `"12.5%"`.',
    },
    {
      q: 'Why not store the reference as a Number?',
      a: 'A Number cannot keep leading zeros, so `000042` would become `42`. References are labels, not amounts, and they belong in a String.',
    },
  ],
}

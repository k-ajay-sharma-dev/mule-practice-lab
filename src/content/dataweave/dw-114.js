export default {
  id: 'dw-114',
  category: 'dataweave',
  title: 'Label Large Bank Transfers with if/else',
  level: 'BEGINNER',
  tags: ['conditional', 'map', 'json'],
  estMinutes: 10,
  description: `
A bank's compliance team (the people who check that the bank follows the rules) reviews large transfers by hand. Add a label so they can see which ones to check.

Use \`if\` and \`else\` to choose the label. In DataWeave, \`if/else\` gives back a value, so you can use it directly as the value of a field.

For each transfer output:

- \`id\` and \`amount\`: copied as they are
- \`check\`: \`"REVIEW"\` when \`amount\` is \`10000\` or more, otherwise \`"CLEAR"\`
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "id": "T-1", "amount": 250.75 },
  { "id": "T-2", "amount": 18000 },
  { "id": "T-3", "amount": 9999.99 }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "id": "T-1", "amount": 250.75, "check": "CLEAR" },
  { "id": "T-2", "amount": 18000, "check": "REVIEW" },
  { "id": "T-3", "amount": 9999.99, "check": "CLEAR" }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Use `map` to build a new object for each transfer.',
    'The shape is `if (condition) "A" else "B"`. Read the rule again to choose between `>` and `>=`.',
  ],
  solution: `%dw 2.0
output application/json
---
payload map (t) -> {
  id: t.id,
  amount: t.amount,
  check: if (t.amount >= 10000) "REVIEW" else "CLEAR"
}`,
  explanation: 'The rule says `10000` or more, so the condition uses `>=`. A transfer of exactly `10000` is labelled `"REVIEW"`. The `else` part is required, because the expression must always give a value.',
  tests: [
    {
      name: 'Exactly on the limit',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: `[{ "id": "T-9", "amount": 10000 }]`,
        },
      ],
      expected: '[{ "id": "T-9", "amount": 10000, "check": "REVIEW" }]',
    },
    {
      name: 'No transfers',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '[]',
    },
  ],
}

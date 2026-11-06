export default {
  id: 'dw-111',
  category: 'dataweave',
  title: 'Fill Missing Customer Fields with default',
  level: 'BEGINNER',
  tags: ['default', 'null-handling', 'map', 'json'],
  estMinutes: 10,
  description: `
A loyalty app needs every customer to have a \`tier\` and a \`marketingOptIn\` value. Some records from the old store system have these fields set to \`null\`, and some do not have them at all.

Use \`default\` to fill the gaps. \`default\` gives the value on its left, unless that value is \`null\` or missing. Then it gives the value on its right.

For each customer output:

| Field | Rule |
|---|---|
| \`id\` | copied as it is |
| \`tier\` | \`tier\`, or \`"STANDARD"\` when it is null or missing |
| \`marketingOptIn\` | \`marketingOptIn\`, or \`false\` when it is null or missing |
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "id": "C-1", "tier": "GOLD", "marketingOptIn": true },
  { "id": "C-2", "tier": null, "marketingOptIn": true },
  { "id": "C-3" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "id": "C-1", "tier": "GOLD", "marketingOptIn": true },
  { "id": "C-2", "tier": "STANDARD", "marketingOptIn": true },
  { "id": "C-3", "tier": "STANDARD", "marketingOptIn": false }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Use `map` to build a new object for each customer.',
    'Put `default` straight after the field: `c.tier default "STANDARD"`.',
  ],
  solution: `%dw 2.0
output application/json
---
payload map (c) -> {
  id: c.id,
  tier: c.tier default "STANDARD",
  marketingOptIn: c.marketingOptIn default false
}`,
  explanation: 'One `default` covers both cases: a field set to `null` and a field that is not there. A real value stays as it is, and that includes `false`.',
  tests: [
    {
      name: 'A real false value stays false',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: `[{ "id": "C-7", "tier": "SILVER", "marketingOptIn": false }]`,
        },
      ],
      expected: '[{ "id": "C-7", "tier": "SILVER", "marketingOptIn": false }]',
    },
    {
      name: 'Both fields null',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: `[{ "id": "C-8", "tier": null, "marketingOptIn": null }]`,
        },
      ],
      expected: '[{ "id": "C-8", "tier": "STANDARD", "marketingOptIn": false }]',
    },
  ],
}

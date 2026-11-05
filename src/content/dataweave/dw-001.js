export default {
  id: 'dw-001',
  category: 'dataweave',
  title: 'Filter Active Customers',
  level: 'BEGINNER',
  tags: ['filter', 'arrays', 'json'],
  estMinutes: 10,
  description: `
The CRM System API returns every customer, but the marketing platform only accepts **active** customers.

Return only customers whose \`status\` is \`"ACTIVE"\`, keeping only the \`id\`, \`name\` and \`email\` fields.

**Rules**
- Keep the original order.
- Status comparison is exact (\`"ACTIVE"\` only).
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "id": "C-001", "name": "Asha Rao", "email": "asha@example.com", "status": "ACTIVE", "tier": "GOLD" },
  { "id": "C-002", "name": "Ben Ortiz", "email": "ben@example.com", "status": "SUSPENDED", "tier": "SILVER" },
  { "id": "C-003", "name": "Chen Li", "email": "chen@example.com", "status": "ACTIVE", "tier": "BRONZE" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "id": "C-001", "name": "Asha Rao", "email": "asha@example.com" },
  { "id": "C-003", "name": "Chen Li", "email": "chen@example.com" }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Use `filter` to keep matching items: `payload filter (c) -> ...`',
    'Then `map` each customer to a new object with only the three fields.',
  ],
  solution: `%dw 2.0
output application/json
---
payload
  filter ($.status == "ACTIVE")
  map (c) -> {
    id: c.id,
    name: c.name,
    email: c.email
  }`,
  explanation: '`filter` runs first so `map` only builds objects for the customers you keep.',
  tests: [
    {
      name: 'No active customers',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: `[{ "id": "C-9", "name": "Zed", "email": "z@example.com", "status": "CLOSED" }]`,
        },
      ],
      expected: '[]',
    },
    {
      name: 'Lowercase status is not active',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: `[
  { "id": "C-1", "name": "A", "email": "a@example.com", "status": "active" },
  { "id": "C-2", "name": "B", "email": "b@example.com", "status": "ACTIVE" }
]`,
        },
      ],
      expected: '[{ "id": "C-2", "name": "B", "email": "b@example.com" }]',
    },
  ],
}

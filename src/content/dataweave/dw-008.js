export default {
  id: 'dw-008',
  category: 'dataweave',
  title: 'Enrich Orders with Customer Data',
  level: 'INTERMEDIATE',
  tags: ['lookup', 'groupBy', 'multiple-inputs', 'json'],
  estMinutes: 20,
  description: `
Orders arrive as \`payload\`. Earlier in the flow, customers were fetched from the CRM and stored in the variable \`customers\` (here it is a second input).

Enrich every order with its customer:

- \`customer.id\`, \`customer.name\`, \`customer.segment\`
- If the customer is **not found**, use name \`"UNKNOWN"\` and segment \`"NONE"\` (keep the id)
- Keep the order of \`payload\`

Assume thousands of orders and customers — avoid searching the whole customer list for every order.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "orderId": "O-1", "customerId": "C-1", "amount": 50 },
  { "orderId": "O-2", "customerId": "C-9", "amount": 20 },
  { "orderId": "O-3", "customerId": "C-2", "amount": 75 }
]`,
    },
    {
      name: 'customers',
      mime: 'application/json',
      content: `[
  { "id": "C-1", "name": "Asha Rao", "segment": "GOLD" },
  { "id": "C-2", "name": "Ben Ortiz", "segment": "SILVER" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "orderId": "O-1", "amount": 50, "customer": { "id": "C-1", "name": "Asha Rao", "segment": "GOLD" } },
  { "orderId": "O-2", "amount": 20, "customer": { "id": "C-9", "name": "UNKNOWN", "segment": "NONE" } },
  { "orderId": "O-3", "amount": 75, "customer": { "id": "C-2", "name": "Ben Ortiz", "segment": "SILVER" } }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'The second input is available by its name, just like `payload`: `customers`.',
    'Build a lookup once: `var byId = customers groupBy $.id` gives `{ "C-1": [ ... ], "C-2": [ ... ] }`.',
    '`byId[o.customerId][0]` is null for unknown ids, so `default` handles the missing customer.',
  ],
  solution: `%dw 2.0
output application/json
var byId = customers groupBy $.id
---
payload map (o) -> do {
  var c = byId[o.customerId][0]
  ---
  {
    orderId: o.orderId,
    amount: o.amount,
    customer: {
      id: o.customerId,
      name: c.name default "UNKNOWN",
      segment: c.segment default "NONE"
    }
  }
}`,
  explanation: `
\`customers filter ($.id == o.customerId)\` inside the \`map\` also works, but it scans every customer for every order (n × m). Grouping once turns each lookup into a key access.

\`do { var ... --- ... }\` lets you declare a local variable inside the lambda.
`,
  tests: [
    {
      name: 'No customers loaded',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '[{ "orderId": "O-5", "customerId": "C-5", "amount": 1 }]' },
        { name: 'customers', mime: 'application/json', content: '[]' },
      ],
      expected: '[{ "orderId": "O-5", "amount": 1, "customer": { "id": "C-5", "name": "UNKNOWN", "segment": "NONE" } }]',
    },
  ],
}

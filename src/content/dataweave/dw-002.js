export default {
  id: 'dw-002',
  category: 'dataweave',
  title: 'Customer Order Totals Report',
  level: 'INTERMEDIATE',
  tags: ['groupBy', 'pluck', 'orderBy', 'json'],
  estMinutes: 20,
  description: `
Finance wants a daily report of order value per customer.

Group the orders by \`customer\` and return one object per customer with:

| Field | Value |
|---|---|
| \`customer\` | the customer code |
| \`orders\` | number of orders |
| \`total\` | sum of \`amount\` |

Sort the result by \`total\`, **highest first**.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "orderId": "A-100", "customer": "acme", "amount": 120.5 },
  { "orderId": "A-101", "customer": "globex", "amount": 80 },
  { "orderId": "A-102", "customer": "acme", "amount": 45.25 },
  { "orderId": "A-103", "customer": "initech", "amount": 300 }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "customer": "initech", "orders": 1, "total": 300 },
  { "customer": "acme", "orders": 2, "total": 165.75 },
  { "customer": "globex", "orders": 1, "total": 80 }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    '`groupBy $.customer` gives an object whose keys are customer codes and values are arrays of orders.',
    '`pluck (orders, customer) -> {...}` turns that object back into an array. Keys are of type Key, so use `customer as String`.',
    '`orderBy -$.total` sorts descending — but wrap the `pluck` expression in parentheses first, or the lambda body swallows the `orderBy`.',
  ],
  solution: `%dw 2.0
output application/json
---
(payload groupBy $.customer
  pluck (orders, customer) -> {
    customer: customer as String,
    orders: sizeOf(orders),
    total: sum(orders.amount)
  })
  orderBy -$.total`,
  explanation: `
\`orders.amount\` uses multi-value selection on the array to collect every amount, which \`sum\` then adds up.

**Watch the parentheses.** A lambda body extends as far right as it can, so without them \`orderBy -$.total\` runs *inside* the lambda on each object, and fails.
`,
  tests: [
    {
      name: 'Single customer',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: `[
  { "orderId": "B-1", "customer": "umbrella", "amount": 10 },
  { "orderId": "B-2", "customer": "umbrella", "amount": 15 }
]`,
        },
      ],
      expected: '[{ "customer": "umbrella", "orders": 2, "total": 25 }]',
    },
  ],
}

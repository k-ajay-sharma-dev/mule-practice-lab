export default {
  id: 'dw-116',
  category: 'dataweave',
  title: 'Pick Nested Order Fields with Selectors',
  level: 'BEGINNER',
  tags: ['selectors', 'nested', 'objects', 'json'],
  estMinutes: 10,
  description: `
An online shop sends a large order event. The delivery label printer needs only three values from deep inside it.

Use selectors to reach them. A selector is the dot in \`payload.order.id\`. Each dot steps one level down into an object.

Output:

| Field | Where it comes from |
|---|---|
| \`orderId\` | the \`id\` of the \`order\` |
| \`customerName\` | the \`name\` of the order's \`customer\` |
| \`city\` | the \`city\` in the customer's \`address\` |

Some customers collect in store and have no \`address\`. For them, \`city\` is \`null\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "eventType": "ORDER_PLACED",
  "order": {
    "id": "SO-8841",
    "customer": {
      "name": "Asha Rao",
      "address": { "street": "12 Park Lane", "city": "Leeds" }
    }
  }
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "orderId": "SO-8841",
  "customerName": "Asha Rao",
  "city": "Leeds"
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Build one object with three fields. Follow the levels of the input with dots.',
    'The `city` sits inside `address`, which sits inside `customer`, which sits inside `order`. Write one dot for each step down.',
  ],
  solution: `%dw 2.0
output application/json
---
{
  orderId: payload.order.id,
  customerName: payload.order.customer.name,
  city: payload.order.customer.address.city
}`,
  explanation: 'If a level is missing, a selector gives `null` instead of failing. That is why `city` needs no extra code for customers who have no `address`.',
  tests: [
    {
      name: 'Collect in store, no address',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "eventType": "ORDER_PLACED", "order": { "id": "SO-9", "customer": { "name": "Ben Ortiz" } } }',
        },
      ],
      expected: '{ "orderId": "SO-9", "customerName": "Ben Ortiz", "city": null }',
    },
  ],
}

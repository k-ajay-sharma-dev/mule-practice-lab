export default {
  id: 'dw-110',
  category: 'dataweave',
  title: 'Keep Products Over a Price',
  level: 'BEGINNER',
  tags: ['filter', 'arrays', 'json'],
  estMinutes: 10,
  description: `
A store wants a page of premium products. A product counts as premium when its \`price\` is **over 100**.

Use \`filter\` to return only those products. \`filter\` checks every item in an array and keeps the items where the condition is true.

**Rules**
- A price of exactly \`100\` is not over 100, so leave it out.
- Keep each product whole, with all of its fields.
- Keep the original order.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "sku": "TV-55", "name": "55 inch TV", "price": 499.99 },
  { "sku": "HD-01", "name": "Headphones", "price": 100 },
  { "sku": "CB-12", "name": "HDMI cable", "price": 12.5 },
  { "sku": "SP-20", "name": "Speaker", "price": 149 }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "sku": "TV-55", "name": "55 inch TV", "price": 499.99 },
  { "sku": "SP-20", "name": "Speaker", "price": 149 }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Start with `payload filter (p) -> ...`. Here `p` is the current product.',
    'The condition compares `price` with `100`. Read the rules again to choose between `>` and `>=`.',
  ],
  solution: `%dw 2.0
output application/json
---
payload filter (p) -> p.price > 100`,
  explanation: '`filter` never changes an item. It only decides whether the item stays. The `>` operator leaves out a price of exactly 100, while `>=` would keep it.',
  tests: [
    {
      name: 'Nothing over the price',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: `[{ "sku": "CB-12", "name": "HDMI cable", "price": 12.5 }]`,
        },
      ],
      expected: '[]',
    },
    {
      name: 'A cent above the limit stays',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: `[
  { "sku": "A", "name": "Lamp", "price": 100.01 },
  { "sku": "B", "name": "Desk", "price": 100 }
]`,
        },
      ],
      expected: '[{ "sku": "A", "name": "Lamp", "price": 100.01 }]',
    },
  ],
}

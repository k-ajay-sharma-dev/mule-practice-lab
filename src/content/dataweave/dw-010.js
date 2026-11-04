export default {
  id: 'dw-010',
  category: 'dataweave',
  title: 'Keep the Latest Change per Product',
  level: 'ADVANCED',
  tags: ['dedupe', 'groupBy', 'maxBy', 'dates'],
  estMinutes: 25,
  description: `
A change-data-capture feed delivers price events out of order, with duplicates. Before loading the e-commerce platform you must reduce it to the **current state** per product.

**Rules**
- For each \`id\`, keep only the event with the latest \`updatedAt\`.
- If that latest event is a \`DELETE\`, drop the product entirely.
- Output \`id\`, \`price\`, \`updatedAt\`, sorted by \`id\`.
- Timestamps may use **different time-zone offsets** — compare actual instants, not strings.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "id": "P-2", "price": 10.0, "op": "UPSERT", "updatedAt": "2026-10-01T10:00:00Z" },
  { "id": "P-1", "price": 5.5, "op": "UPSERT", "updatedAt": "2026-10-01T09:00:00Z" },
  { "id": "P-2", "price": 12.0, "op": "UPSERT", "updatedAt": "2026-10-01T11:30:00Z" },
  { "id": "P-3", "price": 7.0, "op": "UPSERT", "updatedAt": "2026-10-01T08:00:00Z" },
  { "id": "P-3", "price": 7.0, "op": "DELETE", "updatedAt": "2026-10-01T12:00:00Z" },
  { "id": "P-1", "price": 5.0, "op": "UPSERT", "updatedAt": "2026-10-01T08:30:00Z" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "id": "P-1", "price": 5.5, "updatedAt": "2026-10-01T09:00:00Z" },
  { "id": "P-2", "price": 12.0, "updatedAt": "2026-10-01T11:30:00Z" }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    '`groupBy $.id` then `pluck` gives you one array of events per product.',
    '`maxBy` picks the element with the highest value: `events maxBy (e) -> e.updatedAt as DateTime`.',
    'Converting with `as DateTime` compares instants, so `10:00+02:00` is correctly earlier than `09:00Z`.',
  ],
  solution: `%dw 2.0
output application/json
---
(payload groupBy $.id
  pluck (events) -> events maxBy (e) -> e.updatedAt as DateTime)
  filter ($.op != "DELETE")
  orderBy $.id
  map (e) -> {
    id: e.id,
    price: e.price,
    updatedAt: e.updatedAt
  }`,
  explanation: `
Comparing ISO strings only works when every timestamp uses the same offset. The hidden test mixes \`+02:00\` and \`Z\` to catch that.

As in dw-002, the parentheses around \`groupBy … pluck\` stop the lambda from swallowing the rest of the pipeline.
`,
  tests: [
    {
      name: 'Mixed time-zone offsets',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: `[
  { "id": "X", "price": 1, "op": "UPSERT", "updatedAt": "2026-10-01T10:00:00+02:00" },
  { "id": "X", "price": 2, "op": "UPSERT", "updatedAt": "2026-10-01T09:00:00Z" }
]`,
        },
      ],
      expected: '[{ "id": "X", "price": 2, "updatedAt": "2026-10-01T09:00:00Z" }]',
    },
  ],
}

export default {
  id: 'dw-115',
  category: 'dataweave',
  title: 'Sort Delivery Stops with orderBy',
  level: 'BEGINNER',
  tags: ['orderBy', 'arrays', 'json'],
  estMinutes: 10,
  description: `
A delivery driver wants to see the nearest stop first. The routing system sends the stops in no useful order.

Use \`orderBy\` to sort them. \`orderBy\` returns a new array sorted by the value you choose, from lowest to highest.

Sort the stops by \`distanceKm\`, with the smallest distance first. Keep each stop whole, with all of its fields.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "stop": "Riverside Depot", "distanceKm": 12.4 },
  { "stop": "Market Street", "distanceKm": 3 },
  { "stop": "Hill Road", "distanceKm": 7.5 }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "stop": "Market Street", "distanceKm": 3 },
  { "stop": "Hill Road", "distanceKm": 7.5 },
  { "stop": "Riverside Depot", "distanceKm": 12.4 }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Start with `payload orderBy (s) -> ...`. Here `s` is the current stop.',
    'After the arrow, give the value to sort by. Read that field from `s`.',
  ],
  solution: `%dw 2.0
output application/json
---
payload orderBy (s) -> s.distanceKm`,
  explanation: '`distanceKm` is a number, so `orderBy` compares it as a number and `3` comes before `12.4`. The items themselves do not change. Only their positions do.',
  tests: [
    {
      name: 'Numbers sort by value, not by text',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: `[
  { "stop": "A", "distanceKm": 100 },
  { "stop": "B", "distanceKm": 20 },
  { "stop": "C", "distanceKm": 9 }
]`,
        },
      ],
      expected: `[
  { "stop": "C", "distanceKm": 9 },
  { "stop": "B", "distanceKm": 20 },
  { "stop": "A", "distanceKm": 100 }
]`,
    },
    {
      name: 'No stops',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '[]',
    },
  ],
}

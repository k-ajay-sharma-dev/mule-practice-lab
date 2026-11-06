export default {
  id: 'dw-121',
  category: 'dataweave',
  title: 'List Warehouse Stock with pluck',
  level: 'BEGINNER',
  tags: ['pluck', 'objects', 'arrays', 'json'],
  estMinutes: 10,
  description: `
A stock service returns one object. Each key is a warehouse name and each value is the number of units held there.

The stock report screen needs a list instead, with one entry per warehouse. Output an array of objects, in the same order as the input:

- \`warehouse\`, the key
- \`units\`, the value

\`pluck\` is the DataWeave function that turns an object into an array. It runs once for each key in the object.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "Leeds": 120,
  "York": 45,
  "Hull": 0
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "warehouse": "Leeds", "units": 120 },
  { "warehouse": "York", "units": 45 },
  { "warehouse": "Hull", "units": 0 }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    '`map` works on arrays only, so it fails on this object. Use `pluck` here.',
    'The function you give `pluck` receives the value first and the key second: `(value, key) -> ...`.',
    'Return a new object from the function, with the two fields the report needs.',
  ],
  solution: `%dw 2.0
output application/json
---
payload pluck (value, key) -> {
  warehouse: key,
  units: value
}`,
  explanation: `
\`pluck\` goes through each key of an object and collects what your function returns into an array. So the result always has one item per key.

The order of the arguments catches many people out. The **value comes first** and the **key comes second**, which is the opposite of how the object reads. If you swap them, the warehouse names land in \`units\`.

The short forms use the same order: \`$\` is the value and \`$$\` is the key. Named arguments read better when you use both.
`,
  tests: [
    {
      name: 'One warehouse',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{ "Bristol": 7 }' }],
      expected: '[{ "warehouse": "Bristol", "units": 7 }]',
    },
    {
      name: 'No warehouses',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{}' }],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'What do `payload pluck $` and `payload pluck $$` return?',
      a: '`$` gives an array of the values, such as `[120, 45, 0]`. `$$` gives an array of the keys, such as `["Leeds", "York", "Hull"]`.',
    },
    {
      q: 'What is the difference between `pluck` and `mapObject`?',
      a: 'Both go through the keys of an object. `pluck` returns an array and `mapObject` returns an object.',
    },
    {
      q: 'Is `pluck` the only way to get the keys of an object?',
      a: 'No. `keysOf(payload)` returns the keys and `valuesOf(payload)` returns the values.',
    },
  ],
}

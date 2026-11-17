export default {
  id: 'dw-125',
  category: 'dataweave',
  title: 'Split Orders into Ship Today and Back Order with partition',
  level: 'BEGINNER',
  tags: ['partition', 'arrays-module', 'arrays', 'json'],
  estMinutes: 10,
  description: `
A warehouse gets a list of orders each morning. Each order has an \`inStock\` flag. Orders that are in stock go to the packing team today. The rest go on a back order list for the buyers.

Output one object with two lists of order ids:

- \`shipToday\`: the ids of orders where \`inStock\` is \`true\`
- \`backOrder\`: the ids of orders where \`inStock\` is \`false\`

Keep the original order inside each list.

\`partition\` from the \`dw::core::Arrays\` module splits an array in one pass. It returns an object with two arrays: \`success\` holds the items that meet your condition, and \`failure\` holds the others.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "orderId": "SO-501", "customer": "C-12", "inStock": true },
  { "orderId": "SO-502", "customer": "C-40", "inStock": false },
  { "orderId": "SO-503", "customer": "C-12", "inStock": true },
  { "orderId": "SO-504", "customer": "C-77", "inStock": false }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "shipToday": ["SO-501", "SO-503"],
  "backOrder": ["SO-502", "SO-504"]
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  shipToday: payload,
  backOrder: payload
}
`,
  hints: [
    'Bring the function in above the `---` line: `import partition from dw::core::Arrays`.',
    '`payload partition (order) -> order.inStock` gives `{ success: [...], failure: [...] }`.',
    'Keep that result in a `var`, then take the `orderId` of each item with `map $.orderId`.',
  ],
  solution: `%dw 2.0
import partition from dw::core::Arrays
output application/json
var parts = payload partition (order) -> order.inStock
---
{
  shipToday: parts.success map $.orderId,
  backOrder: parts.failure map $.orderId
}`,
  explanation: `
\`partition\` runs your condition once for each item. Items where it returns \`true\` go into \`success\`, and the rest go into \`failure\`. Each list keeps the order the items had in the input.

You could write two \`filter\` calls instead: one for \`inStock\` and one for \`not inStock\`. That works, but it reads the list twice, and the two conditions can drift apart when someone edits one of them. With \`partition\`, every order lands in exactly one list.

\`partition\` is not in the core functions, so it needs the \`import\` line. Without it, DataWeave reports that it cannot find the function.
`,
  tests: [
    {
      name: 'Everything is in stock',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "orderId": "SO-9", "customer": "C-1", "inStock": true }, { "orderId": "SO-10", "customer": "C-2", "inStock": true }]',
        },
      ],
      expected: '{ "shipToday": ["SO-9", "SO-10"], "backOrder": [] }',
    },
    {
      name: 'Nothing is in stock',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[{ "orderId": "SO-11", "customer": "C-3", "inStock": false }]' }],
      expected: '{ "shipToday": [], "backOrder": ["SO-11"] }',
    },
    {
      name: 'No orders today',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '{ "shipToday": [], "backOrder": [] }',
    },
  ],
  followUps: [
    {
      q: 'Why not use `groupBy $.inStock` instead?',
      a: '`groupBy` returns an object keyed by the value, and a key only appears when some item has that value. On a day with no back orders there is no `false` key at all. `partition` always returns both `success` and `failure`, even when one is empty.',
    },
    {
      q: 'Some orders arrive with no `inStock` field. How do you keep them out of the packing list?',
      a: 'Compare with `true` in the condition: `partition (order) -> order.inStock == true`. A missing flag gives `false`, so the order goes to the back order list for a person to check.',
    },
    {
      q: 'How would you split into three groups, such as in stock, partly in stock and out of stock?',
      a: '`partition` only makes two lists. Use `groupBy` with a function that returns a status name, and use `default []` when you read each group so a missing group is an empty list.',
    },
  ],
}

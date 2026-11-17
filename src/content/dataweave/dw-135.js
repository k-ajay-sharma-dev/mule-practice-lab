export default {
  id: 'dw-135',
  category: 'dataweave',
  title: 'Check Picked Orders with some and every',
  level: 'BEGINNER',
  tags: ['some', 'every', 'arrays-module', 'arrays', 'logistics', 'json'],
  estMinutes: 10,
  description: `
Brackenford Supplies runs a warehouse. Pickers scan each line of an order as they take the goods from the shelf. Before an order goes to the packing desk, an integration checks the scans.

Output one object per order with:

- \`orderId\`: copied from the input
- \`complete\`: \`true\` when **every** line has \`qtyPicked\` at least \`qtyOrdered\`
- \`hasShortage\`: \`true\` when **some** line has \`qtyPicked\` below \`qtyOrdered\`
- \`needsBubbleWrap\`: \`true\` when **some** line is \`fragile\`

The \`dw::core::Arrays\` module has \`every\` and \`some\`. Each takes a list and a condition, and answers \`true\` or \`false\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  {
    "orderId": "BS-5001",
    "lines": [
      { "sku": "MUG-01", "qtyOrdered": 4, "qtyPicked": 4, "fragile": true },
      { "sku": "TEA-12", "qtyOrdered": 2, "qtyPicked": 2, "fragile": false }
    ]
  },
  {
    "orderId": "BS-5002",
    "lines": [
      { "sku": "PEN-30", "qtyOrdered": 10, "qtyPicked": 7, "fragile": false },
      { "sku": "PAD-04", "qtyOrdered": 3, "qtyPicked": 3, "fragile": false }
    ]
  },
  {
    "orderId": "BS-5003",
    "lines": [
      { "sku": "VAS-02", "qtyOrdered": 1, "qtyPicked": 0, "fragile": true }
    ]
  }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "orderId": "BS-5001", "complete": true, "hasShortage": false, "needsBubbleWrap": true },
  { "orderId": "BS-5002", "complete": false, "hasShortage": true, "needsBubbleWrap": false },
  { "orderId": "BS-5003", "complete": false, "hasShortage": true, "needsBubbleWrap": true }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload map (order) -> {
  orderId: order.orderId,
  complete: false,
  hasShortage: false,
  needsBubbleWrap: false
}
`,
  hints: [
    'Bring the two functions in above the `---` line: `import every, some from dw::core::Arrays`.',
    'Write them between the list and the condition: `order.lines every (line) -> line.qtyPicked >= line.qtyOrdered`.',
    '`some` works the same way. It is `true` as soon as one line fits the condition.',
    '`fragile` already holds `true` or `false`, so the condition can be `(line) -> line.fragile`.',
  ],
  solution: `%dw 2.0
import every, some from dw::core::Arrays
output application/json
---
payload map (order) -> {
  orderId: order.orderId,
  complete: order.lines every (line) -> line.qtyPicked >= line.qtyOrdered,
  hasShortage: order.lines some (line) -> line.qtyPicked < line.qtyOrdered,
  needsBubbleWrap: order.lines some (line) -> line.fragile
}`,
  explanation: `
**every.** \`every\` answers \`true\` only when the condition holds for each item in the list. One short line is enough to make an order incomplete.

**some.** \`some\` answers \`true\` when the condition holds for at least one item. One fragile mug is enough to need bubble wrap.

**Two views of one rule.** \`complete\` and \`hasShortage\` look at the same numbers from both sides. For an order with lines, one is always the opposite of the other. The test with no lines shows where they part.

**Why not filter and count?** \`sizeOf(order.lines filter ...) > 0\` gives the same answer as \`some\`, but it builds a new list first. \`some\` and \`every\` say what you mean in one word.
`,
  tests: [
    {
      name: 'More picked than ordered still counts as complete',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "orderId": "BS-6001", "lines": [{ "sku": "BOX-10", "qtyOrdered": 5, "qtyPicked": 6, "fragile": false }] }]',
        },
      ],
      expected: '[{ "orderId": "BS-6001", "complete": true, "hasShortage": false, "needsBubbleWrap": false }]',
    },
    {
      name: 'An order with no lines',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[{ "orderId": "BS-6002", "lines": [] }]' }],
      expected: '[{ "orderId": "BS-6002", "complete": true, "hasShortage": false, "needsBubbleWrap": false }]',
    },
    {
      name: 'No orders',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'An order with no lines comes out as complete. Is that right?',
      a: '`every` on an empty list answers `true`, because no line breaks the rule. For a warehouse that is wrong, since there is nothing to pack. Add `not isEmpty(order.lines)` to the condition for `complete`.',
    },
    {
      q: 'How would you list the SKUs that are short?',
      a: 'Filter the lines with the same condition and keep the SKU: `(order.lines filter (line) -> line.qtyPicked < line.qtyOrdered) map $.sku`.',
    },
    {
      q: 'What happens if a line has no `qtyPicked`?',
      a: 'The comparison then has null on one side instead of a number, which you should not rely on. Use `(line.qtyPicked default 0)` so a missing scan counts as nothing picked.',
    },
  ],
}

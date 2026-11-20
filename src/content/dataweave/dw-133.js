export default {
  id: 'dw-133',
  category: 'dataweave',
  title: 'Roll Up Bill of Materials Costs Through Nested Assemblies',
  level: 'ADVANCED',
  tags: ['recursion', 'functions', 'tree', 'flatten', 'manufacturing', 'json'],
  estMinutes: 30,
  description: `
Thistlecombe Bikes builds trail bikes from parts and sub-assemblies. Its product system sends the bill of materials (BOM) as a tree. A node with \`components\` is an assembly. A node with no components is a bought part with a \`unitCost\`.

The cost of one assembly is the sum, over its components, of \`qty\` times the cost of one of that component. Assemblies can hold assemblies, to any depth.

Output one object with:

- \`product\`: the top part number
- \`totalCost\`: the cost of one finished product
- \`lines\`: every node of the tree, top first, depth first, each with \`part\`, \`level\` (0 for the top), \`qty\`, \`unitCost\` and \`lineCost\` (\`qty\` times \`unitCost\`). For an assembly, \`unitCost\` is the rolled-up cost of one of it.
- \`missingCosts\`: the part numbers of bought parts that have no \`unitCost\`, in tree order

A bought part with no \`unitCost\` counts as 0, so the rest of the BOM can still be costed.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "part": "BK-100",
  "qty": 1,
  "components": [
    { "part": "FR-20", "qty": 1, "unitCost": 180.00 },
    {
      "part": "WH-30",
      "qty": 2,
      "components": [
        { "part": "RM-31", "qty": 1, "unitCost": 22.50 },
        { "part": "SP-32", "qty": 32, "unitCost": 0.40 },
        { "part": "HB-33", "qty": 1, "unitCost": 15.00 }
      ]
    },
    { "part": "BR-40", "qty": 2, "unitCost": 19.75 }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "product": "BK-100",
  "totalCost": 320.1,
  "lines": [
    { "part": "BK-100", "level": 0, "qty": 1, "unitCost": 320.1, "lineCost": 320.1 },
    { "part": "FR-20", "level": 1, "qty": 1, "unitCost": 180.0, "lineCost": 180.0 },
    { "part": "WH-30", "level": 1, "qty": 2, "unitCost": 50.3, "lineCost": 100.6 },
    { "part": "RM-31", "level": 2, "qty": 1, "unitCost": 22.5, "lineCost": 22.5 },
    { "part": "SP-32", "level": 2, "qty": 32, "unitCost": 0.4, "lineCost": 12.8 },
    { "part": "HB-33", "level": 2, "qty": 1, "unitCost": 15.0, "lineCost": 15.0 },
    { "part": "BR-40", "level": 1, "qty": 2, "unitCost": 19.75, "lineCost": 39.5 }
  ],
  "missingCosts": []
}`,
  },
  starterCode: `%dw 2.0
output application/json
fun costOf(node) = node.unitCost default 0
---
{
  product: payload.part,
  totalCost: costOf(payload),
  lines: [],
  missingCosts: []
}
`,
  hints: [
    'A node is a bought part when `isEmpty(node.components)` is true. That covers a missing list and an empty one.',
    'For an assembly, `costOf(node) = sum(node.components map ((c) -> c.qty * costOf(c)))`. The function calls itself for each component.',
    'Build the lines with a second function that takes the node and its level. It returns a list with the node first, then `flatten` of the lists from its components at `level + 1`.',
    'For `missingCosts`, a third function can collect the bought parts. Then keep the ones whose `unitCost` is `null`.',
  ],
  solution: `%dw 2.0
output application/json
fun isPart(node) = isEmpty(node.components)

fun costOf(node) =
  if (isPart(node)) (node.unitCost default 0)
  else sum(node.components map ((c) -> c.qty * costOf(c)))

fun linesOf(node, level) = do {
  var unit = costOf(node)
  ---
  [{ part: node.part, level: level, qty: node.qty, unitCost: unit, lineCost: node.qty * unit }]
    ++ flatten((node.components default []) map ((c) -> linesOf(c, level + 1)))
}

fun partsOf(node) =
  if (isPart(node)) [node]
  else flatten(node.components map ((c) -> partsOf(c)))
---
{
  product: payload.part,
  totalCost: costOf(payload),
  lines: linesOf(payload, 0),
  missingCosts: partsOf(payload) filter ($.unitCost == null) map $.part
}`,
  explanation: `
**One rule for every depth.** The cost of a node is either its own price or the sum of its components. That is a recursive rule, so \`costOf\` calls itself. Each call works on a smaller part of the tree, and a bought part ends the calls.

**The numbers.** One wheel set is 22.50 + 32 × 0.40 + 15.00 = 50.30. The bike needs two, so 100.60. Add the frame (180.00) and two brake kits (39.50), and one bike costs 320.10.

**Lines in tree order.** \`linesOf\` puts the node first, then the lines of each component, one level deeper. \`flatten\` joins the lists from the components into one list, so the result reads top down like an indented BOM.

**isEmpty.** \`isEmpty\` is true for \`null\` and for \`[]\`, so a part with no \`components\` key and a part with \`"components": []\` are both treated as bought parts.

**Missing costs.** \`default 0\` keeps the costing going, but a silent zero is dangerous in a price. \`missingCosts\` tells the buyer which prices to fix.
`,
  tests: [
    {
      name: 'A single bought part',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{ "part": "BL-1", "qty": 1, "unitCost": 4.25 }' }],
      expected: '{ "product": "BL-1", "totalCost": 4.25, "lines": [{ "part": "BL-1", "level": 0, "qty": 1, "unitCost": 4.25, "lineCost": 4.25 }], "missingCosts": [] }',
    },
    {
      name: 'A part with no price and an empty components list',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "part": "KT-9", "qty": 1, "components": [{ "part": "GR-1", "qty": 2, "components": [], "unitCost": 3 }, { "part": "BX-2", "qty": 1 }] }',
        },
      ],
      expected:
        '{ "product": "KT-9", "totalCost": 6, "lines": [{ "part": "KT-9", "level": 0, "qty": 1, "unitCost": 6, "lineCost": 6 }, { "part": "GR-1", "level": 1, "qty": 2, "unitCost": 3, "lineCost": 6 }, { "part": "BX-2", "level": 1, "qty": 1, "unitCost": 0, "lineCost": 0 }], "missingCosts": ["BX-2"] }',
    },
    {
      name: 'Three levels deep',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "part": "A", "qty": 1, "components": [{ "part": "B", "qty": 3, "components": [{ "part": "C", "qty": 2, "components": [{ "part": "D", "qty": 5, "unitCost": 1 }] }] }] }',
        },
      ],
      expected:
        '{ "product": "A", "totalCost": 30, "lines": [{ "part": "A", "level": 0, "qty": 1, "unitCost": 30, "lineCost": 30 }, { "part": "B", "level": 1, "qty": 3, "unitCost": 10, "lineCost": 30 }, { "part": "C", "level": 2, "qty": 2, "unitCost": 5, "lineCost": 10 }, { "part": "D", "level": 3, "qty": 5, "unitCost": 1, "lineCost": 5 }], "missingCosts": [] }',
    },
  ],
  followUps: [
    {
      q: '`costOf` is called again for every line, and each call walks the subtree. Is that a problem?',
      a: 'For a BOM of a few hundred nodes it is fine. For a large tree, cost each node once and carry the result up, for example by having one function return the node with its cost and its lines together.',
    },
    {
      q: 'The same part, such as a bolt, appears in many assemblies. How would you get one buying list?',
      a: 'Multiply the quantities down the tree as you go, so each bought part carries the total it needs for one product. Then group by part number and sum the quantities.',
    },
    {
      q: 'Could a bad BOM make the recursion run forever?',
      a: 'A tree in JSON cannot point back to its own parent, so this input always ends. If the BOM came as a flat parent list, a loop in the data could repeat forever. Then keep the list of parts already on the path and stop when one repeats.',
    },
  ],
}

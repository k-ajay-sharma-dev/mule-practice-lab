export default {
  id: 'dw-009',
  category: 'dataweave',
  title: 'Flatten a Category Tree into Breadcrumbs',
  level: 'ADVANCED',
  tags: ['recursion', 'functions', 'flatMap'],
  estMinutes: 25,
  description: `
The product catalogue stores categories as a tree of unknown depth. The search index needs one **breadcrumb string per leaf category**.

**Rules**
- Skip the \`Root\` node itself.
- Join names with \`" > "\`.
- A leaf is a node with an empty or missing \`children\`.
- Keep the tree order (depth-first).
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "name": "Root",
  "children": [
    {
      "name": "Electronics",
      "children": [
        { "name": "Phones", "children": [] },
        { "name": "Laptops", "children": [ { "name": "Gaming", "children": [] } ] }
      ]
    },
    { "name": "Home", "children": [] }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  "Electronics > Phones",
  "Electronics > Laptops > Gaming",
  "Home"
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Write a recursive function: `fun leafPaths(node, path) = ...`, where `path` is the array of names so far.',
    'If the node has no children, return `[path joinBy " > "]`. Otherwise recurse into each child.',
    '`flatMap` maps each child to an array of paths and flattens the results into one array. `<<` appends to an array.',
  ],
  solution: `%dw 2.0
output application/json

fun leafPaths(node, path: Array<String>): Array<String> =
  if (isEmpty(node.children))
    [path joinBy " > "]
  else
    node.children flatMap (child) -> leafPaths(child, path << child.name)
---
payload.children flatMap (c) -> leafPaths(c, [c.name])`,
  explanation:
    '`isEmpty` returns true for both `[]` and `null`, which covers the "missing children" case. Starting from `payload.children` is what skips the Root node.',
  tests: [
    {
      name: 'Missing children key, deeper nesting',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "name": "Root", "children": [ { "name": "A", "children": [ { "name": "B", "children": [ { "name": "C" } ] }, { "name": "D" } ] } ] }',
        },
      ],
      expected: '["A > B > C", "A > D"]',
    },
  ],
}

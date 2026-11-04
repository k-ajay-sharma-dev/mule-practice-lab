export default {
  id: 'dw-031',
  category: 'dataweave',
  title: 'Build a Category Tree from a Flat Parent List',
  level: 'EXPERT',
  tags: ['recursion', 'tree', 'groupBy', 'functions', 'hierarchy'],
  estMinutes: 35,
  description: `
The ERP exports product categories as a **flat** list where each row points to its parent with \`parentId\`. The storefront menu API needs a **nested tree**.

Each node in the output has exactly these fields:

- \`id\`, \`name\` — from the row
- \`level\` — \`1\` for a root, \`2\` for its children, and so on
- \`path\` — the names from the root down to this node, joined by \`" > "\` (a root's path is its own name)
- \`children\` — the child nodes (\`[]\` for a leaf)

**Rules**
- A row is a **root** when its \`parentId\` is \`null\` **or** refers to an id that is not in the list (an orphan is promoted to a root rather than lost).
- Roots, and the children of every node, are ordered by \`sort\` ascending. \`sort\` values are unique among siblings.
- Rows can appear in any order (a child may come before its parent).
- The list has no cycles. An empty list returns \`[]\`.
- It can contain thousands of rows — do not scan the whole list once per node.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "id": "13", "parentId": "11", "name": "Android", "sort": 1 },
  { "id": "10", "parentId": null, "name": "Electronics", "sort": 1 },
  { "id": "11", "parentId": "10", "name": "Phones", "sort": 2 },
  { "id": "12", "parentId": "10", "name": "Laptops", "sort": 1 },
  { "id": "20", "parentId": null, "name": "Home", "sort": 2 },
  { "id": "21", "parentId": "20", "name": "Kitchen", "sort": 1 },
  { "id": "99", "parentId": "77", "name": "Clearance", "sort": 3 }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  {
    "id": "10", "name": "Electronics", "level": 1, "path": "Electronics",
    "children": [
      { "id": "12", "name": "Laptops", "level": 2, "path": "Electronics > Laptops", "children": [] },
      {
        "id": "11", "name": "Phones", "level": 2, "path": "Electronics > Phones",
        "children": [
          { "id": "13", "name": "Android", "level": 3, "path": "Electronics > Phones > Android", "children": [] }
        ]
      }
    ]
  },
  {
    "id": "20", "name": "Home", "level": 1, "path": "Home",
    "children": [
      { "id": "21", "name": "Kitchen", "level": 2, "path": "Home > Kitchen", "children": [] }
    ]
  },
  { "id": "99", "name": "Clearance", "level": 1, "path": "Clearance", "children": [] }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Index the rows once: `payload groupBy ($.parentId default "")` gives you every node\'s children by key, and `payload groupBy $.id` tells you whether a parent exists.',
    'Write a recursive function `build(node, level, parentPath)` that returns one node and calls itself for each child with `level + 1` and the new path.',
    'Roots: `n.parentId == null or byId[n.parentId] == null`. Missing children: `byParent[node.id] default []`. Wrap `(... orderBy $.sort)` in parentheses before `map`.',
  ],
  solution: `%dw 2.0
output application/json

var byId = payload groupBy $.id
var byParent = payload groupBy ($.parentId default "")

fun isRoot(n: Object): Boolean =
  n.parentId == null or byId[n.parentId] == null

fun build(node: Object, level: Number, parentPath: String): Object = do {
  var path = if (level == 1) node.name else parentPath ++ " > " ++ node.name
  ---
  {
    id: node.id,
    name: node.name,
    level: level,
    path: path,
    children: ((byParent[node.id] default []) orderBy $.sort)
      map ((child) -> build(child, level + 1, path))
  }
}
---
((payload filter ((n) -> isRoot(n))) orderBy $.sort)
  map ((root) -> build(root, 1, ""))`,
  explanation: `
**Index first, then recurse.** \`groupBy parentId\` builds a parent → children lookup in one pass. Each \`build\` call then finds its children with a key access, so the whole tree is built in roughly linear time. The naive version — \`payload filter ($.parentId == node.id)\` inside the recursion — scans every row for every node (n²), which hurts with thousands of categories.

**Carry state down the recursion.** \`level\` and \`path\` depend on the ancestors, so they are passed as parameters instead of being looked up later.

**Orphans.** Checking only \`parentId == null\` silently drops rows whose parent is missing (a common data-quality issue in ERP exports). \`byId[n.parentId] == null\` promotes them.

Traps:
- \`groupBy\` needs a String key, so a \`null\` parentId must be defaulted.
- \`byParent[node.id]\` is \`null\` for a leaf — \`default []\` keeps \`children\` an array.
- Without parentheses, \`xs orderBy $.sort map ...\` can bind differently than you expect; parenthesise each step.
`,
  tests: [
    {
      name: 'Deep chain in reverse order plus an orphan subtree',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: `[
  { "id": "d", "parentId": "c", "name": "D", "sort": 1 },
  { "id": "x2", "parentId": "x1", "name": "X2", "sort": 1 },
  { "id": "c", "parentId": "b", "name": "C", "sort": 1 },
  { "id": "x1", "parentId": "gone", "name": "X1", "sort": 0 },
  { "id": "b", "parentId": "a", "name": "B", "sort": 1 },
  { "id": "a", "parentId": null, "name": "A", "sort": 5 }
]`,
        },
      ],
      expected: `[
  { "id": "x1", "name": "X1", "level": 1, "path": "X1", "children": [
    { "id": "x2", "name": "X2", "level": 2, "path": "X1 > X2", "children": [] }
  ] },
  { "id": "a", "name": "A", "level": 1, "path": "A", "children": [
    { "id": "b", "name": "B", "level": 2, "path": "A > B", "children": [
      { "id": "c", "name": "C", "level": 3, "path": "A > B > C", "children": [
        { "id": "d", "name": "D", "level": 4, "path": "A > B > C > D", "children": [] }
      ] }
    ] }
  ] }
]`,
    },
    {
      name: 'Empty list',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'What happens if the data contains a cycle (A is the parent of B and B of A)?',
      a: 'Neither row is a root and the recursion never reaches them, so they disappear silently. Detect it by counting the nodes in the finished tree and comparing with `sizeOf(payload)`, then report the ids that are missing.',
    },
    {
      q: 'How would you do the reverse — flatten the tree back into rows with parentId?',
      a: 'Recurse with `flatMap`: emit the current node without `children` plus `parentId`, then `flatMap` over the children passing the current id as their parent.',
    },
    {
      q: 'Is deep recursion a problem in DataWeave?',
      a: 'Category trees are shallow, so no. For very deep structures DataWeave can hit a stack limit; tail-recursive functions are optimised, but tree building is not tail-recursive, so keep depth in mind.',
    },
  ],
}

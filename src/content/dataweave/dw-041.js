export default {
  id: 'dw-041',
  category: 'dataweave',
  title: 'Unflatten Dotted Keys Back into Nested JSON',
  level: 'EXPERT',
  tags: ['recursion', 'distinctBy', 'dynamic-keys', 'unflatten', 'arrays-module'],
  estMinutes: 45,
  description: `
A configuration store (and many CSV/spreadsheet exports) keeps documents as **flat dotted keys**. Rebuild the nested JSON document that the downstream REST API expects.

**Rules**
- Split every key on \`.\`. Each segment is one level of nesting; the value sits at the end of the path, unchanged.
- A segment made only of digits is an **array index**. A node becomes an **array** when *all* of its child segments are digit-only. Elements are ordered by the index **numerically** (\`2\` before \`10\`); indexes need not be contiguous — gaps are simply closed up (\`0\`, \`5\` → two elements).
- Otherwise the node is an **object**, with keys in order of first appearance. If an object mixes digit and non-digit segments, the digit segments stay as ordinary string keys.
- The root is always an object and its keys are never digit-only. An empty input gives \`{}\`.
- No key is also a prefix of another key (you will not get both \`a\` and \`a.b\`).
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "orderId": "SO-981",
  "customer.name": "Ravi",
  "customer.address.city": "Pune",
  "items.1.sku": "B7",
  "items.0.sku": "A1",
  "items.0.qty": 2,
  "customer.address.zip": "411001",
  "items.1.tags.0": "gift",
  "items.1.tags.1": "fragile",
  "items.1.qty": 1,
  "paid": true
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "orderId": "SO-981",
  "customer": {
    "name": "Ravi",
    "address": { "city": "Pune", "zip": "411001" }
  },
  "items": [
    { "sku": "A1", "qty": 2 },
    { "sku": "B7", "tags": ["gift", "fragile"], "qty": 1 }
  ],
  "paid": true
}`,
  },
  starterCode: `%dw 2.0
import * from dw::core::Arrays
output application/json
---
payload
`,
  hints: [
    'Convert the input into entries first: `payload pluck ((v, k) -> { path: (k as String) splitBy ".", value: v })`. Now write `build(entries)` that returns the value for a node.',
    'Base case: a single entry whose `path` is empty is a leaf — return its `value`. Otherwise collect the distinct first segments (`path[0] as String`); for each one, take the entries starting with it, remove that segment (`drop(path, 1)`) and recurse.',
    'Decide the node type from its distinct first segments: if every one `matches /\\d+/`, order them `as Number` and build an array; else build an object with `{ (keys map ((k) -> { (k): ... })) }`. Avoid `path[1 to -1]` — on a 1-element array it returns `null`.',
  ],
  solution: `%dw 2.0
import * from dw::core::Arrays
output application/json

// entries sharing the first segment k, with that segment removed
fun under(entries: Array, k: String) =
  (entries filter ((e) -> e.path[0] == k))
    map ((e) -> { path: drop(e.path, 1), value: e.value })

fun build(entries: Array) =
  if (sizeOf(entries) == 1 and isEmpty(entries[0].path)) entries[0].value
  else do {
    var keys = (entries map ((e) -> e.path[0] as String)) distinctBy $
    ---
    if (keys every ((k) -> k matches /\\d+/))
      (keys orderBy ($ as Number)) map ((k) -> build(under(entries, k)))
    else
      { (keys map ((k) -> { (k): build(under(entries, k)) })) }
  }

var entries = payload pluck ((v, k) -> { path: (k as String) splitBy ".", value: v })
---
if (isEmpty(entries)) {} else build(entries)`,
  explanation: `
**Think in entries, not keys.** Each flat key becomes \`{ path: [...segments], value }\`. A node of the output tree is then just "all entries that share a prefix", and building it is the same problem one level down — a natural recursion:

1. **Leaf:** one entry with an empty path → its value.
2. **Branch:** for each distinct first segment, take its entries, strip that segment and recurse.
3. **Shape:** if every first segment is digits, the node is an array ordered numerically; otherwise an object, built by spreading \`{ (k): ... }\` pieces.

**Traps**
- **Sorting indexes as strings.** \`"10"\` sorts before \`"2"\`. Order by \`$ as Number\`.
- **Typing the recursion.** With \`groupBy\`, \`groups[k]\` is typed as possibly \`null\` and the segment as \`Any\`, so the type checker rejects \`(k): ...\` and the recursive call. Casting the segment \`as String\` and selecting each group with a \`filter\` (or adding \`default []\`) keeps the types honest. \`distinctBy\` over the first segments also gives the "first appearance" key order directly.
- **Range selectors on short arrays.** \`["a"][1 to -1]\` is \`null\`, not \`[]\`, which breaks the leaf test. \`drop(path, 1)\` from \`dw::core::Arrays\` returns \`[]\`.
- **The empty root.** With no entries, "every segment is digits" is vacuously true and you would return \`[]\`; the root rule says \`{}\`.

This is the inverse of flattening to dotted keys; together they let you round-trip a document through any flat store.
`,
  tests: [
    {
      name: 'Numeric index order, gaps and mixed segments',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "list.10": "k", "list.2": "c", "list.0": "a", "codes.0": "x", "codes.main": "y", "deep.0.0.v": null, "deep.0.3.v": 7 }',
        },
      ],
      expected:
        '{ "list": ["a", "c", "k"], "codes": { "0": "x", "main": "y" }, "deep": [[{ "v": null }, { "v": 7 }]] }',
    },
    {
      name: 'Empty input',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{}' }],
      expected: '{}',
    },
  ],
  followUps: [
    {
      q: 'How would you make an array keep its gaps as `null`s instead of closing them?',
      a: 'Build the array over `0 to max(indexes)` and look each index up in the groups: `(0 to max(idx)) map ((i) -> if (groups[i as String] == null) null else build(...))`.',
    },
    {
      q: 'What happens if the input has both `a` and `a.b`?',
      a: 'The `a` group then holds a leaf entry with an empty path next to a deeper one, so it is neither a clean leaf nor a clean branch. In production you would detect it (an empty path inside a group of size > 1) and raise an error with `fail`, rather than silently dropping a value.',
    },
    {
      q: 'Could you do this with `reduce` instead of recursion?',
      a: 'Yes — fold over the entries and merge each one into an accumulator with a deep-merge (e.g. `mergeWith` applied recursively), but arrays and ordering make that harder to get right. Grouping by prefix keeps each level simple and is easier to explain.',
    },
  ],
}

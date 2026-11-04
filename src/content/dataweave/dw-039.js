export default {
  id: 'dw-039',
  category: 'dataweave',
  title: 'Flatten Nested JSON into Dotted Keys',
  level: 'ADVANCED',
  tags: ['recursion', 'match', 'mapObject', 'dynamic-keys', 'flatten'],
  estMinutes: 30,
  description: `
A logging and analytics platform only indexes **flat** key/value documents. Before sending an order event, flatten it so that every leaf value sits under a single dotted path.

**Rules**
- The result is a single-level object. Each key is the path to a leaf, segments joined with \`.\`.
- Object keys are used as path segments; array elements use their **0-based index** (\`items.1.sku\`).
- Leaves are strings, numbers, booleans and \`null\` — copied unchanged.
- An **empty** object or array is also a leaf: keep it as \`{}\` / \`[]\` under its path so no information is lost.
- Keys appear depth-first in document order. The input root is always an object; an empty root gives \`{}\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "orderId": "SO-981",
  "customer": { "name": "Ravi", "address": { "city": "Pune", "zip": "411001" } },
  "items": [
    { "sku": "A1", "qty": 2 },
    { "sku": "B7", "qty": 1, "tags": ["gift", "fragile"] }
  ],
  "notes": null,
  "meta": {},
  "paid": true
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "orderId": "SO-981",
  "customer.name": "Ravi",
  "customer.address.city": "Pune",
  "customer.address.zip": "411001",
  "items.0.sku": "A1",
  "items.0.qty": 2,
  "items.1.sku": "B7",
  "items.1.qty": 1,
  "items.1.tags.0": "gift",
  "items.1.tags.1": "fragile",
  "notes": null,
  "meta": {},
  "paid": true
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Write a recursive `fun flat(value, path: String): Object` that returns a (flat) object for any value, and use `match` with `case is Object`, `case is Array`, `case else`.',
    'For objects, `mapObject ((v, k) -> flat(v, ...))` merges the objects your recursion returns. For arrays, `{ (arr map ((v, i) -> flat(v, ...))) }` spreads the returned objects into one.',
    'A leaf becomes `{ (path): value }` — the parentheses make the key dynamic. Handle the empty object/array case before recursing, and do not add a leading dot at the root.',
  ],
  solution: `%dw 2.0
output application/json

fun child(path: String, seg: String): String = if (path == "") seg else path ++ "." ++ seg

fun flat(value, path: String): Object =
  value match {
    case o is Object ->
      if (isEmpty(o) and path != "") { (path): o }
      else o mapObject ((v, k) -> flat(v, child(path, k as String)))
    case a is Array ->
      if (isEmpty(a)) { (path): a }
      else { (a map ((v, i) -> flat(v, child(path, i as String)))) }
    else -> { (path): value }
  }
---
flat(payload, "")`,
  explanation: `
**One function, three shapes.** \`match\` with type patterns separates objects, arrays and everything else. Every branch returns an **object**, which is what makes the recursion compose:

- \`mapObject\` merges the objects returned for each key into one flat object;
- for arrays, \`map\` returns a list of flat objects and \`{ ( ... ) }\` spreads them into one;
- a leaf returns \`{ (path): value }\` — a one-key object with a dynamic key.

**Paths.** \`child\` only adds a dot when there is already a prefix, so top-level keys stay \`orderId\`, not \`.orderId\`. Array indexes are numbers, so convert them with \`as String\` before concatenating.

**The trap: empty containers.** Without the \`isEmpty\` checks, \`"meta": {}\` maps over zero keys and simply **disappears** (and so does \`[]\`). The output then cannot be unflattened back to the original. The root check (\`path != ""\`) keeps an empty root as \`{}\` instead of \`{ "": {} }\`.
`,
  tests: [
    {
      name: 'Arrays of arrays and empty containers',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "matrix": [[1, 2], []], "a": { "b": {} }, "flag": false }',
        },
      ],
      expected: '{ "matrix.0.0": 1, "matrix.0.1": 2, "matrix.1": [], "a.b": {}, "flag": false }',
    },
    {
      name: 'Empty root',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{}' }],
      expected: '{}',
    },
  ],
  followUps: [
    {
      q: 'How would you turn this into CSV with one column per path?',
      a: 'For a single document, `[flat(payload, "")]` with `output application/csv` gives a header row of paths and one data row. For many documents, flatten each and make sure every row has the same keys (fill missing ones with null) or the CSV header will not line up.',
    },
    {
      q: 'Is this recursion safe for deeply nested input?',
      a: 'It recurses once per nesting level, not per element, so depth — not size — is the limit; real payloads are rarely more than a few dozen levels deep. Very wide arrays are fine because `map` iterates.',
    },
    {
      q: 'How would you use `[0]` style array paths instead, e.g. `items[0].sku`?',
      a: 'Give the array branch its own path builder: `path ++ "[" ++ (i as String) ++ "]"` instead of adding a dotted segment.',
    },
  ],
}

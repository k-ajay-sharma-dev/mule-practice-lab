export default {
  id: 'dw-077',
  category: 'dataweave',
  title: 'Flatten a Tenant Config into Parameter Store Keys',
  level: 'ADVANCED',
  tags: ['json', 'data-formats', 'flatten', 'recursion', 'match', 'dynamic-keys'],
  estMinutes: 30,
  description: `
A SaaS platform keeps one JSON configuration document per tenant, about 1,200 tenants in all. Operations wants to move them to a central parameter store. The store holds a flat list of keys, and **every value must be a string**. Its key syntax separates object keys from array positions, so a numeric object key can never be confused with an array index.

**Key syntax**
- Object keys are joined with a dot: \`retry.maxAttempts\`.
- Array positions are 0-based and written in brackets directly after their parent: \`endpoints[1].name\`, \`rateTable[0][1]\`.
- An object key made of digits is still an object key: \`vatRates.2026\`, not \`vatRates[2026]\`.

**Value rules** (the output contains only strings)
- Strings are copied unchanged. Numbers and booleans become their text form.
- \`null\` becomes \`"null"\`.
- An empty object becomes \`"{}"\` and an empty array becomes \`"[]"\`, so no key is lost.

**Output**
- One flat object, keys depth-first in document order.
- The root is always an object. An empty root gives \`{}\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "tenant": "acme-eu",
  "active": true,
  "retry": { "maxAttempts": 5, "backoffSeconds": 2.5 },
  "endpoints": [
    { "name": "orders", "url": "https://api.acme.example/orders", "headers": {} },
    { "name": "stock", "url": "https://api.acme.example/stock", "scopes": ["read", "write"] }
  ],
  "vatRates": { "2026": 21, "2027": null },
  "rateTable": [[1, 2], [3]],
  "allowedIps": []
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "tenant": "acme-eu",
  "active": "true",
  "retry.maxAttempts": "5",
  "retry.backoffSeconds": "2.5",
  "endpoints[0].name": "orders",
  "endpoints[0].url": "https://api.acme.example/orders",
  "endpoints[0].headers": "{}",
  "endpoints[1].name": "stock",
  "endpoints[1].url": "https://api.acme.example/stock",
  "endpoints[1].scopes[0]": "read",
  "endpoints[1].scopes[1]": "write",
  "vatRates.2026": "21",
  "vatRates.2027": "null",
  "rateTable[0][0]": "1",
  "rateTable[0][1]": "2",
  "rateTable[1][0]": "3",
  "allowedIps": "[]"
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Write a recursive `fun flat(value, path: String): Object` that always returns a flat object, and use `match` on the type of `value`.',
    'A dot is only needed when the path is not empty, so give the object case a small helper. A bracket never needs that check, because an array is never the root here.',
    '`mapObject` merges the objects your recursion returns. For an array, spread the returned objects into one with `{ (a map ((item, i) -> flat(item, ...))) }`.',
    'Handle `{}` and `[]` before recursing, and remember that the root `{}` must stay `{}`, not `{ "": "{}" }`.',
  ],
  solution: `%dw 2.0
output application/json

fun child(path: String, key: String): String =
  if (path == "") key else path ++ "." ++ key

fun flat(value, path: String): Object = value match {
  case o is Object ->
    if (isEmpty(o)) (if (path == "") {} else { (path): "{}" })
    else o mapObject ((v, k) -> flat(v, child(path, k as String)))
  case a is Array ->
    if (isEmpty(a)) { (path): "[]" }
    else { (a map ((item, i) -> flat(item, path ++ "[" ++ (i as String) ++ "]"))) }
  case n is Null -> { (path): "null" }
  else -> { (path): value as String }
}
---
flat(payload, "")`,
  explanation: `
**One return type.** Every branch of \`flat\` returns an object, which is what lets the branches compose: \`mapObject\` merges the objects returned for each key, and the spread \`{ (array) }\` does the same for array elements.

**Why brackets matter.** In plain dotted notation, \`vatRates.2026\` and \`items.0\` look alike, so a reader has to guess whether a digit means an array. Writing positions as \`[0]\` keeps the two apart and makes the document reversible without guessing, which the next problem in this set relies on.

**Everything is a string.** The parameter store has no types, so \`value as String\` covers numbers and booleans. \`null\`, \`{}\` and \`[]\` have no leaf to carry them, so they get a reserved text form. The trade-off is that the original string \`"null"\` and the original null now look the same. For configuration this is acceptable, but it is a decision to record in the design rather than discover later.

**The root case.** An empty root has no path to store a key under. Checking \`path == ""\` before writing the \`"{}"\` marker returns an empty object instead of a key with an empty name.
`,
  tests: [
    {
      name: 'Empty root',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{}' }],
      expected: '{}',
    },
    {
      name: 'Arrays inside arrays with empty containers',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "grid": [ [], [ {} ], [ [ true ] ], [ { "2": null } ] ], "version": "007" }',
        },
      ],
      expected:
        '{ "grid[0]": "[]", "grid[1][0]": "{}", "grid[2][0][0]": "true", "grid[3][0].2": "null", "version": "007" }',
    },
  ],
  followUps: [
    {
      q: 'An object key already contains a dot, such as "api.acme.example": 3. What goes wrong and how would you handle it?',
      a: 'The flat key `hosts.api.acme.example` reads as four levels, so rebuilding creates the wrong structure. Either reject such keys up front or add an escape rule, for example replacing a literal dot with a reserved sequence, and apply the same rule in both directions.',
    },
    {
      q: 'Why is a recursive function preferred over listing the known fields?',
      a: 'The documents differ per tenant and gain keys over time. A recursive function handles any shape without a change, while a field list silently drops whatever was added after it was written.',
    },
  ],
}

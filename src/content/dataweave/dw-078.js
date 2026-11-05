export default {
  id: 'dw-078',
  category: 'dataweave',
  title: 'Rebuild a Tenant Config from Parameter Store Keys',
  level: 'EXPERT',
  tags: ['json', 'data-formats', 'unflatten', 'recursion', 'scan', 'type-conversion', 'arrays-module'],
  estMinutes: 45,
  description: `
This is the return trip of the parameter store migration. A Mule API reads all keys of a tenant from the parameter store and has to return the original nested configuration to the applications. The store returns keys in **no particular order** and every value is a string.

**Key syntax**
- A dot separates object keys: \`retry.maxAttempts\`.
- \`[n]\` is an array position: \`endpoints[1].name\`, \`rateTable[0][1]\`.
- A name made of digits is an object key: \`vatRates.2026\` belongs to an **object**. Only the bracket form means an array.

**Structure rules**
- Object keys appear in order of first appearance in the input.
- Array elements are ordered by position **numerically** (\`[2]\` before \`[10]\`). Positions may have gaps, and gaps are closed up.
- A node never mixes names and positions, and no key is a prefix of another key.
- An empty input gives \`{}\`.

**Restoring values**, checked in this order
1. \`"null"\` gives \`null\`, \`"true"\` and \`"false"\` give booleans.
2. \`"{}"\` gives an empty object and \`"[]"\` gives an empty array.
3. A number written as an optional minus, then \`0\` or digits with no leading zero, then an optional decimal part (\`21\`, \`-3.5\`, \`0.25\`) gives a number.
4. Anything else stays a string, including \`"007"\` and \`"01234"\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "endpoints[1].name": "stock",
  "tenant": "acme-eu",
  "endpoints[0].url": "https://api.acme.example/orders",
  "retry.maxAttempts": "5",
  "endpoints[1].scopes[1]": "write",
  "active": "true",
  "endpoints[0].name": "orders",
  "endpoints[1].scopes[0]": "read",
  "endpoints[0].headers": "{}",
  "retry.backoffSeconds": "2.5",
  "vatRates.2026": "21",
  "vatRates.2027": "null",
  "rateTable[1][0]": "3",
  "rateTable[0][1]": "2",
  "rateTable[0][0]": "1",
  "allowedIps": "[]",
  "support.postCode": "01234"
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "endpoints": [
    { "url": "https://api.acme.example/orders", "name": "orders", "headers": {} },
    { "name": "stock", "scopes": ["read", "write"] }
  ],
  "tenant": "acme-eu",
  "retry": { "maxAttempts": 5, "backoffSeconds": 2.5 },
  "active": true,
  "vatRates": { "2026": 21, "2027": null },
  "rateTable": [[1, 2], [3]],
  "allowedIps": [],
  "support": { "postCode": "01234" }
}`,
  },
  starterCode: `%dw 2.0
import * from dw::core::Arrays
output application/json
---
payload
`,
  hints: [
    'First turn each key into tokens with `scan`, which returns one array per match: `(k as String) scan /[^.\\[\\]]+|\\[\\d+\\]/`. Take element 0 of each match, so `a[1].b` becomes `["a", "[1]", "b"]`. The bracket stays on the token, which is how you know it was a position.',
    'Convert the input into entries with `pluck`: `{ path: tokens, value: restored }`. Now write `build(entries)`, which returns the value for one node.',
    'Base case: one entry with an empty `path` is a leaf. Otherwise take the distinct first tokens, and for each one recurse on the entries that start with it, with that token removed by `drop(e.path, 1)`.',
    'If every first token is a position, order them by number and return an array. Otherwise return an object with `{ (keys map ((k) -> { (k): ... })) }`.',
    'An empty input reaches `build` with no entries, and `every` is true for an empty list, so you would return `[]`. Handle this case at the top level.',
  ],
  solution: `%dw 2.0
import * from dw::core::Arrays
output application/json

fun tokens(key: String): Array =
  (key scan /[^.\\[\\]]+|\\[\\d+\\]/) map ((m) -> m[0])

fun isPosition(token: String): Boolean = token matches /\\[\\d+\\]/

fun position(token: String): Number = token[1 to -2] as Number

fun restore(s: String) =
  if (s == "null") null
  else if (s == "true") true
  else if (s == "false") false
  else if (s == "{}") {}
  else if (s == "[]") []
  else if (s matches /-?(0|[1-9]\\d*)(\\.\\d+)?/) s as Number
  else s

// entries that start with this token, with the token removed
fun under(entries: Array, token: String): Array =
  (entries filter ((e) -> e.path[0] == token))
    map ((e) -> { path: drop(e.path, 1), value: e.value })

fun build(entries: Array) =
  if (sizeOf(entries) == 1 and isEmpty(entries[0].path)) entries[0].value
  else do {
    var keys = (entries map ((e) -> e.path[0] as String)) distinctBy ((k) -> k)
    ---
    if (keys every ((k) -> isPosition(k)))
      (keys orderBy ((k) -> position(k))) map ((k) -> build(under(entries, k)))
    else
      { (keys map ((k) -> { (k): build(under(entries, k)) })) }
  }

var entries = payload pluck ((v, k) -> { path: tokens(k as String), value: restore(v) })
---
if (isEmpty(entries)) {} else build(entries)`,
  explanation: `
**Tokens keep the evidence.** The alternation in the \`scan\` pattern matches either a name or a full \`[n]\`. Keeping the brackets on the token is the key design choice: a digit-only name such as \`2026\` stays a plain token and can never be mistaken for a position. Compare this with a split on dots, which cannot tell the two apart and has to guess from the digits.

**One node at a time.** \`build\` looks only at the first token of each entry. If all of them are positions the node is an array, otherwise an object. It then hands each group of entries, one token shorter, to itself. Keys that arrive in random order need no pre-sorting, because \`distinctBy\` keeps first appearance for objects and \`orderBy\` sorts positions.

**Sort as numbers.** \`position\` converts \`[10]\` to \`10\` before sorting. Sorting the token text would put \`[10]\` before \`[2]\`.

**Restoring types is a decision.** \`matches\` must cover the whole string, so \`1.2.3\` stays text. Rejecting leading zeros is what keeps \`01234\` a string: converting a postcode to the number \`1234\` would be silent data loss. The price of a string-only store is that a value that was originally the *string* \`"true"\` comes back as a boolean. The flattening cannot record that, so it needs either a type marker in the store or an agreed rule.

**The empty case.** With no entries, \`keys\` is empty and \`every\` is true, so \`build\` would return \`[]\`. The root is always an object, so the top level returns \`{}\` first.
`,
  tests: [
    {
      name: 'Positions sort numerically and gaps close',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "items[10].sku": "B-7", "items[2].sku": "A-1", "items[2].qty": "0", "items[25].sku": "C-3" }',
        },
      ],
      expected: '{ "items": [ { "sku": "A-1", "qty": 0 }, { "sku": "B-7" }, { "sku": "C-3" } ] }',
    },
    {
      name: 'Nested positions, numeric names and value edge cases',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "grid[1][0]": "false", "grid[0][1]": "x", "grid[0][0]": "-3.5", "rates.2026": "0.25", "rates.10": "1.2.3", "code": "007", "zero": "0", "blank": "" }',
        },
      ],
      expected:
        '{ "grid": [ [ -3.5, "x" ], [ false ] ], "rates": { "2026": 0.25, "10": "1.2.3" }, "code": "007", "zero": 0, "blank": "" }',
    },
    {
      name: 'Empty input',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{}' }],
      expected: '{}',
    },
  ],
  followUps: [
    {
      q: 'How would you test that this mapping and the flattening are true inverses?',
      a: 'Run a round trip: flatten a document, rebuild it and compare with the original. Choose test documents that hit each lossy edge, such as a string "true", a string "12" or a key containing a dot, and record those as known limits or fix them with a type marker.',
    },
    {
      q: 'Some keys are missing for a tenant because a write to the store failed halfway. What does this mapping return?',
      a: 'A valid looking but incomplete document, because closing gaps hides the missing positions. If completeness matters, store a version or a key count next to the values and check it before serving the configuration.',
    },
  ],
}

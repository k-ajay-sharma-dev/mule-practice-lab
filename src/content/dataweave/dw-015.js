export default {
  id: 'dw-015',
  category: 'dataweave',
  title: 'Feature Flags: Object to Key/Value Rows',
  level: 'INTERMEDIATE',
  tags: ['pluck', 'filterObject', 'typeOf', 'orderBy', 'json'],
  estMinutes: 20,
  description: `
A tenant's feature flags are stored as one flat JSON object. The admin UI needs them as table rows, and the gateway needs only the switched-on flags.

Input: \`{ "tenant": "...", "flags": { ... } }\` — flag values can be booleans, numbers, strings or \`null\`.

Output an object with:

- \`tenant\` — copied as-is
- \`rows\` — one entry per flag, **skipping flags whose value is \`null\`**, sorted by \`key\` ascending. Each row is:
  - \`key\` — the flag name
  - \`value\` — the value converted to a **string** (\`true\` → \`"true"\`, \`3\` → \`"3"\`)
  - \`type\` — the DataWeave type name of the original value: \`"Boolean"\`, \`"Number"\` or \`"String"\`
- \`enabled\` — an **object** containing only the flags whose value is exactly the boolean \`true\` (the string \`"true"\` does not count), with their original values

A tenant with no flags gives \`"rows": []\` and \`"enabled": {}\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "tenant": "acme",
  "flags": {
    "newCheckout": true,
    "maxRetries": 3,
    "theme": "dark",
    "legacyApi": false,
    "betaBanner": null,
    "auditLog": true
  }
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "tenant": "acme",
  "rows": [
    { "key": "auditLog", "value": "true", "type": "Boolean" },
    { "key": "legacyApi", "value": "false", "type": "Boolean" },
    { "key": "maxRetries", "value": "3", "type": "Number" },
    { "key": "newCheckout", "value": "true", "type": "Boolean" },
    { "key": "theme", "value": "dark", "type": "String" }
  ],
  "enabled": { "newCheckout": true, "auditLog": true }
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    '`obj pluck (value, key) -> { ... }` turns an object into an array — one item per key/value pair.',
    'Keys are of type `Key`, not `String`: convert with `key as String`. `typeOf(v) as String` gives names like `"Boolean"`.',
    '`obj filterObject (value) -> value == true` keeps an object an object, dropping the pairs that fail the condition.',
  ],
  solution: `%dw 2.0
output application/json
var flags = payload.flags default {}
---
{
  tenant: payload.tenant,
  rows: (flags filterObject ((v) -> v != null)
    pluck (v, k) -> {
      key: k as String,
      value: v as String,
      "type": typeOf(v) as String
    }) orderBy $.key,
  enabled: flags filterObject ((v) -> v == true)
}`,
  explanation: `
\`pluck\` is the object-to-array bridge; \`filterObject\` is \`filter\` for objects (it keeps the result an object). Filtering the nulls **before** \`pluck\` avoids converting \`null\` to a string.

The parentheses around the \`pluck\` expression matter: a lambda body extends as far right as possible, so without them \`orderBy\` would be applied inside the lambda to each single row object.

\`==\` does not coerce types, so the string \`"true"\` is not equal to the boolean \`true\` — exactly what the rule asks for. (\`~=\` would coerce.)
`,
  tests: [
    {
      name: 'No flags',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{ "tenant": "zen", "flags": {} }' }],
      expected: '{ "tenant": "zen", "rows": [], "enabled": {} }',
    },
    {
      name: 'String "true" is not enabled',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "tenant": "t1", "flags": { "zeta": "true", "alpha": null, "beta": 0.5 } }' },
      ],
      expected:
        '{ "tenant": "t1", "rows": [{ "key": "beta", "value": "0.5", "type": "Number" }, { "key": "zeta", "value": "true", "type": "String" }], "enabled": {} }',
    },
  ],
  followUps: [
    {
      q: 'How do you turn the rows back into an object?',
      a: 'Use dynamic keys with object destructuring: `{ (rows map (r) -> { (r.key): r.value }) }`, or `rows reduce ((r, acc = {}) -> acc ++ { (r.key): r.value })`.',
    },
    {
      q: 'What is the difference between `mapObject` and `pluck`?',
      a: '`mapObject` returns an object (you build key/value pairs), while `pluck` returns an array (you build one item per pair). Both receive `(value, key, index)`.',
    },
  ],
}

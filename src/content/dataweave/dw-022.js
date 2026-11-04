export default {
  id: 'dw-022',
  category: 'dataweave',
  title: 'Turn an FX Rate List into a Lookup Object',
  level: 'BEGINNER',
  tags: ['dynamic-keys', 'objects', 'map', 'json'],
  estMinutes: 10,
  description: `
The Treasury System API returns daily exchange rates as a list. The pricing Process API needs them as a **lookup object** so it can write \`rates.EUR\` instead of searching the list.

Convert the list into one object where each key is the currency code and each value is the rate.

**Rules**
- The key is the \`currency\` value in **upper case** (the source sometimes sends \`"eur"\`).
- The value is the \`rate\` exactly as received (a number).
- Skip entries whose \`rate\` is \`null\` or missing.
- Keep the order of the input list. Currency codes are unique.
- An empty list produces an empty object \`{}\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "currency": "EUR", "rate": 0.92, "source": "ECB" },
  { "currency": "gbp", "rate": 0.79, "source": "ECB" },
  { "currency": "JPY", "rate": null, "source": "ECB" },
  { "currency": "INR", "rate": 83.12, "source": "RBI" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "EUR": 0.92,
  "GBP": 0.79,
  "INR": 83.12
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'A key in parentheses is evaluated: `{ (upper("eur")): 1 }` produces `{ "EUR": 1 }`.',
    '`map` gives you an array of one-field objects. Wrapping an array in parentheses inside `{ }` spreads all of its fields into one object: `{ (arrayOfObjects) }`.',
    'Filter out the null rates before you map.',
  ],
  solution: `%dw 2.0
output application/json
---
{
  (payload
    filter ($.rate != null)
    map (r) -> { (upper(r.currency)): r.rate })
}`,
  explanation: `
Two separate ideas work together here:

1. **Dynamic key** — \`(upper(r.currency)): r.rate\`. A bare key such as \`currency: ...\` is always the literal name \`currency\`; the parentheses tell DataWeave to evaluate the expression and use its result as the key name.
2. **Object spread** — \`{ ( [ {EUR: 0.92}, {GBP: 0.79} ] ) }\` merges every object in the array into one object.

The common trap is returning \`payload map { ... }\` directly: that is an **array** of one-field objects, not a lookup object. Another trap is \`reduce\` with \`++\` — it works, but it is harder to read and rebuilds the object on every step.

An empty array spreads into nothing, so the edge case \`[]\` → \`{}\` needs no special code.
`,
  tests: [
    {
      name: 'Empty rate list',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '{}',
    },
    {
      name: 'Lower-case codes and a missing rate field',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "currency": "usd", "rate": 1 }, { "currency": "chf" }, { "currency": "sek", "rate": 10.6 }]',
        },
      ],
      expected: '{ "USD": 1, "SEK": 10.6 }',
    },
  ],
  followUps: [
    {
      q: 'What happens if the same currency code appears twice?',
      a: 'DataWeave objects allow duplicate keys, so the JSON output would contain the key twice. Deduplicate first (for example `distinctBy upper($.currency)`, which keeps the first occurrence), or decide explicitly which entry wins before building the object.',
    },
    {
      q: 'How would you read a rate for a currency that comes in as a variable?',
      a: 'Use a dynamic selector: `rates[vars.currency]`. `rates.vars.currency` would look for a key literally named `vars`.',
    },
    {
      q: 'Why is a lookup object better than filtering the list each time?',
      a: 'Key access on an object is a direct lookup, while `filter` scans the whole list for every lookup. With many prices to convert, building the object once is much cheaper.',
    },
  ],
}

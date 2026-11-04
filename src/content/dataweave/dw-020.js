export default {
  id: 'dw-020',
  category: 'dataweave',
  title: 'Coerce Loosely-Typed Form Values',
  level: 'ADVANCED',
  tags: ['match', 'regex', 'type-checks', 'coercion', 'splitBy', 'json'],
  estMinutes: 25,
  description: `
A low-code form builder posts every field as \`{ "name", "value" }\`, and most values arrive as strings. The downstream API expects properly typed JSON.

Build **one object** with a key per field \`name\` (names are unique; keep the input order) whose value is the coerced \`value\`. Apply the **first** rule that matches:

1. \`value\` is missing or \`null\` → \`null\`
2. \`value\` is not a string (already a number or boolean) → unchanged
3. Otherwise work with the **trimmed** string \`t\`:
   1. \`t\` is empty → \`null\`
   2. \`t\` is \`true\` or \`false\` in any letter case → the boolean
   3. \`t\` is an optional \`-\` followed only by digits → a number (\`"007"\` → \`7\`)
   4. \`t\` is an optional \`-\`, digits, a \`.\`, and digits → a number (\`"-12.50"\` → \`-12.50\`)
   5. \`t\` contains a comma → an array: split on \`,\`, trim each part, drop empty parts; the parts **stay strings**
   6. anything else → \`t\` as a string (so \`"1.2.3"\` stays \`"1.2.3"\`)

An empty \`fields\` array gives \`{}\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "fields": [
    { "name": "age", "value": "42" },
    { "name": "newsletter", "value": "TRUE" },
    { "name": "discount", "value": "-12.50" },
    { "name": "quantity", "value": " 007 " },
    { "name": "nickname", "value": "   " },
    { "name": "tags", "value": "red, green,,blue " },
    { "name": "score", "value": 9.5 },
    { "name": "city", "value": "  Pune " },
    { "name": "appVersion", "value": "1.2.3" },
    { "name": "referrer" }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "age": 42,
  "newsletter": true,
  "discount": -12.50,
  "quantity": 7,
  "nickname": null,
  "tags": ["red", "green", "blue"],
  "score": 9.5,
  "city": "Pune",
  "appVersion": "1.2.3",
  "referrer": null
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Write a `coerce(v)` function with `v match { case is Null -> ... case s is String -> ... else -> v }` for the type-based rules.',
    'Inside the String case, match on the trimmed value with guards: `case x if (x matches /-?[0-9]+/) -> x as Number`. `matches` must match the **whole** string.',
    'Build the object from an array of single-key objects: `{ (payload.fields map (f) -> { (f.name): coerce(f.value) }) }`.',
  ],
  solution: `%dw 2.0
output application/json

fun coerce(v) = v match {
  case is Null -> null
  case s is String -> do {
    var t = trim(s)
    ---
    t match {
      case "" -> null
      case b if (["true", "false"] contains lower(b)) -> lower(b) == "true"
      case i if (i matches /-?[0-9]+/) -> i as Number
      case d if (d matches /-?[0-9]+\\.[0-9]+/) -> d as Number
      case l if (l contains ",") -> ((l splitBy ",") map trim($)) filter ($ != "")
      else -> t
    }
  }
  else -> v
}
---
{ (payload.fields map (f) -> { (f.name): coerce(f.value) }) }`,
  explanation: `
Two levels of \`match\` mirror the two kinds of rules: the outer one dispatches on the **type** (\`is Null\`, \`is String\`), the inner one on the **content** with guard conditions. \`match\` evaluates cases top-down, which implements "first rule wins".

The decimal regex escapes the dot (\`\\.\`); an unescaped \`.\` matches any character, so \`"1.2.3"\` could slip into a wrong rule. \`matches\` tests the full string, so \`"12abc"\` is not a number.

\`{ (array of objects) }\` merges the single-key objects into one object while keeping the order.

**Common trap:** using \`v as Number default v\` everywhere — it coerces \`"true"\` and booleans in surprising ways and hides real data problems.
`,
  tests: [
    {
      name: 'No fields',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{ "fields": [] }' }],
      expected: '{}',
    },
    {
      name: 'Edge values',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "fields": [{ "name": "a", "value": "False" }, { "name": "b", "value": "-0.5" }, { "name": "c", "value": "1," }, { "name": "d", "value": "12abc" }, { "name": "e", "value": true }, { "name": "f", "value": null }, { "name": "g", "value": ".5" }] }',
        },
      ],
      expected: '{ "a": false, "b": -0.5, "c": ["1"], "d": "12abc", "e": true, "f": null, "g": ".5" }',
    },
  ],
  followUps: [
    {
      q: 'Why not just use `t as Number default t`?',
      a: 'It relies on a failed coercion silently falling back, and the number parser accepts forms you may not want (exponents like "1e3"). Explicit regex rules document exactly which shapes are accepted.',
    },
    {
      q: 'How would you also accept dates like "2026-03-15" and output them as Date values?',
      a: 'Add a case before the string fallback: `case x if (x matches /[0-9]{4}-[0-9]{2}-[0-9]{2}/) -> x as Date`. It must come before any rule that could also match that text.',
    },
  ],
}

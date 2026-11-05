export default {
  id: 'dw-011',
  category: 'dataweave',
  title: 'Mask PII Anywhere in a Payload',
  level: 'ADVANCED',
  tags: ['recursion', 'match', 'mapObject', 'pii', 'security'],
  estMinutes: 30,
  description: `
Before payloads are written to the logging platform, personal data must be masked — **wherever it appears**, at any depth, in objects or arrays.

**Rules**
- Sensitive field names: \`email\`, \`ssn\`, \`phone\`, \`number\` — matched **case-insensitively**.
- Mask by replacing every character except the **last 4** with \`*\` (keep the length).
- Values of 4 characters or fewer are left as they are.
- Numbers in sensitive fields are masked as strings.
- Everything else is returned unchanged.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "customer": {
    "name": "Asha Rao",
    "email": "asha@example.com",
    "ssn": "123-45-6789",
    "addresses": [
      { "type": "home", "line1": "1 Canal St", "phone": "+31 6 1234 5678" }
    ]
  },
  "orders": [
    { "id": "O-1", "card": { "number": "4111111111111111", "expiry": "12/28" } }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "customer": {
    "name": "Asha Rao",
    "email": "************.com",
    "ssn": "*******6789",
    "addresses": [
      { "type": "home", "line1": "1 Canal St", "phone": "***********5678" }
    ]
  },
  "orders": [
    { "id": "O-1", "card": { "number": "************1111", "expiry": "12/28" } }
  ]
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Write a recursive function that uses `match` on the type: `case o is Object -> ...`, `case a is Array -> ...`, `else -> v`.',
    'For objects, `mapObject (value, key) -> { (key): ... }` rebuilds each field; `lower(key as String)` gives a comparable name.',
    '`repeat("*", n)` from `dw::core::Strings` builds the mask; `s[-4 to -1]` is the last four characters.',
  ],
  solution: `%dw 2.0
import repeat from dw::core::Strings
output application/json

var SENSITIVE = ["email", "ssn", "phone", "number"]

fun mask(s: String): String =
  if (sizeOf(s) <= 4) s
  else repeat("*", sizeOf(s) - 4) ++ s[-4 to -1]

fun maskAll(v) = v match {
  case o is Object -> o mapObject (value, key) -> {
    (key): if (SENSITIVE contains lower(key as String)) mask(value as String)
           else maskAll(value)
  }
  case a is Array -> a map maskAll($)
  else -> v
}
---
maskAll(payload)`,
  explanation: `
The recursion only needs three cases: objects (rebuild each key), arrays (recurse into each item) and everything else (return as-is).

\`(key)\` in parentheses keeps the original key — including its case — instead of creating a key literally named "key".
`,
  tests: [
    {
      name: 'Case-insensitive keys, short and numeric values',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "Email": "a@b", "items": [1, 2], "Phone": 5551234567, "nested": [[{ "SSN": "987654321" }]] }]',
        },
      ],
      expected: '[{ "Email": "a@b", "items": [1, 2], "Phone": "******4567", "nested": [[{ "SSN": "*****4321" }]] }]',
    },
  ],
}

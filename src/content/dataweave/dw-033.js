export default {
  id: 'dw-033',
  category: 'dataweave',
  title: 'Audit Required Fields: Missing vs Blank vs Empty',
  level: 'INTERMEDIATE',
  tags: ['isEmpty', 'isBlank', 'sizeOf', 'null-handling', 'json'],
  estMinutes: 15,
  description: `
A supplier-onboarding API must reject incomplete records before they reach the ERP. Every supplier needs four fields: \`name\`, \`taxId\`, \`contacts\` and \`address\`.

For each supplier in \`payload\` return \`{ id, contactCount, ready, issues }\`.

**How to classify a required field**

| Value | Issue |
|---|---|
| key absent, or \`null\` | \`missing\` |
| string that is empty or only whitespace | \`blank\` |
| array with no items, or object with no keys | \`empty\` |
| anything else | no issue |

**Rules**
- \`issues\` is a list of strings \`"<field>: <issue>"\`, checked in the order \`name\`, \`taxId\`, \`contacts\`, \`address\`.
- \`ready\` is \`true\` when \`issues\` is empty.
- \`contactCount\` is the number of items in \`contacts\`, or \`0\` when \`contacts\` is missing.
- An object whose keys have empty values (e.g. \`{ "city": "" }\`) is **not** empty.
- When present, \`name\`/\`taxId\` are strings, \`contacts\` is an array and \`address\` is an object.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "id": "S-1", "name": "Acme Tools", "taxId": "GB123", "contacts": [{ "email": "a@acme.test" }], "address": { "city": "Leeds" } },
  { "id": "S-2", "name": "   ", "taxId": null, "contacts": [], "address": {} },
  { "id": "S-3", "name": "Brightline", "contacts": [{ "email": "x@b.test" }, { "email": "y@b.test" }], "address": { "city": "" } }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "id": "S-1", "contactCount": 1, "ready": true, "issues": [] },
  { "id": "S-2", "contactCount": 0, "ready": false, "issues": ["name: blank", "taxId: missing", "contacts: empty", "address: empty"] },
  { "id": "S-3", "contactCount": 2, "ready": false, "issues": ["taxId: missing"] }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Keep the field names in a list, `["name", "taxId", "contacts", "address"]`, and read each one with a dynamic selector: `s[f]`.',
    'Check `null` first, then `is String` + `isBlank`, then `isEmpty` for arrays/objects. Return `null` for "no issue" and filter those out.',
    '`sizeOf(null)` fails — use `sizeOf(s.contacts default [])`.',
  ],
  solution: `%dw 2.0
output application/json

var required = ["name", "taxId", "contacts", "address"]

fun issueOf(v) =
  if (v == null) "missing"
  else if (v is String) (if (isBlank(v)) "blank" else null)
  else if (isEmpty(v)) "empty"
  else null
---
payload map (s) -> do {
  var issues = required
    map ((f) -> { field: f, issue: issueOf(s[f]) })
    filter ((x) -> x.issue != null)
    map ((x) -> x.field ++ ": " ++ x.issue)
  ---
  {
    id: s.id,
    contactCount: sizeOf(s.contacts default []),
    ready: isEmpty(issues),
    issues: issues
  }
}`,
  explanation: `
Three different "nothing" checks, each with its own job:

- \`== null\` — the key is absent (selecting it returns \`null\`) **or** explicitly \`null\`.
- \`isBlank(s)\` — \`true\` for \`null\`, \`""\` and whitespace-only strings. It accepts only a String or \`null\` (it is in \`dw::Core\`, so no import is needed).
- \`isEmpty(x)\` — \`true\` for \`null\`, \`""\`, \`[]\` and \`{}\`. Note that \`"   "\` is **not** empty, which is why the string check uses \`isBlank\`.

\`sizeOf\` counts items in an array, keys in an object or characters in a string — but it does not accept \`null\`. That is the common trap: S-3 is fine, but a record without a \`contacts\` key makes \`sizeOf(s.contacts)\` fail. \`default []\` makes it \`0\`.

Order matters: test \`null\` first, otherwise \`isEmpty(null)\` would report a missing field as \`empty\`.
`,
  tests: [
    {
      name: 'contacts key absent, empty-string name, null address',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "id": "S-9", "name": "", "taxId": " X1 ", "address": null }]',
        },
      ],
      expected:
        '[{ "id": "S-9", "contactCount": 0, "ready": false, "issues": ["name: blank", "contacts: missing", "address: missing"] }]',
    },
    {
      name: 'No suppliers',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'What is the difference between `isEmpty` and `isBlank`?',
      a: '`isEmpty` works on strings, arrays and objects and is true only when there is nothing at all. `isBlank` works on strings only and is also true for whitespace-only text.',
    },
    {
      q: 'How would you return HTTP 400 with these issues from a Mule flow?',
      a: 'Run this transform in a Validation step (or a Choice on `ready`), and when it is false raise an error with `raise error` or `fail` and map the issues into the APIkit 400 error response.',
    },
    {
      q: 'How would you make the required-field list configurable?',
      a: 'Read it from a property or a second input (e.g. `p("supplier.required") splitBy ","`) instead of hard-coding the array; the rest of the script does not change because it uses a dynamic selector.',
    },
  ],
}

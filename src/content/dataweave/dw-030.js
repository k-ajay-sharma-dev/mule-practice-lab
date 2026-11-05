export default {
  id: 'dw-030',
  category: 'dataweave',
  title: 'Validate Employee Records and Collect All Errors',
  level: 'ADVANCED',
  tags: ['validation', 'try', 'dw::Runtime', 'regex', 'functions'],
  estMinutes: 30,
  description: `
Before new hires are loaded into the payroll system, the HR integration validates every record and returns **all** problems at once (not only the first one), so HR can fix the file in one go.

**Rules** — check each record against all four rules, in this order:

| # | Field | Message when the rule fails |
|---|---|---|
| 1 | \`id\` must be a string matching \`E\` followed by exactly 4 digits | \`id must be E followed by 4 digits\` |
| 2a | \`email\` missing, \`null\` or only whitespace | \`email is required\` |
| 2b | otherwise, \`email\` must match \`^[^@\\s]+@[^@\\s]+\\.[A-Za-z]{2,}$\` | \`email is invalid\` |
| 3 | \`salary\` must be a **Number** greater than 0 (the string \`"4800"\` is not valid) | \`salary must be a positive number\` |
| 4 | \`startDate\` must be a string in \`yyyy-MM-dd\` form that is a real calendar date (missing fails too) | \`startDate must be a valid yyyy-MM-dd date\` |

Only one of 2a / 2b can apply.

**Output**
- \`validCount\` and \`invalidCount\`
- \`errors\` — one entry per invalid record, in input order: \`index\` (0-based position in the input), \`id\` (as received, \`null\` if missing) and \`messages\` (in rule order)
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "id": "E1001", "email": "asha@example.com", "salary": 5200, "startDate": "2026-01-15" },
  { "id": "E12", "email": "ben@example", "salary": "4800", "startDate": "2026-13-01" },
  { "id": "E1003", "email": "   ", "salary": 0, "startDate": "2025-11-30" },
  { "email": "dana@example.org", "salary": 6100.5, "startDate": "01/02/2026" },
  { "id": "E1005", "email": "eve@example.co.uk", "salary": 3900, "startDate": "2024-02-29" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "validCount": 2,
  "invalidCount": 3,
  "errors": [
    {
      "index": 1,
      "id": "E12",
      "messages": [
        "id must be E followed by 4 digits",
        "email is invalid",
        "salary must be a positive number",
        "startDate must be a valid yyyy-MM-dd date"
      ]
    },
    {
      "index": 2,
      "id": "E1003",
      "messages": ["email is required", "salary must be a positive number"]
    },
    {
      "index": 3,
      "id": null,
      "messages": ["id must be E followed by 4 digits", "startDate must be a valid yyyy-MM-dd date"]
    }
  ]
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Write a function `validate(e)` that returns an **array of messages** — an empty array means the record is valid.',
    'Conditional array elements keep it readable: `[ ("msg 1") if (cond1), ("msg 2") if (cond2) ]` only contains the messages whose condition is true.',
    'For the date, `try` from `dw::Runtime` turns a failing coercion into a result: `try(() -> s as Date {format: "yyyy-MM-dd"}).success`. Guard with `s is String` first.',
    'Try `"2026-02-30" as Date {format: "yyyy-MM-dd"}` on its own — the parser is lenient. Formatting the parsed date back to a string and comparing it with the input catches impossible days.',
  ],
  solution: `%dw 2.0
import try from dw::Runtime
output application/json

fun blank(s) = s == null or (s is String and isEmpty(trim(s)))

fun isDate(s) =
  s is String
    and (s matches /\\d{4}-\\d{2}-\\d{2}/)
    and do {
      var parsed = try(() -> s as Date {format: "yyyy-MM-dd"})
      ---
      // the parser quietly turns 2026-02-30 into 2026-02-28, so format it back and compare
      parsed.success and (parsed.result as String {format: "yyyy-MM-dd"}) == s
    }

fun validate(e) = [
  ("id must be E followed by 4 digits") if (!(e.id is String and (e.id matches /E\\d{4}/))),
  ("email is required") if (blank(e.email)),
  ("email is invalid") if (!blank(e.email) and !(e.email is String and (e.email matches /[^@\\s]+@[^@\\s]+\\.[A-Za-z]{2,}/))),
  ("salary must be a positive number") if (!(e.salary is Number and e.salary > 0)),
  ("startDate must be a valid yyyy-MM-dd date") if (!isDate(e.startDate))
]

var results = payload map (e, i) -> { index: i, id: e.id, messages: validate(e) }
var errors = results filter (!isEmpty($.messages))
---
{
  validCount: sizeOf(payload) - sizeOf(errors),
  invalidCount: sizeOf(errors),
  errors: errors
}`,
  explanation: `
The key design choice is that a validator **returns data** (a list of messages) instead of throwing on the first problem. Mule's Validation module or a \`fail()\` would stop at the first error, which is unfriendly for batch files.

Details that trip people up:
- \`matches\` must match the **whole** string, so no \`^\`/\`$\` are needed. \`contains\` with a regex would accept \`xxE1234yy\`.
- Type checks first: \`"4800" > 0\` is **true** because DataWeave coerces the string for the comparison, so \`e.salary > 0\` alone would accept a string salary. \`e.salary is Number and ...\` enforces the type.
- A regex alone accepts \`2026-13-01\`. Parsing with \`as Date\` inside \`try\` rejects impossible dates without failing the whole script.
- Parsing is lenient about the day of month: \`"2026-02-30" as Date {format: "yyyy-MM-dd"}\` returns \`2026-02-28\` instead of failing. Formatting the result back and comparing with the input catches that.
- \`map (e, i)\` gives the zero-based index needed for \`index\`.
`,
  tests: [
    {
      name: 'All valid, and a record with every field missing',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[{ "id": "E0001", "email": "a.b@c.io", "salary": 1, "startDate": "2026-12-31" }, {}, { "id": "E9999", "email": "x@y.nl", "salary": 0.01, "startDate": "2027-01-01" }]',
        },
      ],
      expected:
        '{ "validCount": 2, "invalidCount": 1, "errors": [{ "index": 1, "id": null, "messages": ["id must be E followed by 4 digits", "email is required", "salary must be a positive number", "startDate must be a valid yyyy-MM-dd date"] }] }',
    },
    {
      name: 'Wrong types and near-miss formats',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[{ "id": "e1234", "email": "two@@x.com", "salary": -5, "startDate": "2026-1-05" }, { "id": "E12345", "email": "ok@x.com", "salary": 10, "startDate": 20260105 }, { "id": "E2000", "email": "feb@x.com", "salary": 10, "startDate": "2026-02-30" }]',
        },
      ],
      expected:
        '{ "validCount": 0, "invalidCount": 3, "errors": [{ "index": 0, "id": "e1234", "messages": ["id must be E followed by 4 digits", "email is invalid", "salary must be a positive number", "startDate must be a valid yyyy-MM-dd date"] }, { "index": 1, "id": "E12345", "messages": ["id must be E followed by 4 digits", "startDate must be a valid yyyy-MM-dd date"] }, { "index": 2, "id": "E2000", "messages": ["startDate must be a valid yyyy-MM-dd date"] }] }',
    },
  ],
  followUps: [
    {
      q: 'How would you route valid and invalid records to different targets in the same flow?',
      a: 'Return both lists from DataWeave (e.g. `valid` and `invalid`), then use a Choice router or by sending each list to its own target; with `dw::core::Arrays::partition` you can split the records in one pass.',
    },
    {
      q: 'How would you make the rules configurable instead of hard-coded?',
      a: 'Represent each rule as data — `{ field, message, check: (v) -> Boolean }` — in an array, then `rules filter (!$.check(e[$.field])) map $.message`. New rules become new entries, not new code.',
    },
    {
      q: 'What does `try` return when the coercion fails?',
      a: 'An object with `success: false` and an `error` object (message, kind, location) instead of throwing, so the script keeps running. On success it has `success: true` and `result`.',
    },
  ],
}

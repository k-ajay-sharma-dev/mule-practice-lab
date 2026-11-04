export default {
  id: 'dw-036',
  category: 'dataweave',
  title: 'Extract Ticket References with scan and Capture Groups',
  level: 'INTERMEDIATE',
  tags: ['regex', 'scan', 'replace', 'capture-groups', 'strings'],
  estMinutes: 25,
  description: `
A Mule flow polls the support mailbox and links each email to ServiceNow tickets mentioned in its subject. Agents type references inconsistently (\`inc-2024-42\`, \`INC-2024-00042\`), so they must be extracted and **normalised**.

A reference is \`TYPE-YEAR-NUMBER\` where:
- \`TYPE\` is \`INC\`, \`REQ\` or \`CHG\`, in any letter case
- \`YEAR\` is exactly 4 digits, \`NUMBER\` is 1 to 5 digits
- it is a whole word: not preceded or followed by a letter, digit or underscore (so \`XINC-2024-1\` and \`CHG-2025-123456\` are **not** references)

The normalised form is \`TYPE\` upper-cased and \`NUMBER\` left-padded with zeros to 5 digits: \`inc-2024-42\` → \`INC-2024-00042\`.

For each email return \`{ id, refs, subject }\`:
- \`refs\` — normalised references in order of first appearance, without duplicates (\`[]\` if none)
- \`subject\` — the original subject with (1) any number of leading \`RE:\`, \`FW:\` or \`FWD:\` prefixes removed (any case, each optionally followed by whitespace), (2) every reference replaced in place by its normalised form, and (3) leading/trailing whitespace trimmed
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "id": "M-1", "subject": "RE: RE: inc-2024-42 printer offline on floor 3" },
  { "id": "M-2", "subject": "FW: Merge REQ-2023-7 into INC-2024-00042 and inc-2024-042" },
  { "id": "M-3", "subject": "Weekly CHG-2025-1500 / chg-2025-123456 review" },
  { "id": "M-4", "subject": "Fwd: no reference here" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "id": "M-1", "refs": ["INC-2024-00042"], "subject": "INC-2024-00042 printer offline on floor 3" },
  { "id": "M-2", "refs": ["REQ-2023-00007", "INC-2024-00042"], "subject": "Merge REQ-2023-00007 into INC-2024-00042 and INC-2024-00042" },
  { "id": "M-3", "refs": ["CHG-2025-01500"], "subject": "Weekly CHG-2025-01500 / chg-2025-123456 review" },
  { "id": "M-4", "refs": [], "subject": "no reference here" }
]`,
  },
  starterCode: `%dw 2.0
import leftPad from dw::core::Strings
output application/json
---
payload
`,
  hints: [
    'One regex with three capture groups does the work: `/(?i)\\b(INC|REQ|CHG)-(\\d{4})-(\\d{1,5})\\b/`. `(?i)` makes it case-insensitive and `\\b` enforces the whole-word rule.',
    '`text scan regex` returns one array per match: `[fullMatch, group1, group2, group3]`. `replace regex with ((m) -> ...)` passes the **same** array to your lambda.',
    'Write one `normalise(m)` function and use it in both the `scan` and the `replace`. Strip the reply prefixes with an anchored regex: `/(?i)^((re|fwd?):\\s*)+/`.',
  ],
  solution: `%dw 2.0
import leftPad from dw::core::Strings
output application/json

var refPattern = /(?i)\\b(INC|REQ|CHG)-(\\d{4})-(\\d{1,5})\\b/

fun normalise(m: Array<String>): String =
  upper(m[1]) ++ "-" ++ m[2] ++ "-" ++ leftPad(m[3], 5, "0")
---
payload map (mail) -> {
  id: mail.id,
  refs: ((mail.subject scan refPattern) map normalise($)) distinctBy $,
  subject: trim(
    (mail.subject replace /(?i)^((re|fwd?):\\s*)+/ with "")
      replace refPattern with ((m) -> normalise(m))
  )
}`,
  explanation: `
**\`scan\` vs \`match\`.** \`match\` (the function) tests one regex against the whole string and returns the groups of that single match. \`scan\` finds **every** match and returns an array of group arrays — exactly what you need when a subject mentions several tickets.

**Capture groups in \`replace\`.** When \`with\` gets a lambda, it receives the same \`[full, g1, g2, ...]\` array per match, so normalising in place reuses the same function. A plain string replacement could not left-pad the number.

**Boundaries.** \`\\b\` stops \`XINC-2024-1\` from matching inside a word, and the trailing \`\\b\` rejects a 6-digit number: the engine backtracks to 5, 4, ... digits but the next character is always another digit, so there is never a word boundary.

**Common traps**
- Forgetting \`(?i)\` (or lower-casing the whole subject, which also changes the text you must return).
- Deduplicating *before* normalising: \`inc-2024-42\` and \`INC-2024-00042\` only become equal after normalisation.
- Stripping only one \`RE:\`; the \`+\` repeats the prefix group, and \`^\` keeps it at the start so a "re:" in the middle of the subject is untouched.
`,
  tests: [
    {
      name: 'Stacked prefixes and duplicates in different forms',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "id": "M-5", "subject": "re:Fwd:FW:   REQ-2024-1 req-2024-0001" }]',
        },
      ],
      expected: '[{ "id": "M-5", "refs": ["REQ-2024-00001"], "subject": "REQ-2024-00001 REQ-2024-00001" }]',
    },
    {
      name: 'Near misses are not references',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "id": "M-6", "subject": "XINC-2024-1 INC-20245-1 TASK-2024-1 inc-2024-7_b" }]',
        },
      ],
      expected: '[{ "id": "M-6", "refs": [], "subject": "XINC-2024-1 INC-20245-1 TASK-2024-1 inc-2024-7_b" }]',
    },
  ],
  followUps: [
    {
      q: 'What does `"a1b22" scan /\\d+/` return, and how is that different from `match`?',
      a: '`scan` returns `[["1"], ["22"]]` — every match, each as an array. `"a1b22" match /\\d+/` returns `[]`, because `match` must match the **whole** string; it is for a single, full-string match with capture groups.',
    },
    {
      q: 'How would you just test whether a subject contains any reference?',
      a: 'Use `contains` with a regex — `mail.subject contains refPattern` — or `!isEmpty(mail.subject scan refPattern)`. `matches` would be wrong because it requires the whole string to match.',
    },
    {
      q: 'Where would you keep a regex used by several transformations?',
      a: 'In a custom DataWeave module (e.g. `modules/Tickets.dwl`) exposing `refPattern` and `normalise`, imported with `import * from modules::Tickets`, so every flow normalises the same way.',
    },
  ],
}

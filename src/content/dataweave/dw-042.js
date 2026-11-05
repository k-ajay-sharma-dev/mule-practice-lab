export default {
  id: 'dw-042',
  category: 'dataweave',
  title: 'Mask Card Numbers and Format IBANs for a Support Screen',
  level: 'INTERMEDIATE',
  tags: ['strings', 'masking', 'regex', 'repeat', 'pci'],
  estMinutes: 15,
  description: `
The customer-support portal shows a customer's stored payment methods. PCI and GDPR rules say agents may only see a **masked** version of each number, printed in readable groups.

Each input item has a \`type\` (\`CARD\` or \`IBAN\`) and a \`number\` typed by a human — it may contain spaces or dashes and lower-case letters.

**Rules**
1. **Normalize** the number: remove all spaces and dashes, then upper-case it.
2. **Mask**: replace every character with \`*\` except
   - \`CARD\`: the **last 4** characters,
   - \`IBAN\`: the **first 4** (country code + check digits) and the **last 4** characters.
3. **Group** the masked value in blocks of 4 characters from the left, separated by a single space (the last block may be shorter).
4. Output one object per item, in input order: \`type\`, \`display\` (the grouped, masked value) and \`last4\` (the last 4 characters of the normalized number).

| type | number | display |
|---|---|---|
| CARD | \`4111-1111-1111-1234\` | \`**** **** **** 1234\` |
| IBAN | \`nl91 abna 0417 1643 00\` | \`NL91 **** **** **43 00\` |
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "type": "CARD", "number": "4111-1111-1111-1234" },
  { "type": "IBAN", "number": "nl91 abna 0417 1643 00" },
  { "type": "CARD", "number": "5500 0000 0000 0004" },
  { "type": "IBAN", "number": "DE89370400440532013000" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "type": "CARD", "display": "**** **** **** 1234", "last4": "1234" },
  { "type": "IBAN", "display": "NL91 **** **** **43 00", "last4": "4300" },
  { "type": "CARD", "display": "**** **** **** 0004", "last4": "0004" },
  { "type": "IBAN", "display": "DE89 **** **** **** **30 00", "last4": "3000" }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Normalize with a regex: `upper(item.number replace /[\\s-]/ with "")`. Slices with negative indexes take the end of a string: `s[-4 to -1]`.',
    '`repeat("*", n)` from `dw::core::Strings` builds the mask. For an IBAN the result is `s[0 to 3] ++ repeat("*", sizeOf(s) - 8) ++ s[-4 to -1]`.',
    'Grouping: insert a space after every 4 characters that are not at the end — `masked replace /(.{4})(?!$)/ with ($[1] ++ " ")`.',
  ],
  solution: `%dw 2.0
import repeat from dw::core::Strings
output application/json

fun group4(s: String): String = s replace /(.{4})(?!$)/ with ($[1] ++ " ")
---
payload map (item) -> do {
  var n = upper(item.number replace /[\\s-]/ with "")
  var last4 = n[-4 to -1]
  var masked = if (item."type" == "IBAN")
      n[0 to 3] ++ repeat("*", sizeOf(n) - 8) ++ last4
    else
      repeat("*", sizeOf(n) - 4) ++ last4
  ---
  {
    "type": item."type",
    display: group4(masked),
    last4: last4
  }
}`,
  explanation: `
Work in three small steps — **normalize → mask → group** — and each one is a one-liner:

- \`replace /[\\s-]/ with ""\` strips both spaces and dashes in one pass; \`upper\` fixes the lower-case IBAN.
- Negative slice indexes count from the end, so \`n[-4 to -1]\` is always the last four characters, whatever the length. Both ends of \`to\` are **inclusive**.
- \`repeat("*", count)\` builds the mask. Because the mask length is computed from the normalized length, a 15-digit Amex or a 22-character IBAN work without special cases.
- The regex \`(.{4})(?!$)\` matches each 4-character block that is *not* at the end of the string, and the replacement adds a space after it. That is why there is no trailing space.

Common traps:
- Grouping **before** masking, or masking the raw input: the spaces and dashes typed by the user end up counted as characters and the last 4 shift.
- Using \`n[12 to 15]\` for the last 4 — that only works for 16-digit cards.
- Forgetting the \`(?!$)\` look-ahead: \`replace /(.{4})/ with ($[1] ++ " ")\` leaves a trailing space on every 16-digit card.
`,
  tests: [
    {
      name: 'Amex (15 digits) and an odd-length IBAN',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "type": "CARD", "number": "3782 822463 10005" }, { "type": "IBAN", "number": "be71-0961-2345-6769" }]',
        },
      ],
      expected:
        '[{ "type": "CARD", "display": "**** **** ***0 005", "last4": "0005" }, { "type": "IBAN", "display": "BE71 **** **** 6769", "last4": "6769" }]',
    },
    {
      name: 'Empty list',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'Is masking in DataWeave enough to be PCI compliant?',
      a: 'No. Masking only controls what is displayed; the full PAN must not be stored or logged at all (watch Logger components and error payloads). Use tokenization at the edge so Mule only ever sees a token.',
    },
    {
      q: 'How would you validate the IBAN checksum in DataWeave?',
      a: 'Move the first 4 characters to the end, convert letters to numbers (A=10 … Z=35), and check that the resulting big integer mod 97 equals 1. DataWeave numbers are arbitrary precision, so the mod works directly on the long number.',
    },
    {
      q: 'How would you reuse this masking in several Mule flows?',
      a: 'Put the functions in a module file such as `src/main/resources/modules/Masking.dwl` and `import * from modules::Masking` in every script that needs it.',
    },
  ],
}

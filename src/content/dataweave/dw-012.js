export default {
  id: 'dw-012',
  category: 'dataweave',
  title: 'Normalize Messy Product SKUs',
  level: 'BEGINNER',
  tags: ['strings', 'regex', 'replace', 'leftPad', 'json'],
  estMinutes: 15,
  description: `
Store managers type SKUs by hand into a spreadsheet, so the codes arrive in every possible shape: \`" ab-12 "\`, \`"Cd_7"\`, \`"xy 305"\`. The warehouse system only accepts the canonical form \`AB-00012\`.

Input: \`{ "codes": [ ...raw strings... ] }\`. Output an array with one object per code, **in the input order**:

- \`raw\` — the original string, unchanged
- \`sku\` — the canonical code, built like this:
  1. Remove **every** character that is not a letter or a digit (spaces, \`-\`, \`_\`, dots, …).
  2. Upper-case the result.
  3. What remains is always letters followed by digits. Output \`LETTERS-DIGITS\`, with the digit part **left-padded with zeros to 5 characters**. Digit parts longer than 5 characters are kept as they are (never truncated).

An empty \`codes\` array produces \`[]\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "codes": [" ab-12 ", "Cd_7", "xy 305", "LMN.123456"]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "raw": " ab-12 ", "sku": "AB-00012" },
  { "raw": "Cd_7", "sku": "CD-00007" },
  { "raw": "xy 305", "sku": "XY-00305" },
  { "raw": "LMN.123456", "sku": "LMN-123456" }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    '`replace /regex/ with ""` replaces **all** matches. A negated class like `/[^A-Za-z0-9]/` catches every unwanted character.',
    'The `match` function with a regex containing groups returns an array: index 0 is the whole match, 1 and 2 are the groups.',
    '`leftPad(text, 5, "0")` from `dw::core::Strings` pads on the left and never shortens a longer string.',
  ],
  solution: `%dw 2.0
import leftPad from dw::core::Strings
output application/json
---
payload.codes map (raw) -> do {
  var clean = upper(raw replace /[^A-Za-z0-9]/ with "")
  var parts = clean match /^([A-Z]+)([0-9]+)$/
  ---
  {
    raw: raw,
    sku: parts[1] ++ "-" ++ leftPad(parts[2], 5, "0")
  }
}`,
  explanation: `
Cleaning first and parsing second keeps each step simple: once every separator is gone, the regex \`^([A-Z]+)([0-9]+)$\` only has to split letters from digits.

\`match\` (the function, with a regex) returns the full match plus every capture group, so \`parts[1]\` and \`parts[2]\` are the letter and digit parts.

**Common trap:** using \`trim\` instead of a regex. \`trim\` only removes whitespace at the ends — it leaves the \`-\`, \`_\` and inner spaces in place.
`,
  tests: [
    {
      name: 'Empty list',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{ "codes": [] }' }],
      expected: '[]',
    },
    {
      name: 'Separators everywhere and a long number',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{ "codes": ["-q-1-", "zz__0000001"] }' }],
      expected: '[{ "raw": "-q-1-", "sku": "Q-00001" }, { "raw": "zz__0000001", "sku": "ZZ-0000001" }]',
    },
  ],
  followUps: [
    {
      q: 'What is the difference between `match` and `matches`?',
      a: '`matches` returns a Boolean telling you whether the whole string fits the regex. `match` returns an array with the full match and every capture group, which is what you need to pull out parts.',
    },
    {
      q: 'How would you reject codes that do not fit the pattern instead of failing?',
      a: 'Check `clean matches /^[A-Z]+[0-9]+$/` first and output `sku: null` (or route the record to an error list) when it is false. Indexing into the result of a failed `match` gives `null`, so `++` on it would throw.',
    },
  ],
}

export default {
  id: 'dw-151',
  category: 'dataweave',
  title: 'Validate IBANs with the Mod 97 Check',
  level: 'ADVANCED',
  tags: ['validation', 'iban', 'mod-97', 'reduce', 'charCode', 'dw::core::Strings', 'banking', 'json'],
  estMinutes: 25,
  description: `
Ravensworth Payroll Services collects employee bank details through a web form and sends them to a payment bureau each month. A typing mistake in an IBAN makes a salary payment bounce, so the integration now checks every IBAN before it is stored.

For each input, output:

- \`input\`: copied as typed
- \`iban\`: the IBAN with spaces removed and letters in upper case
- \`valid\`: \`true\` or \`false\`
- \`reason\`: \`null\` when valid. Otherwise the first rule that fails:
  1. \`"bad format"\`: not two letters, two digits, then letters and digits only
  2. \`"unknown country XX"\`: the first two letters are not in the length table
  3. \`"wrong length"\`: the length does not match the table
  4. \`"check digits fail"\`: the mod 97 check fails

Lengths: \`GB\` 22, \`DE\` 22, \`FR\` 27, \`NL\` 18.

**The mod 97 check.** Move the first four characters to the end. Replace each letter with two digits: A is 10, B is 11, up to Z, which is 35. Read the result as one big number. The IBAN is valid when that number divided by 97 leaves 1. The number is far too long for most number types, so work through it one digit at a time and keep only the remainder.

The IBANs here are made up for practice.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  "gb30 kest 4005 1531 9268 19",
  "DE12 5001 0517 0648 4898 90",
  "GB30 KEST 4005 1531 9268 18",
  "NL32 LARK 0417 2963 5",
  "12GB KEST 4005"
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "input": "gb30 kest 4005 1531 9268 19", "iban": "GB30KEST40051531926819", "valid": true, "reason": null },
  { "input": "DE12 5001 0517 0648 4898 90", "iban": "DE12500105170648489890", "valid": true, "reason": null },
  { "input": "GB30 KEST 4005 1531 9268 18", "iban": "GB30KEST40051531926818", "valid": false, "reason": "check digits fail" },
  { "input": "NL32 LARK 0417 2963 5", "iban": "NL32LARK041729635", "valid": false, "reason": "wrong length" },
  { "input": "12GB KEST 4005", "iban": "12GBKEST4005", "valid": false, "reason": "bad format" }
]`,
  },
  starterCode: `%dw 2.0
output application/json
import charCode from dw::core::Strings
var lengths = { GB: 22, DE: 22, FR: 27, NL: 18 }
---
payload map (raw) -> {
  "input": raw,
  iban: upper(raw replace /\\s+/ with ""),
  valid: false,
  reason: null
}
`,
  hints: [
    'Normalise first: `upper(raw replace /\\s+/ with "")`. Every rule then works on the same text.',
    'Check the rules in order with `if ... else if`, and return a reason text from each. The mod 97 rule comes last.',
    'Move the first four characters to the end with `iban[4 to -1] ++ iban[0 to 3]`.',
    'Turn each character into digits: a letter becomes `(charCode(c) - 55) as String`, because `charCode("A")` is 65. Join them all into one string of digits.',
    'Reduce over the digits: `(d, acc = 0) -> (acc * 10 + (d as Number)) mod 97`. The final remainder must be 1.',
  ],
  solution: `%dw 2.0
output application/json
import charCode from dw::core::Strings
var lengths = { GB: 22, DE: 22, FR: 27, NL: 18 }

fun digitsOf(text) = ((text splitBy "") map (c) ->
  if (c matches /[A-Z]/) (charCode(c) - 55) as String else c) joinBy ""

fun mod97(iban) = do {
  var moved = iban[4 to -1] ++ iban[0 to 3]
  ---
  (digitsOf(moved) splitBy "") reduce ((d, acc = 0) -> (acc * 10 + (d as Number)) mod 97)
}

fun reasonFor(iban) = do {
  var country = iban[0 to 1]
  ---
  if (not (iban matches /[A-Z]{2}[0-9]{2}[A-Z0-9]+/)) "bad format"
  else if (lengths[country] == null) "unknown country " ++ country
  else if (sizeOf(iban) != lengths[country]) "wrong length"
  else if (mod97(iban) != 1) "check digits fail"
  else null
}
---
payload map (raw) -> do {
  var iban = upper(raw replace /\\s+/ with "")
  var reason = reasonFor(iban)
  ---
  { "input": raw, iban: iban, valid: reason == null, reason: reason }
}`,
  explanation: `
**Normalise once.** People type IBANs in groups of four and in lower case. Removing the spaces and using \`upper\` first means every rule sees the same text, and the output shows the form to store.

**Cheap checks first.** The format and length checks catch most typing mistakes and give a clear reason. The mod 97 check runs only on IBANs that already have the right shape.

**Letters to digits.** \`charCode("A")\` is 65, so \`charCode(c) - 55\` gives 10 for A and 35 for Z. Digits stay as they are.

**Remainder by steps.** The digit string for a 22 character IBAN is over 30 digits long. Reading it as one number loses precision in many languages and tools. The remainder of a long number can be built one digit at a time: multiply the remainder so far by 10, add the next digit, and take \`mod 97\` again. The value never grows past 970.

**What the check catches.** The third input differs from the first in its last digit, and the remainder is no longer 1. The check catches a single wrong digit and most swaps of two digits next to each other.
`,
  tests: [
    {
      name: 'A valid French IBAN and an unknown country',
      inputs: [{ name: 'payload', mime: 'application/json', content: '["FR83 3002 7176 5900 0421 8805 711", "XX12 3456"]' }],
      expected:
        '[{ "input": "FR83 3002 7176 5900 0421 8805 711", "iban": "FR8330027176590004218805711", "valid": true, "reason": null }, { "input": "XX12 3456", "iban": "XX123456", "valid": false, "reason": "unknown country XX" }]',
    },
    {
      name: 'Two digits swapped',
      inputs: [{ name: 'payload', mime: 'application/json', content: '["NL32LARK0417296351", "NL32LARK0471296351"]' }],
      expected:
        '[{ "input": "NL32LARK0417296351", "iban": "NL32LARK0417296351", "valid": true, "reason": null }, { "input": "NL32LARK0471296351", "iban": "NL32LARK0471296351", "valid": false, "reason": "check digits fail" }]',
    },
  ],
  followUps: [
    {
      q: 'Does a valid check prove the account exists?',
      a: 'No. It only shows the IBAN was typed without a common mistake. The bank or a validation service can confirm the account and its holder.',
    },
    {
      q: 'Where would you keep the length table in a real app?',
      a: 'In a lookup file or a small DataWeave module shared by the apps that need it, so a new country is added in one place.',
    },
    {
      q: 'How would you show the IBAN back to the user?',
      a: 'In groups of four, which is how people read and compare it. Mask most of it on screens that do not need the full value.',
    },
  ],
}

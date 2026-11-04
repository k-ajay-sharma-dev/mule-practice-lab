export default {
  id: 'dw-032',
  category: 'dataweave',
  title: 'Reverse Strings and Detect Palindromes',
  level: 'BEGINNER',
  tags: ['strings', 'ranges', 'reverse', 'regex', 'interview-classic'],
  estMinutes: 15,
  description: `
"Reverse a string" and "is it a palindrome?" are the most common DataWeave warm-up questions. A QA harness sends a list of strings to a test endpoint and expects a report for each one.

For every string in \`payload\`, return \`{ text, reversed, isPalindrome }\`.

**Rules**
- \`text\` — the original string, unchanged.
- \`reversed\` — the exact characters of \`text\` in reverse order (case, spaces and punctuation kept). The reverse of \`""\` is \`""\` (**not** \`null\`).
- \`isPalindrome\` — compare the string with its reverse after **normalising** it: lowercase it and remove every character that is not \`a-z\` or \`0-9\`. If nothing is left after normalising, the result is \`true\`.
- Keep the input order.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  "Racecar",
  "Never odd or even",
  "MuleSoft",
  "Was it a car or a cat I saw?",
  "12321",
  "Mule 4"
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "text": "Racecar", "reversed": "racecaR", "isPalindrome": true },
  { "text": "Never odd or even", "reversed": "neve ro ddo reveN", "isPalindrome": true },
  { "text": "MuleSoft", "reversed": "tfoSeluM", "isPalindrome": false },
  { "text": "Was it a car or a cat I saw?", "reversed": "?was I tac a ro rac a ti saW", "isPalindrome": true },
  { "text": "12321", "reversed": "12321", "isPalindrome": true },
  { "text": "Mule 4", "reversed": "4 eluM", "isPalindrome": false }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'A string can be indexed like an array, and ranges can run backwards: `"abc"[-1 to 0]` is `"cba"`.',
    'Normalise with `lower(s) replace /[^a-z0-9]/ with ""`, then compare the normalised value with its own reverse.',
    'Try your reverse on `""`. A range selector on an empty string returns `null`, so guard it (or use `reverse` from `dw::core::Strings`).',
  ],
  solution: `%dw 2.0
output application/json

fun rev(s: String): String = if (isEmpty(s)) "" else s[-1 to 0]
fun normalise(s: String): String = lower(s) replace /[^a-z0-9]/ with ""
---
payload map (t) -> do {
  var n = normalise(t)
  ---
  {
    text: t,
    reversed: rev(t),
    isPalindrome: n == rev(n)
  }
}`,
  explanation: `
**Reversing.** \`s[-1 to 0]\` selects characters from the last index down to the first — a negative index counts from the end and a range whose start is greater than its end walks backwards. \`dw::core::Strings::reverse(s)\` does the same thing and is worth naming in an interview.

**Normalising.** Palindrome questions almost always mean "ignoring case, spaces and punctuation". \`lower\` first, then remove everything outside \`[a-z0-9]\` with a regex \`replace\`. Doing it in the other order would strip upper-case letters.

**The trap.** On an empty string \`""[-1 to 0]\` returns \`null\`, not \`""\`. So \`"?!"\` normalises to \`""\`, and a naive \`n == n[-1 to 0]\` compares \`""\` with \`null\` and returns \`false\`. Guarding with \`isEmpty\` (or using \`Strings::reverse\`) fixes both the \`reversed\` field and the palindrome check.
`,
  tests: [
    {
      name: 'Empty and punctuation-only strings',
      inputs: [{ name: 'payload', mime: 'application/json', content: '["", "?!", "a"]' }],
      expected:
        '[{ "text": "", "reversed": "", "isPalindrome": true }, { "text": "?!", "reversed": "!?", "isPalindrome": true }, { "text": "a", "reversed": "a", "isPalindrome": true }]',
    },
    {
      name: 'Digits and mixed case',
      inputs: [{ name: 'payload', mime: 'application/json', content: '["No 1 on, 1 oN", "AbBa-2"]' }],
      expected:
        '[{ "text": "No 1 on, 1 oN", "reversed": "No 1 ,no 1 oN", "isPalindrome": false }, { "text": "AbBa-2", "reversed": "2-aBbA", "isPalindrome": false }]',
    },
  ],
  followUps: [
    {
      q: 'How would you count how many times each character occurs in a string?',
      a: 'Split it into characters with `s splitBy ""`, then `groupBy $` and `mapObject (v, k) -> { (k): sizeOf(v) }` — or `countBy` from `dw::core::Arrays` after the split.',
    },
    {
      q: 'How do you reverse the order of words instead of characters?',
      a: 'Split on whitespace, reverse the array and join: `(s splitBy /\\s+/)[-1 to 0] joinBy " "`. The same empty-input guard applies, because a range on an empty array also returns null.',
    },
    {
      q: 'Is there a built-in reverse?',
      a: 'Yes, `reverse` in `dw::core::Strings` reverses a string. For arrays, the `[-1 to 0]` range selector is the usual idiom.',
    },
  ],
}

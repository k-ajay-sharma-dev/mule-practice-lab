export default {
  id: 'dw-138',
  category: 'dataweave',
  title: 'Write Edition Numbers as Roman Numerals with Recursion',
  level: 'ADVANCED',
  tags: ['recursion', 'functions', 'roman-numerals', 'filter', 'interview-classic', 'json'],
  estMinutes: 25,
  description: `
Fenwick Film Festival prints its edition number and year in Roman numerals on every poster. The design team sends a list of numbers and wants them back as numerals.

Roman numerals use these values, largest first:

| Value | 1000 | 900 | 500 | 400 | 100 | 90 | 50 | 40 | 10 | 9 | 5 | 4 | 1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Symbol | M | CM | D | CD | C | XC | L | XL | X | IX | V | IV | I |

Take the largest value that fits, write its symbol, subtract it, and repeat until nothing is left. So 1994 is M + CM + XC + IV, which gives \`MCMXCIV\`.

Output one object per number with \`number\` and \`roman\`. Only 1 to 3999 can be written this way. Any other number gets \`roman: null\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[2026, 1994, 4, 49, 3999, 0]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "number": 2026, "roman": "MMXXVI" },
  { "number": 1994, "roman": "MCMXCIV" },
  { "number": 4, "roman": "IV" },
  { "number": 49, "roman": "XLIX" },
  { "number": 3999, "roman": "MMMCMXCIX" },
  { "number": 0, "roman": null }
]`,
  },
  starterCode: `%dw 2.0
output application/json
var numerals = [
  { value: 1000, symbol: "M" }, { value: 900, symbol: "CM" }, { value: 500, symbol: "D" }, { value: 400, symbol: "CD" },
  { value: 100, symbol: "C" }, { value: 90, symbol: "XC" }, { value: 50, symbol: "L" }, { value: 40, symbol: "XL" },
  { value: 10, symbol: "X" }, { value: 9, symbol: "IX" }, { value: 5, symbol: "V" }, { value: 4, symbol: "IV" },
  { value: 1, symbol: "I" }
]
---
payload map (n) -> {
  number: n,
  roman: ""
}
`,
  hints: [
    'Write a function `fun toRoman(n: Number): String`. When `n` is 0, return an empty string. That stops the recursion.',
    'The list is sorted largest first, so `(numerals filter ($.value <= n))[0]` is the largest value that fits.',
    'Return that symbol joined with the rest: `top.symbol ++ toRoman(n - top.value)`.',
    'Check the range before you call the function: `if (n >= 1 and n <= 3999) toRoman(n) else null`.',
  ],
  solution: `%dw 2.0
output application/json
var numerals = [
  { value: 1000, symbol: "M" }, { value: 900, symbol: "CM" }, { value: 500, symbol: "D" }, { value: 400, symbol: "CD" },
  { value: 100, symbol: "C" }, { value: 90, symbol: "XC" }, { value: 50, symbol: "L" }, { value: 40, symbol: "XL" },
  { value: 10, symbol: "X" }, { value: 9, symbol: "IX" }, { value: 5, symbol: "V" }, { value: 4, symbol: "IV" },
  { value: 1, symbol: "I" }
]

fun toRoman(n: Number): String =
  if (n == 0) ""
  else do {
    var top = (numerals filter ($.value <= n))[0]
    ---
    top.symbol ++ toRoman(n - top.value)
  }
---
payload map (n) -> {
  number: n,
  roman: if (n >= 1 and n <= 3999) toRoman(n) else null
}`,
  explanation: `
**The table does the work.** Putting the pairs such as 900 and CM in the table means the function never has to think about subtraction rules. It always takes the largest value that fits.

**The recursion.** Each call writes one symbol and passes on what is left. 49 becomes XL and 9, then IX and 0, and 0 returns an empty string. The deepest call for 3888 is 15 levels down, which is well within limits.

**The base case.** \`n == 0\` ends the calls. Without it, the filter would find no value for 0, \`top\` would be null, and there would be nothing to subtract.

**The range check.** 0 and negative numbers have no Roman form, and 4000 would need a symbol the table does not have. The check sits outside the function, so \`toRoman\` only ever gets numbers it can write.
`,
  tests: [
    {
      name: 'Numbers that use every pair',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[3888, 944, 1]' }],
      expected: '[{ "number": 3888, "roman": "MMMDCCCLXXXVIII" }, { "number": 944, "roman": "CMXLIV" }, { "number": 1, "roman": "I" }]',
    },
    {
      name: 'Out of range on both sides',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[-5, 4000]' }],
      expected: '[{ "number": -5, "roman": null }, { "number": 4000, "roman": null }]',
    },
    {
      name: 'No numbers',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'Could you do this without recursion?',
      a: 'Yes. Use `reduce` over the table, carrying the text so far and the amount left. For each pair, repeat the symbol as many times as the value fits, with `floor(left / value)`, and subtract that much.',
    },
    {
      q: 'How would you turn a numeral back into a number?',
      a: 'Read it from left to right. Add each symbol\'s value, but subtract it when the next symbol is larger, as with the I in IV. Then convert the result back and compare it with the input to reject numerals such as IIII.',
    },
    {
      q: 'What would happen with 12.5?',
      a: 'The function would reach 0.5, where no value fits, so `top` is null and the next step has nothing to subtract. Add a check that the number is whole, for example `n mod 1 == 0`, to the range check.',
    },
  ],
}

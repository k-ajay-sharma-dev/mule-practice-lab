export default {
  id: 'dw-128',
  category: 'dataweave',
  title: 'Validate Loyalty Card Numbers with the Luhn Check Digit',
  level: 'ADVANCED',
  tags: ['functions', 'strings', 'arrays', 'ranges', 'validation', 'retail', 'json'],
  estMinutes: 25,
  description: `
A supermarket chain lets customers type their loyalty card number on its website. Staff found that many points went missing because of typing mistakes: one wrong digit, or two digits swapped.

The card numbers end in a **check digit** worked out with the **Luhn** rule, the same rule used on payment cards. The API should catch most typing mistakes before it calls the loyalty system.

The Luhn rule:

1. Start from the **rightmost** digit, which is the check digit, and move left.
2. Leave the 1st, 3rd, 5th digit and so on as they are.
3. Double the 2nd, 4th, 6th digit and so on. If the result is above 9, subtract 9.
4. Add all the digits up. The number passes when the total ends in 0.

Output an array with, for each card:

- \`cardNumber\`, copied as it is
- \`valid\`: \`true\` only when the number is **exactly 16 digits** and passes the Luhn rule

Card numbers arrive as Strings. Anything that is not 16 digits, such as a number with spaces, is \`false\` and must not stop the script.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "cardNumber": "6048120000345675" },
  { "cardNumber": "6048120000345679" },
  { "cardNumber": "6048120000987658" },
  { "cardNumber": "6048 1200 0098 7658" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "cardNumber": "6048120000345675", "valid": true },
  { "cardNumber": "6048120000345679", "valid": false },
  { "cardNumber": "6048120000987658", "valid": true },
  { "cardNumber": "6048 1200 0098 7658", "valid": false }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload map (card) -> {
  cardNumber: card.cardNumber,
  valid: false
}
`,
  hints: [
    'A String can be read by position: `text[0]` is its first character. `(0 to sizeOf(text) - 1) map ((i) -> text[i] as Number)` gives an array of digits.',
    '`[-1 to 0]` reverses an array, so the check digit comes first and has index 0.',
    'After reversing, the digits to double are at the odd indexes. `map ((d, i) -> ...)` gives you the index, and `isOdd(i)` tests it.',
    '`sum(...)` adds up an array, and `total mod 10` gives the last digit of the total. Put it in brackets before you compare it, so the two steps run in the order you mean: `(total mod 10) == 0`.',
    'Check the format first with `matches /[0-9]{16}/`, and only run the Luhn function when it passes, so a space never reaches `as Number`.',
  ],
  solution: `%dw 2.0
output application/json
fun digitsOf(text: String): Array<Number> =
  (0 to sizeOf(text) - 1) map ((i) -> text[i] as Number)

fun passesLuhn(number: String): Boolean = do {
  var fromRight = digitsOf(number)[-1 to 0]
  var total = sum(fromRight map ((d, i) ->
    if (isOdd(i)) (if (d * 2 > 9) d * 2 - 9 else d * 2) else d))
  ---
  (total mod 10) == 0
}
---
payload map (card) -> {
  cardNumber: card.cardNumber,
  valid: if (card.cardNumber matches /[0-9]{16}/) passesLuhn(card.cardNumber) else false
}`,
  explanation: `
**Digits from the right.** \`digitsOf\` reads the String one character at a time and turns each one into a Number. Reversing with \`[-1 to 0]\` puts the check digit at index 0. The rule counts from the right, so this keeps the doubling right for any length.

**Doubling.** After the reverse, index 0 is the 1st digit from the right, index 1 is the 2nd, and so on. So the digits to double are the ones at odd indexes. Subtracting 9 from a doubled digit above 9 is the same as adding its two digits: 14 becomes 1 + 4 = 5, and 14 - 9 is also 5.

**The format guard.** \`matches\` must fit the whole String, so \`/[0-9]{16}/\` refuses spaces, letters and any other length. Putting it in an \`if\` means \`passesLuhn\` never runs on a bad value. Without the guard, \`" " as Number\` fails and the whole response is lost for one bad row.

**What the check catches.** The second card has its last digit changed, so the total no longer ends in 0. The rule catches every single wrong digit, and nearly every swap of two neighbouring digits. It is not a security check. Anyone can make a number that passes, so the loyalty system must still look the card up.
`,
  tests: [
    {
      name: 'Two neighbouring digits swapped',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[{ "cardNumber": "6048120000435675" }]' }],
      expected: '[{ "cardNumber": "6048120000435675", "valid": false }]',
    },
    {
      name: 'Wrong lengths and letters',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "cardNumber": "604812000011112" }, { "cardNumber": "60481200005555050" }, { "cardNumber": "604812000034567A" }, { "cardNumber": "" }]',
        },
      ],
      expected:
        '[{ "cardNumber": "604812000011112", "valid": false }, { "cardNumber": "60481200005555050", "valid": false }, { "cardNumber": "604812000034567A", "valid": false }, { "cardNumber": "", "valid": false }]',
    },
    {
      name: 'A valid card with doubled digits above 9',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[{ "cardNumber": "6048120000555505" }]' }],
      expected: '[{ "cardNumber": "6048120000555505", "valid": true }]',
    },
  ],
  followUps: [
    {
      q: 'Why are card numbers kept as Strings and not Numbers?',
      a: 'Some card numbers start with 0, and a Number drops leading zeros. You never do arithmetic on the whole number, and very long numbers can also lose digits in some systems that read the JSON. Treat identifiers as text.',
    },
    {
      q: 'How would you accept numbers typed with spaces, such as `6048 1200 0098 7658`?',
      a: 'Remove the spaces before the check: `card.cardNumber replace " " with ""`. Return the cleaned number in the output too, so the loyalty system gets one standard format.',
    },
    {
      q: 'How would you work out the check digit for a new card?',
      a: 'Run the same sum over the first 15 digits as if a 0 were added on the right. The check digit is `(10 - (total mod 10)) mod 10`.',
    },
  ],
}

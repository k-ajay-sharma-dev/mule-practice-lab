export default {
  id: 'dw-129',
  category: 'dataweave',
  title: 'Find Missing Cheque Numbers in a Book',
  level: 'ADVANCED',
  tags: ['ranges', 'distinctBy', 'orderBy', 'coercion', 'reconciliation', 'arrays', 'json'],
  estMinutes: 25,
  description: `
A building society issues cheque books with numbers in sequence. Each night its clearing system sends the cheques presented that day for one book. The fraud team wants to know which numbers in the range have **not** been presented yet, grouped into gaps.

The feed has two quirks:

- Cheque numbers arrive as Strings with leading zeros, such as \`"000101"\`.
- The same cheque can appear twice when the clearing system resends a file.

Output one object with:

- \`first\` and \`last\`: the lowest and highest cheque numbers seen, as Numbers
- \`presented\`: how many different cheque numbers were seen
- \`missing\`: one object per gap, in number order, with \`from\`, \`to\` and \`count\`

A single missing number is a gap where \`from\` and \`to\` are the same. When there are no cheques, \`first\` and \`last\` are \`null\`, \`presented\` is 0 and \`missing\` is empty.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "accountId": "ACC-30817",
  "cheques": [
    { "chequeNumber": "000103", "amount": 45.00 },
    { "chequeNumber": "000101", "amount": 120.50 },
    { "chequeNumber": "000102", "amount": 9.99 },
    { "chequeNumber": "000107", "amount": 300.00 },
    { "chequeNumber": "000110", "amount": 62.10 },
    { "chequeNumber": "000108", "amount": 15.00 },
    { "chequeNumber": "000103", "amount": 45.00 }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "first": 101,
  "last": 110,
  "presented": 6,
  "missing": [
    { "from": 104, "to": 106, "count": 3 },
    { "from": 109, "to": 109, "count": 1 }
  ]
}`,
  },
  starterCode: `%dw 2.0
output application/json
var numbers = payload.cheques map $.chequeNumber
---
{
  first: numbers[0],
  last: numbers[-1],
  presented: sizeOf(numbers),
  missing: []
}
`,
  hints: [
    'Turn each cheque number into a Number with `as Number`, remove repeats with `distinctBy $`, then sort with `orderBy $`.',
    'Once the list is sorted, a gap can only sit between two neighbours. Pair each number with the next one: `(0 to sizeOf(numbers) - 2) map ((i) -> { low: numbers[i], high: numbers[i + 1] })`.',
    'A pair is a gap when `high - low > 1`. The gap runs from `low + 1` to `high - 1`.',
    'Watch the short lists. For a list of one number, the range would be `0 to -1`, which runs the wrong way. Build the pairs only when there are at least two numbers.',
  ],
  solution: `%dw 2.0
output application/json
var numbers = (payload.cheques map ($.chequeNumber as Number)) distinctBy $ orderBy $
var pairs = if (sizeOf(numbers) < 2) []
  else (0 to sizeOf(numbers) - 2) map ((i) -> { low: numbers[i], high: numbers[i + 1] })
---
{
  first: numbers[0],
  last: numbers[-1],
  presented: sizeOf(numbers),
  missing: pairs
    filter ((pair) -> pair.high - pair.low > 1)
    map ((pair) -> {
      from: pair.low + 1,
      to: pair.high - 1,
      count: pair.high - pair.low - 1
    })
}`,
  explanation: `
**Clean the list first.** \`"000101" as Number\` gives \`101\`, so the leading zeros go and the values sort as numbers. \`distinctBy $\` removes the resent cheque, and \`orderBy $\` sorts what is left. After this, \`numbers[0]\` is the lowest and \`numbers[-1]\` the highest.

Sorting text instead would work here only because every number has six characters. As soon as a book moves from \`999999\` to \`1000000\`, text order breaks. Converting first removes that risk.

**Find the gaps.** In a sorted list with no repeats, a gap can only sit between two neighbours. The pairs \`(103, 107)\` and \`(108, 110)\` differ by more than 1, so they give the gaps 104 to 106 and 109 to 109. The count is \`high - low - 1\`.

**Short lists.** With one cheque, \`0 to sizeOf(numbers) - 2\` is \`0 to -1\`, a range that runs the wrong way. There is no pair to build, so the \`if\` returns an empty list before the range is ever made. On an empty list, \`numbers[0]\` and \`numbers[-1]\` are \`null\`, which is the output the brief asks for.
`,
  tests: [
    {
      name: 'No gaps, repeated cheques',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "accountId": "ACC-1", "cheques": [{ "chequeNumber": "000201", "amount": 1 }, { "chequeNumber": "000202", "amount": 2 }, { "chequeNumber": "000202", "amount": 2 }, { "chequeNumber": "000203", "amount": 3 }] }',
        },
      ],
      expected: '{ "first": 201, "last": 203, "presented": 3, "missing": [] }',
    },
    {
      name: 'A single cheque',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{ "accountId": "ACC-2", "cheques": [{ "chequeNumber": "000555", "amount": 10 }] }' }],
      expected: '{ "first": 555, "last": 555, "presented": 1, "missing": [] }',
    },
    {
      name: 'No cheques',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{ "accountId": "ACC-3", "cheques": [] }' }],
      expected: '{ "first": null, "last": null, "presented": 0, "missing": [] }',
    },
    {
      name: 'One large gap',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "accountId": "ACC-4", "cheques": [{ "chequeNumber": "000350", "amount": 5 }, { "chequeNumber": "000301", "amount": 7 }] }',
        },
      ],
      expected: '{ "first": 301, "last": 350, "presented": 2, "missing": [{ "from": 302, "to": 349, "count": 48 }] }',
    },
  ],
  followUps: [
    {
      q: 'The book runs from 101 to 150, and the bank knows that. How would you also report numbers after the last cheque seen?',
      a: 'Pass the book range in, for example as a variable, and add its ends to the list before finding the gaps. Compare against `bookStart - 1` and `bookEnd + 1` so the first and last numbers of the book can be gaps too.',
    },
    {
      q: 'Why not list every missing number instead of gaps?',
      a: 'A new book can have hundreds of unused cheques. A list of ranges stays short and is what a person reads. If another system needs each number, expand a gap with `(gap.from to gap.to) as Array`.',
    },
    {
      q: 'How would you run this for many books in one file?',
      a: 'Group the cheques by book first with `groupBy`, then run the same logic on each group with `mapObject` or `pluck`. Put the gap logic in a function that takes a list of numbers, so it is written once.',
    },
  ],
}

export default {
  id: 'dw-119',
  category: 'dataweave',
  title: 'Format Start Dates for a Payroll System',
  level: 'BEGINNER',
  tags: ['dates', 'format', 'coercion', 'map', 'json'],
  estMinutes: 10,
  description: `
An HR system sends new employees with their start date in the form \`2026-03-09\`, which is year, month, day. The payroll system wants the same date as \`09/03/2026\`, which is day, month, year.

For each employee in \`payload\`, keep the input order and output:

- \`employeeId\`, copied as it is
- \`startDate\`, a String in the form \`dd/MM/yyyy\`
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "employeeId": "E-204", "startDate": "2026-03-09" },
  { "employeeId": "E-205", "startDate": "2026-11-30" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "employeeId": "E-204", "startDate": "09/03/2026" },
  { "employeeId": "E-205", "startDate": "30/11/2026" }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload map (e) -> {
  employeeId: e.employeeId,
  startDate: e.startDate
}
`,
  hints: [
    'JSON has no date type, so `startDate` arrives as a String. Turn it into a real date first with `as Date`.',
    'Then write the date out with a pattern: `as String { format: "dd/MM/yyyy" }`.',
    'Letter case matters in a pattern. `MM` is the month and `mm` is minutes.',
  ],
  solution: `%dw 2.0
output application/json
---
payload map (e) -> {
  employeeId: e.employeeId,
  startDate: e.startDate as Date as String { format: "dd/MM/yyyy" }
}`,
  explanation: `
Changing the look of a date takes two steps.

1. \`as Date\` reads the text as a real date. The form \`yyyy-MM-dd\` needs no pattern here.
2. \`as String { format: "dd/MM/yyyy" }\` writes that date out in the form you choose.

**Trap 1: skipping \`as Date\`.** \`e.startDate as String { format: "dd/MM/yyyy" }\` runs without an error, but the value is already a String, so nothing changes and you get \`2026-03-09\` back.

**Trap 2: lower case \`mm\`.** In a date pattern \`mm\` means minutes. A Date has no time part, so \`dd/mm/yyyy\` fails with an error.
`,
  tests: [
    {
      name: 'A leap day and the first day of a year',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "employeeId": "E-301", "startDate": "2024-02-29" }, { "employeeId": "E-302", "startDate": "2027-01-01" }]',
        },
      ],
      expected: '[{ "employeeId": "E-301", "startDate": "29/02/2024" }, { "employeeId": "E-302", "startDate": "01/01/2027" }]',
    },
    {
      name: 'No new employees',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'The HR system starts sending `09/03/2026`. What happens to `as Date`, and what is the fix?',
      a: 'Plain `as Date` fails on that text. Tell DataWeave how to read it with a pattern: `as Date { format: "dd/MM/yyyy" }`.',
    },
    {
      q: 'What does `"2026-03-09" as Date` look like in the JSON output with no second step?',
      a: 'It is written as `"2026-03-09"`. JSON has no date type, so the date goes out as text in its standard form.',
    },
  ],
}

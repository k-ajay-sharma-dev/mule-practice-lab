export default {
  id: 'dw-112',
  category: 'dataweave',
  title: 'Build a Full Name with ++',
  level: 'BEGINNER',
  tags: ['strings', 'map', 'json'],
  estMinutes: 10,
  description: `
A bank prints statements with one name line, but its core system stores the first and last name in separate fields.

Use \`++\` to join them. \`++\` puts two strings together into one string. This is called concatenation.

For each account output:

- \`accountId\`: copied as it is
- \`fullName\`: \`firstName\`, then one space, then \`lastName\`
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "accountId": "AC-301", "firstName": "Asha", "lastName": "Rao" },
  { "accountId": "AC-302", "firstName": "Ben", "lastName": "Ortiz" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "accountId": "AC-301", "fullName": "Asha Rao" },
  { "accountId": "AC-302", "fullName": "Ben Ortiz" }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Use `map` to build a new object for each account.',
    '`++` adds no space of its own. Put the space in the middle as its own string: `" "`.',
  ],
  solution: `%dw 2.0
output application/json
---
payload map (a) -> {
  accountId: a.accountId,
  fullName: a.firstName ++ " " ++ a.lastName
}`,
  explanation: '`++` joins exactly what you give it. Without the `" "` in the middle, the result would be `AshaRao`. You can chain `++` as many times as you need.',
  tests: [
    {
      name: 'Names with spaces inside',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: `[{ "accountId": "AC-9", "firstName": "Mary Ann", "lastName": "van Dyk" }]`,
        },
      ],
      expected: '[{ "accountId": "AC-9", "fullName": "Mary Ann van Dyk" }]',
    },
    {
      name: 'No accounts',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '[]',
    },
  ],
}

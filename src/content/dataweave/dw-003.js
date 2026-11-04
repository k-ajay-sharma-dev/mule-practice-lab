export default {
  id: 'dw-003',
  category: 'dataweave',
  title: 'Map Legacy Fields to the New Customer Schema',
  level: 'BEGINNER',
  tags: ['map', 'default', 'json'],
  estMinutes: 10,
  description: `
A legacy mainframe extract uses upper-case column names. The new Customer System API expects a clean camelCase schema.

| Target field | Rule |
|---|---|
| \`customerId\` | \`CUST_ID\` as a **number** |
| \`fullName\` | first and last name separated by one space |
| \`email\` | \`EMAIL_ADDR\` in **lower case** |
| \`phone\` | \`PHONE\`, or \`"N/A"\` when it is missing or null |
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "CUST_ID": "1001", "FIRST_NM": "Asha", "LAST_NM": "Rao", "EMAIL_ADDR": "ASHA@EXAMPLE.COM", "PHONE": null },
  { "CUST_ID": "1002", "FIRST_NM": "Ben", "LAST_NM": "Ortiz", "EMAIL_ADDR": "ben@example.com" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "customerId": 1001, "fullName": "Asha Rao", "email": "asha@example.com", "phone": "N/A" },
  { "customerId": 1002, "fullName": "Ben Ortiz", "email": "ben@example.com", "phone": "N/A" }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Use `map` to build a new object for each customer.',
    '`++` concatenates strings, `lower()` lower-cases, and `as Number` converts a string to a number.',
    '`default` supplies a value when the left side is null or missing: `c.PHONE default "N/A"`.',
  ],
  solution: `%dw 2.0
output application/json
---
payload map (c) -> {
  customerId: c.CUST_ID as Number,
  fullName: c.FIRST_NM ++ " " ++ c.LAST_NM,
  email: lower(c.EMAIL_ADDR),
  phone: c.PHONE default "N/A"
}`,
  explanation: '`default` covers both cases at once: a key that is present with `null` and a key that is missing entirely.',
  tests: [
    {
      name: 'Phone present, mixed-case email',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: `[{ "CUST_ID": "7", "FIRST_NM": "Chen", "LAST_NM": "Li", "EMAIL_ADDR": "Chen@Ex.com", "PHONE": "+44 20 1234" }]`,
        },
      ],
      expected: '[{ "customerId": 7, "fullName": "Chen Li", "email": "chen@ex.com", "phone": "+44 20 1234" }]',
    },
  ],
}

export default {
  id: 'dw-122',
  category: 'dataweave',
  title: 'Lower Case Field Names with mapObject',
  level: 'BEGINNER',
  tags: ['mapObject', 'dynamic-keys', 'objects', 'json'],
  estMinutes: 10,
  description: `
An old HR system exports each employee with field names in capitals, such as \`EMP_ID\`. The new system expects the same fields in lower case, such as \`emp_id\`.

Output the same object with each of its keys in lower case. The values stay exactly as they are, so a value that is itself an object keeps its inner keys unchanged.

Use \`mapObject\`. It goes through each key of an object, and the small objects you return are joined into one new object.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "EMP_ID": "E-117",
  "FULL_NAME": "Maya Patel",
  "DEPT": "Finance",
  "GRADE": 4
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "emp_id": "E-117",
  "full_name": "Maya Patel",
  "dept": "Finance",
  "grade": 4
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload mapObject (value, key) -> {
  key: value
}
`,
  hints: [
    'Run the starter code. Every field comes out named `key`, because a plain word on the left of `:` is the literal key name.',
    'To work out a key name, wrap the expression in parentheses: `(expression): value`.',
    '`lower(key)` gives the lower case form of the key.',
  ],
  solution: `%dw 2.0
output application/json
---
payload mapObject (value, key) -> {
  (lower(key)): value
}`,
  explanation: `
\`mapObject\` calls your function once per key, with the value first and the key second. Each call returns a small object, and DataWeave joins them into the result.

The new idea here is the **dynamic key**: a key name that is worked out while the script runs. The parentheses in \`(lower(key)): value\` tell DataWeave to evaluate the expression and use the result as the name. Without them, \`key: value\` makes a field that is literally called \`key\`, and \`lower(key): value\` is a syntax error.

The value goes through untouched, so \`4\` stays a number.
`,
  tests: [
    {
      name: 'A nested object keeps its inner keys',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "EMP_ID": "E-9", "ADDRESS": { "CITY": "York" }, "MANAGER": null }',
        },
      ],
      expected: '{ "emp_id": "E-9", "address": { "CITY": "York" }, "manager": null }',
    },
    {
      name: 'An empty object',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{}' }],
      expected: '{}',
    },
  ],
  followUps: [
    {
      q: 'Does `mapObject` change keys inside a nested object?',
      a: 'No. It only sees the top level, so `ADDRESS` becomes `address` but `CITY` inside it stays as it is.',
    },
    {
      q: 'How do you rename only one field, and lower case the rest?',
      a: 'Use an `if` in the dynamic key: `(if (key ~= "DEPT") "department" else lower(key)): value`. The `~=` operator compares the key with a String.',
    },
    {
      q: 'What happens if you call `mapObject` on an array of employees?',
      a: 'It fails, because `mapObject` works on objects only. Use `map` on the array, and call `mapObject` on each item inside it.',
    },
  ],
}

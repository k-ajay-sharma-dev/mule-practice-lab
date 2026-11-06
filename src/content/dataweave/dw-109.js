export default {
  id: 'dw-109',
  category: 'dataweave',
  title: 'Rename Employee Fields for Payroll',
  level: 'BEGINNER',
  tags: ['map', 'arrays', 'json'],
  estMinutes: 10,
  description: `
The HR system sends employees with short column names. The payroll system wants clearer names.

Use \`map\` to build a new object for each employee. \`map\` runs once for every item in an array and returns a new array of the results.

| New field | Old field |
|---|---|
| \`employeeId\` | \`emp_no\` |
| \`department\` | \`dept_cd\` |
| \`hireDate\` | \`hire_dt\` |

**Rules**
- Keep the original order.
- Output only the three new fields.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "emp_no": "E-101", "dept_cd": "FIN", "hire_dt": "2021-03-15" },
  { "emp_no": "E-102", "dept_cd": "OPS", "hire_dt": "2023-09-01" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "employeeId": "E-101", "department": "FIN", "hireDate": "2021-03-15" },
  { "employeeId": "E-102", "department": "OPS", "hireDate": "2023-09-01" }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Start with `payload map (e) -> { ... }`. Here `e` is the current employee.',
    'Inside the braces, write the new name on the left and the old value on the right: `employeeId: e.emp_no`.',
  ],
  solution: `%dw 2.0
output application/json
---
payload map (e) -> {
  employeeId: e.emp_no,
  department: e.dept_cd,
  hireDate: e.hire_dt
}`,
  explanation: '`map` does not change the input. It builds a new object for each item, so only the fields you write appear in the output. Any other field on the input is left behind.',
  tests: [
    {
      name: 'Extra fields are left out',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: `[{ "emp_no": "E-200", "dept_cd": "HR", "hire_dt": "2019-11-20", "salary": 52000 }]`,
        },
      ],
      expected: '[{ "employeeId": "E-200", "department": "HR", "hireDate": "2019-11-20" }]',
    },
    {
      name: 'No employees',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '[]',
    },
  ],
}

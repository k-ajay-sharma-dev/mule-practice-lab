export default {
  id: 'rm-044',
  category: 'api-design',
  title: 'Payslip API: Named Examples for Normal and Edge Cases',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'examples', 'edge-cases', 'data-types', 'hr'],
  estMinutes: 15,
  description: `
A payroll team publishes payslips to an employee app. The app worked in testing, then crashed for an employee on unpaid leave, whose payslip had a net pay of 0 and no deductions. The only example in the contract showed a normal month.

\`example\` holds one value. \`examples\` holds several, each under a name you choose:

\`\`\`
examples:
  firstCase:
    value:
      id: 1
  secondCase:
    value:
      id: 2
\`\`\`

Each entry can have a \`description\` beside \`value\`. Use \`examples\` or \`example\` on a type, never both. An **edge case** is an unusual but valid value that code often forgets, and a mock service or a test can then serve it too.

**Requirements**
- A type \`Deduction\` has a required string \`code\` and a required number \`amount\`.
- A type \`Payslip\` has these required properties:
  - \`payslipId\`: a string.
  - \`payDate\`: a calendar day.
  - \`grossPay\` and \`netPay\`: numbers with a minimum of 0.
  - \`deductions\`: a list of \`Deduction\`, which can be empty.
- \`Payslip\` has named examples under \`examples\`, and no \`example\`:
  - \`regularMonth\`: a normal payslip with at least one deduction.
  - \`unpaidLeave\`: the edge case, with \`grossPay\` and \`netPay\` of 0 and an empty \`deductions\` list.
- \`GET /payslips/{payslipId}\` returns a \`Payslip\` with status 200, or 404.
`,
  starter: `#%RAML 1.0
title: Payslip API
mediaType: application/json

types:
  Payslip:
    type: object
    properties:
      payslipId: string

/payslips:
`,
  ramlChecks: [
    {
      label: 'Deduction has a required code and amount',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Deduction', prop: 'code', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Deduction', prop: 'amount', want: { type: 'number', required: true } },
        ],
      },
    },
    {
      label: 'payslipId is a string and payDate is a date-only',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Payslip', prop: 'payslipId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Payslip', prop: 'payDate', want: { type: 'date-only', required: true } },
        ],
      },
    },
    {
      label: 'grossPay and netPay are numbers of at least 0',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Payslip', prop: 'grossPay', want: { type: 'number', required: true, minimum: 0 } },
          { type: 'prop', typeName: 'Payslip', prop: 'netPay', want: { type: 'number', required: true, minimum: 0 } },
        ],
      },
    },
    { label: 'deductions is a required list of Deduction', rule: { type: 'prop', typeName: 'Payslip', prop: 'deductions', want: { type: 'Deduction[]', required: true } } },
    { label: 'Payslip has named examples and no single example', rule: { type: 'typeDecl', name: 'Payslip', want: { example: { set: false } }, has: ['examples.regularMonth', 'examples.unpaidLeave'] } },
    { label: 'GET /payslips/{payslipId} returns a Payslip', rule: { type: 'response', path: '/payslips/{}', method: 'get', status: '200', typeIs: 'Payslip' } },
    { label: 'GET /payslips/{payslipId} returns 404', rule: { type: 'response', path: '/payslips/{}', method: 'get', status: '404' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Payslip API
mediaType: application/json

types:
  Deduction:
    type: object
    properties:
      code: string
      amount: number
  Payslip:
    type: object
    properties:
      payslipId: string
      payDate: date-only
      grossPay:
        type: number
        minimum: 0
      netPay:
        type: number
        minimum: 0
      deductions: Deduction[]
    examples:
      regularMonth:
        description: A normal month with tax taken off.
        value:
          payslipId: PS-1180
          payDate: 2026-03-31
          grossPay: 3200
          netPay: 2480
          deductions:
            - code: TAX
              amount: 720
      unpaidLeave:
        description: A full month of unpaid leave, so nothing is paid.
        value:
          payslipId: PS-1181
          payDate: 2026-03-31
          grossPay: 0
          netPay: 0
          deductions: []

/payslips:
  /{payslipId}:
    get:
      responses:
        200:
          body:
            type: Payslip
        404:
          description: No payslip has this id.
`,
  keyPoints: [
    'example holds one value. examples holds several, each under a name.',
    'Use one or the other on a type, never both.',
    'A named example documents a case, so the name should say what the case is.',
    'Every named example is checked against the type, so an edge case also tests your facets.',
  ],
  solution: `
\`regularMonth\` shows the shape most people see. \`unpaidLeave\` shows the shape that crashed the app: zeros and an empty list.

The edge case also tests the type. \`minimum: 0\` allows a net pay of 0. \`deductions\` has no \`minItems\`, so an empty list fits. If either rule were stricter, the example would fail, and the team would learn that before release.

The names matter. Someone reading the portal sees \`unpaidLeave\` and knows the case exists.
`,
  followUps: [
    {
      q: 'What does strict: false do on a named example?',
      a: 'It turns off validation of that example against the type. It suits showing a deliberately bad payload, but a mistake in it then goes unnoticed.',
    },
    {
      q: 'Which edge cases are worth an example?',
      a: 'Empty lists, zero values, null fields, the longest allowed text and any status that changes the shape. Choose the ones that have caused bugs or that code tends to forget.',
    },
    {
      q: 'How does a mocking service use several examples?',
      a: 'It serves an example as the response, so consumers can build against realistic data before the API exists. Having the edge case there lets them test it early.',
    },
  ],
}

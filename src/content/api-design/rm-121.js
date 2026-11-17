export default {
  id: 'rm-121',
  category: 'api-design',
  title: 'Expense Claims API: Money Amounts with multipleOf and Currency Codes',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'data-types', 'facets', 'money', 'finance'],
  estMinutes: 15,
  description: `
An engineering firm lets staff claim expenses from a phone app. The finance team found claims for \`12.345\` euros and claims in a currency called \`eur\`. Both broke the payroll export, which takes two decimal places and three capital letters.

The contract only said \`amount: number\` and \`currency: string\`. You will tighten it with **facets**, the rules you add to a type:

- \`minimum\` and \`maximum\` set the range of a number.
- \`multipleOf\` says a number must be a whole multiple of a value. \`multipleOf: 0.01\` allows \`12.34\` and refuses \`12.345\`.
- \`pattern\` is a regular expression that a string must match.

Write one \`Money\` type and use it everywhere an amount appears, so the rules live in one place.

**Requirements**
- Title \`Expense Claims API\`, with JSON as the default media type.
- A type \`Money\` with two required properties:
  - \`amount\`: a number from 0.01 to 5000, in steps of 0.01.
  - \`currency\`: a string of exactly three capital letters, such as \`EUR\`.
- \`Money\` has an example.
- A type \`ExpenseLine\` with:
  - \`category\`: required, one of \`TRAVEL\`, \`MEALS\`, \`LODGING\`, \`OTHER\`.
  - \`cost\`: required, of type \`Money\`.
  - \`distanceKm\`: an optional number of at least 0, in steps of 0.1, for mileage claims.
- A type \`ExpenseClaim\` with a required string \`employeeId\` and a required \`lines\` array of \`ExpenseLine\` that holds at least 1 line.
- \`POST /claims\` takes an \`ExpenseClaim\` and returns 201, or 400 when the body does not fit.
`,
  starter: `#%RAML 1.0
title: Expense Claims API
mediaType: application/json

types:
  Money:
    type: object
    properties:
      amount: number
      currency: string

/claims:
`,
  ramlChecks: [
    {
      label: 'The title is Expense Claims API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Expense Claims API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'amount is a number from 0.01 to 5000 in steps of 0.01',
      rule: { type: 'prop', typeName: 'Money', prop: 'amount', want: { type: 'number', required: true, minimum: 0.01, maximum: 5000, multipleOf: 0.01 } },
    },
    {
      label: 'currency is three capital letters',
      rule: {
        type: 'prop',
        typeName: 'Money',
        prop: 'currency',
        want: { type: 'string', required: true, pattern: { accepts: ['EUR', 'GBP', 'USD'], rejects: ['eur', 'EU', 'EURO', 'E1R', 'XEUR', ' EUR'] } },
      },
    },
    {
      label: 'Money has an example',
      rule: { type: 'any', rules: [{ type: 'typeDecl', name: 'Money', want: { example: { set: true } } }, { type: 'typeDecl', name: 'Money', want: { examples: { set: true } } }] },
    },
    {
      label: 'category allows only TRAVEL, MEALS, LODGING and OTHER',
      rule: { type: 'prop', typeName: 'ExpenseLine', prop: 'category', want: { required: true, enum: { exactly: ['TRAVEL', 'MEALS', 'LODGING', 'OTHER'] } } },
    },
    { label: 'cost is a required Money', rule: { type: 'prop', typeName: 'ExpenseLine', prop: 'cost', want: { type: 'Money', required: true } } },
    {
      label: 'distanceKm is an optional number of at least 0 in steps of 0.1',
      rule: { type: 'prop', typeName: 'ExpenseLine', prop: 'distanceKm', want: { type: 'number', required: false, minimum: 0, multipleOf: 0.1 } },
    },
    {
      label: 'ExpenseClaim has employeeId and at least one line',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'ExpenseClaim', prop: 'employeeId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'ExpenseClaim', prop: 'lines', want: { type: 'ExpenseLine[]', required: true, minItems: 1 } },
        ],
      },
    },
    {
      label: 'POST /claims takes an ExpenseClaim and returns 201 or 400',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/claims', method: 'post', typeIs: 'ExpenseClaim' },
          { type: 'response', path: '/claims', method: 'post', status: '201' },
          { type: 'response', path: '/claims', method: 'post', status: '400' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Expense Claims API
mediaType: application/json

types:
  Money:
    type: object
    properties:
      amount:
        type: number
        minimum: 0.01
        maximum: 5000
        multipleOf: 0.01
      currency:
        type: string
        pattern: ^[A-Z]{3}$
    example:
      amount: 86.4
      currency: EUR
  ExpenseLine:
    type: object
    properties:
      category:
        type: string
        enum: [ TRAVEL, MEALS, LODGING, OTHER ]
      cost: Money
      distanceKm?:
        type: number
        minimum: 0
        multipleOf: 0.1
  ExpenseClaim:
    type: object
    properties:
      employeeId: string
      lines:
        type: ExpenseLine[]
        minItems: 1

/claims:
  post:
    body:
      type: ExpenseClaim
    responses:
      201:
        description: The claim is saved and waits for approval.
      400:
        description: The claim does not fit the contract.
`,
  keyPoints: [
    'multipleOf sets the step of a number, so multipleOf: 0.01 allows at most two decimal places.',
    'minimum and maximum set the range. Together with multipleOf they describe a real amount, not any number.',
    'A pattern of ^[A-Z]{3}$ matches the shape of an ISO 4217 currency code, such as EUR or GBP.',
    'One Money type, used by every property that holds an amount, keeps the rules in one place.',
    'minItems: 1 on an array stops an empty claim with no lines.',
  ],
  solution: `
\`Money\` holds the rules once. \`minimum: 0.01\` refuses zero and negative amounts. \`maximum: 5000\` is the most one line can claim without a different process. \`multipleOf: 0.01\` refuses \`12.345\`, because it is not a whole number of cents.

The currency pattern \`^[A-Z]{3}$\` needs both anchors. Without \`^\` and \`$\`, \`XEUR\` would match, because it contains three capital letters in a row.

\`cost: Money\` in \`ExpenseLine\` reuses the type. If finance later raises the limit, one line changes.

\`distanceKm\` uses \`multipleOf: 0.1\`, so mileage is kept to one decimal place, and \`minimum: 0\` refuses negative distances. It is optional because only travel lines have it.

\`minItems: 1\` on \`lines\` means a claim with an empty list does not fit, and APIkit can refuse it with the 400.
`,
  followUps: [
    {
      q: 'Is multipleOf: 0.01 safe with every validator?',
      a: 'Not always. Some validators work it out with floating-point numbers, and a value such as 19.99 divided by 0.01 is not exactly a whole number in binary. Test real amounts against your validator. Many payment APIs avoid this by sending amounts as an integer of minor units, such as 1999 cents.',
    },
    {
      q: 'Does the pattern prove that the currency exists?',
      a: 'No. It only checks the shape, so ABC passes. To accept only the currencies you support, use an enum, or check against a reference list in the implementation.',
    },
    {
      q: 'Why not put the 5000 limit in the implementation only?',
      a: 'Callers read the contract. With the limit in RAML, the app can check it before sending, the mock refuses it, and APIkit can refuse it at the edge. The implementation still applies the rules that depend on data, such as a per-employee monthly budget.',
    },
  ],
}

export default {
  id: 'rm-043',
  category: 'api-design',
  title: 'Standing Orders API: Closing a Type with additionalProperties',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'data-types', 'additional-properties', 'validation', 'banking'],
  estMinutes: 15,
  description: `
A bank lets customers set up a **standing order**, which is a regular payment that repeats on a schedule. A partner app sent \`referance\` instead of \`reference\`. The API accepted the request, ignored the misspelled field, and the payments went out with no reference.

This happened because a RAML object type is **open** by default: a value can hold extra properties that the type does not list. \`additionalProperties: false\` makes a type **closed**, so a value with any extra property does not fit.

Closing a type is a decision, and it does not suit everything. A closed request type catches caller mistakes. A closed response type is a risk, because adding a field later would break the rule for any consumer that validates against it.

**Requirements**
- A type \`StandingOrderRequest\` has these properties, and is closed:
  - \`fromAccount\` and \`toAccount\`: required strings.
  - \`amount\`: a required number with a minimum of 0.01.
  - \`frequency\`: required, and allows only \`WEEKLY\` and \`MONTHLY\`.
  - \`reference\`: an optional string of at most 18 characters.
- \`StandingOrderRequest\` has an example that fits it.
- A type \`StandingOrder\` has the required strings \`orderId\` and \`status\`. It stays open, so the bank can add fields later.
- \`POST /standing-orders\` takes a \`StandingOrderRequest\` body and returns a \`StandingOrder\` with status 201.
- \`POST /standing-orders\` returns 400 when the body does not fit.
`,
  starter: `#%RAML 1.0
title: Standing Orders API
mediaType: application/json

types:
  StandingOrderRequest:
    type: object
    properties:
      fromAccount: string
      toAccount: string

/standing-orders:
`,
  ramlChecks: [
    {
      label: 'fromAccount and toAccount are required strings',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'StandingOrderRequest', prop: 'fromAccount', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'StandingOrderRequest', prop: 'toAccount', want: { type: 'string', required: true } },
        ],
      },
    },
    { label: 'amount is a required number of at least 0.01', rule: { type: 'prop', typeName: 'StandingOrderRequest', prop: 'amount', want: { type: 'number', required: true, minimum: 0.01 } } },
    { label: 'frequency allows only WEEKLY and MONTHLY', rule: { type: 'prop', typeName: 'StandingOrderRequest', prop: 'frequency', want: { required: true, enum: { exactly: ['WEEKLY', 'MONTHLY'] } } } },
    { label: 'reference is an optional string of at most 18 characters', rule: { type: 'prop', typeName: 'StandingOrderRequest', prop: 'reference', want: { type: 'string', required: false, maxLength: 18 } } },
    { label: 'StandingOrderRequest is closed', rule: { type: 'typeDecl', name: 'StandingOrderRequest', want: { additionalProperties: false } } },
    {
      label: 'StandingOrderRequest has an example',
      rule: {
        type: 'any',
        rules: [
          { type: 'typeDecl', name: 'StandingOrderRequest', want: { example: { set: true } } },
          { type: 'typeDecl', name: 'StandingOrderRequest', want: { examples: { set: true } } },
        ],
      },
    },
    {
      label: 'orderId and status are required strings',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'StandingOrder', prop: 'orderId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'StandingOrder', prop: 'status', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'StandingOrder stays open',
      rule: {
        type: 'any',
        rules: [
          { type: 'typeDecl', name: 'StandingOrder', want: { additionalProperties: { set: false } } },
          { type: 'typeDecl', name: 'StandingOrder', want: { additionalProperties: true } },
        ],
      },
    },
    {
      label: 'POST /standing-orders takes the request and returns a StandingOrder with 201',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/standing-orders', method: 'post', typeIs: 'StandingOrderRequest' },
          { type: 'response', path: '/standing-orders', method: 'post', status: '201', typeIs: 'StandingOrder' },
        ],
      },
    },
    { label: 'POST /standing-orders returns 400 for a bad body', rule: { type: 'response', path: '/standing-orders', method: 'post', status: '400' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Standing Orders API
mediaType: application/json

types:
  StandingOrderRequest:
    type: object
    additionalProperties: false
    properties:
      fromAccount: string
      toAccount: string
      amount:
        type: number
        minimum: 0.01
      frequency:
        type: string
        enum: [ WEEKLY, MONTHLY ]
      reference?:
        type: string
        maxLength: 18
    example:
      fromAccount: GB29-0001
      toAccount: GB94-0002
      amount: 250.5
      frequency: MONTHLY
      reference: RENT
  StandingOrder:
    type: object
    properties:
      orderId: string
      status: string

/standing-orders:
  post:
    body:
      type: StandingOrderRequest
    responses:
      201:
        body:
          type: StandingOrder
      400:
        description: The body does not fit the contract.
`,
  keyPoints: [
    'RAML object types are open by default, so extra properties are allowed.',
    'additionalProperties: false closes a type and turns a typo into a clear error.',
    'Close what you receive, and think twice before you close what you send.',
    'An optional property is where a closed type helps most, because a misspelled one is otherwise ignored.',
  ],
  solution: `
\`additionalProperties: false\` sits on the type, beside \`properties\`. With it, \`referance\` no longer fits, so the request is refused with a 400 and the partner sees the mistake on the first call.

The misspelled field was an optional one. A misspelled required field fails anyway, because the real key is missing. It is the optional fields that slip through on an open type.

\`StandingOrder\` stays open. The bank can add a \`nextPaymentDate\` later, and any consumer that validates the response against this type keeps working.
`,
  followUps: [
    {
      q: 'What is the cost of closing a request type?',
      a: 'Any new field needs a contract change before callers can send it. Older clients that send extra data start getting errors, so close a type early and not after launch.',
    },
    {
      q: 'Can a closed type also use pattern properties?',
      a: 'No. RAML does not allow pattern properties, such as /^x-/, in a type where additionalProperties is false.',
    },
    {
      q: 'Who actually refuses the extra property at run time?',
      a: 'The RAML only states the rule. A component that validates against it, such as the APIkit router in a Mule app, does the refusing and returns the 400.',
    },
  ],
}

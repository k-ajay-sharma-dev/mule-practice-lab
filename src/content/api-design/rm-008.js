export default {
  id: 'rm-008',
  category: 'api-design',
  title: 'Prescriptions API: Examples That Fit Their Type',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'examples', 'data-types', 'debugging', 'healthcare'],
  estMinutes: 15,
  description: `
A hospital group is sharing a prescriptions API with pharmacy partners. A colleague wrote the file, but the mock service shows wrong data and the checks fail. The types are right. The examples are wrong.

An **example** is sample data for a type or a body. Tools show it in the API docs, and a mock service sends it back to callers. So an example must obey its type, or it teaches people the wrong thing.

The starter holds real mistakes. Read the error messages and fix each one. The parser reports one problem per example at a time, so new errors can appear as you fix the old ones.

**Requirements**
- Do not change the \`Prescription\` type. Its properties and types stay as they are:
  - \`quantity\` stays an \`integer\`.
  - \`issuedOn\` stays a \`date-only\`, written like \`2026-03-12\`.
  - \`status\` keeps its enum of \`ISSUED\`, \`DISPENSED\`, \`CANCELLED\`.
  - \`patientId\` stays required.
- \`Prescription\` keeps an example, and it fits the type.
- \`GET /prescriptions\` returns \`Prescription[]\` with status 200 and shows an example. The body returns a list, so an example placed on it must be a list too.
`,
  starter: `#%RAML 1.0
title: Prescriptions API
mediaType: application/json

types:
  Prescription:
    type: object
    properties:
      prescriptionId: string
      patientId: string
      drug: string
      quantity: integer
      status:
        type: string
        enum: [ ISSUED, DISPENSED, CANCELLED ]
      issuedOn: date-only
    example:
      prescriptionId: RX-2041
      drug: Amoxicillin 500mg
      quantity: thirty
      status: ON_HOLD
      issuedOn: 12/03/2026

/prescriptions:
  get:
    responses:
      200:
        body:
          type: Prescription[]
          example:
            prescriptionId: RX-2041
            patientId: P-7788
            drug: Amoxicillin 500mg
            quantity: 30
            status: ISSUED
            issuedOn: 2026-03-12
`,
  ramlChecks: [
    { label: 'patientId is still a required string', rule: { type: 'prop', typeName: 'Prescription', prop: 'patientId', want: { type: 'string', required: true } } },
    { label: 'quantity is still an integer', rule: { type: 'prop', typeName: 'Prescription', prop: 'quantity', want: { type: 'integer', required: true } } },
    { label: 'issuedOn is still a date-only', rule: { type: 'prop', typeName: 'Prescription', prop: 'issuedOn', want: { type: 'date-only', required: true } } },
    { label: 'status keeps its enum', rule: { type: 'prop', typeName: 'Prescription', prop: 'status', want: { enum: { exactly: ['ISSUED', 'DISPENSED', 'CANCELLED'] } } } },
    {
      label: 'Prescription keeps an example',
      rule: {
        type: 'any',
        rules: [
          { type: 'typeDecl', name: 'Prescription', want: { example: { set: true } } },
          { type: 'typeDecl', name: 'Prescription', want: { examples: { set: true } } },
        ],
      },
    },
    { label: 'GET /prescriptions returns Prescription[] and shows an example', rule: { type: 'response', path: '/prescriptions', method: 'get', status: '200', typeIs: 'Prescription[]', example: true } },
  ],
  referenceRaml: `#%RAML 1.0
title: Prescriptions API
mediaType: application/json

types:
  Prescription:
    type: object
    properties:
      prescriptionId: string
      patientId: string
      drug: string
      quantity: integer
      status:
        type: string
        enum: [ ISSUED, DISPENSED, CANCELLED ]
      issuedOn: date-only
    example:
      prescriptionId: RX-2041
      patientId: P-7788
      drug: Amoxicillin 500mg
      quantity: 30
      status: ISSUED
      issuedOn: 2026-03-12

/prescriptions:
  get:
    responses:
      200:
        body:
          type: Prescription[]
          example:
            - prescriptionId: RX-2041
              patientId: P-7788
              drug: Amoxicillin 500mg
              quantity: 30
              status: ISSUED
              issuedOn: 2026-03-12
`,
  keyPoints: [
    'An example is checked against its type, so a wrong example is an error, not a cosmetic issue.',
    'date-only values are written as year, month, day, such as 2026-03-12.',
    'Every required property must appear in an example, and an enum value must come from the list.',
    'An example on an array type must be an array, even when it holds one item.',
  ],
  solution: `
The type example had four mistakes:
- \`patientId\` was missing, and it is required.
- \`quantity\` held the word \`thirty\`, and an integer needs \`30\`.
- \`status\` held \`ON_HOLD\`, which is not in the enum.
- \`issuedOn\` used \`12/03/2026\`, and \`date-only\` needs \`2026-03-12\`.

The body example had one mistake. The body type is \`Prescription[]\`, so its example must be a list. A dash in front of the first property turns it into a list with one item.

The fix is always in the example, because the type is the agreement and the example only illustrates it.
`,
  followUps: [
    {
      q: 'What is the difference between example and examples?',
      a: 'example holds one sample. examples is a map of named samples, useful when you want to show several cases, such as an issued and a cancelled prescription.',
    },
    {
      q: 'Why do wrong examples matter if the real API behaves correctly?',
      a: 'Docs and mock services use them. A consumer who builds against a mock with a wrong date format will find the bug later, when the real API is connected.',
    },
    {
      q: 'Can you turn off the check for one example?',
      a: 'Yes. Write the sample under value and set strict: false next to it. Use this rarely, for instance to show a deliberately invalid payload.',
    },
  ],
}

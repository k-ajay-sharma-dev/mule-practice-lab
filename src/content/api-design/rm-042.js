export default {
  id: 'rm-042',
  category: 'api-design',
  title: 'Claims Intake API: A Type with Two Parents',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'data-types', 'inheritance', 'multiple-inheritance', 'insurance'],
  estMinutes: 20,
  description: `
An insurer takes claims online. Its contract has personal details and contact details in several places, and each copy has drifted a little. The team wants each set of fields defined once.

With **inheritance**, a type takes the properties of a parent type. With **multiple inheritance**, it takes the properties of several parents at once:

\`type: [ A, B ]\`

A value of that type must have everything from \`A\` and everything from \`B\`. This is different from a union, \`A | B\`, where a value fits one or the other.

**Requirements**
- A type \`Person\` has the required strings \`firstName\` and \`lastName\`, and a required \`dateOfBirth\` that is a calendar day.
- A type \`ContactDetails\` has a required string \`email\` and an optional string \`phone\`.
- A type \`Claimant\` inherits from both \`Person\` and \`ContactDetails\`, and adds a required string \`policyNumber\`.
- \`Claimant\` has an example that fits it, with the inherited properties included.
- A type \`Witness\` inherits from \`Person\` only, and adds a required string \`statement\`. The insurer must hold no email for a witness.
- \`POST /claimants\` takes a \`Claimant\` body and returns 201.
- \`POST /claimants/{claimantId}/witnesses\` takes a \`Witness\` body and returns 201.
`,
  starter: `#%RAML 1.0
title: Claims Intake API
mediaType: application/json

types:
  Person:
    type: object
    properties:
      firstName: string

/claimants:
`,
  ramlChecks: [
    {
      label: 'Person has its required properties',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Person', prop: 'firstName', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Person', prop: 'lastName', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Person', prop: 'dateOfBirth', want: { type: 'date-only', required: true } },
        ],
      },
    },
    {
      label: 'ContactDetails has a required email and an optional phone',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'ContactDetails', prop: 'email', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'ContactDetails', prop: 'phone', want: { type: 'string', required: false } },
        ],
      },
    },
    {
      label: 'Claimant inherits from both parents',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'Claimant', extends: 'Person' },
          { type: 'typeDecl', name: 'Claimant', extends: 'ContactDetails' },
        ],
      },
    },
    { label: 'Claimant adds a required policyNumber', rule: { type: 'prop', typeName: 'Claimant', prop: 'policyNumber', want: { type: 'string', required: true } } },
    {
      label: 'Claimant has an example',
      rule: {
        type: 'any',
        rules: [
          { type: 'typeDecl', name: 'Claimant', want: { example: { set: true } } },
          { type: 'typeDecl', name: 'Claimant', want: { examples: { set: true } } },
        ],
      },
    },
    {
      label: 'Witness inherits from Person and has no email',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'Witness', extends: 'Person' },
          { type: 'noProp', typeName: 'Witness', prop: 'email' },
        ],
      },
    },
    { label: 'Witness adds a required statement', rule: { type: 'prop', typeName: 'Witness', prop: 'statement', want: { type: 'string', required: true } } },
    {
      label: 'POST /claimants takes a Claimant and returns 201',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/claimants', method: 'post', typeIs: 'Claimant' },
          { type: 'response', path: '/claimants', method: 'post', status: '201' },
        ],
      },
    },
    {
      label: 'POST witnesses takes a Witness and returns 201',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/claimants/{}/witnesses', method: 'post', typeIs: 'Witness' },
          { type: 'response', path: '/claimants/{}/witnesses', method: 'post', status: '201' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Claims Intake API
mediaType: application/json

types:
  Person:
    type: object
    properties:
      firstName: string
      lastName: string
      dateOfBirth: date-only
  ContactDetails:
    type: object
    properties:
      email: string
      phone?: string
  Claimant:
    type: [ Person, ContactDetails ]
    properties:
      policyNumber: string
    example:
      firstName: Priya
      lastName: Nair
      dateOfBirth: 1988-11-02
      email: priya.nair@example.com
      policyNumber: POL-77120
  Witness:
    type: Person
    properties:
      statement: string

/claimants:
  post:
    body:
      type: Claimant
    responses:
      201:
        description: The claimant was added.
  /{claimantId}/witnesses:
    post:
      body:
        type: Witness
      responses:
        201:
          description: The witness was added.
`,
  keyPoints: [
    'type: [ A, B ] inherits from both parents, so a value needs the properties of each.',
    'A | B is a union, so a value fits one or the other. Interviewers often ask about the difference.',
    'Small parents that each hold one idea can be combined in many ways.',
    'Multiple inheritance works on object types. You cannot inherit from two different primitive types such as number and string.',
    'An example on the child must include the required properties it inherits.',
  ],
  solution: `
\`Person\` and \`ContactDetails\` each hold one idea, and each is defined once. \`Claimant\` combines them with \`type: [ Person, ContactDetails ]\`, and \`Witness\` takes only the part it needs.

A union would be wrong for \`Claimant\`. \`Person | ContactDetails\` accepts a value with only an email, and a claim needs both sets of fields.

The order of the parents does not matter here, since they share no property names.
`,
  followUps: [
    {
      q: 'What happens if two parents declare the same property?',
      a: 'The child keeps the restrictions of both. If those restrictions cannot all hold, the type is not valid, so it is safest to keep parents free of shared names.',
    },
    {
      q: 'When is composition with a nested property better than inheritance?',
      a: 'Use a nested property such as contact: ContactDetails when the data is really a separate part. Use inheritance when the fields belong flat on the object itself.',
    },
    {
      q: 'Why inherit at all when you could copy four fields?',
      a: 'Copies drift. A later rule on email has to be found and changed in every copy, while a parent type changes in one place.',
    },
  ],
}

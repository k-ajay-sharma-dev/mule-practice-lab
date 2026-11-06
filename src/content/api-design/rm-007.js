export default {
  id: 'rm-007',
  category: 'api-design',
  title: 'Policy API: Enums, Required and Optional Properties',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'data-types', 'enum', 'optional-properties', 'insurance'],
  estMinutes: 12,
  description: `
An insurer is exposing its policies to a partner portal. Past bugs came from status values nobody had agreed on, and from partners who could not tell which fields would always be present.

An **enum** lists every value a property may hold. Anything else breaks the contract.

A property is required unless its name ends with a question mark. \`cancelledOn?: date-only\` means the property can be left out. This is not the same as \`cancelledOn: date-only?\`, where the question mark is on the type. That form means the property must be present but its value can be null.

**Requirements**
- A type \`Policy\` with these properties:
  - \`policyNumber\`: a required string.
  - \`holderName\`: a required string.
  - \`status\`: required, one of \`ACTIVE\`, \`LAPSED\`, \`CANCELLED\`.
  - \`coverLevel\`: optional, one of \`BASIC\`, \`STANDARD\`, \`PREMIUM\`.
  - \`cancelledOn\`: an optional \`date-only\`, left out of the data until a policy is cancelled.
- Write each enum on the property. If you prefer named types, call them \`PolicyStatus\` and \`CoverLevel\`.
- \`GET /policies/{policyNumber}\` returns a \`Policy\` with status 200, or 404.
`,
  starter: `#%RAML 1.0
title: Policy API
mediaType: application/json

types:
  Policy:
    type: object
    properties:
      policyNumber: string

/policies:
`,
  ramlChecks: [
    { label: 'policyNumber is a required string', rule: { type: 'prop', typeName: 'Policy', prop: 'policyNumber', want: { type: 'string', required: true } } },
    { label: 'holderName is a required string', rule: { type: 'prop', typeName: 'Policy', prop: 'holderName', want: { type: 'string', required: true } } },
    {
      label: 'status is required and only allows ACTIVE, LAPSED and CANCELLED',
      rule: {
        type: 'any',
        rules: [
          { type: 'prop', typeName: 'Policy', prop: 'status', want: { required: true, enum: { exactly: ['ACTIVE', 'LAPSED', 'CANCELLED'] } } },
          {
            type: 'all',
            rules: [
              { type: 'prop', typeName: 'Policy', prop: 'status', want: { type: 'PolicyStatus', required: true } },
              { type: 'typeDecl', name: 'PolicyStatus', want: { enum: { exactly: ['ACTIVE', 'LAPSED', 'CANCELLED'] } } },
            ],
          },
        ],
      },
    },
    {
      label: 'coverLevel is optional and only allows BASIC, STANDARD and PREMIUM',
      rule: {
        type: 'any',
        rules: [
          { type: 'prop', typeName: 'Policy', prop: 'coverLevel', want: { required: false, enum: { exactly: ['BASIC', 'STANDARD', 'PREMIUM'] } } },
          {
            type: 'all',
            rules: [
              { type: 'prop', typeName: 'Policy', prop: 'coverLevel', want: { type: 'CoverLevel', required: false } },
              { type: 'typeDecl', name: 'CoverLevel', want: { enum: { exactly: ['BASIC', 'STANDARD', 'PREMIUM'] } } },
            ],
          },
        ],
      },
    },
    { label: 'cancelledOn is an optional date-only', rule: { type: 'prop', typeName: 'Policy', prop: 'cancelledOn', want: { type: 'date-only', required: false } } },
    { label: 'GET /policies/{policyNumber} returns a Policy', rule: { type: 'response', path: '/policies/{}', method: 'get', status: '200', typeIs: 'Policy' } },
    { label: 'GET /policies/{policyNumber} returns 404 for an unknown policy', rule: { type: 'response', path: '/policies/{}', method: 'get', status: '404' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Policy API
mediaType: application/json

types:
  Policy:
    type: object
    properties:
      policyNumber: string
      holderName: string
      status:
        type: string
        enum: [ ACTIVE, LAPSED, CANCELLED ]
      coverLevel?:
        type: string
        enum: [ BASIC, STANDARD, PREMIUM ]
      cancelledOn?: date-only

/policies:
  /{policyNumber}:
    get:
      responses:
        200:
          body:
            type: Policy
        404:
          description: No policy has this number.
`,
  keyPoints: [
    'An enum lists every allowed value, so nobody has to guess the spelling of a status.',
    'A question mark on the property name means the property can be left out.',
    'A question mark on the type means the property is present but can be null.',
    'A property with no question mark must always be there.',
  ],
  solution: `
\`status\` and \`coverLevel\` use enums, so the allowed values are part of the contract. The question mark on \`coverLevel?\` makes the property optional. When it is present, it must still be one of the three values.

\`cancelledOn?\` has the question mark on the name, because an active policy leaves it out. Writing \`date-only?\` on the type would force every policy to send \`cancelledOn: null\`, which is a different promise.
`,
  followUps: [
    {
      q: 'What is the difference between cancelledOn?: date-only and cancelledOn: date-only?',
      a: 'The first means the property can be missing. The second means the property must be present, and its value is a date or null. It is the same as date-only | nil.',
    },
    {
      q: 'Why can adding a new enum value hurt consumers?',
      a: 'A consumer may have logic for each value it knows. A new value can fall through that logic or fail its validation, so treat it as a change to announce or version.',
    },
    {
      q: 'When would you move an enum into a named type?',
      a: 'When more than one property or API uses the same list. A named type keeps the list in one place. For a list used once, writing it on the property is shorter.',
    },
  ],
}

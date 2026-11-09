export default {
  id: 'rm-091',
  category: 'api-design',
  title: 'Customer Profile API: Annotation Type Fragments for Privacy Rules',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'annotations', 'allowed-targets', 'fragments', 'include', 'privacy', 'retail'],
  estMinutes: 30,
  description: `
A retailer with 6 million loyalty customers must answer subject access requests within one month and delete data it no longer needs. The privacy office wants every API to mark personal fields and to state how long each resource keeps its data. A scanner reads the contracts in Exchange and builds the data map from those marks.

The privacy office owns the definitions, so each annotation type lives in an **AnnotationTypeDeclaration fragment**, a file whose first line is \`#%RAML 1.0 AnnotationTypeDeclaration\`. The API brings each one in under \`annotationTypes\` with \`!include\`, and the key there gives it its name.

An annotation declared in the API can also be used inside a DataType fragment that the API includes. \`allowedTargets\` is checked there too.

This problem has four files. Use the tabs above the editor to move between them.

**Requirements**
- \`annotations/pii.raml\` is an AnnotationTypeDeclaration fragment: a string that is one of \`DIRECT\` (identifies a person alone, such as an email) or \`INDIRECT\` (identifies a person with other data, such as a postcode). It is allowed only on \`TypeDeclaration\`.
- \`annotations/retention.raml\` is an AnnotationTypeDeclaration fragment: an object with a required integer \`days\` of at least 1 and a required string \`basis\` that is one of \`CONTRACT\`, \`LEGAL_OBLIGATION\`, \`CONSENT\`. It is allowed only on \`Resource\`.
- \`api.raml\` has the title \`Customer Profile API\`, with JSON as the default media type. It declares \`pii\` and \`retention\` with \`!include\`, and \`Customer\` with \`!include\`.
- \`types/customer.raml\` is a DataType fragment with required strings \`customerId\`, \`fullName\`, \`email\` and \`postcode\`.
- \`fullName\` and \`email\` are marked \`(pii): DIRECT\`. \`postcode\` is marked \`(pii): INDIRECT\`. \`customerId\` is an internal key and carries no \`(pii)\`.
- \`/customers\` is marked \`(retention)\` with 2555 days on the basis \`CONTRACT\`. \`POST /customers\` takes a \`Customer\` and returns 201.
- \`GET /customers/{customerId}\` returns a \`Customer\` with status 200, or 404.
- \`/customers/{customerId}/marketing-preferences\` is marked \`(retention)\` with 730 days on the basis \`CONSENT\`. It has a \`GET\` that returns 200.
`,
  starter: `#%RAML 1.0
title: Customer Profile API
mediaType: application/json

annotationTypes:

types:

/customers:
`,
  files: {
    'annotations/pii.raml': `#%RAML 1.0 AnnotationTypeDeclaration
`,
    'annotations/retention.raml': `#%RAML 1.0 AnnotationTypeDeclaration
`,
    'types/customer.raml': `#%RAML 1.0 DataType
`,
  },
  ramlChecks: [
    {
      label: 'pii comes from annotations/pii.raml and allows only DIRECT and INDIRECT',
      rule: {
        type: 'all',
        rules: [
          { type: 'included', file: 'annotations/pii.raml' },
          { type: 'annotationType', name: 'pii', want: { type: 'string', enum: { exactly: ['DIRECT', 'INDIRECT'] } } },
        ],
      },
    },
    {
      label: 'pii is allowed only on TypeDeclaration',
      rule: { type: 'any', rules: [{ type: 'annotationType', name: 'pii', want: { allowedTargets: { exactly: ['TypeDeclaration'] } } }, { type: 'annotationType', name: 'pii', want: { allowedTargets: { is: 'TypeDeclaration' } } }] },
    },
    {
      label: 'retention comes from annotations/retention.raml and is allowed only on Resource',
      rule: {
        type: 'all',
        rules: [
          { type: 'included', file: 'annotations/retention.raml' },
          { type: 'any', rules: [{ type: 'annotationType', name: 'retention', want: { allowedTargets: { exactly: ['Resource'] } } }, { type: 'annotationType', name: 'retention', want: { allowedTargets: { is: 'Resource' } } }] },
        ],
      },
    },
    {
      label: 'retention is an object with days and a basis',
      rule: { type: 'annotationType', name: 'retention', want: { type: 'object', properties: { holds: { days: { set: true }, basis: { set: true } } } } },
    },
    {
      label: 'Customer comes from types/customer.raml with its four required strings',
      rule: {
        type: 'all',
        rules: [
          { type: 'included', file: 'types/customer.raml' },
          { type: 'prop', typeName: 'Customer', prop: 'customerId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Customer', prop: 'fullName', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Customer', prop: 'email', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Customer', prop: 'postcode', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'fullName and email are marked (pii): DIRECT',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Customer', prop: 'fullName', want: { '(pii)': { is: 'DIRECT' } } },
          { type: 'prop', typeName: 'Customer', prop: 'email', want: { '(pii)': { is: 'DIRECT' } } },
        ],
      },
    },
    { label: 'postcode is marked (pii): INDIRECT', rule: { type: 'prop', typeName: 'Customer', prop: 'postcode', want: { '(pii)': { is: 'INDIRECT' } } } },
    { label: 'customerId carries no (pii)', rule: { type: 'prop', typeName: 'Customer', prop: 'customerId', want: { '(pii)': { set: false } } } },
    { label: '/customers keeps data for 2555 days on the basis CONTRACT', rule: { type: 'annotated', name: 'retention', path: '/customers', value: { holds: { days: 2555, basis: { is: 'CONTRACT' } } } } },
    {
      label: '/customers/{customerId}/marketing-preferences keeps data for 730 days on the basis CONSENT',
      rule: {
        type: 'all',
        rules: [
          { type: 'method', path: '/customers/{}/marketing-preferences', method: 'get' },
          { type: 'annotated', name: 'retention', path: '/customers/{}/marketing-preferences', value: { holds: { days: 730, basis: { is: 'CONSENT' } } } },
        ],
      },
    },
    {
      label: 'POST /customers takes a Customer and returns 201, and GET /customers/{customerId} returns one or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/customers', method: 'post', typeIs: 'Customer' },
          { type: 'response', path: '/customers', method: 'post', status: '201' },
          { type: 'response', path: '/customers/{}', method: 'get', status: '200', typeIs: 'Customer' },
          { type: 'response', path: '/customers/{}', method: 'get', status: '404' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Customer Profile API
mediaType: application/json

annotationTypes:
  pii: !include annotations/pii.raml
  retention: !include annotations/retention.raml

types:
  Customer: !include types/customer.raml

/customers:
  (retention):
    days: 2555
    basis: CONTRACT
  post:
    body:
      type: Customer
    responses:
      201:
        description: The customer was created.
  /{customerId}:
    get:
      responses:
        200:
          body:
            type: Customer
        404:
          description: No customer has this id.
    /marketing-preferences:
      (retention):
        days: 730
        basis: CONSENT
      get:
        responses:
          200:
            description: The channels this customer agreed to.
`,
  referenceFiles: {
    'annotations/pii.raml': `#%RAML 1.0 AnnotationTypeDeclaration
type: string
enum: [ DIRECT, INDIRECT ]
description: DIRECT identifies a person alone. INDIRECT identifies a person together with other data.
allowedTargets: [ TypeDeclaration ]
`,
    'annotations/retention.raml': `#%RAML 1.0 AnnotationTypeDeclaration
type: object
properties:
  days:
    type: integer
    minimum: 1
  basis:
    type: string
    enum: [ CONTRACT, LEGAL_OBLIGATION, CONSENT ]
allowedTargets: [ Resource ]
`,
    'types/customer.raml': `#%RAML 1.0 DataType
type: object
properties:
  customerId: string
  fullName:
    type: string
    (pii): DIRECT
  email:
    type: string
    (pii): DIRECT
  postcode:
    type: string
    (pii): INDIRECT
`,
  },
  keyPoints: [
    'An AnnotationTypeDeclaration fragment holds one annotation type, and the key under annotationTypes names it.',
    'An annotation declared in the API can be used inside the fragments that API includes.',
    'allowedTargets is checked wherever the annotation is used, inside fragments too.',
    'An object annotation keeps related facts, such as days and basis, together and checked.',
    'Marking fields in the contract lets a tool build the data map without reading code.',
  ],
  solution: `
The privacy office owns two small files. Every API includes them, so \`pii\` and \`retention\` mean the same thing everywhere, and a new value such as \`SPECIAL_CATEGORY\` is added in one place.

The marks sit where the facts belong. \`(pii)\` is on each property, inside the Customer fragment. \`(retention)\` is on each resource. If a developer puts \`(retention)\` on a method, or \`(pii)\` on a resource, \`allowedTargets\` makes the parser refuse it.

Marketing preferences have a shorter period and a different basis. They rest on consent, so they go when consent goes or after two years. The core profile is kept for seven years under the contract.
`,
  followUps: [
    {
      q: 'Why is a postcode marked INDIRECT and not DIRECT?',
      a: 'Many households share a postcode, so it does not identify one person alone. Combined with a date of birth it often does, which is why it is still personal data.',
    },
    {
      q: 'Why does customerId carry no pii mark?',
      a: 'It is an internal key with no meaning outside the company systems. Marking it would flood the data map and hide the fields that matter.',
    },
    {
      q: 'How would the privacy scanner use these marks?',
      a: 'It reads each contract from Exchange and lists every marked field with its API. Reviewers then check masking in logs and the delete jobs against that list.',
    },
    {
      q: 'What is the difference between a library and an AnnotationTypeDeclaration fragment?',
      a: 'A library shares many annotation types and other parts under one prefix. A fragment holds one annotation type, and the including API chooses its name.',
    },
  ],
}

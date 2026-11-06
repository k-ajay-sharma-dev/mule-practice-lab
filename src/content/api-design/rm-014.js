export default {
  id: 'rm-014',
  category: 'api-design',
  title: 'Gym Membership API: Union Types',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'data-types', 'union-types', 'nil', 'fitness'],
  estMinutes: 20,
  description: `
A chain of gyms takes membership payments by card or by direct debit. Each kind of payment carries different data, so one type with every field optional would say very little.

A **union type** says a value is one of several types. It is written with a pipe: \`type: CardPayment | DirectDebit\`. The value must fit at least one of them. This is different from \`type: [ CardPayment, DirectDebit ]\`, which is inheritance from both.

Union types also describe values that can be null, using the built-in \`nil\` type: \`string | nil\`.

**Requirements**
- A type \`CardPayment\` with a required string \`kind\` whose enum only allows \`CARD\`, and a required string \`cardToken\`.
- A type \`DirectDebit\` with a required string \`kind\` whose enum only allows \`DIRECT_DEBIT\`, and a required string \`mandateId\`.
- A type \`Payment\` that is the union of \`CardPayment\` and \`DirectDebit\`.
- \`Payment\` has an example that fits it. You can use \`example\`, or \`examples\` to show both kinds.
- A type \`Membership\` with a required string \`memberId\`, a required \`payment\` of type \`Payment\`, and a required \`promoCode\` that is always present but can be null.
- \`POST /memberships\` takes a \`Membership\` body and returns 201.
- \`GET /memberships/{memberId}/payments\` returns \`Payment[]\` with status 200.
`,
  starter: `#%RAML 1.0
title: Gym Membership API
mediaType: application/json

types:
  CardPayment:
    type: object
    properties:
      kind:
        type: string
        enum: [ CARD ]
      cardToken: string

/memberships:
`,
  ramlChecks: [
    {
      label: 'CardPayment has kind CARD and a required cardToken',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'CardPayment', prop: 'kind', want: { required: true, enum: 'CARD' } },
          { type: 'prop', typeName: 'CardPayment', prop: 'cardToken', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'DirectDebit has kind DIRECT_DEBIT and a required mandateId',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'DirectDebit', prop: 'kind', want: { required: true, enum: 'DIRECT_DEBIT' } },
          { type: 'prop', typeName: 'DirectDebit', prop: 'mandateId', want: { type: 'string', required: true } },
        ],
      },
    },
    { label: 'Payment is a union of CardPayment and DirectDebit', rule: { type: 'typeDecl', name: 'Payment', want: { type: ['CardPayment', '|', 'DirectDebit'] } } },
    {
      label: 'Payment has an example',
      rule: {
        type: 'any',
        rules: [
          { type: 'typeDecl', name: 'Payment', want: { example: { set: true } } },
          { type: 'typeDecl', name: 'Payment', want: { examples: { set: true } } },
        ],
      },
    },
    { label: 'Membership has a required string memberId', rule: { type: 'prop', typeName: 'Membership', prop: 'memberId', want: { type: 'string', required: true } } },
    { label: 'Membership.payment uses Payment', rule: { type: 'prop', typeName: 'Membership', prop: 'payment', want: { type: 'Payment', required: true } } },
    {
      label: 'promoCode is always present but can be null',
      rule: {
        type: 'any',
        rules: [
          { type: 'prop', typeName: 'Membership', prop: 'promoCode', want: { type: ['string', '|', 'nil'], required: true } },
          { type: 'prop', typeName: 'Membership', prop: 'promoCode', want: { type: 'string?', required: true } },
        ],
      },
    },
    {
      label: 'POST /memberships takes a Membership and returns 201',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/memberships', method: 'post', typeIs: 'Membership' },
          { type: 'response', path: '/memberships', method: 'post', status: '201' },
        ],
      },
    },
    { label: 'GET /memberships/{memberId}/payments returns Payment[]', rule: { type: 'response', path: '/memberships/{}/payments', method: 'get', status: '200', typeIs: 'Payment[]' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Gym Membership API
mediaType: application/json

types:
  CardPayment:
    type: object
    properties:
      kind:
        type: string
        enum: [ CARD ]
      cardToken: string
  DirectDebit:
    type: object
    properties:
      kind:
        type: string
        enum: [ DIRECT_DEBIT ]
      mandateId: string
  Payment:
    type: CardPayment | DirectDebit
    examples:
      card:
        kind: CARD
        cardToken: tok_8841
      debit:
        kind: DIRECT_DEBIT
        mandateId: MD-20-7731
  Membership:
    type: object
    properties:
      memberId: string
      payment: Payment
      promoCode: string | nil

/memberships:
  post:
    body:
      type: Membership
    responses:
      201:
        description: The membership was created.
  /{memberId}:
    /payments:
      get:
        responses:
          200:
            body:
              type: Payment[]
`,
  keyPoints: [
    'A union is written with a pipe, and a value must fit at least one of its members.',
    'type: [ A, B ] is inheritance from both. type: A | B is a choice between them.',
    'A property such as kind lets a consumer tell the members of a union apart.',
    'string | nil means the property is present and may be null. string? is a shorter way to write it.',
  ],
  solution: `
\`Payment\` is a choice, so each kind of payment keeps its own required properties. A card payment must have a \`cardToken\`, and nothing about direct debit gets in the way. One big type with everything optional could not promise that.

\`kind\` has one allowed value per member. A consumer reads \`kind\` and knows which shape it holds.

\`promoCode\` is \`string | nil\` with no question mark on the name. The property is always there, and null means no code was used. \`promoCode?\` would be a different promise: the property can be missing.
`,
  followUps: [
    {
      q: 'How is a union different from one type with many optional properties?',
      a: 'A union keeps the rules of each case. With optional properties, a payment with neither cardToken nor mandateId would be valid, and so would one with both.',
    },
    {
      q: 'What does (CardPayment | DirectDebit)[] mean?',
      a: 'A list where each item is either kind. The round brackets group the union, so that [] applies to all of it.',
    },
    {
      q: 'What does the discriminator facet add?',
      a: 'It names a property that says which type a value is, such as kind. It is set on a named object type and is often used with inheritance. It cannot be set on a union declaration itself.',
    },
  ],
}

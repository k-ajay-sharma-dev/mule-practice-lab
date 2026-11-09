export default {
  id: 'rm-111',
  category: 'api-design',
  title: 'Claims API: A Discriminator, Resource Types and Examples That Do Not Fit',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'debugging', 'discriminator', 'union-types', 'resource-types', 'insurance'],
  estMinutes: 30,
  description: `
An insurer handles 60,000 motor and home claims a year. Brokers read claim details through this API, and the broker portal shows a different screen for each kind of claim. It picks the screen from the field \`claimType\`.

Version 2 of the contract was released on Friday. On Monday the brokers reported three things: the mock server rejects the file, \`GET /claims\` returns a type called \`<<itemType>>[]\`, and \`GET /claims/{claimId}\` does not exist at all. A reviewer also says home claims will never be recognised.

There are seven mistakes. Some show as parser errors. Others are valid RAML that does the wrong thing. Fix the contract without changing what the business asked for.

**Requirements**
- \`policyNumber\` looks like \`POL-0048213\`: the letters \`POL\`, a hyphen and seven digits.
- \`Money\` has a required number \`amount\` of at least 0 and a required \`currency\` of three capital letters.
- \`ClaimBase\` uses \`claimType\` as its discriminator.
- \`MotorClaim\` and \`HomeClaim\` inherit from \`ClaimBase\`. Their discriminator values are \`MOTOR\` and \`HOME\`, written exactly as in the \`claimType\` enum.
- \`HomeClaim\` has a required \`peril\` that is one of \`FLOOD\`, \`FIRE\`, \`THEFT\`, \`STORM\`. The policy covers no other peril.
- \`Claim\` is the union of \`MotorClaim\` and \`HomeClaim\`.
- \`/claims\` uses the resource type \`collection\`, so \`GET /claims\` returns \`Claim[]\` with status 200. It also has an optional \`policyNumber\` query parameter.
- \`/claims/{claimId}\` uses the resource type \`member\`, so \`GET /claims/{claimId}\` returns a \`Claim\` with status 200, or an \`Error\` with status 404.
- Every type keeps its example, and every example fits its type.
`,
  starter: `#%RAML 1.0
title: Claims API
version: v2
baseUri: https://api.example.com/claims/{version}
mediaType: application/json

types:
  Money:
    type: object
    properties:
      amount:
        type: number
        minimum: 0
      currency:
        type: string
        pattern: ^[A-Z]{3}$
  ClaimBase:
    type: object
    discriminator: claimType
    properties:
      claimId: string
      policyNumber:
        type: string
        pattern: ^POL[0-9]{7}$
      claimType:
        type: string
        enum: [ MOTOR, HOME ]
      incidentDate: date-only
      estimate: Money
  MotorClaim:
    type: ClaimBase
    discriminatorValue: MOTOR
    properties:
      vehicleRegistration: string
      thirdPartyInvolved: boolean
    example:
      claimId: CL-500211
      policyNumber: POL-0048213
      claimType: MOTOR
      incidentDate: 2026-02-11
      estimate:
        amount: '1250.00'
        currency: GBP
      vehicleRegistration: AB12 CDE
      thirdPartyInvolved: false
  HomeClaim:
    type: ClaimBase
    discriminatorValue: home
    properties:
      propertyPostcode: string
      peril:
        type: string
        enum: [ FLOOD, FIRE, THEFT, STORM ]
    example:
      claimId: CL-500377
      policyNumber: POL-0091550
      claimType: HOME
      incidentDate: 2026-01-29
      estimate:
        amount: 8400
        currency: GBP
      propertyPostcode: LS1 4AP
      peril: WATER
  Claim:
    type: MotorClaim | HomeClaims
  Error:
    type: object
    properties:
      code: string
      message: string

resourceTypes:
  collection:
    get:
      description: List the <<resourcePathName>>.
      responses:
        200:
          body:
            type: <<itemType>>[]
  member:
    get?:
      description: Read one <<resourcePathName | !singularize>>.
      responses:
        200:
          body:
            type: <<itemType>>
        404:
          body:
            type: Error

/claims:
  type: { collection: { item: Claim } }
  get:
    queryParameters:
      policyNumber?: string
  /{claimId}:
    type: { member: { itemType: Claim } }
`,
  ramlChecks: [
    {
      label: 'policyNumber is POL, a hyphen and seven digits',
      rule: { type: 'prop', typeName: 'ClaimBase', prop: 'policyNumber', want: { type: 'string', required: true, pattern: { accepts: ['POL-0048213', 'POL-9999999'], rejects: ['POL0048213', 'POL-48213', 'XPOL-0048213', 'POL-00482130'] } } },
    },
    {
      label: 'Money has a number amount of at least 0 and a three letter currency',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Money', prop: 'amount', want: { type: 'number', required: true, minimum: 0 } },
          { type: 'prop', typeName: 'Money', prop: 'currency', want: { type: 'string', required: true, pattern: { accepts: ['GBP', 'EUR'], rejects: ['gbp', 'GB', 'GBPX'] } } },
        ],
      },
    },
    { label: 'ClaimBase uses claimType as its discriminator', rule: { type: 'typeDecl', name: 'ClaimBase', want: { discriminator: { is: 'claimType' } } } },
    {
      label: 'MotorClaim and HomeClaim inherit from ClaimBase with the values MOTOR and HOME',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'MotorClaim', extends: 'ClaimBase', want: { discriminatorValue: { is: 'MOTOR' } } },
          { type: 'typeDecl', name: 'HomeClaim', extends: 'ClaimBase', want: { discriminatorValue: { is: 'HOME' } } },
        ],
      },
    },
    { label: 'peril allows only FLOOD, FIRE, THEFT and STORM', rule: { type: 'prop', typeName: 'HomeClaim', prop: 'peril', want: { required: true, enum: { exactly: ['FLOOD', 'FIRE', 'THEFT', 'STORM'] } } } },
    {
      label: 'MotorClaim and HomeClaim keep their examples',
      rule: {
        type: 'all',
        rules: [
          { type: 'any', rules: [{ type: 'typeDecl', name: 'MotorClaim', want: { example: { set: true } } }, { type: 'typeDecl', name: 'MotorClaim', want: { examples: { set: true } } }] },
          { type: 'any', rules: [{ type: 'typeDecl', name: 'HomeClaim', want: { example: { set: true } } }, { type: 'typeDecl', name: 'HomeClaim', want: { examples: { set: true } } }] },
        ],
      },
    },
    { label: 'Claim is the union of MotorClaim and HomeClaim', rule: { type: 'typeDecl', name: 'Claim', want: { type: ['MotorClaim', 'HomeClaim', '|'] } } },
    {
      label: 'GET /claims returns Claim[] from the collection resource type',
      rule: {
        type: 'all',
        rules: [
          { type: 'typed', path: '/claims', resourceType: 'collection', provides: ['get.responses.200'] },
          { type: 'response', path: '/claims', method: 'get', status: '200', typeIs: 'Claim[]' },
        ],
      },
    },
    { label: 'GET /claims has an optional policyNumber filter', rule: { type: 'param', path: '/claims', method: 'get', in: 'query', name: 'policyNumber', want: { required: false } } },
    {
      label: 'GET /claims/{claimId} returns a Claim, or an Error with 404, from member',
      rule: {
        type: 'all',
        rules: [
          { type: 'typed', path: '/claims/{}', resourceType: 'member', provides: ['get.responses.200'] },
          { type: 'response', path: '/claims/{}', method: 'get', status: '200', typeIs: 'Claim' },
          { type: 'response', path: '/claims/{}', method: 'get', status: '404', typeIs: 'Error' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Claims API
version: v2
baseUri: https://api.example.com/claims/{version}
mediaType: application/json

types:
  Money:
    type: object
    properties:
      amount:
        type: number
        minimum: 0
      currency:
        type: string
        pattern: ^[A-Z]{3}$
  ClaimBase:
    type: object
    discriminator: claimType
    properties:
      claimId: string
      policyNumber:
        type: string
        pattern: ^POL-[0-9]{7}$
      claimType:
        type: string
        enum: [ MOTOR, HOME ]
      incidentDate: date-only
      estimate: Money
  MotorClaim:
    type: ClaimBase
    discriminatorValue: MOTOR
    properties:
      vehicleRegistration: string
      thirdPartyInvolved: boolean
    example:
      claimId: CL-500211
      policyNumber: POL-0048213
      claimType: MOTOR
      incidentDate: 2026-02-11
      estimate:
        amount: 1250.00
        currency: GBP
      vehicleRegistration: AB12 CDE
      thirdPartyInvolved: false
  HomeClaim:
    type: ClaimBase
    discriminatorValue: HOME
    properties:
      propertyPostcode: string
      peril:
        type: string
        enum: [ FLOOD, FIRE, THEFT, STORM ]
    example:
      claimId: CL-500377
      policyNumber: POL-0091550
      claimType: HOME
      incidentDate: 2026-01-29
      estimate:
        amount: 8400
        currency: GBP
      propertyPostcode: LS1 4AP
      peril: FLOOD
  Claim:
    type: MotorClaim | HomeClaim
  Error:
    type: object
    properties:
      code: string
      message: string

resourceTypes:
  collection:
    get:
      description: List the <<resourcePathName>>.
      responses:
        200:
          body:
            type: <<itemType>>[]
  member:
    get:
      description: Read one <<resourcePathName | !singularize>>.
      responses:
        200:
          body:
            type: <<itemType>>
        404:
          body:
            type: Error

/claims:
  type: { collection: { itemType: Claim } }
  get:
    queryParameters:
      policyNumber?: string
  /{claimId}:
    type: { member: { itemType: Claim } }
`,
  keyPoints: [
    'A resource type parameter is matched by name. item and itemType are different, and the parser leaves <<itemType>> unfilled without an error.',
    'A method ending in ? in a resource type is only added when the resource declares that method itself.',
    'discriminatorValue must match the value callers send, letter for letter. home never matches HOME.',
    'A pattern and its example must agree. When the requirement says the example is right, fix the pattern.',
    'YAML quotes turn 1250.00 into a string, which does not fit a number.',
  ],
  solution: `
The seven fixes.
- **The pattern.** \`^POL[0-9]{7}$\` has no hyphen, so the example \`POL-0048213\` failed. The requirement names the hyphen, so the pattern changes and the example stays.
- **The amount.** \`'1250.00'\` in quotes is a string. Remove the quotes so it is a number.
- **The discriminator value.** \`home\` becomes \`HOME\`. The portal reads \`claimType: HOME\` and looks for a subtype with that value. With \`home\` none matches, so no home claim was ever recognised. The parser cannot see this.
- **The peril.** \`WATER\` is not covered. Change the example to a covered peril and leave the enum alone.
- **The union.** \`HomeClaims\` is not declared. The type is \`HomeClaim\`.
- **The parameter name.** \`collection\` reads \`<<itemType>>\`, and \`/claims\` passed \`item\`. The text stayed as \`<<itemType>>[]\` and reached the brokers.
- **The optional method.** \`get?\` in \`member\` only adds \`get\` to a resource that already has one. \`/{claimId}\` had none, so it had no methods. Make it \`get\`, or declare \`get:\` on \`/{claimId}\`.
`,
  followUps: [
    {
      q: 'What does the discriminator give a caller that a union alone does not?',
      a: 'With a union, the caller has to guess the subtype from which fields are present. A discriminator names one field whose value says the subtype, so the portal reads claimType and picks the screen at once.',
    },
    {
      q: 'Why can a wrong parameter name pass the parser?',
      a: 'Text inside << >> is a placeholder, and the parser cannot know which names the author meant. An unfilled placeholder stays as plain text, so a test on the expanded contract or a mock call finds it.',
    },
    {
      q: 'When is get? in a resource type useful?',
      a: 'When most resources of that kind support get but some do not. The resource type describes get once, and each resource opts in by declaring get itself.',
    },
    {
      q: 'How would you add travel claims later without breaking the brokers?',
      a: 'Add TravelClaim with discriminatorValue TRAVEL, add TRAVEL to the claimType enum and to the Claim union. Tell brokers first, because a portal with a strict switch on claimType may fail on a value it has not seen.',
    },
  ],
}

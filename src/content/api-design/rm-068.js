export default {
  id: 'rm-068',
  category: 'api-design',
  title: 'Car Insurance Quotes API: Separate Request and Response Types',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'data-types', 'request-body', 'examples', 'status-codes', 'insurance'],
  estMinutes: 18,
  description: `
A car insurer sells through its own site and through four price comparison sites, which together send about 90,000 quote requests a day. The first version of the contract used one \`Quote\` type for both the request and the response. Partners saw \`premium\` and \`quoteId\` in the request body and started to send them, and one partner sent last year's premium back on every call.

The fix is two types:
- \`QuoteRequest\` is what the caller knows: the car, the driver and the cover wanted.
- \`Quote\` is what the insurer decides: an id, a price and an expiry time.

Each type gets an example that fits its facets, so partners see a valid request and a valid answer.

UK registrations here are written with no space: two letters, two digits, three letters, such as \`AB12CDE\`. Quote ids look like \`Q-00418822\`.

**Requirements**
- \`QuoteRequest\` with:
  - \`registration\`: required string such as \`AB12CDE\`.
  - \`driverAge\`: required integer from 17 to 99.
  - \`annualMileage\`: required integer from 1000 to 50000.
  - \`coverType\`: required, only \`comprehensive\`, \`third-party\` or \`third-party-fire-theft\`.
  - No \`quoteId\` and no \`premium\`.
- \`Quote\` with a required \`quoteId\` such as \`Q-00418822\`, a required number \`premium\` of at least 0, a required \`expiresAt\` date and time with a time zone, and a required \`coverType\` with the same three values.
- Both types have an example.
- \`POST /quotes\` takes a \`QuoteRequest\` and returns 201 with \`Location\` and a \`Quote\`, or 400.
- \`GET /quotes/{quoteId}\` returns a \`Quote\`, or 404.
`,
  starter: `#%RAML 1.0
title: Car Insurance Quotes API
mediaType: application/json

types:
  Quote:
    type: object
    properties:
      quoteId: string
      premium: number
      registration: string
      driverAge: integer

/quotes:
  post:
    body:
      type: Quote
    responses:
      201:
        body:
          type: Quote
`,
  ramlChecks: [
    {
      label: 'QuoteRequest exists and has no quoteId or premium',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'QuoteRequest' },
          { type: 'noProp', typeName: 'QuoteRequest', prop: 'quoteId' },
          { type: 'noProp', typeName: 'QuoteRequest', prop: 'premium' },
        ],
      },
    },
    {
      label: 'registration is a string whose pattern accepts AB12CDE',
      rule: { type: 'prop', typeName: 'QuoteRequest', prop: 'registration', want: { type: 'string', required: true, pattern: { accepts: ['AB12CDE', 'XY73ZZA'], rejects: ['AB12 CDE', 'ab12cde', 'AB1CDE', 'AB12CDEF', '1234567'] } } },
    },
    {
      label: 'driverAge is 17 to 99 and annualMileage is 1000 to 50000, both integers',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'QuoteRequest', prop: 'driverAge', want: { type: 'integer', required: true, minimum: 17, maximum: 99 } },
          { type: 'prop', typeName: 'QuoteRequest', prop: 'annualMileage', want: { type: 'integer', required: true, minimum: 1000, maximum: 50000 } },
        ],
      },
    },
    {
      label: 'coverType allows the same three values on both types',
      rule: {
        type: 'all',
        rules: ['QuoteRequest', 'Quote'].map((typeName) => ({ type: 'prop', typeName, prop: 'coverType', want: { required: true, enum: { exactly: ['comprehensive', 'third-party', 'third-party-fire-theft'] } } })),
      },
    },
    {
      label: 'Quote has a quoteId like Q-00418822, a premium of at least 0 and a datetime expiresAt',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Quote', prop: 'quoteId', want: { type: 'string', required: true, pattern: { accepts: ['Q-00418822'], rejects: ['Q-418822', 'q-00418822', '00418822', 'Q-004188220'] } } },
          { type: 'prop', typeName: 'Quote', prop: 'premium', want: { type: 'number', required: true, minimum: 0 } },
          { type: 'prop', typeName: 'Quote', prop: 'expiresAt', want: { type: 'datetime', required: true } },
        ],
      },
    },
    {
      label: 'QuoteRequest and Quote both have an example',
      rule: {
        type: 'all',
        rules: ['QuoteRequest', 'Quote'].map((name) => ({ type: 'any', rules: [{ type: 'typeDecl', name, has: 'example' }, { type: 'typeDecl', name, has: 'examples' }] })),
      },
    },
    { label: 'POST /quotes takes a QuoteRequest', rule: { type: 'body', path: '/quotes', method: 'post', typeIs: 'QuoteRequest' } },
    { label: 'POST /quotes returns 201 with Location and a Quote', rule: { type: 'response', path: '/quotes', method: 'post', status: '201', typeIs: 'Quote', header: 'Location' } },
    { label: 'POST /quotes returns 400 for a bad request', rule: { type: 'response', path: '/quotes', method: 'post', status: '400' } },
    {
      label: 'GET /quotes/{quoteId} returns a Quote or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/quotes/{}', method: 'get', status: '200', typeIs: 'Quote' },
          { type: 'response', path: '/quotes/{}', method: 'get', status: '404' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Car Insurance Quotes API
mediaType: application/json

types:
  CoverType:
    type: string
    enum: [ comprehensive, third-party, third-party-fire-theft ]
  QuoteRequest:
    type: object
    properties:
      registration:
        type: string
        pattern: ^[A-Z]{2}[0-9]{2}[A-Z]{3}$
      driverAge:
        type: integer
        minimum: 17
        maximum: 99
      annualMileage:
        type: integer
        minimum: 1000
        maximum: 50000
      coverType: CoverType
    example:
      registration: AB12CDE
      driverAge: 34
      annualMileage: 8000
      coverType: comprehensive
  Quote:
    type: object
    properties:
      quoteId:
        type: string
        pattern: ^Q-[0-9]{8}$
      premium:
        type: number
        minimum: 0
      expiresAt: datetime
      coverType: CoverType
    example:
      quoteId: Q-00418822
      premium: 612.40
      expiresAt: 2026-12-09T23:59:59Z
      coverType: comprehensive

/quotes:
  post:
    description: Price a car insurance policy.
    body:
      type: QuoteRequest
    responses:
      201:
        headers:
          Location:
            type: string
            example: /quotes/Q-00418822
        body:
          type: Quote
      400:
        description: The request does not fit the QuoteRequest type.
  /{quoteId}:
    get:
      responses:
        200:
          body:
            type: Quote
        404:
          description: No quote has this id, or it was deleted after 90 days.
`,
  keyPoints: [
    'Fields the server decides, such as ids and prices, belong only in the response type.',
    'A shared request and response type invites callers to send values the server should own.',
    'A named CoverType keeps both types on the same list of values.',
    'Facets such as minimum 17 on driverAge put business rules in the contract, where partners read them.',
    'Each type has its own example, so partners see a valid request and a valid answer side by side.',
  ],
  solution: `
\`QuoteRequest\` holds only what a partner knows. Without \`premium\` and \`quoteId\` in it, no partner can send a stale price, and nothing in the contract suggests that they should.

\`Quote\` is what the insurer decides. \`quoteId\` has a pattern so a partner can store it safely, \`premium\` cannot be negative, and \`expiresAt\` is a \`datetime\` with a time zone because a quote expires at an exact moment.

\`CoverType\` is one named type used by both, so a fourth cover level is added once. The facets on \`driverAge\` and \`annualMileage\` refuse an age of 12 or a mileage of 5 million at the door with a 400, and the examples prove the facets allow a normal request.
`,
  followUps: [
    {
      q: 'Could Quote reuse QuoteRequest with type inheritance?',
      a: 'Yes. Quote could set type: QuoteRequest and add quoteId, premium and expiresAt. That suits a response that echoes every input, but it also ties the two types together for every future change.',
    },
    {
      q: 'Where should the age rule really live, the contract or the rating engine?',
      a: 'Both. The contract refuses impossible input early with a 400. The rating engine still applies the underwriting rules, which change more often than the contract.',
    },
    {
      q: 'What status should GET return for a quote that has expired?',
      a: 'If the quote still exists, return 200 and let expiresAt show it is in the past. Return 404 or 410 only once the quote is deleted.',
    },
    {
      q: 'Why does POST return 201 for a quote that is only a price?',
      a: 'The quote is stored with its own id and URL, so a new resource exists. The partner can fetch it later with GET /quotes/{quoteId}.',
    },
  ],
}

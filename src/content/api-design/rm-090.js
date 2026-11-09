export default {
  id: 'rm-090',
  category: 'api-design',
  title: 'Motor Quotes API: NamedExample Fragments for Normal and Edge Cases',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'fragments', 'include', 'examples', 'edge-cases', 'insurance'],
  estMinutes: 25,
  description: `
A car insurer gives about 18,000 quotes a day through price comparison sites. The partners build against the mocking service in Exchange before they get a test key, so the examples in the contract are what they code against. Last year a partner never handled a declined quote, because the contract only showed a happy path.

The quote type moves into a **DataType fragment**. Its examples move into a **NamedExample fragment**, a file whose first line is \`#%RAML 1.0 NamedExample\`. It holds a map of named examples, the same shape you would write under \`examples\`. Each entry is either the value itself, or \`value\` with a \`displayName\` and \`description\`.

A NamedExample file goes under \`examples\`, not \`example\`. The parser still checks every example in it against the type.

This problem has four files. Use the tabs above the editor to move between them.

**Requirements**
- \`types/quote.raml\` is a DataType fragment for \`Quote\`: a required string \`quoteId\`, a required string \`status\` that is one of \`QUOTED\`, \`REFERRED\`, \`DECLINED\`, an optional number \`annualPremium\` (a declined quote has no price), a required string \`currency\` of three capital letters, and a required date-only \`validUntil\`.
- The fragment takes its \`examples\` from \`examples/quotes.raml\` with \`!include\`.
- \`examples/quotes.raml\` is a NamedExample fragment with three examples: \`standardCover\` (quoted), \`youngDriver\` (referred to an underwriter) and \`declined\` (no premium).
- \`api.raml\` has the title \`Motor Quotes API\`, with JSON as the default media type, and declares \`Quote\` with \`!include\`.
- A type \`QuoteRequest\` in \`api.raml\` with a required string \`registration\`, a required integer \`driverAge\` from 17 to 99, and a required string \`postcode\`.
- \`POST /quotes\` takes a \`QuoteRequest\` with the examples from \`examples/quote-requests.raml\`, another NamedExample fragment that you write with at least one example. It returns a \`Quote\` with status 201.
- \`GET /quotes/{quoteId}\` returns a \`Quote\` with status 200, or 404.
`,
  starter: `#%RAML 1.0
title: Motor Quotes API
mediaType: application/json

types:

/quotes:
`,
  files: {
    'types/quote.raml': `#%RAML 1.0 DataType
`,
    'examples/quotes.raml': `#%RAML 1.0 NamedExample
`,
    'examples/quote-requests.raml': `#%RAML 1.0 NamedExample
`,
  },
  ramlChecks: [
    {
      label: 'Quote comes from types/quote.raml',
      rule: {
        type: 'all',
        rules: [
          { type: 'included', file: 'types/quote.raml' },
          { type: 'typeDecl', name: 'Quote' },
        ],
      },
    },
    {
      label: 'Quote status allows only QUOTED, REFERRED and DECLINED, and annualPremium is optional',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Quote', prop: 'status', want: { required: true, enum: { exactly: ['QUOTED', 'REFERRED', 'DECLINED'] } } },
          { type: 'prop', typeName: 'Quote', prop: 'annualPremium', want: { type: 'number', required: false } },
        ],
      },
    },
    {
      label: 'Quote has quoteId, a three letter currency and a date-only validUntil',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Quote', prop: 'quoteId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Quote', prop: 'currency', want: { required: true, pattern: { accepts: ['GBP', 'EUR'], rejects: ['gbp', 'GB', 'GBPS'] } } },
          { type: 'prop', typeName: 'Quote', prop: 'validUntil', want: { type: 'date-only', required: true } },
        ],
      },
    },
    {
      label: 'Quote examples come from examples/quotes.raml: standardCover, youngDriver and declined',
      rule: {
        type: 'all',
        rules: [
          { type: 'included', file: 'examples/quotes.raml' },
          { type: 'typeDecl', name: 'Quote', has: ['examples.standardCover', 'examples.youngDriver', 'examples.declined'] },
        ],
      },
    },
    {
      label: 'QuoteRequest has registration, postcode and a driverAge from 17 to 99',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'QuoteRequest', prop: 'registration', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'QuoteRequest', prop: 'postcode', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'QuoteRequest', prop: 'driverAge', want: { type: 'integer', required: true, minimum: 17, maximum: 99 } },
        ],
      },
    },
    {
      label: 'POST /quotes takes a QuoteRequest, with examples from examples/quote-requests.raml',
      rule: {
        type: 'all',
        rules: [
          { type: 'included', file: 'examples/quote-requests.raml' },
          { type: 'body', path: '/quotes', method: 'post', typeIs: 'QuoteRequest' },
        ],
      },
    },
    { label: 'POST /quotes returns a Quote with status 201', rule: { type: 'response', path: '/quotes', method: 'post', status: '201', typeIs: 'Quote' } },
    {
      label: 'GET /quotes/{quoteId} returns a Quote with its examples, or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/quotes/{}', method: 'get', status: '200', typeIs: 'Quote', example: true },
          { type: 'response', path: '/quotes/{}', method: 'get', status: '404' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Motor Quotes API
mediaType: application/json

types:
  Quote: !include types/quote.raml
  QuoteRequest:
    type: object
    properties:
      registration: string
      driverAge:
        type: integer
        minimum: 17
        maximum: 99
      postcode: string

/quotes:
  post:
    body:
      type: QuoteRequest
      examples: !include examples/quote-requests.raml
    responses:
      201:
        body:
          type: Quote
  /{quoteId}:
    get:
      responses:
        200:
          body:
            type: Quote
        404:
          description: No quote has this id, or it has been deleted after 90 days.
`,
  referenceFiles: {
    'types/quote.raml': `#%RAML 1.0 DataType
type: object
properties:
  quoteId: string
  status:
    type: string
    enum: [ QUOTED, REFERRED, DECLINED ]
  annualPremium?: number
  currency:
    type: string
    pattern: ^[A-Z]{3}$
  validUntil: date-only
examples: !include ../examples/quotes.raml
`,
    'examples/quotes.raml': `#%RAML 1.0 NamedExample
standardCover:
  quoteId: Q-88120
  status: QUOTED
  annualPremium: 642.18
  currency: GBP
  validUntil: 2026-12-09
youngDriver:
  displayName: Driver aged 19, referred
  description: The price needs an underwriter, so the quote has no premium yet.
  value:
    quoteId: Q-88121
    status: REFERRED
    currency: GBP
    validUntil: 2026-11-16
declined:
  quoteId: Q-88122
  status: DECLINED
  currency: GBP
  validUntil: 2026-11-09
`,
    'examples/quote-requests.raml': `#%RAML 1.0 NamedExample
experiencedDriver:
  registration: AB12CDE
  driverAge: 46
  postcode: LS1 4AP
youngDriver:
  registration: YK19XRT
  driverAge: 19
  postcode: M14 5RG
`,
  },
  keyPoints: [
    'A NamedExample fragment starts with #%RAML 1.0 NamedExample and holds a map of named examples.',
    'It goes under examples, never under example.',
    'Each example in the file is still checked against the type.',
    'A displayName and description explain an edge case to the reader of the mock.',
    'Edge cases such as a declined quote belong in the contract, because partners code against the examples.',
  ],
  solution: `
\`types/quote.raml\` holds the shape and points at \`examples/quotes.raml\` for its examples. The path is relative to the fragment, so it starts with \`../\`.

The three examples cover what a partner must handle. \`standardCover\` has a price. \`youngDriver\` and \`declined\` have none, which is why \`annualPremium\` is optional. If it were required, the parser would reject both examples, and that error is how many teams find such a gap.

The request examples live in their own NamedExample file under the body. Testers reuse the same files to drive their test cases, so the mock and the tests agree.
`,
  followUps: [
    {
      q: 'What does the Exchange mocking service return when a type has several examples?',
      a: 'It returns one of the examples, usually the first. Partners can see all of them in the documentation and test their code against each.',
    },
    {
      q: 'Why keep examples in a NamedExample fragment and not in a JSON file?',
      a: 'A NamedExample file holds several named examples with a displayName and description. A JSON file holds one value with no name.',
    },
    {
      q: 'What breaks if a NamedExample file is included under example?',
      a: 'The whole map of names is read as one value. It does not fit the type, so the parser reports that the example is missing the required properties.',
    },
  ],
}

export default {
  id: 'rm-096',
  category: 'api-design',
  title: 'Card Transactions API: Cursor Paging for a Live Feed',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'paging', 'cursor-pagination', 'query-parameters', 'banking'],
  estMinutes: 25,
  description: `
A card issuer shows each customer a list of card transactions in its mobile app. A busy card gets 40 new transactions a day, and the list is read newest first. The first contract used \`page\` and \`pageSize\`. Customers saw the same coffee twice when they scrolled, because new transactions pushed older ones onto the next page.

**Cursor paging** fixes that. The server returns an opaque \`nextCursor\` that marks where the page ended. The app sends it back as \`cursor\` to get the next page. New rows at the top do not move the marker, so nothing repeats and nothing is skipped. When there is no next page, \`nextCursor\` is \`null\`. The field is always present, so the app never has to guess.

**Requirements**
- Keep the title \`Card Transactions API\` and JSON as the default media type.
- A type \`Transaction\` with required strings \`transactionId\` and \`merchant\`, a required number \`amount\`, and a required \`postedAt\` of type \`datetime\`.
- A type \`TransactionPage\` with a required \`items\` of \`Transaction[]\`, and a required \`nextCursor\` that is a string or null. The type has an example.
- A type \`Error\` with required strings \`code\` and \`message\`.
- \`GET /cards/{cardId}/transactions\` takes three optional query parameters:
  - \`cursor\`, a string.
  - \`limit\`, an integer from 1 to 100 with a default of 25.
  - \`since\`, a \`datetime\`.
- It returns 200 with a \`TransactionPage\`, 400 with an \`Error\` for a cursor that is broken or expired, and 404 for an unknown card.
`,
  starter: `#%RAML 1.0
title: Card Transactions API
mediaType: application/json

types:
  Transaction:
    type: object
    properties:
      transactionId: string
      merchant: string
      amount: number
      postedAt: datetime

/cards:
  /{cardId}:
    /transactions:
      get:
        queryParameters:
          page?: integer
          pageSize?: integer
        responses:
          200:
            body:
              type: Transaction[]
`,
  ramlChecks: [
    {
      label: 'Transaction has required transactionId, merchant, amount and a datetime postedAt',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Transaction', prop: 'transactionId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Transaction', prop: 'merchant', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Transaction', prop: 'amount', want: { type: 'number', required: true } },
          { type: 'prop', typeName: 'Transaction', prop: 'postedAt', want: { type: 'datetime', required: true } },
        ],
      },
    },
    { label: 'TransactionPage.items is a required Transaction[]', rule: { type: 'prop', typeName: 'TransactionPage', prop: 'items', want: { type: 'Transaction[]', required: true } } },
    {
      label: 'TransactionPage.nextCursor is always present and may be null',
      rule: {
        type: 'any',
        rules: [
          { type: 'prop', typeName: 'TransactionPage', prop: 'nextCursor', want: { type: 'string | nil', required: true } },
          { type: 'prop', typeName: 'TransactionPage', prop: 'nextCursor', want: { type: 'nil | string', required: true } },
          { type: 'prop', typeName: 'TransactionPage', prop: 'nextCursor', want: { type: 'string?', required: true } },
        ],
      },
    },
    { label: 'cursor is an optional string', rule: { type: 'param', path: '/cards/{}/transactions', method: 'get', in: 'query', name: 'cursor', want: { type: 'string', required: false } } },
    {
      label: 'limit is an optional integer from 1 to 100, default 25',
      rule: { type: 'param', path: '/cards/{}/transactions', method: 'get', in: 'query', name: 'limit', want: { type: 'integer', required: false, minimum: 1, maximum: 100, default: 25 } },
    },
    { label: 'since is an optional datetime', rule: { type: 'param', path: '/cards/{}/transactions', method: 'get', in: 'query', name: 'since', want: { type: 'datetime', required: false } } },
    { label: 'GET returns 200 with a TransactionPage, not a bare list', rule: { type: 'response', path: '/cards/{}/transactions', method: 'get', status: '200', typeIs: 'TransactionPage' } },
    { label: 'The 200 response has an example', rule: { type: 'response', path: '/cards/{}/transactions', method: 'get', status: '200', example: true } },
    {
      label: 'GET returns 400 with an Error for a bad cursor',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Error', prop: 'code', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Error', prop: 'message', want: { type: 'string', required: true } },
          { type: 'response', path: '/cards/{}/transactions', method: 'get', status: '400', typeIs: 'Error' },
        ],
      },
    },
    { label: 'GET returns 404 for an unknown card', rule: { type: 'response', path: '/cards/{}/transactions', method: 'get', status: '404' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Card Transactions API
mediaType: application/json

types:
  Transaction:
    type: object
    properties:
      transactionId: string
      merchant: string
      amount: number
      postedAt: datetime
  TransactionPage:
    type: object
    properties:
      items: Transaction[]
      nextCursor: string | nil
    example:
      items:
        - transactionId: TX-90412
          merchant: Bean There Cafe
          amount: 3.80
          postedAt: 2026-11-02T08:14:00Z
      nextCursor: djEtVFgtOTA0MTI
  Error:
    type: object
    properties:
      code: string
      message: string

/cards:
  /{cardId}:
    /transactions:
      get:
        queryParameters:
          cursor?:
            type: string
            description: The nextCursor from the previous page. Leave it out for the first page.
          limit?:
            type: integer
            minimum: 1
            maximum: 100
            default: 25
          since?:
            type: datetime
        responses:
          200:
            body:
              type: TransactionPage
          400:
            body:
              type: Error
          404:
            description: No card has this id.
`,
  keyPoints: [
    'Offset paging counts rows, so rows added at the top shift every later page.',
    'A cursor marks a position in the data, so new rows do not move it.',
    'nextCursor is required and nullable: always present, null on the last page.',
    'The cursor is opaque. Callers send it back unchanged and never build one.',
    'A page wrapper type leaves room for more fields later, which a bare array does not.',
  ],
  solution: `
The response changes from a bare list to \`TransactionPage\`. The list sits in \`items\`, and \`nextCursor\` tells the app whether to ask again. Declaring it as \`string | nil\` with no question mark on the name means the key is always there. The app checks one field for null and does not have to test whether a key exists.

\`limit\` keeps a maximum of 100, so one call cannot pull a year of history. \`since\` lets the app refresh only what is new after the last sync.

A cursor is usually an encoded marker such as the last \`postedAt\` and \`transactionId\`. Callers must treat it as opaque, so the server can change what it holds without breaking anyone. A cursor that cannot be decoded or has expired gets a 400 with a clear code.
`,
  followUps: [
    {
      q: 'What does cursor paging give up compared with page numbers?',
      a: 'You cannot jump to page 7 or show a total page count cheaply. Callers can only move forward from a cursor. For a scrolling feed that is fine, for a numbered table it may not be.',
    },
    {
      q: 'What would you put inside the cursor?',
      a: 'The sort keys of the last row returned, such as postedAt and transactionId, encoded as base64. The tie breaker id keeps the order stable when two rows share a timestamp.',
    },
    {
      q: 'Why is a missing nextCursor worse than a null one?',
      a: 'A missing key can mean the last page or a bug that dropped the field. A null says clearly that there are no more pages.',
    },
    {
      q: 'How would a Mule flow serve this from a database?',
      a: 'Decode the cursor in DataWeave and run a keyset query, such as rows older than that timestamp ordered newest first with a row limit. Encode the last row of the result as the next cursor.',
    },
  ],
}

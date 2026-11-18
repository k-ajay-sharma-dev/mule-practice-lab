export default {
  id: 'rm-141',
  category: 'api-design',
  title: 'Loyalty Transactions API: Ids That Look Like Numbers Are Strings',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'data-types', 'identifiers', 'pattern', 'uri-parameters', 'retail'],
  estMinutes: 15,
  description: `
Brackenfield Pharmacy runs a loyalty scheme. Its first Loyalty Transactions API declared two ids as integers, because they are made of digits. Two bugs followed:

- **Transaction ids** are 19 digits long. The web app reads JSON numbers as JavaScript numbers, which cannot hold every 19 digit value exactly, so some ids changed in the last digits and lookups failed.
- **Member numbers** are 8 digits and many start with zeros, such as \`00412789\`. As a number, \`00412789\` became \`412789\`, and the call centre could not find the member.

The rule for the new contract: a value that is a code, and never added up or compared by size, is a **string** with a pattern, even when it holds only digits.

**Requirements**
- Title \`Loyalty Transactions API\`, with JSON as the default media type.
- A type \`Transaction\` with:
  - \`transactionId\`: a required string of exactly 19 digits
  - \`memberNumber\`: a required string of exactly 8 digits
  - \`points\`: a required integer, negative when points are spent
  - \`postedAt\`: a required \`datetime\`
- A type \`Error\` with a required string \`message\`.
- \`GET /members/{memberNumber}/transactions\` returns a list of \`Transaction\` with 200 and an \`Error\` with 404. The URI parameter \`memberNumber\` is a string of exactly 8 digits.
- \`GET /transactions/{transactionId}\` returns a \`Transaction\` with 200 and an \`Error\` with 404. The URI parameter \`transactionId\` is a string of exactly 19 digits.
`,
  starter: `#%RAML 1.0
title: Loyalty Transactions API
mediaType: application/json

types:
  Transaction:
    type: object
    properties:
      transactionId: integer
      memberNumber: integer
      points: integer

/members/{memberNumber}/transactions:
  get:
    responses:
      200:
        body:
          type: Transaction[]
`,
  ramlChecks: [
    {
      label: 'The title is Loyalty Transactions API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Loyalty Transactions API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'transactionId is a required string of exactly 19 digits',
      rule: {
        type: 'prop',
        typeName: 'Transaction',
        prop: 'transactionId',
        want: { type: 'string', required: true, pattern: { accepts: ['7301256690012345678', '0000000000000000001'], rejects: ['730125669001234567', '73012566900123456789', '7301256690O12345678', 'X7301256690012345678'] } },
      },
    },
    {
      label: 'memberNumber is a required string of exactly 8 digits',
      rule: {
        type: 'prop',
        typeName: 'Transaction',
        prop: 'memberNumber',
        want: { type: 'string', required: true, pattern: { accepts: ['00412789', '99999999'], rejects: ['412789', '004127890', '0041278A', 'M00412789'] } },
      },
    },
    {
      label: 'points is a required integer and postedAt a required datetime',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Transaction', prop: 'points', want: { type: 'integer', required: true } },
          { type: 'prop', typeName: 'Transaction', prop: 'postedAt', want: { type: 'datetime', required: true } },
        ],
      },
    },
    {
      label: 'Error has a required string message',
      rule: { type: 'prop', typeName: 'Error', prop: 'message', want: { type: 'string', required: true } },
    },
    {
      label: 'The memberNumber URI parameter is a string of 8 digits',
      rule: { type: 'param', path: '/members/{}', in: 'uri', name: 'memberNumber', want: { type: 'string', pattern: { accepts: ['00412789'], rejects: ['412789', '0041278A'] } } },
    },
    {
      label: 'GET /members/{memberNumber}/transactions returns a Transaction list with 200 and an Error with 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/members/{}/transactions', method: 'get', status: '200', typeIs: 'Transaction[]' },
          { type: 'response', path: '/members/{}/transactions', method: 'get', status: '404', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'GET /transactions/{transactionId} takes a 19 digit string and returns a Transaction or an Error with 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'param', path: '/transactions/{}', in: 'uri', name: 'transactionId', want: { type: 'string', pattern: { accepts: ['7301256690012345678'], rejects: ['730125669001234567'] } } },
          { type: 'response', path: '/transactions/{}', method: 'get', status: '200', typeIs: 'Transaction' },
          { type: 'response', path: '/transactions/{}', method: 'get', status: '404', typeIs: 'Error' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Loyalty Transactions API
version: v1
baseUri: https://api.example.com/loyalty/{version}
mediaType: application/json

types:
  Transaction:
    type: object
    properties:
      transactionId:
        type: string
        pattern: ^[0-9]{19}$
        description: A code, not a number. JSON numbers lose digits at this length in many clients.
      memberNumber:
        type: string
        pattern: ^[0-9]{8}$
        description: Leading zeros are part of the number.
      points:
        type: integer
        description: Negative when points are spent.
      postedAt: datetime
    example:
      transactionId: '7301256690012345678'
      memberNumber: '00412789'
      points: 120
      postedAt: 2026-11-18T14:20:00Z
  Error:
    type: object
    properties:
      message: string

/members/{memberNumber}:
  uriParameters:
    memberNumber:
      type: string
      pattern: ^[0-9]{8}$
  /transactions:
    get:
      responses:
        200:
          body:
            type: Transaction[]
        404:
          description: No member has this number.
          body:
            type: Error
/transactions/{transactionId}:
  uriParameters:
    transactionId:
      type: string
      pattern: ^[0-9]{19}$
  get:
    responses:
      200:
        body:
          type: Transaction
      404:
        body:
          type: Error
`,
  keyPoints: [
    'A value you never do sums with is a code, so declare it as a string.',
    'A pattern such as ^[0-9]{8}$ still says the code is digits only and fixes its length.',
    'Leading zeros are lost when a code is stored as a number.',
    'Long ids can lose digits when a client reads them as JSON numbers.',
    'Quote digit-only values in RAML examples, or YAML reads them as numbers.',
    'The URI parameter needs the same type and pattern as the property.',
  ],
  solution: `
**Code or quantity.** \`points\` is a quantity: it is added up and can be negative, so it stays an integer. \`transactionId\` and \`memberNumber\` are labels. Nobody adds two member numbers, so they are strings.

**Why numbers broke.** JavaScript and many JSON libraries hold numbers as 64 bit floating point, which keeps about 15 to 17 significant digits. A 19 digit id can come back with different last digits. A string keeps every character. Leading zeros have the same problem: \`00412789\` as a number is \`412789\`.

**Patterns keep the rules.** \`^[0-9]{19}$\` says what the integer type said, digits only, and adds what it could not say, the exact length. A call with a 7 digit member number now fails with 400 at the API, before it reaches the database.

**Quotes in examples.** In YAML, \`memberNumber: 00412789\` would be read as a number. Writing \`'00412789'\` keeps it as text, so the example fits the type.

| Field | Type | Why |
|---|---|---|
| \`transactionId\` | string, 19 digits | Too long for JSON numbers in many clients |
| \`memberNumber\` | string, 8 digits | Leading zeros matter |
| \`points\` | integer | Added up and can be negative |
`,
  followUps: [
    {
      q: 'A phone number is all digits. String or number?',
      a: 'String. It can start with a zero or a plus sign, it may hold spaces, and nobody adds phone numbers together.',
    },
    {
      q: 'The database column for memberNumber is a NUMBER. What does the System API do?',
      a: 'Convert at the edge. Pad the value back to 8 digits with leading zeros when reading, and convert the string to a number when writing, so callers only ever see the string.',
    },
    {
      q: 'Is it safe to send a 19 digit id as a number if Mule reads it?',
      a: 'DataWeave keeps large numbers exactly, but every other client of the API may not. The contract should work for the weakest client, so send it as a string.',
    },
  ],
}

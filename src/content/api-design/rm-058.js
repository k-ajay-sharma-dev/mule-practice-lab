export default {
  id: 'rm-058',
  category: 'api-design',
  title: 'Core Banking System API: A Full Contract over a Legacy Core',
  level: 'EXPERT',
  tags: ['raml', 'api-design', 'system-api', 'libraries', 'fragments', 'error-mapping', 'banking'],
  estMinutes: 55,
  description: `
A bank's accounts live on a mainframe core system from the 1980s. Process APIs need a clean way in, so you will write the **System API** contract. A System API is the layer in API-led connectivity that sits in front of one backend and hides it.

The core sends fixed messages with short field names and a two digit return code:

| Core field | Meaning | In the contract |
|---|---|---|
| \`ACCT_NO\` | 12 digit account number | \`accountId\` |
| \`ACCT_TYP\` | \`CA\` or \`SV\` | \`accountType\`: \`CURRENT\` or \`SAVINGS\` |
| \`LEDG_BAL\` | ledger balance | \`balance\` |
| \`OPEN_DT\` | \`YYYYMMDD\` | \`openedOn\`, a date with no time |

| Return code | Meaning | HTTP status | \`code\` in the error |
|---|---|---|---|
| \`14\` | no such account | 404 | \`ACCOUNT_NOT_FOUND\` |
| \`51\` | not enough funds | 422 | \`INSUFFICIENT_FUNDS\` |
| \`91\` | core offline for its nightly batch | 503 with \`Retry-After\` | \`CORE_UNAVAILABLE\` |
| \`96\` | core did not answer in time | 504 | \`CORE_TIMEOUT\` |

Mapping these codes is part of the contract. Callers should never need to know what \`91\` means.

This problem has five files. Use the tabs above the editor to move between them. Fragments here stand on their own, so they need nothing from the library.

**Requirements for \`libraries/banking.raml\`**
- A type \`ErrorCode\`, a string that is one of the four codes in the table.
- A type \`Error\` with a required \`code\` of type \`ErrorCode\` and a required string \`message\`.
- A security scheme \`oauth2\` of type \`OAuth 2.0\`, with \`accessTokenUri\` \`https://auth.example.com/token\` and the grant \`client_credentials\`. Its \`describedBy\` has a 401 response.
- A trait \`traced\` with a required string header \`X-Correlation-Id\`.
- A trait \`coreErrors\` with two responses. 503 has a \`Retry-After\` header and an \`Error\` body. 504 has an \`Error\` body.
- A resource type \`coreRecord\` with a parameter \`<<recordType>>\`. Its \`get\` uses \`coreErrors\` and \`traced\`, returns \`<<recordType>>\` with status 200, and returns 404 with an \`Error\` body.

**Requirements for \`types/account.raml\`**
- A DataType fragment with required properties \`accountId\` (string), \`accountType\` (\`CURRENT\` or \`SAVINGS\`), \`balance\` (number) and \`openedOn\` (a date with no time).
- No core field names appear in it.
- Its \`example\` includes \`examples/account.json\`.

**Requirements for \`types/transaction.raml\`**
- A DataType fragment with a required string \`transactionId\`, a required number \`amount\`, a required \`direction\` (\`CREDIT\` or \`DEBIT\`) and a required \`postedOn\` (a date with no time).

**Requirements for \`examples/account.json\`**
- An example that fits the account type.

**Requirements for \`api.raml\`**
- Title \`Core Banking System API\`, version \`v1\`, with JSON as the default media type.
- Bring in the library with the prefix \`bank\`.
- Declare \`Account\` and \`Transaction\` with \`!include\`.
- A type \`HoldRequest\` with a required number \`amount\` of at least 0.01 and a required string \`reason\`. A **hold** reserves money in an account.
- All methods are secured by \`bank.oauth2\`.
- \`/accounts/{accountId}\` uses \`bank.coreRecord\` with \`Account\`, and offers \`get\`. The responses come from the resource type, so do not write them here.
- Its URI parameter \`accountId\` has a pattern for exactly 12 digits.
- \`GET /accounts/{accountId}/transactions\` also uses \`bank.coreRecord\`, with \`Transaction[]\` as the record type. It has a required query parameter \`from\` and an optional query parameter \`to\`, both dates with no time.
- \`POST /accounts/{accountId}/holds\` uses \`bank.coreErrors\` and \`bank.traced\`, and takes a \`HoldRequest\`.
- It returns 201 with a \`Location\` header, 404 with a \`bank.Error\`, and 422 with a \`bank.Error\`.
`,
  starter: `#%RAML 1.0
title: Core Banking System API
version: v1
mediaType: application/json

uses:

types:

/accounts:
`,
  files: {
    'libraries/banking.raml': `#%RAML 1.0 Library
usage: Shared parts of the core banking contract.

types:

securitySchemes:

traits:

resourceTypes:
`,
    'types/account.raml': `#%RAML 1.0 DataType
`,
    'types/transaction.raml': `#%RAML 1.0 DataType
`,
    'examples/account.json': `{
}
`,
  },
  ramlChecks: [
    { label: 'The API brings in libraries/banking.raml with the prefix bank', rule: { type: 'library', prefix: 'bank', file: 'libraries/banking.raml' } },
    {
      label: 'ErrorCode allows the four mapped codes only',
      rule: { type: 'typeDecl', name: 'bank.ErrorCode', want: { enum: { exactly: ['ACCOUNT_NOT_FOUND', 'INSUFFICIENT_FUNDS', 'CORE_UNAVAILABLE', 'CORE_TIMEOUT'] } } },
    },
    {
      label: 'Error has a required code of type ErrorCode and a message',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'bank.Error', prop: 'code', want: { type: 'bank.ErrorCode', required: true } },
          { type: 'prop', typeName: 'bank.Error', prop: 'message', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'oauth2 is an OAuth 2.0 scheme in the library with a 401',
      rule: { type: 'scheme', name: 'bank.oauth2', schemeType: 'OAuth 2.0', values: {"settings.accessTokenUri":"https://auth.example.com/token","settings.authorizationGrants":["client_credentials"]}, has: ['settings.accessTokenUri', 'settings.authorizationGrants', 'describedBy.responses.401'] },
    },
    { label: 'The traced trait holds X-Correlation-Id', rule: { type: 'trait', name: 'bank.traced', has: 'headers.X-Correlation-Id' } },
    { label: 'The coreErrors trait holds 503 with Retry-After', rule: { type: 'trait', name: 'bank.coreErrors', has: 'responses.503.headers.Retry-After' } },
    { label: 'The coreErrors trait holds 504', rule: { type: 'trait', name: 'bank.coreErrors', has: 'responses.504' } },
    { label: 'The coreRecord resource type offers get', rule: { type: 'resourceType', name: 'bank.coreRecord', has: 'get' } },
    {
      label: 'Account comes from types/account.raml with its required properties',
      rule: {
        type: 'all',
        rules: [
          { type: 'included', file: 'types/account.raml' },
          { type: 'prop', typeName: 'Account', prop: 'accountId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Account', prop: 'balance', want: { type: 'number', required: true } },
        ],
      },
    },
    { label: 'accountType uses business values, not CA and SV', rule: { type: 'prop', typeName: 'Account', prop: 'accountType', want: { required: true, enum: { exactly: ['CURRENT', 'SAVINGS'] } } } },
    { label: 'openedOn is a date with no time', rule: { type: 'prop', typeName: 'Account', prop: 'openedOn', want: { type: 'date-only', required: true } } },
    {
      label: 'No core field names appear in Account',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'Account' },
          { type: 'noProp', typeName: 'Account', prop: 'ACCT_NO' },
          { type: 'noProp', typeName: 'Account', prop: 'ACCT_TYP' },
          { type: 'noProp', typeName: 'Account', prop: 'LEDG_BAL' },
          { type: 'noProp', typeName: 'Account', prop: 'OPEN_DT' },
        ],
      },
    },
    {
      label: 'Account has its example from examples/account.json',
      rule: {
        type: 'all',
        rules: [
          { type: 'included', file: 'examples/account.json' },
          { type: 'typeDecl', name: 'Account', want: { example: { set: true } } },
        ],
      },
    },
    {
      label: 'Transaction comes from types/transaction.raml with its required properties',
      rule: {
        type: 'all',
        rules: [
          { type: 'included', file: 'types/transaction.raml' },
          { type: 'prop', typeName: 'Transaction', prop: 'transactionId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Transaction', prop: 'amount', want: { type: 'number', required: true } },
          { type: 'prop', typeName: 'Transaction', prop: 'direction', want: { required: true, enum: { exactly: ['CREDIT', 'DEBIT'] } } },
          { type: 'prop', typeName: 'Transaction', prop: 'postedOn', want: { type: 'date-only', required: true } },
        ],
      },
    },
    { label: 'HoldRequest has a required amount of at least 0.01 and a reason', rule: { type: 'all', rules: [
      { type: 'prop', typeName: 'HoldRequest', prop: 'amount', want: { type: 'number', required: true, minimum: 0.01 } },
      { type: 'prop', typeName: 'HoldRequest', prop: 'reason', want: { type: 'string', required: true } },
    ] } },
    {
      label: 'All three methods are secured by bank.oauth2',
      rule: {
        type: 'all',
        rules: [
          { type: 'secured', path: '/accounts/{}', method: 'get', scheme: 'bank.oauth2' },
          { type: 'secured', path: '/accounts/{}/transactions', method: 'get', scheme: 'bank.oauth2' },
          { type: 'secured', path: '/accounts/{}/holds', method: 'post', scheme: 'bank.oauth2' },
        ],
      },
    },
    {
      label: '/accounts/{accountId} gets its responses from bank.coreRecord',
      rule: { type: 'typed', path: '/accounts/{}', resourceType: 'bank.coreRecord', provides: ['get.responses.200', 'get.responses.404'] },
    },
    {
      label: 'GET /accounts/{accountId} returns an Account, or 404 with a bank.Error',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/accounts/{}', method: 'get', status: '200', typeIs: 'Account' },
          { type: 'response', path: '/accounts/{}', method: 'get', status: '404', typeIs: 'bank.Error' },
        ],
      },
    },
    {
      label: 'GET /accounts/{accountId} gets the 503 and 504 mapping and the correlation id',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/accounts/{}', method: 'get', trait: 'bank.coreErrors' },
          { type: 'applied', path: '/accounts/{}', method: 'get', trait: 'bank.traced' },
          { type: 'response', path: '/accounts/{}', method: 'get', status: '503', typeIs: 'bank.Error', header: 'Retry-After' },
          { type: 'response', path: '/accounts/{}', method: 'get', status: '504', typeIs: 'bank.Error' },
          { type: 'param', path: '/accounts/{}', method: 'get', in: 'header', name: 'X-Correlation-Id', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'accountId has a pattern for exactly 12 digits',
      rule: { type: 'param', path: '/accounts/{}', in: 'uri', name: 'accountId', want: { pattern: { accepts: ['000123456789'], rejects: ['12345678901', '1234567890123', 'ABC123456789'] } } },
    },
    {
      label: 'The transactions resource uses bank.coreRecord with Transaction[]',
      rule: {
        type: 'all',
        rules: [
          { type: 'typed', path: '/accounts/{}/transactions', resourceType: 'bank.coreRecord', provides: ['get.responses.200'] },
          { type: 'response', path: '/accounts/{}/transactions', method: 'get', status: '200', typeIs: 'Transaction[]' },
        ],
      },
    },
    {
      label: 'from is a required date, and to is an optional date',
      rule: {
        type: 'all',
        rules: [
          { type: 'param', path: '/accounts/{}/transactions', method: 'get', in: 'query', name: 'from', want: { type: 'date-only', required: true } },
          { type: 'param', path: '/accounts/{}/transactions', method: 'get', in: 'query', name: 'to', want: { type: 'date-only', required: false } },
        ],
      },
    },
    {
      label: 'POST /accounts/{accountId}/holds uses both traits and takes a HoldRequest',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/accounts/{}/holds', method: 'post', trait: 'bank.coreErrors' },
          { type: 'applied', path: '/accounts/{}/holds', method: 'post', trait: 'bank.traced' },
          { type: 'body', path: '/accounts/{}/holds', method: 'post', typeIs: 'HoldRequest' },
        ],
      },
    },
    { label: 'POST /accounts/{accountId}/holds returns 201 with a Location header', rule: { type: 'response', path: '/accounts/{}/holds', method: 'post', status: '201', header: 'Location' } },
    {
      label: 'Return code 14 maps to 404 on the hold',
      rule: { type: 'response', path: '/accounts/{}/holds', method: 'post', status: '404', typeIs: 'bank.Error' },
    },
    {
      label: 'Return code 51 maps to 422 on the hold',
      rule: { type: 'response', path: '/accounts/{}/holds', method: 'post', status: '422', typeIs: 'bank.Error' },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Core Banking System API
version: v1
mediaType: application/json

uses:
  bank: libraries/banking.raml

securedBy: [ bank.oauth2 ]

types:
  Account: !include types/account.raml
  Transaction: !include types/transaction.raml
  HoldRequest:
    type: object
    properties:
      amount:
        type: number
        minimum: 0.01
      reason: string

/accounts:
  /{accountId}:
    type: { bank.coreRecord: { recordType: Account } }
    uriParameters:
      accountId:
        type: string
        pattern: '^[0-9]{12}$'
    get:
    /transactions:
      type: { bank.coreRecord: { recordType: 'Transaction[]' } }
      get:
        queryParameters:
          from:
            type: date-only
          to?:
            type: date-only
    /holds:
      post:
        is: [ bank.coreErrors, bank.traced ]
        body:
          type: HoldRequest
        responses:
          201:
            headers:
              Location:
                type: string
          404:
            body:
              type: bank.Error
          422:
            body:
              type: bank.Error
`,
  referenceFiles: {
    'libraries/banking.raml': `#%RAML 1.0 Library
usage: Shared parts of the core banking contract.

types:
  ErrorCode:
    type: string
    enum: [ ACCOUNT_NOT_FOUND, INSUFFICIENT_FUNDS, CORE_UNAVAILABLE, CORE_TIMEOUT ]
  Error:
    type: object
    properties:
      code: ErrorCode
      message: string

securitySchemes:
  oauth2:
    type: OAuth 2.0
    describedBy:
      responses:
        401:
          description: The token is missing, wrong or expired.
    settings:
      accessTokenUri: https://auth.example.com/token
      authorizationGrants: [ client_credentials ]

traits:
  traced:
    headers:
      X-Correlation-Id:
        type: string
  coreErrors:
    responses:
      503:
        headers:
          Retry-After:
            type: integer
        body:
          type: Error
      504:
        body:
          type: Error

resourceTypes:
  coreRecord:
    get:
      is: [ coreErrors, traced ]
      responses:
        200:
          body:
            type: <<recordType>>
        404:
          body:
            type: Error
`,
    'types/account.raml': `#%RAML 1.0 DataType
type: object
properties:
  accountId: string
  accountType:
    type: string
    enum: [ CURRENT, SAVINGS ]
  balance: number
  openedOn: date-only
example: !include ../examples/account.json
`,
    'types/transaction.raml': `#%RAML 1.0 DataType
type: object
properties:
  transactionId: string
  amount: number
  direction:
    type: string
    enum: [ CREDIT, DEBIT ]
  postedOn: date-only
`,
    'examples/account.json': `{
  "accountId": "000123456789",
  "accountType": "CURRENT",
  "balance": 1520.75,
  "openedOn": "1998-04-17"
}
`,
  },
  keyPoints: [
    'A System API speaks business language, so core field names and codes stop at this layer.',
    'Error mapping belongs in the contract, because callers plan their retries from it.',
    '503 with Retry-After says when to try again. 504 says the outcome is unknown.',
    'A trait holds what every core call shares, so a new method cannot forget the 503.',
    'A resource type keeps the 404 and the record shape in one place across resources.',
  ],
  solution: `
The library holds what is true of every call to the core: how to log in, how errors look, and what can go wrong. \`coreRecord\` puts those together, so \`/accounts/{accountId}\` needs only one line to get its 200, 404, 503 and 504.

The fragments hold the shapes. The tables become decisions here: \`CA\` becomes \`CURRENT\`, \`YYYYMMDD\` becomes \`date-only\`, and no field name from the core survives.

The statuses are chosen for what the caller should do next. A 422 means the request was well formed but the account cannot do it, so retrying is pointless. A 503 is planned downtime, so \`Retry-After\` says when to come back. A 504 is the risky one: on a hold, the core may have applied it, so a caller must check before it tries again.

\`Transaction[]\` is quoted in the \`type\` line because it sits inside curly brackets, where YAML would read the square brackets as its own syntax.
`,
  followUps: [
    {
      q: 'Why does a 504 on a write need more care than a 503?',
      a: 'A 503 means the core never took the request. After a 504 nobody knows if the hold was applied, so a blind retry could reserve the money twice. An idempotency key makes the retry safe.',
    },
    {
      q: 'Where does the mapping from return codes to statuses live in the Mule application?',
      a: 'In the error handling of the System API. A DataWeave lookup turns the return code into a status and error code, and a shared error handler sets the response.',
    },
    {
      q: 'How would you protect the mainframe from too many calls?',
      a: 'Apply a rate limiting or spike control policy on this API, and cache reads that can be slightly old. MIPS on a mainframe often cost real money, so each call has a price.',
    },
  ],
}

export default {
  id: 'rm-112',
  category: 'api-design',
  title: 'Payments API: Fix a Contract That Failed a Penetration Test',
  level: 'EXPERT',
  tags: ['raml', 'api-design', 'debugging', 'security', 'oauth2', 'scopes', 'banking'],
  estMinutes: 45,
  description: `
A bank lets licensed third-party apps start payments from a customer's account, after the customer agrees on the bank's own login page. About 400,000 payments a month go through this API, and the regulator expects an external penetration test before each major release.

The test report for v1 lists these findings against the contract:
1. The API can be reached over plain HTTP.
2. The token endpoint is on plain HTTP.
3. Apps get tokens with the password grant, so they see the customer's bank password.
4. Every method can be called with no token at all.
5. An app that may only read payments can create them.
6. Payment responses show the full debtor account number.
7. Any app can delete a payment record, which destroys the audit trail.

The release is blocked until each finding is fixed in the contract. The file also has a parser error, and the team made the amount optional by mistake.

**Requirements**
- HTTPS is the only protocol.
- The scheme \`oauth2\` is \`OAuth 2.0\` with \`accessTokenUri\` \`https://auth.example.com/token\` and \`authorizationUri\` \`https://auth.example.com/authorize\`. Its only grant is \`authorization_code\`, so the customer signs in at the bank and the app never sees the password.
- \`oauth2\` describes an \`Authorization\` header and a 401 response.
- Every method needs a token, except \`GET /health\`, which a load balancer calls with no token.
- \`POST /payments\` needs the scope \`payments:write\` and no other. \`GET /payments/{paymentId}\` needs \`payments:read\` and no other.
- \`POST /payments\` takes a \`PaymentRequest\` with a required \`amount\` of type \`Money\`, and returns a \`Payment\` with status 201 and a \`Location\` header. It returns an \`Error\` with status 403 when the token lacks the scope.
- \`Payment\` has no \`debtorAccountNumber\`. It has a required \`debtorAccountMasked\`: four stars and then the last four digits, such as \`****4821\`.
- There is no \`DELETE\` on \`/payments/{paymentId}\`.
`,
  starter: `#%RAML 1.0
title: Payments API
version: v1
baseUri: https://api.example.com/payments/{version}
protocols: [ HTTP, HTTPS ]
mediaType: application/json

types:
  Money:
    type: object
    properties:
      amount:
        type: number
        minimum: 0.01
      currency:
        type: string
        pattern: ^[A-Z]{3}$
  PaymentRequest:
    type: object
    properties:
      debtorAccountId: string
      creditorIban:
        type: string
        pattern: ^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$
      amount?: Money
      reference?:
        type: string
        maxLength: 35
  Payment:
    type: PaymentRequest
    properties:
      paymentId: string
      status:
        type: string
        enum: [ PENDING, ACCEPTED, REJECTED ]
      debtorAccountNumber: string
    example:
      paymentId: PM-7730192
      debtorAccountId: ACC-55102
      debtorAccountNumber: '20418833104821'
      creditorIban: GB33BUKB20201555555555
      amount:
        amount: 120.00
        currency: GBP
      reference: Invoice 2291
      status: PENDING
  Error:
    type: object
    properties:
      code: string
      message: string

securitySchemes:
  oauth2:
    type: OAuth 2.0
    settings:
      accessTokenUri: http://auth.example.com/token
      authorizationGrants: [ password ]
      scopes: [ payments:read, payments:write ]

securedBy: [ oauth2, null ]

/health:
  get:
    responses:
      200:
        description: The API is up.
/payments:
  post:
    securedBy: [ oauth2: { scopes: [ payments:read ] } ]
    body:
      type: PaymentRequest
    responses:
      201:
        headers:
          Location:
            type: string
        body:
          type: Payment
  /{paymentId}:
    get:
      securedBy: [ oAuth2: { scopes: [ payments:read ] } ]
      responses:
        200:
          body:
            type: Payment
        404:
          body:
            type: Error
    delete:
      responses:
        204:
          description: The payment record is removed.
`,
  ramlChecks: [
    { label: 'HTTPS is the only protocol', rule: { type: 'root', key: 'protocols', want: { exactly: ['HTTPS'] } } },
    {
      label: 'oauth2 uses HTTPS endpoints and only the authorization_code grant',
      rule: {
        type: 'scheme',
        name: 'oauth2',
        schemeType: 'OAuth 2.0',
        values: {
          'settings.accessTokenUri': 'https://auth.example.com/token',
          'settings.authorizationUri': 'https://auth.example.com/authorize',
          'settings.authorizationGrants': { oneOf: ['authorization_code'], not: 'password' },
        },
      },
    },
    { label: 'oauth2 describes the Authorization header and a 401', rule: { type: 'scheme', name: 'oauth2', has: ['describedBy.headers.Authorization', 'describedBy.responses.401'] } },
    {
      label: 'POST /payments needs a token with payments:write and no other scope',
      rule: { type: 'secured', path: '/payments', method: 'post', scheme: 'oauth2', scopes: ['payments:write'], onlyScopes: true, required: true },
    },
    {
      label: 'GET /payments/{paymentId} needs a token with payments:read and no other scope',
      rule: { type: 'secured', path: '/payments/{}', method: 'get', scheme: 'oauth2', scopes: ['payments:read'], onlyScopes: true, required: true },
    },
    { label: 'GET /health works with no token', rule: { type: 'public', path: '/health', method: 'get' } },
    { label: 'PaymentRequest has a required amount of type Money', rule: { type: 'prop', typeName: 'PaymentRequest', prop: 'amount', want: { type: 'Money', required: true } } },
    {
      label: 'POST /payments returns a Payment with 201 and Location, and an Error with 403',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/payments', method: 'post', typeIs: 'PaymentRequest' },
          { type: 'response', path: '/payments', method: 'post', status: '201', typeIs: 'Payment', header: 'Location' },
          { type: 'response', path: '/payments', method: 'post', status: '403', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'Payment shows only a masked account number',
      rule: {
        type: 'all',
        rules: [
          { type: 'noProp', typeName: 'Payment', prop: 'debtorAccountNumber' },
          { type: 'prop', typeName: 'Payment', prop: 'debtorAccountMasked', want: { type: 'string', required: true, pattern: { accepts: ['****4821', '****0000'] , rejects: ['20418833104821', '4821', '****482', '***4821', '****48211'] } } },
        ],
      },
    },
    { label: 'Payments cannot be deleted', rule: { type: 'all', rules: [{ type: 'resource', path: '/payments/{}' }, { type: 'noMethod', path: '/payments/{}', method: 'delete' }] } },
  ],
  referenceRaml: `#%RAML 1.0
title: Payments API
version: v1
baseUri: https://api.example.com/payments/{version}
protocols: [ HTTPS ]
mediaType: application/json

types:
  Money:
    type: object
    properties:
      amount:
        type: number
        minimum: 0.01
      currency:
        type: string
        pattern: ^[A-Z]{3}$
  PaymentRequest:
    type: object
    properties:
      debtorAccountId: string
      creditorIban:
        type: string
        pattern: ^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$
      amount: Money
      reference?:
        type: string
        maxLength: 35
  Payment:
    type: PaymentRequest
    properties:
      paymentId: string
      status:
        type: string
        enum: [ PENDING, ACCEPTED, REJECTED ]
      debtorAccountMasked:
        type: string
        pattern: ^\\*{4}[0-9]{4}$
    example:
      paymentId: PM-7730192
      debtorAccountId: ACC-55102
      debtorAccountMasked: '****4821'
      creditorIban: GB33BUKB20201555555555
      amount:
        amount: 120.00
        currency: GBP
      reference: Invoice 2291
      status: PENDING
  Error:
    type: object
    properties:
      code: string
      message: string

securitySchemes:
  oauth2:
    type: OAuth 2.0
    describedBy:
      headers:
        Authorization:
          type: string
          description: Bearer token issued after the customer agreed.
      responses:
        401:
          description: The token is missing, expired or not valid.
    settings:
      accessTokenUri: https://auth.example.com/token
      authorizationUri: https://auth.example.com/authorize
      authorizationGrants: [ authorization_code ]
      scopes: [ payments:read, payments:write ]

securedBy: [ oauth2 ]

/health:
  get:
    securedBy: [ null ]
    responses:
      200:
        description: The API is up.
/payments:
  post:
    securedBy: [ oauth2: { scopes: [ payments:write ] } ]
    body:
      type: PaymentRequest
    responses:
      201:
        headers:
          Location:
            type: string
        body:
          type: Payment
      403:
        description: The token does not carry payments:write.
        body:
          type: Error
  /{paymentId}:
    get:
      securedBy: [ oauth2: { scopes: [ payments:read ] } ]
      responses:
        200:
          body:
            type: Payment
        404:
          body:
            type: Error
`,
  keyPoints: [
    'securedBy: [ oauth2, null ] means a token is optional. Use null only on the methods that must be public.',
    'The password grant hands the customer\'s password to the app. authorization_code keeps the login on the bank\'s page.',
    'A scope per action limits the damage of a leaked token. Writes and reads get different scopes.',
    'Mask account numbers in responses. A contract that declares the full number invites every caller to store it.',
    'Leaving a method out of the contract is a control too. A payment record is evidence and is never deleted through the API.',
  ],
  solution: `
Each finding maps to one change.
1. \`protocols: [ HTTPS ]\`. Bank data never travels in clear text.
2. \`accessTokenUri\` uses \`https\`. Tokens sent over HTTP can be read on the network.
3. The grant becomes \`authorization_code\`, with an \`authorizationUri\`. The customer signs in at the bank and the app receives a token, never the password.
4. The top \`securedBy\` drops \`null\`, so every method needs a token. \`/health\` alone gets \`securedBy: [ null ]\`, because the load balancer has no token. The scheme now describes the \`Authorization\` header and a 401, so callers know what to send and what failure looks like.
5. \`POST /payments\` needs \`payments:write\`, and a 403 tells an app with only \`payments:read\` why it was refused.
6. \`debtorAccountNumber\` is gone. \`debtorAccountMasked\` shows the last four digits, which is enough for the customer to recognise the account.
7. \`DELETE\` is removed. A payment is cancelled or reversed by another payment, and the record stays.

Two more fixes were not on the report. \`oAuth2\` was not a declared scheme, since names are case sensitive. \`amount?\` let a payment arrive with no amount.
`,
  followUps: [
    {
      q: 'Why is the password grant wrong for a third-party app?',
      a: 'The app collects the customer password and could store or misuse it. It also trains customers to type bank passwords into other apps. OAuth 2.1 drops the password grant for these reasons.',
    },
    {
      q: 'Where are the scopes enforced at runtime?',
      a: 'In API Manager, an OAuth 2.0 token enforcement policy validates the token and can require scopes. The contract documents the scopes, and the policy enforces them on every call.',
    },
    {
      q: 'Why should a third-party mobile app also use PKCE?',
      a: 'A mobile app cannot keep a client secret, so a stolen authorization code could be swapped for a token. PKCE binds the code to a secret the app made for that one login.',
    },
    {
      q: 'The health endpoint is public. What must it never return?',
      a: 'Versions, host names, database status details or stack traces. Return a plain up or down so an attacker learns nothing about the platform.',
    },
  ],
}

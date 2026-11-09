export default {
  id: 'rm-093',
  category: 'api-design',
  title: 'Open Banking API: Grants, Scopes, SCA Annotations and Fragments in One Contract',
  level: 'EXPERT',
  tags: ['raml', 'api-design', 'security', 'oauth2', 'scopes', 'annotations', 'fragments', 'idempotency', 'banking'],
  estMinutes: 50,
  description: `
A UK bank must expose account and payment APIs to licensed third party providers (TPPs) under Open Banking. About 400 TPPs call it, and the regulator expects 99.5% availability.

There are two kinds of call. Account and payment calls act for a customer, who approves access in the bank's app, so the TPP gets a token through the **authorization code** grant. A funds check acts for the TPP alone, so it uses **client credentials**. One OAuth 2.0 scheme lists both grants, and the scopes decide what each token may do: \`accounts\`, \`payments\` and \`fundsconfirmations\`.

Strong customer authentication (SCA) rules differ per method. A payment needs SCA on every call. Account data needs it again only after a period, and a funds check never needs it. The compliance team wants this written into the contract as an annotation on each method.

A TPP that times out will retry a payment. The \`x-idempotency-key\` header lets the bank spot the retry and return the first result, so a customer is never paid out twice.

This problem has three files. Use the tabs above the editor to move between them.

**Requirements**
- \`api.raml\` has the title \`Open Banking API\`, with JSON as the default media type, and \`protocols\` allows HTTPS only.
- \`security/oauth2.raml\` is a SecurityScheme fragment of type \`OAuth 2.0\`, brought in as \`oauth2\`. Its \`settings\` give \`authorizationUri\` \`https://auth.example.com/authorize\`, \`accessTokenUri\` \`https://auth.example.com/token\`, the grants \`authorization_code\` and \`client_credentials\`, and exactly the scopes \`accounts\`, \`payments\` and \`fundsconfirmations\`. Its \`describedBy\` declares the \`Authorization\` header, a 401 and a 403.
- \`traits/idempotent.raml\` is a Trait fragment, brought in as \`idempotent\`. It adds a required string header \`x-idempotency-key\` of at most 40 characters.
- An annotation type \`sca\`: a string that is one of \`PER_CALL\`, \`PERIODIC\`, \`NONE\`, allowed only on \`Method\`.
- A type \`DomesticPayment\` with a required \`creditorSortCode\` of exactly six digits, a required \`creditorAccountNumber\` of exactly eight digits, a required number \`amount\` of at least 0.01 and a required string \`reference\` of at most 18 characters.
- A type \`PaymentStatus\` with a required string \`paymentId\` and a required string \`status\` that is one of \`PENDING\`, \`ACCEPTED\`, \`REJECTED\`.
- \`GET /accounts\` and \`GET /accounts/{accountId}/balances\` return 200. Each needs \`accounts\` only and is marked \`(sca): PERIODIC\`.
- \`POST /domestic-payments\` uses \`idempotent\`, takes a \`DomesticPayment\`, and returns a \`PaymentStatus\` with status 201 and a \`Location\` header, or 400. It needs \`payments\` only and is marked \`(sca): PER_CALL\`.
- \`GET /domestic-payments/{paymentId}\` returns a \`PaymentStatus\` with status 200, or 404. It needs \`payments\` only.
- \`POST /funds-confirmations\` returns 200. It needs \`fundsconfirmations\` only and is marked \`(sca): NONE\`.
- \`GET /health\` returns 200 with no token.
`,
  starter: `#%RAML 1.0
title: Open Banking API
mediaType: application/json

securitySchemes:

annotationTypes:

traits:

types:

/accounts:

/domestic-payments:

/funds-confirmations:

/health:
`,
  files: {
    'security/oauth2.raml': `#%RAML 1.0 SecurityScheme
`,
    'traits/idempotent.raml': `#%RAML 1.0 Trait
`,
  },
  ramlChecks: [
    { label: 'protocols allows HTTPS only', rule: { type: 'root', key: 'protocols', want: { exactly: ['HTTPS'] } } },
    {
      label: 'oauth2 comes from security/oauth2.raml and is OAuth 2.0 with both URLs',
      rule: {
        type: 'all',
        rules: [
          { type: 'included', file: 'security/oauth2.raml' },
          { type: 'scheme', name: 'oauth2', schemeType: 'OAuth 2.0', values: { 'settings.authorizationUri': 'https://auth.example.com/authorize', 'settings.accessTokenUri': 'https://auth.example.com/token' } },
        ],
      },
    },
    {
      label: 'oauth2 allows the authorization_code and client_credentials grants',
      rule: { type: 'scheme', name: 'oauth2', values: { 'settings.authorizationGrants': { exactly: ['authorization_code', 'client_credentials'] } } },
    },
    { label: 'oauth2 lists exactly accounts, payments and fundsconfirmations', rule: { type: 'scheme', name: 'oauth2', values: { 'settings.scopes': { exactly: ['accounts', 'payments', 'fundsconfirmations'] } } } },
    { label: 'oauth2 describes the Authorization header, a 401 and a 403', rule: { type: 'scheme', name: 'oauth2', has: ['describedBy.headers.Authorization', 'describedBy.responses.401', 'describedBy.responses.403'] } },
    {
      label: 'sca allows only PER_CALL, PERIODIC and NONE, on Method only',
      rule: {
        type: 'all',
        rules: [
          { type: 'annotationType', name: 'sca', want: { type: 'string', enum: { exactly: ['PER_CALL', 'PERIODIC', 'NONE'] } } },
          { type: 'any', rules: [{ type: 'annotationType', name: 'sca', want: { allowedTargets: { exactly: ['Method'] } } }, { type: 'annotationType', name: 'sca', want: { allowedTargets: { is: 'Method' } } }] },
        ],
      },
    },
    {
      label: 'idempotent comes from traits/idempotent.raml and gives POST /domestic-payments a required x-idempotency-key of at most 40',
      rule: {
        type: 'all',
        rules: [
          { type: 'included', file: 'traits/idempotent.raml' },
          { type: 'applied', path: '/domestic-payments', method: 'post', trait: 'idempotent' },
          { type: 'param', path: '/domestic-payments', method: 'post', in: 'header', name: 'x-idempotency-key', want: { type: 'string', required: true, maxLength: 40 } },
        ],
      },
    },
    {
      label: 'DomesticPayment checks the sort code, account number, amount and reference',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'DomesticPayment', prop: 'creditorSortCode', want: { required: true, pattern: { accepts: ['601613'], rejects: ['60-16-13', '60161', '6016133', 'ABCDEF'] } } },
          { type: 'prop', typeName: 'DomesticPayment', prop: 'creditorAccountNumber', want: { required: true, pattern: { accepts: ['31926819'], rejects: ['3192681', '319268190', '3192681X'] } } },
          { type: 'prop', typeName: 'DomesticPayment', prop: 'amount', want: { type: 'number', required: true, minimum: 0.01 } },
          { type: 'prop', typeName: 'DomesticPayment', prop: 'reference', want: { type: 'string', required: true, maxLength: 18 } },
        ],
      },
    },
    {
      label: 'GET /accounts and GET /accounts/{accountId}/balances need accounts only and are marked PERIODIC',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/accounts', method: 'get', status: '200' },
          { type: 'response', path: '/accounts/{}/balances', method: 'get', status: '200' },
          { type: 'secured', path: '/accounts', method: 'get', scheme: 'oauth2', scopes: ['accounts'], onlyScopes: true, required: true },
          { type: 'secured', path: '/accounts/{}/balances', method: 'get', scheme: 'oauth2', scopes: ['accounts'], onlyScopes: true, required: true },
          { type: 'annotated', name: 'sca', path: '/accounts', method: 'get', value: { is: 'PERIODIC' } },
          { type: 'annotated', name: 'sca', path: '/accounts/{}/balances', method: 'get', value: { is: 'PERIODIC' } },
        ],
      },
    },
    {
      label: 'POST /domestic-payments returns a PaymentStatus with Location, or 400',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/domestic-payments', method: 'post', typeIs: 'DomesticPayment' },
          { type: 'response', path: '/domestic-payments', method: 'post', status: '201', typeIs: 'PaymentStatus', header: 'Location' },
          { type: 'response', path: '/domestic-payments', method: 'post', status: '400' },
        ],
      },
    },
    {
      label: 'Both payment methods need payments only, and the POST is marked PER_CALL',
      rule: {
        type: 'all',
        rules: [
          { type: 'secured', path: '/domestic-payments', method: 'post', scheme: 'oauth2', scopes: ['payments'], onlyScopes: true, required: true },
          { type: 'secured', path: '/domestic-payments/{}', method: 'get', scheme: 'oauth2', scopes: ['payments'], onlyScopes: true, required: true },
          { type: 'annotated', name: 'sca', path: '/domestic-payments', method: 'post', value: { is: 'PER_CALL' } },
        ],
      },
    },
    {
      label: 'GET /domestic-payments/{paymentId} returns a PaymentStatus or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/domestic-payments/{}', method: 'get', status: '200', typeIs: 'PaymentStatus' },
          { type: 'response', path: '/domestic-payments/{}', method: 'get', status: '404' },
        ],
      },
    },
    {
      label: 'POST /funds-confirmations needs fundsconfirmations only and is marked NONE',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/funds-confirmations', method: 'post', status: '200' },
          { type: 'secured', path: '/funds-confirmations', method: 'post', scheme: 'oauth2', scopes: ['fundsconfirmations'], onlyScopes: true, required: true },
          { type: 'annotated', name: 'sca', path: '/funds-confirmations', method: 'post', value: { is: 'NONE' } },
        ],
      },
    },
    {
      label: 'GET /health returns 200 with no token',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/health', method: 'get', status: '200' },
          { type: 'public', path: '/health', method: 'get' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Open Banking API
version: v1
protocols: [ HTTPS ]
mediaType: application/json

securitySchemes:
  oauth2: !include security/oauth2.raml

annotationTypes:
  sca:
    type: string
    enum: [ PER_CALL, PERIODIC, NONE ]
    allowedTargets: [ Method ]

traits:
  idempotent: !include traits/idempotent.raml

securedBy: [ oauth2 ]

types:
  DomesticPayment:
    type: object
    properties:
      creditorSortCode:
        type: string
        pattern: ^[0-9]{6}$
      creditorAccountNumber:
        type: string
        pattern: ^[0-9]{8}$
      amount:
        type: number
        minimum: 0.01
      reference:
        type: string
        maxLength: 18
  PaymentStatus:
    type: object
    properties:
      paymentId: string
      status:
        type: string
        enum: [ PENDING, ACCEPTED, REJECTED ]

/accounts:
  get:
    (sca): PERIODIC
    securedBy: [ oauth2: { scopes: [ accounts ] } ]
    responses:
      200:
        description: The accounts the customer shared with this TPP.
  /{accountId}/balances:
    get:
      (sca): PERIODIC
      securedBy: [ oauth2: { scopes: [ accounts ] } ]
      responses:
        200:
          description: The booked and available balances.
        404:
          description: The customer did not share this account.

/domestic-payments:
  post:
    (sca): PER_CALL
    is: [ idempotent ]
    securedBy: [ oauth2: { scopes: [ payments ] } ]
    body:
      type: DomesticPayment
    responses:
      201:
        headers:
          Location:
            type: string
        body:
          type: PaymentStatus
      400:
        description: The payment details are not valid.
  /{paymentId}:
    get:
      securedBy: [ oauth2: { scopes: [ payments ] } ]
      responses:
        200:
          body:
            type: PaymentStatus
        404:
          description: No payment has this id for this TPP.

/funds-confirmations:
  post:
    (sca): NONE
    securedBy: [ oauth2: { scopes: [ fundsconfirmations ] } ]
    responses:
      200:
        description: Whether the funds are available, as true or false.

/health:
  get:
    securedBy: [ null ]
    responses:
      200:
        description: The API is up.
`,
  referenceFiles: {
    'security/oauth2.raml': `#%RAML 1.0 SecurityScheme
type: OAuth 2.0
description: |
  Account and payment calls act for a customer, who approves access in the bank app (authorization code).
  Funds checks act for the TPP alone (client credentials).
describedBy:
  headers:
    Authorization:
      type: string
      description: Bearer followed by the access token.
  responses:
    401:
      description: The token is missing, wrong, expired or revoked by the customer.
    403:
      description: The token does not hold the scope this method needs.
settings:
  authorizationUri: https://auth.example.com/authorize
  accessTokenUri: https://auth.example.com/token
  authorizationGrants: [ authorization_code, client_credentials ]
  scopes: [ accounts, payments, fundsconfirmations ]
`,
    'traits/idempotent.raml': `#%RAML 1.0 Trait
usage: Apply to every POST that moves money.
headers:
  x-idempotency-key:
    type: string
    maxLength: 40
    description: A unique value per payment. A retry with the same key returns the first result.
`,
  },
  keyPoints: [
    'One OAuth 2.0 scheme can list several grants. The scopes on each method decide what a token may do.',
    'A SecurityScheme fragment and a Trait fragment let the security and payments teams own their parts.',
    'An annotation with allowedTargets: [ Method ] records a compliance rule where it applies.',
    'Every method states its own scope, so no token opens more than its job needs.',
    'An idempotency key on payments turns a retry into a safe repeat.',
  ],
  solution: `
The default \`securedBy: [ oauth2 ]\` closes every method. Each business method then narrows it to one scope, and the health check opens itself with \`null\`. A TPP with only \`fundsconfirmations\` can check funds but never read a balance.

The grants live in one scheme because both tokens come from the same server. The authorization code grant puts a customer in the loop for accounts and payments. Client credentials suit the funds check, where the TPP asks a yes or no question and sees no account data.

\`(sca)\` is on the methods, and \`allowedTargets\` keeps it there. The compliance team can list every \`PER_CALL\` method from the contract and check that the gateway asks for a fresh approval on each one.

The payment POST combines three things: the idempotent trait, the narrow scope and the SCA mark. Each covers a different risk: double payment, a stolen read token and fraud.
`,
  followUps: [
    {
      q: 'Why does the funds check use client credentials and not the authorization code grant?',
      a: 'The answer is only yes or no, so no account data reaches the TPP. The customer agreed to it once when setting up the payment journey.',
    },
    {
      q: 'What should the bank do when a retry arrives with a known x-idempotency-key but a different body?',
      a: 'Reject it with an error, because the key now names two different payments. Returning the first result would hide a bug in the TPP.',
    },
    {
      q: 'Does the (sca) annotation trigger strong customer authentication?',
      a: 'No, it documents the rule. The authorization server and the consent flow enforce SCA, and the annotation lets auditors check them against the contract.',
    },
    {
      q: 'Why is the 404 on balances worded as not shared?',
      a: 'The TPP must not learn whether an account exists when the customer did not share it. The same answer for both cases leaks nothing.',
    },
  ],
}

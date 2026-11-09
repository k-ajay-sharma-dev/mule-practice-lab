export default {
  id: 'rm-116',
  category: 'api-design',
  title: 'Loan Application Process API: Apply, Wait for a Decision, Accept',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'process-api', 'api-led', 'async', 'security', 'lending'],
  estMinutes: 35,
  description: `
A bank offers personal loans from 1,000 to 50,000 pounds over 12 to 84 months. It receives about 6,000 applications a day from its website, its app and two comparison sites.

Deciding an application takes up to two minutes. The bank checks identity, asks a credit bureau for a report, runs an affordability model and sometimes sends the case to a human underwriter. Each step lives in its own system behind its own System API.

You are writing the **Process API** that runs this as one business action. The website, the app and the partners call it, and none of them should know which systems sit behind it. A first draft exposed the bureau's raw credit score in the response, which the bureau's licence forbids passing to partners.

**Requirements**
- Title \`Loan Application Process API\`, version \`v1\`, a base URI that uses \`{version}\`, and JSON as the default media type.
- \`LoanApplicationRequest\` has a required string \`customerId\`, a required integer \`amount\` from 1000 to 50000, a required integer \`termMonths\` from 12 to 84, and a required \`purpose\` that is one of \`CAR\`, \`HOME_IMPROVEMENT\`, \`DEBT_CONSOLIDATION\`, \`OTHER\`.
- \`LoanApplication\` inherits from \`LoanApplicationRequest\`. It adds a required string \`applicationId\`, a required \`status\` that is one of \`RECEIVED\`, \`CHECKING\`, \`APPROVED\`, \`DECLINED\`, \`REFERRED\`, \`ACCEPTED\`, and an optional \`decision\` of type \`Decision\`.
- \`Decision\` has a required \`outcome\` that is one of \`APPROVED\`, \`DECLINED\`, \`REFERRED\`. Neither \`Decision\` nor \`LoanApplication\` has \`creditScore\` or \`bureauReport\`.
- \`POST /loan-applications\` takes a \`LoanApplicationRequest\`. The checks run after the call returns, so it answers with a \`LoanApplication\`, status 202 and a \`Location\` header. It returns an \`Error\` with status 409 when the customer already has an open application.
- \`GET /loan-applications/{applicationId}\` returns a \`LoanApplication\` with status 200, or an \`Error\` with status 404.
- \`POST /loan-applications/{applicationId}/acceptance\` records that the customer accepts the offer. It returns a \`LoanApplication\` with status 200, or an \`Error\` with status 409 when the application is not approved or the offer has expired.
- Trait \`traced\` has a required string header \`X-Correlation-Id\`. All three methods use it.
- A scheme \`oauth2\` of type \`OAuth 2.0\` with the grant \`client_credentials\`. Both POST methods need the scope \`loans:apply\`. The GET needs \`loans:read\`.
`,
  starter: `#%RAML 1.0
title: Loan Application Process API

types:
  LoanApplication:
    type: object
    properties:
      applicationId: string
      status: string
      creditScore: integer
      bureauReport: string

traits:

securitySchemes:

/loan-applications:
`,
  ramlChecks: [
    {
      label: 'The title, version v1, a base URI with {version} and JSON',
      rule: {
        type: 'all',
        rules: [
          { type: 'root', key: 'title', want: 'Loan Application Process API' },
          { type: 'root', key: 'version', want: 'v1' },
          { type: 'root', key: 'baseUri', want: '{version}' },
          { type: 'root', key: 'mediaType', want: 'application/json' },
        ],
      },
    },
    {
      label: 'LoanApplicationRequest limits amount, termMonths and purpose',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'LoanApplicationRequest', prop: 'customerId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'LoanApplicationRequest', prop: 'amount', want: { type: 'integer', required: true, minimum: 1000, maximum: 50000 } },
          { type: 'prop', typeName: 'LoanApplicationRequest', prop: 'termMonths', want: { type: 'integer', required: true, minimum: 12, maximum: 84 } },
          { type: 'prop', typeName: 'LoanApplicationRequest', prop: 'purpose', want: { required: true, enum: { exactly: ['CAR', 'HOME_IMPROVEMENT', 'DEBT_CONSOLIDATION', 'OTHER'] } } },
        ],
      },
    },
    {
      label: 'LoanApplication inherits the request and adds applicationId, status and decision',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'LoanApplication', extends: 'LoanApplicationRequest' },
          { type: 'prop', typeName: 'LoanApplication', prop: 'applicationId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'LoanApplication', prop: 'status', want: { required: true, enum: { exactly: ['RECEIVED', 'CHECKING', 'APPROVED', 'DECLINED', 'REFERRED', 'ACCEPTED'] } } },
          { type: 'prop', typeName: 'LoanApplication', prop: 'decision', want: { type: 'Decision', required: false } },
        ],
      },
    },
    { label: 'Decision outcome is APPROVED, DECLINED or REFERRED', rule: { type: 'prop', typeName: 'Decision', prop: 'outcome', want: { required: true, enum: { exactly: ['APPROVED', 'DECLINED', 'REFERRED'] } } } },
    {
      label: 'No credit bureau data leaves the API',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'LoanApplication' },
          { type: 'typeDecl', name: 'Decision' },
          { type: 'noProp', typeName: 'LoanApplication', prop: 'creditScore' },
          { type: 'noProp', typeName: 'LoanApplication', prop: 'bureauReport' },
          { type: 'noProp', typeName: 'Decision', prop: 'creditScore' },
          { type: 'noProp', typeName: 'Decision', prop: 'bureauReport' },
        ],
      },
    },
    {
      label: 'POST /loan-applications takes the request and returns 202 with Location',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/loan-applications', method: 'post', typeIs: 'LoanApplicationRequest' },
          { type: 'response', path: '/loan-applications', method: 'post', status: '202', typeIs: 'LoanApplication', header: 'Location' },
        ],
      },
    },
    { label: 'POST /loan-applications returns an Error with 409 for an open application', rule: { type: 'response', path: '/loan-applications', method: 'post', status: '409', typeIs: 'Error' } },
    {
      label: 'GET /loan-applications/{applicationId} returns a LoanApplication, or an Error with 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/loan-applications/{}', method: 'get', status: '200', typeIs: 'LoanApplication' },
          { type: 'response', path: '/loan-applications/{}', method: 'get', status: '404', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'POST acceptance returns a LoanApplication, or an Error with 409',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/loan-applications/{}/acceptance', method: 'post', status: '200', typeIs: 'LoanApplication' },
          { type: 'response', path: '/loan-applications/{}/acceptance', method: 'post', status: '409', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'All three methods use traced, with a required X-Correlation-Id',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/loan-applications', method: 'post', trait: 'traced' },
          { type: 'applied', path: '/loan-applications/{}', method: 'get', trait: 'traced' },
          { type: 'applied', path: '/loan-applications/{}/acceptance', method: 'post', trait: 'traced' },
          { type: 'param', path: '/loan-applications/{}/acceptance', method: 'post', in: 'header', name: 'X-Correlation-Id', want: { type: 'string', required: true } },
        ],
      },
    },
    { label: 'oauth2 is OAuth 2.0 with client_credentials', rule: { type: 'scheme', name: 'oauth2', schemeType: 'OAuth 2.0', values: { 'settings.authorizationGrants': 'client_credentials' } } },
    {
      label: 'Both POST methods need loans:apply and the GET needs loans:read',
      rule: {
        type: 'all',
        rules: [
          { type: 'secured', path: '/loan-applications', method: 'post', scheme: 'oauth2', scopes: ['loans:apply'], onlyScopes: true, required: true },
          { type: 'secured', path: '/loan-applications/{}/acceptance', method: 'post', scheme: 'oauth2', scopes: ['loans:apply'], onlyScopes: true, required: true },
          { type: 'secured', path: '/loan-applications/{}', method: 'get', scheme: 'oauth2', scopes: ['loans:read'], onlyScopes: true, required: true },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Loan Application Process API
version: v1
baseUri: https://api.example.com/loans/{version}
mediaType: application/json

types:
  LoanApplicationRequest:
    type: object
    properties:
      customerId: string
      amount:
        type: integer
        minimum: 1000
        maximum: 50000
      termMonths:
        type: integer
        minimum: 12
        maximum: 84
      purpose:
        type: string
        enum: [ CAR, HOME_IMPROVEMENT, DEBT_CONSOLIDATION, OTHER ]
  Decision:
    type: object
    properties:
      outcome:
        type: string
        enum: [ APPROVED, DECLINED, REFERRED ]
      approvedAmount?: integer
      aprPercent?: number
      offerExpiresOn?: date-only
  LoanApplication:
    type: LoanApplicationRequest
    properties:
      applicationId: string
      status:
        type: string
        enum: [ RECEIVED, CHECKING, APPROVED, DECLINED, REFERRED, ACCEPTED ]
      decision?: Decision
    example:
      applicationId: LA-20260314-00871
      customerId: C-4410293
      amount: 12000
      termMonths: 48
      purpose: CAR
      status: APPROVED
      decision:
        outcome: APPROVED
        approvedAmount: 12000
        aprPercent: 7.9
        offerExpiresOn: 2026-04-13
  Error:
    type: object
    properties:
      code: string
      message: string

traits:
  traced:
    headers:
      X-Correlation-Id:
        type: string

securitySchemes:
  oauth2:
    type: OAuth 2.0
    describedBy:
      headers:
        Authorization:
          type: string
      responses:
        401:
          description: The token is missing or not valid.
    settings:
      accessTokenUri: https://auth.example.com/token
      authorizationGrants: [ client_credentials ]
      scopes: [ loans:apply, loans:read ]

/loan-applications:
  post:
    is: [ traced ]
    securedBy: [ oauth2: { scopes: [ loans:apply ] } ]
    body:
      type: LoanApplicationRequest
    responses:
      202:
        description: The application is received and the checks have started.
        headers:
          Location:
            type: string
        body:
          type: LoanApplication
      409:
        description: The customer already has an open application.
        body:
          type: Error
  /{applicationId}:
    get:
      is: [ traced ]
      securedBy: [ oauth2: { scopes: [ loans:read ] } ]
      responses:
        200:
          body:
            type: LoanApplication
        404:
          body:
            type: Error
    /acceptance:
      post:
        is: [ traced ]
        securedBy: [ oauth2: { scopes: [ loans:apply ] } ]
        responses:
          200:
            body:
              type: LoanApplication
          409:
            description: The application is not approved, or the offer has expired.
            body:
              type: Error
`,
  keyPoints: [
    'A Process API names the business action. Identity, bureau and underwriting systems stay hidden behind it.',
    '202 with a Location header fits work that takes minutes. The caller polls the application for the decision.',
    'An action such as accepting an offer can be a sub-resource, /acceptance, with POST.',
    'A response type should hold only what callers may see. Licensed bureau data stays inside the bank.',
    'Separate scopes for applying and reading let a comparison site check status without being able to apply.',
  ],
  solution: `
The flow has three calls. The partner posts an application and gets a 202 with the application in \`RECEIVED\`, plus a \`Location\` to poll. It reads that URL until the status is \`APPROVED\`, \`DECLINED\` or \`REFERRED\`. When the customer agrees, it posts to \`/acceptance\`.

\`LoanApplication\` inherits from \`LoanApplicationRequest\`, so what the caller sent comes back with what the bank added. \`decision\` is optional because it does not exist until the checks finish.

The draft's \`creditScore\` and \`bureauReport\` are gone. The decision says what the bank decided and why in its own terms, never the bureau's data.

Acceptance is a POST on a sub-resource because it is an action with rules. The 409 covers an application that was never approved and an offer past \`offerExpiresOn\`. A PATCH that sets \`status: ACCEPTED\` would let callers try any status they like.

Scopes are per method, so a partner that only shows status can hold \`loans:read\` alone.
`,
  followUps: [
    {
      q: 'The decision takes up to two minutes. Why not hold the connection open and return 201?',
      a: 'Load balancers and mobile networks drop long requests, and a worker thread would be blocked for each one. Returning 202 at once and running the checks in the background scales and survives a dropped connection.',
    },
    {
      q: 'How could partners learn the decision without polling?',
      a: 'Offer a webhook: the partner registers a callback URL and the Process API posts the decision when it is ready. Keep the GET so a partner that missed the callback can still read the result.',
    },
    {
      q: 'The credit bureau is down. What does the caller see?',
      a: 'The POST still returns 202, since the application is stored. The status stays CHECKING while the Process API retries, and the application may move to REFERRED if the bureau stays down.',
    },
    {
      q: 'How do you stop a partner creating two applications on a retry?',
      a: 'The 409 for an open application already helps. An Idempotency-Key header on the POST makes the retry return the first response exactly.',
    },
  ],
}

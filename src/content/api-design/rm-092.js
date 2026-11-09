export default {
  id: 'rm-092',
  category: 'api-design',
  title: 'Leave Requests API: Security Schemes and Annotations from a Shared Library',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'security', 'libraries', 'uses', 'annotations', 'scopes', 'hr'],
  estMinutes: 35,
  description: `
A company of 22,000 staff is moving its HR services to APIs. The security architects want one source for the security schemes and the data classification annotation, so 40 HR APIs use the same token URL, scopes and error responses.

A **library** can hold \`securitySchemes\` and \`annotationTypes\` as well as types and traits. Every name gets the prefix chosen under \`uses\`, so a scheme is used as \`sec.oauth2\` and an annotation as \`(sec.dataClass)\`.

The Leave Requests API is the first to use the library. Employees use the HR portal, where they sign in, so the portal gets tokens through the authorization code grant. Managers approve requests with a separate scope. Reference data, such as the list of leave types, is read by many internal apps with only a client id.

This problem has two files. Use the tabs above the editor to move between them.

**Requirements**
- \`libraries/security.raml\` is a Library. It declares:
  - a security scheme \`oauth2\` of type \`OAuth 2.0\` with \`authorizationUri\` \`https://login.example.com/authorize\`, \`accessTokenUri\` \`https://login.example.com/token\`, the grant \`authorization_code\`, exactly the scopes \`leave:read\`, \`leave:write\` and \`leave:approve\`, and a 401 and a 403 in \`describedBy\`;
  - a security scheme \`clientId\` of type \`Pass Through\` with the headers \`client_id\` and \`client_secret\` in \`describedBy\`;
  - an annotation type \`dataClass\`: a string that is one of \`PUBLIC\`, \`INTERNAL\`, \`CONFIDENTIAL\`, allowed only on \`API\`.
- \`api.raml\` has the title \`Leave Requests API\`, with JSON as the default media type. It uses the library with the prefix \`sec\`.
- The API is marked \`(sec.dataClass): CONFIDENTIAL\`, because leave records can hold health reasons.
- The default for the whole API is \`sec.clientId\`.
- A type \`LeaveRequest\` with a required string \`employeeId\`, a required date-only \`from\` and a required date-only \`to\`.
- \`GET /leave-types\` returns 200 and uses the default.
- \`POST /leave-requests\` takes a \`LeaveRequest\` and returns 201. It needs \`sec.oauth2\` with \`leave:write\` only.
- \`GET /leave-requests/{requestId}\` returns a \`LeaveRequest\` with status 200, or 404. It needs \`leave:read\` only.
- \`POST /leave-requests/{requestId}/approval\` returns 200. It needs \`leave:approve\` only.
`,
  starter: `#%RAML 1.0
title: Leave Requests API
mediaType: application/json

types:

/leave-types:

/leave-requests:
`,
  files: {
    'libraries/security.raml': `#%RAML 1.0 Library
usage: Security schemes and classification shared by every HR API.
`,
  },
  ramlChecks: [
    { label: 'The API uses libraries/security.raml with the prefix sec', rule: { type: 'library', prefix: 'sec', file: 'libraries/security.raml' } },
    {
      label: 'sec.oauth2 is OAuth 2.0 with both URLs and the authorization_code grant',
      rule: {
        type: 'scheme',
        name: 'sec.oauth2',
        schemeType: 'OAuth 2.0',
        values: {
          'settings.authorizationUri': 'https://login.example.com/authorize',
          'settings.accessTokenUri': 'https://login.example.com/token',
          'settings.authorizationGrants': ['authorization_code'],
        },
      },
    },
    {
      label: 'sec.oauth2 lists exactly leave:read, leave:write and leave:approve, with a 401 and a 403',
      rule: {
        type: 'scheme',
        name: 'sec.oauth2',
        has: ['describedBy.responses.401', 'describedBy.responses.403'],
        values: { 'settings.scopes': { exactly: ['leave:read', 'leave:write', 'leave:approve'] } },
      },
    },
    { label: 'sec.clientId is Pass Through with the client_id and client_secret headers', rule: { type: 'scheme', name: 'sec.clientId', schemeType: 'Pass Through', has: ['describedBy.headers.client_id', 'describedBy.headers.client_secret'] } },
    {
      label: 'sec.dataClass allows only PUBLIC, INTERNAL and CONFIDENTIAL, on API only',
      rule: {
        type: 'all',
        rules: [
          { type: 'annotationType', name: 'sec.dataClass', want: { type: 'string', enum: { exactly: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL'] } } },
          { type: 'any', rules: [{ type: 'annotationType', name: 'sec.dataClass', want: { allowedTargets: { exactly: ['API'] } } }, { type: 'annotationType', name: 'sec.dataClass', want: { allowedTargets: { is: 'API' } } }] },
        ],
      },
    },
    { label: 'The API is marked (sec.dataClass): CONFIDENTIAL', rule: { type: 'annotated', name: 'sec.dataClass', value: { is: 'CONFIDENTIAL' } } },
    {
      label: 'sec.clientId is the default, and GET /leave-types uses it',
      rule: {
        type: 'all',
        rules: [
          { type: 'root', key: 'securedBy', want: { exactly: ['sec.clientId'] } },
          { type: 'response', path: '/leave-types', method: 'get', status: '200' },
          { type: 'secured', path: '/leave-types', method: 'get', scheme: 'sec.clientId', required: true },
        ],
      },
    },
    {
      label: 'LeaveRequest has employeeId and date-only from and to',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'LeaveRequest', prop: 'employeeId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'LeaveRequest', prop: 'from', want: { type: 'date-only', required: true } },
          { type: 'prop', typeName: 'LeaveRequest', prop: 'to', want: { type: 'date-only', required: true } },
        ],
      },
    },
    {
      label: 'POST /leave-requests takes a LeaveRequest, returns 201 and needs leave:write only',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/leave-requests', method: 'post', typeIs: 'LeaveRequest' },
          { type: 'response', path: '/leave-requests', method: 'post', status: '201' },
          { type: 'secured', path: '/leave-requests', method: 'post', scheme: 'sec.oauth2', scopes: ['leave:write'], onlyScopes: true, required: true },
        ],
      },
    },
    {
      label: 'GET /leave-requests/{requestId} returns a LeaveRequest or 404, and needs leave:read only',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/leave-requests/{}', method: 'get', status: '200', typeIs: 'LeaveRequest' },
          { type: 'response', path: '/leave-requests/{}', method: 'get', status: '404' },
          { type: 'secured', path: '/leave-requests/{}', method: 'get', scheme: 'sec.oauth2', scopes: ['leave:read'], onlyScopes: true, required: true },
        ],
      },
    },
    {
      label: 'POST /leave-requests/{requestId}/approval returns 200 and needs leave:approve only',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/leave-requests/{}/approval', method: 'post', status: '200' },
          { type: 'secured', path: '/leave-requests/{}/approval', method: 'post', scheme: 'sec.oauth2', scopes: ['leave:approve'], onlyScopes: true, required: true },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Leave Requests API
mediaType: application/json

uses:
  sec: libraries/security.raml

(sec.dataClass): CONFIDENTIAL

securedBy: [ sec.clientId ]

types:
  LeaveRequest:
    type: object
    properties:
      employeeId: string
      from: date-only
      to: date-only

/leave-types:
  get:
    responses:
      200:
        description: Annual, sick, parental and the other leave types.

/leave-requests:
  post:
    securedBy: [ sec.oauth2: { scopes: [ leave:write ] } ]
    body:
      type: LeaveRequest
    responses:
      201:
        description: The request was sent to the employee's manager.
  /{requestId}:
    get:
      securedBy: [ sec.oauth2: { scopes: [ leave:read ] } ]
      responses:
        200:
          body:
            type: LeaveRequest
        404:
          description: No leave request has this id.
    /approval:
      post:
        securedBy: [ sec.oauth2: { scopes: [ leave:approve ] } ]
        responses:
          200:
            description: The request was approved.
`,
  referenceFiles: {
    'libraries/security.raml': `#%RAML 1.0 Library
usage: Security schemes and classification shared by every HR API.

securitySchemes:
  oauth2:
    type: OAuth 2.0
    description: Staff sign in to the HR portal, which receives a token for them.
    describedBy:
      headers:
        Authorization:
          type: string
      responses:
        401:
          description: The token is missing, wrong or expired.
        403:
          description: The token does not hold the scope this method needs.
    settings:
      authorizationUri: https://login.example.com/authorize
      accessTokenUri: https://login.example.com/token
      authorizationGrants: [ authorization_code ]
      scopes: [ leave:read, leave:write, leave:approve ]
  clientId:
    type: Pass Through
    describedBy:
      headers:
        client_id:
          type: string
        client_secret:
          type: string
      responses:
        401:
          description: The client id or client secret is missing or wrong.

annotationTypes:
  dataClass:
    type: string
    enum: [ PUBLIC, INTERNAL, CONFIDENTIAL ]
    allowedTargets: [ API ]
`,
  },
  keyPoints: [
    'A library can hold securitySchemes and annotationTypes, not only types and traits.',
    'Names from a library carry its prefix: sec.oauth2 in securedBy, (sec.dataClass) as an annotation.',
    'Scopes are written with the prefixed scheme name, as in sec.oauth2: { scopes: [ ... ] }.',
    'One shared library keeps the token URL and the error responses the same across many APIs.',
    'Approval has its own scope, so an employee token can never approve leave.',
  ],
  solution: `
The API file holds no scheme of its own. It names \`sec.clientId\` as the default and \`sec.oauth2\` with a scope on each personal method. When the identity provider moves, the architects change the library and publish a new version to Exchange.

Each leave method names one scope. An employee's token has \`leave:read\` and \`leave:write\`. Only managers get \`leave:approve\`, so the approval method returns 403 to everybody else.

\`(sec.dataClass): CONFIDENTIAL\` sits at the top because the classification is about the whole API. A tool can then list every confidential API, and its owners know which logging and masking rules apply.
`,
  followUps: [
    {
      q: 'How do 40 APIs pick up a change to the library?',
      a: 'The library is published to Exchange as its own asset with a version. Each API moves to the new version in its next release, so no API changes by surprise.',
    },
    {
      q: 'Why is there no securedBy in the library?',
      a: 'A library cannot say which methods are secured, because it has no resources. Each API decides that and refers to the schemes by their prefixed names.',
    },
    {
      q: 'Why does the reference data use a client id and not a token?',
      a: 'The leave types hold no personal data, and many system apps read them with no user signed in. A client id still tells the team who is calling.',
    },
  ],
}

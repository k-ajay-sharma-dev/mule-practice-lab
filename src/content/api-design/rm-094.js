const claimType = `type: object
properties:
  claimId: string
  policyNumber: string
  lossDate: date-only
  status:
    type: string
    enum: [ OPEN, IN_REVIEW, SETTLED, REJECTED ]
`

export default {
  id: 'rm-094',
  category: 'api-design',
  title: 'Claims Portal API: Fix a Contract That Failed Security Review',
  level: 'EXPERT',
  tags: ['raml', 'api-design', 'security', 'debugging', 'oauth2', 'scopes', 'fragments', 'governance', 'insurance'],
  estMinutes: 45,
  description: `
An insurer's security team has reviewed the Claims Portal API before go-live. About 2,000 brokers will use it to file and track claims, and a claim holds medical and bank details. The draft is in the editor and the findings are below. Fix each one.

The API sits behind API Manager, and the OAuth 2.0 policy will be configured from this contract. Whatever the contract says is public will be left open.

This problem has two files. Use the tabs above the editor to move between them.

**Finding 1: a scheme type RAML does not know**
\`oauth2\` has \`type: OAuth2\`. The built-in type is \`OAuth 2.0\`, and tools that read the contract ignore a scheme they do not recognise.

**Finding 2: scopes used but never declared**
Methods use \`claims:write\`, and the delete needs an admin scope, but \`settings.scopes\` lists only \`claims:read\`.
- The scheme lists exactly \`claims:read\`, \`claims:write\` and \`claims:admin\`.

**Finding 3: an open default**
\`securedBy: [ null, oauth2 ]\` at the top makes every method without its own \`securedBy\` callable with no token, including \`GET /claims/{claimId}\`.
- The default for the whole API is \`oauth2\` alone.
- \`GET /claims/{claimId}\` needs \`claims:read\` only.
- \`GET /health\` stays callable with no token.

**Finding 4: deletes with the wrong scope**
- \`DELETE /claims/{claimId}\` needs \`claims:admin\` only. Brokers hold \`claims:write\`, and they must not delete claims.

**Finding 5: no 403**
- The \`oauth2\` scheme's \`describedBy\` has a 401 and a 403.

**Finding 6: a public admin action**
\`POST /admin/reindex\` was copied from the health check, so it has \`securedBy: [ null ]\`.
- It needs \`claims:admin\` only.

**Finding 7: passwords over plain HTTP**
\`protocols\` allows HTTP, and \`GET /claims/{claimId}/documents\` uses the old \`legacyBasic\` scheme.
- \`protocols\` allows HTTPS only.
- \`GET /claims/{claimId}/documents\` needs \`oauth2\` with \`claims:read\` only.

**Finding 8: a fragment of the wrong kind**
\`types/claim.raml\` starts with \`#%RAML 1.0 Library\`, but it holds one type and is included under \`types\`.
- Make it a DataType fragment. \`Claim\` keeps its required \`claimId\`, \`policyNumber\`, \`lossDate\` and \`status\`.

Keep \`GET /claims\` on \`claims:read\` only and \`POST /claims\` on \`claims:write\` only.
`,
  starter: `#%RAML 1.0
title: Claims Portal API
version: v2
protocols: [ HTTP, HTTPS ]
mediaType: application/json

securitySchemes:
  oauth2:
    type: OAuth2
    describedBy:
      headers:
        Authorization:
          type: string
      responses:
        401:
          description: The token is missing, wrong or expired.
    settings:
      accessTokenUri: https://auth.example.com/token
      authorizationGrants: [ client_credentials ]
      scopes: [ claims:read ]
  legacyBasic:
    type: Basic Authentication

securedBy: [ null, oauth2 ]

types:
  Claim: !include types/claim.raml

/claims:
  get:
    securedBy: [ oauth2: { scopes: [ claims:read ] } ]
    responses:
      200:
        body:
          type: Claim[]
  post:
    securedBy: [ oauth2: { scopes: [ claims:write ] } ]
    body:
      type: Claim
    responses:
      201:
        description: The claim was filed.
  /{claimId}:
    get:
      responses:
        200:
          body:
            type: Claim
        404:
          description: No claim has this id.
    delete:
      securedBy: [ oauth2: { scopes: [ claims:write ] } ]
      responses:
        204:
          description: The claim was deleted.
    /documents:
      get:
        securedBy: [ legacyBasic ]
        responses:
          200:
            description: The documents attached to the claim.

/admin/reindex:
  post:
    securedBy: [ null ]
    responses:
      202:
        description: The search index rebuild has started.

/health:
  get:
    responses:
      200:
        description: The API is up.
`,
  files: {
    'types/claim.raml': `#%RAML 1.0 Library
${claimType}`,
  },
  ramlChecks: [
    { label: 'Finding 1: oauth2 has the type OAuth 2.0', rule: { type: 'scheme', name: 'oauth2', schemeType: 'OAuth 2.0' } },
    { label: 'Finding 2: the scheme lists exactly claims:read, claims:write and claims:admin', rule: { type: 'scheme', name: 'oauth2', values: { 'settings.scopes': { exactly: ['claims:read', 'claims:write', 'claims:admin'] } } } },
    { label: 'Finding 3: the default for the whole API is oauth2 alone', rule: { type: 'root', key: 'securedBy', want: { exactly: ['oauth2'] } } },
    { label: 'Finding 3: GET /claims/{claimId} needs claims:read only', rule: { type: 'secured', path: '/claims/{}', method: 'get', scheme: 'oauth2', scopes: ['claims:read'], onlyScopes: true, required: true } },
    {
      label: 'Finding 3: GET /health still works with no token',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/health', method: 'get', status: '200' },
          { type: 'public', path: '/health', method: 'get' },
        ],
      },
    },
    { label: 'Finding 4: DELETE /claims/{claimId} needs claims:admin only', rule: { type: 'secured', path: '/claims/{}', method: 'delete', scheme: 'oauth2', scopes: ['claims:admin'], onlyScopes: true, required: true } },
    { label: 'Finding 5: describedBy has a 401 and a 403', rule: { type: 'scheme', name: 'oauth2', has: ['describedBy.responses.401', 'describedBy.responses.403'] } },
    { label: 'Finding 6: POST /admin/reindex needs claims:admin only', rule: { type: 'secured', path: '/admin/reindex', method: 'post', scheme: 'oauth2', scopes: ['claims:admin'], onlyScopes: true, required: true } },
    { label: 'Finding 7: protocols allows HTTPS only', rule: { type: 'root', key: 'protocols', want: { exactly: ['HTTPS'] } } },
    { label: 'Finding 7: GET /claims/{claimId}/documents needs oauth2 with claims:read only', rule: { type: 'secured', path: '/claims/{}/documents', method: 'get', scheme: 'oauth2', scopes: ['claims:read'], onlyScopes: true, required: true } },
    {
      label: 'Finding 8: Claim comes from types/claim.raml with its four required properties',
      rule: {
        type: 'all',
        rules: [
          { type: 'included', file: 'types/claim.raml' },
          { type: 'prop', typeName: 'Claim', prop: 'claimId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Claim', prop: 'policyNumber', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Claim', prop: 'lossDate', want: { type: 'date-only', required: true } },
          { type: 'prop', typeName: 'Claim', prop: 'status', want: { required: true, enum: { exactly: ['OPEN', 'IN_REVIEW', 'SETTLED', 'REJECTED'] } } },
        ],
      },
    },
    {
      label: 'GET /claims keeps claims:read only and POST /claims keeps claims:write only',
      rule: {
        type: 'all',
        rules: [
          { type: 'secured', path: '/claims', method: 'get', scheme: 'oauth2', scopes: ['claims:read'], onlyScopes: true, required: true },
          { type: 'secured', path: '/claims', method: 'post', scheme: 'oauth2', scopes: ['claims:write'], onlyScopes: true, required: true },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Claims Portal API
version: v2
protocols: [ HTTPS ]
mediaType: application/json

securitySchemes:
  oauth2:
    type: OAuth 2.0
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
      accessTokenUri: https://auth.example.com/token
      authorizationGrants: [ client_credentials ]
      scopes: [ claims:read, claims:write, claims:admin ]

securedBy: [ oauth2 ]

types:
  Claim: !include types/claim.raml

/claims:
  get:
    securedBy: [ oauth2: { scopes: [ claims:read ] } ]
    responses:
      200:
        body:
          type: Claim[]
  post:
    securedBy: [ oauth2: { scopes: [ claims:write ] } ]
    body:
      type: Claim
    responses:
      201:
        description: The claim was filed.
  /{claimId}:
    get:
      securedBy: [ oauth2: { scopes: [ claims:read ] } ]
      responses:
        200:
          body:
            type: Claim
        404:
          description: No claim has this id.
    delete:
      securedBy: [ oauth2: { scopes: [ claims:admin ] } ]
      responses:
        204:
          description: The claim was deleted.
    /documents:
      get:
        securedBy: [ oauth2: { scopes: [ claims:read ] } ]
        responses:
          200:
            description: The documents attached to the claim.

/admin/reindex:
  post:
    securedBy: [ oauth2: { scopes: [ claims:admin ] } ]
    responses:
      202:
        description: The search index rebuild has started.

/health:
  get:
    securedBy: [ null ]
    responses:
      200:
        description: The API is up.
`,
  referenceFiles: {
    'types/claim.raml': `#%RAML 1.0 DataType
${claimType}`,
  },
  keyPoints: [
    'Scheme types are exact: OAuth 2.0, OAuth 1.0, Basic Authentication, Digest Authentication, Pass Through, or your own x- type.',
    'Every scope a method uses should be listed in the scheme settings.',
    'null in the API default makes every method without its own securedBy public.',
    'A closed default with an explicit null on each public method is safer than an open default.',
    'A fragment header must match where it is included: a type under types needs DataType.',
  ],
  solution: `
Findings 3 and 6 matter most, because the gateway is configured from this contract. With the open default, \`GET /claims/{claimId}\` would have served medical details to anyone. With \`securedBy: [ null ]\` on the reindex, anyone could start a costly rebuild.

The fixed default is \`[ oauth2 ]\`. The only \`null\` left is on \`/health\`, where it is written on purpose. A search for \`null\` now finds every public method.

Findings 1, 2 and 5 make the scheme honest. A scheme type tools do not know, scopes nobody declared and a missing 403 all lead to a policy that does not match what the methods say.

Finding 7 removes the last password. The documents read moves to \`oauth2\`, so \`legacyBasic\` is used nowhere and can be deleted. HTTPS only would matter even without it, because tokens are as valuable as passwords.

Finding 8 is a one line fix. The content was right, but a Library cannot sit under \`types\`.
`,
  followUps: [
    {
      q: 'Which finding would you fix first, and why?',
      a: 'The open default, because it exposes claim data to anyone on day one. The public admin action comes next, since it lets anyone run a costly job.',
    },
    {
      q: 'How could a pipeline catch an open default before review?',
      a: 'A governance ruleset in Anypoint API Governance, or a lint step in CI, can fail any contract whose top-level securedBy includes null.',
    },
    {
      q: 'Why should a delete need a separate admin scope?',
      a: 'Deleting a claim destroys evidence the insurer must keep. Only a small group should hold that right, and a separate scope makes it simple to grant and audit.',
    },
    {
      q: 'Is HTTPS only still needed when no scheme uses passwords?',
      a: 'Yes. A bearer token sent over HTTP can be copied and reused until it expires, and the claim bodies hold personal data.',
    },
  ],
}

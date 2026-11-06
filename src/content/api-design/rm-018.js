export default {
  id: 'rm-018',
  category: 'api-design',
  title: 'Accounts API: OAuth 2.0 with Read and Write Scopes',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'security', 'oauth2', 'scopes', 'traits', 'banking'],
  estMinutes: 25,
  description: `
A bank lets partner apps read customer accounts. A few trusted partners can also open accounts. A budgeting app must never be able to do that, even with a valid token.

**OAuth 2.0** is a standard where an app gets an access token from an authorization server and sends it with each call. A **scope** is a named permission carried by that token. Keeping read and write in separate scopes means a token can be limited to reading.

In RAML you declare the scheme under \`securitySchemes\`, list the scopes in its \`settings\`, and apply it with \`securedBy\`. A method can name the scopes it needs:

\`\`\`
securedBy: [ oauth2: { scopes: [ some:scope ] } ]
\`\`\`

A trait can hold \`securedBy\` too, so the scope rule for reads and for writes is written once.

**Requirements**
- Title \`Accounts API\`, with JSON as the default media type.
- A security scheme \`oauth2\` of type \`OAuth 2.0\`. Its \`settings\` give \`authorizationUri\` \`https://auth.example.com/authorize\`, \`accessTokenUri\` \`https://auth.example.com/token\`, the grant \`authorization_code\`, and the scopes \`accounts:read\` and \`accounts:write\`.
- A trait \`readAccess\` that secures a method with \`oauth2\` and the scope \`accounts:read\`.
- A trait \`writeAccess\` that secures a method with \`oauth2\` and the scope \`accounts:write\`.
- \`GET /accounts\` and \`GET /accounts/{accountId}\` use \`readAccess\`, and both return 200.
- \`POST /accounts\` uses \`writeAccess\` and returns 201.
- \`POST /accounts\` also returns 403, for a valid token that does not hold the write scope.
`,
  starter: `#%RAML 1.0
title: Accounts API
mediaType: application/json

securitySchemes:

traits:

/accounts:
`,
  ramlChecks: [
    {
      label: 'The title is Accounts API and JSON is the default media type',
      rule: {
        type: 'all',
        rules: [
          { type: 'root', key: 'title', want: 'Accounts API' },
          { type: 'root', key: 'mediaType', want: 'application/json' },
        ],
      },
    },
    {
      label: 'oauth2 is an OAuth 2.0 scheme with its token URL, grants and scopes',
      rule: { type: 'scheme', name: 'oauth2', schemeType: 'OAuth 2.0', has: ['settings.accessTokenUri', 'settings.authorizationGrants', 'settings.scopes'] },
    },
    {
      label: 'readAccess and writeAccess each hold securedBy',
      rule: {
        type: 'all',
        rules: [
          { type: 'trait', name: 'readAccess', has: 'securedBy' },
          { type: 'trait', name: 'writeAccess', has: 'securedBy' },
        ],
      },
    },
    {
      label: 'Both GET methods use readAccess',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/accounts', method: 'get', trait: 'readAccess' },
          { type: 'applied', path: '/accounts/{}', method: 'get', trait: 'readAccess' },
        ],
      },
    },
    { label: 'POST /accounts uses writeAccess', rule: { type: 'applied', path: '/accounts', method: 'post', trait: 'writeAccess' } },
    {
      label: 'Every method ends up secured by oauth2',
      rule: {
        type: 'all',
        rules: [
          { type: 'secured', path: '/accounts', method: 'get', scheme: 'oauth2' },
          { type: 'secured', path: '/accounts/{}', method: 'get', scheme: 'oauth2' },
          { type: 'secured', path: '/accounts', method: 'post', scheme: 'oauth2' },
        ],
      },
    },
    {
      label: 'Both GET methods return 200',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/accounts', method: 'get', status: '200' },
          { type: 'response', path: '/accounts/{}', method: 'get', status: '200' },
        ],
      },
    },
    { label: 'POST /accounts returns 201', rule: { type: 'response', path: '/accounts', method: 'post', status: '201' } },
    { label: 'POST /accounts returns 403 when the token lacks the write scope', rule: { type: 'response', path: '/accounts', method: 'post', status: '403' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Accounts API
mediaType: application/json

securitySchemes:
  oauth2:
    type: OAuth 2.0
    describedBy:
      headers:
        Authorization:
          description: The access token, as Bearer followed by the token.
          type: string
      responses:
        401:
          description: The token is missing, expired or not valid.
    settings:
      authorizationUri: https://auth.example.com/authorize
      accessTokenUri: https://auth.example.com/token
      authorizationGrants: [ authorization_code ]
      scopes: [ accounts:read, accounts:write ]

traits:
  readAccess:
    securedBy: [ oauth2: { scopes: [ accounts:read ] } ]
  writeAccess:
    securedBy: [ oauth2: { scopes: [ accounts:write ] } ]
    responses:
      403:
        description: The token does not hold the write scope.

/accounts:
  get:
    is: [ readAccess ]
    responses:
      200:
        description: The accounts this token can see.
  post:
    is: [ writeAccess ]
    responses:
      201:
        description: The account was opened.
  /{accountId}:
    get:
      is: [ readAccess ]
      responses:
        200:
          description: The account.
`,
  keyPoints: [
    'A scope is a named permission in the token. Separate read and write scopes let you limit a token to reading.',
    'The scheme lists every scope in settings. A method names the scopes it needs with securedBy.',
    'A trait can hold securedBy, so the rule for reads and for writes lives in one place.',
    '401 means the token is missing or not valid. 403 means the token is valid but not allowed to do this.',
  ],
  solution: `
The scheme describes how the API is protected. The traits say which permission each kind of call needs.

Because \`403\` sits in \`writeAccess\`, every write method that uses the trait gets it. \`401\` sits in the scheme's \`describedBy\`, since any secured method can return it.

A budgeting app asks only for \`accounts:read\`. Its token then works on both \`GET\` methods and is refused on \`POST\`.
`,
  followUps: [
    {
      q: 'Does the RAML itself check the token?',
      a: 'No. The file is a contract that tells callers what to send. A policy on the API gateway, or the application, must do the real checking at runtime.',
    },
    {
      q: 'Why use authorization_code here and not client_credentials?',
      a: 'The apps act for a bank customer, and authorization_code involves that customer giving consent. client_credentials suits a system calling as itself, with no user present.',
    },
    {
      q: 'Why not use one scope for the whole API?',
      a: 'Every token would then carry the highest permission. If a read-only partner leaked its token, an attacker could open accounts. Narrow scopes limit that damage.',
    },
  ],
}

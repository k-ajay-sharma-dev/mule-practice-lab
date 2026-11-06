export default {
  id: 'rm-046',
  category: 'api-design',
  title: 'Warehouse Scanner API: Basic Authentication with a 401',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'security', 'basic-authentication', 'logistics'],
  estMinutes: 20,
  description: `
A logistics firm has 400 handheld scanners in its warehouses. Their firmware is old and can only send a username and a password. A new API must accept them, and the contract has to say so.

**Basic Authentication** is a built-in RAML scheme type. The caller sends an \`Authorization\` header holding the word \`Basic\` and then \`username:password\` in Base64. Base64 is an encoding, not encryption, so this is only safe over HTTPS.

\`describedBy\` is the part of a scheme that says what it adds to each secured method, such as headers and responses. Anything written there is stated once and applies everywhere the scheme is used.

When a server answers 401, it must also send a \`WWW-Authenticate\` header that says how to log in.

**Requirements**
- Title \`Warehouse Scanner API\`, with JSON as the default media type.
- The base URI is \`https://api.example.com/scanner\`, and \`protocols\` allows HTTPS and nothing else.
- A security scheme \`basicAuth\` of type \`Basic Authentication\`.
- Its \`describedBy\` declares the \`Authorization\` header and a 401 response. The 401 response has a \`WWW-Authenticate\` header.
- A type \`StockScan\` with a required string \`barcode\`, a required integer \`quantity\` of at least 1, and a required string \`binLocation\`.
- \`POST /scans\` takes a \`StockScan\` and returns 201.
- \`GET /scans/{scanId}\` returns a \`StockScan\` with status 200, or 404.
- Both methods are secured by \`basicAuth\`.
`,
  starter: `#%RAML 1.0
title: Warehouse Scanner API
mediaType: application/json

securitySchemes:

types:

/scans:
`,
  ramlChecks: [
    { label: 'The base URI is https://api.example.com/scanner', rule: { type: 'root', key: 'baseUri', want: 'https://api.example.com/scanner' } },
    { label: 'protocols allows HTTPS only', rule: { type: 'root', key: 'protocols', want: { exactly: ['HTTPS'] } } },
    { label: 'basicAuth is a Basic Authentication scheme', rule: { type: 'scheme', name: 'basicAuth', schemeType: 'Basic Authentication' } },
    { label: 'The scheme describes the Authorization header', rule: { type: 'scheme', name: 'basicAuth', has: 'describedBy.headers.Authorization' } },
    { label: 'The scheme describes a 401 response', rule: { type: 'scheme', name: 'basicAuth', has: 'describedBy.responses.401' } },
    { label: 'The 401 has a WWW-Authenticate header', rule: { type: 'scheme', name: 'basicAuth', has: 'describedBy.responses.401.headers.WWW-Authenticate' } },
    {
      label: 'StockScan has a required barcode, quantity of at least 1 and binLocation',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'StockScan', prop: 'barcode', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'StockScan', prop: 'quantity', want: { type: 'integer', required: true, minimum: 1 } },
          { type: 'prop', typeName: 'StockScan', prop: 'binLocation', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'POST /scans takes a StockScan and returns 201',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/scans', method: 'post', typeIs: 'StockScan' },
          { type: 'response', path: '/scans', method: 'post', status: '201' },
        ],
      },
    },
    {
      label: 'GET /scans/{scanId} returns a StockScan, or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/scans/{}', method: 'get', status: '200', typeIs: 'StockScan' },
          { type: 'response', path: '/scans/{}', method: 'get', status: '404' },
        ],
      },
    },
    { label: 'POST /scans is secured by basicAuth', rule: { type: 'secured', path: '/scans', method: 'post', scheme: 'basicAuth' } },
    { label: 'GET /scans/{scanId} is secured by basicAuth', rule: { type: 'secured', path: '/scans/{}', method: 'get', scheme: 'basicAuth' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Warehouse Scanner API
baseUri: https://api.example.com/scanner
protocols: [ HTTPS ]
mediaType: application/json

securitySchemes:
  basicAuth:
    type: Basic Authentication
    describedBy:
      headers:
        Authorization:
          type: string
      responses:
        401:
          description: The username or password is wrong.
          headers:
            WWW-Authenticate:
              type: string

securedBy: [ basicAuth ]

types:
  StockScan:
    type: object
    properties:
      barcode: string
      quantity:
        type: integer
        minimum: 1
      binLocation: string

/scans:
  post:
    body:
      type: StockScan
    responses:
      201:
        description: The scan was stored.
  /{scanId}:
    get:
      responses:
        200:
          body:
            type: StockScan
        404:
          description: No scan has this id.
`,
  keyPoints: [
    'Basic Authentication is a built-in scheme type, and it needs no settings.',
    'describedBy states the header and the 401 once, so no method repeats them.',
    'Base64 can be decoded by anyone, so limit the API to HTTPS.',
    'securedBy at the top of the file applies to every method that does not state its own.',
  ],
  solution: `
The scheme states the \`Authorization\` header and the 401 in one place. Each method then gets them through \`securedBy\`.

\`protocols: [ HTTPS ]\` matters more here than on most APIs. A password in Base64 is as good as plain text to anyone who can read the traffic.

The 401 carries \`WWW-Authenticate\` because the HTTP standard requires that header on a 401. It tells the caller which login method to use.
`,
  followUps: [
    {
      q: 'Why is Basic Authentication a weak choice for a new API?',
      a: 'The password travels with every call, so a single leak exposes the account until someone changes it. A token from OAuth 2.0 expires and can carry limited scopes.',
    },
    {
      q: 'What is the difference between a 401 and a 403?',
      a: 'A 401 means the server does not know who is calling, because credentials are missing or wrong. A 403 means the caller is known but is not allowed to do this.',
    },
    {
      q: 'Does the RAML check the password?',
      a: 'No, the contract only describes the scheme. A policy in API Manager or the application itself has to verify the credentials at run time.',
    },
  ],
}

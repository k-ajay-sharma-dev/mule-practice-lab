export default {
  id: 'rm-083',
  category: 'api-design',
  title: 'Pharmacy Stock API: Scopes on Resources, Overridden by Methods',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'security', 'oauth2', 'scopes', 'securedBy', 'healthcare'],
  estMinutes: 25,
  description: `
A pharmacy chain has 320 branches. Each branch till reads stock levels about 40,000 times a day. The goods-in scanner changes stock when a delivery arrives. Only the head office system may remove a product line from a branch, for example after a drug recall.

Each system gets its own OAuth 2.0 client, and each client only gets the scopes it needs. A leaked till token must never be able to change stock.

\`securedBy\` can sit on a resource. It then applies to every method of that resource that does not state its own. A method that states its own \`securedBy\` replaces the resource value completely. A resource value does **not** reach nested resources, so \`/{sku}\` under \`/stock\` needs its own.

The scheme's \`describedBy\` says what every secured method adds: the \`Authorization\` header, a 401 when the token is missing or expired, and a 403 when the token is valid but lacks the scope.

**Requirements**
- Title \`Pharmacy Stock API\`, with JSON as the default media type.
- A security scheme \`oauth2\` of type \`OAuth 2.0\`. Its \`settings\` give \`accessTokenUri\` \`https://auth.example.com/oauth2/token\`, the grant \`client_credentials\`, and exactly the scopes \`stock:read\`, \`stock:write\` and \`stock:admin\`.
- Its \`describedBy\` declares the \`Authorization\` header, a 401 response and a 403 response.
- A type \`StockLevel\` with a required string \`sku\`, a required string \`branchId\` and a required integer \`onHand\` of at least 0.
- A type \`StockAdjustment\` with a required integer \`quantityChange\` and a required string \`reason\` that is one of \`DELIVERY\`, \`SALE\`, \`DAMAGED\`, \`EXPIRED\`.
- \`GET /branches/{branchId}/stock\` returns \`StockLevel[]\` with status 200. It needs \`stock:read\` and nothing more.
- \`GET /branches/{branchId}/stock/{sku}\` returns a \`StockLevel\` with status 200, or 404. It needs \`stock:read\` and nothing more.
- \`PATCH /branches/{branchId}/stock/{sku}\` takes a \`StockAdjustment\` and returns a \`StockLevel\` with status 200. It needs \`stock:write\` only.
- \`DELETE /branches/{branchId}/stock/{sku}\` returns 204 with no body. It needs \`stock:admin\` only.
- Put \`stock:read\` on the two resources, and let the two write methods replace it.
`,
  starter: `#%RAML 1.0
title: Pharmacy Stock API
mediaType: application/json

securitySchemes:
  oauth2:
    type: OAuth 2.0

types:

/branches/{branchId}/stock:
`,
  ramlChecks: [
    {
      label: 'oauth2 is an OAuth 2.0 scheme with the token URL and the client_credentials grant',
      rule: {
        type: 'scheme',
        name: 'oauth2',
        schemeType: 'OAuth 2.0',
        values: { 'settings.accessTokenUri': 'https://auth.example.com/oauth2/token', 'settings.authorizationGrants': ['client_credentials'] },
      },
    },
    { label: 'The scheme lists exactly stock:read, stock:write and stock:admin', rule: { type: 'scheme', name: 'oauth2', values: { 'settings.scopes': { exactly: ['stock:read', 'stock:write', 'stock:admin'] } } } },
    { label: 'describedBy declares the Authorization header', rule: { type: 'scheme', name: 'oauth2', has: 'describedBy.headers.Authorization' } },
    { label: 'describedBy has a 401 and a 403 response', rule: { type: 'scheme', name: 'oauth2', has: ['describedBy.responses.401', 'describedBy.responses.403'] } },
    {
      label: 'StockLevel has a required sku, branchId and onHand of at least 0',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'StockLevel', prop: 'sku', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'StockLevel', prop: 'branchId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'StockLevel', prop: 'onHand', want: { type: 'integer', required: true, minimum: 0 } },
        ],
      },
    },
    {
      label: 'StockAdjustment has quantityChange, and reason allows only DELIVERY, SALE, DAMAGED and EXPIRED',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'StockAdjustment', prop: 'quantityChange', want: { type: 'integer', required: true } },
          { type: 'prop', typeName: 'StockAdjustment', prop: 'reason', want: { required: true, enum: { exactly: ['DELIVERY', 'SALE', 'DAMAGED', 'EXPIRED'] } } },
        ],
      },
    },
    {
      label: 'GET /branches/{branchId}/stock returns StockLevel[] and needs stock:read only',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/branches/{}/stock', method: 'get', status: '200', typeIs: 'StockLevel[]' },
          { type: 'secured', path: '/branches/{}/stock', method: 'get', scheme: 'oauth2', scopes: ['stock:read'], onlyScopes: true, required: true },
        ],
      },
    },
    {
      label: 'GET /branches/{branchId}/stock/{sku} returns a StockLevel or 404, and needs stock:read only',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/branches/{}/stock/{}', method: 'get', status: '200', typeIs: 'StockLevel' },
          { type: 'response', path: '/branches/{}/stock/{}', method: 'get', status: '404' },
          { type: 'secured', path: '/branches/{}/stock/{}', method: 'get', scheme: 'oauth2', scopes: ['stock:read'], onlyScopes: true, required: true },
        ],
      },
    },
    {
      label: 'PATCH /branches/{branchId}/stock/{sku} takes a StockAdjustment and returns a StockLevel',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/branches/{}/stock/{}', method: 'patch', typeIs: 'StockAdjustment' },
          { type: 'response', path: '/branches/{}/stock/{}', method: 'patch', status: '200', typeIs: 'StockLevel' },
        ],
      },
    },
    { label: 'PATCH needs stock:write and no other scope', rule: { type: 'secured', path: '/branches/{}/stock/{}', method: 'patch', scheme: 'oauth2', scopes: ['stock:write'], onlyScopes: true, required: true } },
    {
      label: 'DELETE returns 204 with no body and needs stock:admin only',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/branches/{}/stock/{}', method: 'delete', status: '204', noBody: true },
          { type: 'secured', path: '/branches/{}/stock/{}', method: 'delete', scheme: 'oauth2', scopes: ['stock:admin'], onlyScopes: true, required: true },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Pharmacy Stock API
mediaType: application/json

securitySchemes:
  oauth2:
    type: OAuth 2.0
    description: Each branch system has its own client in the company identity provider.
    describedBy:
      headers:
        Authorization:
          type: string
          description: Bearer followed by the access token.
      responses:
        401:
          description: The token is missing, wrong or expired.
        403:
          description: The token is valid but does not hold the scope this method needs.
    settings:
      accessTokenUri: https://auth.example.com/oauth2/token
      authorizationGrants: [ client_credentials ]
      scopes: [ stock:read, stock:write, stock:admin ]

types:
  StockLevel:
    type: object
    properties:
      sku: string
      branchId: string
      onHand:
        type: integer
        minimum: 0
  StockAdjustment:
    type: object
    properties:
      quantityChange: integer
      reason:
        type: string
        enum: [ DELIVERY, SALE, DAMAGED, EXPIRED ]

/branches/{branchId}/stock:
  securedBy: [ oauth2: { scopes: [ stock:read ] } ]
  get:
    responses:
      200:
        body:
          type: StockLevel[]
  /{sku}:
    securedBy: [ oauth2: { scopes: [ stock:read ] } ]
    get:
      responses:
        200:
          body:
            type: StockLevel
        404:
          description: This branch does not stock this SKU.
    patch:
      securedBy: [ oauth2: { scopes: [ stock:write ] } ]
      body:
        type: StockAdjustment
      responses:
        200:
          body:
            type: StockLevel
    delete:
      securedBy: [ oauth2: { scopes: [ stock:admin ] } ]
      responses:
        204:
          description: The product line was removed from this branch.
`,
  keyPoints: [
    'securedBy on a resource applies to each of its methods that has no securedBy of its own.',
    'A method with its own securedBy replaces the resource value. The scopes are not added together.',
    'A resource value does not reach nested resources, so each resource states its own.',
    'describedBy holds the Authorization header, the 401 and the 403 once for every secured method.',
    'A 401 means the token is missing or bad. A 403 means the token is fine but lacks the scope.',
  ],
  solution: `
The read scope sits on each resource, so the two GET methods get it without repeating it. The PATCH and the DELETE state their own \`securedBy\`, which replaces the resource value. That is why the PATCH needs only \`stock:write\` and not \`stock:read\` as well.

\`/{sku}\` has its own \`securedBy\` line. Without it, the GET on a single SKU would have no security at all, because a resource value never flows down to nested resources. This is a common gap in real contracts.

The 401 and 403 live in \`describedBy\`. The till that sends an expired token gets a 401 and fetches a new one. The till that tries a PATCH gets a 403, and no retry will help.
`,
  followUps: [
    {
      q: 'Why give the till client only stock:read?',
      a: 'A till token sits on hundreds of shop devices, so it is the token most likely to leak. With only the read scope, a stolen token can see stock but never change it.',
    },
    {
      q: 'Where are the scopes checked at runtime?',
      a: 'An OAuth 2.0 token enforcement policy in API Manager, or the application, checks them. The policy validates the token and compares its scopes with what the method needs.',
    },
    {
      q: 'Why can a 403 not be fixed by a retry?',
      a: 'The token is valid, but the client was never granted that scope. Only a change to the client registration in the identity provider can fix it.',
    },
    {
      q: 'What would happen if /{sku} had no securedBy and the API had no default?',
      a: 'The GET on one SKU would be documented as public. A gateway policy might still block it, but the contract would tell callers the wrong thing.',
    },
  ],
}

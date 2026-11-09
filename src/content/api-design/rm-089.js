export default {
  id: 'rm-089',
  category: 'api-design',
  title: 'Returns API: A ResourceType Fragment That Carries Its Scopes as Parameters',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'resource-types', 'fragments', 'include', 'security', 'scopes', 'retail'],
  estMinutes: 35,
  description: `
A fashion retailer handles 9,000 returns a day. The Returns API has two collections today, \`/returns\` and \`/refunds\`, and three more are planned. Every collection works the same way: a paged list, and a POST that adds an item. Only the scopes differ. Store staff may read refunds, but only the finance team may approve one.

A **resource type** can carry \`securedBy\` like any method, and its scopes can be parameters. Each resource then passes its own scope names, so the shape is written once and the permissions stay per resource.

The resource type and the paging trait move into fragments: \`#%RAML 1.0 ResourceType\` and \`#%RAML 1.0 Trait\`. A fragment can use the traits, types and schemes of the API that includes it. \`<<itemType>>[]\` inside a resource type becomes, for example, \`Refund[]\`.

This problem has three files. Use the tabs above the editor to move between them.

**Requirements**
- \`traits/paged.raml\` is a Trait fragment. It adds an optional integer query parameter \`page\` of at least 1, and an optional integer \`pageSize\` from 1 to 100.
- \`resource-types/secured-collection.raml\` is a ResourceType fragment with the parameters \`itemType\`, \`readScope\` and \`writeScope\`:
  - \`get\` uses \`paged\`, needs \`oauth2\` with \`<<readScope>>\`, and returns \`<<itemType>>[]\` with status 200.
  - \`post\` needs \`oauth2\` with \`<<writeScope>>\`, takes an \`<<itemType>>\` and returns it with status 201.
- \`api.raml\` has the title \`Returns API\`, with JSON as the default media type. It declares the trait \`paged\` and the resource type \`securedCollection\` with \`!include\`.
- A security scheme \`oauth2\` of type \`OAuth 2.0\`, with \`accessTokenUri\` \`https://auth.example.com/token\`, the grant \`client_credentials\`, and exactly the scopes \`returns:read\`, \`returns:write\`, \`refunds:read\` and \`refunds:approve\`.
- A type \`ReturnRequest\` with a required string \`orderId\` and a required string \`reason\`.
- A type \`Refund\` with a required string \`returnId\` and a required number \`amount\` of at least 0.01.
- \`/returns\` is a \`securedCollection\` of \`ReturnRequest\`, read with \`returns:read\` and written with \`returns:write\`.
- \`/refunds\` is a \`securedCollection\` of \`Refund\`, read with \`refunds:read\` and written with \`refunds:approve\`.
- Neither resource writes \`securedBy\` by hand. It comes from the resource type.
`,
  starter: `#%RAML 1.0
title: Returns API
mediaType: application/json

securitySchemes:

traits:

resourceTypes:

types:

/returns:

/refunds:
`,
  files: {
    'traits/paged.raml': `#%RAML 1.0 Trait
`,
    'resource-types/secured-collection.raml': `#%RAML 1.0 ResourceType
`,
  },
  ramlChecks: [
    {
      label: 'paged comes from traits/paged.raml',
      rule: {
        type: 'all',
        rules: [
          { type: 'included', file: 'traits/paged.raml' },
          { type: 'trait', name: 'paged' },
        ],
      },
    },
    {
      label: 'securedCollection comes from resource-types/secured-collection.raml',
      rule: {
        type: 'all',
        rules: [
          { type: 'included', file: 'resource-types/secured-collection.raml' },
          { type: 'resourceType', name: 'securedCollection', has: ['get', 'post'] },
        ],
      },
    },
    {
      label: 'oauth2 is OAuth 2.0 with exactly the four scopes',
      rule: {
        type: 'scheme',
        name: 'oauth2',
        schemeType: 'OAuth 2.0',
        values: {
          'settings.accessTokenUri': 'https://auth.example.com/token',
          'settings.authorizationGrants': ['client_credentials'],
          'settings.scopes': { exactly: ['returns:read', 'returns:write', 'refunds:read', 'refunds:approve'] },
        },
      },
    },
    {
      label: 'GET /returns uses paged, so page and pageSize are optional with their limits',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/returns', method: 'get', trait: 'paged' },
          { type: 'param', path: '/returns', method: 'get', in: 'query', name: 'page', want: { type: 'integer', required: false, minimum: 1 } },
          { type: 'param', path: '/returns', method: 'get', in: 'query', name: 'pageSize', want: { type: 'integer', required: false, minimum: 1, maximum: 100 } },
        ],
      },
    },
    {
      label: 'ReturnRequest has an orderId, and Refund has a returnId and an amount of at least 0.01',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'ReturnRequest', prop: 'orderId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Refund', prop: 'returnId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Refund', prop: 'amount', want: { type: 'number', required: true, minimum: 0.01 } },
        ],
      },
    },
    {
      label: 'Both resources are securedCollection, and securedBy comes from it',
      rule: {
        type: 'all',
        rules: [
          { type: 'typed', path: '/returns', resourceType: 'securedCollection', provides: ['get.securedBy', 'post.securedBy'] },
          { type: 'typed', path: '/refunds', resourceType: 'securedCollection', provides: ['get.securedBy', 'post.securedBy'] },
        ],
      },
    },
    {
      label: 'GET /returns returns ReturnRequest[] and POST /returns takes a ReturnRequest and returns 201',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/returns', method: 'get', status: '200', typeIs: 'ReturnRequest[]' },
          { type: 'body', path: '/returns', method: 'post', typeIs: 'ReturnRequest' },
          { type: 'response', path: '/returns', method: 'post', status: '201', typeIs: 'ReturnRequest' },
        ],
      },
    },
    {
      label: 'GET /refunds returns Refund[] and POST /refunds takes a Refund',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/refunds', method: 'get', status: '200', typeIs: 'Refund[]' },
          { type: 'body', path: '/refunds', method: 'post', typeIs: 'Refund' },
          { type: 'response', path: '/refunds', method: 'post', status: '201' },
        ],
      },
    },
    {
      label: '/returns is read with returns:read and written with returns:write',
      rule: {
        type: 'all',
        rules: [
          { type: 'secured', path: '/returns', method: 'get', scheme: 'oauth2', scopes: ['returns:read'], onlyScopes: true, required: true },
          { type: 'secured', path: '/returns', method: 'post', scheme: 'oauth2', scopes: ['returns:write'], onlyScopes: true, required: true },
        ],
      },
    },
    {
      label: '/refunds is read with refunds:read and written with refunds:approve',
      rule: {
        type: 'all',
        rules: [
          { type: 'secured', path: '/refunds', method: 'get', scheme: 'oauth2', scopes: ['refunds:read'], onlyScopes: true, required: true },
          { type: 'secured', path: '/refunds', method: 'post', scheme: 'oauth2', scopes: ['refunds:approve'], onlyScopes: true, required: true },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Returns API
mediaType: application/json

securitySchemes:
  oauth2:
    type: OAuth 2.0
    describedBy:
      responses:
        401:
          description: The token is missing, wrong or expired.
        403:
          description: The token does not hold the scope this method needs.
    settings:
      accessTokenUri: https://auth.example.com/token
      authorizationGrants: [ client_credentials ]
      scopes: [ returns:read, returns:write, refunds:read, refunds:approve ]

traits:
  paged: !include traits/paged.raml

resourceTypes:
  securedCollection: !include resource-types/secured-collection.raml

types:
  ReturnRequest:
    type: object
    properties:
      orderId: string
      reason: string
  Refund:
    type: object
    properties:
      returnId: string
      amount:
        type: number
        minimum: 0.01

/returns:
  type:
    securedCollection:
      itemType: ReturnRequest
      readScope: returns:read
      writeScope: returns:write

/refunds:
  type:
    securedCollection:
      itemType: Refund
      readScope: refunds:read
      writeScope: refunds:approve
`,
  referenceFiles: {
    'traits/paged.raml': `#%RAML 1.0 Trait
usage: Apply to any list that can grow without limit.
queryParameters:
  page?:
    type: integer
    minimum: 1
    default: 1
  pageSize?:
    type: integer
    minimum: 1
    maximum: 100
    default: 25
`,
    'resource-types/secured-collection.raml': `#%RAML 1.0 ResourceType
usage: A collection of <<itemType>> items. Pass the scope names for reading and for adding.
get:
  is: [ paged ]
  securedBy: [ oauth2: { scopes: [ <<readScope>> ] } ]
  responses:
    200:
      body:
        type: <<itemType>>[]
post:
  securedBy: [ oauth2: { scopes: [ <<writeScope>> ] } ]
  body:
    type: <<itemType>>
  responses:
    201:
      body:
        type: <<itemType>>
`,
  },
  keyPoints: [
    'A ResourceType fragment holds one resource type, and the key under resourceTypes names it.',
    'securedBy inside a resource type can take its scopes from parameters.',
    'A fragment can use the traits, types and schemes declared in the API that includes it.',
    'Parameters keep the shape shared and the permissions per resource.',
    'A value written on the resource itself would win over the resource type, so leave securedBy out there.',
  ],
  solution: `
The resource type holds everything the collections share: paging, the two methods, the bodies and the security. The only differences are three words, and each resource passes them as parameters.

So \`/refunds\` gets \`refunds:approve\` on its POST, and \`/returns\` gets \`returns:write\`. A shop till token with \`refunds:read\` can list refunds, but the 403 stops it approving one.

The three planned collections each add five lines. Their security is right from the first commit, because nobody has to remember to write it.

Keep \`securedBy\` off the resources. A value written there would replace what the resource type gives, and the shared rule would quietly stop applying.
`,
  followUps: [
    {
      q: 'Why not hard-code one scope such as returns:write in the resource type?',
      a: 'Every collection would then share one permission. Store staff who may create returns could also approve refunds, which finance must control.',
    },
    {
      q: 'How does the fragment know the trait paged and the scheme oauth2?',
      a: 'An included fragment is read as part of the API that includes it. Names declared in that API, such as paged and oauth2, are visible inside it.',
    },
    {
      q: 'When would you make a method optional in a resource type, as in post?',
      a: 'When some collections are read only. With post? the method appears only on resources that also write post themselves.',
    },
    {
      q: 'What does a reviewer check when a new collection is added?',
      a: 'The three parameters on the resource, and that the scope names exist in the scheme settings. The rest comes from the reviewed fragment.',
    },
  ],
}

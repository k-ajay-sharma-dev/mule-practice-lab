export default {
  id: 'rm-088',
  category: 'api-design',
  title: 'Fleet Telematics API: Security Schemes in SecurityScheme Fragments',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'security', 'fragments', 'include', 'oauth2', 'client-id-enforcement', 'logistics'],
  estMinutes: 30,
  description: `
A haulage firm tracks 3,800 trucks. Customers read vehicle positions with the client id their app received in Exchange. The firm's own dispatch tool sends new jobs to drivers, and it uses OAuth 2.0 tokens with the scope \`dispatch:write\`.

The security team owns the two security schemes and wants to review them without reading the whole API. So each scheme moves into its own **SecurityScheme fragment**, a file whose first line is \`#%RAML 1.0 SecurityScheme\`. The API brings each one in with \`!include\` under \`securitySchemes\`. The fragment holds the content of the scheme, and the name comes from the key in the API.

This problem has three files. Use the tabs above the editor to move between them.

**Requirements**
- \`security/oauth2.raml\` is a SecurityScheme fragment of type \`OAuth 2.0\`. Its \`settings\` give \`accessTokenUri\` \`https://auth.example.com/oauth2/token\`, the grant \`client_credentials\` and the scope \`dispatch:write\`. Its \`describedBy\` has a 401 and a 403 response.
- \`security/client-id.raml\` is a SecurityScheme fragment of type \`Pass Through\`. Its \`describedBy\` declares the headers \`client_id\` and \`client_secret\` and a 401 response.
- \`api.raml\` has the title \`Fleet Telematics API\`, with JSON as the default media type. It declares \`oauth2\` and \`clientId\` with \`!include\`.
- The default for the whole API is \`clientId\`.
- A type \`Vehicle\` with a required string \`vehicleId\`, a required number \`latitude\` from -90 to 90 and a required number \`longitude\` from -180 to 180.
- A type \`DispatchOrder\` with a required string \`jobId\` and a required string \`pickupPostcode\`.
- \`GET /vehicles\` returns \`Vehicle[]\` and \`GET /vehicles/{vehicleId}\` returns a \`Vehicle\` or 404. Both use the default.
- \`POST /vehicles/{vehicleId}/dispatch-orders\` takes a \`DispatchOrder\` and returns 201. It needs \`oauth2\` with \`dispatch:write\`.
- \`GET /health\` returns 200 with no credentials.
`,
  starter: `#%RAML 1.0
title: Fleet Telematics API
mediaType: application/json

securitySchemes:

types:

/vehicles:
`,
  files: {
    'security/oauth2.raml': `#%RAML 1.0 SecurityScheme
`,
    'security/client-id.raml': `#%RAML 1.0 SecurityScheme
`,
  },
  ramlChecks: [
    {
      label: 'oauth2 comes from security/oauth2.raml and is OAuth 2.0',
      rule: {
        type: 'all',
        rules: [
          { type: 'included', file: 'security/oauth2.raml' },
          { type: 'scheme', name: 'oauth2', schemeType: 'OAuth 2.0' },
        ],
      },
    },
    {
      label: 'The oauth2 settings give the token URL, client_credentials and dispatch:write',
      rule: {
        type: 'scheme',
        name: 'oauth2',
        values: { 'settings.accessTokenUri': 'https://auth.example.com/oauth2/token', 'settings.authorizationGrants': ['client_credentials'], 'settings.scopes': ['dispatch:write'] },
      },
    },
    { label: 'oauth2 describes a 401 and a 403', rule: { type: 'scheme', name: 'oauth2', has: ['describedBy.responses.401', 'describedBy.responses.403'] } },
    {
      label: 'clientId comes from security/client-id.raml and is Pass Through',
      rule: {
        type: 'all',
        rules: [
          { type: 'included', file: 'security/client-id.raml' },
          { type: 'scheme', name: 'clientId', schemeType: 'Pass Through' },
        ],
      },
    },
    {
      label: 'clientId describes the client_id and client_secret headers and a 401',
      rule: { type: 'scheme', name: 'clientId', has: ['describedBy.headers.client_id', 'describedBy.headers.client_secret', 'describedBy.responses.401'] },
    },
    { label: 'clientId is the default for the whole API', rule: { type: 'root', key: 'securedBy', want: ['clientId'] } },
    {
      label: 'Vehicle has vehicleId, and latitude and longitude with their ranges',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Vehicle', prop: 'vehicleId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Vehicle', prop: 'latitude', want: { type: 'number', required: true, minimum: -90, maximum: 90 } },
          { type: 'prop', typeName: 'Vehicle', prop: 'longitude', want: { type: 'number', required: true, minimum: -180, maximum: 180 } },
        ],
      },
    },
    {
      label: 'GET /vehicles and GET /vehicles/{vehicleId} return vehicles, secured by clientId',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/vehicles', method: 'get', status: '200', typeIs: 'Vehicle[]' },
          { type: 'response', path: '/vehicles/{}', method: 'get', status: '200', typeIs: 'Vehicle' },
          { type: 'response', path: '/vehicles/{}', method: 'get', status: '404' },
          { type: 'secured', path: '/vehicles', method: 'get', scheme: 'clientId', required: true },
          { type: 'secured', path: '/vehicles/{}', method: 'get', scheme: 'clientId', required: true },
        ],
      },
    },
    {
      label: 'POST /vehicles/{vehicleId}/dispatch-orders takes a DispatchOrder and returns 201',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/vehicles/{}/dispatch-orders', method: 'post', typeIs: 'DispatchOrder' },
          { type: 'response', path: '/vehicles/{}/dispatch-orders', method: 'post', status: '201' },
        ],
      },
    },
    {
      label: 'POST /vehicles/{vehicleId}/dispatch-orders needs oauth2 with dispatch:write',
      rule: { type: 'secured', path: '/vehicles/{}/dispatch-orders', method: 'post', scheme: 'oauth2', scopes: ['dispatch:write'], required: true },
    },
    {
      label: 'GET /health returns 200 with no credentials',
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
title: Fleet Telematics API
mediaType: application/json

securitySchemes:
  oauth2: !include security/oauth2.raml
  clientId: !include security/client-id.raml

securedBy: [ clientId ]

types:
  Vehicle:
    type: object
    properties:
      vehicleId: string
      latitude:
        type: number
        minimum: -90
        maximum: 90
      longitude:
        type: number
        minimum: -180
        maximum: 180
  DispatchOrder:
    type: object
    properties:
      jobId: string
      pickupPostcode: string

/vehicles:
  get:
    responses:
      200:
        body:
          type: Vehicle[]
  /{vehicleId}:
    get:
      responses:
        200:
          body:
            type: Vehicle
        404:
          description: No truck has this id.
    /dispatch-orders:
      post:
        securedBy: [ oauth2: { scopes: [ dispatch:write ] } ]
        body:
          type: DispatchOrder
        responses:
          201:
            description: The job was sent to the driver's cab unit.

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
description: Tokens for the firm's own dispatch tool.
describedBy:
  headers:
    Authorization:
      type: string
  responses:
    401:
      description: The token is missing, wrong or expired.
    403:
      description: The token does not hold dispatch:write.
settings:
  accessTokenUri: https://auth.example.com/oauth2/token
  authorizationGrants: [ client_credentials ]
  scopes: [ dispatch:write ]
`,
    'security/client-id.raml': `#%RAML 1.0 SecurityScheme
type: Pass Through
description: The client id and secret a customer app received in Exchange.
describedBy:
  headers:
    client_id:
      type: string
    client_secret:
      type: string
  responses:
    401:
      description: The client id or client secret is missing or wrong.
`,
  },
  keyPoints: [
    'A SecurityScheme fragment starts with #%RAML 1.0 SecurityScheme and holds one scheme.',
    'The fragment has no name of its own. The key under securitySchemes names it.',
    'A fragment of the wrong kind under securitySchemes is an error.',
    'Separate files let the security team own and review the schemes on their own.',
    'A method can replace the API default with a different scheme, or with null.',
  ],
  solution: `
\`api.raml\` lists two names and two files under \`securitySchemes\`. The security team changes \`security/oauth2.raml\` when the token URL moves, and nobody else has to touch the API file.

Reads use the \`clientId\` default, because customers only have a client id. The dispatch method states \`oauth2\` with \`dispatch:write\`, which replaces the default. A customer's client id can never send a job to a driver.

The health check states \`securedBy: [ null ]\`, so it is the only open method.

These fragments can also be published to Exchange on their own. Other APIs then include the same files, and a change reaches all of them in their next version.
`,
  followUps: [
    {
      q: 'When would you use a library for schemes in place of SecurityScheme fragments?',
      a: 'A library fits when you share several schemes, types and traits together under one prefix. A fragment fits when one scheme is the unit a team owns and reviews.',
    },
    {
      q: 'What happens if security/oauth2.raml starts with #%RAML 1.0 Trait?',
      a: 'The parser rejects it, because a place under securitySchemes needs a SecurityScheme fragment. The mistake shows up in the editor at once.',
    },
    {
      q: 'How do the two schemes map to policies in API Manager?',
      a: 'The client ID enforcement policy covers the read resources. An OAuth 2.0 token enforcement policy with the dispatch:write scope covers the dispatch resource.',
    },
  ],
}

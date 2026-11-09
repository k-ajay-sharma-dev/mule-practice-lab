export default {
  id: 'rm-084',
  category: 'api-design',
  title: 'Partner FX Rates API: Client Credentials by Default, a Public Health Check',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'security', 'client-id-enforcement', 'securedBy', 'rate-limiting', 'banking'],
  estMinutes: 20,
  description: `
A bank sells foreign exchange rates to 60 partner firms. Each partner registers a client app in Exchange and calls the API with its \`client_id\` and \`client_secret\`. API Manager applies a client ID enforcement policy and an SLA based rate limit: Gold partners get 1,000 calls a minute, Silver partners get 100.

The partners' monitoring tools also call a health check every 30 seconds. Those tools have no credentials, so the health check must stay open.

A scheme of type \`Pass Through\` documents credentials that the gateway reads from headers or query parameters. \`securedBy\` at the top of the file is the default for every method. A method can replace it with \`securedBy: [ null ]\`, which means no security at all.

When a partner goes over its limit, the gateway answers 429 with a \`Retry-After\` header. That can happen on any secured call, so it belongs in the scheme's \`describedBy\` next to the 401.

**Requirements**
- Title \`Partner FX Rates API\`, with JSON as the default media type.
- A security scheme \`clientId\` of type \`Pass Through\`.
- Its \`describedBy\` declares the headers \`client_id\` and \`client_secret\`, a 401 response, and a 429 response with a \`Retry-After\` header.
- The default for the whole API is \`clientId\`.
- A type \`CurrencyCode\`: a string of three capital letters, such as \`EUR\`.
- A type \`Rate\` with a required \`base\` and a required \`quote\`, both \`CurrencyCode\`, a required number \`mid\`, and a required datetime \`asOf\`.
- \`GET /rates\` returns \`Rate[]\` with status 200 and needs the partner credentials.
- \`GET /rates/{currency}\` returns a \`Rate\` with status 200, or 404. The URI parameter \`currency\` is a \`CurrencyCode\`. It needs the partner credentials.
- \`GET /health\` returns 200 and works with no credentials.
`,
  starter: `#%RAML 1.0
title: Partner FX Rates API
mediaType: application/json

securitySchemes:

types:

/rates:

/health:
`,
  ramlChecks: [
    { label: 'clientId is a Pass Through scheme', rule: { type: 'scheme', name: 'clientId', schemeType: 'Pass Through' } },
    { label: 'describedBy declares the client_id and client_secret headers', rule: { type: 'scheme', name: 'clientId', has: ['describedBy.headers.client_id', 'describedBy.headers.client_secret'] } },
    { label: 'describedBy has a 401 response', rule: { type: 'scheme', name: 'clientId', has: 'describedBy.responses.401' } },
    { label: 'describedBy has a 429 response with a Retry-After header', rule: { type: 'scheme', name: 'clientId', has: 'describedBy.responses.429.headers.Retry-After' } },
    { label: 'clientId is the default for the whole API', rule: { type: 'root', key: 'securedBy', want: ['clientId'] } },
    {
      label: 'CurrencyCode accepts three capital letters only',
      rule: { type: 'typeDecl', name: 'CurrencyCode', want: { type: 'string', pattern: { accepts: ['EUR', 'GBP'], rejects: ['eur', 'EURO', 'EU', 'E1R'] } } },
    },
    {
      label: 'Rate has base and quote as CurrencyCode, a number mid and a datetime asOf',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Rate', prop: 'base', want: { type: 'CurrencyCode', required: true } },
          { type: 'prop', typeName: 'Rate', prop: 'quote', want: { type: 'CurrencyCode', required: true } },
          { type: 'prop', typeName: 'Rate', prop: 'mid', want: { type: 'number', required: true } },
          { type: 'prop', typeName: 'Rate', prop: 'asOf', want: { type: 'datetime', required: true } },
        ],
      },
    },
    {
      label: 'GET /rates returns Rate[] and needs the partner credentials',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/rates', method: 'get', status: '200', typeIs: 'Rate[]' },
          { type: 'secured', path: '/rates', method: 'get', scheme: 'clientId', required: true },
        ],
      },
    },
    {
      label: 'GET /rates/{currency} returns a Rate or 404, and needs the partner credentials',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/rates/{}', method: 'get', status: '200', typeIs: 'Rate' },
          { type: 'response', path: '/rates/{}', method: 'get', status: '404' },
          { type: 'secured', path: '/rates/{}', method: 'get', scheme: 'clientId', required: true },
        ],
      },
    },
    { label: 'The currency URI parameter is a CurrencyCode', rule: { type: 'param', path: '/rates/{}', in: 'uri', want: { type: 'CurrencyCode' } } },
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
title: Partner FX Rates API
mediaType: application/json

securitySchemes:
  clientId:
    type: Pass Through
    description: The credentials of the partner's client app, checked by the client ID enforcement policy.
    describedBy:
      headers:
        client_id:
          type: string
        client_secret:
          type: string
      responses:
        401:
          description: The client id or client secret is missing or wrong.
        429:
          description: The partner has used up the calls its SLA tier allows this minute.
          headers:
            Retry-After:
              type: integer
              description: Seconds to wait before the next call.

securedBy: [ clientId ]

types:
  CurrencyCode:
    type: string
    pattern: ^[A-Z]{3}$
  Rate:
    type: object
    properties:
      base: CurrencyCode
      quote: CurrencyCode
      mid: number
      asOf: datetime
    example:
      base: GBP
      quote: EUR
      mid: 1.1734
      asOf: 2026-11-09T10:15:00Z

/rates:
  get:
    responses:
      200:
        body:
          type: Rate[]
  /{currency}:
    uriParameters:
      currency: CurrencyCode
    get:
      responses:
        200:
          body:
            type: Rate
        404:
          description: The bank does not quote this currency.

/health:
  get:
    securedBy: [ null ]
    responses:
      200:
        description: The API and its rate feed are up.
`,
  keyPoints: [
    'Pass Through documents credentials that the gateway reads, here client_id and client_secret.',
    'securedBy at the top of the file is the default, so a new method is closed unless someone opens it.',
    'securedBy: [ null ] on one method makes that method public.',
    'A 429 can happen on any secured call, so it sits in describedBy with a Retry-After header.',
    'A named type with a pattern keeps the same rule on the URI parameter and on the body fields.',
  ],
  solution: `
The default \`securedBy: [ clientId ]\` closes every method, including any added later. The health check is the one exception, and it says so with \`securedBy: [ null ]\`. A reviewer sees every public method by searching for \`null\`.

The 401 and the 429 are in \`describedBy\` because the gateway can send them on any call. \`Retry-After\` tells a partner how long to wait, so a well behaved client backs off and does not hammer the API.

\`CurrencyCode\` is declared once. The URI parameter and both fields of \`Rate\` use it, so \`eur\` or \`EURO\` is refused in every place.
`,
  followUps: [
    {
      q: 'Does securedBy: [ null ] on /health stop the gateway from checking credentials there?',
      a: 'No. The contract only documents it. In API Manager the client ID enforcement policy must be limited to chosen resources, or the health check gets a 401.',
    },
    {
      q: 'Why send client_id and client_secret in headers and not query parameters?',
      a: 'Query strings end up in access logs, proxy logs and browser history. Headers are less likely to be stored, so the secret leaks less often.',
    },
    {
      q: 'How do Gold and Silver partners get different limits?',
      a: 'Each SLA tier in API Manager has its own limit, and a partner app is approved for one tier. An SLA based rate limiting policy reads the client id to find the tier.',
    },
    {
      q: 'Why make the security default closed and not open?',
      a: 'A developer who adds a method and forgets securedBy then gets a secured method. With an open default, the same mistake would publish an open endpoint.',
    },
  ],
}

export default {
  id: 'rm-066',
  category: 'api-design',
  title: 'FX Rates API: Request Headers and Response Headers',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'headers', 'uri-parameters', 'caching', 'banking'],
  estMinutes: 12,
  description: `
A retail bank shows foreign exchange rates in its mobile app, on its website and on branch screens. Rates change every 30 seconds, and about 2 million rate requests arrive each day.

Headers carry data about a request or a response, not the business data itself. In RAML:
- **request headers** go under \`headers\` on the method, next to \`queryParameters\`,
- **response headers** go under \`headers\` inside one response, next to \`body\`.

The bank wants every caller to say which channel it is, so rates can be priced per channel. That is a required request header called \`X-Channel\`. In the response, \`Cache-Control\` tells the app how long it may reuse a rate, and \`X-Rate-Valid-Until\` says when the quoted rate stops being honoured.

A currency pair in the URL looks like \`GBP-EUR\`: three capital letters, a hyphen, three capital letters.

**Requirements**
- A type \`FxRate\` with:
  - \`base\` and \`quote\`: required strings of exactly three capital letters.
  - \`rate\`: required number, at least 0.
  - \`validUntil\`: required date and time with a time zone.
- \`GET /fx-rates/{pair}\` returns an \`FxRate\` with 200.
- \`pair\` is a string such as \`GBP-EUR\`.
- The method has a required request header \`X-Channel\` that allows only \`app\`, \`web\` and \`branch\`.
- The 200 response has the headers \`Cache-Control\` and \`X-Rate-Valid-Until\`.
- It returns 400 when \`X-Channel\` is missing or wrong, and 404 for a pair the bank does not trade.
`,
  starter: `#%RAML 1.0
title: FX Rates API
mediaType: application/json

types:
  FxRate:
    type: object
    properties:
      rate: number

/fx-rates:
  /{pair}:
    get:
      responses:
        200:
          body:
            type: FxRate
`,
  ramlChecks: [
    {
      label: 'base and quote are strings of three capital letters',
      rule: {
        type: 'all',
        rules: ['base', 'quote'].map((prop) => ({ type: 'prop', typeName: 'FxRate', prop, want: { type: 'string', required: true, pattern: { accepts: ['GBP', 'EUR'], rejects: ['gbp', 'GB', 'GBPX'] } } })),
      },
    },
    {
      label: 'rate is a number of at least 0 and validUntil is a datetime',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'FxRate', prop: 'rate', want: { type: 'number', required: true, minimum: 0 } },
          { type: 'prop', typeName: 'FxRate', prop: 'validUntil', want: { type: 'datetime', required: true } },
        ],
      },
    },
    {
      label: 'pair is a string such as GBP-EUR',
      rule: { type: 'param', path: '/fx-rates/{}', in: 'uri', name: 'pair', want: { type: 'string', pattern: { accepts: ['GBP-EUR', 'USD-JPY'], rejects: ['GBPEUR', 'gbp-eur', 'GBP-EURO', 'GB-EUR'] } } },
    },
    {
      label: 'X-Channel is a required request header of app, web or branch',
      rule: { type: 'param', path: '/fx-rates/{}', method: 'get', in: 'header', name: 'X-Channel', want: { required: true, enum: { exactly: ['app', 'web', 'branch'] } } },
    },
    { label: 'The 200 response has a Cache-Control header', rule: { type: 'response', path: '/fx-rates/{}', method: 'get', status: '200', typeIs: 'FxRate', header: 'Cache-Control' } },
    { label: 'The 200 response has an X-Rate-Valid-Until header', rule: { type: 'response', path: '/fx-rates/{}', method: 'get', status: '200', header: 'X-Rate-Valid-Until' } },
    {
      label: 'GET returns 400 for a bad channel and 404 for an unknown pair',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/fx-rates/{}', method: 'get', status: '400' },
          { type: 'response', path: '/fx-rates/{}', method: 'get', status: '404' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: FX Rates API
mediaType: application/json

types:
  CurrencyCode:
    type: string
    pattern: ^[A-Z]{3}$
  FxRate:
    type: object
    properties:
      base: CurrencyCode
      quote: CurrencyCode
      rate:
        type: number
        minimum: 0
      validUntil: datetime
    example:
      base: GBP
      quote: EUR
      rate: 1.1687
      validUntil: 2026-11-09T10:15:30Z

/fx-rates:
  /{pair}:
    uriParameters:
      pair:
        type: string
        pattern: ^[A-Z]{3}-[A-Z]{3}$
    get:
      headers:
        X-Channel:
          type: string
          enum: [ app, web, branch ]
          example: app
      responses:
        200:
          headers:
            Cache-Control:
              type: string
              example: max-age=30
            X-Rate-Valid-Until:
              type: datetime
              example: 2026-11-09T10:15:30Z
          body:
            type: FxRate
        400:
          description: X-Channel is missing or not one of app, web or branch.
        404:
          description: The bank does not trade this currency pair.
`,
  keyPoints: [
    'Request headers go under headers on the method. Response headers go under headers inside one response.',
    'A header is required unless its name ends in ? or it has required: false.',
    'Header names are not case sensitive in HTTP, so X-Channel and x-channel are the same header.',
    'Cache-Control: max-age=30 lets the app reuse a rate for 30 seconds without asking again.',
    'Headers take the same types and facets as query parameters, such as enum and pattern.',
  ],
  solution: `
\`X-Channel\` describes who is calling, not what they want, so it is a header rather than a query parameter. It sits under \`headers\` on \`get\`, has no \`?\`, and has an enum so an unknown channel gets a 400 from APIkit.

The two response headers sit inside the 200 response, because only a successful rate has a lifetime. \`Cache-Control: max-age=30\` matches the 30 second refresh, which cuts repeated calls from apps that redraw the screen. \`X-Rate-Valid-Until\` repeats \`validUntil\` from the body so a cache or gateway can read it without parsing JSON.

\`CurrencyCode\` is a named type used twice, so \`base\` and \`quote\` cannot drift apart.
`,
  followUps: [
    {
      q: 'Why is X-Channel a header and not a query parameter?',
      a: 'It describes the caller rather than the data asked for. A header also keeps the URL the same for every channel, which helps caching.',
    },
    {
      q: 'How do you read a request header in a Mule flow?',
      a: 'Use attributes.headers in DataWeave, with the name in lower case, such as attributes.headers."x-channel".',
    },
    {
      q: 'Should X-Channel be trusted for pricing?',
      a: 'Not on its own, because a caller can set any header. Tie the channel to the client id in API Manager, and use the header only to confirm it.',
    },
    {
      q: 'Is the X- prefix still recommended for custom headers?',
      a: 'RFC 6648 discourages it for new headers. Many organisations still use it out of habit, so follow your API standards.',
    },
  ],
}

export default {
  id: 'rm-095',
  category: 'api-design',
  title: 'Parcel Rates API: Move the Major Version into baseUri',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'versioning', 'base-uri', 'protocols', 'logistics'],
  estMinutes: 20,
  description: `
A parcel carrier quotes about 2 million shipping rates a day for 300 online shops. The first draft of the contract writes \`/v1\` at the start of every resource path, sets no \`version\`, and allows plain HTTP. The draft is in the editor.

RAML has a better place for the major version. Set \`version: v1\` at the top, and put the reserved \`{version}\` placeholder at the end of \`baseUri\`. The URL a caller uses stays \`https://api.example.com/parcel-rates/v1/quotes\`, but the version now lives in one place. When v2 ships, one line changes, and the resource tree stays clean. API Manager and Exchange also read the \`version\` field to label the asset.

A quote is a calculation. Nothing is stored, so \`POST /quotes\` answers **200** with the result, not 201.

**Requirements**
- Keep the title \`Parcel Rates API\` and JSON as the default media type.
- Set \`version\` to \`v1\`, and set \`baseUri\` to \`https://api.example.com/parcel-rates/{version}\`.
- Allow HTTPS only.
- No resource path may hold the version, written as \`/v1\` or as a URI parameter.
- A type \`RateRequest\` with required strings \`originPostcode\` and \`destinationPostcode\`, and a required number \`weightKg\` from 0.1 to 30.
- A type \`RateQuote\` with a required \`service\` that is one of \`STANDARD\`, \`EXPRESS\`, a required number \`price\`, and a required integer \`deliveryDays\`.
- A type \`Error\` with required strings \`code\` and \`message\`.
- \`POST /quotes\` takes a \`RateRequest\` and returns 200 with \`RateQuote[]\`, or 400 with an \`Error\`.
- \`GET /services\` returns 200 with \`string[]\`.
`,
  starter: `#%RAML 1.0
title: Parcel Rates API
baseUri: https://api.example.com/parcel-rates
protocols: [ HTTP, HTTPS ]
mediaType: application/json

types:
  RateRequest:
    type: object
    properties:
      originPostcode: string
      destinationPostcode: string
      weightKg: number
  RateQuote:
    type: object
    properties:
      service: string
      price: number
      deliveryDays: integer

/v1:
  /quotes:
    post:
      body:
        type: RateRequest
      responses:
        201:
          body:
            type: RateQuote[]
  /services:
    get:
      responses:
        200:
          body:
            type: string[]
`,
  ramlChecks: [
    {
      label: 'The title is Parcel Rates API and JSON is the default media type',
      rule: {
        type: 'all',
        rules: [
          { type: 'root', key: 'title', want: 'Parcel Rates API' },
          { type: 'root', key: 'mediaType', want: 'application/json' },
        ],
      },
    },
    { label: 'The version is v1', rule: { type: 'root', key: 'version', want: { is: 'v1' } } },
    {
      label: 'baseUri ends with the {version} placeholder',
      rule: { type: 'root', key: 'baseUri', want: 'api.example.com/parcel-rates/{version}' },
    },
    { label: 'Only HTTPS is allowed', rule: { type: 'root', key: 'protocols', want: { exactly: ['HTTPS'] } } },
    {
      label: 'No resource path repeats the version',
      rule: {
        type: 'all',
        rules: [
          { type: 'resource', path: '/quotes' },
          { type: 'resource', path: '/services' },
          { type: 'noResource', path: '/v1' },
          { type: 'noResource', path: '/{}' },
        ],
      },
    },
    {
      label: 'RateRequest has required postcodes and a weightKg from 0.1 to 30',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'RateRequest', prop: 'originPostcode', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'RateRequest', prop: 'destinationPostcode', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'RateRequest', prop: 'weightKg', want: { type: 'number', required: true, minimum: 0.1, maximum: 30 } },
        ],
      },
    },
    { label: 'RateQuote.service only allows STANDARD and EXPRESS', rule: { type: 'prop', typeName: 'RateQuote', prop: 'service', want: { required: true, enum: { exactly: ['STANDARD', 'EXPRESS'] } } } },
    {
      label: 'RateQuote has a required number price and integer deliveryDays',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'RateQuote', prop: 'price', want: { type: 'number', required: true } },
          { type: 'prop', typeName: 'RateQuote', prop: 'deliveryDays', want: { type: 'integer', required: true } },
        ],
      },
    },
    { label: 'POST /quotes takes a RateRequest', rule: { type: 'body', path: '/quotes', method: 'post', typeIs: 'RateRequest' } },
    { label: 'POST /quotes returns 200 with RateQuote[], since nothing is created', rule: { type: 'response', path: '/quotes', method: 'post', status: '200', typeIs: 'RateQuote[]' } },
    {
      label: 'POST /quotes returns 400 with an Error',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Error', prop: 'code', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Error', prop: 'message', want: { type: 'string', required: true } },
          { type: 'response', path: '/quotes', method: 'post', status: '400', typeIs: 'Error' },
        ],
      },
    },
    { label: 'GET /services returns string[]', rule: { type: 'response', path: '/services', method: 'get', status: '200', typeIs: 'string[]' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Parcel Rates API
version: v1
baseUri: https://api.example.com/parcel-rates/{version}
protocols: [ HTTPS ]
mediaType: application/json

types:
  RateRequest:
    type: object
    properties:
      originPostcode: string
      destinationPostcode: string
      weightKg:
        type: number
        minimum: 0.1
        maximum: 30
  RateQuote:
    type: object
    properties:
      service:
        type: string
        enum: [ STANDARD, EXPRESS ]
      price: number
      deliveryDays: integer
  Error:
    type: object
    properties:
      code: string
      message: string

/quotes:
  post:
    body:
      type: RateRequest
    responses:
      200:
        body:
          type: RateQuote[]
      400:
        body:
          type: Error
/services:
  get:
    responses:
      200:
        body:
          type: string[]
`,
  keyPoints: [
    'The major version goes in version, and baseUri refers to it with the reserved {version} placeholder.',
    'Writing /v1 in front of every resource repeats the version and makes the next major release touch every path.',
    'version is a reserved base URI parameter, so it needs no baseUriParameters entry.',
    'protocols: [ HTTPS ] states that plain HTTP is not offered.',
    'A POST that only calculates returns 200. 201 means something was created.',
  ],
  solution: `
The caller sees the same URL as before. The difference is in the contract: the version is a single value, and \`baseUri\` builds the path from it. The resource tree now describes the business, with \`/quotes\` and \`/services\`, and nothing else.

\`protocols: [ HTTPS ]\` removes HTTP from the contract. A rates API carries shop and customer postcodes, so there is no reason to offer an unencrypted channel.

The quote is not saved anywhere, so 201 would be a false promise. A caller that sees 201 may look for a \`Location\` header or a stored quote that does not exist. 200 with the list of options says exactly what happened.
`,
  followUps: [
    {
      q: 'Should the minor version, such as 1.3, go in the URL too?',
      a: 'No. Minor releases are additive and must not break callers, so callers have no reason to choose one. Only the major version belongs in the URL. Track the minor version in Exchange as the asset version.',
    },
    {
      q: 'What are the other common ways to carry an API version?',
      a: 'A custom request header, or a media type parameter in the Accept header. Both keep the URL stable. The URL path is still the most common choice because it is visible in logs and simple for the gateway to route.',
    },
    {
      q: 'How does this baseUri relate to the URL of the Mule application?',
      a: 'The baseUri is what consumers call, usually the API Manager proxy or the published host. The Mule application may listen on another host and path behind a load balancer. APIkit routes on the resource paths, so they must match the RAML.',
    },
    {
      q: 'Why is a quote calculation a POST and not a GET?',
      a: 'The input has several fields and may grow, which fits a body better than a query string. Some teams use GET with query parameters so the result can be cached. Both are defensible if the choice is documented.',
    },
  ],
}

export default {
  id: 'rm-148',
  category: 'api-design',
  title: 'Shipment Orders API: Version the Representation with a Vendor Media Type',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'versioning', 'media-types', 'content-negotiation', 'headers', 'accept', 'logistics'],
  estMinutes: 25,
  description: `
Kelderby Logistics has one Shipment Orders API used by twelve customer systems. Version 1 returns the consignee as a single \`consigneeName\` text. Version 2 splits it into a \`consignee\` object with a company and a contact, which the new customs feed needs.

The URL of a shipment order is printed on labels and stored in customer systems, so the team does not want \`/v2/\` in it. Instead the **caller picks the version with the \`Accept\` header**, using vendor media types:

- \`application/vnd.kelderby.order.v1+json\`
- \`application/vnd.kelderby.order.v2+json\`

**Requirements**
- Title \`Shipment Orders API\`, with JSON as the default media type.
- A type \`OrderV1\` with a required string \`orderId\` and a required string \`consigneeName\`.
- A type \`Consignee\` with a required string \`company\` and an optional string \`contact\`.
- A type \`OrderV2\` with a required string \`orderId\` and a required \`consignee\` of type \`Consignee\`.
- A type \`Problem\` with a required string \`title\` and a required integer \`status\`.
- \`GET /orders/{orderId}\`:
  - takes an optional \`Accept\` request header, a string
  - returns 200 with two bodies: \`OrderV1\` under the v1 media type and \`OrderV2\` under the v2 media type
  - sends a \`Vary\` response header with the 200, so caches keep the versions apart
  - returns a \`Problem\` with 404, and a \`Problem\` with 406 when \`Accept\` names a version that does not exist
`,
  starter: `#%RAML 1.0
title: Shipment Orders API
mediaType: application/json

types:
  Order:
    type: object
    properties:
      orderId: string
      consigneeName: string

/v1/orders/{orderId}:
  get:
    responses:
      200:
        body:
          type: Order
/v2/orders/{orderId}:
  get:
    responses:
      200:
        body:
          type: object
`,
  ramlChecks: [
    {
      label: 'The title is Shipment Orders API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Shipment Orders API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'OrderV1 has orderId and consigneeName',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'OrderV1', prop: 'orderId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'OrderV1', prop: 'consigneeName', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'Consignee has a required company and an optional contact, and OrderV2 holds a Consignee',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Consignee', prop: 'company', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Consignee', prop: 'contact', want: { type: 'string', required: false } },
          { type: 'prop', typeName: 'OrderV2', prop: 'orderId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'OrderV2', prop: 'consignee', want: { type: 'Consignee', required: true } },
        ],
      },
    },
    {
      label: 'Problem has a required title and a required integer status',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Problem', prop: 'title', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Problem', prop: 'status', want: { type: 'integer', required: true } },
        ],
      },
    },
    {
      label: 'There is one resource /orders/{orderId} and no version in the path',
      rule: {
        type: 'all',
        rules: [
          { type: 'method', path: '/orders/{}', method: 'get' },
          { type: 'noResource', path: '/v1/orders/{}' },
          { type: 'noResource', path: '/v2/orders/{}' },
        ],
      },
    },
    {
      label: 'GET /orders/{orderId} takes an optional Accept header',
      rule: { type: 'param', path: '/orders/{}', method: 'get', in: 'header', name: 'Accept', want: { type: 'string', required: false } },
    },
    {
      label: 'The 200 returns OrderV1 under the v1 media type and OrderV2 under the v2 media type',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/orders/{}', method: 'get', status: '200', media: 'application/vnd.kelderby.order.v1+json', typeIs: 'OrderV1' },
          { type: 'response', path: '/orders/{}', method: 'get', status: '200', media: 'application/vnd.kelderby.order.v2+json', typeIs: 'OrderV2' },
        ],
      },
    },
    {
      label: 'The 200 sends a Vary header',
      rule: { type: 'response', path: '/orders/{}', method: 'get', status: '200', header: 'Vary' },
    },
    {
      label: 'GET /orders/{orderId} returns a Problem with 404 and with 406',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/orders/{}', method: 'get', status: '404', typeIs: 'Problem' },
          { type: 'response', path: '/orders/{}', method: 'get', status: '406', typeIs: 'Problem' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Shipment Orders API
baseUri: https://api.example.com/shipment-orders
mediaType: application/json

types:
  OrderV1:
    type: object
    properties:
      orderId: string
      consigneeName: string
    example:
      orderId: KL-2209431
      consigneeName: Harlow Tiles Ltd, attn. M. Okafor
  Consignee:
    type: object
    properties:
      company: string
      contact?: string
  OrderV2:
    type: object
    properties:
      orderId: string
      consignee: Consignee
    example:
      orderId: KL-2209431
      consignee:
        company: Harlow Tiles Ltd
        contact: M. Okafor
  Problem:
    type: object
    properties:
      title: string
      status: integer

/orders/{orderId}:
  get:
    headers:
      Accept:
        type: string
        required: false
        description: Pick a version with application/vnd.kelderby.order.v1+json or application/vnd.kelderby.order.v2+json. Plain application/json gets v1, so old callers keep working.
        example: application/vnd.kelderby.order.v2+json
    responses:
      200:
        headers:
          Vary:
            type: string
            example: Accept
        body:
          application/vnd.kelderby.order.v1+json:
            type: OrderV1
          application/vnd.kelderby.order.v2+json:
            type: OrderV2
      404:
        body:
          type: Problem
      406:
        description: The Accept header names a version this API does not offer.
        body:
          type: Problem
`,
  keyPoints: [
    'Media type versioning keeps one URL per resource and puts the version in the Accept header.',
    'A vendor media type such as application/vnd.kelderby.order.v2+json names the shape and the version.',
    'RAML lists one body per media type under the same response code.',
    'Vary: Accept stops a cache from serving the v1 body to a v2 caller.',
    '406 Not Acceptable answers a request for a version that does not exist.',
    'A default version for plain application/json keeps old callers working.',
  ],
  solution: `
**Same resource, two representations.** A shipment order is one thing with one address. v1 and v2 are two ways of showing it. Putting the version in the media type keeps \`/orders/KL-2209431\` stable on labels and in customer systems.

**Vendor media types.** \`vnd.kelderby.order.v2+json\` says who defined the format, which format, which version, and that it is JSON underneath. The response body in RAML lists each media type with its own type, so the contract shows both shapes side by side.

**Vary.** A cache stores responses by URL. Without \`Vary: Accept\`, a cache could keep the v1 body and give it to a v2 caller for the same URL. \`Vary\` tells caches to include the \`Accept\` header in the key.

**406.** A caller that asks for \`order.v3+json\` gets 406 Not Acceptable, with a Problem that can list the versions on offer. Plain \`application/json\` maps to v1, so the twelve existing systems need no change.

**The trade.** URL versioning shows the version in every log line and works in a browser address bar. Media type versioning keeps URLs stable but hides the version in a header, so the gateway and logs should record \`Accept\` too.
`,
  followUps: [
    {
      q: 'How does the Mule app pick the version?',
      a: 'Read the Accept header from the attributes, choose the v1 or v2 transform with a Choice router, and set the Content-Type of the response to the matching vendor media type.',
    },
    {
      q: 'How do you retire v1 later?',
      a: 'Announce a date, add a Deprecation or Sunset header to v1 responses, and watch the Accept values in the logs until no caller still asks for v1.',
    },
    {
      q: 'A caller sends Accept with both versions and quality values. What happens?',
      a: 'The server should pick the version with the highest quality value it supports. Test this case, because some frameworks only read the first value.',
    },
  ],
}

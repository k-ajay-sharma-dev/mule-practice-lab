export default {
  id: 'rm-002',
  category: 'api-design',
  title: 'Orders API: Reuse Paging and Errors with Traits and a Resource Type',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'traits', 'resource-types', 'data-types', 'orders'],
  estMinutes: 25,
  description: `
Your team has six list endpoints, and each one repeats the same paging parameters and the same error response. A review found three different spellings of \`pageSize\`.

A **trait** holds method-level parts you can reuse, applied with \`is\`. A **resource type** holds a whole resource pattern, applied with \`type\`.

**Requirements**
- Title \`Orders API\`, with JSON as the default media type.
- A type \`Order\` with a required string \`orderId\`, a required number \`total\`, and a required \`status\` that is one of \`NEW\`, \`PAID\`, \`SHIPPED\`.
- \`Order\` has an example that fits it.
- A trait \`paged\` with an optional integer \`page\` (minimum 1) and an optional integer \`pageSize\` (minimum 1, maximum 200).
- A resource type \`collection\` that offers \`get\` and \`post\`.
- \`/orders\` uses \`collection\`. Its \`get\` uses \`paged\` and returns \`Order[]\` with status 200.
- \`POST /orders\` takes an \`Order\` body and returns 201.
- \`GET /orders/{orderId}\` returns an \`Order\`, or 404.
`,
  starter: `#%RAML 1.0
title: Orders API
mediaType: application/json

types:

traits:

resourceTypes:

/orders:
`,
  ramlChecks: [
    { label: 'Order has a required string orderId', rule: { type: 'prop', typeName: 'Order', prop: 'orderId', want: { type: 'string', required: true } } },
    { label: 'Order has a required number total', rule: { type: 'prop', typeName: 'Order', prop: 'total', want: { type: 'number', required: true } } },
    { label: 'status only allows NEW, PAID and SHIPPED', rule: { type: 'prop', typeName: 'Order', prop: 'status', want: { enum: { exactly: ['NEW', 'PAID', 'SHIPPED'] } } } },
    { label: 'Order has an example', rule: { type: 'typeDecl', name: 'Order', want: { example: { set: true } } } },
    {
      label: 'The paged trait has an optional page of at least 1',
      rule: { type: 'param', path: '/orders', method: 'get', in: 'query', name: 'page', want: { type: 'integer', required: false, minimum: 1 } },
    },
    {
      label: 'The paged trait limits pageSize to 200',
      rule: { type: 'param', path: '/orders', method: 'get', in: 'query', name: 'pageSize', want: { type: 'integer', required: false, maximum: 200 } },
    },
    { label: 'GET /orders uses the paged trait', rule: { type: 'applied', path: '/orders', method: 'get', trait: 'paged' } },
    {
      label: 'The collection resource type offers get and post, and /orders uses it',
      rule: {
        type: 'all',
        rules: [
          { type: 'resourceType', name: 'collection' },
          { type: 'typed', path: '/orders', resourceType: 'collection' },
        ],
      },
    },
    { label: 'GET /orders returns Order[]', rule: { type: 'response', path: '/orders', method: 'get', status: '200', typeIs: 'Order[]' } },
    {
      label: 'POST /orders takes an Order and returns 201',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/orders', method: 'post', typeIs: 'Order' },
          { type: 'response', path: '/orders', method: 'post', status: '201' },
        ],
      },
    },
    {
      label: 'GET /orders/{orderId} returns an Order, or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/orders/{}', method: 'get', status: '200', typeIs: 'Order' },
          { type: 'response', path: '/orders/{}', method: 'get', status: '404' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Orders API
mediaType: application/json

types:
  Order:
    type: object
    properties:
      orderId: string
      total: number
      status:
        type: string
        enum: [ NEW, PAID, SHIPPED ]
    example:
      orderId: O-1001
      total: 49.90
      status: NEW

traits:
  paged:
    queryParameters:
      page?:
        type: integer
        minimum: 1
      pageSize?:
        type: integer
        minimum: 1
        maximum: 200

resourceTypes:
  collection:
    get:
      description: List the <<resourcePathName>>.
    post:
      description: Add to the <<resourcePathName>>.

/orders:
  type: collection
  get:
    is: [ paged ]
    responses:
      200:
        body:
          type: Order[]
  post:
    body:
      type: Order
    responses:
      201:
        description: The order was created.
  /{orderId}:
    get:
      responses:
        200:
          body:
            type: Order
        404:
          description: No order has this id.
`,
  keyPoints: [
    'A trait is applied with is on a method or resource. A resource type is applied with type on a resource.',
    'page? means optional. A parameter or property with no question mark is required.',
    'Order[] is a list of Order, the same as type: array with items: Order.',
    '<<resourcePathName>> is filled in when the resource type is applied, here with orders.',
  ],
  solution: `
Paging lives once in \`paged\`, so every list endpoint spells it the same way.

\`collection\` describes what a collection offers. \`<<resourcePathName>>\` is a reserved parameter, so one resource type serves \`/orders\`, \`/customers\` and any other collection.

Anything a method states itself wins over what a trait or resource type gives it.
`,
  followUps: [
    {
      q: 'When would you choose a trait over a resource type?',
      a: 'A trait fits a behaviour shared by methods on different kinds of resource, such as paging. A resource type fits a whole resource pattern, such as a collection with get and post.',
    },
    {
      q: 'How would you share these across several APIs?',
      a: 'Move them to a RAML library, publish it to Exchange as an API fragment, and bring it in with uses. Every API then gets the same definition.',
    },
    {
      q: 'What does a trait do if the method already declares the same parameter?',
      a: 'The two are merged, and what the method states itself wins. This lets one endpoint adjust a shared rule.',
    },
  ],
}

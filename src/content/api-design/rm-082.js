export default {
  id: 'rm-082',
  category: 'api-design',
  title: 'Farm Supply API: Standard Resource Types from a Library',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'libraries', 'resource-types', 'optional-methods', 'errors', 'agriculture'],
  estMinutes: 35,
  description: `
A farming cooperative supplies seed, feed and fertiliser to 5,400 member farms. Its integration team is writing a dozen System and Process APIs this year, and wants every collection and every item to behave the same way: the same paging, the same 201 with \`Location\`, the same 404 with the same error body.

You will put two resource types in a library. They name their data type from the path with \`<<resourcePathName | !singularize | !uppercamelcase>>\`, so \`/farms\` works with \`Farm\` and \`/orders\` with \`Order\`. A name in the library such as \`ApiError\` is looked up in the library, while the filled-in type name is looked up in the API that uses it.

Not every item can be deleted. A farm is never deleted, because its history is needed for audits, but an order can be cancelled. A method written with \`?\` in a resource type, such as \`delete?\`, is **optional**: a resource gets it only when the resource writes \`delete\` itself.

This problem has two files. Use the tabs above the editor to move between them.

**Requirements for \`libraries/resources.raml\`**
- A type \`ApiError\` with a required string \`code\` and a required string \`message\`.
- A trait \`paged\` with an optional integer \`page\` of at least 1 and an optional integer \`pageSize\` from 1 to 200.
- A resource type \`collection\`:
  - \`get\` applies \`paged\` and returns a list of the type named from the path, with status 200.
  - \`post\` takes that type and returns 201 with a \`Location\` header, or 400 with an \`ApiError\` body.
- A resource type \`item\`:
  - \`get\` returns the type named from the path, or 404 with an \`ApiError\` body.
  - an optional \`delete?\` that returns 204.

**Requirements for \`api.raml\`**
- Title \`Farm Supply API\`, with JSON as the default media type, and the library brought in with the prefix \`res\`.
- \`Farm\` with required strings \`farmId\` and \`name\`, and a required number \`hectares\`.
- \`OrderLine\` with a required string \`sku\` and a required integer \`quantity\` of at least 1.
- \`Order\` with required strings \`orderId\` and \`farmId\`, and a required list \`lines\` of \`OrderLine\` with at least 1 item.
- \`/farms\` and \`/orders\` use \`res.collection\`. \`/farms/{farmId}\` and \`/orders/{orderId}\` use \`res.item\`.
- \`DELETE /orders/{orderId}\` exists. \`DELETE /farms/{farmId}\` does not.
`,
  starter: `#%RAML 1.0
title: Farm Supply API
mediaType: application/json

uses:

types:

/farms:
  /{farmId}:

/orders:
  /{orderId}:
`,
  files: {
    'libraries/resources.raml': `#%RAML 1.0 Library
usage: How every collection and item behaves in our APIs.

types:

traits:

resourceTypes:
`,
  },
  ramlChecks: [
    { label: 'The API brings in libraries/resources.raml with the prefix res', rule: { type: 'library', prefix: 'res', file: 'libraries/resources.raml' } },
    {
      label: 'ApiError sits in the library with a required code and message, and not in api.raml',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'res.ApiError', prop: 'code', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'res.ApiError', prop: 'message', want: { type: 'string', required: true } },
          { type: 'noType', name: 'ApiError' },
        ],
      },
    },
    {
      label: '/farms uses res.collection, and its methods come from there',
      rule: { type: 'typed', path: '/farms', resourceType: 'res.collection', provides: ['get.responses.200', 'post.body', 'post.responses.201'] },
    },
    {
      label: 'GET /farms returns Farm[] and uses res.paged with a pageSize up to 200',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/farms', method: 'get', status: '200', typeIs: 'Farm[]' },
          { type: 'applied', path: '/farms', method: 'get', trait: 'res.paged' },
          { type: 'param', path: '/farms', method: 'get', in: 'query', name: 'pageSize', want: { type: 'integer', required: false, minimum: 1, maximum: 200 } },
        ],
      },
    },
    {
      label: 'POST /orders takes an Order and returns 201 with Location, or 400 with res.ApiError',
      rule: {
        type: 'all',
        rules: [
          { type: 'typed', path: '/orders', resourceType: 'res.collection', provides: ['post.body'] },
          { type: 'body', path: '/orders', method: 'post', typeIs: 'Order' },
          { type: 'response', path: '/orders', method: 'post', status: '201', header: 'Location' },
          { type: 'response', path: '/orders', method: 'post', status: '400', typeIs: 'res.ApiError' },
        ],
      },
    },
    {
      label: '/orders/{orderId} uses res.item and returns an Order, or 404 with res.ApiError',
      rule: {
        type: 'all',
        rules: [
          { type: 'typed', path: '/orders/{}', resourceType: 'res.item', provides: ['get.responses.200', 'get.responses.404'] },
          { type: 'response', path: '/orders/{}', method: 'get', status: '200', typeIs: 'Order' },
          { type: 'response', path: '/orders/{}', method: 'get', status: '404', typeIs: 'res.ApiError' },
        ],
      },
    },
    {
      label: '/farms/{farmId} uses res.item and returns a Farm',
      rule: {
        type: 'all',
        rules: [
          { type: 'typed', path: '/farms/{}', resourceType: 'res.item', provides: ['get.responses.200'] },
          { type: 'response', path: '/farms/{}', method: 'get', status: '200', typeIs: 'Farm' },
        ],
      },
    },
    {
      label: 'DELETE /orders/{orderId} returns 204 from the resource type',
      rule: {
        type: 'all',
        rules: [
          { type: 'typed', path: '/orders/{}', resourceType: 'res.item', provides: ['delete.responses.204'] },
          { type: 'response', path: '/orders/{}', method: 'delete', status: '204', noBody: true },
        ],
      },
    },
    {
      label: 'DELETE /farms/{farmId} is not offered',
      rule: {
        type: 'all',
        rules: [
          { type: 'method', path: '/farms/{}', method: 'get' },
          { type: 'noMethod', path: '/farms/{}', method: 'delete' },
        ],
      },
    },
    { label: 'Order.lines is a required list of OrderLine with at least 1 item', rule: { type: 'prop', typeName: 'Order', prop: 'lines', want: { type: 'OrderLine[]', required: true, minItems: 1 } } },
    { label: 'OrderLine.quantity is a required integer of at least 1', rule: { type: 'prop', typeName: 'OrderLine', prop: 'quantity', want: { type: 'integer', required: true, minimum: 1 } } },
  ],
  referenceRaml: `#%RAML 1.0
title: Farm Supply API
mediaType: application/json

uses:
  res: libraries/resources.raml

types:
  Farm:
    type: object
    properties:
      farmId: string
      name: string
      hectares: number
  OrderLine:
    type: object
    properties:
      sku: string
      quantity:
        type: integer
        minimum: 1
  Order:
    type: object
    properties:
      orderId: string
      farmId: string
      lines:
        type: OrderLine[]
        minItems: 1

/farms:
  type: res.collection
  /{farmId}:
    type: res.item

/orders:
  type: res.collection
  /{orderId}:
    type: res.item
    delete:
      description: Cancel an order that has not been dispatched.
`,
  referenceFiles: {
    'libraries/resources.raml': `#%RAML 1.0 Library
usage: How every collection and item behaves in our APIs.

types:
  ApiError:
    type: object
    properties:
      code: string
      message: string

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
    usage: A list of <<resourcePathName>> that callers can page through and add to.
    get:
      is: [ paged ]
      responses:
        200:
          body:
            type: <<resourcePathName | !singularize | !uppercamelcase>>[]
    post:
      body:
        type: <<resourcePathName | !singularize | !uppercamelcase>>
      responses:
        201:
          headers:
            Location:
              type: string
              description: The URL of the new <<resourcePathName | !singularize>>.
        400:
          body:
            type: ApiError
  item:
    usage: One member of a collection. Write delete on the resource to offer it.
    get:
      responses:
        200:
          body:
            type: <<resourcePathName | !singularize | !uppercamelcase>>
        404:
          body:
            type: ApiError
    delete?:
      responses:
        204:
          description: The <<resourcePathName | !singularize>> was removed.
`,
  },
  keyPoints: [
    'A resource type in a library is used with its prefix, such as type: res.collection.',
    'Plain names in the library, such as ApiError and paged, resolve inside the library.',
    'A type named from <<resourcePathName>> is resolved in the API that uses the resource type.',
    'A method ending in ? in a resource type appears only where the resource writes that method.',
    'A trait applied inside a resource type reaches every resource of that type.',
  ],
  solution: `
\`api.raml\` is now short: three types and four resources. How a collection and an item behave is set once in the library, and every API of the cooperative will behave the same.

Two kinds of name meet in the resource types. \`ApiError\` and \`paged\` are written in the library, so they are found there. \`<<resourcePathName | !singularize | !uppercamelcase>>\` becomes \`Farm\` or \`Order\` at the API, so it is found among the API's own types. This is why the library can stay free of any business type.

\`delete?\` keeps deletion off by default. \`/orders/{orderId}\` writes \`delete\` with a description, so it gets the 204 from the resource type. \`/farms/{farmId}\` writes nothing, so farms cannot be deleted, which protects the audit history.

\`lines\` needs at least one \`OrderLine\`, so an order with nothing in it is rejected before it reaches the ERP.
`,
  followUps: [
    {
      q: 'A resource also writes its own is on get. What happens to paged from the resource type?',
      a: 'Both apply. RAML applies the traits from the resource type and the traits on the resource, so check the merged result in Design Center before you publish.',
    },
    {
      q: 'How would you add an extra 409 to POST /orders only?',
      a: 'Write post with a 409 response on /orders. It merges with the post from the resource type, and the other collections stay unchanged.',
    },
    {
      q: 'Why is a soft delete or cancel often better than a real DELETE?',
      a: 'Orders and farms feed invoices, audits and reports. Marking a record cancelled keeps that history, while a hard delete leaves gaps that finance will ask about.',
    },
    {
      q: 'What breaks if someone renames /orders to /purchase-orders?',
      a: 'The resource type would look for a type called PurchaseOrder. Either rename the type as well, or pass the type name as a parameter on that resource.',
    },
  ],
}

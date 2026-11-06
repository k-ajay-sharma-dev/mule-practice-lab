export default {
  id: 'rm-028',
  category: 'api-design',
  title: 'Wholesale Orders API: Redesign a Poor API',
  level: 'EXPERT',
  tags: ['raml', 'api-design', 'rest', 'redesign', 'resources', 'status-codes', 'wholesale'],
  estMinutes: 40,
  description: `
A food wholesaler inherited an orders API, and the draft contract is in the editor. Every path is a verb, every call is a \`POST\`, and reads carry their filter in a body. Every reply is 200, so an error looks like a success until someone reads the body. Caches and API tools get no help from any of this.

In a REST design, a path names a **thing** and the HTTP method says what to do with it. So \`/orders\` is the thing, and \`GET\` reads it. \`GET\` is also **safe**, which means it changes nothing, so clients and caches can repeat it freely.

Redesign the contract. Keep the \`Order\` type as it is.

**Requirements**
- Remove all five verb paths: \`/getOrders\`, \`/getOrderById\`, \`/createOrder\`, \`/updateOrder\`, \`/deleteOrder\`.
- \`GET /orders\` returns \`Order[]\` with status 200. Its filters become optional query parameters \`status\` and \`customerId\`.
- \`POST /orders\` takes an \`Order\` and returns 201 with a \`Location\` header. It returns 400 for a bad order.
- \`GET /orders/{orderId}\` returns an \`Order\` with status 200, or 404. Reading one order must no longer be a \`POST\` on that resource.
- An update is a \`PUT\` or a \`PATCH\` on \`/orders/{orderId}\`. Choose the one that fits, and return 404 for an unknown order.
- Cancelling is either \`DELETE /orders/{orderId}\` or \`POST /orders/{orderId}/cancellation\`. Choose one. It returns 409 when the order was already delivered.
`,
  starter: `#%RAML 1.0
title: Wholesale Orders API
mediaType: application/json

types:
  Order:
    type: object
    properties:
      orderId: string
      customerId: string
      status:
        type: string
        enum: [ NEW, PICKED, DELIVERED, CANCELLED ]
      total: number

/getOrders:
  post:
    description: Read orders. The filter goes in the body.
    body:
      type: object
      properties:
        status?: string
        customerId?: string
    responses:
      200:
        body:
          type: Order[]

/getOrderById:
  post:
    body:
      type: object
      properties:
        orderId: string
    responses:
      200:
        body:
          type: Order

/createOrder:
  post:
    body:
      type: Order
    responses:
      200:
        description: Check the body to see if it worked.

/updateOrder:
  post:
    body:
      type: Order
    responses:
      200:
        description: Check the body to see if it worked.

/deleteOrder:
  post:
    body:
      type: object
      properties:
        orderId: string
    responses:
      200:
        description: Check the body to see if it worked.
`,
  ramlChecks: [
    {
      label: 'Order keeps its properties',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Order', prop: 'orderId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Order', prop: 'customerId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Order', prop: 'status', want: { enum: { exactly: ['NEW', 'PICKED', 'DELIVERED', 'CANCELLED'] } } },
          { type: 'prop', typeName: 'Order', prop: 'total', want: { type: 'number', required: true } },
        ],
      },
    },
    {
      label: 'The read paths are gone and GET /orders replaces them',
      rule: {
        type: 'all',
        rules: [
          { type: 'noResource', path: '/getOrders' },
          { type: 'noResource', path: '/getOrderById' },
          { type: 'method', path: '/orders', method: 'get' },
        ],
      },
    },
    {
      label: 'The write paths are gone and POST /orders replaces them',
      rule: {
        type: 'all',
        rules: [
          { type: 'noResource', path: '/createOrder' },
          { type: 'noResource', path: '/updateOrder' },
          { type: 'noResource', path: '/deleteOrder' },
          { type: 'method', path: '/orders', method: 'post' },
        ],
      },
    },
    { label: 'GET /orders returns Order[]', rule: { type: 'response', path: '/orders', method: 'get', status: '200', typeIs: 'Order[]' } },
    {
      label: 'The filters are optional query parameters on GET /orders',
      rule: {
        type: 'all',
        rules: [
          { type: 'param', path: '/orders', method: 'get', in: 'query', name: 'status', want: { required: false } },
          { type: 'param', path: '/orders', method: 'get', in: 'query', name: 'customerId', want: { required: false } },
        ],
      },
    },
    { label: 'POST /orders takes an Order', rule: { type: 'body', path: '/orders', method: 'post', typeIs: 'Order' } },
    { label: 'POST /orders returns 201 with a Location header', rule: { type: 'response', path: '/orders', method: 'post', status: '201', header: 'Location' } },
    { label: 'POST /orders returns 400 for a bad order', rule: { type: 'response', path: '/orders', method: 'post', status: '400' } },
    {
      label: 'Reading one order is a GET that returns an Order or 404, and not a POST',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/orders/{}', method: 'get', status: '200', typeIs: 'Order' },
          { type: 'response', path: '/orders/{}', method: 'get', status: '404' },
          { type: 'noMethod', path: '/orders/{}', method: 'post' },
        ],
      },
    },
    {
      label: 'An update is a PUT or PATCH with a 404',
      rule: {
        type: 'any',
        rules: [
          { type: 'response', path: '/orders/{}', method: 'put', status: '404' },
          { type: 'response', path: '/orders/{}', method: 'patch', status: '404' },
        ],
      },
    },
    {
      label: 'Cancelling returns 409 when the order was already delivered',
      rule: {
        type: 'any',
        rules: [
          { type: 'response', path: '/orders/{}', method: 'delete', status: '409' },
          { type: 'response', path: '/orders/{}/cancellation', method: 'post', status: '409' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Wholesale Orders API
mediaType: application/json

types:
  Order:
    type: object
    properties:
      orderId: string
      customerId: string
      status:
        type: string
        enum: [ NEW, PICKED, DELIVERED, CANCELLED ]
      total: number

/orders:
  get:
    queryParameters:
      status?:
        type: string
        enum: [ NEW, PICKED, DELIVERED, CANCELLED ]
      customerId?: string
    responses:
      200:
        body:
          type: Order[]
  post:
    body:
      type: Order
    responses:
      201:
        headers:
          Location:
            description: The URL of the new order.
            type: string
        body:
          type: Order
      400:
        description: The order is not valid.
  /{orderId}:
    get:
      responses:
        200:
          body:
            type: Order
        404:
          description: No order has this id.
    patch:
      body:
        type: object
      responses:
        200:
          body:
            type: Order
        404:
          description: No order has this id.
    /cancellation:
      post:
        responses:
          201:
            description: The order is cancelled and stays on record.
          404:
            description: No order has this id.
          409:
            description: The order was already delivered.
`,
  keyPoints: [
    'A path names a thing. The HTTP method says what happens to it.',
    'GET is safe, so filters belong in query parameters, where a URL can be cached and shared.',
    'Status codes carry the outcome. A 200 with an error in the body hides failures from tools.',
    'PUT replaces the whole resource. PATCH changes part of it.',
    'An action that does not fit a method can become a noun, such as /cancellation.',
  ],
  solution: `
Five verbs collapse into two resources. The method now carries the meaning that used to sit in the path, so a new reader can guess the API.

Filters move to the query string, since a read has no business carrying a body. \`GET\` can then be cached, logged and retried.

The two choices are real design decisions. \`PATCH\` suits a change to one field, while \`PUT\` suits a client that sends the whole order. For cancelling, \`DELETE\` is short but suggests the order disappears. A wholesaler keeps cancelled orders for its records, so \`/cancellation\` says more. It models the act of cancelling as a thing that gets created.

Status codes do the rest. \`409\` tells a caller that the request was understood but conflicts with the state of the order.
`,
  followUps: [
    {
      q: 'Existing clients call /getOrders today. How do you move them?',
      a: 'Publish the new contract next to the old one and keep the old paths running. Give a retirement date, then track who still calls them. A facade can map old calls to new ones during the move.',
    },
    {
      q: 'Is it ever right to read with POST?',
      a: 'Sometimes, for a search too complex or too sensitive for a URL. Model it as a resource, such as POST /order-searches, and be clear that it is a search. It should still change nothing.',
    },
    {
      q: 'Why does the Location header matter on a 201?',
      a: 'It gives the caller the URL of the new order, so the caller does not have to build it. The server stays free to change how its URLs are made.',
    },
  ],
}

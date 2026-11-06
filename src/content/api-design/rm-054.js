export default {
  id: 'rm-054',
  category: 'api-design',
  title: 'Purchase Orders API: Complex Search with POST /orders/search',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'search', 'rest', 'public-sector'],
  estMinutes: 30,
  description: `
A city council tracks its purchase orders. Auditors need searches such as "orders from these 150 suppliers, raised between two dates, above a value, in any of three statuses".

Filters normally belong in query parameters on \`GET\`. This search does not fit there:

- 150 supplier ids can make a URL longer than some servers and gateways accept.
- A date range is a nested value, and query parameters are flat.
- URLs end up in access logs, and auditors do not want their search terms there.

A \`GET\` with a body is not a safe way out, because HTTP gives that body no defined meaning and many tools drop it. So \`POST /orders/search\` is a known and accepted exception.

Note what it is: \`POST\` used as a **read**. It creates nothing, so it returns 200 and not 201.

Simple filters stay on \`GET\`. They can be cached and bookmarked, and \`POST\` loses both of those.

**Requirements**
- Title \`Purchase Orders API\`, with JSON as the default media type.
- A type \`OrderStatus\`, a string that is one of \`DRAFT\`, \`APPROVED\`, \`DELIVERED\`, \`CANCELLED\`.
- A type \`DateRange\` with required \`from\` and \`to\`, each a date with no time.
- A type \`Order\` with a required string \`orderId\`, a required string \`supplierId\`, a required \`status\` of type \`OrderStatus\`, and a required number \`value\`.
- A type \`OrderSearch\` where everything is optional:
  - \`statuses\`, a list of \`OrderStatus\`
  - \`supplierIds\`, a list of strings with at most 200 items
  - \`raisedBetween\`, a \`DateRange\`
  - \`minValue\`, a number
  - \`page\`, an integer of at least 1
  - \`pageSize\`, an integer of at most 100
- A type \`OrderPage\` with a required integer \`total\` and a required \`orders\`, a list of \`Order\`.
- A type \`Error\` with a required string \`code\` and a required string \`message\`.
- \`GET /orders\` has an optional query parameter \`status\` of type \`OrderStatus\` and returns an \`OrderPage\` with status 200.
- \`GET /orders/{orderId}\` returns an \`Order\`, or 404.
- \`POST /orders/search\` takes an \`OrderSearch\`. It returns an \`OrderPage\` with status 200, or 400 with an \`Error\`.
- There is no \`GET\` on \`/orders/search\`.
`,
  starter: `#%RAML 1.0
title: Purchase Orders API
mediaType: application/json

types:

/orders:
`,
  ramlChecks: [
    { label: 'OrderStatus allows the four statuses only', rule: { type: 'typeDecl', name: 'OrderStatus', want: { enum: { exactly: ['DRAFT', 'APPROVED', 'DELIVERED', 'CANCELLED'] } } } },
    {
      label: 'DateRange has a required from and to, with no time',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'DateRange', prop: 'from', want: { type: 'date-only', required: true } },
          { type: 'prop', typeName: 'DateRange', prop: 'to', want: { type: 'date-only', required: true } },
        ],
      },
    },
    {
      label: 'Order has its four required properties',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Order', prop: 'orderId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Order', prop: 'supplierId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Order', prop: 'status', want: { type: 'OrderStatus', required: true } },
          { type: 'prop', typeName: 'Order', prop: 'value', want: { type: 'number', required: true } },
        ],
      },
    },
    { label: 'OrderSearch.statuses is an optional list of OrderStatus', rule: { type: 'prop', typeName: 'OrderSearch', prop: 'statuses', want: { type: 'OrderStatus[]', required: false } } },
    { label: 'OrderSearch.supplierIds is an optional list of at most 200', rule: { type: 'prop', typeName: 'OrderSearch', prop: 'supplierIds', want: { type: 'string[]', required: false, maxItems: 200 } } },
    { label: 'OrderSearch.raisedBetween is an optional DateRange', rule: { type: 'prop', typeName: 'OrderSearch', prop: 'raisedBetween', want: { type: 'DateRange', required: false } } },
    { label: 'OrderSearch.minValue is an optional number', rule: { type: 'prop', typeName: 'OrderSearch', prop: 'minValue', want: { type: 'number', required: false } } },
    {
      label: 'OrderSearch limits page and pageSize',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'OrderSearch', prop: 'page', want: { type: 'integer', required: false, minimum: 1 } },
          { type: 'prop', typeName: 'OrderSearch', prop: 'pageSize', want: { type: 'integer', required: false, maximum: 100 } },
        ],
      },
    },
    {
      label: 'OrderPage has a total and a list of Order',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'OrderPage', prop: 'total', want: { type: 'integer', required: true } },
          { type: 'prop', typeName: 'OrderPage', prop: 'orders', want: { type: 'Order[]', required: true } },
        ],
      },
    },
    {
      label: 'Error has a required code and message',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Error', prop: 'code', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Error', prop: 'message', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'Simple filtering stays on GET /orders',
      rule: {
        type: 'all',
        rules: [
          { type: 'param', path: '/orders', method: 'get', in: 'query', name: 'status', want: { type: 'OrderStatus', required: false } },
          { type: 'response', path: '/orders', method: 'get', status: '200', typeIs: 'OrderPage' },
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
    { label: 'POST /orders/search takes an OrderSearch', rule: { type: 'body', path: '/orders/search', method: 'post', typeIs: 'OrderSearch' } },
    { label: 'POST /orders/search returns 200 with an OrderPage, since it creates nothing', rule: { type: 'response', path: '/orders/search', method: 'post', status: '200', typeIs: 'OrderPage' } },
    { label: 'POST /orders/search returns 400 with an Error', rule: { type: 'response', path: '/orders/search', method: 'post', status: '400', typeIs: 'Error' } },
    {
      label: 'The search is a POST, with no GET on /orders/search',
      rule: {
        type: 'all',
        rules: [
          { type: 'method', path: '/orders/search', method: 'post' },
          { type: 'noMethod', path: '/orders/search', method: 'get' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Purchase Orders API
mediaType: application/json

types:
  OrderStatus:
    type: string
    enum: [ DRAFT, APPROVED, DELIVERED, CANCELLED ]
  DateRange:
    type: object
    properties:
      from: date-only
      to: date-only
  Order:
    type: object
    properties:
      orderId: string
      supplierId: string
      status: OrderStatus
      value: number
  OrderSearch:
    type: object
    properties:
      statuses?: OrderStatus[]
      supplierIds?:
        type: string[]
        maxItems: 200
      raisedBetween?: DateRange
      minValue?: number
      page?:
        type: integer
        minimum: 1
      pageSize?:
        type: integer
        maximum: 100
  OrderPage:
    type: object
    properties:
      total: integer
      orders: Order[]
  Error:
    type: object
    properties:
      code: string
      message: string

/orders:
  get:
    queryParameters:
      status?:
        type: OrderStatus
    responses:
      200:
        body:
          type: OrderPage
  /search:
    post:
      body:
        type: OrderSearch
      responses:
        200:
          body:
            type: OrderPage
        400:
          body:
            type: Error
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
    'POST /orders/search is a read, so it returns 200 and not 201.',
    'POST fits when filters are too long, nested, or too sensitive for a URL.',
    'Simple filters stay on GET, because GET can be cached and bookmarked.',
    'A search with no matches is a 200 with an empty list, not a 404.',
    'A limit on supplierIds keeps one search from overloading the backend.',
  ],
  solution: `
The body gives the search a real type. Nested values such as \`raisedBetween\` and lists such as \`statuses\` can be validated, which flat query parameters cannot do well.

\`POST\` has costs. It is not treated as safe, so caches ignore it and clients will not retry it on their own. That is why \`GET /orders\` stays for everyday use, and the search is kept for cases that need it.

\`/search\` sits beside \`/{orderId}\`. A fixed path wins over a URI parameter in practice, but it means no order can ever have the id \`search\`.
`,
  followUps: [
    {
      q: 'How would you defend POST for a read in a design review?',
      a: 'State the reason: long supplier lists, nested filters, and search terms kept out of access logs. Also show that it changes nothing, returns 200, and that simple filters remain on GET.',
    },
    {
      q: 'What should the search return when nothing matches?',
      a: 'A 200 with total 0 and an empty orders list. The search itself worked, and a 404 would suggest that the /orders/search resource is missing.',
    },
    {
      q: 'What is another way to handle a very heavy search?',
      a: 'Make the search a resource. POST /searches creates one and returns its id with 201, and the caller then reads pages with GET. Results can be cached and shared this way.',
    },
  ],
}

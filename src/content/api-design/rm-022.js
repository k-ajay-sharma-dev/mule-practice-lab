export default {
  id: 'rm-022',
  category: 'api-design',
  title: 'Product Catalogue API: Paging, Sorting and Filtering with Limits',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'paging', 'sorting', 'filtering', 'query-parameters', 'retail'],
  estMinutes: 30,
  description: `
A retailer's catalogue holds two million products. Last month a partner called \`GET /products\` with no limit, and the search database fell over. Another sorted on a field with no index and timed out.

A good list contract protects the backend. **Paging** returns a slice of the results. **Sorting** sets their order. **Filtering** narrows them down. Every one of these needs a limit in the contract, so a bad request is refused before it does damage.

**Requirements**
- Title \`Product Catalogue API\`, with JSON as the default media type.
- A type \`Product\` with required strings \`sku\`, \`name\` and \`category\`, and a required number \`price\`.
- A type \`ProductPage\` with a required \`items\` of \`Product[]\` and a required integer \`total\`. It has an example that fits it.
- A type \`Error\` with required strings \`code\` and \`message\`.
- \`GET /products\` offers paging. Choose one style:
  - \`limit\` (minimum 1, maximum 100, default 20) and \`offset\` (minimum 0), or
  - \`pageSize\` (minimum 1, maximum 100, default 20) and \`page\` (minimum 1).
- All four are optional integers, so a caller who sends nothing still gets one small page.
- An optional \`sortBy\` that allows only \`name\`, \`price\` and \`newest\`, which are the indexed fields.
- An optional \`order\` that allows only \`asc\` and \`desc\`, with default \`asc\`.
- Optional filters: a string \`category\`, and numbers \`minPrice\` and \`maxPrice\`, each with minimum 0.
- \`GET /products\` returns \`ProductPage\` with status 200, and an \`Error\` with status 400 for a value out of range.

The parameters can sit on the method or come from a trait. Both pass.
`,
  starter: `#%RAML 1.0
title: Product Catalogue API
mediaType: application/json

types:

/products:
  get:
    queryParameters:
`,
  ramlChecks: [
    {
      label: 'The title is Product Catalogue API and JSON is the default media type',
      rule: {
        type: 'all',
        rules: [
          { type: 'root', key: 'title', want: 'Product Catalogue API' },
          { type: 'root', key: 'mediaType', want: 'application/json' },
        ],
      },
    },
    {
      label: 'Product has required sku, name, category and price',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Product', prop: 'sku', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Product', prop: 'name', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Product', prop: 'category', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Product', prop: 'price', want: { type: 'number', required: true } },
        ],
      },
    },
    {
      label: 'ProductPage has required items and total',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'ProductPage', prop: 'items', want: { type: 'Product[]', required: true } },
          { type: 'prop', typeName: 'ProductPage', prop: 'total', want: { type: 'integer', required: true } },
        ],
      },
    },
    {
      label: 'Error has required code and message',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Error', prop: 'code', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Error', prop: 'message', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'Paging is optional, capped at 100 per page, and defaults to 20',
      rule: {
        type: 'any',
        rules: [
          {
            type: 'all',
            rules: [
              { type: 'param', path: '/products', method: 'get', in: 'query', name: 'limit', want: { type: 'integer', required: false, minimum: 1, maximum: 100, default: 20 } },
              { type: 'param', path: '/products', method: 'get', in: 'query', name: 'offset', want: { type: 'integer', required: false, minimum: 0 } },
            ],
          },
          {
            type: 'all',
            rules: [
              { type: 'param', path: '/products', method: 'get', in: 'query', name: 'pageSize', want: { type: 'integer', required: false, minimum: 1, maximum: 100, default: 20 } },
              { type: 'param', path: '/products', method: 'get', in: 'query', name: 'page', want: { type: 'integer', required: false, minimum: 1 } },
            ],
          },
        ],
      },
    },
    {
      label: 'sortBy is optional and limited to name, price and newest',
      rule: { type: 'param', path: '/products', method: 'get', in: 'query', name: 'sortBy', want: { required: false, enum: { exactly: ['name', 'price', 'newest'] } } },
    },
    {
      label: 'order is optional, limited to asc and desc, and defaults to asc',
      rule: { type: 'param', path: '/products', method: 'get', in: 'query', name: 'order', want: { required: false, enum: { exactly: ['asc', 'desc'] }, default: 'asc' } },
    },
    { label: 'category is an optional string filter', rule: { type: 'param', path: '/products', method: 'get', in: 'query', name: 'category', want: { type: 'string', required: false } } },
    {
      label: 'minPrice and maxPrice are optional numbers of at least 0',
      rule: {
        type: 'all',
        rules: [
          { type: 'param', path: '/products', method: 'get', in: 'query', name: 'minPrice', want: { type: 'number', required: false, minimum: 0 } },
          { type: 'param', path: '/products', method: 'get', in: 'query', name: 'maxPrice', want: { type: 'number', required: false, minimum: 0 } },
        ],
      },
    },
    { label: 'GET /products returns ProductPage, with an example', rule: { type: 'response', path: '/products', method: 'get', status: '200', typeIs: 'ProductPage', example: true } },
    { label: 'GET /products returns an Error with status 400', rule: { type: 'response', path: '/products', method: 'get', status: '400', typeIs: 'Error' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Product Catalogue API
mediaType: application/json

types:
  Product:
    type: object
    properties:
      sku: string
      name: string
      category: string
      price: number
  ProductPage:
    type: object
    properties:
      items: Product[]
      total: integer
    example:
      items:
        - sku: SKU-1042
          name: Trail Backpack
          category: outdoor
          price: 79.50
      total: 1
  Error:
    type: object
    properties:
      code: string
      message: string

traits:
  paged:
    queryParameters:
      limit?:
        type: integer
        minimum: 1
        maximum: 100
        default: 20
      offset?:
        type: integer
        minimum: 0
        default: 0

/products:
  get:
    is: [ paged ]
    queryParameters:
      sortBy?:
        type: string
        enum: [ name, price, newest ]
      order?:
        type: string
        enum: [ asc, desc ]
        default: asc
      category?: string
      minPrice?:
        type: number
        minimum: 0
      maxPrice?:
        type: number
        minimum: 0
    responses:
      200:
        body:
          type: ProductPage
      400:
        body:
          type: Error
`,
  keyPoints: [
    'A maximum on the page size protects the backend. A default keeps the unbounded call safe.',
    'An enum on sortBy limits sorting to fields the database can sort quickly.',
    'Returning an object with items and total leaves room for paging details. A bare array does not.',
    'Filters are optional query parameters with their own limits.',
    'A value out of range is a 400, and the contract should say so.',
  ],
  solution: `
The two limits on paging do different jobs. \`maximum: 100\` stops a caller asking for too much. \`default: 20\` covers the caller who asks for nothing, which is what caused the outage.

The enum on \`sortBy\` turns a performance rule into a contract rule. A request to sort on an unindexed field now gets a 400 at the edge and never reaches the database.

\`ProductPage\` wraps the list, so \`total\` has a home. If you need another paging field later, adding it does not break callers. Changing a bare array into an object would.
`,
  followUps: [
    {
      q: 'What is the weakness of offset paging on a large, changing list?',
      a: 'The database still walks past every skipped row, so deep pages get slow. Rows added during paging can also shift results, so a caller sees repeats or misses items.',
    },
    {
      q: 'What is cursor paging and when would you use it?',
      a: 'The response carries an opaque marker for the next page, and the caller sends it back. It stays fast at any depth and copes with changing data, but a caller cannot jump to page 50.',
    },
    {
      q: 'Who enforces these limits at runtime?',
      a: 'In Mule, APIkit validates requests against the RAML, so an out-of-range value is refused before your flow runs. The enforcement comes from that router, not from the file alone.',
    },
  ],
}

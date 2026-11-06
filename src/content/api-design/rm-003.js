export default {
  id: 'rm-003',
  category: 'api-design',
  title: 'Product Search API: Query Parameters on a Search',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'query-parameters', 'search', 'retail'],
  estMinutes: 10,
  description: `
An outdoor gear retailer wants a search box on its website. The website will call \`GET /products\` and describe what the shopper wants in the URL.

A **query parameter** is a named value added after the question mark in a URL, as in \`/products?q=tent&maxPrice=100\`. In RAML you list them under \`queryParameters\` on a method. Each one can have a type, so a caller knows what to send.

A parameter is required unless you say otherwise. Writing \`category?\` makes \`category\` optional.

**Requirements**
- \`GET /products\` has these query parameters:
  - \`q\`, the search text: a required string.
  - \`category\`: an optional string.
  - \`maxPrice\`: an optional number with a minimum of 0. Prices can have cents, so it is not an integer.
  - \`inStock\`: an optional boolean.
  - \`page\`: an optional integer with a minimum of 1 and a default of 1.
- The search returns status 200.
- It returns status 400 when \`q\` is missing.
`,
  starter: `#%RAML 1.0
title: Product Search API
mediaType: application/json

/products:
  get:
    queryParameters:
`,
  ramlChecks: [
    { label: 'q is a required string', rule: { type: 'param', path: '/products', method: 'get', in: 'query', name: 'q', want: { type: 'string', required: true } } },
    { label: 'category is an optional string', rule: { type: 'param', path: '/products', method: 'get', in: 'query', name: 'category', want: { type: 'string', required: false } } },
    {
      label: 'maxPrice is an optional number with a minimum of 0',
      rule: { type: 'param', path: '/products', method: 'get', in: 'query', name: 'maxPrice', want: { type: 'number', required: false, minimum: 0 } },
    },
    { label: 'inStock is an optional boolean', rule: { type: 'param', path: '/products', method: 'get', in: 'query', name: 'inStock', want: { type: 'boolean', required: false } } },
    {
      label: 'page is an optional integer with a minimum of 1 and a default of 1',
      rule: { type: 'param', path: '/products', method: 'get', in: 'query', name: 'page', want: { type: 'integer', required: false, minimum: 1, default: 1 } },
    },
    { label: 'GET /products returns 200', rule: { type: 'response', path: '/products', method: 'get', status: '200' } },
    { label: 'GET /products returns 400 when q is missing', rule: { type: 'response', path: '/products', method: 'get', status: '400' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Product Search API
mediaType: application/json

/products:
  get:
    description: Search the catalogue.
    queryParameters:
      q:
        type: string
        description: The search text.
      category?:
        type: string
      maxPrice?:
        type: number
        minimum: 0
      inStock?:
        type: boolean
      page?:
        type: integer
        minimum: 1
        default: 1
    responses:
      200:
        description: The matching products.
      400:
        description: The search text q is missing.
`,
  keyPoints: [
    'Query parameters belong to a method, so queryParameters sits under get, not under the resource.',
    'A parameter is required by default. The question mark in category? makes it optional.',
    'Types and limits such as minimum tell callers what is allowed before they send a request.',
    'A default says what the API uses when the caller leaves the parameter out.',
  ],
  solution: `
\`q\` has no question mark, so it is required. A search with no search text has no meaning, which is why it also earns a 400.

The other parameters narrow the search, so they are optional. Each one has the type that fits its meaning: \`maxPrice\` is a \`number\` because prices can have cents, and \`page\` is an \`integer\` because there is no page 1.5.

\`default: 1\` on \`page\` tells callers they can leave it out and still get the first page.
`,
  followUps: [
    {
      q: 'When would you use a query parameter rather than a URI parameter?',
      a: 'A URI parameter picks out one thing, such as /products/{productId}. A query parameter changes what comes back from a collection, such as filtering, sorting or paging.',
    },
    {
      q: 'Why is a default only useful on an optional parameter?',
      a: 'A default applies when the caller leaves the parameter out. A required parameter is always sent, so its default would never be used.',
    },
    {
      q: 'What happens if a caller sends maxPrice=cheap?',
      a: 'The value does not fit the number type. A gateway or router that validates against the RAML, such as APIkit in Mule, can reject it with a 400 before any of your logic runs.',
    },
  ],
}

export default {
  id: 'rm-136',
  category: 'api-design',
  title: 'Garden Shop Search API: An Empty Result Is 200, a Missing Item Is 404',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'search', 'status-codes', 'not-found', 'query-parameters', 'retail'],
  estMinutes: 15,
  description: `
Fernhill Garden Centres has a product search in its shop app. The first version of the API answered \`404 Not Found\` when a search matched nothing. The app showed a red error page for a search such as "blue tulips", and the support team got calls about a broken shop.

The new contract follows one rule:

- A **search** that finds nothing has still worked. It answers \`200\` with an empty list and a total of 0.
- A **single item** asked for by its id that does not exist answers \`404\`.

**Requirements**
- Title \`Garden Shop Search API\`, with JSON as the default media type.
- A type \`Product\` with:
  - \`sku\`: required, \`SKU-\` and five digits, such as \`SKU-20417\`.
  - \`name\`: a required string.
  - \`inStock\`: a required integer of at least 0.
- A type \`SearchResult\` with a required \`items\` list of \`Product\` and a required integer \`total\` of at least 0.
- A type \`Error\` with a required string \`message\`.
- \`GET /products\` has a required query parameter \`q\`: a string of at least 2 characters. It returns a \`SearchResult\` with 200.
- \`GET /products/{sku}\` returns a \`Product\` with 200 and an \`Error\` with 404.
`,
  starter: `#%RAML 1.0
title: Garden Shop Search API
mediaType: application/json

types:
  Product:
    type: object
    properties:
      sku: string
      name: string

/products:
  get:
    queryParameters:
      q: string
    responses:
      200:
        body:
          type: Product[]
      404:
        description: Nothing matched the search.
`,
  ramlChecks: [
    {
      label: 'The title is Garden Shop Search API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Garden Shop Search API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'Product has a sku of SKU- and five digits, a name and an inStock of at least 0',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Product', prop: 'sku', want: { required: true, pattern: { accepts: ['SKU-20417', 'SKU-00001'], rejects: ['SKU-2041', 'sku-20417', 'SKU-204170', 'SKU20417', 'XSKU-20417'] } } },
          { type: 'prop', typeName: 'Product', prop: 'name', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Product', prop: 'inStock', want: { type: 'integer', required: true, minimum: 0 } },
        ],
      },
    },
    {
      label: 'SearchResult has a Product list items and an integer total of at least 0',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'SearchResult', prop: 'items', want: { type: 'Product[]', required: true } },
          { type: 'prop', typeName: 'SearchResult', prop: 'total', want: { type: 'integer', required: true, minimum: 0 } },
        ],
      },
    },
    {
      label: 'Error has a required string message',
      rule: { type: 'prop', typeName: 'Error', prop: 'message', want: { type: 'string', required: true } },
    },
    {
      label: 'GET /products needs a q of at least 2 characters and returns a SearchResult with 200',
      rule: {
        type: 'all',
        rules: [
          { type: 'param', path: '/products', method: 'get', in: 'query', name: 'q', want: { type: 'string', required: true, minLength: 2 } },
          { type: 'response', path: '/products', method: 'get', status: '200', typeIs: 'SearchResult' },
        ],
      },
    },
    {
      label: 'GET /products/{sku} returns a Product with 200 and an Error with 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/products/{}', method: 'get', status: '200', typeIs: 'Product' },
          { type: 'response', path: '/products/{}', method: 'get', status: '404', typeIs: 'Error' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Garden Shop Search API
version: v1
baseUri: https://api.example.com/garden/{version}
mediaType: application/json

types:
  Product:
    type: object
    properties:
      sku:
        type: string
        pattern: ^SKU-[0-9]{5}$
      name: string
      inStock:
        type: integer
        minimum: 0
    example:
      sku: SKU-20417
      name: Red tulip bulbs, pack of 20
      inStock: 140
  SearchResult:
    type: object
    properties:
      items: Product[]
      total:
        type: integer
        minimum: 0
    examples:
      found:
        items:
          - sku: SKU-20417
            name: Red tulip bulbs, pack of 20
            inStock: 140
        total: 1
      nothingFound:
        items: []
        total: 0
  Error:
    type: object
    properties:
      message: string

/products:
  get:
    description: Searches by name. A search that matches nothing still answers 200, with an empty list.
    queryParameters:
      q:
        type: string
        minLength: 2
        example: tulip
    responses:
      200:
        body:
          type: SearchResult
  /{sku}:
    get:
      responses:
        200:
          body:
            type: Product
        404:
          description: No product has this SKU.
          body:
            type: Error
`,
  keyPoints: [
    'A search that finds nothing has worked, so it answers 200 with an empty list.',
    '404 means the resource asked for by its address does not exist.',
    'A total of 0 tells the client the search ran and found nothing.',
    'A minimum length on q stops searches that would match almost everything.',
    'Named examples can show both a normal result and an empty one.',
  ],
  solution: `
**Two different questions.** \`GET /products?q=blue tulips\` asks "which products match?". The answer "none" is a valid answer, so it is \`200\` with \`items: []\` and \`total: 0\`. \`GET /products/SKU-99999\` asks for one thing at one address. If it does not exist, the address points at nothing, and that is \`404\`.

**Why it matters to the app.** Many HTTP clients treat 404 as an error and jump to an error page. With 200 and an empty list, the app shows "no results" and suggests other searches.

**A wrapper type.** \`SearchResult\` holds the list and the total. The total makes an empty result clear, and it leaves room for paging later without changing the shape.

**The q parameter.** A minimum of 2 characters rejects a one-letter search with 400 before it runs a slow query over the whole catalogue.

| Request | Nothing there | Status |
|---|---|---|
| \`GET /products?q=...\` | No match | 200, empty list |
| \`GET /products/{sku}\` | No such product | 404 |
`,
  followUps: [
    {
      q: 'What about a search where the category in the query does not exist, such as ?category=rockets?',
      a: 'If categories come from a fixed list, declare it as an enum and the value fails with 400. If they are free text, an unknown category is a search with no match, so 200 with an empty list.',
    },
    {
      q: 'Is 204 No Content a good answer for an empty search?',
      a: 'It is better than 404, but the client then gets no body to read. 200 with an empty list keeps one response shape for every search, which suits the app better.',
    },
    {
      q: 'How does the Mule app behind this API decide between 200 and 404?',
      a: 'For the search it returns the list from the database, even if it is empty. For the single item, it checks whether the query found a row and raises an error mapped to 404 when it did not.',
    },
  ],
}

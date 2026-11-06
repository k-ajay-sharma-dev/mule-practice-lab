export default {
  id: 'rm-040',
  category: 'api-design',
  title: 'Clothing Search API: A Repeated Query Parameter',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'query-parameters', 'arrays', 'search', 'retail'],
  estMinutes: 12,
  description: `
A clothing retailer wants shoppers to tick several sizes and brands at once. The website sends this request:

\`GET /products?size=S&size=M&brand=Northwind&brand=Alpine\`

The same parameter appears more than once. In RAML, you describe that by typing the query parameter as an **array**, which is a list of values. \`size\` typed as \`Size[]\` means the parameter can repeat, and each value must be a \`Size\`.

Array facets work here too. A **facet** is a rule added to a type. \`maxItems\` limits how many values are sent, and \`uniqueItems: true\` refuses duplicates.

**Requirements**
- A type \`Size\` is a string that allows only \`S\`, \`M\`, \`L\` and \`XL\`.
- A type \`Product\` has the required strings \`sku\` and \`name\`, and a required \`sizes\`, which is a list of \`Size\`.
- \`GET /products\` returns \`Product[]\` with status 200.
- \`GET /products\` has these query parameters:
  - \`size\`: optional and repeated, a list of \`Size\`, with at most 4 values and no duplicates.
  - \`brand\`: optional and repeated, a list of strings, with at most 10 values.
  - \`q\`: an optional search text that is sent once, so it is not a list.
`,
  starter: `#%RAML 1.0
title: Clothing Search API
mediaType: application/json

types:

/products:
  get:
`,
  ramlChecks: [
    { label: 'Size allows only S, M, L and XL', rule: { type: 'typeDecl', name: 'Size', want: { type: 'string', enum: { exactly: ['S', 'M', 'L', 'XL'] } } } },
    {
      label: 'sku and name are required strings',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Product', prop: 'sku', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Product', prop: 'name', want: { type: 'string', required: true } },
        ],
      },
    },
    { label: 'sizes on Product is a required list of Size', rule: { type: 'prop', typeName: 'Product', prop: 'sizes', want: { type: 'Size[]', required: true } } },
    { label: 'GET /products returns Product[]', rule: { type: 'response', path: '/products', method: 'get', status: '200', typeIs: 'Product[]' } },
    {
      label: 'The size parameter is an optional list of Size',
      rule: { type: 'param', path: '/products', method: 'get', in: 'query', name: 'size', want: { type: 'Size[]', required: false } },
    },
    {
      label: 'The size parameter allows 4 values and no duplicates',
      rule: { type: 'param', path: '/products', method: 'get', in: 'query', name: 'size', want: { maxItems: 4, uniqueItems: true } },
    },
    {
      label: 'The brand parameter is an optional list of up to 10 strings',
      rule: { type: 'param', path: '/products', method: 'get', in: 'query', name: 'brand', want: { type: 'string[]', required: false, maxItems: 10 } },
    },
    {
      label: 'The q parameter is one optional string',
      rule: { type: 'param', path: '/products', method: 'get', in: 'query', name: 'q', want: { type: 'string', required: false } },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Clothing Search API
mediaType: application/json

types:
  Size:
    type: string
    enum: [ S, M, L, XL ]
  Product:
    type: object
    properties:
      sku: string
      name: string
      sizes: Size[]

/products:
  get:
    queryParameters:
      size?:
        type: Size[]
        maxItems: 4
        uniqueItems: true
      brand?:
        type: string[]
        maxItems: 10
      q?: string
    responses:
      200:
        body:
          type: Product[]
`,
  keyPoints: [
    'A query parameter typed as an array can repeat in the URL, as in size=S&size=M.',
    'Size[] is the same as type: array with items: Size.',
    'maxItems and uniqueItems work on a repeated parameter as they do on any array.',
    'Keep a single value as a plain type. Only make it an array if it can really repeat.',
  ],
  solution: `
\`Size[]\` says two things at once: the parameter can repeat, and each value must be a real size. A named \`Size\` type also keeps the parameter and the \`Product\` in step.

\`maxItems: 4\` matches the four sizes that exist, and \`uniqueItems\` refuses \`size=S&size=S\`, which would only waste a filter.

\`q\` stays a plain string, because a shopper types one search.
`,
  followUps: [
    {
      q: 'What is another common way to send several values, and why is it weaker in RAML?',
      a: 'A comma list such as size=S,M in one string. RAML sees one string, so it cannot check each value against the enum. A pattern would have to do that work.',
    },
    {
      q: 'What does a caller send to pass nothing for an optional array parameter?',
      a: 'They leave the parameter out of the URL. Add minItems only if a request that does send it must hold a certain number of values.',
    },
    {
      q: 'How does a repeated parameter reach a Mule flow?',
      a: 'attributes.queryParams is a multi-value map. Reading the key gives the first value, and attributes.queryParams.*size gives all of them as an array.',
    },
  ],
}

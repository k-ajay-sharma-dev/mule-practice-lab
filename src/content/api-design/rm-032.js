export default {
  id: 'rm-032',
  category: 'api-design',
  title: 'Product Catalogue API: Split a Large File with Fragments and !include',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'fragments', 'include', 'retail'],
  estMinutes: 30,
  description: `
A product catalogue API has grown to 3,000 lines in one file. Every change causes a merge conflict. The team wants the types, traits and examples in their own files.

\`!include\` puts the content of another file at that spot. A **fragment** is a RAML file with one piece in it, and its first line says what it is:

- \`#%RAML 1.0 DataType\` holds one type.
- \`#%RAML 1.0 Trait\` holds one trait.

A fragment has to suit its place, so a Trait file cannot sit under \`types\`. An example can be a plain JSON file.

This problem has four files. Use the tabs above the editor to move between them.

**Requirements**
- \`types/product.raml\` is a DataType fragment with a required string \`sku\`, a required string \`name\` and a required number \`price\`.
- \`traits/traced.raml\` is a Trait fragment with a required header \`X-Correlation-Id\` of type string.
- \`examples/product.json\` is an example that fits \`Product\`.
- \`api.raml\` has the title \`Product Catalogue API\`, with JSON as the default media type.
- \`api.raml\` declares the type \`Product\` and the trait \`traced\` with \`!include\`.
- \`GET /products/{sku}\` uses \`traced\`. It returns a \`Product\` with status 200, with the example file on the body, or 404.
`,
  starter: `#%RAML 1.0
title: Product Catalogue API
mediaType: application/json

types:

traits:

/products:
`,
  files: {
    'types/product.raml': `#%RAML 1.0 DataType
`,
    'traits/traced.raml': `#%RAML 1.0 Trait
`,
    'examples/product.json': `{
}
`,
  },
  ramlChecks: [
    {
      label: 'Product comes from types/product.raml with !include',
      rule: {
        type: 'all',
        rules: [
          { type: 'included', file: 'types/product.raml' },
          { type: 'typeDecl', name: 'Product' },
        ],
      },
    },
    {
      label: 'Product has a required sku, name and price',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Product', prop: 'sku', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Product', prop: 'name', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Product', prop: 'price', want: { type: 'number', required: true } },
        ],
      },
    },
    {
      label: 'traced comes from traits/traced.raml with !include',
      rule: {
        type: 'all',
        rules: [
          { type: 'included', file: 'traits/traced.raml' },
          { type: 'trait', name: 'traced' },
        ],
      },
    },
    { label: 'GET /products/{sku} uses traced', rule: { type: 'applied', path: '/products/{}', method: 'get', trait: 'traced' } },
    {
      label: 'The trait gives the method a required X-Correlation-Id header',
      rule: { type: 'param', path: '/products/{}', method: 'get', in: 'header', name: 'X-Correlation-Id', want: { type: 'string', required: true } },
    },
    {
      label: 'GET /products/{sku} returns a Product with the example file on the body',
      rule: {
        type: 'all',
        rules: [
          { type: 'included', file: 'examples/product.json' },
          { type: 'response', path: '/products/{}', method: 'get', status: '200', typeIs: 'Product', example: 'own' },
        ],
      },
    },
    { label: 'GET /products/{sku} returns 404 for an unknown product', rule: { type: 'response', path: '/products/{}', method: 'get', status: '404' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Product Catalogue API
mediaType: application/json

types:
  Product: !include types/product.raml

traits:
  traced: !include traits/traced.raml

/products:
  /{sku}:
    get:
      is: [ traced ]
      responses:
        200:
          body:
            type: Product
            example: !include examples/product.json
        404:
          description: No product has this SKU.
`,
  referenceFiles: {
    'types/product.raml': `#%RAML 1.0 DataType
type: object
properties:
  sku: string
  name: string
  price: number
`,
    'traits/traced.raml': `#%RAML 1.0 Trait
headers:
  X-Correlation-Id:
    type: string
`,
    'examples/product.json': `{
  "sku": "TS-1001",
  "name": "Trail Shoe",
  "price": 89.5
}
`,
  },
  keyPoints: [
    '!include puts the content of another file at that spot.',
    'The first line of a fragment names its kind, and the kind must suit the place it is included.',
    'A plain JSON file works as an example, and the example is still checked against the type.',
    'uses is for libraries. !include is for everything else.',
  ],
  solution: `
\`api.raml\` is now a short table of contents. People can work on \`Product\` and on a trait without touching the same file.

The fragment holds only the content of the type, so it has no \`Product:\` key. The name comes from the place that includes it.

The JSON example is still checked. If \`price\` were a string, the example would fail even though it lives in its own file.
`,
  followUps: [
    {
      q: 'What is the difference between a library and a DataType fragment?',
      a: 'A library holds many named parts and is brought in with uses. A DataType fragment holds one unnamed type and is brought in with !include, which gives it its name.',
    },
    {
      q: 'Why keep examples in their own files?',
      a: 'Large examples make the contract hard to read. A separate file can be reused by tests and mocks, and the parser still checks it against the type.',
    },
    {
      q: 'What happens if you include a Trait fragment under types?',
      a: 'The parser rejects it, because a fragment must suit its place. This catches a wrong path before anyone builds against it.',
    },
  ],
}

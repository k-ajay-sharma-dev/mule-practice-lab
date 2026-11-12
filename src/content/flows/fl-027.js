import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'
import { HANDLERS, handlerStatus } from '../../flow/rules.js'

export default {
  id: 'fl-027',
  category: 'flows',
  title: 'Product Lookup API: Validating Query and URI Parameters',
  level: 'BEGINNER',
  tags: ['http-listener', 'query-params', 'uri-params', 'validation', 'choice', 'http-status'],
  estMinutes: 25,
  flowChecks: [
    { label: 'The API is exposed through an HTTP Listener', rule: { type: 'source', component: 'http-listener' } },
    {
      label: 'Product detail is addressed by a URI parameter in the listener path',
      rule: { type: 'source', component: 'http-listener', where: { path: '{' } },
    },
    { label: 'Incoming parameters are checked with the Validation module', rule: { type: 'exists', component: 'validation' } },
    {
      label: 'The required q parameter is validated',
      rule: { type: 'exists', component: 'validation', where: { expression: 'queryParams.q' } },
    },
    {
      label: 'The optional limit parameter is validated',
      rule: { type: 'exists', component: 'validation', where: { expression: 'limit' } },
    },
    {
      label: 'The SKU URI parameter is validated',
      rule: { type: 'exists', component: 'validation', where: { expression: 'sku' } },
    },
    {
      label: 'Parameters are validated before the database is queried',
      rule: { type: 'before', first: 'validation', then: 'db-select', every: true },
    },
    {
      label: 'The search query applies the limit',
      rule: { type: 'exists', component: 'db-select', where: { sql: 'limit' } },
    },
    {
      label: 'A Choice separates the "found" and "not found" responses',
      rule: { type: 'inside', component: ['set-variable', 'transform', 'set-payload', 'raise-error'], within: 'choice' },
    },
    {
      label: 'An unknown SKU returns 404',
      rule: {
        type: 'any',
        rules: [
          { type: 'inside', component: 'set-variable', where: { value: '404' }, within: 'choice' },
          // Or the Choice raises an error and the handler that catches that exact type sets 404.
          {
            type: 'linked',
            from: { component: 'raise-error', key: 'type' },
            to: { component: ['on-error-propagate', 'on-error-continue'], key: 'type', holding: { component: 'set-variable', where: { value: '404' } } },
            as: 'errorType',
          },
          {
            type: 'linked',
            from: { component: 'raise-error', key: 'type' },
            to: { component: ['on-error-propagate', 'on-error-continue'], key: 'type', holding: { component: 'transform', where: { variableName: 'status', script: '404' } } },
            as: 'errorType',
          },
        ],
      },
    },
    {
      label: 'The HTTP status code is set explicitly (e.g. vars.httpStatus)',
      rule: { type: 'exists', component: 'set-variable', where: { variableName: 'status' } },
    },
    { label: 'Validation errors have their own handler that returns 400', rule: handlerStatus('VALIDATION', '400') },
    {
      label: 'The search has its own listener path, without a URI parameter',
      rule: { type: 'source', component: 'http-listener', where: { path: { not: '{' } } },
    },
    {
      label: 'The SKU flow looks the product up before the Choice decides between 200 and 404',
      rule: { type: 'before', first: 'db-select', then: 'choice' },
    },
    {
      label: 'Both flows map validation errors to 400',
      rule: {
        type: 'any',
        rules: [
          { type: 'inside', component: 'set-variable', where: { value: '400' }, within: HANDLERS, withinWhere: { type: 'VALIDATION' }, min: 2 },
          { type: 'inside', component: 'transform', where: { variableName: 'status', script: '400' }, within: HANDLERS, withinWhere: { type: 'VALIDATION' }, min: 2 },
        ],
      },
    },
  ],
  referenceFlow: design(
    flow(
      'get-products',
      source('http-listener', { path: '/api/products', allowedMethods: 'GET' }),
      [
        step('validation', {
          check: 'is-true',
          expression: '#[sizeOf(attributes.queryParams.q default "") >= 3]',
          message: 'Query parameter q is required and must have at least 3 characters',
        }),
        step('validation', {
          check: 'matches-regex',
          expression: '#[attributes.queryParams.limit default "20"]',
          message: 'limit must be an integer between 1 and 100 (regex ^([1-9][0-9]?|100)$)',
        }),
        step('set-variable', { variableName: 'limit', value: '#[(attributes.queryParams.limit default "20") as Number]' }),
        step('db-select', {
          sql: "SELECT sku, name, price, category FROM products WHERE LOWER(name) LIKE LOWER(:q) ORDER BY name FETCH FIRST :limit ROWS ONLY",
        }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{ count: sizeOf(payload), items: payload map { sku: $.SKU, name: $.NAME, price: $.PRICE } }',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'VALIDATION:INVALID_BOOLEAN, VALIDATION:MISMATCH' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[400]' }),
          step('transform', {
            script: '%dw 2.0\noutput application/json\n---\n{ code: "INVALID_PARAMETER", message: error.description }',
          }),
        ]),
      ],
    ),
    flow(
      'get-product-by-sku',
      source('http-listener', { path: '/api/products/{sku}', allowedMethods: 'GET' }),
      [
        step('validation', {
          check: 'matches-regex',
          expression: '#[attributes.uriParams.sku]',
          message: 'sku must match ^[A-Z]{3}-[0-9]{5}$',
        }),
        // Database Select replaces the attributes, so keep the SKU for the 404 message.
        step('set-variable', { variableName: 'sku', value: '#[attributes.uriParams.sku]' }),
        step('db-select', { sql: 'SELECT sku, name, price, category, stock FROM products WHERE sku = :sku' }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[isEmpty(payload)]' }, [
              step('set-variable', { variableName: 'httpStatus', value: '#[404]' }),
              step('transform', {
                script:
                  '%dw 2.0\noutput application/json\n---\n{ code: "PRODUCT_NOT_FOUND", message: "No product with sku " ++ vars.sku }',
              }),
            ]),
          ],
          {
            otherwise: [
              step('set-variable', { variableName: 'httpStatus', value: '#[200]' }),
              step('transform', {
                script:
                  '%dw 2.0\noutput application/json\n---\npayload[0] then { sku: $.SKU, name: $.NAME, price: $.PRICE, inStock: $.STOCK > 0 }',
              }),
            ],
          },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'VALIDATION:MISMATCH' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[400]' }),
          step('transform', {
            script: '%dw 2.0\noutput application/json\n---\n{ code: "INVALID_SKU", message: error.description }',
          }),
        ]),
      ],
    ),
  ),
  description: `
The web shop needs a small **Product Lookup API** in front of the product database (Oracle, ~80,000 products).

- \`GET /api/products?q=shoe&limit=20\` searches by name. \`q\` is **required** (min. 3 characters); \`limit\` is optional (default 20, max 100). In the flow the search term is \`attributes.queryParams.q\`.
- \`GET /api/products/{sku}\` returns one product. A SKU looks like \`ABC-12345\`.
- Unknown SKU → **404** with a JSON error body. Bad parameters → **400**, without touching the database.
- Expected load is ~30 requests/s, p95 under 300 ms.

**Design the flow(s):**
- Where do query parameters and URI parameters come from in Mule 4, and how do you validate them?
- How does the flow decide between a 200 and a 404 response?
- How is the HTTP status code set on the response?
- Which error types does the Validation module raise and how do they become a 400?
`,
  answerTemplate: `## Endpoints and listener paths

## Parameter validation

## Found vs not found

## Setting the status code

## Error handling
`,
  keyPoints: [
    'Query parameters are read from attributes.queryParams and URI parameters from attributes.uriParams; the URI parameter is declared in the listener path as {sku}.',
    'The Validation module (is-true, matches-regex, ...) checks parameters before any database call, so bad requests never cost a query.',
    'A Choice on isEmpty(payload) after the Database Select returns 404 with an error body, otherwise a 200 with the mapped product.',
    'The HTTP Listener response uses a status code expression such as #[vars.httpStatus default 200], so flows only set a variable.',
    'Validation failures raise VALIDATION:* errors (e.g. VALIDATION:INVALID_BOOLEAN, VALIDATION:MISMATCH) which an On Error Propagate maps to 400.',
  ],
  solution: `
**Two flows**, each with its own HTTP Listener on a shared listener config:

1. **\`GET /api/products\`**
   - Validate \`attributes.queryParams.q\` with **Validate is-true** (\`sizeOf(q default "") >= 3\`) and \`limit\` with **matches-regex** (1–100).
   - Store \`vars.limit\` (default 20) and run a parameterised **Database Select** (\`LIKE :q\`, \`FETCH FIRST :limit ROWS ONLY\`). Never concatenate parameters into SQL.
   - **Transform** into \`{ count, items: [...] }\`. An empty search result is still a **200** with \`count: 0\`. A search that finds nothing is not an error.
2. **\`GET /api/products/{sku}\`**
   - The listener path declares \`{sku}\`; read it from \`attributes.uriParams.sku\` and validate its format with **matches-regex**.
   - **Database Select** by primary key, then a **Choice**: \`isEmpty(payload)\` → \`vars.httpStatus = 404\` + error body; otherwise \`vars.httpStatus = 200\` + mapped product.
3. **Status code:** the listener's response builder uses \`statusCode="#[vars.httpStatus default 200]"\`, and the error response uses the same expression.
4. **Errors:** On Error Propagate for \`VALIDATION:INVALID_BOOLEAN, VALIDATION:MISMATCH\` sets \`httpStatus = 400\` and returns \`{ code, message: error.description }\`. Anything else falls through to the default handler, which returns 500.

In a real project an **APIkit Router** generated from a RAML/OAS spec would do most of the parameter validation for you. This exercise shows what happens underneath.
`,
  followUps: [
    {
      q: 'Why use On Error Propagate rather than On Error Continue for the 400?',
      a: 'Both can return a custom body. Propagate keeps the flow marked as failed, so the listener sends the error response (with its status code expression) and monitoring counts it as an error. Continue treats it as success and uses the normal response builder.',
    },
    {
      q: 'What would APIkit change here?',
      a: 'APIkit validates required query parameters, types, patterns and ranges from the spec and raises APIKIT:BAD_REQUEST, so you no longer need hand-written Validate steps. You just map that error to 400.',
    },
    {
      q: 'Should an empty search return 404?',
      a: 'No. The collection resource exists, so a search with no hits is 200 with an empty list. 404 is for a specific resource (one SKU) that does not exist.',
    },
  ],
}

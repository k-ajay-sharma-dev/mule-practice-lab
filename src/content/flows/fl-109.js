import { design, flow, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-109',
  category: 'flows',
  title: 'Product List API: Select Rows from a Database and Return Them',
  level: 'BEGINNER',
  tags: ['database', 'mysql', 'http', 'json', 'retail'],
  estMinutes: 10,
  flowChecks: [
    {
      label: 'The API is a GET on /products',
      rule: { type: 'source', component: 'http-listener', where: { path: '/products', allowedMethods: 'GET' } },
    },
    {
      label: 'The category query parameter is saved in vars.category',
      rule: { type: 'exists', component: 'set-variable', where: { variableName: 'category', value: 'queryParams' } },
    },
    {
      label: 'The category is saved before the Select uses it',
      rule: { type: 'before', first: 'set-variable', firstWhere: { variableName: 'category' }, then: 'db-select' },
    },
    {
      label: 'The SELECT uses a :category parameter, not joined text',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'db-select', where: { sql: ':category' } },
          { type: 'absent', component: 'db-select', where: { sql: { oneOf: ['++', '$('] } } },
        ],
      },
    },
    {
      label: 'The rows are sorted by name in the SQL',
      rule: { type: 'exists', component: 'db-select', where: { sql: 'order by' } },
    },
    {
      label: 'The rows are transformed after the Select',
      rule: { type: 'before', first: 'db-select', then: 'transform' },
    },
    {
      label: 'The response uses the field names sku, name and price, not the column names',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'transform', where: { script: 'sku' } },
          { type: 'exists', component: 'transform', where: { script: 'name:' } },
          { type: 'exists', component: 'transform', where: { script: 'price:' } },
          { type: 'absent', component: 'transform', where: { script: { oneOf: ['product_name:', 'unit_price:'] } } },
        ],
      },
    },
    {
      label: 'The response is JSON',
      rule: { type: 'exists', component: 'transform', where: { script: 'application/json' } },
    },
  ],
  simulation: {
    systems: {
      db: {
        latencyMs: 12,
        tables: {
          products: {
            key: 'sku',
            rows: [
              { sku: 'SH-204', product_name: 'Trail Runner', unit_price: 89.99, category: 'shoes' },
              { sku: 'SH-117', product_name: 'City Loafer', unit_price: 74.5, category: 'shoes' },
              { sku: 'BG-310', product_name: 'Canvas Tote', unit_price: 24.0, category: 'bags' },
              { sku: 'SH-152', product_name: 'Rain Boot', unit_price: 59.0, category: 'shoes' },
            ],
          },
        },
      },
    },
    tests: [
      {
        name: 'The shoes are listed by name',
        about: 'Three products are in the shoes category. They come back sorted by name with the API field names.',
        trigger: { http: { method: 'GET', path: '/products?category=shoes' } },
        expect: {
          status: 200,
          body: [
            { sku: 'SH-117', name: 'City Loafer', price: 74.5 },
            { sku: 'SH-152', name: 'Rain Boot', price: 59.0 },
            { sku: 'SH-204', name: 'Trail Runner', price: 89.99 },
          ],
        },
      },
      {
        name: 'A category with no products',
        about: 'Nothing is in the hats category, so the answer is an empty list.',
        trigger: { http: { method: 'GET', path: '/products?category=hats' } },
        expect: { status: 200, body: [] },
      },
      {
        name: 'A category with SQL text in it',
        about: 'The value is only data for the :category parameter, so it matches no product.',
        trigger: { http: { method: 'GET', path: '/products', query: { category: "shoes' OR '1'='1" } } },
        expect: { status: 200, body: [] },
      },
    ],
  },
  referenceFlow: design(
    flow('list-products', source('http-listener', { path: '/products', allowedMethods: 'GET' }), [
      step('set-variable', { variableName: 'category', value: '#[attributes.queryParams.category]' }),
      step('db-select', {
        database: 'MySQL',
        sql: 'SELECT sku, product_name, unit_price\nFROM products\nWHERE category = :category\nORDER BY product_name',
      }),
      step('transform', {
        script:
          '%dw 2.0\noutput application/json\n---\npayload map {\n  sku: $.sku,\n  name: $.product_name,\n  price: $.unit_price\n}',
      }),
    ]),
  ),
  description: `
A retail website needs a list of products for one category, for example \`GET /products?category=shoes\`. The products are in a MySQL table called \`products\` with the columns \`sku\`, \`product_name\`, \`unit_price\` and \`category\`.

**Requirements**
- Expose \`GET /products\` with an HTTP Listener.
- Save the \`category\` query parameter in a variable called \`category\`. A **query parameter** is the part of the address after the \`?\`. Mule puts it in \`attributes.queryParams\`.
- Select the matching rows, sorted by name. Use a named parameter, \`:category\`, in the SQL. The value goes in the Select's Input Parameters setting, which is not shown on the canvas: \`#[{ category: vars.category }]\`.
- Return a JSON array with the fields \`sku\`, \`name\` and \`price\`. In DataWeave each item looks like \`{ sku: ..., name: ..., price: ... }\`.

The website should not see the table's column names.

**Design the flow.**
`,
  answerTemplate: `## Reading the category

## The SQL

## Shaping the response
`,
  keyPoints: [
    'Query parameters arrive in attributes.queryParams, not in the payload.',
    'A named parameter such as :category keeps the value apart from the SQL text, which protects against SQL injection.',
    'Database Select puts the rows in the payload as a list, one item per row.',
    'A Transform turns the rows into JSON and renames columns, so the API stays stable if the table changes.',
    'A category with no products gives an empty list, and the API returns [].',
  ],
  solution: `
1. **HTTP Listener**: \`GET /products\`.
2. **Set Variable** \`category\`: \`#[attributes.queryParams.category]\`.
3. **Database Select** on MySQL:

\`\`\`sql
SELECT sku, product_name, unit_price
FROM products
WHERE category = :category
ORDER BY product_name
\`\`\`

Input Parameters: \`#[{ category: vars.category }]\`.

4. **Transform Message**:

\`\`\`
%dw 2.0
output application/json
---
payload map {
  sku: $.sku,
  name: $.product_name,
  price: $.unit_price
}
\`\`\`

The Transform is the last step, so its result is the response body.

**Why not join the value into the SQL text?** A caller could send text that changes the meaning of the query. This attack is called **SQL injection**. With a named parameter, the value is only ever treated as data.
`,
  followUps: [
    {
      q: 'A category has no products. Is that an error?',
      a: 'Not for the database. The Select returns an empty list, so the Transform returns [] with a success status. For a list, that is usually the right answer.',
    },
    {
      q: 'What should happen if the caller leaves out the category?',
      a: 'As designed, the parameter is null and no rows match, so the caller gets [] and no hint about the mistake. A Validate step before the Select could reject the request instead.',
    },
    {
      q: 'The table grows to a million rows in one category. What do you change?',
      a: 'Add paging in the SQL so each call returns a limited number of rows, and let the caller ask for the next page. Do the limiting in the database, not after the rows reach Mule.',
    },
  ],
}

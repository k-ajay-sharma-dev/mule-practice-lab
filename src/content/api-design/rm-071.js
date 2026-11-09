export default {
  id: 'rm-071',
  category: 'api-design',
  title: 'Recipe Box API: One paged Trait on Two Lists',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'traits', 'paging', 'query-parameters', 'media'],
  estMinutes: 12,
  description: `
A recipe app holds 40,000 recipes and 1,200 cookbooks. The mobile app shows 20 items on a screen, so both lists must be paged with \`offset\` and \`limit\`. Last year each team wrote its own paging, and one list allowed a limit of 5,000 that took the database down.

A **trait** holds parts of a method that many methods share. You declare it once under \`traits\`, then apply it with \`is: [ paged ]\`. The method gets every query parameter the trait holds, as if you had written them on the method.

**Requirements**
- Title \`Recipe Box API\`, with JSON as the default media type.
- A type \`Recipe\` with a required string \`recipeId\`, a required string \`name\` and a required integer \`minutes\`.
- A type \`Cookbook\` with a required string \`cookbookId\` and a required string \`title\`.
- A trait \`paged\` with:
  - an optional integer \`offset\`, at least 0, with a default of 0
  - an optional integer \`limit\`, from 1 to 100, with a default of 20
- \`GET /recipes\` uses \`paged\` and returns \`Recipe[]\` with status 200.
- \`GET /cookbooks\` uses \`paged\` and returns \`Cookbook[]\` with status 200.
- \`offset\` and \`limit\` come from the trait. Do not write them on the methods.
`,
  starter: `#%RAML 1.0
title: Recipe Box API
mediaType: application/json

types:

traits:
  paged:

/recipes:
  get:

/cookbooks:
  get:
`,
  ramlChecks: [
    {
      label: 'The title is Recipe Box API and JSON is the default media type',
      rule: {
        type: 'all',
        rules: [
          { type: 'root', key: 'title', want: 'Recipe Box API' },
          { type: 'root', key: 'mediaType', want: 'application/json' },
        ],
      },
    },
    {
      label: 'Recipe has a required recipeId, name and integer minutes',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Recipe', prop: 'recipeId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Recipe', prop: 'name', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Recipe', prop: 'minutes', want: { type: 'integer', required: true } },
        ],
      },
    },
    {
      label: 'The paged trait declares offset and limit',
      rule: {
        type: 'all',
        rules: [
          { type: 'trait', name: 'paged', has: 'queryParameters.offset' },
          { type: 'trait', name: 'paged', has: 'queryParameters.limit' },
        ],
      },
    },
    { label: 'GET /recipes uses the paged trait', rule: { type: 'applied', path: '/recipes', method: 'get', trait: 'paged' } },
    {
      label: 'GET /recipes has an optional integer offset, at least 0, default 0',
      rule: { type: 'param', path: '/recipes', method: 'get', in: 'query', name: 'offset', want: { type: 'integer', required: false, minimum: 0, default: 0 } },
    },
    {
      label: 'GET /recipes has an optional integer limit from 1 to 100, default 20',
      rule: { type: 'param', path: '/recipes', method: 'get', in: 'query', name: 'limit', want: { type: 'integer', required: false, minimum: 1, maximum: 100, default: 20 } },
    },
    { label: 'GET /cookbooks uses the paged trait', rule: { type: 'applied', path: '/cookbooks', method: 'get', trait: 'paged' } },
    {
      label: 'GET /cookbooks gets the same limit from the trait',
      rule: { type: 'param', path: '/cookbooks', method: 'get', in: 'query', name: 'limit', want: { type: 'integer', required: false, maximum: 100 } },
    },
    { label: 'GET /recipes returns Recipe[]', rule: { type: 'response', path: '/recipes', method: 'get', status: '200', typeIs: 'Recipe[]' } },
    {
      label: 'GET /cookbooks returns Cookbook[], and Cookbook has a required cookbookId and title',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/cookbooks', method: 'get', status: '200', typeIs: 'Cookbook[]' },
          { type: 'prop', typeName: 'Cookbook', prop: 'cookbookId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Cookbook', prop: 'title', want: { type: 'string', required: true } },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Recipe Box API
mediaType: application/json

types:
  Recipe:
    type: object
    properties:
      recipeId: string
      name: string
      minutes:
        type: integer
        minimum: 1
  Cookbook:
    type: object
    properties:
      cookbookId: string
      title: string

traits:
  paged:
    usage: Apply to any GET that returns a list.
    queryParameters:
      offset?:
        type: integer
        minimum: 0
        default: 0
        description: How many items to skip.
      limit?:
        type: integer
        minimum: 1
        maximum: 100
        default: 20
        description: How many items to return.

/recipes:
  get:
    is: [ paged ]
    responses:
      200:
        body:
          type: Recipe[]

/cookbooks:
  get:
    is: [ paged ]
    responses:
      200:
        body:
          type: Cookbook[]
`,
  keyPoints: [
    'A trait is declared once under traits and applied with is: [ name ].',
    'Everything in the trait is merged into the method, so the method gets offset and limit.',
    'A maximum on limit protects the backend from one huge page.',
    'A default tells callers what they get when they leave the parameter out.',
    'The usage key tells other developers where the trait belongs.',
  ],
  solution: `
\`paged\` holds the paging rules once. Both lists apply it, so both get the same \`offset\` and \`limit\` with the same limits.

\`maximum: 100\` is the rule that would have saved the database last year. Because it sits in the trait, a new list that applies \`paged\` gets it too.

The \`?\` after \`offset\` and \`limit\` makes them optional, and the defaults say what happens when a caller leaves them out. A first call with no parameters returns the first 20 items.

You could also write \`is: [ paged ]\` on the resource instead of the method. It then applies to every method of that resource, which suits a resource that only has \`get\`.
`,
  followUps: [
    {
      q: 'What happens if a method writes its own limit and also applies paged?',
      a: 'The method wins. What is written on the method is kept, and the trait only fills in what is missing.',
    },
    {
      q: 'Why offset and limit and not page and pageSize?',
      a: 'Both work. Offset and limit map straight onto most SQL databases. Page numbers are friendlier for a screen with page buttons, so pick one style and use it in every API.',
    },
    {
      q: 'Does the trait stop a caller sending limit=5000?',
      a: 'The contract says 100 is the maximum. The APIkit router in Mule validates query parameters against the RAML, so a call with 5000 gets a 400 before your flow runs.',
    },
    {
      q: 'When does offset paging get slow?',
      a: 'Deep offsets make the database read and skip many rows. For very large lists, cursor paging with a token from the last page scales better.',
    },
  ],
}

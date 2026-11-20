export default {
  id: 'rm-132',
  category: 'api-design',
  title: 'Product Categories API: A Type That Contains Itself',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'data-types', 'recursive-types', 'trees', 'traits', 'query-parameters', 'retail'],
  estMinutes: 20,
  description: `
Hearthstone Hardware sells DIY goods online. Its categories form a tree: **Tools** holds **Power tools**, which holds **Drills** and **Saws**. Some branches are two levels deep, others five.

The old API had types \`Level1Category\`, \`Level2Category\` and \`Level3Category\`, and could not show a fourth level. The new contract uses one type that **refers to itself**: a \`Category\` can hold a list of \`Category\`. RAML allows this. Make the list optional, so a leaf can leave it out and end the tree.

The tree is large, so callers choose how deep it goes with a \`depth\` query parameter. Both read methods use it, so it lives in a trait.

**Requirements**
- Title \`Product Categories API\`, with JSON as the default media type.
- A type \`Category\` with:
  - \`categoryId\`: required, \`CAT-\` and three digits, such as \`CAT-120\`.
  - \`name\`: a required string.
  - \`productCount\`: a required integer of at least 0.
  - \`children\`: an **optional** array of \`Category\`.
- \`Category\` has an example that is at least two levels deep.
- A type \`Error\` with a required string \`message\`.
- A trait \`treeDepth\` with an optional integer query parameter \`depth\` from 1 to 5, default 2.
- \`GET /categories\` uses \`treeDepth\` and returns \`Category[]\` with 200.
- \`GET /categories/{categoryId}\` uses \`treeDepth\`, returns a \`Category\` with 200, and an \`Error\` with 404.
`,
  starter: `#%RAML 1.0
title: Product Categories API
mediaType: application/json

types:
  Level1Category:
    type: object
    properties:
      categoryId: string
      name: string
      children: Level2Category[]
  Level2Category:
    type: object
    properties:
      categoryId: string
      name: string

/categories:
  get:
    responses:
      200:
        body:
          type: Level1Category[]
`,
  ramlChecks: [
    {
      label: 'The title is Product Categories API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Product Categories API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'Category has categoryId as CAT- and three digits, and a required name',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Category', prop: 'categoryId', want: { required: true, pattern: { accepts: ['CAT-120', 'CAT-000'], rejects: ['CAT-12', 'cat-120', 'CAT-1200', 'CAT120', 'XCAT-120'] } } },
          { type: 'prop', typeName: 'Category', prop: 'name', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'productCount is a required integer of at least 0',
      rule: { type: 'prop', typeName: 'Category', prop: 'productCount', want: { type: 'integer', required: true, minimum: 0 } },
    },
    {
      label: 'children is an optional array of Category',
      rule: { type: 'prop', typeName: 'Category', prop: 'children', want: { type: 'Category[]', required: false } },
    },
    {
      label: 'Category has an example',
      rule: { type: 'any', rules: [{ type: 'typeDecl', name: 'Category', want: { example: { set: true } } }, { type: 'typeDecl', name: 'Category', want: { examples: { set: true } } }] },
    },
    {
      label: 'The treeDepth trait holds depth',
      rule: { type: 'trait', name: 'treeDepth', has: 'queryParameters.depth' },
    },
    {
      label: 'GET /categories uses treeDepth: an optional integer depth from 1 to 5, default 2',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/categories', method: 'get', trait: 'treeDepth' },
          { type: 'param', path: '/categories', method: 'get', in: 'query', name: 'depth', want: { type: 'integer', required: false, minimum: 1, maximum: 5, default: 2 } },
        ],
      },
    },
    {
      label: 'GET /categories returns Category[] with 200',
      rule: { type: 'response', path: '/categories', method: 'get', status: '200', typeIs: 'Category[]' },
    },
    {
      label: 'GET /categories/{categoryId} uses treeDepth, returns a Category with 200 and an Error with 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/categories/{}', method: 'get', trait: 'treeDepth' },
          { type: 'response', path: '/categories/{}', method: 'get', status: '200', typeIs: 'Category' },
          { type: 'response', path: '/categories/{}', method: 'get', status: '404', typeIs: 'Error' },
          { type: 'prop', typeName: 'Error', prop: 'message', want: { type: 'string', required: true } },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Product Categories API
version: v1
baseUri: https://api.example.com/catalogue/{version}
mediaType: application/json

types:
  Category:
    type: object
    properties:
      categoryId:
        type: string
        pattern: ^CAT-[0-9]{3}$
      name: string
      productCount:
        type: integer
        minimum: 0
      children?:
        type: Category[]
        description: The categories one level down. Left out for a leaf, or when depth stops the tree here.
    example:
      categoryId: CAT-100
      name: Tools
      productCount: 840
      children:
        - categoryId: CAT-120
          name: Power tools
          productCount: 310
          children:
            - categoryId: CAT-121
              name: Drills
              productCount: 95
            - categoryId: CAT-122
              name: Saws
              productCount: 60
  Error:
    type: object
    properties:
      message: string

traits:
  treeDepth:
    queryParameters:
      depth?:
        type: integer
        minimum: 1
        maximum: 5
        default: 2
        description: How many levels to return, counting the top one. Deeper levels are left out.

/categories:
  get:
    is: [ treeDepth ]
    responses:
      200:
        body:
          type: Category[]
  /{categoryId}:
    get:
      is: [ treeDepth ]
      responses:
        200:
          body:
            type: Category
        404:
          body:
            type: Error
`,
  keyPoints: [
    'A RAML type can refer to itself, which models a tree of any depth with one type.',
    'An optional self-reference lets a leaf leave it out. A required single Category, not a list, could never end.',
    'A depth parameter with a maximum keeps the response size under control.',
    'A trait shares the depth parameter between the list and the single item.',
    'An example two levels deep shows readers how the nesting looks.',
  ],
  solution: `
**One type for every level.** \`children?: Category[]\` lets a category hold categories, which hold categories, and so on. A fourth or fifth level needs no new type. The old \`Level1Category\` and \`Level2Category\` go away.

**Why optional.** If \`children\` were required, every leaf would have to send an empty list, and a category cut off by \`depth\` would look like a leaf. Making it optional lets Drills and Saws leave it out. A required property of type \`Category\`, a single object rather than a list, would be worse: every category would need a child, and no example could ever end.

**depth.** The full tree has thousands of categories. \`depth\` from 1 to 5, with 2 as the default, keeps a response small. \`maximum: 5\` stops a caller from asking for the whole tree in one call. The description says what happens to the levels below: they are left out.

**A trait.** The list and the single category both take \`depth\`. Writing it once in \`treeDepth\` keeps the two the same.

**The example.** Tools holds Power tools, which holds Drills and Saws. That is three levels, so readers can see the nesting without reading the type twice.
`,
  followUps: [
    {
      q: 'How does a client know a category has more levels below the depth it asked for?',
      a: 'Add a property such as `hasChildren: boolean`. A category cut off by depth then shows `hasChildren: true` with no `children`, and the client can ask for that category on its own.',
    },
    {
      q: 'Why not return a flat list with a parentId on each category?',
      a: 'That also works, and a flat list pages well. The client then builds the tree itself. Some APIs offer both: a nested tree for menus and a flat list for search and sync.',
    },
    {
      q: 'Can two types refer to each other, such as Category and Product?',
      a: 'Yes, as long as one of the links is optional. Keep such loops small, because deep nesting makes responses large and hard to read.',
    },
  ],
}

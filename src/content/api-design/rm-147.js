export default {
  id: 'rm-147',
  category: 'api-design',
  title: 'Product Information API: Partial Updates with JSON Patch',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'patch', 'json-patch', 'media-types', 'any-type', 'status-codes', 'retail'],
  estMinutes: 25,
  description: `
Ashdown Hardware's product information team edits thousands of products a day: a new price, one extra tag, a corrected weight. The current API only has \`PUT\`, so every small edit sends the whole product back, and two editors working on one product overwrite each other's changes.

The team chooses **JSON Patch** (RFC 6902). A patch is a list of operations, applied in order, and the whole list either succeeds or changes nothing. The \`test\` operation lets the editor say "only change the price if it is still 12.50".

**Requirements**
- Title \`Product Information API\`, with JSON as the default media type.
- A type \`Product\` with a required \`sku\` (\`AH-\` and six digits), a required string \`name\`, a required number \`price\` of at least 0, and a required list of strings \`tags\`.
- A type \`PatchOperation\` with:
  - \`op\`: required, one of \`add\`, \`remove\`, \`replace\`, \`move\`, \`copy\`, \`test\`
  - \`path\`: a required string that starts with \`/\`, such as \`/price\` or \`/tags/0\`
  - \`from\`: an optional string, used by \`move\` and \`copy\`
  - \`value\`: optional, of type \`any\`, since a value can be a number, a string, a list or an object
- A type \`PatchDocument\`: a list of \`PatchOperation\` with at least 1 item.
- A type \`Problem\` with a required string \`title\` and a required string \`detail\`.
- \`GET /products/{sku}\` returns a \`Product\` with 200 and a \`Problem\` with 404.
- \`PATCH /products/{sku}\` takes a \`PatchDocument\` with the media type \`application/json-patch+json\`. It returns the updated \`Product\` with 200, a \`Problem\` with 404, a \`Problem\` with 409 when a \`test\` operation fails, and a \`Problem\` with 422 when an operation cannot be applied, such as removing a path that does not exist.
`,
  starter: `#%RAML 1.0
title: Product Information API
mediaType: application/json

types:
  Product:
    type: object
    properties:
      sku: string
      name: string
      price: number
      tags: string[]

/products/{sku}:
  get:
    responses:
      200:
        body:
          type: Product
  patch:
    body:
      type: Product
    responses:
      200:
        body:
          type: Product
`,
  ramlChecks: [
    {
      label: 'The title is Product Information API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Product Information API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'Product has a sku of AH- and six digits, a name, a price of at least 0 and string tags',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Product', prop: 'sku', want: { required: true, pattern: { accepts: ['AH-310442', 'AH-000001'], rejects: ['AH-31044', 'ah-310442', 'AH-3104420', 'AH310442', 'XAH-310442'] } } },
          { type: 'prop', typeName: 'Product', prop: 'name', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Product', prop: 'price', want: { type: 'number', required: true, minimum: 0 } },
          { type: 'prop', typeName: 'Product', prop: 'tags', want: { type: 'string[]', required: true } },
        ],
      },
    },
    {
      label: 'PatchOperation has a required op from the six JSON Patch operations',
      rule: { type: 'prop', typeName: 'PatchOperation', prop: 'op', want: { required: true, enum: { exactly: ['add', 'remove', 'replace', 'move', 'copy', 'test'] } } },
    },
    {
      label: 'PatchOperation has a required path that starts with a slash',
      rule: { type: 'prop', typeName: 'PatchOperation', prop: 'path', want: { type: 'string', required: true, pattern: { accepts: ['/price', '/tags/0', '/dimensions/weightKg'], rejects: ['price', 'tags/0'] } } },
    },
    {
      label: 'PatchOperation has an optional string from and an optional value of type any',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'PatchOperation', prop: 'from', want: { type: 'string', required: false } },
          { type: 'prop', typeName: 'PatchOperation', prop: 'value', want: { type: 'any', required: false } },
        ],
      },
    },
    {
      label: 'PatchDocument is a list of PatchOperation with at least 1 item',
      rule: { type: 'typeDecl', name: 'PatchDocument', want: { type: 'PatchOperation[]', minItems: 1 } },
    },
    {
      label: 'Problem has a required title and a required detail',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Problem', prop: 'title', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Problem', prop: 'detail', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'GET /products/{sku} returns a Product with 200 and a Problem with 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/products/{}', method: 'get', status: '200', typeIs: 'Product' },
          { type: 'response', path: '/products/{}', method: 'get', status: '404', typeIs: 'Problem' },
        ],
      },
    },
    {
      label: 'PATCH /products/{sku} takes a PatchDocument as application/json-patch+json and returns the Product',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/products/{}', method: 'patch', media: 'application/json-patch+json', typeIs: 'PatchDocument' },
          { type: 'response', path: '/products/{}', method: 'patch', status: '200', typeIs: 'Product' },
        ],
      },
    },
    {
      label: 'PATCH answers a Problem with 404, 409 for a failed test and 422 for an operation that cannot be applied',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/products/{}', method: 'patch', status: '404', typeIs: 'Problem' },
          { type: 'response', path: '/products/{}', method: 'patch', status: '409', typeIs: 'Problem' },
          { type: 'response', path: '/products/{}', method: 'patch', status: '422', typeIs: 'Problem' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Product Information API
version: v1
baseUri: https://api.example.com/product-info/{version}
mediaType: application/json

types:
  Product:
    type: object
    properties:
      sku:
        type: string
        pattern: ^AH-[0-9]{6}$
      name: string
      price:
        type: number
        minimum: 0
      tags: string[]
    example:
      sku: AH-310442
      name: Brass cabinet hinge, pair
      price: 12.5
      tags: [ hinges, brass ]
  PatchOperation:
    type: object
    properties:
      op:
        type: string
        enum: [ add, remove, replace, move, copy, test ]
      path:
        type: string
        pattern: ^/
        description: A JSON Pointer to the field, such as /price or /tags/0.
      from?:
        type: string
        description: The source path for move and copy.
      value?:
        type: any
        description: The new value for add and replace, or the expected value for test.
  PatchDocument:
    type: PatchOperation[]
    minItems: 1
    example:
      - op: test
        path: /price
        value: 12.5
      - op: replace
        path: /price
        value: 11.99
      - op: add
        path: /tags/-
        value: clearance
  Problem:
    type: object
    properties:
      title: string
      detail: string

/products/{sku}:
  get:
    responses:
      200:
        body:
          type: Product
      404:
        body:
          type: Problem
  patch:
    description: Applies the operations in order. If any operation fails, nothing is changed.
    body:
      application/json-patch+json:
        type: PatchDocument
    responses:
      200:
        description: The product after every operation was applied.
        body:
          type: Product
      404:
        body:
          type: Problem
      409:
        description: A test operation did not match, so the product changed since the editor read it.
        body:
          type: Problem
      422:
        description: An operation could not be applied, for example a path that does not exist.
        body:
          type: Problem
`,
  keyPoints: [
    'A JSON Patch body is a list of operations, applied in order, all or nothing.',
    'The media type application/json-patch+json tells the server how to read the body.',
    'Paths are JSON Pointers that start with a slash, such as /tags/0.',
    'value has type any, because an operation can set a number, a text, a list or an object.',
    'The test operation gives a simple guard against overwriting another editor.',
    'Different failures get different codes: 409 for a failed test, 422 for an operation that cannot be applied.',
  ],
  solution: `
**Why PATCH.** PUT replaces the whole product, so an editor who changes the price also sends back the tags they loaded minutes ago, and may undo another editor's change. A patch sends only what changes.

**JSON Patch or merge patch.** A merge patch is a partial object, which is fine for setting fields. It cannot say "add to the end of this list" or "only if the price is still 12.50". JSON Patch can: \`/tags/-\` adds at the end of a list, and \`test\` checks a value first.

**Its own media type.** The body is not a product, so it gets \`application/json-patch+json\`. A server can then answer 415 to a patch sent with the wrong media type, and a reader of the contract sees at once what the body is.

**Typing the operations.** \`op\` is an enum of the six operations. \`path\` must start with \`/\`. \`from\` and \`value\` are optional because only some operations use them, and \`value\` is \`any\` because a price is a number and a tag is a string.

**Status codes.** A failed \`test\` means the product changed under the editor, which is a conflict with the current state, so 409. A path that does not exist means the patch cannot be applied as written, so 422. In both cases nothing was changed.
`,
  followUps: [
    {
      q: 'How does the Mule app apply a JSON Patch?',
      a: 'Check whether your runtime or a library you already use supports RFC 6902. If not, write a small DataWeave or Java step that walks the operations in order and fails the whole request if any one fails.',
    },
    {
      q: 'Should every field be patchable?',
      a: 'No. Reject operations on fields such as sku or audit dates with 422, and list the patchable paths in the description.',
    },
    {
      q: 'Is test enough to stop lost updates?',
      a: 'It guards the fields the editor tests. To guard the whole product, combine PATCH with an ETag and an If-Match header.',
    },
  ],
}

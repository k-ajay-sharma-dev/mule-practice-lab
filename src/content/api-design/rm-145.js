export default {
  id: 'rm-145',
  category: 'api-design',
  title: 'Supplier Records API: Archive Instead of Delete, with includeArchived',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'soft-delete', 'archive', 'action-resources', 'query-parameters', 'status-codes', 'procurement'],
  estMinutes: 20,
  description: `
Ferncastle Builders Merchants keeps its supplier records in a procurement system. Last year someone deleted a supplier through the old API, and finance could no longer open seven years of that supplier's invoices.

The new contract never deletes a supplier. It **archives** it instead: the record stays, but it is hidden from normal lists and no new orders can use it. An archived supplier can be restored.

**Requirements**
- Title \`Supplier Records API\`, with JSON as the default media type.
- A type \`Supplier\` with:
  - \`supplierId\`: required, \`SUP-\` and five digits
  - \`name\`: a required string
  - \`status\`: required, one of \`ACTIVE\`, \`ARCHIVED\`
  - \`archivedAt\`: an optional \`datetime\`
- A type \`Error\` with a required string \`message\`.
- \`GET /suppliers\` takes an optional boolean query parameter \`includeArchived\`, default \`false\`, and returns a list of \`Supplier\` with 200.
- \`GET /suppliers/{supplierId}\` returns a \`Supplier\` with 200, archived or not, and an \`Error\` with 404.
- \`/suppliers/{supplierId}\` offers no \`delete\`.
- \`POST /suppliers/{supplierId}/archive\` returns the \`Supplier\` with 200, an \`Error\` with 404, and an \`Error\` with 409 when it is already archived.
- \`POST /suppliers/{supplierId}/restore\` returns the \`Supplier\` with 200, an \`Error\` with 404, and an \`Error\` with 409 when it is not archived.
`,
  starter: `#%RAML 1.0
title: Supplier Records API
mediaType: application/json

types:
  Supplier:
    type: object
    properties:
      supplierId: string
      name: string

/suppliers:
  get:
    responses:
      200:
        body:
          type: Supplier[]
  /{supplierId}:
    get:
      responses:
        200:
          body:
            type: Supplier
    delete:
      responses:
        204:
`,
  ramlChecks: [
    {
      label: 'The title is Supplier Records API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Supplier Records API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'Supplier has a supplierId of SUP- and five digits, a name, a status and an optional archivedAt',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Supplier', prop: 'supplierId', want: { required: true, pattern: { accepts: ['SUP-40211', 'SUP-00001'], rejects: ['SUP-4021', 'sup-40211', 'SUP-402110', 'SUP40211', 'XSUP-40211'] } } },
          { type: 'prop', typeName: 'Supplier', prop: 'name', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Supplier', prop: 'status', want: { required: true, enum: { exactly: ['ACTIVE', 'ARCHIVED'] } } },
          { type: 'prop', typeName: 'Supplier', prop: 'archivedAt', want: { type: 'datetime', required: false } },
        ],
      },
    },
    {
      label: 'Error has a required string message',
      rule: { type: 'prop', typeName: 'Error', prop: 'message', want: { type: 'string', required: true } },
    },
    {
      label: 'GET /suppliers takes an optional boolean includeArchived with default false and returns a Supplier list',
      rule: {
        type: 'all',
        rules: [
          { type: 'param', path: '/suppliers', method: 'get', in: 'query', name: 'includeArchived', want: { type: 'boolean', required: false, default: false } },
          { type: 'response', path: '/suppliers', method: 'get', status: '200', typeIs: 'Supplier[]' },
        ],
      },
    },
    {
      label: 'GET /suppliers/{supplierId} returns a Supplier or a 404, and there is no delete',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/suppliers/{}', method: 'get', status: '200', typeIs: 'Supplier' },
          { type: 'response', path: '/suppliers/{}', method: 'get', status: '404', typeIs: 'Error' },
          { type: 'noMethod', path: '/suppliers/{}', method: 'delete' },
        ],
      },
    },
    {
      label: 'POST /suppliers/{supplierId}/archive returns the Supplier, or an Error with 404 or 409',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/suppliers/{}/archive', method: 'post', status: '200', typeIs: 'Supplier' },
          { type: 'response', path: '/suppliers/{}/archive', method: 'post', status: '404', typeIs: 'Error' },
          { type: 'response', path: '/suppliers/{}/archive', method: 'post', status: '409', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'POST /suppliers/{supplierId}/restore returns the Supplier, or an Error with 404 or 409',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/suppliers/{}/restore', method: 'post', status: '200', typeIs: 'Supplier' },
          { type: 'response', path: '/suppliers/{}/restore', method: 'post', status: '404', typeIs: 'Error' },
          { type: 'response', path: '/suppliers/{}/restore', method: 'post', status: '409', typeIs: 'Error' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Supplier Records API
version: v1
baseUri: https://api.example.com/suppliers/{version}
mediaType: application/json

types:
  Supplier:
    type: object
    properties:
      supplierId:
        type: string
        pattern: ^SUP-[0-9]{5}$
      name: string
      status:
        type: string
        enum: [ ACTIVE, ARCHIVED ]
      archivedAt?:
        type: datetime
        description: Set when the supplier was archived. Not present for active suppliers.
    examples:
      active:
        supplierId: SUP-40211
        name: Brookside Timber Ltd
        status: ACTIVE
      archived:
        supplierId: SUP-17730
        name: Old Quarry Aggregates
        status: ARCHIVED
        archivedAt: 2026-06-30T16:00:00Z
  Error:
    type: object
    properties:
      message: string

/suppliers:
  get:
    queryParameters:
      includeArchived:
        type: boolean
        default: false
        required: false
        description: Archived suppliers are left out unless this is true.
    responses:
      200:
        body:
          type: Supplier[]
  /{supplierId}:
    description: Suppliers are never deleted, because invoices and orders refer to them. Archive them instead.
    get:
      description: Returns archived suppliers too, so old invoices can always show who they came from.
      responses:
        200:
          body:
            type: Supplier
        404:
          body:
            type: Error
    /archive:
      post:
        responses:
          200:
            body:
              type: Supplier
          404:
            body:
              type: Error
          409:
            description: The supplier is already archived.
            body:
              type: Error
    /restore:
      post:
        responses:
          200:
            body:
              type: Supplier
          404:
            body:
              type: Error
          409:
            description: The supplier is not archived.
            body:
              type: Error
`,
  keyPoints: [
    'A record that other records point to is archived, not deleted.',
    'Leaving delete out of the contract means no caller can remove a supplier through the API.',
    'Archive and restore are action resources, each a POST that changes the status.',
    'Lists hide archived records by default. includeArchived brings them back.',
    'A direct GET by id still returns an archived record, so old links keep working.',
    '409 says the action does not fit the current status.',
  ],
  solution: `
**Why not delete.** Invoices, orders and payments point at the supplier. Deleting it breaks those links, or forces the database to refuse the delete. Archiving keeps the record and only changes how it is used.

**Two views.** \`GET /suppliers\` hides archived suppliers, because buyers should not pick them for new orders. \`includeArchived=true\` shows them for finance and audits. \`GET /suppliers/{supplierId}\` always answers, so an old invoice can still show its supplier.

**Actions as sub-resources.** Archiving is more than a field change: the System API may also block open orders or notify buyers. \`POST /archive\` and \`POST /restore\` name the action, and each can be secured and logged on its own. A \`PATCH\` that sets \`status\` would work too, but hides the meaning inside a body.

**409 for the wrong state.** Archiving an archived supplier, or restoring an active one, conflicts with the current status. 409 tells the caller to read the record again before it acts.

**No delete at all.** The method is not in the contract, so APIkit's scaffolded error handling answers 405 if someone tries.
`,
  followUps: [
    {
      q: 'The law says some supplier data must be erased after ten years. How does that fit?',
      a: 'Run a separate retention job that removes or masks the personal fields of long archived suppliers, with its own approval. That is a data rule, not something every API caller should be able to do.',
    },
    {
      q: 'Should restore be allowed for everyone who may archive?',
      a: 'Often not. Restoring a supplier that was archived for fraud is risky, so many teams give restore a separate scope held by procurement managers.',
    },
    {
      q: 'Why is archivedAt optional and not string | nil?',
      a: 'It only makes sense for archived suppliers, so it is left out for active ones. Either style works if the team uses it the same way across its APIs.',
    },
  ],
}

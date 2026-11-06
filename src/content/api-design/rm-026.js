export default {
  id: 'rm-026',
  category: 'api-design',
  title: 'Customer System API: A Contract That Hides a Legacy Database',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'system-api', 'api-led', 'error-handling', 'telecom'],
  estMinutes: 35,
  description: `
A telecom company keeps its customers in a 25 year old database. The table is called \`CUST_MSTR\`, with these columns:

- \`CUST_ID\`, the customer id
- \`CUST_NM\`, the full name
- \`EMAIL_ADDR\`, the email address
- \`STAT_CD\`, the status, holding \`A\` (active), \`S\` (suspended) or \`C\` (closed)
- \`CRT_DT\`, the date the customer joined

A **System API** is the layer in API-led connectivity that sits in front of one backend. Its job is to hide that backend. If callers see \`STAT_CD\`, they are tied to this database forever, and replacing it breaks them all.

A first draft is in the editor. It copies the database straight into the contract. Rewrite it in business language.

**Requirements**
- Title \`Customer System API\`, with JSON as the default media type.
- No table or column names appear in the contract. Remove \`/CUST_MSTR\` and use \`/customers\` and \`/customers/{customerId}\`.
- A type \`CustomerStatus\`, a string that is one of \`ACTIVE\`, \`SUSPENDED\`, \`CLOSED\`. These replace the database codes.
- A type \`Customer\` with required strings \`customerId\`, \`name\` and \`email\`, and a required \`status\` of type \`CustomerStatus\`.
- \`Customer\` has a required \`joinedOn\` that holds a date with no time.
- A type \`Error\` with required strings \`code\` and \`message\`.
- \`GET /customers\` returns \`Customer[]\` with status 200, with an optional \`status\` query parameter of type \`CustomerStatus\`.
- \`GET /customers/{customerId}\` returns a \`Customer\` with status 200, or an \`Error\` with status 404.
- Both methods return an \`Error\` with status 503 and a \`Retry-After\` header when the database cannot be reached.
`,
  starter: `#%RAML 1.0
title: Customer System API
mediaType: application/json

/CUST_MSTR:
  get:
    queryParameters:
      STAT_CD?:
        type: string
        enum: [ A, S, C ]
    responses:
      200:
        description: Rows from CUST_MSTR.
`,
  ramlChecks: [
    {
      label: 'The title is Customer System API and JSON is the default media type',
      rule: {
        type: 'all',
        rules: [
          { type: 'root', key: 'title', want: 'Customer System API' },
          { type: 'root', key: 'mediaType', want: 'application/json' },
        ],
      },
    },
    {
      label: 'The database path is gone and /customers replaces it',
      rule: {
        type: 'all',
        rules: [
          { type: 'noResource', path: '/CUST_MSTR' },
          { type: 'noType', name: 'CUST_MSTR' },
          { type: 'noProp', typeName: 'Customer', prop: 'CUST_ID' },
          { type: 'noProp', typeName: 'Customer', prop: 'CUST_NM' },
          { type: 'resource', path: '/customers' },
        ],
      },
    },
    {
      label: 'Customer has required strings customerId, name and email',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Customer', prop: 'customerId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Customer', prop: 'name', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Customer', prop: 'email', want: { type: 'string', required: true } },
        ],
      },
    },
    { label: 'CustomerStatus uses business words, not the database codes', rule: { type: 'typeDecl', name: 'CustomerStatus', want: { enum: { exactly: ['ACTIVE', 'SUSPENDED', 'CLOSED'] } } } },
    { label: 'Customer has a required status of type CustomerStatus', rule: { type: 'prop', typeName: 'Customer', prop: 'status', want: { type: 'CustomerStatus', required: true } } },
    { label: 'joinedOn is a required date-only', rule: { type: 'prop', typeName: 'Customer', prop: 'joinedOn', want: { type: 'date-only', required: true } } },
    {
      label: 'Error has required code and message',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Error', prop: 'code', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Error', prop: 'message', want: { type: 'string', required: true } },
        ],
      },
    },
    { label: 'GET /customers returns Customer[]', rule: { type: 'response', path: '/customers', method: 'get', status: '200', typeIs: 'Customer[]' } },
    {
      label: 'GET /customers has an optional status filter of type CustomerStatus',
      rule: { type: 'param', path: '/customers', method: 'get', in: 'query', name: 'status', want: { type: 'CustomerStatus', required: false } },
    },
    {
      label: 'GET /customers/{customerId} returns a Customer, or an Error with 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/customers/{}', method: 'get', status: '200', typeIs: 'Customer' },
          { type: 'response', path: '/customers/{}', method: 'get', status: '404', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'Both methods return an Error with 503 and Retry-After',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/customers', method: 'get', status: '503', typeIs: 'Error', header: 'Retry-After' },
          { type: 'response', path: '/customers/{}', method: 'get', status: '503', typeIs: 'Error', header: 'Retry-After' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Customer System API
mediaType: application/json

types:
  CustomerStatus:
    type: string
    enum: [ ACTIVE, SUSPENDED, CLOSED ]
  Customer:
    type: object
    properties:
      customerId: string
      name: string
      email: string
      status: CustomerStatus
      joinedOn: date-only
    example:
      customerId: C-88213
      name: Maria Lopez
      email: maria.lopez@example.com
      status: ACTIVE
      joinedOn: 2019-06-14
  Error:
    type: object
    properties:
      code: string
      message: string

traits:
  backendErrors:
    responses:
      503:
        description: The customer data cannot be reached right now.
        headers:
          Retry-After:
            description: Seconds to wait before trying again.
            type: integer
        body:
          type: Error

/customers:
  get:
    is: [ backendErrors ]
    queryParameters:
      status?: CustomerStatus
    responses:
      200:
        body:
          type: Customer[]
  /{customerId}:
    get:
      is: [ backendErrors ]
      responses:
        200:
          body:
            type: Customer
        404:
          body:
            type: Error
`,
  keyPoints: [
    'A System API hides its backend. Callers should not be able to tell what sits behind it.',
    'Codes such as A, S and C become words. The mapping lives in the implementation.',
    '503 tells callers the failure is temporary and is not their fault.',
    'Error bodies must not leak SQL, table names or stack traces.',
    'If the database is replaced, this contract should not need to change.',
  ],
  solution: `
Nothing in the new contract mentions the database, so the database can be replaced without callers noticing. Only the implementation changes.

The translation moves into the Mule application. A DataWeave script maps \`CUST_NM\` to \`name\` and \`A\` to \`ACTIVE\`. That one script is the only place that knows both worlds.

The \`503\` is a design decision as well. An old database has maintenance windows and outages. Stating this lets callers plan a retry, and \`Retry-After\` tells them when. A trait keeps that response the same on every method.
`,
  followUps: [
    {
      q: 'Why not expose the columns as they are and let the Process API translate?',
      a: 'Every consumer of the System API would repeat that translation, and all of them would be tied to the database. Translating once at the lowest layer protects everything above it.',
    },
    {
      q: 'What should the 503 body contain?',
      a: 'A stable code and a plain message such as customer data unavailable. Keep the driver error, SQL and host names in the logs, with a correlation id so support can link the two.',
    },
    {
      q: 'Is a System API the same as a thin wrapper over one table?',
      a: 'No. Its shape follows a business concept, so it may join several tables to return one customer. The contract is about the concept, not the storage.',
    },
  ],
}

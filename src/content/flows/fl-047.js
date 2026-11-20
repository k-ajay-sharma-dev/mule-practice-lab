import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'
import { handlerStatus } from '../../flow/rules.js'

// The same handler in both resource flows: each flow has its own error handling.
const inBothFlows = (type, status) => ({ type: 'any', rules: handlerStatus(type, status).rules.map((r) => ({ ...r, min: 2 })) })

export default {
  id: 'fl-047',
  category: 'flows',
  title: 'System API over a Customer Database: Paging and 404/503 Mapping',
  level: 'BEGINNER',
  tags: ['myproject', 'api-led', 'system-api', 'database', 'pagination', 'error-handling'],
  estMinutes: 25,
  flowChecks: [
    {
      label: 'The System API is a GET on its own HTTP Listener (path /sys-...)',
      rule: { type: 'source', component: 'http-listener', where: { path: 'sys-', allowedMethods: 'GET' } },
    },
    {
      label: 'Each resource has its own listener: the paged list and one customer by id',
      rule: {
        type: 'all',
        rules: [
          { type: 'source', component: 'http-listener', where: { path: { all: ['customers'], not: '{' } } },
          { type: 'source', component: 'http-listener', where: { path: { all: ['customers', '{'] } } },
        ],
      },
    },
    {
      label: 'The list query is paged in the database (LIMIT/OFFSET), not in memory',
      rule: { type: 'exists', component: 'db-select', where: { sql: { oneOf: ['OFFSET', 'FETCH FIRST', 'FETCH NEXT'] } } },
    },
    {
      label: 'Database rows are mapped to a clean JSON model (column names do not leak)',
      rule: { type: 'before', first: 'db-select', then: 'transform' },
    },
    {
      label: 'An empty result for one customer raises a not-found error',
      rule: {
        type: 'any',
        rules: [
          { type: 'before', first: 'db-select', then: 'raise-error', thenWhere: { type: 'NOT_FOUND' } },
          { type: 'before', first: 'db-select', then: 'validation' },
        ],
      },
    },
    { label: 'The not-found error is mapped to 404', rule: handlerStatus('NOT_FOUND', '404') },
    { label: 'In both flows an unreachable database is mapped to 503', rule: inBothFlows('DB:CONNECTIVITY', '503') },
    { label: 'In both flows a catch-all handler returns a generic 500', rule: inBothFlows('ANY', '500') },
  ],
  simulation: {
    systems: {
      db: {
        latencyMs: 25,
        tables: {
          cust_master: {
            key: 'customer_id',
            rows: [
              { customer_id: 'C-100231', first_nm: 'Ana', last_nm: 'Ribeiro', email_addr: 'ana.ribeiro@example.com', status_cd: 'A' },
              { customer_id: 'C-100232', first_nm: 'Tomasz', last_nm: 'Nowak', email_addr: 't.nowak@example.com', status_cd: 'A' },
              { customer_id: 'C-100233', first_nm: 'Grace', last_nm: 'Mensah', email_addr: 'grace.mensah@example.com', status_cd: 'I' },
              { customer_id: 'C-100234', first_nm: 'Kenji', last_nm: 'Sato', email_addr: 'kenji.sato@example.com', status_cd: 'A' },
              { customer_id: 'C-100235', first_nm: 'Leila', last_nm: 'Haddad', email_addr: 'leila.haddad@example.com', status_cd: 'A' },
            ],
          },
        },
      },
    },
    tests: [
      {
        name: 'A page of customers',
        about: 'The second page of two customers comes back as 200.',
        trigger: { http: { method: 'GET', path: '/sys-customers/v1/customers?page=2&pageSize=2' } },
        expect: { status: 200, maxMs: 300 },
      },
      {
        name: 'One customer',
        about: 'The customer is found, and the answer does not show the column names.',
        trigger: { http: { method: 'GET', path: '/sys-customers/v1/customers/C-100233' } },
        expect: { status: 200, bodyLacks: { first_nm: 'Grace' }, maxMs: 300 },
      },
      {
        name: 'An unknown customer id',
        about: 'No row has this id, so the answer is 404, not 200 with an empty list.',
        trigger: { http: { method: 'GET', path: '/sys-customers/v1/customers/C-999999' } },
        // The API must give the 404 itself, not a missing endpoint.
        expect: { status: 404, bodyLacks: '~No listener for endpoint' },
      },
      {
        name: 'The database is in maintenance',
        about: 'A caller asking for one customer gets 503, so it knows to try later.',
        trigger: { http: { method: 'GET', path: '/sys-customers/v1/customers/C-100231' } },
        overrides: { systems: { db: { fault: 'CONNECTIVITY' } } },
        expect: { status: 503 },
      },
      {
        name: 'The list during maintenance',
        about: 'The paged list also answers 503 while the database cannot be reached.',
        trigger: { http: { method: 'GET', path: '/sys-customers/v1/customers?page=1&pageSize=50' } },
        overrides: { systems: { db: { fault: 'CONNECTIVITY' } } },
        expect: { status: 503 },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'sys-customers-list',
      source('http-listener', { path: '/sys-customers/v1/customers', allowedMethods: 'GET' }),
      [
        step('set-variable', { variableName: 'page', value: '#[(attributes.queryParams.page default "1") as Number]' }),
        step('set-variable', {
          variableName: 'pageSize',
          value: '#[min([(attributes.queryParams.pageSize default "50") as Number, 200])]',
        }),
        step('set-variable', { variableName: 'offset', value: '#[(vars.page - 1) * vars.pageSize]' }),
        step('db-select', {
          sql: 'SELECT customer_id, first_nm, last_nm, email_addr, status_cd\nFROM cust_master\nORDER BY customer_id\nLIMIT :pageSize OFFSET :offset',
        }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{\n  page: vars.page,\n  pageSize: vars.pageSize,\n  items: payload map {\n    id: $.customer_id,\n    firstName: $.first_nm,\n    lastName: $.last_nm,\n    email: $.email_addr,\n    active: $.status_cd == "A"\n  }\n}',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'DB:CONNECTIVITY' }, [
          step('set-variable', { variableName: 'httpStatus', value: '503' }),
          step('set-payload', { value: '#[output application/json --- { code: "SERVICE_UNAVAILABLE", message: "Customer store unavailable" }]' }),
        ]),
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#[correlationId ++ " " ++ error.description]' }),
          step('set-variable', { variableName: 'httpStatus', value: '500' }),
        ]),
      ],
    ),
    flow(
      'sys-customers-get',
      source('http-listener', { path: '/sys-customers/v1/customers/{customerId}', allowedMethods: 'GET' }),
      [
        step('db-select', {
          sql: 'SELECT customer_id, first_nm, last_nm, email_addr, status_cd\nFROM cust_master\nWHERE customer_id = :customerId',
        }),
        router(
          'choice',
          {},
          [route({ expression: '#[isEmpty(payload)]' }, [step('raise-error', { type: 'APP:NOT_FOUND', description: 'Customer not found' })])],
          {
            otherwise: [
              step('transform', {
                script:
                  '%dw 2.0\noutput application/json\nvar c = payload[0]\n---\n{\n  id: c.customer_id,\n  firstName: c.first_nm,\n  lastName: c.last_nm,\n  email: c.email_addr,\n  active: c.status_cd == "A"\n}',
              }),
            ],
          },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'APP:NOT_FOUND' }, [
          step('set-variable', { variableName: 'httpStatus', value: '404' }),
          step('set-payload', { value: '#[output application/json --- { code: "NOT_FOUND", message: error.description }]' }),
        ]),
        handler('on-error-propagate', { type: 'DB:CONNECTIVITY' }, [
          step('set-variable', { variableName: 'httpStatus', value: '503' }),
          step('set-payload', { value: '#[output application/json --- { code: "SERVICE_UNAVAILABLE", message: "Customer store unavailable" }]' }),
        ]),
        handler('on-error-propagate', { type: 'ANY' }, [step('set-variable', { variableName: 'httpStatus', value: '500' })]),
      ],
    ),
  ),
  description: `
You own the **Customers System API**: the only way the rest of the application network may read the legacy customer database (PostgreSQL, table \`cust_master\`, ~4 million rows, cryptic columns: \`customer_id\`, \`first_nm\`, \`last_nm\`, \`email_addr\` and \`status_cd\`, which is \`A\` for active).

Resources:
- \`GET /sys-customers/v1/customers?page=&pageSize=\`: paged list (default 50, max 200).
- \`GET /sys-customers/v1/customers/{customerId}\`: one customer.

Constraints:
- Callers are Process APIs; they must never see table or column names.
- An unknown id must return **404**, not 200 with \`[]\`.
- During DB maintenance windows the database is unreachable: callers need **503** so they can fall back or retry.
- p95 latency budget: **300 ms**.

**Convention for API-led problems:** one canvas holds the whole application network. Draw each API as a separate flow whose name starts with its layer prefix (\`exp-\`, \`prc-\`, \`sys-\`), give it an HTTP Listener whose path shows the API (e.g. \`/sys-customers/v1/customers\`), and let layers call each other with HTTP Request pointing at the lower API's path. Here you only draw the system layer (one flow per resource is fine).

**Design the flow(s):** listener paths, how paging is done, how rows become the API model, and how each error becomes a status.
`,
  answerTemplate: `## Resources and flows

## Paging

## Mapping to the API model

## Not found

## Database unavailable / other errors
`,
  keyPoints: [
    'A System API unlocks exactly one system and exposes a stable, system-neutral contract: callers never see table or column names.',
    'Paging belongs in the SQL (LIMIT/OFFSET or keyset) with a capped pageSize; selecting 4 million rows and slicing in DataWeave would blow memory and the 300 ms budget.',
    'An empty result is not an error to the database: the API must turn it into APP:NOT_FOUND explicitly and map it to 404.',
    'DB:CONNECTIVITY maps to 503 so Process APIs can tell "try later" apart from "bad request" or "not found".',
    'A catch-all ANY handler returns a generic 500 and logs the detail with the correlation ID instead of leaking stack traces.',
  ],
  solution: `
\`\`\`
   prc-* (any Process API)
            |  HTTP GET /sys-customers/v1/customers...
            v
 +---------------------------+
 | SYSTEM  sys-customers     |   contract: Customer { id, firstName, lastName, email, active }
 +---------------------------+
            |  JDBC (only this API holds the credentials)
            v
      PostgreSQL cust_master
\`\`\`

**sys-customers-list**: HTTP Listener \`GET /sys-customers/v1/customers\`
1. Set Variable \`page\` and \`pageSize\` (default 50, \`min(..., 200)\` caps it).
2. Database Select \`... ORDER BY customer_id LIMIT :pageSize OFFSET :offset\`: paging in the database. A stable \`ORDER BY\` is mandatory or pages overlap.
3. Transform Message maps \`first_nm\` → \`firstName\`, \`status_cd == "A"\` → \`active\` and wraps it in \`{ page, pageSize, items }\`.

**sys-customers-get**: HTTP Listener \`GET /sys-customers/v1/customers/{customerId}\`
1. Database Select by id (parameterised: never string-concatenate SQL).
2. Choice: \`isEmpty(payload)\` → Raise Error \`APP:NOT_FOUND\`; otherwise Transform \`payload[0]\` to the API model.

**Error mapping** (On Error Propagate, status passed via \`vars.httpStatus\` to the listener's error response):

| Error | Status |
|---|---|
| \`APP:NOT_FOUND\` | 404 |
| \`DB:CONNECTIVITY\` | 503 |
| \`ANY\` | 500 (generic body, details only in the log) |

For very deep pages (page 50,000) OFFSET gets slow; keyset paging (\`WHERE customer_id > :lastId\`) is the follow-up optimisation.
`,
  followUps: [
    {
      q: 'Why not let the Process API query the database directly and skip the System API?',
      a: 'Then every consumer embeds the schema, the credentials and the SQL. A schema change or a migration to another database breaks all of them; with a System API only one application changes and the contract stays the same.',
    },
    {
      q: 'OFFSET paging gets slow on page 40,000. What would you change?',
      a: 'Use keyset (seek) paging: ORDER BY customer_id and WHERE customer_id > :lastSeenId LIMIT :pageSize, returning a nextCursor instead of page numbers. It uses the index and costs the same on every page.',
    },
    {
      q: 'Should the System API apply business rules such as "hide inactive customers"?',
      a: 'No. That is process-layer logic. The System API returns what the system holds (with an active flag and filters as query parameters); deciding who may see what belongs above it.',
    },
  ],
}

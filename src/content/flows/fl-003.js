import { design, flow, handler, route, router, source, step, subFlow } from '../../flow/dsl.js'
import { HANDLERS, handlerStatus } from '../../flow/rules.js'

export default {
  id: 'fl-003',
  category: 'flows',
  title: 'APIkit Orders API with HTTP Error Mapping',
  level: 'INTERMEDIATE',
  tags: ['apikit', 'raml', 'rest', 'error-handling', 'http'],
  estMinutes: 35,
  flowChecks: [
    { label: 'A main flow exposes the API through an HTTP Listener', rule: { type: 'source', component: 'http-listener' } },
    {
      label: 'Requests are validated and routed by an APIkit Router',
      rule: { type: 'exists', component: 'apikit-router' },
    },
    { label: 'Main flow plus at least one implementation flow', rule: { type: 'flows', kind: 'flow', min: 2 } },
    {
      label: 'The router sits in the flow with the HTTP Listener',
      rule: { type: 'before', first: 'http-listener', then: 'apikit-router' },
    },
    { label: 'An invalid request (APIKIT:BAD_REQUEST) is mapped to 400', rule: handlerStatus('BAD_REQUEST', '400') },
    { label: 'A wrong Content-Type (UNSUPPORTED_MEDIA_TYPE) is mapped to 415', rule: handlerStatus('UNSUPPORTED_MEDIA_TYPE', '415') },
    { label: 'An unsupported method like DELETE (METHOD_NOT_ALLOWED) is mapped to 405', rule: handlerStatus('METHOD_NOT_ALLOWED', '405') },
    { label: 'An unacceptable Accept header (NOT_ACCEPTABLE) is mapped to 406', rule: handlerStatus('NOT_ACCEPTABLE', '406') },
    {
      label: 'An empty Database result raises a "not found" error after the select',
      rule: {
        type: 'any',
        rules: [
          { type: 'before', first: 'db-select', then: 'raise-error', thenWhere: { type: 'NOT_FOUND' } },
          { type: 'before', first: 'db-select', then: 'validation' },
        ],
      },
    },
    { label: 'Both GET operations read orders from the database', rule: { type: 'exists', component: 'db-select', min: 2 } },
    { label: 'The not-found error is mapped to 404', rule: handlerStatus('NOT_FOUND', '404') },
    {
      label: 'The handler that sets 404 catches the error the flow raises',
      rule: {
        type: 'any',
        rules: [
          {
            type: 'linked',
            from: { component: 'raise-error', where: { type: 'NOT_FOUND' }, key: 'type' },
            to: { component: HANDLERS, key: 'type', holding: { component: 'set-variable', where: { value: '404' } } },
            as: 'errorType',
          },
          {
            type: 'linked',
            from: { component: 'raise-error', where: { type: 'NOT_FOUND' }, key: 'type' },
            to: { component: HANDLERS, key: 'type', holding: { component: 'transform', where: { variableName: 'status', script: '404' } } },
            as: 'errorType',
          },
          // A Validate step raises VALIDATION errors, so a VALIDATION handler must set the 404.
          {
            type: 'all',
            rules: [
              { type: 'before', first: 'db-select', then: 'validation' },
              handlerStatus('VALIDATION', '404'),
            ],
          },
        ],
      },
    },
    { label: 'An unreachable database (DB:CONNECTIVITY) is mapped to 503', rule: handlerStatus('DB:CONNECTIVITY', '503') },
    { label: 'A catch-all handler returns a generic 500', rule: handlerStatus('ANY', '500') },    {
      label: 'Error responses carry the JSON body with a correlationId',
      rule: {
        type: 'any',
        rules: [
          { type: 'inside', component: 'transform', where: { script: 'correlationId' }, within: HANDLERS },
          { type: 'inside', component: 'set-payload', where: { value: 'correlationId' }, within: HANDLERS },
        ],
      },
    },
    {
      label: 'No error body exposes the detailed description or stack trace',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: ['transform', 'set-payload'], within: HANDLERS },
          { type: 'absent', component: 'transform', where: { script: 'detailedDescription' }, within: HANDLERS },
          { type: 'absent', component: 'set-payload', where: { value: 'detailedDescription' }, within: HANDLERS },
        ],
      },
    },
  ],
  simulation: {
    systems: {
      db: {
        tables: {
          orders: {
            key: 'id',
            rows: [
              { id: '7f3c2a10-4b6e-4d8a-9c1f-2e5b8a7d6c01', customer_id: 'CUST-310', total: 129.5, status: 'OPEN' },
              { id: 'a1b2c3d4-0000-4e5f-8a9b-0c1d2e3f4a5b', customer_id: 'CUST-422', total: 54, status: 'SHIPPED' },
            ],
          },
        },
      },
    },
    tests: [
      {
        name: 'An order is found',
        about: 'GET /orders/{orderId} returns the order from the database.',
        trigger: { http: { method: 'GET', path: '/api/orders/7f3c2a10-4b6e-4d8a-9c1f-2e5b8a7d6c01' } },
        expect: { status: 200, bodyHas: { id: '7f3c2a10-4b6e-4d8a-9c1f-2e5b8a7d6c01', total: 129.5 } },
      },
      {
        name: 'An unknown order',
        about: 'No row has this ID, so the answer is 404 with the JSON error body, not 200 with an empty body.',
        trigger: { http: { method: 'GET', path: '/api/orders/00000000-0000-4000-8000-000000000000', headers: { 'x-correlation-id': 'corr-404-01' } } },
        expect: { status: 404, bodyHas: { correlationId: 'corr-404-01', code: '~', message: '~' } },
      },
      {
        name: 'A DELETE is not allowed',
        about: 'The spec has no DELETE on /orders/{orderId}, so the answer is 405, not 500.',
        trigger: { http: { method: 'DELETE', path: '/api/orders/123', headers: { 'x-correlation-id': 'corr-405-01' } } },
        expect: { status: 405, bodyHas: { correlationId: 'corr-405-01' } },
      },
      {
        name: 'The database is down',
        about: 'No connection can be made to PostgreSQL, so the answer is 503.',
        trigger: { http: { method: 'GET', path: '/api/orders/7f3c2a10-4b6e-4d8a-9c1f-2e5b8a7d6c01', headers: { 'x-correlation-id': 'corr-503-01' } } },
        overrides: { systems: { db: { fault: 'CONNECTIVITY' } } },
        expect: { status: 503, bodyHas: { correlationId: 'corr-503-01' } },
      },
      {
        name: 'An order is created',
        about: 'POST /orders writes the order to the database and answers with its ID.',
        trigger: {
          http: {
            method: 'POST',
            path: '/api/orders',
            body: { id: 'c9d8e7f6-1111-4222-8333-944455566677', customerId: 'CUST-510', total: 75.25, status: 'OPEN' },
          },
        },
        expect: {
          noError: true,
          bodyHas: { id: 'c9d8e7f6-1111-4222-8333-944455566677' },
          db: { orders: { count: 3, has: [{ id: 'c9d8e7f6-1111-4222-8333-944455566677', customer_id: 'CUST-510' }] } },
        },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'orders-api-main',
      source('http-listener', { path: '/api/*' }),
      [step('apikit-router', { config: 'orders-api-config', api: 'orders-api.raml' })],
      [
        handler('on-error-propagate', { type: 'APIKIT:BAD_REQUEST' }, [
          step('set-variable', { variableName: 'httpStatus', value: '400' }),
          step('flow-ref', { name: 'build-error-body' }),
        ]),
        handler('on-error-propagate', { type: 'APIKIT:NOT_FOUND, APP:NOT_FOUND' }, [
          step('set-variable', { variableName: 'httpStatus', value: '404' }),
          step('flow-ref', { name: 'build-error-body' }),
        ]),
        handler('on-error-propagate', { type: 'APIKIT:METHOD_NOT_ALLOWED' }, [
          step('set-variable', { variableName: 'httpStatus', value: '405' }),
          step('flow-ref', { name: 'build-error-body' }),
        ]),
        handler('on-error-propagate', { type: 'APIKIT:NOT_ACCEPTABLE' }, [
          step('set-variable', { variableName: 'httpStatus', value: '406' }),
          step('flow-ref', { name: 'build-error-body' }),
        ]),
        handler('on-error-propagate', { type: 'APIKIT:UNSUPPORTED_MEDIA_TYPE' }, [
          step('set-variable', { variableName: 'httpStatus', value: '415' }),
          step('flow-ref', { name: 'build-error-body' }),
        ]),
        handler('on-error-propagate', { type: 'DB:CONNECTIVITY' }, [
          step('set-variable', { variableName: 'httpStatus', value: '503' }),
          step('flow-ref', { name: 'build-error-body' }),
        ]),
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#[correlationId ++ " " ++ error.detailedDescription]' }),
          step('set-variable', { variableName: 'httpStatus', value: '500' }),
          step('flow-ref', { name: 'build-error-body' }),
        ]),
      ],
    ),
    // APIkit dispatches to implementation flows by naming convention: <method>:\<resource>:<config>
    flow('get:\\orders:orders-api-config', null, [
      step('db-select', { sql: 'SELECT * FROM orders WHERE status = :status LIMIT 50 OFFSET :offset' }),
      step('transform', { script: '%dw 2.0\noutput application/json\n---\npayload' }),
    ]),
    flow('get:\\orders\\(orderId):orders-api-config', null, [
      step('db-select', { sql: 'SELECT * FROM orders WHERE id = :orderId' }),
      router('choice', {}, [
        route({ expression: '#[isEmpty(payload)]' }, [
          step('raise-error', { type: 'APP:NOT_FOUND', description: 'Order not found' }),
        ]),
      ], { otherwise: [step('transform', { script: '%dw 2.0\noutput application/json\n---\npayload[0]' })] }),
    ]),
    flow('post:\\orders:application\\json:orders-api-config', null, [
      // target keeps the order as the payload: the Insert result (affected rows) would otherwise replace it
      step('db-insert', { sql: 'INSERT INTO orders (id, customer_id, total, status) VALUES (:id, :customerId, :total, :status)', target: 'insertResult' }),
      step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ id: payload.id }' }),
    ]),
    subFlow('build-error-body', [
      step('transform', {
        script:
          '%dw 2.0\noutput application/json\n---\n{ code: error.errorType.identifier, message: error.description default "Unexpected error", correlationId: correlationId }',
      }),
    ]),
  ),
  description: `
You are building the **Orders System API** from a RAML spec published in Exchange. The HTTP Listener path is \`/api/*\`, so the resources below are served under \`/api\`:

- \`GET /orders?status=&page=\`: list orders from a PostgreSQL database.
- \`GET /orders/{orderId}\`: single order; \`orderId\` is a UUID. Return the order row as JSON.
- \`POST /orders\`: create; body must match the \`Order\` type (JSON: \`id\`, \`customerId\`, \`total\`, \`status\`). Insert it and answer with \`{ id }\`.

Orders live in the \`orders\` table with columns \`id\`, \`customer_id\`, \`total\` and \`status\`.

**What the database sends back**
- A Database Select always answers with a list of rows, even for one ID. Each row uses the column names as written in the table:
\`\`\`json
[ { "id": "7f3c2a10-4b6e-4d8a-9c1f-2e5b8a7d6c01", "customer_id": "CUST-310", "total": 129.5, "status": "OPEN" } ]
\`\`\`
- An unknown ID gives an empty list \`[]\`, not an error. The flow must turn it into a 404 itself.
- A Database Insert answers with the number of affected rows, which replaces the payload unless you store it in a target variable.

**What failures look like**
- When PostgreSQL cannot be reached, the Database connector raises \`DB:CONNECTIVITY\`. Answer **503**.
- The APIkit Router raises \`APIKIT:BAD_REQUEST\`, \`APIKIT:METHOD_NOT_ALLOWED\` (for example the \`DELETE\`), \`APIKIT:NOT_ACCEPTABLE\` or \`APIKIT:UNSUPPORTED_MEDIA_TYPE\` before any implementation flow runs.
- Set the status in an On Error Propagate with the variable \`httpStatus\`. The HTTP Listener answers with \`vars.httpStatus\`.

Consumers complain that today:
- a wrong \`Content-Type\` returns **500** with a Java stack trace,
- an unknown order ID returns **200 with an empty body**,
- \`DELETE /orders/123\` returns **500** instead of a meaningful status.

**Requirements:** a consistent JSON error body \`{ code, message, correlationId }\` (the Mule correlation ID, which the HTTP Listener takes from the caller's \`X-Correlation-ID\` header when one is sent) and correct statuses: 400, 404, 405, 406, 415, 500 (and 503 if the DB is unreachable). Error bodies must never expose internals: no stack trace and no \`error.detailedDescription\`.

**Design the flows:** generated structure, routing, where validation happens, how each status is produced, and how a "not found" from the DB becomes a 404.
`,
  answerTemplate: `## Generated structure

## Validation

## APIkit error mapping

## Business 404

## DB unavailable

## Error body
`,
  keyPoints: [
    'APIkit scaffolds a main flow (HTTP Listener → APIkit Router), a console flow and one flow per resource/method (e.g. get:\\orders\\(orderId):orders-config).',
    'The APIkit Router validates the request against the RAML (URI/query params, headers, body schema) before the implementation flow runs.',
    'APIkit errors map to statuses: APIKIT:BAD_REQUEST 400, NOT_FOUND 404, METHOD_NOT_ALLOWED 405, NOT_ACCEPTABLE 406, UNSUPPORTED_MEDIA_TYPE 415, NOT_IMPLEMENTED 501.',
    'An empty DB result must be turned into an error explicitly (e.g. raise error APP:NOT_FOUND or a validator) and mapped to 404.',
    'DB connectivity errors (DB:CONNECTIVITY) map to 503; anything else falls through to a generic 500 without stack traces.',
    'Status is passed back via a variable used in the listener error response; body built with DataWeave including correlationId.',
  ],
  solution: `
**Generated structure** (scaffold from the RAML in Studio):
- \`orders-api-main\`: HTTP Listener \`/api/*\` → **APIkit Router** (\`orders-api-config\`).
- \`orders-api-console\`: the APIkit console (often disabled in Prod).
- Implementation flows named by method/resource, e.g. \`get:\\orders:orders-api-config\`, \`get:\\orders\\(orderId):orders-api-config\`, \`post:\\orders:application\\json:orders-api-config\`.

**Validation:** the router validates method, path, query/URI params (UUID pattern), headers, \`Content-Type\`, \`Accept\` and the JSON body against the RAML types before invoking the flow. Invalid requests raise \`APIKIT:*\` errors.

**APIkit error mapping** (main flow error handler, all On Error Propagate):

| Error type | Status |
|---|---|
| \`APIKIT:BAD_REQUEST\` | 400 |
| \`APIKIT:NOT_FOUND\` | 404 (unknown resource) |
| \`APIKIT:METHOD_NOT_ALLOWED\` | 405 (the \`DELETE\` case) |
| \`APIKIT:NOT_ACCEPTABLE\` | 406 |
| \`APIKIT:UNSUPPORTED_MEDIA_TYPE\` | 415 (wrong Content-Type) |
| \`APIKIT:NOT_IMPLEMENTED\` | 501 |

Each handler sets \`vars.httpStatus\` and the payload. The listener error response uses \`statusCode = vars.httpStatus default 500\`.

**Business 404:** after \`db:select\` in \`get:\\orders\\(orderId)\`, check \`isEmpty(payload)\` and \`raise error\` \`APP:NOT_FOUND\` (or use a Validation \`is-not-empty-collection\` with a custom error type). Map \`APP:NOT_FOUND\` → 404 in the main error handler (or a shared global error handler).

**Create:** in \`post:\\orders\`, the Database Insert keeps its result in a target variable (\`target="insertResult"\`). Without it the Insert result (the affected row count) replaces the payload, and the reply could no longer read the order's \`id\`.

**DB unavailable:** map \`DB:CONNECTIVITY\` → 503 (optionally with a \`Retry-After\` header).

**Catch-all:** \`ANY\` → 500 with a generic message. Never return \`error.detailedDescription\` or stack traces to consumers; log them with the correlation ID instead.

**Error body** (DataWeave): \`{ code: error.errorType.identifier, message: "...", correlationId: correlationId }\`, \`output application/json\`.
`,
}

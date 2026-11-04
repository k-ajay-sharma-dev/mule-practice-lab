import { design, flow, handler, route, router, source, step, subFlow } from '../../flow/dsl.js'

export default {
  id: 'fl-003',
  category: 'flows',
  title: 'APIkit Orders API with HTTP Error Mapping',
  level: 'INTERMEDIATE',
  tags: ['apikit', 'raml', 'rest', 'error-handling', 'http'],
  estMinutes: 25,
  flowChecks: [
    { label: 'A main flow exposes the API through an HTTP Listener', rule: { type: 'source', component: 'http-listener' } },
    {
      label: 'Requests are validated and routed by an APIkit Router',
      rule: { type: 'exists', component: 'apikit-router' },
    },
    { label: 'Main flow plus at least one implementation flow', rule: { type: 'flows', kind: 'flow', min: 2 } },
    {
      label: 'A wrong Content-Type is mapped to 415 by an error handler',
      rule: { type: 'exists', component: ['on-error-propagate', 'on-error-continue'], where: { type: 'UNSUPPORTED_MEDIA_TYPE' } },
    },
    {
      label: 'An unsupported method (DELETE) is mapped to 405 by an error handler',
      rule: { type: 'exists', component: ['on-error-propagate', 'on-error-continue'], where: { type: 'METHOD_NOT_ALLOWED' } },
    },
    {
      label: 'An empty Database result raises a "not found" error after the select',
      rule: { type: 'before', first: 'db-select', then: ['raise-error', 'validation'] },
    },
    {
      label: 'An unreachable database is mapped to 503',
      rule: { type: 'exists', component: ['on-error-propagate', 'on-error-continue'], where: { type: 'DB:CONNECTIVITY' } },
    },
    {
      label: 'A catch-all handler returns a generic 500 without stack traces',
      rule: { type: 'exists', component: ['on-error-propagate', 'on-error-continue'], where: { type: 'ANY' } },
    },
  ],
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
      step('db-insert', { sql: 'INSERT INTO orders (id, customer_id, total, status) VALUES (:id, :customerId, :total, :status)' }),
      step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ id: vars.orderId }' }),
    ]),
    subFlow('build-error-body', [
      step('transform', {
        script:
          '%dw 2.0\noutput application/json\n---\n{ code: error.errorType.identifier, message: error.description default "Unexpected error", correlationId: correlationId }',
      }),
    ]),
  ),
  description: `
You are building the **Orders System API** from a RAML spec published in Exchange:

- \`GET /orders?status=&page=\` — list orders from a PostgreSQL database.
- \`GET /orders/{orderId}\` — single order; \`orderId\` is a UUID.
- \`POST /orders\` — create; body must match the \`Order\` type (JSON).

Consumers complain that today:
- a wrong \`Content-Type\` returns **500** with a Java stack trace,
- an unknown order ID returns **200 with an empty body**,
- \`DELETE /orders/123\` returns **500** instead of a meaningful status.

**Requirements:** a consistent JSON error body \`{ code, message, correlationId }\` and correct statuses: 400, 404, 405, 406, 415, 500 (and 503 if the DB is unreachable).

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

**DB unavailable:** map \`DB:CONNECTIVITY\` → 503 (optionally with a \`Retry-After\` header).

**Catch-all:** \`ANY\` → 500 with a generic message — never return \`error.detailedDescription\` or stack traces to consumers; log them with the correlation ID instead.

**Error body** (DataWeave): \`{ code: error.errorType.identifier, message: "...", correlationId: correlationId }\`, \`output application/json\`.
`,
}

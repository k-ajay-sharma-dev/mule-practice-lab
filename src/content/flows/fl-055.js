import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

const errorBody = (code, message) => step('set-payload', { value: `#[{ code: "${code}", message: ${message}, correlationId: correlationId }]` })

export default {
  id: 'fl-055',
  category: 'flows',
  title: 'Order Submission Across Three Layers with Error Translation at Each Hop',
  level: 'ADVANCED',
  tags: ['api-led', 'error-handling', 'error-propagation', 'orders', 'architecture'],
  estMinutes: 45,
  flowChecks: [
    { label: 'Experience, process and two system APIs are separate flows', rule: { type: 'flows', kind: 'flow', min: 4 } },
    {
      label: 'The order is validated at the edge before any downstream call',
      rule: { type: 'before', first: 'validation', then: 'http-request' },
    },
    {
      label: 'The Experience API calls the Process API over HTTP Request',
      rule: { type: 'exists', component: 'http-request', where: { path: 'prc-' } },
    },
    {
      label: 'The Process API calls the payment and order System APIs',
      rule: { type: 'exists', component: 'http-request', where: { path: 'sys-' }, min: 2 },
    },
    {
      label: 'A declined payment (HTTP 200 + status) becomes a typed error in the System API',
      rule: { type: 'before', first: 'http-request', then: 'raise-error' },
    },
    {
      label: 'Business rejections (422/409) from the layer below become typed APP errors in the process and experience layers too',
      rule: { type: 'exists', component: 'raise-error', where: { type: 'APP:' }, min: 3 },
    },
    {
      label: 'Downstream timeouts are translated (504/503), not left as 500',
      rule: { type: 'exists', component: ['on-error-propagate', 'on-error-continue'], where: { type: 'TIMEOUT' } },
    },
    {
      label: 'Database errors in the order System API are mapped (duplicate 409, down 503)',
      rule: { type: 'exists', component: ['on-error-propagate', 'on-error-continue'], where: { type: 'DB:' } },
    },
  ],
  referenceFlow: design(
    flow(
      'exp-web-orders',
      source('http-listener', { path: '/exp-web/v1/orders', allowedMethods: 'POST' }),
      [
        step('validation', { check: 'json-schema', expression: '#[payload]', message: 'Order does not match the web order schema' }),
        // Response validator: success-status-code-validator values="200..299,422", so a 422 business
        // rejection comes back as a normal response (the HTTP connector has no HTTP:UNPROCESSABLE_ENTITY type).
        step('http-request', { method: 'POST', path: '/prc-orders/v1/orders', responseTimeout: 8000 }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[attributes.statusCode == 422]' }, [
              step('set-variable', { variableName: 'rejection', value: '#[payload]' }),
              step('raise-error', { type: 'APP:ORDER_REJECTED', description: 'Order rejected by the Process API' }),
            ]),
          ],
          {
            otherwise: [
              step('transform', {
                script: '%dw 2.0\noutput application/json\n---\n{ orderNumber: payload.orderId, status: payload.status, message: "Thank you for your order" }',
              }),
              step('set-variable', { variableName: 'httpStatus', value: '201' }),
            ],
          },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'JSON:SCHEMA_NOT_HONOURED' }, [
          step('set-variable', { variableName: 'httpStatus', value: '400' }),
          errorBody('INVALID_ORDER', 'error.description'),
        ]),
        handler('on-error-propagate', { type: 'APP:ORDER_REJECTED' }, [
          step('set-variable', { variableName: 'httpStatus', value: '422' }),
          step('set-payload', {
            value: '#[{ code: vars.rejection.code default "REJECTED", message: "We could not accept this order: " ++ (vars.rejection.reason default "please check your details"), correlationId: correlationId }]',
          }),
        ]),
        handler('on-error-propagate', { type: 'HTTP:TIMEOUT' }, [
          step('set-variable', { variableName: 'httpStatus', value: '504' }),
          errorBody('ORDER_PENDING', '"Your order is taking longer than usual - check your order history before retrying"'),
        ]),
        handler('on-error-propagate', { type: 'HTTP:SERVICE_UNAVAILABLE' }, [
          step('set-variable', { variableName: 'httpStatus', value: '503' }),
          errorBody('TRY_LATER', '"Ordering is temporarily unavailable"'),
        ]),
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#[correlationId ++ " " ++ error.detailedDescription]' }),
          step('set-variable', { variableName: 'httpStatus', value: '500' }),
          errorBody('INTERNAL', '"Something went wrong"'),
        ]),
      ],
    ),
    flow(
      'prc-orders-submit',
      source('http-listener', { path: '/prc-orders/v1/orders', allowedMethods: 'POST' }),
      [
        step('set-variable', { variableName: 'order', value: '#[payload]' }),
        // Response validator values="200..299,422": a declined card comes back as a response, not an error.
        step('http-request', { method: 'POST', path: '/sys-payment/v1/authorisations', responseTimeout: 3000 }),
        router('choice', {}, [
          route({ expression: '#[attributes.statusCode == 422]' }, [
            step('set-variable', { variableName: 'declineReason', value: '#[payload.reason default "declined"]' }),
            step('raise-error', { type: 'APP:PAYMENT_DECLINED', description: 'Payment declined' }),
          ]),
        ]),
        step('set-variable', { variableName: 'authorisation', value: '#[payload]' }),
        // Response validator values="200..299,409": a duplicate order comes back as a response (there is no HTTP:CONFLICT type).
        step('http-request', { method: 'POST', path: '/sys-oms/v1/orders', responseTimeout: 3000 }),
        router('choice', {}, [
          route({ expression: '#[attributes.statusCode == 409]' }, [
            step('raise-error', { type: 'APP:DUPLICATE_ORDER', description: 'Order already submitted' }),
          ]),
        ]),
        step('transform', {
          script: '%dw 2.0\noutput application/json\n---\n{ orderId: payload.orderId, status: "ACCEPTED", authorisationId: vars.authorisation.id }',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'APP:PAYMENT_DECLINED' }, [
          step('set-variable', { variableName: 'httpStatus', value: '422' }),
          step('set-payload', { value: '#[{ code: "PAYMENT_DECLINED", reason: vars.declineReason default "declined" }]' }),
        ]),
        handler('on-error-propagate', { type: 'APP:DUPLICATE_ORDER' }, [
          step('set-variable', { variableName: 'httpStatus', value: '422' }),
          step('set-payload', { value: '#[{ code: "DUPLICATE_ORDER", reason: "Order already submitted" }]' }),
        ]),
        handler('on-error-propagate', { type: 'HTTP:SERVICE_UNAVAILABLE, HTTP:TIMEOUT' }, [
          step('set-variable', { variableName: 'httpStatus', value: '503' }),
        ]),
        handler('on-error-propagate', { type: 'ANY' }, [step('set-variable', { variableName: 'httpStatus', value: '500' })]),
      ],
    ),
    flow(
      'sys-payment-authorisations',
      source('http-listener', { path: '/sys-payment/v1/authorisations', allowedMethods: 'POST' }),
      [
        step('http-request', { method: 'POST', path: '/v1/payment_intents', responseTimeout: 2500 }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[payload.status == "declined"]' }, [
              step('raise-error', { type: 'APP:PAYMENT_DECLINED', description: 'Card declined by issuer' }),
            ]),
          ],
          { otherwise: [step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ id: payload.id, amount: payload.amount, status: "AUTHORISED" }' })] },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'APP:PAYMENT_DECLINED' }, [
          step('set-variable', { variableName: 'httpStatus', value: '422' }),
          step('set-payload', { value: '#[{ code: "DECLINED", reason: error.description }]' }),
        ]),
        handler('on-error-propagate', { type: 'HTTP:CONNECTIVITY, HTTP:TIMEOUT, HTTP:SERVICE_UNAVAILABLE' }, [
          step('set-variable', { variableName: 'httpStatus', value: '503' }),
        ]),
        handler('on-error-propagate', { type: 'HTTP:UNAUTHORIZED, HTTP:FORBIDDEN' }, [
          step('logger', { level: 'ERROR', message: '#["PSP rejected our credentials"]' }),
          step('set-variable', { variableName: 'httpStatus', value: '500' }),
        ]),
      ],
    ),
    flow(
      'sys-oms-orders',
      source('http-listener', { path: '/sys-oms/v1/orders', allowedMethods: 'POST' }),
      [
        step('set-variable', { variableName: 'orderId', value: '#[payload.orderId]' }),
        step('db-insert', {
          sql: 'INSERT INTO orders (order_id, customer_id, total, payment_ref, status) VALUES (:orderId, :customerId, :total, :paymentRef, \'NEW\')',
        }),
        step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ orderId: vars.orderId }' }),
      ],
      [
        handler('on-error-propagate', { type: 'DB:QUERY_EXECUTION' }, [step('set-variable', { variableName: 'httpStatus', value: '409' })]),
        handler('on-error-propagate', { type: 'DB:CONNECTIVITY' }, [step('set-variable', { variableName: 'httpStatus', value: '503' })]),
      ],
    ),
  ),
  description: `
An online shop's checkout submits orders through three layers:

- \`exp-web\`: called by the web checkout (~20 orders/s at peak, 10 s browser timeout).
- \`prc-orders\`: authorises the payment, then creates the order.
- \`sys-payment\`: wraps the payment service provider (PSP). **Quirk:** a declined card is HTTP **200** with \`"status": "declined"\`; a wrong API key is 401.
- \`sys-oms\`: wraps the order database (a duplicate order id violates a unique key).

**What is wrong now**

The current implementation returns **500 "Internal Server Error"** for everything. Declined cards, duplicate submits, PSP outages and timeouts look the same to the shopper, and support cannot tell them apart.

**Required behaviour at the edge**
- Invalid input: **400**.
- Declined card or duplicate: **422** with a business code.
- Downstream outage: **503**.
- Slow downstream: **504** (with a hint not to resubmit blindly).
- Anything else: **500** with a correlation id and no internals.

**Convention for API-led problems:** one canvas holds the whole application network. Draw each API as a separate flow whose name starts with its layer prefix (\`exp-\`, \`prc-\`, \`sys-\`), give it an HTTP Listener whose path shows the API (e.g. \`/prc-orders/v1/orders\`), and let layers call each other with HTTP Request pointing at the lower API's path.

**Design the flow(s):** all four APIs, and for each layer which errors it raises, which it receives from below, and how it translates them for its caller.
`,
  answerTemplate: `## Layers and calls

## System layer: raising meaningful errors

## Process layer: translating to business errors

## Experience layer: translating for the shopper

## Timeouts

## Error body and correlation id
`,
  keyPoints: [
    'Each layer translates errors into its own vocabulary: system (DECLINED, 409, 503) → process (PAYMENT_DECLINED, DUPLICATE_ORDER) → experience (shopper message + status).',
    'An HTTP Request raises a typed error only for the statuses the connector maps (e.g. HTTP:BAD_REQUEST, HTTP:NOT_FOUND, HTTP:SERVICE_UNAVAILABLE, HTTP:GATEWAY_TIMEOUT; the body is in error.errorMessage.payload). There is no HTTP:CONFLICT or HTTP:UNPROCESSABLE_ENTITY, so add 409/422 to the request\'s success-status-code-validator and branch on attributes.statusCode with a Choice.',
    'Quirks are fixed at the bottom: "200 + declined" becomes APP:PAYMENT_DECLINED → 422 in the System API; our own bad PSP credentials are a 500, not the caller\'s fault.',
    'Validation happens at the edge so bad input never costs downstream calls; schema errors become 400.',
    'Timeouts shrink down the stack (8 s → 3 s → 2.5 s) and a timeout is reported as 504 "pending" — the order may still have been created, so the shopper must not blindly resubmit (idempotency key next step).',
    'A consistent error body { code, message, correlationId } at every layer lets support trace one failing order through all logs.',
  ],
  solution: `
\`\`\`
   Web checkout
        |  POST /exp-web/v1/orders                      400 / 422 / 503 / 504 / 500
        v
 +-----------------------------------------------------------------------+
 | exp-web-orders     validate schema -> POST /prc-orders/v1/orders (8 s) | EXPERIENCE
 |   JSON:SCHEMA_NOT_HONOURED -> 400                                      |
 |   status 422 -> APP:ORDER_REJECTED -> 422 (code from body)             |
 |   HTTP:TIMEOUT -> 504 | HTTP:SERVICE_UNAVAILABLE -> 503 | ANY -> 500   |
 +-----------------------------------------------------------------------+
        v
 +-----------------------------------------------------------------------+
 | prc-orders-submit  POST sys-payment (3 s) -> POST sys-oms (3 s)        | PROCESS
 |   status 422 -> APP:PAYMENT_DECLINED -> 422 PAYMENT_DECLINED           |
 |   status 409 -> APP:DUPLICATE_ORDER -> 422 DUPLICATE_ORDER             |
 |   503/TIMEOUT -> 503                                                   |
 +-----------------------------------------------------------------------+
        v                                        v
 +------------------------------------+  +-------------------------------+
 | sys-payment-authorisations         |  | sys-oms-orders                | SYSTEM
 |  200+declined -> APP:PAYMENT_DECLINED|  |  DB:QUERY_EXECUTION -> 409    |
 |     -> 422 DECLINED                |  |  DB:CONNECTIVITY -> 503       |
 |  CONNECTIVITY/TIMEOUT -> 503       |  +-------------------------------+
 |  401/403 from PSP -> 500 (our bug) |
 +------------------------------------+
\`\`\`

**System layer** raises errors that describe the *system*: the PSP quirk is fixed with a Choice + Raise Error \`APP:PAYMENT_DECLINED\` → 422 \`DECLINED\`; connectivity → 503; PSP 401/403 → 500 and an alert (a caller cannot fix our credentials). \`sys-oms\` maps a unique-key violation to 409 and \`DB:CONNECTIVITY\` to 503.

**Process layer** receives 422, 409 and 503 from the System APIs. The HTTP connector has no \`HTTP:UNPROCESSABLE_ENTITY\` or \`HTTP:CONFLICT\` error types, so each HTTP Request lists the expected business status in its response validator (\`<http:success-status-code-validator values="200..299,422"/>\`, \`"200..299,409"\` for sys-oms); a Choice on \`attributes.statusCode\` raises \`APP:PAYMENT_DECLINED\` / \`APP:DUPLICATE_ORDER\`, which the handler translates into *business* codes \`PAYMENT_DECLINED\`, \`DUPLICATE_ORDER\` (both 422). A 503 does have its own type (\`HTTP:SERVICE_UNAVAILABLE\`) and is mapped to 503 together with \`HTTP:TIMEOUT\`.

**Experience layer** validates first (\`JSON:SCHEMA_NOT_HONOURED\` → 400), then translates for the shopper: its request also accepts 422, and a Choice keeps the Process API's body (\`vars.rejection\`) and raises \`APP:ORDER_REJECTED\`, whose handler passes the business code on. Timeout → 504 with "check your order history before retrying". Everything else → 500 with the correlation id only.

All layers propagate (On Error Propagate) so the HTTP status reaches the caller; the status is set in \`vars.httpStatus\` and used by each listener's error response.
`,
  followUps: [
    {
      q: 'The payment was authorised but sys-oms fails with 503. What is wrong with this design?',
      a: 'The money is reserved but no order exists. The Process API needs compensation (void the authorisation in a Try/On Error Propagate around the OMS call) or an async retry of order creation; see the order-to-cash design for the full pattern.',
    },
    {
      q: 'How do you stop a shopper who got a 504 from creating a second order?',
      a: 'Require an Idempotency-Key header at the Experience API and pass it down; the Process API (or sys-oms with a unique key) returns the original result for a repeated key instead of creating a new order.',
    },
    {
      q: 'Why not just pass the System API error body straight through to the browser?',
      a: 'It leaks internal system names and codes, couples the web to the PSP\'s vocabulary and can expose sensitive details. Each layer owns its contract, including its error contract.',
    },
  ],
}

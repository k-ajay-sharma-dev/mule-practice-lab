import { design, flow, handler, route, router, source, step, subFlow } from '../../flow/dsl.js'

const errorBody = (code) => step('transform', {
  script: `%dw 2.0\noutput application/json\n---\n{ code: "${code}", message: error.description, correlationId: correlationId }`,
})

export default {
  id: 'fl-034',
  category: 'flows',
  title: 'Synchronous Order Validation Chain with Country Routing',
  level: 'ADVANCED',
  tags: ['sub-flow', 'flow-reference', 'validation', 'choice', 'routing', 'error-mapping', 'sla'],
  estMinutes: 35,
  flowChecks: [
    { label: 'Orders are accepted through an HTTP Listener', rule: { type: 'source', component: ['http-listener'] } },
    { label: 'Validation and enrichment are reusable sub-flows', rule: { type: 'flows', kind: 'sub-flow', min: 2 } },
    { label: 'Every Flow Reference points to an existing flow', rule: { type: 'refs' } },
    { label: 'The order is validated with the Validation module', rule: { type: 'exists', component: 'validation' } },
    {
      label: 'Lookup results are stored in a target variable so the order payload is preserved',
      rule: { type: 'exists', component: 'flow-ref', where: { target: { set: true } } },
    },
    {
      label: 'A Choice routes by country to at least two fulfilment systems, with a default',
      rule: { type: 'routes', component: 'choice', min: 2 },
    },
    {
      label: 'An unsupported country raises a custom APP: error',
      rule: { type: 'exists', component: 'raise-error', where: { type: 'APP:' } },
    },
    {
      label: 'Downstream calls have timeouts that fit the 2 s SLA',
      rule: { type: 'exists', component: 'http-request', where: { responseTimeout: { gte: 1, lte: 2000 } } },
    },
  ],
  referenceFlow: design(
    flow(
      'post-order',
      source('http-listener', { path: '/api/orders', allowedMethods: 'POST' }),
      [
        step('flow-ref', { name: 'validate-order' }),
        step('flow-ref', { name: 'lookup-customer', target: 'customer' }),
        step('flow-ref', { name: 'price-order', target: 'pricing' }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n(payload - "lines") ++ { customerTier: vars.customer.tier, lines: vars.pricing.lines, total: vars.pricing.total, currency: vars.pricing.currency }',
        }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[["DE", "AT", "CH", "FR", "NL"] contains payload.shipTo.country]' }, [
              step('http-request', { method: 'POST', path: '/eu-fulfilment/orders', responseTimeout: 1000 }),
            ]),
            route({ expression: '#[["US", "CA"] contains payload.shipTo.country]' }, [
              step('http-request', { method: 'POST', path: '/na-fulfilment/orders', responseTimeout: 1000 }),
            ]),
          ],
          {
            otherwise: [
              step('raise-error', { type: 'APP:UNSUPPORTED_COUNTRY', description: '#["We do not ship to " ++ payload.shipTo.country]' }),
            ],
          },
        ),
        step('set-variable', { variableName: 'httpStatus', value: '#[201]' }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{ orderId: payload.orderId, fulfilmentRef: payload.reference, status: "ACCEPTED" }',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'JSON:SCHEMA_NOT_HONOURED, VALIDATION:INVALID_BOOLEAN' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[400]' }),
          errorBody('INVALID_ORDER'),
        ]),
        handler('on-error-propagate', { type: 'APP:CUSTOMER_NOT_FOUND, APP:UNSUPPORTED_COUNTRY' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[422]' }),
          errorBody('ORDER_NOT_PROCESSABLE'),
        ]),
        handler('on-error-propagate', { type: 'HTTP:TIMEOUT, HTTP:CONNECTIVITY, HTTP:SERVICE_UNAVAILABLE' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[503]' }),
          errorBody('DEPENDENCY_UNAVAILABLE'),
        ]),
      ],
    ),
    subFlow('validate-order', [
      step('validation', { check: 'json-schema', expression: 'schemas/order.json', message: 'Order does not match schema' }),
      step('validation', {
        check: 'is-true',
        expression: '#[do { var n = sizeOf(payload.lines default []) --- n >= 1 and n <= 200 }]',
        message: 'An order needs between 1 and 200 lines',
      }),
    ]),
    subFlow('lookup-customer', [
      step('db-select', { sql: 'SELECT customer_id, tier, credit_blocked FROM customers WHERE customer_id = :customerId' }),
      router(
        'choice',
        {},
        [route({ expression: '#[isEmpty(payload)]' }, [step('raise-error', { type: 'APP:CUSTOMER_NOT_FOUND', description: 'Unknown customer' })])],
        { otherwise: [step('set-payload', { value: '#[output application/json --- { id: payload[0].CUSTOMER_ID, tier: payload[0].TIER }]' })] },
      ),
    ]),
    subFlow('price-order', [step('http-request', { method: 'POST', path: '/pricing/quote', responseTimeout: 800 })]),
  ),
  description: `
The B2B portal submits orders synchronously to \`POST /api/orders\` and waits for an answer. The **SLA is p95 < 2 s**; load is ~15 orders/s.

For every order the API must:
1. **Validate** it: JSON schema, plus 1–200 lines.
2. **Enrich** it: look up the customer (Customer DB; unknown customers are rejected) and get prices from the **Pricing API** (~300 ms).
3. **Route by ship-to country**: EU countries → **EU Fulfilment API**, US/CA → **NA Fulfilment API**. Any other country is rejected.
4. **Respond** \`201\` with the fulfilment reference.

Error responses: invalid order → **400**; unknown customer or unsupported country → **422**; a dependency down or timing out → **503**. Every error body has a code, a message and the correlation ID.

The validation and enrichment logic will also be reused by a bulk-upload flow next quarter.

**Design the flow(s):**
- How do you structure the chain so validation and enrichment are reusable?
- How do you keep the original order while calling lookups that return other data?
- How do you route by country, and what happens for an unsupported country?
- How do you map each failure to the right status code within the SLA?
`,
  answerTemplate: `## Flow structure

## Validation

## Enrichment without losing the order

## Country routing

## Error mapping and SLA
`,
  keyPoints: [
    'One API flow orchestrates the chain; validation, customer lookup and pricing live in sub-flows called via Flow Reference so the bulk flow can reuse them.',
    'Flow Reference with a target variable (vars.customer, vars.pricing) keeps the order as the payload; a Transform then merges the results.',
    'A Choice routes by shipTo.country to the EU or NA fulfilment API; the default route raises APP:UNSUPPORTED_COUNTRY instead of silently dropping the order.',
    'Business failures are custom APP: errors; the flow error handler maps schema/validation errors (JSON:SCHEMA_NOT_HONOURED, VALIDATION:*) to 400, APP:* to 422 and HTTP timeouts/connectivity to 503.',
    'Response timeouts on every call add up on a sequential chain: 800 ms pricing + 1000 ms fulfilment keeps the worst case inside the 2 s SLA.',
  ],
  solution: `
**Flow \`post-order\`** (HTTP Listener \`POST /api/orders\`):
1. **Flow Ref \`validate-order\`**: sub-flow with **Validate json-schema** (JSON module, raises \`JSON:SCHEMA_NOT_HONOURED\`) and **Validate is-true** (1–200 lines, raises \`VALIDATION:INVALID_BOOLEAN\`).
2. **Flow Ref \`lookup-customer\`**, \`target="customer"\`: Database Select → Choice: empty → **Raise Error \`APP:CUSTOMER_NOT_FOUND\`**, else return \`{ id, tier }\`.
3. **Flow Ref \`price-order\`**, \`target="pricing"\`: HTTP Request \`POST /pricing/quote\`, \`responseTimeout 800\`.
   Steps 2 and 3 are independent. If latency is tight, run them in a **Scatter-Gather** instead.
4. **Transform**: merge order + customer tier + priced lines.
5. **Choice** on \`payload.shipTo.country\`:
   - EU list → HTTP Request EU Fulfilment (\`responseTimeout 1000\`)
   - US/CA → HTTP Request NA Fulfilment
   - **otherwise → Raise Error \`APP:UNSUPPORTED_COUNTRY\`**
6. \`httpStatus = 201\` and the response body.

**Error handler** (On Error Propagate, each sets \`vars.httpStatus\` + \`{ code, message, correlationId }\`):
- \`JSON:SCHEMA_NOT_HONOURED, VALIDATION:INVALID_BOOLEAN\` → 400
- \`APP:CUSTOMER_NOT_FOUND, APP:UNSUPPORTED_COUNTRY\` → 422
- \`HTTP:TIMEOUT, HTTP:CONNECTIVITY, HTTP:SERVICE_UNAVAILABLE\` → 503

The country lists belong in properties (or a config table), not hard-coded in the Choice.
`,
  followUps: [
    {
      q: 'Sub-flow or private flow for validate-order?',
      a: 'A sub-flow: it runs in the caller\'s context, errors propagate straight to post-order\'s handler, and it has no overhead. Use a private flow only if it needs its own error handler.',
    },
    {
      q: 'Why is the default route a Raise Error rather than a 422 Set Payload?',
      a: 'Raising an error keeps all status mapping in one place (the error handler), stops the flow immediately and makes the failure visible in monitoring as an error.',
    },
    {
      q: 'What if a fulfilment call times out but the order was actually created?',
      a: 'Send the orderId as an idempotency key so a client retry does not create a duplicate. Return 503 with the correlation ID so support can check, or switch the fulfilment hand-off to asynchronous with a 202.',
    },
  ],
}

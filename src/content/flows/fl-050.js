import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-050',
  category: 'flows',
  title: 'Process API Orchestrating Three System APIs with Customer-Type Routing',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'process-api', 'orchestration', 'choice', 'system-api'],
  estMinutes: 30,
  flowChecks: [
    { label: 'Experience, process and system APIs are separate flows', rule: { type: 'flows', kind: 'flow', min: 3 } },
    {
      label: 'The quote logic lives in a Process API listener (/prc-...)',
      rule: { type: 'source', component: 'http-listener', where: { path: 'prc-' } },
    },
    {
      label: 'The Process API calls three System APIs over HTTP Request',
      rule: { type: 'exists', component: 'http-request', where: { path: 'sys-' }, min: 3 },
    },
    {
      label: 'The customer is looked up first, then a Choice routes by customer type',
      rule: { type: 'before', first: 'http-request', then: 'choice' },
    },
    {
      label: 'The pricing System API is chosen per customer type inside the Choice',
      rule: { type: 'inside', component: 'http-request', within: 'choice', where: { path: 'sys-' } },
    },
    {
      label: 'Intermediate results are kept in variables before the next call replaces the payload',
      rule: { type: 'exists', component: 'set-variable', min: 2 },
    },
    {
      label: 'The quote is assembled with DataWeave after the orchestration',
      rule: { type: 'before', first: 'choice', then: 'transform' },
    },
    {
      label: 'An unknown customer from the CRM System API is mapped to a business error',
      rule: { type: 'exists', component: ['on-error-propagate', 'on-error-continue'], where: { type: 'NOT_FOUND' } },
    },
  ],
  referenceFlow: design(
    flow(
      'exp-sales-portal-quotes',
      source('http-listener', { path: '/exp-sales-portal/v1/quotes', allowedMethods: 'POST' }),
      [
        step('http-request', { method: 'POST', path: '/prc-quotes/v1/quotes', responseTimeout: 5000 }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{\n  quoteId: payload.quoteId,\n  lines: payload.lines map { sku: $.sku, price: $.unitPrice, available: $.available },\n  total: payload.total\n}',
        }),
      ],
      [handler('on-error-propagate', { type: 'ANY' }, [step('set-variable', { variableName: 'httpStatus', value: '502' })])],
    ),
    flow(
      'prc-quotes',
      source('http-listener', { path: '/prc-quotes/v1/quotes', allowedMethods: 'POST' }),
      [
        step('set-variable', { variableName: 'request', value: '#[payload]' }),
        step('http-request', { method: 'GET', path: '/sys-crm/v1/customers/{customerId}', responseTimeout: 1500 }),
        step('set-variable', { variableName: 'customer', value: '#[payload]' }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[vars.customer.segment == "B2B"]' }, [
              step('http-request', { method: 'POST', path: '/sys-erp/v1/contract-prices', responseTimeout: 2000 }),
            ]),
          ],
          { otherwise: [step('http-request', { method: 'POST', path: '/sys-pricing/v1/list-prices', responseTimeout: 1000 })] },
        ),
        step('set-variable', { variableName: 'prices', value: '#[payload]' }),
        step('http-request', { method: 'POST', path: '/sys-inventory/v1/availability', responseTimeout: 1000 }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\nvar stock = payload groupBy $.sku\n---\n{\n  quoteId: uuid(),\n  customerId: vars.customer.id,\n  segment: vars.customer.segment,\n  lines: vars.prices map (p) -> {\n    sku: p.sku,\n    quantity: p.quantity,\n    unitPrice: p.unitPrice,\n    available: (stock[p.sku][0].available default 0) >= p.quantity\n  },\n  total: sum(vars.prices map ($.unitPrice * $.quantity))\n}',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'HTTP:NOT_FOUND' }, [
          step('set-variable', { variableName: 'httpStatus', value: '422' }),
          step('set-payload', { value: '#[output application/json --- { code: "UNKNOWN_CUSTOMER", message: "Customer " ++ (vars.request.customerId default "") ++ " does not exist" }]' }),
        ]),
        handler('on-error-propagate', { type: 'HTTP:TIMEOUT, HTTP:SERVICE_UNAVAILABLE, HTTP:CONNECTIVITY' }, [
          step('set-variable', { variableName: 'httpStatus', value: '503' }),
        ]),
        handler('on-error-propagate', { type: 'ANY' }, [step('set-variable', { variableName: 'httpStatus', value: '500' })]),
      ],
    ),
    flow(
      'sys-crm-customers',
      source('http-listener', { path: '/sys-crm/v1/customers/{customerId}', allowedMethods: 'GET' }),
      [
        step('sf-query', { soql: "SELECT Id, Name, Segment__c FROM Account WHERE Id = ':customerId'" }),
        step('transform', {
          script: '%dw 2.0\noutput application/json\n---\n{ id: payload[0].Id, name: payload[0].Name, segment: payload[0].Segment__c }',
        }),
      ],
    ),
  ),
  description: `
A B2B/B2C distributor's sales portal needs **quotes**: given a customer and a list of SKUs, return a price per line, availability and a total.

Systems (each already has, or will get, its own System API):
- **CRM** (Salesforce): customer and segment, \`B2B\` or \`B2C\`.
- **ERP:** negotiated **contract prices** (B2B customers only).
- **Pricing engine:** public **list prices** (B2C).
- **Inventory:** stock per SKU.

**Rules**
- Look the customer up first.
- B2B customers are priced from the ERP, everyone else from the pricing engine.
- Then check availability for the priced lines.
- An unknown customer must give a clear business error, not a 500.

**Load:** ~10 quotes/s, 5 s end-to-end SLA.

**Convention for API-led problems:** one canvas holds the whole application network. Draw each API as a separate flow whose name starts with its layer prefix (\`exp-\`, \`prc-\`, \`sys-\`), give it an HTTP Listener whose path shows the API (e.g. \`/prc-quotes/v1/quotes\`), and let layers call each other with HTTP Request pointing at the lower API's path. Draw the Process API in full; one System API flow is enough to show the pattern.

**Design the flow(s):** the call sequence, how the customer type picks the pricing source, how intermediate results survive between calls, and the error mapping.
`,
  answerTemplate: `## APIs and layers

## Orchestration sequence

## Routing by customer type

## Keeping intermediate results

## Errors and timeouts
`,
  keyPoints: [
    'Orchestration (call order, branching, combining results) is the job of the Process API; System APIs stay single-purpose and unaware of each other.',
    'The calls are sequential because they depend on each other: the segment decides the pricing source, and availability is checked for the priced lines.',
    'A Choice on the customer segment selects the pricing System API — the Experience API never needs to know B2B and B2C are priced differently.',
    'Each HTTP Request replaces the payload, so the request, customer and prices are saved in variables (or use the request target) before the next call.',
    'Errors from System APIs are translated into Process-level meaning: CRM 404 → 422 UNKNOWN_CUSTOMER, timeouts/503 → 503; per-call timeouts add up within the 5 s budget.',
  ],
  solution: `
\`\`\`
  exp-sales-portal-quotes  -- POST /prc-quotes/v1/quotes -->
  +-----------------------------------------------------------+
  | prc-quotes                                       PROCESS  |
  |  1. GET  /sys-crm/v1/customers/{id}      -> vars.customer |
  |  2. Choice segment                                        |
  |       B2B       -> POST /sys-erp/v1/contract-prices       |
  |       otherwise -> POST /sys-pricing/v1/list-prices       |
  |                                           -> vars.prices  |
  |  3. POST /sys-inventory/v1/availability                   |
  |  4. DataWeave: lines + availability + total               |
  +-----------------------------------------------------------+
        |              |                 |                |
   sys-crm         sys-erp         sys-pricing     sys-inventory   SYSTEM
\`\`\`

**prc-quotes** — \`POST /prc-quotes/v1/quotes\`
1. Save the request (\`vars.request\`).
2. HTTP Request \`GET /sys-crm/v1/customers/{customerId}\` (1.5 s) → \`vars.customer\`.
3. **Choice** \`vars.customer.segment == "B2B"\` → \`/sys-erp/v1/contract-prices\` (2 s); otherwise \`/sys-pricing/v1/list-prices\` (1 s) → \`vars.prices\`.
4. HTTP Request \`/sys-inventory/v1/availability\` (1 s).
5. Transform builds the quote from \`vars.customer\`, \`vars.prices\` and the availability payload.

**Errors:** \`HTTP:NOT_FOUND\` (the only call that can 404 here is the CRM lookup) → 422 \`UNKNOWN_CUSTOMER\`; \`HTTP:TIMEOUT / SERVICE_UNAVAILABLE / CONNECTIVITY\` → 503; \`ANY\` → 500. Worst case 1.5 + 2 + 1 = 4.5 s stays inside the 5 s SLA.

**Why not parallel?** Each step needs the previous result. Only independent calls (see fl-051) should go into a Scatter-Gather.
`,
  followUps: [
    {
      q: 'A third segment (Government) with its own pricing system arrives. What changes?',
      a: 'A new System API for the government price list and one more When branch in the Process API Choice. The Experience API and the other System APIs do not change.',
    },
    {
      q: 'How do you distinguish a 404 from the CRM from a 404 from inventory in one handler?',
      a: 'Wrap each call in its own Try (or map the error right after the call with Raise Error of a specific type such as APP:UNKNOWN_CUSTOMER). The flow-level handler can then map by business error type rather than by the generic HTTP:NOT_FOUND.',
    },
    {
      q: 'Could the Choice live in the Experience API instead?',
      a: 'It could, but then every channel would duplicate the pricing rule and know about the ERP and pricing engine. Business routing belongs in the Process API so it is written once.',
    },
  ],
}

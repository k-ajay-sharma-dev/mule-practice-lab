import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'
import { handlerStatus } from '../../flow/rules.js'

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
      label: 'The Process API calls three System APIs over HTTP Request; the Experience API never calls them',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'http-request', where: { path: 'sys-' }, min: 3 },
          { type: 'absent', component: 'http-request', where: { path: 'sys-' }, inFlowWith: { component: 'http-listener', where: { path: 'exp-' } } },
        ],
      },
    },
    {
      label: 'The customer is looked up in the CRM first, then a Choice routes by customer type',
      rule: { type: 'before', first: 'http-request', firstWhere: { path: 'crm' }, then: 'choice' },
    },
    {
      label: 'Both the ERP and the pricing engine are called inside the Choice, one per customer type',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'http-request', within: 'choice', where: { path: 'erp' } },
          { type: 'inside', component: 'http-request', within: 'choice', where: { path: 'pric' } },
        ],
      },
    },
    {
      label: 'Availability is checked after pricing, for the priced lines',
      rule: { type: 'before', first: 'choice', then: 'http-request', thenWhere: { path: 'inventor' }, outside: true },
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
      label: 'An unknown customer from the CRM System API is mapped to a business error, not a 500',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: ['on-error-propagate', 'on-error-continue'], where: { type: 'NOT_FOUND' } },
          handlerStatus('NOT_FOUND', { oneOf: ['400', '404', '409', '422'] }),
        ],
      },
    },
  ],
  simulation: {
    systems: {
      http: [
        { method: 'GET', path: '/sys-crm/v1/customers/{customerId}', latencyMs: 300, respond: (req) => ({ status: 200, body: { id: req.params.customerId, name: 'Baltic Tools GmbH', segment: 'B2B' } }) },
        {
          method: 'POST',
          path: '/sys-erp/v1/contract-prices',
          latencyMs: 700,
          respond: (req) => ({ status: 200, body: (req.body?.lines ?? []).map((l) => ({ sku: l.sku, quantity: l.quantity, unitPrice: { 'DRILL-18V': 89, 'BIT-SET-32': 12.5 }[l.sku] ?? 10 })) }),
        },
        {
          method: 'POST',
          path: '/sys-pricing/v1/list-prices',
          latencyMs: 250,
          respond: (req) => ({ status: 200, body: (req.body?.lines ?? []).map((l) => ({ sku: l.sku, quantity: l.quantity, unitPrice: { 'DRILL-18V': 119, 'BIT-SET-32': 19.9 }[l.sku] ?? 15 })) }),
        },
        {
          method: 'POST',
          path: '/sys-inventory/v1/availability',
          latencyMs: 200,
          respond: (req) => ({ status: 200, body: [].concat(req.body?.lines ?? req.body ?? []).map((l) => ({ sku: l.sku, available: l.sku === 'DRILL-18V' ? 40 : 3 })) }),
        },
        { method: 'POST', path: '/prc-quotes/v1/quotes', latencyMs: 1600, respond: { status: 200, body: { quoteId: 'Q-20931', customerId: '001KV00000B2B01', lines: [{ sku: 'DRILL-18V', quantity: 5, unitPrice: 89, available: true }], total: 445 } } },
      ],
      calls: { 'sf-query': { latencyMs: 350, payload: [{ Id: '001KV00000B2B01', Name: 'Baltic Tools GmbH', Segment__c: 'B2B' }] } },
    },
    tests: [
      {
        name: 'A B2B customer',
        about: 'The customer is B2B, so the lines are priced from ERP contract prices and then checked for stock.',
        trigger: { http: { method: 'POST', path: '/prc-quotes/v1/quotes', body: { customerId: '001KV00000B2B01', lines: [{ sku: 'DRILL-18V', quantity: 5 }, { sku: 'BIT-SET-32', quantity: 10 }] } } },
        expect: {
          status: 200,
          bodyHas: { total: 570 },
          calls: [
            { method: 'GET', path: '/sys-crm/v1/customers/{customerId}', count: 1 },
            { method: 'POST', path: '/sys-erp/v1/contract-prices', count: 1 },
            { method: 'POST', path: '/sys-pricing/v1/list-prices', count: 0 },
            { method: 'POST', path: '/sys-inventory/v1/availability', count: 1 },
          ],
        },
      },
      {
        name: 'A B2C customer',
        about: 'A consumer is priced from the public price list, and the ERP is not called.',
        trigger: { http: { method: 'POST', path: '/prc-quotes/v1/quotes', body: { customerId: '003KV00000C2C77', lines: [{ sku: 'DRILL-18V', quantity: 1 }] } } },
        overrides: { systems: { http: [{ method: 'GET', path: '/sys-crm/v1/customers/{customerId}', respond: { status: 200, body: { id: '003KV00000C2C77', name: 'Pia Jensen', segment: 'B2C' } } }] } },
        expect: {
          status: 200,
          bodyHas: { total: 119 },
          calls: [
            { method: 'POST', path: '/sys-erp/v1/contract-prices', count: 0 },
            { method: 'POST', path: '/sys-pricing/v1/list-prices', count: 1 },
          ],
        },
      },
      {
        name: 'An unknown customer',
        about: 'The CRM System API answers 404, so no price or stock is looked up and the portal gets a business error.',
        trigger: { http: { method: 'POST', path: '/prc-quotes/v1/quotes', body: { customerId: '001KV00000NOPE0', lines: [{ sku: 'DRILL-18V', quantity: 1 }] } } },
        overrides: { systems: { http: [{ method: 'GET', path: '/sys-crm/v1/customers/{customerId}', respond: { status: 404, body: { message: 'No such customer' } } }] } },
        expect: {
          bodyLacks: '~No listener for endpoint',
          calls: [
            { method: 'GET', path: '/sys-crm/v1/customers/{customerId}', count: 1 },
            { method: 'POST', path: '/sys-erp/v1/contract-prices', count: 0 },
            { method: 'POST', path: '/sys-pricing/v1/list-prices', count: 0 },
            { method: 'POST', path: '/sys-inventory/v1/availability', count: 0 },
          ],
        },
      },
      {
        name: 'The inventory API hangs',
        about: 'Stock cannot be checked, but the portal still gets an answer inside the 5 s SLA.',
        trigger: { http: { method: 'POST', path: '/prc-quotes/v1/quotes', body: { customerId: '001KV00000B2B01', lines: [{ sku: 'DRILL-18V', quantity: 5 }] } } },
        overrides: { systems: { http: [{ method: 'POST', path: '/sys-inventory/v1/availability', latencyMs: 30000, respond: { status: 200, body: [] } }] } },
        expect: { maxMs: 5000, calls: [{ method: 'POST', path: '/sys-inventory/v1/availability', count: 1 }] },
      },
      {
        name: 'The portal asks for a quote',
        about: 'The Experience API passes the request to the Process API and never calls a System API itself.',
        trigger: { http: { method: 'POST', path: '/exp-sales-portal/v1/quotes', body: { customerId: '001KV00000B2B01', lines: [{ sku: 'DRILL-18V', quantity: 5 }] } } },
        expect: {
          status: 200,
          calls: [
            { method: 'POST', path: '/prc-quotes/v1/quotes', count: 1 },
            { method: 'GET', path: '/sys-crm/v1/customers/{customerId}', count: 0 },
          ],
        },
      },
    ],
  },
  optionalSteps: [
    {
      type: 'on-error-propagate',
      why: 'The scenario asks only for the unknown customer mapping. The other handlers pick 502, 503 or 500 for outages, and Mule already answers with an error status when no handler matches.',
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
        // The CRM answer replaced the payload; the pricing APIs need the quote lines back.
        step('set-payload', { value: '#[vars.request]' }),
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

**Load:** ~10 quotes/s, 5 s end-to-end SLA. Even when a System API hangs, the portal gets an answer inside 5 s.

**Facts**
- The portal calls the Experience API \`POST /exp-sales-portal/v1/quotes\`. The Process API is \`POST /prc-quotes/v1/quotes\`. Both take \`{ customerId, lines: [{ sku, quantity }] }\`.
- CRM System API: \`GET /sys-crm/v1/customers/{customerId}\` answers \`{ id, name, segment }\`, or 404 for an unknown customer.
- ERP: \`POST /sys-erp/v1/contract-prices\`. Pricing engine: \`POST /sys-pricing/v1/list-prices\`. Both take \`{ lines }\` and answer \`[{ sku, quantity, unitPrice }]\`.
- Inventory: \`POST /sys-inventory/v1/availability\` takes the priced lines and answers \`[{ sku, available }]\` with the quantity in stock.
- The quote is \`{ quoteId, customerId, segment, lines: [{ sku, quantity, unitPrice, available }], total }\`, where \`available\` is true when the stock covers the quantity and \`total\` is the sum of quantity times unit price.

**What each system sends back**
- CRM: **200** \`{ "id": "001KV00000B2B01", "name": "Baltic Tools GmbH", "segment": "B2B" }\`.
- ERP or pricing engine: **200** \`[ { "sku": "DRILL-18V", "quantity": 5, "unitPrice": 89 } ]\`.
- Inventory: **200** \`[ { "sku": "DRILL-18V", "available": 40 } ]\`, where \`available\` is a stock count, not a flag.
- Inside the CRM System API, a Salesforce query returns a list of records: \`[ { "Id": "001KV00000B2B01", "Name": "Baltic Tools GmbH", "Segment__c": "B2B" } ]\`.

**What failures look like**
- An unknown customer: the CRM System API answers **404** with \`{ "message": "No such customer" }\`. The HTTP Request raises \`HTTP:NOT_FOUND\`. Call nothing else and answer a business error such as **422** \`UNKNOWN_CUSTOMER\`.
- A System API that hangs: the HTTP Request raises \`HTTP:TIMEOUT\` once its response timeout passes (\`HTTP:CONNECTIVITY\` if it is down, \`HTTP:SERVICE_UNAVAILABLE\` for a 503). Answer **503**; keep the timeouts small enough that the portal still gets its answer inside 5 s.

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
    'A Choice on the customer segment selects the pricing System API: the Experience API never needs to know B2B and B2C are priced differently.',
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

**prc-quotes**: \`POST /prc-quotes/v1/quotes\`
1. Save the request (\`vars.request\`).
2. HTTP Request \`GET /sys-crm/v1/customers/{customerId}\` (1.5 s) → \`vars.customer\`.
3. Set Payload back to \`vars.request\`: the CRM answer replaced it, and the pricing APIs need the quote lines.
4. **Choice** \`vars.customer.segment == "B2B"\` → \`/sys-erp/v1/contract-prices\` (2 s); otherwise \`/sys-pricing/v1/list-prices\` (1 s) → \`vars.prices\`.
5. HTTP Request \`/sys-inventory/v1/availability\` (1 s).
6. Transform builds the quote from \`vars.customer\`, \`vars.prices\` and the availability payload.

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

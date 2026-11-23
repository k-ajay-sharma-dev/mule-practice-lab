import { design, flow, handler, source, step } from '../../flow/dsl.js'
import { handlerStatus } from '../../flow/rules.js'

export default {
  id: 'fl-048',
  category: 'flows',
  title: 'Two Experience APIs (Mobile and Partner) Sharing One Process API',
  level: 'BEGINNER',
  tags: ['api-led', 'experience-api', 'process-api', 'reuse', 'architecture'],
  estMinutes: 25,
  flowChecks: [
    { label: 'Each API is its own flow (two experience, one process, at least one system)', rule: { type: 'flows', kind: 'flow', min: 4 } },
    {
      label: 'Mobile and partner each get their own Experience API listener (/exp-...)',
      rule: { type: 'exists', component: 'http-listener', where: { path: 'exp-' }, min: 2 },
    },
    {
      label: 'A single Process API listener (/prc-...) holds the shared logic',
      rule: { type: 'source', component: 'http-listener', where: { path: 'prc-' } },
    },
    {
      label: 'Both Experience APIs call the same Process API over HTTP Request, never a System API',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'http-request', where: { path: 'prc-' }, min: 2 },
          { type: 'absent', component: 'http-request', where: { path: 'sys-' }, inFlowWith: { component: 'http-listener', where: { path: 'exp-' } } },
        ],
      },
    },
    {
      label: 'The Process API reaches the OMS only through a System API',
      rule: {
        type: 'all',
        rules: [
          { type: 'before', first: 'http-listener', firstWhere: { path: 'prc-' }, then: 'http-request', thenWhere: { path: 'sys-' } },
          { type: 'absent', component: 'db-select', inFlowWith: { component: 'http-listener', where: { path: { oneOf: ['prc-', 'exp-'] } } } },
        ],
      },
    },
    { label: 'Each layer shapes its own model with DataWeave', rule: { type: 'exists', component: 'transform', min: 3 } },
    {
      label: 'The partner Experience API answers in XML',
      rule: { type: 'before', first: 'http-listener', firstWhere: { path: 'exp-' }, then: 'transform', thenWhere: { script: 'application/xml' } },
    },
    {
      label: 'Process API HTTP errors are translated into channel-friendly responses',
      rule: { type: 'exists', component: ['on-error-propagate', 'on-error-continue'], where: { type: 'HTTP:' } },
    },
    {
      label: 'An unknown customer gives the mobile app an empty list (200) and partners a 404',
      rule: {
        type: 'all',
        rules: [
          {
            type: 'any',
            rules: [
              handlerStatus('NOT_FOUND', '200'),
              { type: 'inside', component: ['set-payload', 'transform'], within: 'on-error-continue', withinWhere: { type: 'NOT_FOUND' } },
            ],
          },
          handlerStatus('NOT_FOUND', '404'),
        ],
      },
    },
    {
      label: 'Both Experience APIs set their own error status when the Process API fails',
      rule: {
        type: 'inside',
        component: 'set-variable',
        where: { variableName: 'status' },
        within: ['on-error-propagate', 'on-error-continue'],
        withinWhere: { type: 'ANY' },
        min: 2,
      },
    },
  ],
  simulation: {
    systems: {
      http: [
        {
          method: 'GET',
          path: '/prc-orders/v1/customers/{customerId}/orders',
          latencyMs: 240,
          respond: {
            status: 200,
            body: {
              orders: [
                { orderId: 'SO-88412', orderDate: '2026-11-08', status: 'SHIPPED', total: { amount: 129.9, currency: 'EUR' }, lines: [{ sku: 'BOOT-42', quantity: 1, unitPrice: 129.9, imageUrl: 'https://cdn.example.com/boot-42.jpg' }] },
                { orderId: 'SO-87120', orderDate: '2026-10-21', status: 'DELIVERED', total: { amount: 45.5, currency: 'EUR' }, lines: [{ sku: 'SOCK-3P', quantity: 2, unitPrice: 22.75, imageUrl: 'https://cdn.example.com/sock-3p.jpg' }] },
              ],
            },
          },
        },
        {
          method: 'GET',
          path: '/sys-oms/v1/orders',
          latencyMs: 120,
          respond: {
            status: 200,
            body: [
              { orderId: 'SO-87120', orderDate: '2026-10-21', status: 'DELIVERED', total: { amount: 45.5, currency: 'EUR' }, lines: [] },
              { orderId: 'SO-88412', orderDate: '2026-11-08', status: 'SHIPPED', total: { amount: 129.9, currency: 'EUR' }, lines: [] },
            ],
          },
        },
      ],
      db: {
        tables: {
          oms_order: {
            key: 'order_no',
            rows: [
              { order_no: 'SO-87120', customer_id: 'C-100231', created_ts: '2026-10-21', status: 'DELIVERED', total_amt: 45.5, currency_cd: 'EUR' },
              { order_no: 'SO-88412', customer_id: 'C-100231', created_ts: '2026-11-08', status: 'SHIPPED', total_amt: 129.9, currency_cd: 'EUR' },
            ],
          },
        },
      },
    },
    tests: [
      {
        name: 'The mobile app lists orders',
        about: 'The mobile Experience API gets the orders from the Process API and answers 200 within its 2 s budget.',
        trigger: { http: { method: 'GET', path: '/exp-mobile/v1/me/orders', headers: { authorization: 'Bearer eyJhbGciOiJSUzI1NiJ9.mobile', 'x-customer-id': 'C-100231' } } },
        expect: { status: 200, maxMs: 2000, calls: [{ method: 'GET', path: '/prc-orders/v1/customers/{customerId}/orders', count: 1 }, { method: 'GET', path: '/sys-oms/v1/orders', count: 0 }] },
      },
      {
        name: 'A partner lists orders',
        about: 'The partner Experience API calls the same Process API, not the System API.',
        trigger: { http: { method: 'GET', path: '/exp-partner/v1/orders', query: { customerId: 'C-100231' } } },
        expect: { status: 200, calls: [{ method: 'GET', path: '/prc-orders/v1/customers/{customerId}/orders', count: 1 }, { method: 'GET', path: '/sys-oms/v1/orders', count: 0 }] },
      },
      {
        name: 'The mobile app asks for an unknown customer',
        about: 'The Process API answers 404, and the app gets 200 with an empty list instead of an error.',
        trigger: { http: { method: 'GET', path: '/exp-mobile/v1/me/orders', headers: { authorization: 'Bearer eyJhbGciOiJSUzI1NiJ9.mobile', 'x-customer-id': 'C-100231' } } },
        overrides: { systems: { http: [{ method: 'GET', path: '/prc-orders/v1/customers/{customerId}/orders', respond: { status: 404, body: { message: 'Customer not found' } } }] } },
        expect: { status: 200 },
      },
      {
        name: 'A partner asks for an unknown customer',
        about: 'The Process API answers 404, and the partner gets 404 too.',
        trigger: { http: { method: 'GET', path: '/exp-partner/v1/orders', query: { customerId: 'C-404404' } } },
        overrides: { systems: { http: [{ method: 'GET', path: '/prc-orders/v1/customers/{customerId}/orders', respond: { status: 404, body: { message: 'Customer not found' } } }] } },
        expect: { status: 404, bodyLacks: '~No listener for endpoint' },
      },
      {
        name: 'The Process API reads the OMS',
        about: 'The Process API gets the orders through the System API, never from the database itself.',
        trigger: { http: { method: 'GET', path: '/prc-orders/v1/customers/C-100231/orders' } },
        overrides: { systems: { db: { fault: 'CONNECTIVITY' } } },
        expect: { status: 200, calls: [{ method: 'GET', path: '/sys-oms/v1/orders', count: 1 }] },
      },
    ],
  },
  optionalSteps: [
    {
      type: 'on-error-propagate',
      flow: 'prc-orders-history',
      why: 'This handler only logs and rethrows, which Mule does by default. Each Experience API turns the failure into its own response.',
    },
  ],
  referenceFlow: design(
    flow(
      'exp-mobile-orders',
      source('http-listener', { path: '/exp-mobile/v1/me/orders', allowedMethods: 'GET' }),
      [
        // The JWT policy on this API has validated the token and passes its subject on as a header.
        step('set-variable', { variableName: 'customerId', value: '#[attributes.headers."x-customer-id"]' }),
        step('http-request', { method: 'GET', path: '/prc-orders/v1/customers/{customerId}/orders?limit=10', responseTimeout: 2000 }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\npayload.orders map {\n  id: $.orderId,\n  date: $.orderDate as Date as String { format: "dd MMM" },\n  total: $.total.amount,\n  status: $.status,\n  thumb: $.lines[0].imageUrl default null\n}',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'HTTP:NOT_FOUND' }, [
          step('set-variable', { variableName: 'httpStatus', value: '200' }),
          step('set-payload', { value: '#[output application/json --- []]' }),
        ]),
        handler('on-error-propagate', { type: 'ANY' }, [
          step('set-variable', { variableName: 'httpStatus', value: '503' }),
          step('set-payload', { value: '#[output application/json --- { message: "Your orders are not available right now. Please try again." }]' }),
        ]),
      ],
    ),
    flow(
      'exp-partner-orders',
      source('http-listener', { path: '/exp-partner/v1/orders', allowedMethods: 'GET' }),
      [
        step('http-request', { method: 'GET', path: '/prc-orders/v1/customers/{customerId}/orders', responseTimeout: 5000 }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/xml\n---\nOrders: {\n  (payload.orders map {\n    Order @(id: $.orderId): {\n      OrderDate: $.orderDate,\n      Status: $.status,\n      Currency: $.total.currency,\n      Total: $.total.amount,\n      Lines: {\n        ($.lines map { Line @(sku: $.sku): { Qty: $.quantity, Price: $.unitPrice } })\n      }\n    }\n  })\n}',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'HTTP:NOT_FOUND' }, [step('set-variable', { variableName: 'httpStatus', value: '404' })]),
        handler('on-error-propagate', { type: 'ANY' }, [step('set-variable', { variableName: 'httpStatus', value: '502' })]),
      ],
    ),
    flow(
      'prc-orders-history',
      source('http-listener', { path: '/prc-orders/v1/customers/{customerId}/orders', allowedMethods: 'GET' }),
      [
        step('http-request', { method: 'GET', path: '/sys-oms/v1/orders?customerId={customerId}', responseTimeout: 1500 }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{\n  orders: if (isEmpty(payload)) [] else (payload orderBy $.orderDate)[-1 to 0]\n}',
        }),
      ],
      [handler('on-error-propagate', { type: 'ANY' }, [step('logger', { level: 'ERROR', message: '#[error.description]' })])],
    ),
    flow(
      'sys-oms-orders',
      source('http-listener', { path: '/sys-oms/v1/orders', allowedMethods: 'GET' }),
      [
        step('db-select', { sql: 'SELECT * FROM oms_order WHERE customer_id = :customerId' }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\npayload map {\n  orderId: $.order_no,\n  orderDate: $.created_ts,\n  status: $.status,\n  total: { amount: $.total_amt, currency: $.currency_cd },\n  lines: []\n}',
        }),
      ],
    ),
  ),
  description: `
A retailer exposes **order history** to two very different consumers:

- **Mobile app**: small screens, slow networks: last 10 orders, a handful of fields, JSON, friendly empty state. ~200 req/s at peak, 2 s budget.
- **B2B partners** (marketplaces): full detail with every order line, **XML**, strict contract versioning. ~5 req/s, 5 s budget.

Order data lives in the **OMS** database. The business rules ("which orders a customer may see", sorting, currency handling) must be written **once**. An unknown customer should show the mobile app an empty list, while partners get a 404.

**Facts**
- Mobile: \`GET /exp-mobile/v1/me/orders\`. The gateway has checked the token and passes the customer id in the \`X-Customer-Id\` header.
- Partners: \`GET /exp-partner/v1/orders?customerId=...\`.
- The shared Process API is \`GET /prc-orders/v1/customers/{customerId}/orders\` (with an optional \`limit\`). It answers \`{ orders: [{ orderId, orderDate, status, total: { amount, currency }, lines }] }\`, newest first, or 404 for an unknown customer.
- The OMS System API is \`GET /sys-oms/v1/orders?customerId=...\`. It reads the \`oms_order\` table (\`order_no\`, \`customer_id\`, \`created_ts\`, \`status\`, \`total_amt\`, \`currency_cd\`).

**What each system sends back**
- The Process API answers **200** with:
\`\`\`json
{ "orders": [ { "orderId": "SO-88412", "orderDate": "2026-11-08", "status": "SHIPPED", "total": { "amount": 129.9, "currency": "EUR" },
    "lines": [ { "sku": "BOOT-42", "quantity": 1, "unitPrice": 129.9, "imageUrl": "https://cdn.example.com/boot-42.jpg" } ] } ] }
\`\`\`
- The OMS System API answers **200** with a plain list in the same order shape: \`[ { "orderId": "SO-87120", "orderDate": "2026-10-21", "status": "DELIVERED", "total": { "amount": 45.5, "currency": "EUR" }, "lines": [] } ]\`.
- Its Database Select returns rows keyed by the column names as written above, for example \`{ "order_no": "SO-87120", "created_ts": "2026-10-21", "total_amt": 45.5, "currency_cd": "EUR", ... }\`.

**What failures look like**
- An unknown customer: the Process API answers **404** with \`{ "message": "Customer not found" }\`, which the Experience API's HTTP Request raises as \`HTTP:NOT_FOUND\`. Mobile answers **200** with \`[]\`; partners answer **404**.
- Any other failure below: mobile answers **503** with a friendly message, partners answer **502**.

**Convention for API-led problems:** one canvas holds the whole application network. Draw each API as a separate flow whose name starts with its layer prefix (\`exp-\`, \`prc-\`, \`sys-\`), give it an HTTP Listener whose path shows the API (e.g. \`/exp-mobile/v1/me/orders\`), and let layers call each other with HTTP Request pointing at the lower API's path.

**Design the flow(s):** which APIs exist in each layer, who calls whom, where each response shape is produced and how errors reach each channel.
`,
  answerTemplate: `## APIs per layer

## Mobile experience

## Partner experience

## Shared process logic

## Errors per channel
`,
  keyPoints: [
    'One Experience API per channel (or channel family): mobile and partner have different shapes, formats, SLAs, security policies and release cycles.',
    'Both Experience APIs call the same Process API: the business rules are written once and reused, which is the main payoff of API-led connectivity.',
    'Experience APIs are thin: call the Process API, reshape (JSON trim vs full XML), translate errors. No business logic and no system calls.',
    'The Process API reaches the OMS through a System API, so a future OMS replacement does not touch either channel.',
    'Errors are translated per channel: mobile turns 404 into a friendly empty list, the partner gets a strict 404/502 contract.',
  ],
  solution: `
\`\`\`
   Mobile app                    Partners
       |                             |
 +----------------+         +------------------+
 | exp-mobile     |         | exp-partner      |   EXPERIENCE (one per channel)
 | JSON, 10 rows  |         | XML, full lines  |
 +----------------+         +------------------+
          \\                        /
           \\  GET /prc-orders/... /
            v                    v
        +---------------------------+
        | prc-orders-history        |              PROCESS (rules written once)
        +---------------------------+
                     |  GET /sys-oms/v1/orders
                     v
        +---------------------------+
        | sys-oms-orders            |              SYSTEM (unlocks the OMS DB)
        +---------------------------+
\`\`\`

- **exp-mobile-orders**: \`GET /exp-mobile/v1/me/orders\` → HTTP Request \`/prc-orders/v1/customers/{customerId}/orders?limit=10\` (2 s) → Transform to a small JSON card list. \`HTTP:NOT_FOUND\` becomes an empty list; anything else a friendly 503 message.
- **exp-partner-orders**: \`GET /exp-partner/v1/orders\` → same Process API (5 s) → Transform to the partner's **XML** contract with all lines. Errors map strictly to 404/502.
- **prc-orders-history**: \`GET /prc-orders/v1/customers/{customerId}/orders\` → HTTP Request to \`sys-oms\` → sort newest first, apply visibility rules, canonical \`Order\` model.
- **sys-oms-orders**: \`GET /sys-oms/v1/orders\` → Database Select → map columns to the System API model.

The customer id for mobile comes from the validated access token (not from the URL), which is why mobile uses \`/me/orders\`.
`,
  followUps: [
    {
      q: 'Partners want a different field next month. Which APIs change?',
      a: 'Only exp-partner (and its contract version). If the field is not yet in the canonical model, the Process API adds it in a backward-compatible way; mobile is untouched.',
    },
    {
      q: 'Why not one Experience API with a ?format=xml flag for both channels?',
      a: 'The channels differ in security (end-user OAuth vs partner client credentials), SLAs, rate limits and release cadence. Separate APIs let each have its own policies and versioning without coupling the two consumer groups.',
    },
    {
      q: 'Where do client ID enforcement and rate limiting go?',
      a: 'As API Manager policies on the Experience APIs (per consumer contract), not as flow logic. Process and System APIs typically sit behind client ID enforcement too, often only reachable from inside the VPC.',
    },
  ],
}

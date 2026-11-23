import { design, flow, handler, scope, source, step, subFlow } from '../../flow/dsl.js'

export default {
  id: 'fl-008',
  category: 'flows',
  title: 'Reusing Logic: Sub-flow vs Private Flow vs Flow Reference',
  level: 'BEGINNER',
  tags: ['sub-flow', 'flow-ref', 'private-flow', 'reuse', 'error-handling'],
  estMinutes: 25,
  flowChecks: [
    { label: 'Shared logic is extracted into at least one sub-flow', rule: { type: 'flows', kind: 'sub-flow', min: 1 } },
    {
      label: 'Endpoint flows call the shared pieces with Flow References',
      rule: { type: 'exists', component: 'flow-ref', min: 3 },
    },
    { label: 'Every Flow Reference points to an existing flow or sub-flow', rule: { type: 'refs' } },
    {
      label: 'Shared init sets a correlation ID variable before logging',
      rule: { type: 'before', first: 'set-variable', firstWhere: { variableName: 'correlationId' }, then: 'logger' },
    },
    {
      label: 'The tenant config lookup is cached (Cache scope around the Database Select)',
      rule: { type: 'inside', component: 'db-select', where: { sql: 'tenant' }, within: 'cache' },
    },
    {
      label: 'The Audit API call is made from shared logic, behind a Flow Reference',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'flow-ref' },
          { type: 'absent', component: 'http-request', where: { path: 'audit' }, inFlowWith: { component: 'http-listener' } },
        ],
      },
    },
    {
      label: 'Audit failures are logged and ignored with On Error Continue',
      rule: { type: 'inside', component: 'logger', within: 'on-error-continue' },
    },
    {
      label: 'Audit failures never reach the endpoint flows (no On Error Propagate around the audit call)',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'on-error-continue' },
          { type: 'absent', component: 'on-error-propagate', inFlowWith: { component: 'http-request', where: { path: 'audit' } } },
        ],
      },
    },
  ],
  simulation: {
    systems: {
      http: [{ method: 'POST', path: '/audit/events', latencyMs: 90, respond: { status: 202, body: { accepted: true } } }],
      db: {
        tables: {
          tenant_config: { key: 'tenant_id', rows: [{ tenant_id: 'T-100', name: 'Acme Retail', currency: 'EUR' }, { tenant_id: 'T-200', name: 'Globex', currency: 'USD' }] },
          orders: {
            key: 'order_id',
            rows: [
              { order_id: 'O-5001', tenant_id: 'T-100', total: 120 },
              { order_id: 'O-5002', tenant_id: 'T-100', total: 35.5 },
              { order_id: 'O-7001', tenant_id: 'T-200', total: 990 },
            ],
          },
          invoices: { key: 'invoice_id', rows: [{ invoice_id: 'INV-301', tenant_id: 'T-100', amount: 155.5 }] },
          customers: { key: 'customer_id', rows: [{ customer_id: 'C-11', tenant_id: 'T-100', name: 'Mia Lopez' }] },
        },
      },
    },
    tests: [
      {
        name: 'Orders for one tenant',
        about: 'The request is logged, audited once, and only that tenant\'s orders come back.',
        trigger: { http: { method: 'GET', path: '/api/orders', headers: { 'x-tenant-id': 'T-100' } } },
        expect: {
          status: 200,
          bodyHas: [{ order_id: 'O-5001' }, { order_id: 'O-5002' }],
          bodyLacks: [{ order_id: 'O-7001' }],
          calls: [{ method: 'POST', path: '/audit/events', count: 1 }],
          logs: [{ has: 'request received' }],
        },
      },
      {
        name: 'The Audit API is down',
        about: 'The audit call is refused. The failure is logged and the caller still gets the invoices.',
        trigger: { http: { method: 'GET', path: '/api/invoices', headers: { 'x-tenant-id': 'T-100' } } },
        overrides: { systems: { http: [{ method: 'POST', path: '/audit/events', respond: { fault: 'CONNECTIVITY' } }] } },
        expect: { status: 200, bodyHas: [{ invoice_id: 'INV-301' }], logs: [{ level: ['WARN', 'ERROR'] }] },
      },
      {
        name: 'Two tenants in a row',
        about: 'Acme asks first, then Globex. Globex gets its own orders, not a cached answer meant for Acme.',
        triggers: [
          { http: { method: 'GET', path: '/api/orders', headers: { 'x-tenant-id': 'T-100' } } },
          { http: { method: 'GET', path: '/api/orders', headers: { 'x-tenant-id': 'T-200' } } },
        ],
        expect: { status: 200, bodyHas: [{ order_id: 'O-7001' }], bodyLacks: [{ order_id: 'O-5001' }] },
      },
      {
        name: 'The Audit API returns 500',
        about: 'The audit service fails with an error status. The customers request still succeeds.',
        trigger: { http: { method: 'GET', path: '/api/customers', headers: { 'x-tenant-id': 'T-100' } } },
        overrides: { systems: { http: [{ method: 'POST', path: '/audit/events', respond: { status: 500, body: { message: 'Internal error' } } }] } },
        expect: { status: 200, bodyHas: [{ customer_id: 'C-11' }], logs: [{ level: ['WARN', 'ERROR'] }] },
      },
    ],
  },
  referenceFlow: design(
    flow('get-orders', source('http-listener', { path: '/api/orders', allowedMethods: 'GET' }), [
      step('flow-ref', { name: 'common-request-init' }),
      step('flow-ref', { name: 'get-tenant-config' }),
      step('flow-ref', { name: 'audit-call', target: 'auditResult' }),
      step('db-select', { sql: 'SELECT * FROM orders WHERE tenant_id = :tenantId' }),
    ]),
    flow('get-invoices', source('http-listener', { path: '/api/invoices', allowedMethods: 'GET' }), [
      step('flow-ref', { name: 'common-request-init' }),
      step('flow-ref', { name: 'get-tenant-config' }),
      step('flow-ref', { name: 'audit-call', target: 'auditResult' }),
      step('db-select', { sql: 'SELECT * FROM invoices WHERE tenant_id = :tenantId' }),
    ]),
    flow('get-customers', source('http-listener', { path: '/api/customers', allowedMethods: 'GET' }), [
      step('flow-ref', { name: 'common-request-init' }),
      step('flow-ref', { name: 'get-tenant-config' }),
      step('flow-ref', { name: 'audit-call', target: 'auditResult' }),
      step('db-select', { sql: 'SELECT * FROM customers WHERE tenant_id = :tenantId' }),
    ]),
    subFlow('common-request-init', [
      step('set-variable', { variableName: 'correlationId', value: '#[attributes.headers."x-correlation-id" default correlationId]' }),
      // kept in a variable: the Audit API call replaces the attributes, so the request headers are gone after it
      step('set-variable', { variableName: 'tenantId', value: '#[attributes.headers."x-tenant-id"]' }),
      step('logger', {
        level: 'INFO',
        message: '#[write({ event: "request received", path: attributes.requestPath, correlationId: vars.correlationId }, "application/json")]',
      }),
    ]),
    subFlow('get-tenant-config', [
      step('set-variable', { variableName: 'businessPayload', value: '#[payload]' }),
      // the Cache scope keys on the payload by default, so the tenant ID becomes the payload: one entry per tenant
      step('set-payload', { value: '#[vars.tenantId]' }),
      scope('cache', { cachingStrategy: 'tenant-config-cache' }, [
        step('db-select', { sql: 'SELECT * FROM tenant_config WHERE tenant_id = :tenantId' }),
      ]),
      step('set-variable', { variableName: 'tenant', value: '#[payload[0]]' }),
      step('set-payload', { value: '#[vars.businessPayload]' }),
    ]),
    flow('audit-call', null, [
      step('http-request', { method: 'POST', path: '/audit/events', responseTimeout: 2000 }),
    ], [
      handler('on-error-continue', { type: 'HTTP:CONNECTIVITY, HTTP:TIMEOUT, HTTP:INTERNAL_SERVER_ERROR, HTTP:SERVICE_UNAVAILABLE' }, [
        step('logger', { level: 'WARN', message: '#["Audit call failed, ignored: " ++ error.description]' }),
      ]),
    ]),
  ),
  description: `
A team has three APIs in one Mule app: \`GET /api/orders\`, \`GET /api/invoices\` and \`GET /api/customers\`. Each returns the caller's rows from the \`orders\`, \`invoices\` or \`customers\` table, filtered on the \`tenant_id\` column. Every endpoint copies the same 15 processors:

- Set a \`correlationId\` and log a structured "request received" entry.
- Look up the caller's tenant config from the \`tenant_config\` table (cached per tenant). The tenant ID arrives in the \`x-tenant-id\` request header.
- Call a central **Audit API** (\`POST /audit/events\`). If the audit call fails (no connection, timeout or a 5xx), log a warning and ignore it. It must never fail the business request.

A code review asks you to refactor this into reusable pieces.

**What each system sends back**
- A Database Select answers with a list of rows, with the column names as in the table. \`SELECT * FROM orders WHERE tenant_id = :tenantId\` for \`T-100\` gives:
\`\`\`json
[ { "order_id": "O-5001", "tenant_id": "T-100", "total": 120 }, { "order_id": "O-5002", "tenant_id": "T-100", "total": 35.5 } ]
\`\`\`
- The tenant lookup gives one row in a list, for example \`[ { "tenant_id": "T-100", "name": "Acme Retail", "currency": "EUR" } ]\`.
- The Audit API answers 202 with \`{ "accepted": true }\`. The HTTP Request replaces the payload and the attributes with this answer, so the request headers are gone after it.

**What failures look like**
- The Audit API refuses the connection: the HTTP Request raises \`HTTP:CONNECTIVITY\`.
- The Audit API answers 500: the HTTP Request raises \`HTTP:INTERNAL_SERVER_ERROR\`.
- In both cases log a WARN and go on. The endpoint still answers 200 with its rows.

**Design the flow(s):**
- Which parts become a **sub-flow** and which a **private flow** (flow without a source), and why?
- How do they get called, and how do variables and errors behave across the call?
- How would you share this logic with *other* Mule apps?
`,
  answerTemplate: `## Reusable units

## Calling them (Flow Reference)

## Variables and payload

## Error handling differences

## Sharing across applications
`,
  keyPoints: [
    'A sub-flow has no source and no error handler; it runs in the caller\'s context and errors propagate to the caller\'s error handler.',
    'A private flow (flow without a source) can have its own error handler, so the audit call lives in a private flow with On Error Continue.',
    'Both are invoked with Flow Reference; payload, attributes and variables are shared with the caller (changes are visible after the call).',
    'Flow Reference target/targetValue can store the result in a variable instead of overwriting the payload.',
    'Cross-app reuse is done with a Mule plugin / shared library or a domain project for shared configs, not by copying flows.',
  ],
  solution: `
1. **Logging/correlation → sub-flow** \`common-request-init\`: Set Variable \`correlationId\` (\`#[correlationId]\` or an incoming header), Set Variable \`tenantId\` from the \`x-tenant-id\` header, Logger with a JSON message. No error handling needed: if it fails, the caller should know. The tenant ID must be saved here: the Audit API call is an HTTP Request, which replaces the attributes, so the request headers are gone by the time the business query runs.
2. **Tenant lookup → sub-flow** \`get-tenant-config\`: Cache scope wrapping a Database Select, with a key expression on the tenant ID (the default key is a SHA-256 of the payload); output stored with Flow Reference \`target="tenant"\` so the business payload is untouched.
3. **Audit call → private flow** \`audit-call\`: HTTP Request to the Audit API inside a flow with its **own error handler**: On Error Continue for the HTTP error types that logs a warning. Because the error is handled inside that flow, the caller continues normally. Call it with Flow Reference \`target="auditResult"\` so the audit answer does not replace the business payload.
   - Alternative: keep it a sub-flow but wrap the Flow Reference in a **Try scope** with On Error Continue. Either works; the private flow keeps the policy in one place.
4. **Calling:** each API endpoint flow (e.g. \`get:\\orders:orders-api-config\`) starts with \`<flow-ref name="common-request-init"/>\`. Variables set inside the sub-flow/private flow are visible to the caller afterwards (same event).
5. **Sharing across apps:** package common flows/configs as a **Mule plugin or shared library** in Exchange and import them via the POM. Or use a **domain project** for shared connector configs on on-prem runtimes. For truly cross-cutting concerns (logging headers, auth) consider **API Manager policies** instead of code.
`,
  followUps: [
    { q: 'Can a sub-flow have an error handler?', a: 'No. A sub-flow has no source and no error handler; use a Try scope inside it, or make it a private flow if it needs its own handling.' },
    { q: 'Why not use a VM queue to call the shared logic?', a: 'VM adds a thread hop, serialization and a separate transaction/event context; it is meant for decoupling or async hand-off. For synchronous in-app reuse, Flow Reference is lighter and cheaper.' },
    { q: 'Does a private flow get its own copy of variables?', a: 'No. With Flow Reference the same event flows through, so variables are shared. Only transports like VM or HTTP create a new event without the caller\'s variables.' },
  ],
}

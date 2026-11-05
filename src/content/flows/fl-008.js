import { design, flow, handler, scope, source, step, subFlow } from '../../flow/dsl.js'

export default {
  id: 'fl-008',
  category: 'flows',
  title: 'Reusing Logic: Sub-flow vs Private Flow vs Flow Reference',
  level: 'BEGINNER',
  tags: ['sub-flow', 'flow-ref', 'private-flow', 'reuse', 'error-handling'],
  estMinutes: 15,
  flowChecks: [
    { label: 'Shared logic is extracted into at least one sub-flow', rule: { type: 'flows', kind: 'sub-flow', min: 1 } },
    {
      label: 'Endpoint flows call the shared pieces with Flow References',
      rule: { type: 'exists', component: 'flow-ref', min: 3 },
    },
    { label: 'Every Flow Reference points to an existing flow or sub-flow', rule: { type: 'refs' } },
    {
      label: 'Shared init sets a correlation ID variable before logging',
      rule: { type: 'before', first: 'set-variable', then: 'logger' },
    },
    {
      label: 'The tenant config lookup is cached (Cache scope around the Database Select)',
      rule: { type: 'inside', component: 'db-select', within: 'cache' },
    },
    {
      label: 'Audit failures are logged and ignored with On Error Continue',
      rule: { type: 'handler', component: 'on-error-continue' },
    },
  ],
  referenceFlow: design(
    flow('get-orders', source('http-listener', { path: '/api/orders', allowedMethods: 'GET' }), [
      step('flow-ref', { name: 'common-request-init' }),
      step('flow-ref', { name: 'get-tenant-config' }),
      step('flow-ref', { name: 'audit-call' }),
      step('db-select', { sql: 'SELECT * FROM orders WHERE tenant_id = :tenantId' }),
    ]),
    flow('get-invoices', source('http-listener', { path: '/api/invoices', allowedMethods: 'GET' }), [
      step('flow-ref', { name: 'common-request-init' }),
      step('flow-ref', { name: 'get-tenant-config' }),
      step('flow-ref', { name: 'audit-call' }),
      step('db-select', { sql: 'SELECT * FROM invoices WHERE tenant_id = :tenantId' }),
    ]),
    flow('get-customers', source('http-listener', { path: '/api/customers', allowedMethods: 'GET' }), [
      step('flow-ref', { name: 'common-request-init' }),
      step('flow-ref', { name: 'get-tenant-config' }),
      step('flow-ref', { name: 'audit-call' }),
      step('db-select', { sql: 'SELECT * FROM customers WHERE tenant_id = :tenantId' }),
    ]),
    subFlow('common-request-init', [
      step('set-variable', { variableName: 'correlationId', value: '#[attributes.headers."x-correlation-id" default correlationId]' }),
      step('logger', {
        level: 'INFO',
        message: '#[write({ event: "request received", path: attributes.requestPath, correlationId: vars.correlationId }, "application/json")]',
      }),
    ]),
    subFlow('get-tenant-config', [
      step('set-variable', { variableName: 'businessPayload', value: '#[payload]' }),
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
A team has three APIs (Orders, Invoices, Customers) in one Mule app. Every endpoint copies the same 15 processors:

- Set a \`correlationId\` and log a structured "request received" entry.
- Look up the caller's tenant config from a database (cached).
- Call a central **Audit API** — if the audit call fails it must be **logged and ignored**, never fail the business request.

A code review asks you to refactor this into reusable pieces.

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
1. **Logging/correlation → sub-flow** \`common-request-init\`: Set Variable \`correlationId\` (\`#[correlationId]\` or an incoming header), Logger with a JSON message. No error handling needed — if it fails, the caller should know.
2. **Tenant lookup → sub-flow** \`get-tenant-config\`: Cache scope wrapping a Database Select, with a key expression on the tenant ID (the default key is a SHA-256 of the payload); output stored with Flow Reference \`target="tenant"\` so the business payload is untouched.
3. **Audit call → private flow** \`audit-call\`: HTTP Request to the Audit API inside a flow with its **own error handler** — On Error Continue for the HTTP error types that logs a warning. Because the error is handled inside that flow, the caller continues normally.
   - Alternative: keep it a sub-flow but wrap the Flow Reference in a **Try scope** with On Error Continue. Either works; the private flow keeps the policy in one place.
4. **Calling:** each API endpoint flow (e.g. \`get:\\orders:orders-api-config\`) starts with \`<flow-ref name="common-request-init"/>\`. Variables set inside the sub-flow/private flow are visible to the caller afterwards (same event).
5. **Sharing across apps:** package common flows/configs as a **Mule plugin or shared library** in Exchange and import them via the POM. Or use a **domain project** for shared connector configs on on-prem runtimes. For truly cross-cutting concerns (logging headers, auth) consider **API Manager policies** instead of code.
`,
  followUps: [
    { q: 'Can a sub-flow have an error handler?', a: 'No. A sub-flow has no source and no error handler; use a Try scope inside it, or make it a private flow if it needs its own handling.' },
    { q: 'Why not use a VM queue to call the shared logic?', a: 'VM adds a thread hop, serialization and a separate transaction/event context; it is meant for decoupling or async hand-off. For synchronous in-app reuse, Flow Reference is simpler and cheaper.' },
    { q: 'Does a private flow get its own copy of variables?', a: 'No. With Flow Reference the same event flows through, so variables are shared. Only transports like VM or HTTP create a new event without the caller\'s variables.' },
  ],
}

import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'
import { HANDLERS } from '../../flow/rules.js'

const deadLetter = (reason) => [
  step('logger', { level: 'ERROR', message: `#["Invoice " ++ (vars.invoice.invoiceNo default "?") ++ " dead-lettered (${reason}): " ++ error.description]` }),
  step('transform', {
    script:
      '%dw 2.0\noutput application/json\n---\n{ original: vars.invoice, error: { type: error.errorType.namespace ++ ":" ++ error.errorType.identifier, description: error.description }, failedAt: now(), correlationId: correlationId }',
  }),
  step('mq-publish', { destination: 'invoices-dlq' }),
  step('mq-ack', { ackToken: '#[vars.ackToken]' }),
]

export default {
  id: 'fl-031',
  category: 'flows',
  title: 'Custom Error Types and Dead-Lettering Poison Invoices',
  level: 'INTERMEDIATE',
  tags: ['raise-error', 'custom-errors', 'error-mapping', 'dlq', 'anypoint-mq', 'error-handling'],
  estMinutes: 30,
  flowChecks: [
    { label: 'Invoices are consumed from a queue', rule: { type: 'source', component: ['mq-subscriber', 'jms-listener'] } },
    { label: 'The invoice structure is validated first', rule: { type: 'before', first: 'validation', then: 'http-request' } },
    {
      label: 'Business rule violations raise custom APP: error types',
      rule: { type: 'exists', component: 'raise-error', where: { type: 'APP:' } },
    },
    {
      label: 'Error handlers select on the custom APP: error types',
      rule: { type: 'exists', component: ['on-error-continue', 'on-error-propagate'], where: { type: 'APP:' } },
    },
    {
      label: 'A connector error is re-mapped to a business error type (e.g. HTTP:BAD_REQUEST → APP:ERP_REJECTED)',
      rule: { type: 'inside', component: 'raise-error', within: ['on-error-propagate', 'on-error-continue'] },
    },
    {
      label: 'HTTP:BAD_REQUEST is re-raised as ERP_REJECTED in a Try around the ERP call, so the flow handlers see it',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'raise-error', where: { type: 'ERP_REJECTED' }, within: HANDLERS, withinWhere: { type: 'BAD_REQUEST' } },
          { type: 'inside', component: 'raise-error', where: { type: 'ERP_REJECTED' }, within: 'try' },
        ],
      },
    },
    { label: 'The ERP call succeeds before the message is acknowledged', rule: { type: 'before', first: 'http-request', then: 'mq-ack', outside: true } },
    {
      label: 'Permanent failures are published to a dead-letter queue from an error handler',
      rule: { type: 'inside', component: ['mq-publish', 'jms-publish'], within: ['on-error-continue', 'on-error-propagate'] },
    },
    {
      label: 'Business errors (APP:) are dead-lettered and acknowledged, never retried',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: ['mq-publish', 'jms-publish'], within: HANDLERS, withinWhere: { type: 'APP:' } },
          { type: 'inside', component: ['mq-ack', 'jms-ack'], within: HANDLERS, withinWhere: { type: 'APP:' } },
        ],
      },
    },
    {
      label: 'The dead-letter message carries the error type and description',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'transform', where: { script: 'errorType' }, within: HANDLERS },
          { type: 'inside', component: 'transform', where: { script: 'error.description' }, within: HANDLERS },
        ],
      },
    },
    {
      label: 'Transient failures go back to the queue for redelivery',
      rule: {
        type: 'inside',
        component: ['mq-nack', 'jms-recover-session'],
        within: HANDLERS,
        withinWhere: { type: { oneOf: ['CONNECTIVITY', 'TIMEOUT', 'SERVICE_UNAVAILABLE'] } },
      },
    },
    {
      label: 'Transient failures are never dead-lettered',
      rule: {
        type: 'all',
        rules: [
          { type: 'handler', component: HANDLERS, errorType: 'HTTP:CONNECTIVITY' },
          {
            type: 'absent',
            component: ['mq-publish', 'jms-publish'],
            within: HANDLERS,
            withinWhere: { type: { oneOf: ['CONNECTIVITY', 'TIMEOUT', 'SERVICE_UNAVAILABLE'] } },
          },
        ],
      },
    },
  ],
  referenceFlow: design(
    flow(
      'process-supplier-invoices',
      source('mq-subscriber', { destination: 'supplier-invoices', acknowledgementMode: 'MANUAL' }),
      [
        step('set-variable', { variableName: 'ackToken', value: '#[attributes.ackToken]' }),
        step('set-variable', { variableName: 'invoice', value: '#[payload]' }),
        step('validation', { check: 'json-schema', expression: 'schemas/invoice.json', message: 'Invoice does not match schema' }),
        step('db-select', { sql: 'SELECT supplier_id, erp_vendor_no, status FROM suppliers WHERE vat_id = :vatId' }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[isEmpty(payload)]' }, [
              step('raise-error', { type: 'APP:UNKNOWN_SUPPLIER', description: 'No supplier for the VAT id on the invoice' }),
            ]),
            route({ expression: '#[payload[0].STATUS == "BLOCKED"]' }, [
              step('raise-error', { type: 'APP:SUPPLIER_BLOCKED', description: 'Supplier is blocked for payment' }),
            ]),
          ],
          { otherwise: [step('set-variable', { variableName: 'vendorNo', value: '#[payload[0].ERP_VENDOR_NO]' })] },
        ),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{ vendor: vars.vendorNo, documentNo: vars.invoice.invoiceNo, amount: vars.invoice.total, currency: vars.invoice.currency }',
        }),
        scope('try', {}, [step('http-request', { method: 'POST', path: '/erp/ap-invoices', responseTimeout: 10000 })], {
          errorHandlers: [
            handler('on-error-propagate', { type: 'HTTP:BAD_REQUEST' }, [
              step('raise-error', { type: 'APP:ERP_REJECTED', description: '#["ERP rejected invoice: " ++ error.description]' }),
            ]),
            // 422 has no HTTP:* error type of its own (no HTTP:UNPROCESSABLE_ENTITY): match the response status code.
            handler('on-error-propagate', { type: 'ANY', when: '#[error.errorMessage.attributes.statusCode == 422]' }, [
              step('raise-error', { type: 'APP:ERP_REJECTED', description: '#["ERP rejected invoice: " ++ error.description]' }),
            ]),
          ],
        }),
        step('mq-ack', { ackToken: '#[vars.ackToken]' }),
      ],
      [
        handler('on-error-continue', { type: 'JSON:SCHEMA_NOT_HONOURED, APP:UNKNOWN_SUPPLIER, APP:SUPPLIER_BLOCKED, APP:ERP_REJECTED' }, deadLetter('permanent')),
        handler('on-error-continue', { type: 'HTTP:CONNECTIVITY, HTTP:TIMEOUT, HTTP:SERVICE_UNAVAILABLE' }, [
          step('logger', { level: 'WARN', message: '#["ERP unavailable, invoice returned to queue: " ++ error.description]' }),
          step('mq-nack', { ackToken: '#[vars.ackToken]' }),
        ]),
        handler('on-error-continue', { type: 'ANY' }, deadLetter('unexpected')),
      ],
    ),
  ),
  description: `
Suppliers send invoices as JSON to the Anypoint MQ queue \`supplier-invoices\` (~20,000 per day). Each invoice must be posted to the **ERP accounts-payable API**.

Failures fall into different classes, and Finance wants each class treated differently:

| Failure | Example | Expected behaviour |
|---|---|---|
| Malformed invoice | missing \`total\` | dead-letter, never retry |
| Unknown or blocked supplier | VAT id not in \`suppliers\` table, status BLOCKED | dead-letter with a clear business reason |
| ERP rejects the document | HTTP 400 / 422 | dead-letter as \`ERP_REJECTED\` |
| ERP unavailable | timeout, 503, connection refused | retry later, never lose the invoice |

The DLQ messages must contain the original invoice, an error **type** and a description, so a support person can fix and replay them.

**Design the flow(s):**
- How do you model these classes as Mule error types?
- How do you turn a generic \`HTTP:BAD_REQUEST\` into a business error?
- Which error handlers do you need, in which order, and what does each do with the message?
- What goes into the DLQ message?
`,
  answerTemplate: `## Error type catalogue

## Raising business errors

## Mapping connector errors

## Error handlers and acknowledgement

## DLQ message format
`,
  keyPoints: [
    'Business failures are raised with Raise Error using a custom namespace (APP:UNKNOWN_SUPPLIER, APP:SUPPLIER_BLOCKED), which makes them selectable in error handlers.',
    'Connector errors are translated to business errors either with error mappings on the operation (HTTP:BAD_REQUEST → APP:ERP_REJECTED) or with a Try whose handler raises the new type.',
    'Error handlers are evaluated top-down: specific permanent types first, transient types (HTTP:CONNECTIVITY, HTTP:TIMEOUT) next, ANY last.',
    'Permanent errors: publish original payload + errorType + description + correlationId to the DLQ and ACK; transient errors: NACK so the broker redelivers.',
    'Manual acknowledgement ensures a message is only removed from the queue after it has been posted or safely dead-lettered.',
  ],
  solution: `
**Flow \`process-supplier-invoices\`**: MQ Subscriber \`supplier-invoices\`, acknowledgement **MANUAL**.

1. Save \`ackToken\` and the original \`invoice\` in variables.
2. **Validate json-schema** (JSON module \`json:validate-schema\`) → raises \`JSON:SCHEMA_NOT_HONOURED\`.
3. **Database Select** supplier by VAT id → **Choice**:
   - empty → **Raise Error \`APP:UNKNOWN_SUPPLIER\`**
   - status BLOCKED → **Raise Error \`APP:SUPPLIER_BLOCKED\`**
4. Transform to the ERP format. **HTTP Request** \`POST /erp/ap-invoices\` inside a **Try**: On Error Propagate for \`HTTP:BAD_REQUEST\` raises **\`APP:ERP_REJECTED\`**. A 422 has no dedicated error type (the HTTP connector has no \`HTTP:UNPROCESSABLE_ENTITY\`), so a second On Error Propagate matches it with \`when="#[error.errorMessage.attributes.statusCode == 422]"\` and raises the same type.
   *Shorter alternative for the 400:* an **error mapping** on the HTTP Request operation itself (\`<error-mapping sourceType="HTTP:BAD_REQUEST" targetType="APP:ERP_REJECTED"/>\`). The canvas cannot show error mappings, so the Try version is drawn here.
5. **MQ Ack** on success.

**Flow error handler** (order matters):
1. **On Error Continue** \`JSON:SCHEMA_NOT_HONOURED, APP:UNKNOWN_SUPPLIER, APP:SUPPLIER_BLOCKED, APP:ERP_REJECTED\` → build \`{ original, error: { type, description }, failedAt, correlationId }\` → **MQ Publish \`invoices-dlq\`** → **Ack**.
2. **On Error Continue** \`HTTP:CONNECTIVITY, HTTP:TIMEOUT, HTTP:SERVICE_UNAVAILABLE\` → **Nack**: the broker redelivers. The queue's own max-deliveries + DLQ is the safety net for long outages.
3. **On Error Continue** \`ANY\` → dead-letter as "unexpected", so a bug never creates an endless redelivery loop.
`,
  followUps: [
    {
      q: 'Raise Error vs error mapping: when do you use which?',
      a: 'Raise Error creates an error from your own logic (a business rule). Error mapping renames an error that a connector operation already raised. Both result in a custom type that handlers can select.',
    },
    {
      q: 'Why On Error Continue and not Propagate in the flow handler?',
      a: 'With manual ack the handler itself decides the message fate (ack after DLQ publish, nack for retry). Continue ends the flow cleanly. The docs do not define what a propagated error does to the message in MANUAL mode; they only say that a message with no ack or nack returns to the queue when the acknowledgement timeout expires, so do not rely on Propagate to settle it.',
    },
    {
      q: 'How would someone replay a fixed DLQ message?',
      a: 'A small replay flow (or a scheduled job) consumes invoices-dlq, extracts original (possibly edited), and publishes it back to supplier-invoices. Keep the correlationId so the trace links both attempts.',
    },
  ],
}

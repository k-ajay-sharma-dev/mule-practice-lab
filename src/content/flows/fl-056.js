import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'
import { HANDLERS, handlerStatus } from '../../flow/rules.js'

export default {
  id: 'fl-056',
  category: 'flows',
  title: 'Order-to-Cash Application Network: Web, Partner, ERP, CRM and Payments',
  level: 'EXPERT',
  tags: ['api-led', 'application-network', 'event-driven', 'compensation', 'architecture'],
  estMinutes: 85,
  flowChecks: [
    { label: 'The network has at least seven APIs, each drawn as its own flow', rule: { type: 'flows', kind: 'flow', min: 7 } },
    {
      label: 'Web and partner each have their own Experience API (two /exp-... listeners)',
      rule: { type: 'exists', component: 'http-listener', where: { path: 'exp-' }, min: 2 },
    },
    {
      label: 'ERP, CRM and payments are each unlocked by a System API (three /sys-... listeners)',
      rule: { type: 'exists', component: 'http-listener', where: { path: 'sys-' }, min: 3 },
    },
    {
      label: 'Both Experience APIs reuse the same order Process API (HTTP Request to /prc-...)',
      rule: { type: 'exists', component: 'http-request', where: { path: 'prc-' }, min: 2 },
    },
    {
      label: 'Neither channel calls a System API directly',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'http-listener', where: { path: 'exp-' } },
          { type: 'absent', component: 'http-request', where: { path: 'sys-' }, inFlowWith: { component: 'http-listener', where: { path: 'exp-' } } },
        ],
      },
    },
    {
      label: 'An account on credit hold is rejected with 422 after the CRM lookup',
      rule: {
        type: 'all',
        rules: [
          { type: 'before', first: 'http-request', firstWhere: { path: 'sys-crm' }, then: 'raise-error', thenWhere: { type: 'APP:' } },
          handlerStatus('APP:', '422'),
        ],
      },
    },
    {
      label: 'The card is authorised before the ERP sales order is created',
      rule: { type: 'before', first: 'http-request', firstWhere: { path: 'sys-pay' }, then: 'http-request', thenWhere: { path: 'sys-erp' }, outside: true },
    },
    {
      label: 'If the ERP order fails after payment authorisation, the authorisation is voided (Try + On Error Propagate)',
      rule: {
        type: 'all',
        rules: [
          { type: 'handler', component: 'on-error-propagate', within: 'try' },
          { type: 'inside', component: 'http-request', where: { path: 'sys-erp' }, within: 'try' },
          { type: 'inside', component: 'http-request', where: { path: 'sys-pay' }, within: 'on-error-propagate' },
        ],
      },
    },
    {
      label: 'Duplicate submissions are caught in the order Process API before the order is accepted',
      rule: { type: 'before', first: ['idempotent', 'os-retrieve'], then: 'mq-publish' },
    },
    {
      label: 'An OrderAccepted event is published after the ERP sales order exists',
      rule: { type: 'before', first: 'http-request', firstWhere: { path: 'sys-erp' }, then: 'mq-publish', outside: true },
    },
    {
      label: 'Fulfilment runs asynchronously from an Anypoint MQ subscriber that calls the System APIs',
      rule: { type: 'before', first: 'mq-subscriber', then: 'http-request', thenWhere: { path: 'sys-' } },
    },
    {
      label: 'Failed fulfilment messages are returned to the queue for redelivery / DLQ',
      rule: { type: 'inside', component: 'mq-nack', within: ['on-error-propagate', 'on-error-continue'] },
    },
    {
      label: 'Each caller maps a 422 from the API below back to 422 (both Experience APIs and prc-order)',
      rule: { type: 'inside', component: 'set-variable', where: { value: '422' }, within: HANDLERS, withinWhere: { when: '422' }, min: 3 },
    },
    { label: 'The ERP System API maps a SOAP fault to 422', rule: handlerStatus('SOAP_FAULT', '422') },
    {
      label: 'Each System API maps its system\'s connectivity errors to 503',
      rule: { type: 'inside', component: 'set-variable', where: { value: '503' }, within: HANDLERS, withinWhere: { type: 'CONNECTIVITY' }, min: 3 },
    },
    {
      label: 'A duplicate submission is answered with 409',
      rule: { type: 'any', rules: [handlerStatus('DUPLICATE_MESSAGE', '409'), { type: 'exists', component: 'os-retrieve' }] },
    },
    {
      label: 'The ERP System API reaches the SOAP call through APIkit or straight from its listener',
      rule: {
        type: 'any',
        rules: [
          { type: 'exists', component: 'apikit-router' },
          { type: 'before', first: 'http-listener', firstWhere: { path: 'sys-erp' }, then: 'wsc-consume' },
        ],
      },
    },
    {
      label: 'Fulfilment is idempotent on the event ID, so a redelivered event is not fulfilled twice',
      rule: {
        type: 'any',
        rules: [
          { type: 'exists', component: 'idempotent', where: { idExpression: 'eventId' } },
          { type: 'exists', component: 'os-store', where: { key: 'eventId' } },
        ],
      },
    },
    {
      label: 'The fulfilment message is acked after success and when it is a duplicate',
      rule: { type: 'exists', component: 'mq-ack', min: 2 },
    },
    {
      label: 'A failed event ID is removed from the idempotency store, so its redelivery is processed',
      rule: { type: 'inside', component: 'os-remove', within: HANDLERS },
    },
  ],
  optionalSteps: [
    {
      type: 'on-error-propagate',
      flow: 'exp-web-orders',
      why: 'The 422 handler is checked on its own. The 400, 504 and catch-all 503 mappings are good practice, but Mule still fails the request without them.',
    },
    {
      type: 'on-error-propagate',
      flow: 'exp-partner-orders',
      why: 'The 422 handler is checked on its own. The catch-all 503 is good practice, but Mule still fails the request without it.',
    },
    {
      type: 'on-error-propagate',
      flow: 'prc-order',
      why: 'The credit hold, 422 and duplicate mappings are checked on their own. The catch-all 503 is good practice, but Mule still fails the request without it.',
    },
    {
      type: 'on-error-propagate',
      flow: 'sys-payment',
      why: 'Connectivity errors are checked on their own. Mapping other PSP errors to 502 is a nicety, since Mule still fails the call without it.',
    },
    {
      type: 'on-error-continue',
      flow: 'prc-fulfilment',
      why: 'The duplicate handler is covered by the ack check. The handler around the remove only stops a missing ID from failing the cleanup.',
    },
  ],
  referenceFlow: design(
    // ---------------- Experience layer ----------------
    flow(
      'exp-web-orders',
      source('http-listener', { path: '/exp-web/v1/orders', allowedMethods: 'POST' }),
      [
        step('validation', { check: 'json-schema', expression: '#[payload]', message: 'Invalid web order' }),
        step('http-request', { method: 'POST', path: '/prc-order/v1/orders', responseTimeout: 9000 }),
        step('transform', {
          script: '%dw 2.0\noutput application/json\n---\n{ orderNumber: payload.orderId, status: payload.status, estimatedShipDate: payload.promiseDate default null }',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'JSON:SCHEMA_NOT_HONOURED' }, [step('set-variable', { variableName: 'httpStatus', value: '400' })]),
        // 422 has no HTTP:* error type of its own: match on the failed response's status code.
        handler('on-error-propagate', { type: 'ANY', when: '#[error.errorMessage.attributes.statusCode == 422]' }, [step('set-variable', { variableName: 'httpStatus', value: '422' })]),
        handler('on-error-propagate', { type: 'HTTP:TIMEOUT' }, [step('set-variable', { variableName: 'httpStatus', value: '504' })]),
        handler('on-error-propagate', { type: 'ANY' }, [step('set-variable', { variableName: 'httpStatus', value: '503' })]),
      ],
    ),
    flow(
      'exp-partner-orders',
      source('http-listener', { path: '/exp-partner/v1/purchase-orders', allowedMethods: 'POST' }),
      [
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{\n  externalRef: payload.PurchaseOrder.@number,\n  customerId: payload.PurchaseOrder.BuyerId,\n  channel: "PARTNER",\n  payment: { method: "INVOICE" },\n  lines: payload.PurchaseOrder.*Line map { sku: $.Sku, quantity: $.Qty as Number }\n}',
        }),
        step('http-request', { method: 'POST', path: '/prc-order/v1/orders', responseTimeout: 9000 }),
        step('transform', {
          script: '%dw 2.0\noutput application/xml\n---\nOrderAck @(number: payload.orderId): { Status: payload.status }',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'ANY', when: '#[error.errorMessage.attributes.statusCode == 422]' }, [step('set-variable', { variableName: 'httpStatus', value: '422' })]),
        handler('on-error-propagate', { type: 'ANY' }, [step('set-variable', { variableName: 'httpStatus', value: '503' })]),
      ],
    ),
    // ---------------- Process layer ----------------
    flow(
      'prc-order',
      source('http-listener', { path: '/prc-order/v1/orders', allowedMethods: 'POST' }),
      [
        step('idempotent', { idExpression: '#[attributes.headers."idempotency-key"]', objectStore: 'order-idempotency' }),
        step('set-variable', { variableName: 'order', value: '#[payload]' }),
        step('http-request', { method: 'GET', path: '/sys-crm/v1/accounts/{customerId}', responseTimeout: 1500 }),
        router(
          'choice',
          {},
          [route({ expression: '#[payload.creditStatus == "BLOCKED"]' }, [step('raise-error', { type: 'APP:CREDIT_HOLD', description: 'Account is on credit hold' })])],
        ),
        router(
          'choice',
          {},
          [
            route({ expression: '#[vars.order.payment.method == "CARD"]' }, [
              step('http-request', { method: 'POST', path: '/sys-payment/v1/authorisations', responseTimeout: 3000 }),
              step('set-variable', { variableName: 'authorisationId', value: '#[payload.id]' }),
            ]),
          ],
        ),
        scope('try', {}, [step('http-request', { method: 'POST', path: '/sys-erp/v1/sales-orders', responseTimeout: 3000 })], {
          errorHandlers: [
            handler('on-error-propagate', { type: 'ANY' }, [
              router(
                'choice',
                {},
                [
                  route({ expression: '#[vars.authorisationId != null]' }, [
                    step('http-request', { method: 'POST', path: '/sys-payment/v1/authorisations/{authorisationId}/void', responseTimeout: 3000 }),
                  ]),
                ],
              ),
            ]),
          ],
        }),
        step('set-variable', { variableName: 'salesOrder', value: '#[payload]' }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{\n  eventId: uuid(),\n  eventType: "OrderAccepted",\n  occurredAt: now(),\n  correlationId: correlationId,\n  data: {\n    orderId: vars.salesOrder.orderId,\n    customerId: vars.order.customerId,\n    authorisationId: vars.authorisationId default null,\n    lines: vars.order.lines\n  }\n}',
        }),
        step('mq-publish', { destination: 'order-events-exchange' }),
        step('transform', {
          script: '%dw 2.0\noutput application/json\n---\n{ orderId: vars.salesOrder.orderId, status: "ACCEPTED", promiseDate: vars.salesOrder.promiseDate }',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'APP:CREDIT_HOLD' }, [step('set-variable', { variableName: 'httpStatus', value: '422' })]),
        // A 422 from sys-erp (SOAP fault) fails the HTTP Request; there is no HTTP:UNPROCESSABLE_ENTITY, so match the status code.
        handler('on-error-propagate', { type: 'ANY', when: '#[error.errorMessage.attributes.statusCode == 422]' }, [step('set-variable', { variableName: 'httpStatus', value: '422' })]),
        handler('on-error-propagate', { type: 'MULE:DUPLICATE_MESSAGE' }, [step('set-variable', { variableName: 'httpStatus', value: '409' })]),
        handler('on-error-propagate', { type: 'ANY' }, [step('set-variable', { variableName: 'httpStatus', value: '503' })]),
      ],
    ),
    flow(
      'prc-fulfilment',
      source('mq-subscriber', { destination: 'fulfilment-queue', acknowledgementMode: 'MANUAL' }),
      [
        // Each HTTP Request replaces payload and attributes, so keep the ack token and the event in variables.
        step('set-variable', { variableName: 'ackToken', value: '#[attributes.ackToken]' }),
        step('set-variable', { variableName: 'event', value: '#[payload]' }),
        step('idempotent', { idExpression: '#[vars.event.eventId]', objectStore: 'fulfilment-processed' }),
        step('http-request', { method: 'POST', path: '/sys-erp/v1/deliveries', responseTimeout: 5000 }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[vars.event.data.authorisationId != null]' }, [
              step('http-request', { method: 'POST', path: '/sys-payment/v1/captures', responseTimeout: 5000 }),
            ]),
          ],
        ),
        step('http-request', { method: 'PATCH', path: '/sys-crm/v1/orders/{orderId}/status', responseTimeout: 3000 }),
        step('mq-ack', { ackToken: '#[vars.ackToken]' }),
      ],
      [
        handler('on-error-continue', { type: 'MULE:DUPLICATE_MESSAGE' }, [step('mq-ack', { ackToken: '#[vars.ackToken]' })]),
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Fulfilment failed for " ++ (vars.event.data.orderId default "?") ++ ": " ++ error.description]' }),
          // The docs do not say the validator releases the ID on failure; without this the redelivery could be acked as a duplicate and lost.
          scope('try', {}, [step('os-remove', { key: '#[vars.event.eventId]', objectStore: 'fulfilment-processed' })], {
            errorHandlers: [handler('on-error-continue', { type: 'OS:KEY_NOT_FOUND' }, [])],
          }),
          step('mq-nack', { ackToken: '#[vars.ackToken]' }),
        ]),
      ],
    ),
    // ---------------- System layer ----------------
    flow(
      'sys-erp',
      source('http-listener', { path: '/sys-erp/v1/*', allowedMethods: 'POST' }),
      [
        step('apikit-router', { config: 'sys-erp-config', api: 'sys-erp.raml' }),
      ],
      [
        handler('on-error-propagate', { type: 'WSC:CONNECTIVITY, WSC:TIMEOUT' }, [step('set-variable', { variableName: 'httpStatus', value: '503' })]),
        handler('on-error-propagate', { type: 'WSC:SOAP_FAULT' }, [step('set-variable', { variableName: 'httpStatus', value: '422' })]),
      ],
    ),
    flow('post:\\sales-orders:sys-erp-config', null, [
      step('wsc-consume', { operation: 'CreateSalesOrder' }),
      step('transform', {
        script:
          '%dw 2.0\noutput application/json\nns e http://erp.example.com/sd\n---\n{\n  orderId: payload.body.e#CreateSalesOrderResponse.e#SalesDocument,\n  promiseDate: payload.body.e#CreateSalesOrderResponse.e#ConfirmedDate\n}',
      }),
    ]),
    flow(
      'sys-crm',
      source('http-listener', { path: '/sys-crm/v1/accounts/{customerId}', allowedMethods: 'GET' }),
      [
        step('sf-query', { soql: "SELECT Id, Name, Credit_Status__c FROM Account WHERE Id = ':customerId'" }),
        step('transform', {
          script: '%dw 2.0\noutput application/json\n---\n{ id: payload[0].Id, name: payload[0].Name, creditStatus: payload[0].Credit_Status__c }',
        }),
      ],
      [handler('on-error-propagate', { type: 'SALESFORCE:CONNECTIVITY' }, [step('set-variable', { variableName: 'httpStatus', value: '503' })])],
    ),
    flow(
      'sys-payment',
      source('http-listener', { path: '/sys-payment/v1/*', allowedMethods: 'POST' }),
      [
        step('http-request', { method: 'POST', path: '/psp/v2/{operation}', responseTimeout: 2500 }),
        step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ id: payload.reference, status: upper(payload.result) }' }),
      ],
      [
        handler('on-error-propagate', { type: 'HTTP:CONNECTIVITY, HTTP:TIMEOUT' }, [step('set-variable', { variableName: 'httpStatus', value: '503' })]),
        handler('on-error-propagate', { type: 'ANY' }, [step('set-variable', { variableName: 'httpStatus', value: '502' })]),
      ],
    ),
  ),
  description: `
A manufacturer is rebuilding **order-to-cash** as an application network. Two channels place orders:

- **Web shop** — B2C, card payments, JSON, ~30 orders/s on sale days, wants an answer in < 10 s.
- **Partners** (distributors) — B2B purchase orders in **XML**, paid on invoice, ~2 orders/s, often resubmit the same PO after timeouts.

Systems of record:
- **ERP** (SOAP) — sales orders, deliveries, invoices. Slow (p95 2 s) and nightly maintenance.
- **CRM** (Salesforce) — accounts, **credit status**, order status for the service desk.
- **Payment service provider** — card authorisation (at order time) and capture (at shipment).

Business rules:
1. Reject orders for accounts on **credit hold** (422).
2. Card orders: authorise before creating the ERP sales order. If the ERP order cannot be created, the **authorisation must be voided** — no money reserved without an order.
3. The caller gets an answer once the sales order exists. **Fulfilment** (ERP delivery, payment capture, CRM status update) happens **asynchronously** and must survive ERP downtime — failures are retried and end up in a DLQ, never lost.
4. Duplicate submissions (same idempotency key) must not create two orders; answer them with 409.
5. Neither channel may call a system (or a System API) directly.

**Facts**
- \`sys-crm\` returns the account's \`creditStatus\`; an account on credit hold has \`creditStatus\` \`BLOCKED\`.
- The custom error type for a credit hold is \`APP:CREDIT_HOLD\`.
- A 422 from a lower API has no error type of its own: the caller's handler tests the response status code in its **When** field and passes the 422 on.
- The Idempotent Message Validator does not release an ID when the flow fails.

**Convention for API-led problems:** one canvas holds the whole application network. Draw each API as a separate flow whose name starts with its layer prefix (\`exp-\`, \`prc-\`, \`sys-\`), give it an HTTP Listener whose path shows the API (e.g. \`/exp-web/v1/orders\`), and let layers call each other with HTTP Request pointing at the lower API's path. Asynchronous process flows use \`prc-\` too, with an MQ source.

**Design the flow(s):** the whole network — \`exp-web\`, \`exp-partner\`, \`prc-order\`, \`prc-fulfilment\`, \`sys-erp\`, \`sys-crm\`, \`sys-payment\` — with the call graph, the sync/async boundary, compensation, idempotency and error handling.
`,
  answerTemplate: `## Application network (APIs per layer)

## Synchronous order path

## Compensation

## Async fulfilment

## Idempotency and duplicates

## Error handling per layer

## Governance (contracts, policies, ownership)
`,
  keyPoints: [
    'Two Experience APIs (web JSON, partner XML) map their channel formats to one canonical order and reuse the same prc-order — channels never see systems.',
    'prc-order owns the synchronous business rules: credit check via sys-crm, card authorisation via sys-payment, sales order via sys-erp — then publishes OrderAccepted and answers.',
    'Compensation instead of distributed transactions: the ERP call sits in a Try whose On Error Propagate voids the authorisation, then the error still propagates (422/503) to the caller.',
    'The sync/async boundary is the event: prc-fulfilment consumes from MQ with manual ack, is idempotent on eventId, and nacks on failure so MQ redelivers and finally dead-letters.',
    'Idempotency at the Process API (idempotency key) protects against partner resubmits regardless of channel.',
    'Each System API maps its system\'s errors (WSC faults, Salesforce, PSP) to HTTP statuses; each upper layer translates them again into its own contract.',
  ],
  solution: `
\`\`\`
      Web shop (JSON)                          Partners (XML PO)
            |                                         |
  +--------------------+                  +-----------------------+
  | exp-web            |                  | exp-partner           |        EXPERIENCE
  | schema 400,422,504 |                  | XML <-> canonical     |
  +--------------------+                  +-----------------------+
             \\      POST /prc-order/v1/orders        /
              v                                     v
  +---------------------------------------------------------------+
  | prc-order                                            PROCESS  |
  |  idempotency key -> sys-crm credit check -> (card) authorise  |
  |  Try[ sys-erp sales order ]  on error: void authorisation     |
  |  publish OrderAccepted -> order-events-exchange  -> 201/202   |
  +---------------------------------------------------------------+
        |            |              |                 :
        |            |              |                 : fulfilment-queue (+ DLQ)
        |            |              |                 v
        |            |              |   +------------------------------+
        |            |              |   | prc-fulfilment   (MQ, MANUAL)|  PROCESS (async)
        |            |              |   | ERP delivery -> capture ->   |
        |            |              |   | CRM status -> ack | nack     |
        |            |              |   +------------------------------+
        v            v              v        |        |        |
  +-----------+ +-----------+ +-------------+|        |        |
  | sys-crm   | | sys-erp   | | sys-payment |<--------+--------+         SYSTEM
  | Salesforce| | SOAP ERP  | | PSP REST    |
  +-----------+ +-----------+ +-------------+
\`\`\`

**Experience:** \`exp-web\` validates JSON and maps errors for the shopper; \`exp-partner\` converts XML POs to the canonical order and returns an XML ack. Both send an \`Idempotency-Key\` (the partner PO number) to \`prc-order\`. Schema errors (\`JSON:SCHEMA_NOT_HONOURED\`) → 400. A 422 from \`prc-order\` has no dedicated HTTP error type, so the handler matches it with \`when="#[error.errorMessage.attributes.statusCode == 422]"\` (or add 422 to the request's success-status-code-validator and branch on \`attributes.statusCode\`).

**prc-order (sync):**
1. Idempotent Message Validator on the key → duplicate → 409 (or return the stored result). The docs do not say the key is released when the flow fails, so remove it on failure if a caller must be able to retry a failed order.
2. \`sys-crm\` credit status → \`BLOCKED\` → \`APP:CREDIT_HOLD\` → 422.
3. Card orders → \`sys-payment\` authorise, keep \`vars.authorisationId\`.
4. **Try** around \`sys-erp\` sales-order creation; its **On Error Propagate** calls \`sys-payment .../void\` when an authorisation exists, then the error continues up (503/422).
5. Build and publish **OrderAccepted** to \`order-events-exchange\`; reply with order id and promise date.

**prc-fulfilment (async):** MQ Subscriber on \`fulfilment-queue\` (bound to the exchange) with **MANUAL** ack → save the ack token and event in variables (each HTTP Request replaces payload and attributes) → idempotent on \`eventId\` → \`sys-erp\` delivery → \`sys-payment\` capture (card only) → \`sys-crm\` status → **ack**. Any failure → remove the \`eventId\` from the validator's store (otherwise the redelivery could be acked as a duplicate and lost) → **nack** → redelivery; after the max delivery count MQ moves it to the DLQ for operations. ERP downtime delays fulfilment, but nack sets no wait of its own, so a long outage can reach the DLQ: size the delivery count for that and plan a DLQ replay.

**System:** \`sys-erp\` (APIkit + WSC; faults → 422, connectivity → 503), \`sys-crm\` (Salesforce), \`sys-payment\` (PSP; connectivity → 503, other → 502).

**Rule 5 (no direct calls)** is a governance rule: System APIs are deployed behind a private network / internal load balancer and protected with client-id enforcement where only process-layer client apps get contracts.
`,
  followUps: [
    {
      q: 'The void call itself fails after the ERP error. What now?',
      a: 'Never lose it: publish a VoidAuthorisation command to a queue (or park it in an outbox) for an async retry, alert operations, and rely on the PSP auto-expiring uncaptured authorisations as the last safety net.',
    },
    {
      q: 'Why is capture in fulfilment and not in prc-order?',
      a: 'Card schemes and consumer law generally require capturing when goods ship. Fulfilment knows when that happens; keeping capture there also keeps the synchronous path short.',
    },
    {
      q: 'How would you add a "cancel order" capability?',
      a: 'A new resource on prc-order (and the Experience APIs that need it) orchestrating ERP cancellation, void/refund in sys-payment and an OrderCancelled event; fulfilment must check order status (or consume the cancel event) before shipping.',
    },
    {
      q: 'How do you prove in the platform that experience never calls system directly?',
      a: 'Through API Manager contracts: System APIs only grant client-id contracts to process-layer applications, and networking (private VPC/DLB, ingress rules) only exposes Experience APIs publicly. Exchange dependencies and Anypoint Visualizer show the actual call graph for audits.',
    },
  ],
}

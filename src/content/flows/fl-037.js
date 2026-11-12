import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'
import { handlerStatus } from '../../flow/rules.js'

export default {
  id: 'fl-037',
  category: 'flows',
  title: 'API-led Connectivity: Experience, Process and System Layers',
  level: 'BEGINNER',
  tags: ['api-led', 'architecture', 'system-api', 'process-api', 'experience-api'],
  estMinutes: 25,
  flowChecks: [
    { label: 'There is at least one flow per API layer (three or more flows)', rule: { type: 'flows', kind: 'flow', min: 3 } },
    { label: 'Every layer exposes its own HTTP Listener (separately deployable APIs)', rule: { type: 'exists', component: 'http-listener', min: 3 } },
    {
      label: 'Layers call each other over HTTP Request, not Flow Reference',
      rule: { type: 'exists', component: 'http-request', min: 2 },
    },
    {
      label: 'Only the ERP System API speaks SOAP; no other API calls the ERP directly',
      rule: {
        type: 'all',
        rules: [
          { type: 'source', component: 'http-listener' },
          { type: 'exists', component: 'wsc-consume' },
          { type: 'absent', component: 'wsc-consume', inFlowWith: { component: 'http-request' } },
        ],
      },
    },
    {
      label: 'Every call down the stack times out within the 3 s mobile budget',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'http-request', where: { responseTimeout: { gte: 1, lte: 3000 } } },
          { type: 'absent', component: 'http-request', where: { responseTimeout: { gte: 3001 } } },
        ],
      },
    },
    {
      label: 'The Process API combines several System APIs',
      rule: { type: 'inside', component: 'http-request', within: ['scatter-gather', 'parallel-foreach'] },
    },
    { label: 'Each layer maps to its own model with DataWeave', rule: { type: 'exists', component: 'transform', min: 3 } },
    { label: 'Errors are mapped to HTTP status codes in an error handler', rule: { type: 'handler', component: 'on-error-propagate' } },
    { label: 'An unknown order (HTTP:NOT_FOUND) reaches the mobile app as 404', rule: handlerStatus('NOT_FOUND', '404') },
    { label: 'Any other failure reaches the mobile app as 502', rule: handlerStatus('ANY', { oneOf: ['502', '503', '504'] }) },
    { label: 'The ERP System API maps a SOAP fault to an HTTP status', rule: handlerStatus('WSC', { oneOf: ['404', '502'] }) },
  ],
  optionalSteps: [
    {
      type: 'on-error-propagate',
      flow: 'prc-order-status',
      why: 'This handler only logs the error and passes it on, which Mule does by default. The status codes are set in the other layers.',
    },
  ],
  referenceFlow: design(
    flow(
      'exp-mobile-order-status',
      source('http-listener', { path: '/mobile/v1/orders/{orderId}', allowedMethods: 'GET' }),
      [
        step('http-request', { method: 'GET', path: '/process/v1/orders/{orderId}/status', responseTimeout: 3000 }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{\n  id: payload.orderId,\n  status: payload.status,\n  eta: payload.shipment.estimatedDelivery default null,\n  track: payload.shipment.trackingUrl default null\n}',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'HTTP:NOT_FOUND' }, [
          step('set-variable', { variableName: 'httpStatus', value: '404' }),
          step('set-payload', { value: '#[output application/json --- { message: "Order not found" }]' }),
        ]),
        handler('on-error-propagate', { type: 'ANY' }, [
          step('set-variable', { variableName: 'httpStatus', value: '502' }),
          step('set-payload', { value: '#[output application/json --- { message: "Order status temporarily unavailable" }]' }),
        ]),
      ],
    ),
    flow(
      'prc-order-status',
      source('http-listener', { path: '/process/v1/orders/{orderId}/status', allowedMethods: 'GET' }),
      [
        step('set-variable', { variableName: 'orderId', value: '#[attributes.uriParams.orderId]' }),
        router('scatter-gather', { timeout: 2500, maxConcurrency: 2 }, [
          route({}, [step('http-request', { method: 'GET', path: '/sys/erp/v1/orders/{orderId}', responseTimeout: 2000 })]),
          route({}, [step('http-request', { method: 'GET', path: '/sys/shipping/v1/shipments?orderId={orderId}', responseTimeout: 2000 })]),
        ]),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\nvar order = payload."0".payload\nvar shipment = payload."1".payload[0]\n---\n{\n  orderId: order.orderId,\n  status: order.status,\n  shipment: shipment default null\n}',
        }),
      ],
      [handler('on-error-propagate', { type: 'ANY' }, [step('logger', { level: 'ERROR', message: '#[error.description]' })])],
    ),
    flow(
      'sys-erp-orders',
      source('http-listener', { path: '/sys/erp/v1/orders/{orderId}', allowedMethods: 'GET' }),
      [
        step('wsc-consume', { operation: 'GetSalesOrder' }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\nns ns0 http://erp.example.com/orders\n---\n{\n  orderId: payload.body.ns0#GetSalesOrderResponse.ns0#Order.ns0#Number,\n  status: payload.body.ns0#GetSalesOrderResponse.ns0#Order.ns0#Status\n}',
        }),
      ],
      [handler('on-error-propagate', { type: 'WSC:SOAP_FAULT' }, [step('set-variable', { variableName: 'httpStatus', value: '404' })])],
    ),
    flow(
      'sys-shipping-shipments',
      source('http-listener', { path: '/sys/shipping/v1/shipments', allowedMethods: 'GET' }),
      [
        step('http-request', { method: 'GET', path: '/carrier/api/consignments', responseTimeout: 2000 }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\npayload.consignments map {\n  trackingUrl: $.links.tracking,\n  estimatedDelivery: $.eta\n}',
        }),
      ],
    ),
  ),
  description: `
A retailer wants a **mobile app** screen showing an order's status and delivery ETA. The data lives in two places:

- **ERP** (SAP-like, SOAP web service \`GetSalesOrder\`) — order header and status.
- **Shipping carrier** REST API — consignments, tracking URL and ETA.

Next year a **web portal** and a **call-centre** tool will need the same data in slightly different shapes. The architecture board mandates **API-led connectivity**: each API is deployed and versioned on its own, and no consumer may call the ERP directly.

Volumes: ~20 requests/s at peak; the mobile app expects a response within **3 s**.

**Design the flow(s):** one flow per API (experience, process, system), how they call each other, where each data model lives, and how errors surface to the mobile app.
`,
  answerTemplate: `## Layers and responsibilities

## Experience API

## Process API

## System APIs

## How layers communicate

## Errors and timeouts
`,
  keyPoints: [
    'System APIs (ERP orders, shipping) unlock one back end each and hide its protocol (SOAP, vendor REST) behind a stable REST contract.',
    'The Process API owns the business logic: it calls both System APIs (in parallel) and merges the results into a canonical order-status model.',
    'The Experience API is shaped for one channel (mobile) and only reshapes/trims the Process API response.',
    'Layers are separate applications that talk over HTTP Request, not Flow Reference — that is what makes them reusable and independently deployable.',
    'Timeouts shrink down the stack (3 s experience → 2.5 s process → 2 s system) and errors are translated to meaningful HTTP status codes at each layer.',
  ],
  solution: `
**System layer**
- \`sys-erp-orders\` — HTTP Listener \`GET /sys/erp/v1/orders/{orderId}\` → **Web Service Consumer** \`GetSalesOrder\` → DataWeave maps SOAP XML to a clean JSON order. SOAP faults map to 404/502.
- \`sys-shipping-shipments\` — HTTP Listener \`GET /sys/shipping/v1/shipments?orderId=\` → HTTP Request to the carrier → map to \`{ trackingUrl, estimatedDelivery }\`.

**Process layer**
- \`prc-order-status\` — HTTP Listener \`GET /process/v1/orders/{orderId}/status\` → **Scatter-Gather** (timeout 2.5 s) calling both System APIs through **HTTP Request** → DataWeave merges into the canonical \`OrderStatus\`. Reusable by the portal and call-centre later.

**Experience layer**
- \`exp-mobile-order-status\` — HTTP Listener \`GET /mobile/v1/orders/{orderId}\` → HTTP Request to the Process API → DataWeave trims to what the screen needs (\`id, status, eta, track\`).
- On Error Propagate maps \`HTTP:NOT_FOUND\` → 404 and anything else → 502 with a friendly message.

**Why HTTP between layers?** Each API is its own Mule application with its own RAML/OAS contract in Exchange, its own policies (client ID enforcement, rate limits) and its own scaling. Flow Reference would collapse them into one deployable and defeat reuse.

**Timeout budget:** 3 s at the edge, 2.5 s in the process layer, 2 s per system call. Each layer fails before its caller gives up, so the caller gets a real error instead of a hang.
`,
  followUps: [
    {
      q: 'Is it ever acceptable for an Experience API to call a System API directly?',
      a: 'Yes, when there is no orchestration or business logic to add (a pure pass-through). Adding an empty Process API costs latency and a deployment without adding value; the rule is pragmatic, not absolute.',
    },
    {
      q: 'How does this design reduce the cost of adding the web portal next year?',
      a: 'The portal only needs a new Experience API (or reuses the process API directly); the ERP and carrier integrations and the merging logic are already built and published in Exchange.',
    },
    {
      q: 'What about the extra network hops — is three layers too slow?',
      a: 'Each hop adds a few milliseconds inside the same region; it is usually small compared with back-end latency. Cache stable data at the process layer and call system APIs in parallel to keep within the SLA.',
    },
  ],
}

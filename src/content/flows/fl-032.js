import { design, flow, handler, source, step } from '../../flow/dsl.js'

const jsonLog = (event, extra = '') =>
  `#[write({ event: "${event}", correlationId: correlationId, flow: flow.name${extra} }, "application/json", { indent: false })]`

export default {
  id: 'fl-032',
  category: 'flows',
  title: 'Correlation ID Propagation and Structured Logging',
  level: 'INTERMEDIATE',
  tags: ['correlation-id', 'logging', 'observability', 'tracing', 'anypoint-mq'],
  estMinutes: 25,
  flowChecks: [
    { label: 'Checkout requests arrive through an HTTP Listener', rule: { type: 'source', component: 'http-listener' } },
    {
      label: 'An entry log line with the correlation ID is written before the Payment API call',
      rule: {
        type: 'before',
        first: 'logger',
        firstWhere: { message: 'correlationId' },
        then: 'http-request',
        thenWhere: { path: 'pay' },
        outside: true,
      },
    },
    {
      label: 'Log messages include the correlation ID (entry and exit)',
      rule: { type: 'exists', component: 'logger', where: { message: 'correlationId' }, min: 2 },
    },
    {
      label: 'The notification flow is a separate flow triggered by the order-confirmed queue',
      rule: {
        type: 'any',
        rules: [
          { type: 'source', component: ['mq-subscriber', 'jms-listener'], where: { destination: 'order-confirmed' } },
          { type: 'source', component: 'vm-listener', where: { queueName: 'order-confirmed' } },
        ],
      },
    },
    {
      label: 'The confirmation is published to order-confirmed after the Payment API call',
      rule: {
        type: 'any',
        rules: [
          {
            type: 'before',
            first: 'http-request',
            firstWhere: { path: 'pay' },
            then: ['mq-publish', 'jms-publish'],
            thenWhere: { destination: 'order-confirmed' },
            outside: true,
          },
          {
            type: 'before',
            first: 'http-request',
            firstWhere: { path: 'pay' },
            then: 'vm-publish',
            thenWhere: { queueName: 'order-confirmed' },
            outside: true,
          },
        ],
      },
    },
    {
      label: 'The notification flow logs with the correlation ID too',
      rule: {
        type: 'before',
        first: ['mq-subscriber', 'vm-listener', 'jms-listener'],
        then: 'logger',
        thenWhere: { message: 'correlationId' },
      },
    },
    {
      label: 'The error handler logs the failure with the correlation ID',
      rule: {
        type: 'inside',
        component: 'logger',
        within: ['on-error-propagate', 'on-error-continue'],
        where: { message: 'correlationId' },
      },
    },
    {
      label: 'Error responses return the correlation ID to the caller',
      rule: {
        type: 'any',
        rules: [
          { type: 'inside', component: 'transform', where: { script: 'correlationId' }, within: ['on-error-propagate', 'on-error-continue'] },
          { type: 'inside', component: 'set-payload', where: { value: 'correlationId' }, within: ['on-error-propagate', 'on-error-continue'] },
        ],
      },
    },
  ],
  referenceFlow: design(
    flow(
      'checkout-api',
      source('http-listener', { path: '/api/checkout', allowedMethods: 'POST' }),
      [
        step('set-variable', { variableName: 'startedAt', value: '#[now()]' }),
        step('logger', { level: 'INFO', message: jsonLog('checkout.received', ', cartId: payload.cartId') }),
        step('http-request', { method: 'POST', path: '/process/payments', responseTimeout: 5000 }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{ orderId: payload.orderId, paymentId: payload.paymentId, status: "CONFIRMED", correlationId: correlationId }',
        }),
        step('mq-publish', { destination: 'order-confirmed' }),
        step('logger', {
          level: 'INFO',
          message: jsonLog('checkout.completed', ', orderId: payload.orderId, durationMs: (now() - vars.startedAt) as Number { unit: "milliseconds" }'),
        }),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', {
            level: 'ERROR',
            message: jsonLog('checkout.failed', ', errorType: error.errorType.namespace ++ ":" ++ error.errorType.identifier, error: error.description'),
          }),
          step('set-variable', { variableName: 'httpStatus', value: '#[if (error.errorType.namespace == "HTTP") 502 else 500]' }),
          step('transform', {
            script:
              '%dw 2.0\noutput application/json\n---\n{ code: "CHECKOUT_FAILED", message: "Checkout could not be completed", correlationId: correlationId }',
          }),
        ]),
      ],
    ),
    flow('order-confirmed-consumer', source('mq-subscriber', { destination: 'order-confirmed', acknowledgementMode: 'AUTO' }), [
      step('logger', { level: 'INFO', message: jsonLog('confirmation.received', ', orderId: payload.orderId') }),
      step('http-request', { method: 'POST', path: '/notifications/order-confirmation', responseTimeout: 5000 }),
      step('logger', { level: 'INFO', message: jsonLog('confirmation.sent', ', orderId: payload.orderId') }),
    ]),
  ),
  description: `
Support cannot trace customer complaints across systems. A checkout touches:

1. the **Checkout Experience API** (\`POST /api/checkout\`, called by the web shop with an \`X-Correlation-ID\` header, ~50 req/s),
2. the **Payment Process API** (HTTP, called synchronously),
3. the queue \`order-confirmed\` (Anypoint MQ), consumed by a **notification flow** that calls the Notification API.

All logs go to Splunk. Support wants to type **one ID** and see every log line from every app for that checkout, in the right order, with the duration and the error type when something failed. The customer-facing error response must show the same ID, so a customer can quote it.

**Design the flow(s):**
- Where does the correlation ID come from, and what happens if the caller does not send one?
- How does the ID travel to the Payment API over HTTP and to the consumer over Anypoint MQ?
- What does a structured log line look like, and where do you log?
- How does the ID reach the customer when something fails?
`,
  answerTemplate: `## Source of the correlation ID

## Propagation over HTTP

## Propagation over the queue

## Structured log format

## Errors and responses
`,
  keyPoints: [
    'The HTTP Listener uses the incoming X-Correlation-ID header as the Mule event correlationId and generates a UUID if it is missing.',
    'HTTP Request propagates it via sendCorrelationId (AUTO/ALWAYS) as X-Correlation-ID; over Anypoint MQ, carry it in the message itself so the consumer can log it, and confirm what your connector version propagates automatically.',
    'Log lines are single-line JSON with fixed fields (event, correlationId, flow, business keys, durationMs, errorType), written at entry, exit and in error handlers, not at every step.',
    'Error handlers log errorType and description with the correlationId and return the correlationId in the error body.',
    'Use a shared logging sub-flow / custom JSON logger or a log4j2 JSON layout so every API logs the same field names.',
  ],
  solution: `
**Flow \`checkout-api\`**
1. **HTTP Listener** \`POST /api/checkout\`. Mule takes \`X-Correlation-ID\` as \`correlationId\`. If it is missing, Mule generates one (customise this with \`correlationIdGeneratorExpression\` on the \`<configuration>\` element).
2. **Logger** INFO \`{ event: "checkout.received", correlationId, flow, cartId }\`, written as one-line JSON.
3. **HTTP Request** to the Payment API with \`sendCorrelationId="ALWAYS"\` (or an explicit \`X-Correlation-ID\` header), so the Process API logs with the same ID.
4. Transform the response (includes \`correlationId\`) → **MQ Publish** \`order-confirmed\`. The ID travels in the message body, so it does not depend on connector defaults.
5. **Logger** \`checkout.completed\` with \`orderId\` and \`durationMs\` (from \`vars.startedAt\`).
6. **Error handler:** Logger ERROR \`{ event: "checkout.failed", correlationId, errorType, error }\` → status 502/500 → body \`{ code, message, correlationId }\`. Never return stack traces to the customer.

**Flow \`order-confirmed-consumer\`**: **MQ Subscriber** \`order-confirmed\`. The Anypoint MQ docs do not describe correlation ID propagation, so check that the event \`correlationId\` here matches \`payload.correlationId\`. If it does not, log \`payload.correlationId\` or set it with the Tracing module's \`with-correlation-id\` scope, so \`confirmation.received\` / \`confirmation.sent\` share the same ID and Splunk can join all four log lines.

To keep every application consistent, use a JSON logger component or a log4j2 \`JsonLayout\` with the correlation ID in the MDC, rather than hand-built strings in each Logger.
`,
  followUps: [
    {
      q: 'What is the difference between correlationId and a business key like orderId?',
      a: 'correlationId identifies one request/transaction across systems and is generated per call; orderId identifies a business entity that may span many requests. Log both, because support searches by either.',
    },
    {
      q: 'Why not log the full payload at every step?',
      a: 'Volume, cost and PII. Log business keys and sizes at INFO; full payloads only at DEBUG, and mask sensitive fields.',
    },
    {
      q: 'How does this relate to distributed tracing (OpenTelemetry)?',
      a: 'A correlation ID is the simple version of a trace ID. Mule 4.6+ can export OpenTelemetry spans with trace and span IDs that propagate via W3C traceparent headers and show timing per hop.',
    },
  ],
}

import { design, flow, handler, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-020',
  category: 'flows',
  title: 'Synchronous Request-Reply over JMS with Correlation',
  level: 'ADVANCED',
  tags: ['jms', 'request-reply', 'correlation', 'mainframe', 'timeout'],
  estMinutes: 30,
  flowChecks: [
    { label: 'The balance API is exposed through an HTTP Listener', rule: { type: 'source', component: 'http-listener' } },
    {
      label: 'The request is sent to the BAL.REQ queue over JMS',
      rule: { type: 'exists', component: ['jms-publish-consume', 'jms-publish'], where: { destination: 'BAL.REQ' } },
    },
    {
      label: 'DataWeave builds the mainframe request before it is sent',
      rule: { type: 'before', first: 'transform', then: ['jms-publish-consume', 'jms-publish'] },
    },
    {
      label: 'The reply is mapped to the API response after the JMS call',
      rule: { type: 'before', first: ['jms-publish-consume', 'jms-publish'], then: ['transform', 'set-payload'] },
    },
    {
      label: 'A JMS timeout is handled by a dedicated error handler',
      rule: { type: 'handler', component: ['on-error-propagate', 'on-error-continue'], errorType: 'JMS:TIMEOUT' },
    },
    {
      label: 'The timeout handler builds a 504 BACKEND_TIMEOUT response',
      rule: {
        type: 'inside',
        component: ['transform', 'set-payload', 'set-variable'],
        within: ['on-error-propagate', 'on-error-continue'],
      },
    },
    { label: 'Late replies are drained by a scheduled JMS Consume, not a listener that competes for live replies', rule: { type: 'exists', component: 'jms-consume' } },
  ],
  referenceFlow: design(
    flow(
      'account-balance-api',
      source('http-listener', { path: '/accounts/{id}/balance', allowedMethods: 'GET' }),
      [
        step('set-variable', { variableName: 'accountId', value: '#[attributes.uriParams.id]' }),
        step('transform', {
          script: '%dw 2.0\noutput application/xml\n---\nBalanceRequest: {\n  AccountId: vars.accountId\n}',
        }),
        // Publish Consume to BAL.REQ, reply-to BAL.RPLY, TTL 5 s, max wait ~1200 ms, correlated on JMSMessageID.
        step('jms-publish-consume', { destination: 'BAL.REQ' }),
        step('transform', {
          script:
            '%dw 2.0\ninput payload application/xml\noutput application/json\n---\n{\n  accountId: vars.accountId,\n  available: payload.BalanceReply.Available as Number,\n  ledger: payload.BalanceReply.Ledger as Number,\n  asOf: payload.BalanceReply.AsOf\n}',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'JMS:TIMEOUT' }, [
          step('set-variable', { variableName: 'httpStatus', value: '504' }),
          step('transform', {
            script: '%dw 2.0\noutput application/json\n---\n{\n  code: "BACKEND_TIMEOUT",\n  message: "Mainframe did not reply in time"\n}',
          }),
        ]),
        handler('on-error-propagate', { type: 'JMS:CONNECTIVITY' }, [
          step('set-variable', { variableName: 'httpStatus', value: '503' }),
          step('transform', {
            script: '%dw 2.0\noutput application/json\n---\n{\n  code: "BACKEND_UNAVAILABLE",\n  message: "Mainframe queue unreachable"\n}',
          }),
        ]),
      ],
    ),
    // A listener with no selector would take live replies from Publish Consume, and a listener selector is fixed
    // at start-up. Consume rebuilds its selector on every run, so it only takes replies older than 60 s.
    // Maximum wait 0 returns null instead of raising JMS:TIMEOUT when nothing matches.
    flow('late-reply-drain', source('scheduler', { strategy: 'fixed-frequency', frequency: 30, timeUnit: 'SECONDS' }), [
      step('jms-consume', {
        destination: 'BAL.RPLY',
        ackMode: 'IMMEDIATE',
        maximumWait: 0,
        selector: '#["JMSTimestamp < " ++ (((now() as Number { unit: "milliseconds" }) - 60000) as String)]',
      }),
      step('logger', {
        level: 'WARN',
        message: '#["Late reply check, correlationId " ++ (attributes.headers.correlationId default "n/a")]',
      }),
    ]),
  ),
  description: `
A bank's **Account Balance API** (\`GET /accounts/{id}/balance\`, p95 < 1.5 s) must get the balance from a **mainframe** that is only reachable through **IBM MQ**:
- Requests go to queue \`BAL.REQ\`; the mainframe writes replies to a **shared, fixed** queue \`BAL.RPLY\` and copies the request's **JMSMessageID into JMSCorrelationID**.
- 300 req/s peak across **4 replicas**.
- Sometimes the mainframe answers after 10+ s (or never).

**Design the flow(s):** how the request is sent, how each replica gets *its own* reply from a shared reply queue, timeouts, late replies, and scaling.
`,
  answerTemplate: `## Sending the request

## Receiving the matching reply

## Timeouts and late replies

## Shared reply queue with 4 replicas

## Error mapping to HTTP

## Scaling and connection settings
`,
  keyPoints: [
    'JMS connector (with the IBM MQ client libraries) configured; Publish Consume operation used for request-reply with the reply-to destination set.',
    'Reply correlated by JMSCorrelationID, consuming from the fixed reply queue with a message selector so a replica only takes its own reply.',
    'Reply timeout set below the API SLA; on timeout the API returns 504 and the late reply is discarded (reply message expiry).',
    'Late or orphan replies expire via message TTL or are drained by a cleanup consumer so the reply queue does not fill.',
    'Connection caching/sessions and a dedicated reply-consuming strategy sized for 300 req/s across replicas.',
  ],
  solution: `
1. **Config:** **JMS connector** with a generic/IBM MQ connection factory (IBM MQ client JARs as shared libraries), connection caching enabled. Alternatively MuleSoft's **IBM MQ connector**, which offers the same request-reply pattern.
2. **Request:** DataWeave builds the mainframe copybook/fixed-length or XML request. **JMS Publish Consume** to \`BAL.REQ\` with \`reply-to\` = \`BAL.RPLY\`, a message **time-to-live** (e.g. 5 s, so stale requests aren't processed after the caller gave up), and consume \`maximumWait\` ≈ 1200 ms.
3. **Correlation:** the mainframe sets \`JMSCorrelationID = JMSMessageID\` of the request. With a fixed reply queue, the consumer must use a **selector** \`JMSCorrelationID = '<request id>'\` so each waiting request only receives its reply — Publish Consume handles this correlation; check the correlation strategy configured on the operation matches the backend's behaviour (message ID vs correlation ID).
4. **Response:** DataWeave maps the reply to \`{ accountId, available, ledger, asOf }\`.
5. **Timeout:** \`JMS:TIMEOUT\` → On Error Propagate → **504** \`{ code: "BACKEND_TIMEOUT" }\`. Do not retry automatically (the request may still be processed).
6. **Late replies:** ask the mainframe team to set reply expiry. Otherwise a **Scheduler** runs **JMS Consume** with a selector on \`JMSTimestamp\` that matches only replies older than N seconds, so \`BAL.RPLY\` never fills up. Do not put a plain listener on \`BAL.RPLY\`: with no selector it would compete with Publish Consume for live replies, and a listener's selector cannot change with the clock. One Consume takes one message, so loop it if late replies are frequent.
7. **Scaling:** 300 req/s with ~400 ms average → ~120 in-flight requests. Selector-based consumers on a shared queue cost broker CPU; agree with MQ admins on indexes on correlation ID, or use a **reply queue per replica** (or temporary queues) when the backend honours JMSReplyTo.
`,
  followUps: [
    { q: 'Why not use temporary reply queues?', a: 'They avoid selectors and isolate replies per requester, but the backend must honour JMSReplyTo, and temp queues vanish if the connection drops. Here the mainframe only writes to a fixed queue, so selectors are required.' },
    { q: 'Is request-reply over messaging a good pattern?', a: 'It keeps synchronous coupling and latency, so it is only justified when the backend is reachable solely via MQ; where possible prefer async with callbacks or a cached balance.' },
    { q: 'What if two replicas use the same correlation ID?', a: 'They would steal each other\'s replies. Correlation IDs must be unique (JMSMessageID or a UUID), never derived from the account number.' },
  ],
}

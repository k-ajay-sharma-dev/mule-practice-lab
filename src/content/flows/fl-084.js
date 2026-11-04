import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-084',
  category: 'flows',
  title: 'Lab Results from ActiveMQ to an EMR API with Manual Ack and Session Recovery',
  level: 'INTERMEDIATE',
  tags: ['activemq', 'jms', 'healthcare', 'manual-ack', 'http', 'error-handling'],
  estMinutes: 30,
  flowChecks: [
    { label: 'Results are consumed by a JMS listener with MANUAL acknowledgement', rule: { type: 'source', component: 'jms-listener', where: { ackMode: 'MANUAL' } } },
    { label: 'The ack ID is saved in a variable at the start of the flow', rule: { type: 'before', first: 'set-variable', then: 'http-request' } },
    { label: 'The message is acknowledged only after the EMR accepted the result', rule: { type: 'before', first: 'http-request', then: 'jms-ack' } },
    { label: 'Ack uses the saved ID, because the HTTP call replaces the attributes', rule: { type: 'exists', component: 'jms-ack', where: { ackId: 'vars' } } },
    {
      label: 'A transient failure recovers the session in the error handler',
      rule: { type: 'inside', component: 'jms-recover-session', within: ['on-error-continue', 'on-error-propagate'], where: { ackId: 'vars' } },
    },
    {
      label: 'An invalid result is parked on a separate queue',
      rule: { type: 'inside', component: 'jms-publish', within: 'on-error-continue', where: { destination: 'PARKED' } },
    },
    {
      label: 'A parked result is acknowledged so it does not come back',
      rule: { type: 'inside', component: 'jms-ack', within: 'on-error-continue' },
    },
  ],
  referenceFlow: design(
    flow(
      'lab-results-to-emr',
      // ActiveMQ factory: maxRedelivery 5, redeliveryDelay 30000. The default of 0 means no redelivery.
      source('jms-listener', { destination: 'LAB.RESULTS', ackMode: 'MANUAL', numberOfConsumers: 4, transactionalAction: 'NONE' }),
      [
        step('set-variable', { variableName: 'ackId', value: '#[attributes.ackId]' }),
        step('set-variable', { variableName: 'resultId', value: '#[payload.resultId default "unknown"]' }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[isEmpty(payload.patientMrn) or isEmpty(payload.resultId)]' }, [
              step('raise-error', { type: 'APP:INVALID_RESULT', description: 'Result has no patient MRN or result ID' }),
            ]),
          ],
          { otherwise: [] },
        ),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{\n  resourceType: "Observation",\n  identifier: payload.resultId,\n  subject: payload.patientMrn,\n  code: payload.testCode,\n  value: payload.value,\n  unit: payload.unit,\n  issued: payload.resultedAt\n}',
        }),
        // PUT by result ID: a redelivered result updates the same record.
        step('http-request', { method: 'PUT', path: '/emr/observations/{resultId}', responseTimeout: 15000 }),
        step('jms-ack', { ackId: '#[vars.ackId]' }),
      ],
      [
        // Specific handler first: this message will never succeed, so redelivery would only repeat the failure.
        handler('on-error-continue', { type: 'APP:INVALID_RESULT, HTTP:BAD_REQUEST' }, [
          step('logger', { level: 'WARN', message: '#["Parking result " ++ vars.resultId ++ ": " ++ error.description]' }),
          step('jms-publish', { destination: 'LAB.RESULTS.PARKED', destinationType: 'QUEUE', persistentDelivery: 'true' }),
          step('jms-ack', { ackId: '#[vars.ackId]' }),
        ]),
        // Unacknowledged messages are not redelivered by the broker on their own in MANUAL mode.
        handler('on-error-continue', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Recovering session for result " ++ vars.resultId ++ ": " ++ error.description]' }),
          step('jms-recover-session', { ackId: '#[vars.ackId]' }),
        ]),
      ],
    ),
  ),
  description: `
A hospital group's laboratory system publishes finished test results to the **ActiveMQ** queue \`LAB.RESULTS\`, about **25,000 a day** with morning peaks of 15 per second. Each message is JSON with \`resultId\`, \`patientMrn\`, \`testCode\`, \`value\`, \`unit\` and \`resultedAt\`.

A Mule app must deliver each result to the **electronic medical record** through its REST API (\`PUT /emr/observations/{resultId}\`). The EMR is restarted for about 10 minutes most weeks and occasionally answers with 503.

The clinical safety officer has one rule: **a result may be delayed, but it must not be lost**. The team decided on **MANUAL** acknowledgement so that the application decides exactly when a result is finished with.

**Requirements**
- Acknowledge a result only after the EMR accepted it.
- If the EMR is unavailable, the result must come back for another attempt.
- A result without a patient MRN or result ID will never succeed. It goes to \`LAB.RESULTS.PARKED\` for the lab's data team and must not keep returning.
- Delivering the same result twice must not create two records in the EMR.

**Design the flow.** Walk through the acknowledgement on each path.
`,
  answerTemplate: `## Listener and acknowledgement mode

## The ack ID

## Success path

## Transient failure

## Invalid results

## Redelivery settings
`,
  keyPoints: [
    'In MANUAL mode the application is responsible for the acknowledgement: jms:ack with the ack ID from the received message attributes.',
    'Received but unacknowledged messages are not redelivered by the broker, so an error handler that only logs leaves the result stuck instead of retried.',
    'jms:recover-session in the error handler is what asks for redelivery, and it must use the same connection that received the message.',
    'The HTTP Request replaces the attributes, so #[attributes.ackId] is no longer the JMS value after the call. The ID must be saved in a variable first.',
    'Recover session works on the session, so it applies to all unacknowledged messages in that session rather than one message.',
    'Poison messages are parked and acknowledged, otherwise recover-session would keep returning them.',
    'The ActiveMQ factory maxRedelivery defaults to 0, which means no redelivery, so it must be set. Max Redelivery on the listener or config is documented as having no effect.',
  ],
  solution: `
1. **JMS On New Message** on \`LAB.RESULTS\`, \`ackMode="MANUAL"\`, four consumers (the default).
2. **Set Variable** \`ackId\` from \`attributes.ackId\`, and \`resultId\` for logging. This comes first because the HTTP Request will replace \`attributes\`, and the handlers need the ID too.
3. **Choice**: a missing MRN or result ID raises \`APP:INVALID_RESULT\`.
4. **Transform** to the EMR format and **HTTP PUT** by result ID. Using PUT on the business key makes a repeat harmless: the second delivery updates the same record.
5. **JMS Ack** with \`#[vars.ackId]\`, as the last step.

**Handlers, in order:**
- **On Error Continue** for \`APP:INVALID_RESULT\` and \`HTTP:BAD_REQUEST\`: **Publish** to \`LAB.RESULTS.PARKED\` with persistent delivery, then **Ack**. The ack comes after the publish, so a failed publish cannot lose the result.
- **On Error Continue** for everything else: **JMS Recover Session** with \`#[vars.ackId]\`. The XML example on the MuleSoft ack page places recover-session in an On Error Continue, while the Studio steps on that page use On Error Propagate. The page does not explain the difference, so either is acceptable here.

**Why recover-session and not just a failed flow?** In AUTO mode a failed flow leads to redelivery on its own. In MANUAL mode the docs state that received but unacknowledged messages are not redelivered by the broker, so the application has to ask.

**Redelivery settings.** Configure them on the ActiveMQ connection factory: \`maxRedelivery\` (default 0, no redelivery; -1 is unlimited) and \`redeliveryDelay\` (default 1000 ms). A delay of 1 second would use up the attempts well before a 10 minute EMR restart ends, so the values must be sized for the real outage. The reference uses 5 attempts at 30 seconds as a starting point. For longer outages, stop the source or add a retry queue. Check on your broker where a message goes when the redelivery limit is reached, and monitor that destination, because the requirement says nothing may be lost.

**Worth knowing:** recover-session acts on the session, which may hold more than one unacknowledged message. Idempotent delivery makes that safe. \`JMS:ACK\` and \`JMS:SESSION_RECOVER\` are the error types for failures of these two steps.
`,
  followUps: [
    {
      q: 'What goes wrong if the handler only logs the error?',
      a: 'The result is neither acknowledged nor recovered. The docs say unacknowledged messages are not redelivered by the broker in MANUAL mode, so nothing in the flow retries the result and it never reaches the EMR. That breaks the rule that a result must not be lost.',
    },
    {
      q: 'Would AUTO mode meet these requirements with less work?',
      a: 'Mostly yes. AUTO acknowledges only if the flow completes successfully, and otherwise the message is redelivered. MANUAL is worth it when the ack must happen at a specific point rather than at the end of the flow. Here the main benefit is the explicit decision per path.',
    },
    {
      q: 'Could a transaction replace the manual ack?',
      a: 'A local JMS transaction needs ackMode IMMEDIATE on the listener, and it covers the JMS session, not the EMR call. The EMR is a REST API and cannot join it, so idempotent delivery would still be needed.',
    },
    {
      q: 'Why does the order Publish then Ack matter on the parked path?',
      a: 'If the ack came first and the publish failed, the result would be nowhere. With the publish first, the worst case is a copy on the parked queue and an original that was not acknowledged, which the team can reconcile by result ID.',
    },
  ],
}

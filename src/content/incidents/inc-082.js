export default {
  id: 'inc-082',
  category: 'incidents',
  title: 'Nightly Provisioning Batch Never Finishes After an Outage: MANUAL Ack With No jms:recover-session',
  level: 'ADVANCED',
  tags: ['jms', 'activemq', 'ack-mode', 'redelivery', 'error-handling', 'telecom'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '2026-11-01 02:00:04 INFO  [provisioning] Listener ready destination=PROVISIONING.ORDERS ackMode=MANUAL', relevant: true, why: 'With MANUAL the application owns acknowledgement, and also recovery of what it does not acknowledge.' },
      { text: '2026-11-01 02:00:30 INFO  [batch-source] Published 212 orders to PROVISIONING.ORDERS', relevant: false },
      { text: '2026-11-01 02:00:31 ERROR [provisioning] HTTP:CONNECTIVITY network-inventory unreachable for order PO-771204 redelivered=false', relevant: true, why: 'The order fails before jms:ack, so it is received but not acknowledged.' },
      { text: '2026-11-01 02:00:31 WARN  [provisioning] Error handler: logged failure for PO-771204, ending flow', relevant: true, why: 'The error path only logs. It has no jms:recover-session, which the docs say is needed for redelivery.' },
      { text: '2026-11-01 02:40:12 INFO  [network-inventory] Maintenance complete, service available', relevant: false },
      { text: '2026-11-01 03:00:00 INFO  [health] GET /api/health 200 (2 ms)', relevant: false },
      { text: '2026-11-01 08:15:00 INFO  [amq-console] PROVISIONING.ORDERS pending=212 consumers=4 dequeued=0', relevant: true, why: 'Nothing has been acknowledged since the batch arrived, long after the dependency returned.' },
      { text: '2026-11-01 08:15:04 INFO  [provisioning] Log search: 212 failures, 0 entries with redelivered=true', relevant: true, why: 'No order was tried a second time. This matches the docs: unacknowledged messages in MANUAL are not redelivered by the broker.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why have the 212 orders not been retried since the dependency came back?',
        options: [
          'In MANUAL mode unacknowledged messages are not redelivered by the broker, and the error path never calls jms:recover-session',
          'AUTO ack is waiting for the flow to finish',
          'The orders were lost when they were acknowledged on receipt',
          'Max Redelivery on the listener is set too low',
        ],
        answer: 0,
        explain: 'MANUAL gives the application all responsibility. The docs say that to get redelivery you must recover the session. Max Redelivery on the listener has no effect in any case.',
      },
      {
        type: 'single',
        prompt: 'What should the error path contain?',
        options: [
          '`jms:recover-session` with the ackId of the message, on the same connection that received it',
          '`jms:ack`, so that the failure is cleared from the queue',
          '`jms:consume` to read the message again',
          '`jms:publish` to the same queue, with no acknowledgement',
        ],
        answer: 0,
        explain: 'Recovering the session is the documented route, and it must use the same connection. Acknowledging a failed order would remove the work without doing it.',
      },
      {
        type: 'single',
        prompt: 'An engineer proposes restarting the app and assuming the 212 orders will come back. What is the right response?',
        options: [
        'Do not rely on it. Reconcile first, and verify the behaviour in a lower environment',
        'Agreed: a restart always redelivers everything',
        'Agreed: a restart always deletes unacknowledged messages, so resubmit them all first',
        'A restart is never allowed while messages are pending',
      ],
        answer: 0,
        explain: 'The connector pages describe redelivery through Recover session and do not cover restarts, so do not act on a guess in production. A replay could repeat orders that were partly provisioned. Establish what is really on the broker, and make the processing safe for repeats before anything is replayed.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the permanent fix?',
        options: [
          'Store the ackId in a variable at the start of the flow',
          'Call jms:ack only after the last step has succeeded',
          'Call jms:recover-session on the failure path',
          'Set maxRedelivery on the ActiveMQ factory, with a suitable redelivery delay',
          'Alert on JMS:SESSION_RECOVER and on queue depth that stops falling',
          'Set the listener to IMMEDIATE so nothing can stay unacknowledged',
        ],
        answer: [0, 1, 2, 3, 4],
        explain: 'Complete the design that MANUAL requires, and put a limit on redelivery. IMMEDIATE would swap a stuck message for a lost one.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Compare the 212 pending orders with what network-inventory actually provisioned',
          'Confirm that provisioning is idempotent on the order number',
          'Test the new recover-session path in a lower environment by stopping the dependency',
          'Release the fix',
          'Complete the outstanding orders with the operations team, and confirm the queue state',
        ],
        explain: 'Learn the true state first, make repeats safe, and prove the fix under the same failure before you rely on it.',
      },
    ],
  },
  description: `
## Symptoms
- At 08:00, operations finds that last night's batch of **212 broadband provisioning orders** is unfinished. Customers have appointments today.
- The ActiveMQ console still shows **212 pending** on \`PROVISIONING.ORDERS\`, hours after the batch arrived.
- The app is running and passes health checks.

## Change / Context
- A nightly job publishes each day's orders at 02:00. Nothing else is published to the queue until the next night.
- \`network-inventory\` had planned maintenance from 02:00 to 02:40, which overlapped the batch.
- \`provisioning\` uses \`ackMode="MANUAL"\` and calls \`jms:ack\` at the end of the flow. It was changed from AUTO last quarter, so the ack would come after the final step. The error handler logs the failure and ends.

## Logs
\`\`\`
02:00:31 ERROR [provisioning] HTTP:CONNECTIVITY network-inventory unreachable for order PO-771204 redelivered=false
02:00:31 WARN  [provisioning] Error handler: logged failure for PO-771204, ending flow
08:15:00 INFO  [amq-console] PROVISIONING.ORDERS pending=212 consumers=4 dequeued=0
08:15:04 INFO  [provisioning] Log search: 212 failures, 0 entries with redelivered=true
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do right now?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'MANUAL delegates all acknowledgement responsibility to the application.',
    'Messages received but not acknowledged are not redelivered by the broker.',
    'To get them redelivered, the flow must call jms:recover-session, on the same connection that received them.',
    'The app is healthy and the dependency is back, so nothing else will retry the orders.',
    'The docs do not state what the broker does on an app restart, so verify it and do not assume it.',
    'Fix: store the ackId early, ack after the last step, recover on failure, and set maxRedelivery on the factory.',
  ],
  solution: `
**Diagnosis.** The listener is in MANUAL mode. Each order failed before \`jms:ack\`, and the handler only logged it. The docs state that in MANUAL all messages received but not acknowledged are not redelivered by the broker, and that you must recover the session to have them redelivered. Nothing did that, so the orders were never tried again, even after \`network-inventory\` returned at 02:40. The log confirms it, with no redelivered attempts at all.

**Immediate mitigation.**
- Check what \`network-inventory\` actually provisioned, so you know what is outstanding.
- Agree a way to complete the outstanding orders with operations, and prioritise today's appointments. Resubmitting from the source system is one option, if provisioning is idempotent on the order number.
- Do not assume what a restart will do. The connector docs do not state what the broker does with these messages when the app restarts or the session closes. Test it in a lower environment, or confirm it with the broker team, before relying on it.

**Root cause.** The change to MANUAL took on the application's duty to acknowledge, but not its duty to recover. The failure path was never tested.

**Permanent fix.**
\`\`\`xml
<flow name="provisioning">
  <jms:listener config-ref="amq" destination="PROVISIONING.ORDERS" ackMode="MANUAL"/>
  <set-variable variableName="ackId" value="#[attributes.ackId]"/>
  <flow-ref name="provision-order"/>
  <jms:ack ackId="#[vars.ackId]"/>
  <error-handler>
    <on-error-propagate type="HTTP:CONNECTIVITY, HTTP:TIMEOUT">
      <jms:recover-session ackId="#[vars.ackId]"/>
    </on-error-propagate>
  </error-handler>
</flow>
\`\`\`
- Set \`maxRedelivery\` on the ActiveMQ factory with a suitable delay. Its default of 0 means no redelivery, and Max Redelivery on the listener has no effect.
- Provide a path for orders that use up their attempts, with an alert.
- Consider whether MANUAL is needed at all. AUTO acknowledges only if the flow completes successfully, and it redelivers otherwise, which matches what this flow wanted.

**Prevention.** Test every ack mode's failure path with the dependency stopped. Alert on queue depth that stops falling, and on \`JMS:ACK\` and \`JMS:SESSION_RECOVER\`.
`,
  followUps: [
    { q: 'Why not go back to AUTO?', a: 'It may be the best answer. AUTO acknowledges when the flow completes successfully. Use MANUAL only when you must acknowledge at a point other than the end of the flow.' },
    { q: 'Why store the ackId in a variable?', a: 'The attributes can be replaced by later processors, such as an HTTP request. A variable keeps the id available for both the ack and the recover call.' },
    { q: 'What if recover-session itself fails?', a: 'The connector has an error type for it, JMS:SESSION_RECOVER. Alert on it, because the message remains in the same state until someone acts.' },
  ],
}

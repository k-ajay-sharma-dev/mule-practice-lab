export default {
  id: 'inc-081',
  category: 'incidents',
  title: 'Prescription Refills Lost During a Pharmacy System Outage: IMMEDIATE Ack With No Dead Letter Path',
  level: 'INTERMEDIATE',
  tags: ['jms', 'activemq', 'ack-mode', 'dlq', 'data-loss', 'healthcare'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '2026-10-14 13:00:06 INFO  [refill-consumer] Listener started destination=PHARMACY.REFILLS ackMode=IMMEDIATE consumers=4', relevant: true, why: 'With IMMEDIATE the message is acknowledged after it is consumed and before any processing.' },
      { text: '2026-10-14 14:10:02 INFO  [refill-consumer] Refill RX-558120 sent to pharmacy system', relevant: false },
      { text: '2026-10-14 14:22:17 ERROR [refill-consumer] HTTP:CONNECTIVITY pharmacy-sapi unreachable for refill RX-558341', relevant: true, why: 'The flow failed after the message was already acknowledged, so the broker will not send it again.' },
      { text: '2026-10-14 14:22:17 ERROR [refill-consumer] Default error handler: flow failed, no further action', relevant: true, why: 'There is no error handling to save the message, so this is the only trace of the refill.' },
      { text: '2026-10-14 14:30:00 INFO  [health] GET /api/health 200 (2 ms)', relevant: false },
      { text: '2026-10-14 14:47:50 INFO  [amq-console] PHARMACY.REFILLS pending=0 consumers=4; ActiveMQ.DLQ pending=0', relevant: true, why: 'The queue and the DLQ are both empty, which shows the messages left the broker. No redelivery happened that could send them to a DLQ.' },
      { text: '2026-10-14 14:48:03 INFO  [pharmacy-sapi] Service restored', relevant: false },
      { text: '2026-10-14 14:48:30 INFO  [refill-consumer] Refill RX-558902 sent to pharmacy system', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why are the refills gone, with nothing on the queue or the DLQ?',
        options: [
          'IMMEDIATE acknowledges before processing, so a failed message is not redelivered, and no error handling saved it',
          'The broker purged the queue when the pharmacy system went down',
          'AUTO ack dropped the messages after 10000 ms',
          'The DLQ was disabled by the outage',
        ],
        answer: 0,
        explain: 'The acknowledgement happened before the HTTP call failed. A message that is never redelivered never reaches a redelivery limit, so it never reaches a DLQ either.',
      },
      {
        type: 'single',
        prompt: 'What is the best way to recover the lost refills?',
        options: [
          'Rebuild the list from the error logs and the patient portal records, then resubmit with a check for duplicates',
          'Restart the app so that the broker sends them again',
          'Browse ActiveMQ.DLQ again after an hour',
          'Change the ack mode, because that brings them back',
        ],
        answer: 0,
        explain: 'The broker no longer has these messages. Only the sender and the logs can tell you what was lost.',
      },
      {
        type: 'multi',
        prompt: 'Which are valid permanent fixes?',
        options: [
          'Move to AUTO, so a failed message is not acknowledged, and set maxRedelivery on the ActiveMQ factory',
          'Keep IMMEDIATE, and add an error handler that publishes the failed message to a dead letter queue',
          'Make processing idempotent on the refill number, because redelivery can repeat work',
          'Alert on HTTP errors and on the depth of the dead letter queue',
          'Set Max Redelivery on the jms:listener to 5',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Either tie the acknowledgement to success or take responsibility in the handler. Max Redelivery on the listener has no effect, and `maxRedelivery` on the factory defaults to 0, meaning no redelivery.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Find when the outage started and which refills failed, using the error log',
          'Reconcile that list against the patient portal',
          'Resubmit the missing refills and tell the pharmacy team',
          'Test the ack mode and redelivery change by stopping the pharmacy API in a lower environment',
          'Release the change to production',
        ],
        explain: 'Patients come first, so recover the refills, then fix the design and prove it under the same failure before it reaches production.',
      },
    ],
  },
  description: `
## Symptoms
- Pharmacy staff report that patients are turning up for refills that were never received. The patient portal shows them as "submitted".
- About **210 refills** from a 25-minute period are missing.
- \`PHARMACY.REFILLS\` and \`ActiveMQ.DLQ\` are both empty.

## Change / Context
- The patient portal publishes refill requests to the ActiveMQ queue \`PHARMACY.REFILLS\`. \`refill-consumer\` calls \`pharmacy-sapi\`.
- \`pharmacy-sapi\` was down from 14:22 to 14:48 for an unplanned database failover.
- The listener uses \`ackMode="IMMEDIATE"\`, which a developer set a year ago "for better throughput". The flow has no error handler of its own.

## Logs
\`\`\`
14:22:17 ERROR [refill-consumer] HTTP:CONNECTIVITY pharmacy-sapi unreachable for refill RX-558341
14:22:17 ERROR [refill-consumer] Default error handler: flow failed, no further action
14:47:50 INFO  [amq-console] PHARMACY.REFILLS pending=0 consumers=4; ActiveMQ.DLQ pending=0
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
    'IMMEDIATE acknowledges a message after it is consumed and before processing.',
    'A failed message is not redelivered in IMMEDIATE, so it needs error handling such as a DLQ or it is lost.',
    'An empty queue and an empty DLQ fit this: nothing was redelivered, so no redelivery limit was reached.',
    'Recovery must come from the sender and the logs, because the broker no longer has the messages.',
    'Fix: AUTO with maxRedelivery on the factory, or keep IMMEDIATE with a handler that writes to a DLQ.',
    'maxRedelivery defaults to 0, meaning no redelivery. Max Redelivery on the listener has no effect.',
  ],
  solution: `
**Diagnosis.** The listener acknowledged each refill as soon as it was consumed. When \`pharmacy-sapi\` went down, the HTTP call failed, but the broker had already finished with the message. The docs state that with IMMEDIATE a failed message is not redelivered, so it needs error handling such as a dead letter queue. There was none. The DLQ is empty because nothing was ever redelivered or dead-lettered.

**Immediate mitigation.**
- Use the error logs to list the failed refill numbers.
- Reconcile with the portal's records, which remain the source for what patients submitted.
- Resubmit the missing refills, checking for duplicates first, and tell pharmacy staff which patients are affected. Clinically urgent ones should be escalated by hand.

**Root cause.** An ack mode chosen for throughput was paired with a flow that had no way to save a failed message. A dependency outage turned that into data loss.

**Permanent fix.** Choose one, and test it by stopping \`pharmacy-sapi\` in a lower environment.
- **AUTO (preferred here):** the message is acknowledged only if the flow completes successfully, and it is redelivered otherwise. Set \`maxRedelivery\` on the ActiveMQ factory, because its default of 0 means no redelivery. Use a redelivery delay that suits a short outage, and make the flow idempotent on the refill number.
- **IMMEDIATE with a handler:** publish the failed message and its error details to a dead letter queue, and replay from there. The handler becomes critical, and it fails if the broker is unavailable too.

Do not set Max Redelivery on the listener or config, which is documented as having no effect.

**Prevention.** Require a written reason for IMMEDIATE in design reviews. Include dependency outages in testing. Alert on errors from the flow and on dead letter depth, and reconcile submitted against received refills every day.
`,
  followUps: [
    { q: 'What throughput did IMMEDIATE actually gain?', a: 'Measure it rather than assume. For a flow that spends its time on an HTTP call, moving the acknowledgement is unlikely to be the deciding factor, and the risk is much greater than any benefit.' },
    { q: 'Would a transaction have helped?', a: 'Yes. On a transacted listener the transaction rolls back if the flow returns an error, and the message returns for redelivery. It also needs IMMEDIATE as its ack mode, so check the transaction settings along with the ack mode.' },
    { q: 'How would you explain this to the pharmacy team?', a: 'The message was marked as collected before it was delivered to their system. When their system went down, nothing went back to retry it. We have recovered the requests and changed it so the message is only cleared after delivery.' },
  ],
}

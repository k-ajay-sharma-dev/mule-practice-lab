export default {
  id: 'ms-243',
  category: 'mulesoft',
  title: 'Anypoint MQ Dead Letter Queues: Max Deliveries, What Counts as a Delivery and Reprocessing',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'queues', 'anypoint-mq', 'dlq', 'max-deliveries', 'redelivery', 'error-handling', 'healthcare'],
  estMinutes: 18,
  quiz: [
    {
      type: 'single',
      prompt: 'A queue lab-results-dlq exists in Anypoint MQ. Messages on lab-results fail again and again, past 20 deliveries, and never reach it. What is missing?',
      options: [
        'lab-results is not set to use lab-results-dlq as its DLQ, with a max deliveries value',
        'The subscriber in the Mule app has no dead letter queue name in its connector config',
        'The flow uses AUTO acknowledgement, and failures under AUTO never count as deliveries',
        'lab-results-dlq has no exchange bound to it, so failed messages have no route there',
      ],
      answer: 0,
      explain: 'A DLQ is an ordinary queue. The source queue points to it and says after how many deliveries a message moves there. Without that setting on the source queue, a failing message cycles forever. The Mule connector has no DLQ setting, as this lives on the queue in Anypoint MQ. Under AUTO, a failed flow returns the message, and that counts as a delivery. No exchange is involved in dead lettering.',
    },
    {
      type: 'multi',
      prompt: 'With manual acknowledgement, which of these lead to the message being delivered again and so count towards the maximum?',
      options: [
        'The flow calls Nack',
        'The flow takes longer than the acknowledgement timeout and never acks',
        'The flow calls Ack, then fails in a later step',
        'The app crashes while processing',
        'The message waits in the queue until its time to live ends, and no one reads it',
      ],
      answer: [0, 1, 3],
      explain: 'A Nack returns the message to the queue at once. A flow that runs past the acknowledgement timeout without acking loses its lock, so the message goes back. A crash leaves the message unacked, so it also goes back when the lock ends. Each return means one more delivery. An Ack removes the message, so a failure after it does not bring it back. A message that expires unread was never delivered, so the delivery count does not grow.',
    },
    {
      type: 'single',
      prompt: 'The maximum deliveries is set to 10 and the target API is down for an hour. What is the risk?',
      options: [
        'None, the messages wait on the queue',
        'Good messages use up their deliveries and land in the DLQ',
        'None, as only an explicit Nack counts toward the limit',
        'Anypoint MQ slows redelivery until the API is back',
      ],
      answer: 1,
      explain: 'Good messages can use up their 10 deliveries in minutes, though nothing is wrong with them. Fast redelivery burns through the limit during an outage. Stop consuming while the target is down, or retry with a delay, so the DLQ holds only real failures.',
    },
    {
      type: 'single',
      prompt: 'A message fails because a required field is missing. What should the flow do?',
      options: [
        'Nack it so it is tried again up to max deliveries',
        'Send it to a reject path with the error, then ack',
        'Ack it and log a warning, so the queue keeps moving',
        'Leave it unacked until the timeout returns it',
      ],
      answer: 1,
      explain: 'Bad data fails every time. Retrying wastes deliveries and delays other messages. Move it out with its error, to a DLQ or an error store, then ack.',
    },
    {
      type: 'match',
      prompt: 'Match each failure to the best handling.',
      pairs: [
        ['Target API returns 503', 'Retry later, with a delay'],
        ['Payload fails schema validation', 'Reject at once with the error'],
        ['Database deadlock', 'Retry a few times'],
        ['Message for a customer that does not exist yet', 'Hold or retry later, then alert'],
      ],
      explain: 'Retry passing failures, reject permanent ones, and treat "not yet" cases with a delay and a limit.',
    },
    {
      type: 'order',
      prompt: 'Order the steps to reprocess messages from a DLQ after a fix.',
      items: [
        'Find out why the messages failed and deploy the fix',
        'Check a few messages by hand against the fix',
        'Move or republish the messages to the source queue at a controlled rate',
        'Watch the source queue and the DLQ for new failures',
      ],
      explain: 'Replaying before the fix only fills the DLQ again. Controlled replay avoids flooding the target.',
    },
  ],
  description: `
Linmoor Health sends lab results from a lab system to patient records through Anypoint MQ. Last week the records API was down for 40 minutes. Afterwards, 2,300 messages were in the DLQ, and support could not tell which ones had bad data and which ones only met the outage.

**Questions**
1. How does a DLQ work in Anypoint MQ, and what counts as a delivery?
2. Why did good messages end up in the DLQ?
3. How should the flow treat bad data compared with an outage?
4. How do you reprocess the DLQ safely?
`,
  answerTemplate: `## DLQ and deliveries

## Why good messages landed there

## Bad data or outage

## Reprocessing
`,
  keyPoints: [
    'A DLQ is a normal queue assigned to a source queue with a maximum number of deliveries.',
    'A Nack, an expired acknowledgement timeout or a crash all count as a delivery.',
    'Fast retries during an outage push good messages to the DLQ.',
    'Pause consumption or retry with a delay when the target is down.',
    'Reject bad data at once, with the error, instead of retrying.',
    'Reprocess after the fix, at a controlled rate, and keep the error reason with each message.',
  ],
  solution: `
**1. DLQ and deliveries.** In Anypoint MQ the DLQ is an ordinary queue. The source queue names it and sets the maximum number of deliveries. Each time a message is handed to a consumer and comes back, through a Nack, an expired acknowledgement timeout or a crash, the count goes up. When it passes the limit, the message moves to the DLQ.

**2. Why good messages landed there.** The flow Nacked every failure at once. During the outage each message was delivered again within seconds, so it used up its deliveries long before the API came back. The DLQ then mixed outage victims with real bad data.

**3. Bad data or outage.** Sort errors into two kinds. A validation error, such as a missing patient id, fails every time: send it to a reject path with the error text and ack it. A connectivity error or a 503 is passing: stop consuming for a while, for example with a circuit breaker that stops the subscriber, or retry with a delay. Then the DLQ holds only messages that need a person.

**4. Reprocessing.** Keep the error reason with each failed message, as a property or in an error store, so support can sort them. After the fix, check a few by hand, then republish to the source queue at a controlled rate and watch for new failures. Lab results may be needed in order, so check whether a replay can overwrite a newer result with an older one.
`,
  followUps: [
    {
      q: 'How do you stop the subscriber while the API is down?',
      a: 'Use a circuit breaker pattern: after several connectivity errors, stop the flow or source, and start it again after a wait or when a health check passes. Runtime Manager or a scheduler flow can do the restart.',
    },
    {
      q: 'Should the DLQ have a time to live?',
      a: 'Long enough for support to act, such as several days. A short TTL deletes failed messages before anyone sees them.',
    },
    {
      q: 'Why keep the error reason with the message?',
      a: 'The DLQ alone shows that a message failed, not why. With the reason attached, support can group failures, fix causes and replay the right ones.',
    },
  ],
}

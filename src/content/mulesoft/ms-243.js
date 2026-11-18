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
      prompt: 'How is a dead letter queue set up in Anypoint MQ?',
      options: [
        'Every queue gets one automatically',
        'You create a normal queue and assign it as the dead letter queue of another queue, with a maximum number of deliveries',
        'It is a setting on the Mule app',
        'It is a special exchange',
      ],
      answer: 1,
      explain: 'A DLQ is an ordinary queue. The source queue points to it and says after how many deliveries a message moves there.',
    },
    {
      type: 'multi',
      prompt: 'With manual acknowledgement, which of these lead to the message being delivered again and so count towards the maximum?',
      options: [
        'The flow calls Nack',
        'The flow takes longer than the acknowledgement timeout and never acks',
        'The flow calls Ack',
        'The app crashes while processing',
      ],
      answer: [0, 1, 3],
      explain: 'Anything that returns the message to the queue counts as a delivery. Only an Ack removes it.',
    },
    {
      type: 'single',
      prompt: 'The maximum deliveries is set to 10 and the target API is down for an hour. What is the risk?',
      options: [
        'None, the messages wait',
        'Good messages use up their 10 deliveries in minutes and land in the DLQ, though nothing is wrong with them',
        'The queue is deleted',
        'Anypoint MQ slows down delivery on its own until the API is back',
      ],
      answer: 1,
      explain: 'Fast redelivery burns through the limit during an outage. Stop consuming while the target is down, or retry with a delay, so the DLQ holds only real failures.',
    },
    {
      type: 'single',
      prompt: 'A message fails because a required field is missing. What should the flow do?',
      options: [
        'Nack it so it is tried again',
        'Send it straight to a reject path, such as a DLQ or error store, and ack it',
        'Ack it and do nothing else',
        'Restart the app',
      ],
      answer: 1,
      explain: 'Bad data fails every time. Retrying wastes deliveries and delays other messages. Move it out with its error, then ack.',
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

export default {
  id: 'ms-249',
  category: 'mulesoft',
  title: 'Designing the Restart App: Failure Queue, Health Checks, Controlled Republish and Poison Messages',
  level: 'EXPERT',
  tags: ['myproject', 'queues', 'failure-queue', 'restart', 'health-check', 'jms', 'azure-blob', 'oracle', 'product-data-hub'],
  estMinutes: 28,
  quiz: [
    {
      type: 'single',
      prompt: 'Why should the restart app check Oracle and blob storage before republishing failed messages?',
      options: [
        'To warm the connection pools before the run',
        'If either is down, republished messages fail again',
        'To count the blobs that need reprocessing',
        'To refresh the credentials the main flow uses',
      ],
      answer: 1,
      explain: 'If either is still down, every republished message fails again and returns to the failure queue. Most failed messages failed because a dependency was down. Republishing before it is back only cycles them again.',
    },
    {
      type: 'multi',
      prompt: 'Which make good health checks for this hub?',
      options: [
        'A light query such as selecting from dual on the Oracle connection',
        'Reading the properties of the inbound container, or listing it with a page size of one',
        'Downloading every blob in the container',
        'Checking that the JMS broker accepts a connection',
      ],
      answer: [0, 1, 3],
      explain: 'Health checks should be cheap and touch each dependency the load needs. Downloading everything is a load, not a check.',
    },
    {
      type: 'single',
      prompt: 'A message has been through the failure queue and back five times. What should the restart app do?',
      options: [
        'Republish it again, with a longer delay',
        'Park it with its history and alert support',
        'Delete it from the failure queue',
        'Republish it with a new message id',
      ],
      answer: 1,
      explain: 'Keep a republish count in a message property. Past a limit, the message is a poison message that needs a person, not another loop.',
    },
    {
      type: 'single',
      prompt: '4,000 messages wait in the failure queue after an outage. How should the restart app republish them?',
      options: [
        'All at once, as fast as possible',
        'In batches at a controlled rate',
        'Newest first, so recent data lands sooner',
        'All at once, after a restart of the main app',
      ],
      answer: 1,
      explain: 'Send batches at a controlled rate and watch for new failures, so the main flow and Oracle are not flooded. A flood after an outage can cause a second outage. A controlled rate lets the main flow keep up and shows quickly if the fix did not work.',
    },
    {
      type: 'single',
      prompt: 'The restart app consumes from the failure queue and publishes to the main queue on the same ActiveMQ broker. How do you avoid losing or doubling a message if it crashes in between?',
      options: [
        'One JMS local transaction for consume and publish',
        'Log the message before publishing it',
        'Publish from inside an Async scope',
        'Publish twice and let the duplicate check sort it',
      ],
      answer: 0,
      explain: 'On one broker, a JMS local transaction on the same connection config can cover the consume and the publish, so both commit or both roll back. A crash rolls both back and the message stays in the failure queue.',
    },
    {
      type: 'order',
      prompt: 'Order the steps of one restart run.',
      items: [
        'Run the health checks on Oracle, blob storage and the broker',
        'Stop if any check fails, and log why',
        'Read failed messages and skip any over the republish limit',
        'Republish the rest to the main queue at a controlled rate, keeping the original message id',
        'Write a summary of republished, parked and skipped counts to the job log',
      ],
      explain: 'Checks first, then a limited and logged republish. The original message id lets the duplicate checks in the main flow work.',
    },
  ],
  description: `
Kestrel Home Supply runs a product data hub. Notifications for GS1 style files arrive on an ActiveMQ queue, point to JSON files in Azure Blob Storage, and are loaded into Oracle staging tables. When a load fails after its retries, the notification goes to a failure queue.

The team wants a restart app that brings failed messages back. A first version republished everything every 10 minutes. During a long Oracle outage it moved the same 4,000 messages round in circles, and the job log tables grew by a million rows.

**Questions**
1. What should the restart app check before it republishes?
2. How do you stop poison messages from looping forever?
3. How do you republish without losing or doubling messages?
4. How do you republish safely after a big outage?
`,
  answerTemplate: `## Health checks

## Poison messages

## No loss, no doubles

## After a big outage
`,
  keyPoints: [
    'Check Oracle, blob storage and the broker with cheap calls before republishing.',
    'Stop the run and log the reason when a check fails.',
    'Carry a republish count and park messages over the limit with an alert.',
    'Consume and publish in one JMS local transaction on the same broker.',
    'Keep the original message id, so the main flow duplicate checks still work.',
    'Republish at a controlled rate and record counts in the job log.',
  ],
  solution: `
**1. Health checks.** Before touching the failure queue, run a light query on Oracle, such as a select from dual, read the properties of the inbound container or list it with a page size of one, and confirm the broker connection. If any check fails, stop the run and log why. Republishing into a broken dependency only cycles messages and fills the job log.

**2. Poison messages.** Some messages fail for their content, not for an outage. Add a republish count as a message property each time the restart app sends a message back. Past a limit, such as three, move the message to a parked queue or table with its error history and alert support. Classify errors too: a schema failure should never be republished at all.

**3. No loss, no doubles.** The consume from the failure queue and the publish to the main queue run on the same ActiveMQ broker. Run both in one JMS local transaction on the same connection configuration, so a crash rolls both back and the message stays in the failure queue. Keep the original message id and the sender document id unchanged. If a message was in fact half loaded before it failed, the duplicate checks in the main flow catch the repeat.

**4. After a big outage.** Republish in batches at a controlled rate, and check the failure rate after each batch. Stop if new failures appear, since the fix may not have worked. Run the restart app on one node or as a single scheduled run, so two copies do not republish the same messages. Write one summary row per run to the job log, with republished, parked and skipped counts, instead of a row per message per cycle.
`,
  followUps: [
    {
      q: 'Should the restart app run on a schedule or on demand?',
      a: 'Both have a place. A schedule recovers from short outages without a person, and an on demand run lets support replay after a fix. Either way the health checks gate the run.',
    },
    {
      q: 'How do you run it safely in a cluster?',
      a: 'Make the scheduler run on the primary node only, or use a lock in Object Store or the database, so two instances never republish the same batch.',
    },
    {
      q: 'Why not let the main flow retry forever instead of using a failure queue?',
      a: 'Endless retries hold consumer threads and hide the failure. A failure queue frees the main flow, makes the backlog visible and lets the restart wait for the cause to be fixed.',
    },
  ],
}

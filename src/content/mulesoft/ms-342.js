export default {
  id: 'ms-342',
  category: 'mulesoft',
  title: 'Messages Pile Up on the Queue After a Release: What to Check First',
  level: 'ADVANCED',
  tags: ['myproject', 'queues', 'production-support', 'jms', 'activemq', 'troubleshooting'],
  estMinutes: 20,
  quiz: [
    {
      type: 'order',
      prompt: 'Messages are piling up after a release. Put the first checks in a sensible order.',
      items: [
        'Look at the broker console: queue depth, consumer count and dequeue rate',
        'Check the app is running and the listener flow started, in the runtime logs',
        'Compare the queue name, selector and connection settings with the old release',
        'Look for errors or rollbacks in the consumer flow that send messages back',
      ],
      explain: 'Start with what the broker sees. It tells you whether anyone is consuming at all.',
    },
    {
      type: 'single',
      prompt: 'The broker shows 0 consumers on the queue. What is the most likely cause?',
      options: [
        'The messages are larger than the listener accepts, so the broker drops each consumer link',
        'The listener never connected, such as a wrong queue or URL, bad login or stopped flow',
        'The database is slow, so the consumers time out and the broker removes them from the count',
        'The prefetch is set too low, so the listener waits for credit and never registers',
      ],
      answer: 1,
      explain: 'Zero consumers means the problem is before any message reaches Mule.',
    },
    {
      type: 'single',
      prompt: 'The broker shows 2 consumers, the queue still grows, and the dequeue count is 0. What do you suspect?',
      options: [
        'Producer flow control on the broker, which pauses the consumers while senders keep going',
        'A selector that matches nothing, or consumers that take and roll back messages',
        'The queue hit its memory limit, so the broker blocks dequeues until the queue is purged',
        'The consumers use a transacted session, so dequeues are counted only after a broker restart',
      ],
      answer: 1,
      explain: 'A typo in a selector, such as a property name in the wrong case, makes the listener ignore every message.',
    },
    {
      type: 'multi',
      prompt: 'By mistake, the release changed the listener queue name in one environment properties file. Senders still use the old name. What would you see?',
      options: [
        'Messages piling up on the old queue name',
        'A new empty queue created on the broker with the new name, on brokers that create queues on first use',
        'An error in the sender, since the broker rejects sends to a queue that has no consumers',
        'The listener connected and idle',
        'Messages moving to the dead letter queue once the redelivery limit is reached',
      ],
      answer: [0, 1, 3],
      explain: 'Brokers such as ActiveMQ can create destinations on demand, so a wrong name fails without noise. Senders keep filling the old queue, a new empty queue appears, and the listener waits on it. Sending to a queue with no consumers is normal, so the sender sees no error. Nothing reads the old queue, so no delivery fails and nothing reaches a dead letter queue.',
    },
    {
      type: 'single',
      prompt: 'In a cluster, the listener is set to run on the primary node only and the primary node is stuck. What is the quick check?',
      options: [
        'Restart the broker so every consumer connects again',
        'See which node is primary and whether its listener started',
        'Switch the listener to run on all nodes, so a healthy node picks up the work',
        'Add a node to the cluster so it takes over the listener',
      ],
      answer: 1,
      explain: 'Restarting that node usually moves the primary role. Running on all nodes breaks the order that primary node only was there to keep, and it is a change, not a check. A broker restart does not help a listener that never started. A new node starts as a secondary, so it does not take over. Primary node only listeners are common for ordered processing. One bad node stops the whole flow.',
    },
    {
      type: 'single',
      prompt: 'The backlog is cleared after the fix. What should you check before closing the incident?',
      options: [
        'That the queue depth stayed at zero for an hour, which proves each message was processed',
        'That the DLQ did not fill, duplicates were skipped and job log counts match',
        'That the queue was deleted and created fresh, so no old consumer state is left behind',
        'That the app CPU and memory went back to normal levels once the drain finished',
      ],
      answer: 1,
      explain: 'The job log counts should match the messages consumed. A fast drain after an outage is when duplicates and poison messages show up.',
    },
  ],
  description: `
Brindle Outdoor deployed a new version of its product data hub on Tuesday evening. By Wednesday morning the inbound item queue on ActiveMQ held 18,000 messages and stores had no new prices. The app status was green and there were no errors in the logs.

**Questions**
1. What do you check first, and where?
2. What does the consumer count tell you?
3. Which release changes cause this kind of silent backlog?
4. How do you drain the queue safely and confirm the fix?
`,
  answerTemplate: `## First checks

## Reading the consumer count

## Silent causes from a release

## Draining and confirming
`,
  keyPoints: [
    'Start at the broker: depth, consumers and dequeue rate.',
    'Zero consumers points at connection or naming problems.',
    'Consumers with no dequeues point at selectors or rollbacks.',
    'Brokers can create a new queue for a mistyped name.',
    'Check primary node only listeners in clusters.',
    'After draining, check the dead letter queue, duplicates and counts.',
  ],
  solution: `
**1. First checks.** Open the broker console and look at the queue: depth, consumer count, enqueue and dequeue rates. Then check the runtime logs to see whether the listener flow started and connected.

**2. The consumer count.** Zero consumers means Mule never attached: wrong broker URL, credentials, queue name, or a stopped flow. Consumers present but no dequeues means they ignore or return the messages: a selector that matches nothing, or a flow that rolls back every message.

**3. Silent causes.** A renamed queue in one environment's properties, a broker that creates the mistyped queue on first use, a changed selector, a listener moved to primary node only on a stuck node, or a new client ID clash on a durable subscription. None of these log an error by default.

**4. Draining and confirming.** Fix the setting and redeploy. Watch the dequeue rate and the database load while the backlog drains, and lower concurrency if the database struggles. Then check the dead letter queue, the duplicate counts and the job log totals against the number of messages consumed. Add an alert on queue depth and consumer count so the next one is caught in minutes.
`,
  followUps: [
    {
      q: 'Why did the app look healthy?',
      a: 'The runtime and the app were up. Nothing checked that the listener was attached and consuming, so a queue depth or consumer count alert is needed.',
    },
    {
      q: 'Should you purge the backlog to get stores current fast?',
      a: 'No. Every message is a change. Purging loses them. Drain with a controlled rate, since later messages may depend on earlier ones.',
    },
    {
      q: 'What would you add to the release checklist?',
      a: 'Compare destination names and selectors per environment, and after deploy confirm the consumer count on the broker.',
    },
  ],
}

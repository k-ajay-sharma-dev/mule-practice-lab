export default {
  id: 'ms-246',
  category: 'mulesoft',
  title: 'Fan Out Without Losing Messages: Anypoint MQ Exchanges, JMS Durable Subscribers and ActiveMQ Virtual Topics',
  level: 'ADVANCED',
  tags: ['myproject', 'queues', 'durable-subscription', 'exchanges', 'activemq', 'virtual-topics', 'anypoint-mq', 'jms', 'travel'],
  estMinutes: 22,
  quiz: [
    {
      type: 'single',
      prompt: 'A Mule app listens on a JMS topic with a non durable subscription. It is redeployed and is offline for five minutes. What happens to messages published in that time?',
      options: [
        'They wait on the topic for the app',
        'The app never receives them',
        'They are kept, if the app sets a client ID',
        'They are kept, if they were sent as persistent',
      ],
      answer: 1,
      explain: 'Non durable subscriptions exist only while the consumer is connected. Anything published while it is away is not kept for it.',
    },
    {
      type: 'multi',
      prompt: 'Finance reads a JMS 1.1 topic through a durable subscription with client ID finance-app. The team scales finance to two replicas with the same config. Which statements are true?',
      options: [
        'The second replica fails to connect, as a client ID can be used by one connection at a time',
        'Both replicas share the subscription, and the broker splits the messages between them',
        'While both replicas are stopped, the broker keeps messages for the subscription',
        'A JMS 2.0 shared durable subscription would let both replicas consume it',
        'Giving each replica its own client ID lets the two replicas share the work',
      ],
      answer: [0, 2, 3],
      explain: 'In JMS 1.1 a durable subscription is identified by the client ID and the subscription name. A client ID can be used by one connection at a time, which clashes with several replicas. Splitting messages between consumers of one subscription is what JMS 2.0 shared subscriptions add. A separate client ID per replica creates two subscriptions, so each replica gets every message and the work is done twice.',
    },
    {
      type: 'single',
      prompt: 'A team retires a consumer app but leaves its durable subscription on the broker. What happens over the following weeks?',
      options: [
        'Nothing, the broker removes it once the client stops connecting',
        'Messages pile up for the subscription, and broker storage fills',
        'The subscription expires after 30 days and its messages are dropped',
        'Its messages are shared out to the other subscribers of the topic',
      ],
      answer: 1,
      explain: 'The broker keeps messages for a durable subscription until they are consumed or expire. An abandoned one grows until someone unsubscribes it.',
    },
    {
      type: 'single',
      prompt: 'On ActiveMQ Classic, finance runs two replicas. It must get every booking change, even during a redeploy, and handle each change once. What fits?',
      options: [
        'A durable subscription with the same client ID on both replicas',
        'A virtual topic, with both replicas reading the finance consumer queue',
        'A non durable subscription on each replica, with a duplicate check',
        'A durable subscription on each replica, each with its own client ID',
      ],
      answer: 1,
      explain: 'With virtual topics, each consumer group gets a queue fed from the topic. Replicas of one app share that queue, and the queue keeps messages while they are offline. One client ID cannot be used by two connections at once. Non durable subscriptions lose what is published during the redeploy. One durable subscription per replica gives each replica every message, so each change is handled twice.',
    },
    {
      type: 'match',
      prompt: 'Match each need to the fan out choice.',
      pairs: [
        ['Anypoint MQ, three systems each need every event', 'An exchange with one bound queue per system'],
        ['ActiveMQ Classic, two replicas of one consumer must share the work', 'A virtual topic with one consumer queue per app'],
        ['A JMS 2.0 broker, replicas share one durable subscription', 'A shared durable subscription'],
        ['A dashboard that only needs live events', 'A non durable topic subscription'],
      ],
      explain: 'Pick by whether missed messages matter and whether several replicas must share the load.',
    },
    {
      type: 'single',
      prompt: 'An Anypoint MQ exchange has a queue bound for the loyalty system. The loyalty app is down for a day. What happens?',
      options: [
        'Its messages are lost, as an exchange keeps nothing for a stopped app',
        'Messages wait in its queue until it is back',
        'The exchange holds the messages and resends them when the app returns',
        'Its messages go to the queues bound for the other systems instead',
      ],
      answer: 1,
      explain: 'Each bound queue stores its own copy, within that queue\'s TTL, and the app reads it when it comes back. Set the queue TTL with outages in mind, or long outages can expire messages.',
    },
  ],
  description: `
Saltmarsh Travel publishes booking changes. Four systems need every change: ticketing, the customer app, finance and a live dashboard. Some run on Anypoint MQ and some on an ActiveMQ Classic broker. Last month finance missed two hours of changes during a redeploy, and nobody noticed for a week.

**Questions**
1. Why can a topic subscriber miss messages, and what does a durable subscription change?
2. What goes wrong with durable subscriptions when apps have several replicas?
3. What do Anypoint MQ exchanges and ActiveMQ virtual topics offer instead?
4. Which choice fits each of the four systems?
`,
  answerTemplate: `## Missed messages

## Replicas and client IDs

## Exchanges and virtual topics

## Choices per system
`,
  keyPoints: [
    'A non durable subscriber gets nothing published while it is offline.',
    'A durable subscription keeps messages, identified in JMS 1.1 by client ID and subscription name.',
    'A client ID allows one connection at a time, which clashes with replicas.',
    'JMS 2.0 shared durable subscriptions or ActiveMQ virtual topics let replicas share the load.',
    'Anypoint MQ exchanges copy each message into a queue per consumer.',
    'Abandoned durable subscriptions and long queue TTLs need housekeeping.',
  ],
  solution: `
**1. Missed messages.** A topic only delivers to subscribers that are there. With a non durable subscription, finance's redeploy left a gap, and the broker kept nothing for it. A durable subscription asks the broker to store messages for that subscriber while it is away.

**2. Replicas.** In JMS 1.1 a durable subscription is tied to a client ID and a subscription name, and a client ID can be used by one connection at a time. With two replicas, the second fails to connect or the team gives each its own ID, which makes two subscriptions and doubles the work. JMS 2.0 shared durable subscriptions let several consumers share one subscription, if the broker and connector support it.

**3. Exchanges and virtual topics.** Anypoint MQ exchanges copy each message into one queue per bound system. Each queue stores messages while its consumer is down, and replicas share the queue. ActiveMQ Classic virtual topics give the same shape: producers send to a virtual topic, and each consumer group reads its own queue fed from it. Both turn fan out into ordinary queues, with redelivery and DLQs.

**4. Per system.** Ticketing, customer app and finance must not miss changes, so each gets its own queue: a bound queue on Anypoint MQ, or a virtual topic consumer queue on ActiveMQ. The live dashboard only cares about now, so a non durable subscription is fine. Add a monitor on queue depth and age, so a stalled consumer is noticed in hours, not a week.
`,
  followUps: [
    {
      q: 'How do you clean up a durable subscription for a retired app?',
      a: 'Unsubscribe it, through the JMS API or the broker admin tools, as part of the decommission checklist. Otherwise its stored messages keep growing.',
    },
    {
      q: 'Why does a queue per consumer help with dead letters?',
      a: 'Each consumer gets its own redelivery count and DLQ. A failure in finance then does not affect ticketing, and support sees which system failed.',
    },
    {
      q: 'What alert would have caught the finance gap?',
      a: 'An alert on the age of the oldest message, or on no messages consumed for a set time while producers are active. Error counts alone stay at zero when nothing arrives.',
    },
  ],
}

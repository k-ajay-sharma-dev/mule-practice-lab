export default {
  id: 'ms-241',
  category: 'mulesoft',
  title: 'Anypoint MQ Building Blocks: Queues, Exchanges, Client Apps and the Connector Operations',
  level: 'BEGINNER',
  tags: ['myproject', 'queues', 'anypoint-mq', 'exchanges', 'fundamentals', 'messaging', 'retail'],
  estMinutes: 12,
  quiz: [
    {
      type: 'single',
      prompt: 'An Anypoint MQ message exchange has three queues bound to it. A producer publishes one message to the exchange. What happens?',
      options: [
        'One of the three queues gets the message, in turn',
        'Each bound queue gets its own copy of the message',
        'The message waits on the exchange until a consumer reads it',
        'The publish fails, because messages can only go to queues',
      ],
      answer: 1,
      explain: 'An exchange fans out. Every bound queue receives a copy, and each consumer reads from its own queue.',
    },
    {
      type: 'single',
      prompt: 'Can a Mule flow consume directly from an Anypoint MQ exchange?',
      options: [
        'Yes, with the Subscriber source',
        'Yes, with the Consume operation',
        'No. Consumers read from the queues bound to the exchange.',
        'Only when the exchange has one queue',
      ],
      answer: 2,
      explain: 'An exchange does not store messages. Messages wait in the bound queues, and consumers read those queues.',
    },
    {
      type: 'match',
      prompt: 'Match each Anypoint MQ connector element to what it does.',
      pairs: [
        ['Publish', 'Sends a message to a queue or an exchange'],
        ['Subscriber', 'A source that starts the flow for each message that arrives'],
        ['Consume', 'Reads a message at a chosen point inside a flow'],
        ['Ack', 'Tells the broker the message is done and can be removed'],
        ['Nack', 'Gives the message back so it can be delivered again'],
      ],
      explain: 'Subscriber is the usual way to start a flow from a queue. Consume suits a flow that needs a message in the middle, for example after a scheduler fires.',
    },
    {
      type: 'single',
      prompt: 'How does a Mule app prove who it is to Anypoint MQ?',
      options: [
        'With the Anypoint Platform user name and password of a developer',
        'With the client ID and client secret of an MQ client app created for that environment',
        'With a certificate uploaded to Exchange',
        'No credentials are needed inside the same organization',
      ],
      answer: 1,
      explain: 'Client apps are created in Anypoint MQ per environment. Each has a client ID and secret, which should live in secure properties, not in plain text.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about standard and FIFO queues in Anypoint MQ are true?',
      options: [
        'A FIFO queue keeps messages in the order they were sent',
        'A standard queue does not promise order',
        'A standard queue can deliver the same message more than once',
        'A FIFO queue is always faster than a standard queue',
      ],
      answer: [0, 1, 2],
      explain: 'Standard queues aim for throughput and deliver at least once, without an order promise. FIFO queues keep order, which costs throughput.',
    },
    {
      type: 'single',
      prompt: 'A team creates its queues in one region and its Mule app connects to the URL of another region. What happens?',
      options: [
        'The broker copies the queues across',
        'The app does not find the queues, because queues live in the region where they were created',
        'Messages are routed between regions automatically',
        'Only the first message is lost',
      ],
      answer: 1,
      explain: 'Each region has its own endpoint and its own queues. The connector URL must point to the region that holds the queues.',
    },
  ],
  description: `
Tamsin Home Retail is moving order events from point to point HTTP calls to Anypoint MQ. Three systems need each order event: the warehouse, the loyalty system and the data warehouse. A junior developer asks how the pieces fit together.

**Questions**
1. What are queues, exchanges and bindings, and how would you use them here?
2. How does a Mule app connect to Anypoint MQ?
3. Which connector operations would you use, and where?
4. Standard or FIFO for these queues?
`,
  answerTemplate: `## Queues, exchanges and bindings

## Connecting

## Connector operations

## Standard or FIFO
`,
  keyPoints: [
    'A queue stores messages until a consumer acknowledges them.',
    'An exchange fans out a copy of each message to every bound queue.',
    'Consumers read from queues, never from an exchange.',
    'Apps connect with an MQ client app ID and secret per environment, kept in secure properties.',
    'The Subscriber source starts a flow per message. Consume reads inside a flow. Ack and Nack settle a message.',
    'Standard queues trade order for throughput. FIFO queues keep order.',
  ],
  solution: `
**1. Queues, exchanges and bindings.** A queue holds messages until a consumer acknowledges them. An exchange is a publish point with no storage of its own. When a queue is bound to an exchange, every message published to the exchange is copied to that queue. Here, the order app publishes once to an \`order-events\` exchange, and three queues are bound to it: \`warehouse-orders\`, \`loyalty-orders\` and \`dw-orders\`. Each system reads its own queue at its own pace, and a slow data warehouse does not hold up the warehouse.

**2. Connecting.** In Anypoint MQ you create a client app for the environment. It has a client ID and a client secret. The connector configuration uses those, plus the URL of the region where the queues live. Keep the secret in secure properties.

**3. Operations.** The order app uses **Publish** to the exchange. Each consumer app uses the **Subscriber** source, which starts the flow for each message. With manual acknowledgement, the flow calls **Ack** when the work is done and **Nack** to hand a message back. **Consume** is for reading one message at a point in a flow, not for a long running listener.

**4. Standard or FIFO.** Standard queues give more throughput and deliver at least once, without an order promise. If each consumer can cope with order changes, for example by checking a status timestamp, standard queues fit. Use FIFO only where order truly matters, and accept lower throughput.
`,
  followUps: [
    {
      q: 'A fourth system needs the order events next month. What changes in the order app?',
      a: 'Nothing. Create a new queue, bind it to the exchange, and build the new consumer. The publisher does not know how many queues are bound.',
    },
    {
      q: 'Why not let all three systems read from one shared queue?',
      a: 'Each message would go to only one of them. A queue gives each message to one consumer, so fan out needs a queue per system.',
    },
    {
      q: 'Where would you keep the MQ client secret?',
      a: 'In an encrypted secure properties file or a secrets manager, with a separate client app per environment. A leaked secret then exposes only that environment.',
    },
  ],
}

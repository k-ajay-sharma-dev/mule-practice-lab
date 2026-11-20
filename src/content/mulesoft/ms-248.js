export default {
  id: 'ms-248',
  category: 'mulesoft',
  title: 'Keeping Outbound Master Data in Order: FIFO Queues, JMSXGroupID Message Groups and Single Consumers',
  level: 'ADVANCED',
  tags: ['myproject', 'queues', 'ordering', 'fifo', 'message-groups', 'activemq', 'anypoint-mq', 'sbdh', 'product-data-hub'],
  estMinutes: 22,
  quiz: [
    {
      type: 'multi',
      prompt: 'Which of these can change the order in which messages are processed?',
      options: [
        'Several consumers, or a listener with more than one concurrent thread',
        'A failed message that is redelivered after later messages were handled',
        'One consumer on one thread reading a queue fed by one producer',
        'The producer sending from several threads at once',
      ],
      answer: [0, 1, 3],
      explain: 'Order holds only from one ordered producer, through the queue, to one consumer at a time. Parallel work and retries both mix it.',
    },
    {
      type: 'single',
      prompt: 'On ActiveMQ, what does setting the JMSXGroupID property do?',
      options: [
        'Encrypts messages that share the group id',
        'Sends one group to one consumer, in order',
        'Merges the messages of a group into one',
        'Raises the priority of the whole group',
      ],
      answer: 1,
      explain: 'The broker sends all messages with the same group id to the same consumer, in order. Message groups keep order per group while different groups spread across consumers. ActiveMQ supports this through JMSXGroupID.',
    },
    {
      type: 'single',
      prompt: 'In a Mule JMS listener, which settings keep strict order on one app instance?',
      options: [
        'Several consumers and a high maxConcurrency',
        'One consumer and maxConcurrency set to 1 on the flow',
        'Any settings, order is guaranteed by JMS',
        'An Async scope around the processing',
      ],
      answer: 1,
      explain: 'More consumers or threads process messages in parallel. An Async scope also hands work to other threads and breaks order.',
    },
    {
      type: 'single',
      prompt: 'What does an Anypoint MQ FIFO queue give, and what does it cost?',
      options: [
        'Strict order, at lower throughput than standard',
        'Strict order with no throughput cost',
        'Order only for messages under 10 KB',
        'Order per message group id only',
      ],
      answer: 0,
      explain: 'FIFO queues keep the order messages were sent in. They handle fewer messages per second than standard queues, so check the limits for your needs.',
    },
    {
      type: 'single',
      prompt: 'Item master updates go out as SBDH wrapped GS1 style XML. Which order matters most to the planning platform?',
      options: [
        'Order across all items in the catalogue',
        'Order per item, so old updates never win',
        'Order by when the platform reads them',
        'Order per item category, such as tools',
      ],
      answer: 1,
      explain: 'An older update must never overwrite a newer one for the same item. Updates to different items do not depend on each other. Keeping order per item is enough and allows parallel work across items.',
    },
    {
      type: 'match',
      prompt: 'Match each situation to the best ordering approach.',
      pairs: [
        ['ActiveMQ, thousands of items, order per item', 'Message groups keyed by item id'],
        ['Anypoint MQ, low volume, strict order of everything', 'A FIFO queue with one consumer'],
        ['A receiver that can reject stale updates by version', 'Standard queue plus a version check at the receiver'],
        ['One small queue that must stay in order on one app', 'One consumer and maxConcurrency 1'],
      ],
      explain: 'Order per key scales better than order for everything. A version check at the receiver is the strongest guard, since it works even when order breaks.',
    },
  ],
  description: `
Kestrel Home Supply runs a product data hub. Item master changes land in Oracle staging tables. A flow reads them, builds GS1 style XML wrapped in a Standard Business Document Header (SBDH), translating codes through a code map, and publishes one message per item change to an ActiveMQ queue for a supply chain planning platform.

The planning team reports that some items show an old pack size. The logs show two updates for the same item, sent 3 seconds apart, processed in reverse order by two consumers.

**Questions**
1. What breaks message order?
2. How do you keep order per item without losing parallel work?
3. What do FIFO queues and single consumers offer, and at what cost?
4. What can the sender and receiver add as a safety net?
`,
  answerTemplate: `## What breaks order

## Order per item

## FIFO and single consumers

## Safety net
`,
  keyPoints: [
    'Order holds only from one ordered producer to one consumer at a time.',
    'Parallel consumers, extra threads, Async scopes and redelivery all mix order.',
    'ActiveMQ message groups with JMSXGroupID keep order per key across consumers.',
    'FIFO queues and single consumers keep strict order at lower throughput.',
    'Order per item is enough, since items do not depend on each other.',
    'A version or timestamp in the message lets the receiver reject stale updates.',
  ],
  solution: `
**1. What breaks order.** The outbound queue had two consumers on the receiving side, so update 1 and update 2 for one item ran at the same time and the slower one finished last. Order also breaks when a failed message is redelivered after later ones, when the producer publishes from several threads, or when an Async scope hands work to other threads.

**2. Order per item.** Only messages for the same item need order. On ActiveMQ, set \`JMSXGroupID\` to the item id when publishing. The broker then sends all messages of that group to one consumer in order, while other items spread across consumers. On the sending side, read staging rows ordered by change time per item and publish them in that order.

**3. FIFO and single consumers.** An Anypoint MQ FIFO queue, or one consumer with \`maxConcurrency\` 1 on a JMS listener, keeps strict order for everything. That is simple to reason about but caps throughput at one message at a time, and one slow or failing message holds up all the rest.

**4. Safety net.** Put a version or a change timestamp in the business document and in the SBDH \`CreationDateAndTime\`. A receiver that keeps the last version per item can ignore an older update that arrives late. That guard works even when the transport order breaks, which it eventually will. Tell the planning team so they apply it.
`,
  followUps: [
    {
      q: 'A message in one group keeps failing. What happens to the rest of that group?',
      a: 'They wait behind it, since the group must stay in order. Move the failing message to a dead letter queue after a limit, and decide whether later updates for that item may go on.',
    },
    {
      q: 'Why not use one consumer for the whole queue to be safe?',
      a: 'It works at low volume, but a big catalogue change then takes hours, and one bad message stops every item. Order per item keeps the safety with far more throughput.',
    },
    {
      q: 'Where does the item id for the group come from?',
      a: 'From the staging row, set as a JMS property when the message is published. The broker reads the property and does not need to parse the XML.',
    },
  ],
}

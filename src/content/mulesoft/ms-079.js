export default {
  id: 'ms-079',
  category: 'mulesoft',
  title: 'Kafka, Amazon SQS or JMS? Ordering, Consumer Groups, Visibility Timeouts and Dead Letters',
  level: 'ADVANCED',
  tags: ['kafka', 'sqs', 'jms', 'messaging', 'ordering', 'dlq', 'event-driven'],
  estMinutes: 35,
  quiz: [
    {
      type: 'single',
      prompt: 'Order status events must be processed in order **per order**, across a topic with 12 partitions. How should the Mule app publish them with the Kafka connector?',
      options: [
        'kafka:publish with key = orderId, so all events of an order go to the same partition and keep their order',
        'kafka:publish without a key, so events spread evenly',
        'Use a topic with one partition per order',
        'Publish with a random key and sort the events in the consumer',
      ],
      answer: 0,
      explain: 'Kafka only guarantees order within a partition. The same key always maps to the same partition, so keying by orderId gives per-order ordering while different orders still run in parallel.',
    },
    {
      type: 'single',
      prompt: 'A topic has 6 partitions. The consumer app (one consumer group id) is scaled to 10 replicas. What happens?',
      options: [
        'Only 6 consumers get partitions; 4 sit idle, because a partition is consumed by at most one consumer in a group',
        'Every replica receives every message',
        'Throughput increases by 10/6',
        'Kafka splits partitions automatically to 10',
      ],
      answer: 0,
      explain: 'Partitions are the unit of parallelism in a consumer group. Scale partitions (planned with keys in mind) to scale consumers. A different group id would receive its own full copy of the stream.',
    },
    {
      type: 'single',
      prompt: 'An SQS consumer takes up to 90 s to process a message, but the queue\'s visibility timeout is 30 s. What do you see?',
      options: [
        'The message becomes visible again while still being processed and another consumer processes it too — duplicates',
        'SQS waits for the first consumer automatically',
        'The message is deleted after 30 s',
        'The message moves to the DLQ immediately',
      ],
      answer: 0,
      explain: 'Receiving a message only hides it for the visibility timeout; it must be deleted (acknowledged) before that ends. Set the timeout above the worst-case processing time and make processing idempotent.',
    },
    {
      type: 'match',
      prompt: 'Match each requirement to the best fit.',
      pairs: [
        ['Replay the last 7 days of events into a new analytics consumer', 'Kafka topic with retention, new consumer group'],
        ['AWS-hosted job queue with at-least-once delivery and a redrive policy to a DLQ', 'Amazon SQS standard queue'],
        ['Strict order per customer and deduplication on AWS', 'Amazon SQS FIFO queue with MessageGroupId and deduplication id'],
        ['Existing IBM MQ / ActiveMQ estate with transactional consumers', 'JMS connector'],
      ],
      explain: 'Kafka is a retained log you can replay; SQS is a managed queue (FIFO adds group ordering and deduplication); JMS is the standard API for traditional enterprise brokers.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about Amazon SQS FIFO queues are correct?',
      options: [
        'Ordering is guaranteed within a MessageGroupId, so a group id per customer allows parallelism across customers',
        'A deduplication id (or content-based deduplication) lets SQS drop duplicates sent within the deduplication window',
        'One slow or failing message in a group holds back the later messages of that group',
        'FIFO queues guarantee global ordering across all message group ids',
      ],
      answer: [0, 1, 2],
      explain: 'FIFO orders per message group. That is also why one poison message in a group blocks its group until it is processed or moved to the DLQ.',
    },
    {
      type: 'single',
      prompt: 'A Kafka consumer keeps failing on one malformed event and the partition stops progressing. What is the standard remedy?',
      options: [
        'Catch the error, publish the event with its error details to a dead-letter topic, and continue so the offset advances',
        'Restart the app until the event disappears',
        'Delete the topic',
        'Increase the number of partitions',
      ],
      answer: 0,
      explain: 'Kafka has no broker-side DLQ like SQS redrive; the consumer must park poison events (dead-letter topic) and alert, otherwise one event blocks its partition.',
    },
  ],
  description: `
A retailer is building an event-driven order platform and already uses Anypoint MQ. New requirements:
- **Order events** (created, paid, shipped, returned): 3 million per day, consumed by 5 teams, must be **replayable** for new consumers and analytics.
- **Warehouse pick jobs** in AWS: a queue per warehouse, consumers on EC2 and Mule, failed jobs must go to a dead-letter queue.
- **Customer account changes** must be applied **in order per customer** in AWS.
- The finance mainframe team only offers **IBM MQ**.

Problems seen in the pilot:
- Order events for the same order were processed out of order.
- Scaling the Kafka consumer from 6 to 10 replicas did not increase throughput.
- Pick jobs that take 90 seconds were picked twice.
- One malformed event stopped a Kafka consumer.

**Questions**
1. Which technology fits each requirement, and why?
2. Explain ordering and scaling in Kafka (partitions, keys, consumer groups).
3. Explain SQS standard vs FIFO, visibility timeout and DLQs.
4. Fix each pilot problem.
`,
  answerTemplate: `## Technology per requirement

## Kafka ordering and scaling

## SQS behaviour

## Fixes for the pilot
`,
  keyPoints: [
    'Kafka: a retained, partitioned log; order only within a partition; same key → same partition.',
    'Consumer groups: each partition goes to one consumer in the group; more consumers than partitions leaves some idle; another group id gets its own copy.',
    'SQS standard: at-least-once, best-effort order; FIFO: order per MessageGroupId and deduplication id within the deduplication window.',
    'Visibility timeout must exceed processing time; in Mule turn on Preserve Messages and delete only after success; redrive policy (maxReceiveCount) moves repeated failures to a DLQ.',
    'Kafka poison events must be parked by the consumer (dead-letter topic), or the partition stalls.',
    'JMS fits existing enterprise brokers such as IBM MQ and ActiveMQ.',
  ],
  solution: `
**1. Technology per requirement.**
- Order events → **Kafka**: high volume, many independent consumers (one consumer group each) and replay through retention.
- Pick jobs → **SQS standard** queue per warehouse with a **redrive policy** to a DLQ: simple work queue, AWS-native consumers.
- Customer account changes → **SQS FIFO** with \`MessageGroupId = customerId\` and a deduplication id.
- Finance → **JMS** connector to IBM MQ (driver provided as a dependency).

**2. Kafka ordering and scaling.** Ordering exists only within a partition. Publish with \`kafka:publish\` and **key = orderId** so all events of an order share a partition. Each partition is assigned to one consumer of a group, so 6 partitions cap a group at 6 active consumers — scale by planning more partitions (keyed so per-key order survives), not just replicas.

**3. SQS.** A received message is hidden for the **visibility timeout**; it must be deleted after successful processing or it reappears. In Mule, the Receive Messages source deletes each message as soon as it is read unless **Preserve Messages** is on, so for at-least-once processing turn it on and call **Delete Message** after success. After \`maxReceiveCount\` receives without deletion, the redrive policy moves it to the DLQ. Standard queues can deliver duplicates and out of order; FIFO orders per message group and deduplicates within the deduplication window.

**4. Fixes.**
- Out of order → key by orderId; process sequentially per partition.
- No throughput gain → increase partitions (consumer parallelism = partitions), or speed up per-message processing.
- Double picks → visibility timeout above worst-case processing (e.g. 180 s), delete after success, idempotent pick creation keyed by job id.
- Poison event → catch, publish to \`orders.events.dlt\` with error details, continue; alert and replay after fixing.
`,
  followUps: [
    {
      q: 'Is Kafka exactly-once with Mule?',
      a: 'Treat it as at-least-once: a crash between processing and committing the offset causes redelivery. Make consumers idempotent (business keys, upserts) rather than relying on exactly-once settings.',
    },
    {
      q: 'Why not use Anypoint MQ for everything?',
      a: 'Anypoint MQ is a good managed queue/exchange for Mule apps, but it is not a replayable log for many consumers, and AWS-native consumers or an IBM MQ estate are better served by SQS and JMS respectively.',
    },
    {
      q: 'How do you choose the number of Kafka partitions?',
      a: 'From the target throughput divided by what one consumer can handle, plus growth. Adding partitions later changes the key-to-partition mapping, which can briefly break per-key ordering, so plan ahead.',
    },
  ],
}

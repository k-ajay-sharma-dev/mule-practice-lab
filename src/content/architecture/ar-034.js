export default {
  id: 'ar-034',
  category: 'architecture',
  title: 'Choosing a Broker: Anypoint MQ, Kafka or JMS',
  level: 'INTERMEDIATE',
  tags: ['anypoint-mq', 'kafka', 'jms', 'messaging', 'broker-selection'],
  estMinutes: 25,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each use case to the broker that fits it.',
      pairs: [
        ['A. Shipment status updates between Mule apps (~20 msg/s, DLQ, small team)', 'Anypoint MQ'],
        ['B. Vehicle telemetry (20,000 msg/s, several consumer teams, 7-day replay)', 'Managed Kafka'],
        ['C. Warehouse vendor already on on-prem IBM MQ', 'IBM MQ via the JMS / IBM MQ connector'],
      ],
      explain: 'A managed queue service suits moderate app-to-app messaging; a log-based platform suits high volume with replay; existing JMS infrastructure stays where a vendor already uses it.',
    },
    {
      type: 'single',
      prompt: 'Can Anypoint MQ replay last week\'s telemetry for a new consumer team?',
      options: [
        'Yes, it keeps all messages for 7 days by default',
        'No: a consumed and acknowledged message is gone; replay needs a log-based platform or a separate event store',
        'Yes, through the DLQ',
        'Only with FIFO queues',
      ],
      answer: 1,
      explain: 'Queues delete messages on acknowledgement. Kafka retains the log and lets each consumer group track its own offset.',
    },
    {
      type: 'single',
      prompt: 'How do you keep ordering per vehicle in Kafka while scaling consumers?',
      options: [
        'Use a single partition for all vehicles',
        'Use vehicleId as the message key so all its events land in one partition; each partition is consumed by one consumer in the group at a time',
        'Sort messages by timestamp in every consumer',
        'Ordering is impossible in Kafka',
      ],
      answer: 1,
      explain: 'Kafka orders within a partition. Keying by vehicleId gives per-vehicle order while partitions spread the load.',
    },
    {
      type: 'multi',
      prompt: 'Which criteria do you compare when choosing a broker?',
      options: [
        'Delivery model: queue vs log',
        'Throughput, retention and replay',
        'Ordering guarantees and fan-out (exchanges, topics, consumer groups)',
        'Operations effort (managed vs self-run), skills and cost',
        'Using the same broker everywhere, whatever the workload',
      ],
      answer: [0, 1, 2, 3],
      explain: 'The criteria are about the workload and the team that runs it, documented so the choice is repeatable.',
    },
    {
      type: 'single',
      prompt: 'The legacy warehouse design used XA between IBM MQ and Oracle. What is the recommended stance?',
      options: [
        'Replace IBM MQ with Anypoint MQ and keep XA',
        'Check whether XA is really needed; prefer local transactions plus idempotent processing, while knowing Mule 4 supports XA with compatible connectors if required',
        'XA is mandatory for every Mule integration',
        'Mule 4 cannot connect to IBM MQ',
      ],
      answer: 1,
      explain: 'XA adds complexity and coupling. Idempotent processing often gives the same safety; XA stays available for genuinely transactional cases.',
    },
    {
      type: 'single',
      prompt: 'How do you answer the CIO\'s "one messaging technology for everything"?',
      options: [
        'Agree and run Kafka for all three use cases',
        'Agree and force the warehouse vendor onto Anypoint MQ',
        'Propose a governed short list with documented selection criteria (Anypoint MQ default, Kafka for streaming/replay, existing JMS for legacy), recorded in an ADR',
        'Let every team choose freely',
      ],
      answer: 2,
      explain: 'One tool for everything either adds operational overhead (Kafka for A), lacks features (MQ for B) or forces a vendor change (C). Mule connectors keep the integration skillset common.',
    },
  ],
  description: `
A logistics group is standardising messaging for its integration platform. Three use cases are on the table:

| Use case | Characteristics |
|---|---|
| A. Shipment status updates between Mule apps | ~20 msg/s, needs DLQ and retries, small team, all apps on CloudHub 2.0 |
| B. Vehicle telemetry for analytics | 20,000 msg/s, several consumer teams, need to **replay** the last 7 days, ordering per vehicle |
| C. Warehouse system integration | Existing on-prem **IBM MQ** used by the warehouse vendor; XA transactions with an Oracle DB in the legacy design |

Constraints:
- The platform team has no Kafka operations experience, but a managed Kafka service is available in the cloud provider account.
- The CIO wants "one messaging technology for everything".

**Questions:**
- Which broker fits each use case and why?
- How do you answer the "one technology for everything" request?
- What Mule 4 connectors/features would you use for each?
- Which characteristics do you compare when choosing a broker?
`,
  answerTemplate: `## Evaluation criteria

## Choice per use case

## Mule implementation

## Response to "one technology"
`,
  keyPoints: [
    'Compare brokers on delivery model (queue vs log), throughput, retention and replay, ordering guarantees, consumer groups, operations effort, protocol/connectivity and cost.',
    'Anypoint MQ is a managed queue/exchange service with DLQs and redelivery, suited to moderate-volume app-to-app messaging with minimal operations.',
    'Kafka is a distributed log: high throughput, retention-based replay, ordering per partition key and independent consumer groups — at the cost of more operational and design complexity.',
    'JMS brokers such as IBM MQ or ActiveMQ remain the right choice where existing systems already use them or transactional semantics with those systems are needed; Mule connects with the JMS/IBM MQ connectors.',
    'One technology for everything is less important than a small, governed set of options with clear selection criteria.',
  ],
  solution: `
**Evaluation criteria.** Queue (message removed when consumed) vs log (retained, consumers track offsets); throughput; retention and replay; ordering (FIFO queues vs per-partition ordering); fan-out (exchanges/topics/consumer groups); delivery guarantees and transactions; operations (managed vs self-run); connectivity (who else must connect); cost and skills.

**Choice per use case.**
- **A — Anypoint MQ.** Managed, integrated with Anypoint Platform, supports queues, exchanges for fan-out, **dead-letter queues** with a max-delivery setting, and FIFO queues when ordering matters. 20 msg/s is comfortably in range and the small team avoids running brokers.
- **B — Kafka (managed service).** 20k msg/s, multiple independent consumer teams, 7-day replay and ordering per vehicle (partition key = vehicleId) are exactly what a log-based platform is built for. Use the provider's managed Kafka to reduce operational risk; invest in skills.
- **C — IBM MQ via JMS/IBM MQ connector.** The vendor already uses it; do not introduce a bridge for the sake of uniformity. If XA was used in the legacy design, check whether it is really needed — prefer local transactions plus idempotent processing; Mule 4 does support XA with compatible connectors if truly required.

**Mule implementation.**
- A: Anypoint MQ connector — subscriber with manual ack/nack, DLQ configured on the queue, idempotent consumer.
- B: Apache Kafka connector — consumer group per consuming app, commit offsets after processing, key by vehicleId. Heavy analytics consumers might read Kafka directly rather than through Mule.
- C: IBM MQ connector (or generic JMS connector with the IBM client), transacted consume where needed.

**"One technology for everything."** Explain the trade-off: Kafka for use case A adds operational overhead; Anypoint MQ for B lacks the log/replay model; replacing IBM MQ for C forces a vendor change. Propose a **governed short list** (e.g. Anypoint MQ default for app integration, Kafka for high-volume streaming/replay, existing JMS only for legacy) with selection criteria documented in an ADR. Mule abstracts much of the difference behind connectors, so the integration skillset stays common.
`,
  followUps: [
    { q: 'Can Anypoint MQ replay messages from last week?', a: 'Not in the Kafka sense; a consumed and acknowledged message is gone. Messages remain only until acknowledged or their TTL expires. If replay is a requirement, use a log-based platform or store events separately.' },
    { q: 'How do you guarantee ordering per vehicle in Kafka while scaling consumers?', a: 'Use vehicleId as the message key so all its events land in the same partition; within a consumer group each partition is consumed by one consumer at a time, preserving order per key while partitions scale out.' },
  ],
}

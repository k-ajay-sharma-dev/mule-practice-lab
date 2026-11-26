export default {
  id: 'ms-039',
  category: 'mulesoft',
  title: 'Choosing Asynchronous Messaging: VM vs Anypoint MQ vs JMS vs Object Store',
  level: 'ADVANCED',
  tags: ['myproject', 'anypoint-mq', 'vm-connector', 'jms', 'object-store', 'architecture'],
  estMinutes: 25,
  quiz: [
    {
      type: 'match',
      needsScenario: true,
      prompt: 'Match each requirement of the order pipeline to the best mechanism.',
      pairs: [
        ['R1: buffer work between two flows inside the Order API', 'VM queue'],
        ['R2: Warehouse, Invoicing and Analytics each receive every order', 'Anypoint MQ exchange with bound queues'],
        ['R3: per-customer events processed in order', 'Anypoint MQ FIFO queue'],
        ['R5: remember processed webhook IDs for 7 days', 'Object Store v2 with TTL'],
        ['R6: on-premises system that only speaks IBM MQ', 'JMS connector'],
      ],
      explain: 'VM stays inside one app; an exchange fans out to every bound queue; FIFO preserves order; Object Store is key-value with expiry; JMS integrates an existing broker.',
    },
    {
      type: 'multi',
      prompt: 'An architect proposes using Object Store as a queue for all messaging between Mule apps, because it is already included. Which three reasons make it a poor queue?',
      options: [
        'It has no consumer or listener model',
        'It has no acknowledgement, redelivery or DLQ',
        'Polling it with a Scheduler causes races between replicas',
        'Entries stay until a flow deletes them, so old messages pile up',
        'Values are found by scanning the store, so reads slow as it grows',
      ],
      answer: [0, 1, 2],
      explain: 'Object Store has no listener, so consumers must poll it, and it has no ack, redelivery or DLQ. Polling from several replicas races for the same entries. It **does** support TTL, so entries can expire, and it reads a value directly by its key, which is why it suits remembering processed event IDs. It also has no ordering. It is a store, not a messaging system.',
    },
    {
      type: 'match',
      prompt: 'Match each Anypoint MQ subscriber acknowledgement mode to its behaviour.',
      pairs: [
        ['AUTO', 'Ack when the flow completes successfully, nack on error'],
        ['IMMEDIATE', 'Ack on receipt: fastest, can lose work'],
        ['MANUAL', 'You call ack/nack explicitly'],
      ],
      explain: 'Unacknowledged messages become visible again after the acknowledgement timeout.',
    },
    {
      type: 'single',
      prompt: 'A consumer on an Anypoint MQ **standard** queue creates invoices in the ERP with AUTO ack. Ops find two invoices for one order, and no error was logged. What is the right fix?',
      options: [
        'Switch the subscriber to IMMEDIATE ack, so the message leaves the queue on receipt',
        'Run the consumer on one replica, so two replicas do not read the same message',
        'Check the order ID against a store of processed IDs before the ERP call',
        'Move to a FIFO queue, which the docs describe as exactly-once delivery',
      ],
      answer: 2,
      explain: 'Standard queues are documented as at-least-once, and duplicates can occasionally occur, so use a unique business key or a store of processed IDs. IMMEDIATE ack trades duplicates for lost work, and one replica still gets the occasional duplicate. FIFO queues are documented as exactly-once, but a consumer that crashes after the side effect and before the ack still sees the message again once the acknowledgement timeout passes. So keep consumers idempotent there too.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'How do you meet R4 (park failed messages after N attempts) with Anypoint MQ?',
      options: [
        'Catch the error and write the message into Object Store',
        'Set a DLQ and a maximum delivery count on the queue',
        'Use IMMEDIATE ack, and publish failed messages again from the handler',
        'Use MANUAL ack and nack failures, so the message stays on the queue for Ops',
      ],
      answer: 1,
      explain: 'Queue-level max deliveries route poison messages to the DLQ automatically, from where they can be replayed. Ops move messages back after fixing the cause, and alert on DLQ depth. Object Store has no redelivery or replay, so Ops would need a custom tool. IMMEDIATE ack removes the message before the work runs, so a crash in the handler loses it. A nack returns the message for redelivery, so without a DLQ it loops and is never parked.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'You add more consumers to the FIFO queue for R3, but publishers set no message group ID. What happens to throughput?',
      options: [
        'It scales linearly, as each consumer is given its own message group',
        'It barely rises, as one consumer at a time reads the default group',
        'It doubles, but order is then kept per consumer, not per group',
        'Anypoint MQ rejects the extra consumers while no group ID is set',
      ],
      answer: 1,
      explain: 'A message with no group ID goes to the default message group, which only one consumer at a time can access. Set a Message Group ID (e.g. the customer ID) for parallelism. FIFO trades throughput for ordering (300 TPS per queue, up to 3,000 messages per second with batches of 10). Order is kept **within a message group** only, and other groups stay available to other consumers. Groups come from the publisher, not from the consumers, and extra consumers are accepted but sit idle.',
    },
  ],
  description: `
A retailer is redesigning its order pipeline on **CloudHub 2.0**. Requirements:

| # | Need |
|---|---|
| R1 | Inside the Order API, buffer work between the HTTP flow and a slower processing flow |
| R2 | When an order is created, **three** independent apps (Warehouse, Invoicing, Analytics) must each receive it |
| R3 | Per-customer events must be processed **in order** |
| R4 | Failed messages must be parked after N attempts and reprocessed by Ops later |
| R5 | Remember which webhook event IDs were already processed (deduplication) for 7 days |
| R6 | One on-premises legacy system only speaks **IBM MQ** |

An architect proposes "Object Store as a queue for everything: it's already included".

**Questions**
1. Map each requirement to VM, Anypoint MQ, JMS or Object Store and justify.
2. Why is Object Store a poor queue?
3. Explain Anypoint MQ queues vs exchanges, FIFO vs standard queues, and acknowledgement modes.
4. What delivery guarantee do you get, and what must consumers do about it?
5. How do you handle R4 with Anypoint MQ?
`,
  answerTemplate: `## Mapping requirements

## Object Store as a queue

## Anypoint MQ concepts

## Delivery guarantees

## Dead-lettering and reprocessing
`,
  keyPoints: [
    'VM queues are in-application buffers; they do not cross application boundaries (except between apps sharing a domain on-premises), and CloudHub 2.0 does not support persistent VM queues.',
    'Anypoint MQ provides cross-application queues and exchanges (fan-out to bound queues), FIFO queues for ordering, TTL and dead-letter queues.',
    'JMS is the choice when you must integrate with an existing broker (IBM MQ, ActiveMQ) or need XA transactions.',
    'Object Store is a key-value store with TTL: ideal for idempotency, watermarks and caching, not for queuing (no consumers, ordering or ack).',
    'Standard queues give at-least-once delivery (FIFO queues are documented as exactly-once), and an unacknowledged message comes back after the timeout, so consumers must be idempotent; acknowledgement mode (auto, immediate, manual) decides when a message is removed.',
  ],
  solution: `
**Mapping**
| Req | Choice | Reason |
|---|---|---|
| R1 | **VM queue** (CloudHub 2.0 does not support persistent VM queues, so work that must survive a restart needs Anypoint MQ) | same app, cheap, low latency |
| R2 | **Anypoint MQ exchange** with three bound queues | publish once, each consumer app gets its own copy and consumes at its own pace |
| R3 | **Anypoint MQ FIFO queue** with the customer ID as Message Group ID | order kept per customer; lower throughput than standard queues |
| R4 | **Anypoint MQ DLQ** | queue-level max delivery attempts route poison messages to a DLQ |
| R5 | **Object Store v2** with TTL 7 days (or Idempotent Message Validator using it) | key-value lookup with expiry |
| R6 | **JMS connector** to IBM MQ (possibly via a bridge app that republishes to Anypoint MQ) | protocol requirement |

**Why not Object Store as a queue:** it has no consumer/listener model, no ordering, no acknowledgement or redelivery, and no DLQ. Polling it with a Scheduler creates race conditions between replicas and extra API calls. It is a store, not a messaging system.

**Anypoint MQ concepts**
- **Queue**: point-to-point; each message is processed by one consumer.
- **Message exchange**: publish once; delivered to every queue bound to it (pub/sub fan-out).
- **Standard vs FIFO**: standard queues favour throughput and do not guarantee strict order; FIFO queues preserve order within a message group, with lower throughput. A message with no group ID goes to a default group, and only one consumer at a time can access a group.
- **Ack modes** on the subscriber: \`AUTO\` (ack when the flow completes successfully, nack on error), \`IMMEDIATE\` (ack on receipt: fastest, can lose work), \`MANUAL\` (you call ack/nack explicitly). Unacknowledged messages become visible again after the acknowledgement timeout.

**Delivery guarantee:** at-least-once on standard queues; the docs describe FIFO queues as exactly-once. Either way, a crash after the side effect but before the ack means the message comes back after the acknowledgement timeout, so consumers must be **idempotent**: e.g. unique business key in the target DB, or an Object Store of processed IDs (that's where R5's pattern reappears).

**R4 with Anypoint MQ:** configure a DLQ and a maximum delivery count on the queue. After that many failed deliveries the message moves to the DLQ. Ops reprocess by moving messages back from the DLQ (via the Anypoint MQ UI/API or a small replay flow) after fixing the cause. Alert on DLQ depth.
`,
  followUps: [
    {
      q: 'Is there a size limit on Anypoint MQ messages?',
      a: 'Yes, there is a per-message size limit (check current documentation for the exact value). For large payloads use the claim-check pattern: store the content elsewhere and send a reference.',
    },
    {
      q: 'How do you scale consumers without losing order in a FIFO queue?',
      a: 'Use message groups: set a Message Group ID on publish (e.g. the customer ID). Only one consumer at a time can access a group, but other groups stay available to other consumers, so order holds per group while groups run in parallel. Order across groups is not preserved.',
    },
    {
      q: 'When would you choose a Kafka connector instead?',
      a: 'When the organisation already runs Kafka, needs event replay/retention, very high throughput, or stream processing: Anypoint MQ has less to run but is not an event log.',
    },
  ],
}

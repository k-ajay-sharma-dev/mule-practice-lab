export default {
  id: 'ms-039',
  category: 'mulesoft',
  title: 'Choosing Asynchronous Messaging: VM vs Anypoint MQ vs JMS vs Object Store',
  level: 'ADVANCED',
  tags: ['anypoint-mq', 'vm-connector', 'jms', 'object-store', 'architecture'],
  estMinutes: 25,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each requirement of the order pipeline to the best mechanism.',
      pairs: [
        ['R1 — buffer work between two flows inside the Order API', 'VM queue'],
        ['R2 — Warehouse, Invoicing and Analytics each receive every order', 'Anypoint MQ exchange with bound queues'],
        ['R3 — per-customer events processed in order', 'Anypoint MQ FIFO queue'],
        ['R5 — remember processed webhook IDs for 7 days', 'Object Store v2 with TTL'],
        ['R6 — on-premises system that only speaks IBM MQ', 'JMS connector'],
      ],
      explain: 'VM stays inside one app; an exchange fans out to every bound queue; FIFO preserves order; Object Store is key-value with expiry; JMS integrates an existing broker.',
    },
    {
      type: 'multi',
      prompt: 'Why is Object Store a poor queue? (Select all that apply.)',
      options: [
        'No consumer/listener model',
        'No acknowledgement, redelivery or DLQ',
        'Polling it with a Scheduler causes races between replicas',
        'It cannot expire entries',
      ],
      answer: [0, 1, 2],
      explain: 'Object Store **does** support TTL — that is why it suits R5. It is a store, not a messaging system.',
    },
    {
      type: 'match',
      prompt: 'Match each Anypoint MQ subscriber acknowledgement mode to its behaviour.',
      pairs: [
        ['AUTO', 'Ack when the flow completes successfully, nack on error'],
        ['IMMEDIATE', 'Ack on receipt — fastest, can lose work'],
        ['MANUAL', 'You call ack/nack explicitly'],
      ],
      explain: 'Unacknowledged messages become visible again after the acknowledgement timeout.',
    },
    {
      type: 'single',
      prompt: 'What delivery guarantee does an Anypoint MQ **standard** queue give, and what must consumers do?',
      options: [
        'Exactly-once; consumers need nothing special',
        'At-least-once; consumers must be idempotent (e.g. unique business key or a store of processed IDs)',
        'At-most-once; consumers must retry',
        'Exactly-once, as long as the subscriber uses AUTO acknowledgement',
      ],
      answer: 1,
      explain: 'Standard queues are documented as at-least-once, and duplicates can occasionally occur. FIFO queues are documented as exactly-once, but a consumer that crashes after the side effect and before the ack still sees the message again once the acknowledgement timeout passes, so keep consumers idempotent there too.',
    },
    {
      type: 'single',
      prompt: 'How do you meet R4 (park failed messages after N attempts) with Anypoint MQ?',
      options: [
        'Catch the error and write the message to Object Store',
        'Configure a DLQ and a maximum delivery count on the queue; Ops move messages back after fixing the cause and alert on DLQ depth',
        'Use IMMEDIATE ack so failures never repeat',
        'Use an Until Successful scope with infinite retries',
      ],
      answer: 1,
      explain: 'Queue-level max deliveries route poison messages to the DLQ automatically, from where they can be replayed.',
    },
    {
      type: 'single',
      prompt: 'You add more consumers to the FIFO queue for R3, but publishers set no message group ID. What happens to throughput?',
      options: [
        'It scales linearly with consumers',
        'It does not really increase — every message is in the default message group, which only one consumer at a time can access; set a Message Group ID (e.g. the customer ID) for parallelism',
        'Order is lost but throughput doubles',
        'Anypoint MQ rejects the extra consumers',
      ],
      answer: 1,
      explain: 'FIFO trades throughput for ordering (300 TPS per queue, up to 3,000 messages per second with batches of 10). Order is kept **within a message group** only, and other groups stay available to other consumers.',
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

An architect proposes "Object Store as a queue for everything — it's already included".

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
    'Object Store is a key-value store with TTL — ideal for idempotency, watermarks and caching, not for queuing (no consumers, ordering or ack).',
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

**Why not Object Store as a queue:** it has no consumer/listener model, no ordering, no acknowledgement or redelivery, no DLQ, and polling it with a Scheduler creates race conditions between replicas and extra API calls. It is a store, not a messaging system.

**Anypoint MQ concepts**
- **Queue**: point-to-point; each message is processed by one consumer.
- **Message exchange**: publish once; delivered to every queue bound to it (pub/sub fan-out).
- **Standard vs FIFO**: standard queues favour throughput and do not guarantee strict order; FIFO queues preserve order within a message group, with lower throughput. A message with no group ID goes to a default group, and only one consumer at a time can access a group.
- **Ack modes** on the subscriber: \`AUTO\` (ack when the flow completes successfully, nack on error), \`IMMEDIATE\` (ack on receipt — fastest, can lose work), \`MANUAL\` (you call ack/nack explicitly). Unacknowledged messages become visible again after the acknowledgement timeout.

**Delivery guarantee:** at-least-once on standard queues; the docs describe FIFO queues as exactly-once. Either way, a crash after the side effect but before the ack means the message comes back after the acknowledgement timeout, so consumers must be **idempotent** — e.g. unique business key in the target DB, or an Object Store of processed IDs (that's where R5's pattern reappears).

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
      a: 'When the organisation already runs Kafka, needs event replay/retention, very high throughput, or stream processing — Anypoint MQ is simpler but is not an event log.',
    },
  ],
}

export default {
  id: 'ar-076',
  category: 'architecture',
  title: 'Idempotency and Per-SKU Ordering for Inventory Events',
  level: 'ADVANCED',
  tags: ['supply-chain', 'inventory', 'idempotency', 'ordering', 'activemq', 'jms', 'kafka', 'oracle'],
  estMinutes: 35,
  quiz: [
    {
      type: 'single',
      prompt: 'The WMS sends stock deltas ("SKU 123 at DC2: −2") over ActiveMQ. The Mule consumer updates Oracle, then crashes before acknowledging; the broker redelivers. What is the most robust fix?',
      options: [
        'Record the event id in a processed-events table in the SAME Oracle transaction as the stock update, and skip events already recorded',
        'Switch the listener to ackMode IMMEDIATE so the message is acknowledged before processing',
        'Lower the redelivery count to 0 so redeliveries never happen',
        'Add an in-memory list of processed ids in the Mule app',
      ],
      answer: 0,
      explain: 'Committing the dedup record atomically with the business change makes the update idempotent across crashes and replicas. IMMEDIATE ack turns a duplicate into a **lost** message; an in-memory list disappears on restart and is not shared between replicas.',
    },
    {
      type: 'single',
      prompt: 'To keep up, the team raises the JMS listener to 8 consumers. Now "set to 5" and "set to 3" for the same SKU sometimes apply in the wrong order. Which change keeps parallelism AND per-SKU order?',
      options: [
        'Set the JMSXGroupID property to SKU + location when publishing, so the broker delivers each group to one consumer at a time',
        'Go back to a single consumer for the whole queue',
        'Use a non-durable topic instead of a queue',
        'Sort messages by JMSTimestamp inside each consumer',
      ],
      answer: 0,
      explain: 'ActiveMQ **message groups** pin all messages with the same group id to one consumer while other groups are processed in parallel. A single consumer works but throws away throughput; sorting inside a consumer cannot see messages held by other consumers.',
    },
    {
      type: 'multi',
      prompt: 'Which designs make applying an inventory event safe to repeat or to receive out of order? (Select all that apply.)',
      options: [
        'Events carry the absolute quantity plus a per-SKU-location sequence number, and Oracle applies them with a MERGE whose update only fires when the incoming sequence is higher',
        'A unique constraint on (source, eventId) in a processed-events table, written in the same transaction',
        'Mule idempotent-message-validator backed by a persistent, shared Object Store keyed on eventId, with a TTL longer than the redelivery window',
        'Deltas applied with UPDATE qty = qty + :delta and no other check',
        'Relying on the broker to never deliver a message twice',
      ],
      answer: [0, 1, 2],
      explain: 'Absolute values with a sequence guard are naturally idempotent and order-tolerant; a dedup table or a shared persistent Object Store prevents double application. A bare delta update double-counts on redelivery, and at-least-once brokers do deliver duplicates.',
    },
    {
      type: 'single',
      prompt: 'An event for SKU 123 / DC2 with sequence 41 arrives after sequence 42 was already applied. What should the consumer do?',
      options: [
        'Ignore it (and log/metric it) because a newer state is already applied',
        'Apply it, because every message must be processed',
        'Throw an error so it is redelivered until sequence 43 arrives',
        'Move the whole queue to the DLQ',
      ],
      answer: 0,
      explain: 'With absolute quantities, an older sequence is stale by definition. Retrying it can never succeed and only burns redeliveries; skipping it is correct, but count it so a systematic ordering problem is visible.',
    },
    {
      type: 'match',
      prompt: 'Match each mechanism to what it guarantees.',
      pairs: [
        ['Kafka partition key = SKU + location', 'All events for one key land in one partition and are read in order'],
        ['ActiveMQ message group (JMSXGroupID)', 'One consumer at a time per group while groups run in parallel'],
        ['Per-key sequence number in the payload', 'The consumer can detect stale or missing events'],
        ['Processed-events table in the same Oracle transaction', 'A redelivered event is not applied twice'],
      ],
      explain: 'Partitioning and message groups preserve order in transport; sequence numbers let the consumer verify order; the dedup table gives idempotency at the point of the write.',
    },
    {
      type: 'order',
      prompt: 'Order the steps of an idempotent, order-aware inventory consumer (MANUAL ack).',
      items: [
        'Receive the message from the jms:listener (group = SKU + location)',
        'Validate and transform the payload to the canonical inventory event',
        'In one Oracle transaction: insert into processed-events and MERGE stock where incoming sequence > stored sequence',
        'Commit the Oracle transaction',
        'Acknowledge the JMS message',
      ],
      explain: 'Acknowledge only after the database commit. A crash between commit and ack causes a redelivery, which the processed-events check turns into a no-op.',
    },
  ],
  description: `
A retailer streams inventory changes from a **WMS** (3 DCs), **400 store POS systems** and **Oracle EBS** into a central Oracle inventory schema through **ActiveMQ** and Mule. Volume: 3 million events/day, peaks of 400/s. The e-commerce site reads availability from the same schema.

Incidents in the last month:
1. After a broker failover, ~2,000 messages were **redelivered**, and stock went negative for 300 SKUs (deltas applied twice).
2. Scaling the consumer from 1 to 8 caused **out-of-order** updates: "set to 3" overtook "set to 5" for the same SKU.
3. One store's POS clock was 20 minutes behind, so timestamp-based ordering broke.

**Questions:**
- How do you make processing idempotent across redeliveries, restarts and multiple replicas?
- How do you keep per-SKU (per SKU-location) ordering without going back to a single consumer?
- Deltas or absolute quantities? Timestamps or sequence numbers?
- What do you do with an event that is older than the stored state?
`,
  answerTemplate: `## Idempotency

## Per-key ordering with parallelism

## Event design: deltas vs absolute, sequence vs timestamp

## Stale and missing events
`,
  keyPoints: [
    'Assume at-least-once delivery: failovers, crashes between commit and ack, and network connectors all create duplicates.',
    'Idempotency at the write: dedup on event id in the same Oracle transaction, or absolute quantities guarded by a sequence (MERGE with a sequence condition).',
    'Order only matters per key (SKU + location): partition by key (Kafka) or use message groups (JMSXGroupID) to keep parallelism.',
    'Use producer-assigned per-key sequence numbers, not wall-clock timestamps from many devices.',
    'Older events are skipped and counted; gaps can trigger a reconciliation snapshot.',
  ],
  solution: `
**Idempotency.** Every event has a unique \`eventId\` and a per-key \`sequence\`. The consumer runs one Oracle transaction:
\`\`\`sql
INSERT INTO processed_events (source, event_id) VALUES (:src, :id);   -- unique constraint
MERGE INTO stock s USING (SELECT :sku sku, :loc loc, :qty qty, :seq seq FROM dual) e
  ON (s.sku = e.sku AND s.loc = e.loc)
  WHEN MATCHED THEN UPDATE SET s.qty = e.qty, s.seq = e.seq WHERE e.seq > s.seq
  WHEN NOT MATCHED THEN INSERT (sku, loc, qty, seq) VALUES (e.sku, e.loc, e.qty, e.seq);
\`\`\`
A duplicate fails the unique constraint (caught as a known \`DB:QUERY_EXECUTION\` and treated as "already processed"), or simply matches no rows because its sequence is not higher. Ack only after commit.

**Ordering with parallelism.** Order matters per SKU-location, not globally:
- **ActiveMQ:** publish with \`JMSXGroupID = sku|location\`; the broker sends a group to one consumer at a time, so 8 consumers still work in parallel across groups.
- **Kafka (if used):** key = \`sku|location\` → one partition → ordered; consumers scale up to the partition count.
- Avoid async scopes or parallel-for-each across events for the same key inside the flow.

**Deltas vs absolute; sequence vs timestamp.**
- **Absolute quantities** (or deltas plus a running sequence) make the write idempotent and let stale events be detected. Deltas need strict exactly-once application.
- **Sequence numbers** from the system of record for that location (the WMS for a DC, the POS for a store) are monotonic per key; timestamps from 400 device clocks are not.

**Stale and missing events.** Older sequence → skip and count. A gap (42 then 45) → apply (absolute) and flag for reconciliation; a nightly snapshot per location corrects drift.

**Trade-offs:** an extra table and index to maintain (purge after N days); message groups can create hot consumers for very busy SKUs; absolute values need the producer to know the current quantity.
`,
  followUps: [
    { q: 'What happens to message groups when a consumer dies?', a: 'The broker reassigns its groups to other consumers; unacknowledged messages are redelivered, so idempotency is still required.' },
    { q: 'POS systems can only send deltas (each sale). How do you stay safe?', a: 'Give each POS event a unique id per store and terminal and dedup on it at the write; reconcile against the nightly store count to correct any drift.' },
    { q: 'Would you keep the dedup state in Object Store instead of Oracle?', a: 'Only if it is persistent and shared across replicas, and you accept a small window where the store and the database disagree; dedup in the same Oracle transaction is stronger because both commit together.' },
  ],
}

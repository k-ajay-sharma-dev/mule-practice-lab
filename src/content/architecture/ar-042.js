import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-042',
  category: 'architecture',
  title: 'Transactional Outbox for Reliable Publishing',
  level: 'ADVANCED',
  tags: ['outbox-pattern', 'dual-write', 'messaging', 'consistency', 'database'],
  estMinutes: 30,
  diagram: {
    task: 'draw the transactional outbox: the Customer Process API, its database, the relay that publishes CustomerUpdated, and an idempotent downstream consumer.',
    checks: [
      { label: 'A caller sends the customer update to the Process API', rule: { type: 'edge', from: ['internal-app', 'web-app', 'mobile-app', 'partner', 'experience-api'], to: 'process-api' } },
      { label: 'The Customer Process API writes the change (and the outbox row) to its own database', rule: { type: 'edge', from: 'process-api', to: 'database' } },
      { label: 'The request flow never publishes straight to the broker. That would be a dual write', rule: { type: 'no-edge', from: 'process-api', to: ['queue', 'topic', 'event-stream'] } },
      { label: 'The request reaches the broker only through the outbox relay', rule: { type: 'no-path', from: ['internal-app', 'web-app', 'mobile-app', 'partner', 'experience-api'], to: ['queue', 'topic', 'event-stream', 'cloud-queue'] } },
      { label: 'A relay job reads the outbox table', rule: { type: 'edge', from: 'batch-job', to: 'database' } },
      { label: 'The relay publishes the events asynchronously to the broker', rule: { type: 'edge', from: 'batch-job', to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'A downstream consumer receives CustomerUpdated asynchronously', rule: { type: 'edge', from: ['queue', 'topic', 'event-stream'], to: 'process-api', kind: 'async' } },
      { label: 'The relay events reach the consumer through the broker', rule: { type: 'path', from: 'batch-job', to: 'process-api', kind: 'async' } },
      { label: 'Messages that keep failing go to a dead-letter queue', rule: { type: 'edge', from: ['queue', 'topic', 'event-stream'], to: 'dlq' } },
      { label: 'The consumer applies the change through a System API', rule: { type: 'path', from: ['queue', 'topic', 'event-stream'], via: 'system-api', to: ['saas', 'crm', 'erp', 'legacy'] } },
      { label: 'The consumer reaches its backend only through a System API', rule: { type: 'only-via', target: ['saas', 'crm', 'erp', 'legacy'], from: 'system-api' } },
      { label: 'APIs call each other with sync calls. Async work goes through a broker', rule: { type: 'lines', from: ['internal-app', 'web-app', 'mobile-app', 'partner', 'experience-api', 'process-api'], to: ['experience-api', 'process-api', 'system-api'], kind: 'sync' } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: ['queue', 'topic', 'event-stream', 'cloud-queue', 'dlq'], kind: 'async' } },
      { label: 'Reads and writes to a data store are sync calls', rule: { type: 'lines', to: ['database', 'oracle-db', 'sql-server', 'cache'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        cli: ['internal-app', 'Customer channel / caller'],
        prc: ['process-api', 'prc-customer-api', { replicas: 2, vCores: '0.2' }],
        db: ['database', 'PostgreSQL: customer + outbox (one local transaction)'],
        relay: ['batch-job', 'Outbox relay (Scheduler, every 1–2 s)'],
        ex: ['topic', 'CustomerUpdated exchange (Anypoint MQ)'],
        q: ['queue', 'loyalty-customer-updated', { maxRedelivery: 5 }],
        dlq: ['dlq', 'loyalty-customer-updated-dlq'],
        ploy: ['process-api', 'prc-loyalty-sync (idempotent on eventId)'],
        sloy: ['system-api', 'sys-loyalty-api'],
        loy: ['saas', 'Loyalty platform'],
      },
      ['cli -> prc', 'prc -> db', 'relay -> db', 'relay ~> ex', 'ex ~> q', 'q ~> ploy', 'q ~> dlq', 'ploy -> sloy', 'sloy -> loy'],
    ),
    simulation: {
      systems: [
        { match: 'database', latencyMs: 15 },
        { match: 'saas', latencyMs: 300 },
      ],
      tests: [
        {
          name: 'Broker down at peak',
          about: 'Customer updates come in at 80 a second and the broker is down for five minutes. Every update must still be saved and answered, because the request never waits for the broker.',
          traffic: [{ name: 'updates', from: ['internal-app', 'web-app', 'mobile-app', 'partner', 'experience-api'], rps: 80, kind: 'write' }],
          incidents: [{ down: 'topic', at: 2, forMin: 5 }],
          expect: { answers: [{ minSuccess: 0.99, maxMs: 300 }] },
        },
        {
          name: 'Loyalty rejects every event for ten minutes',
          about: 'The relay publishes 20 events a second and a bad release makes the loyalty platform reject every update for ten minutes. Events that keep failing are parked in the dead-letter queue, none are lost, and the queue is empty at the end.',
          durationMin: 30,
          traffic: [{ name: 'events', from: 'batch-job', rps: 20, to: 'saas', kind: 'write' }],
          incidents: [{ errors: 'saas', rate: 1, at: 3, forMin: 10 }],
          expect: { lost: { max: 0 }, backlog: [{ queue: ['queue', 'topic', 'event-stream'], maxEnd: 0 }] },
        },
        {
          name: 'Broker restart while loyalty is down',
          about: 'The loyalty platform is down for four minutes and the broker restarts in the middle of it. The events waiting in the queue survive, and every event reaches the loyalty platform once it is back.',
          durationMin: 20,
          traffic: [{ name: 'events', from: 'batch-job', rps: 20, to: 'saas', kind: 'write' }],
          incidents: [{ down: 'saas', at: 2, forMin: 4 }, { restart: 'queue', at: 4 }],
          expect: { lost: { max: 0 }, delivered: [{ to: 'saas', min: 0.98 }], backlog: [{ queue: ['queue', 'topic', 'event-stream'], maxEnd: 0 }] },
        },
      ],
    },
  },
  description: `
A **Customer Process API** (Mule 4) updates a customer in its own PostgreSQL database and then publishes **CustomerUpdated** to Anypoint MQ:

\`\`\`
1. UPDATE customer SET ... WHERE id = :id
2. Publish CustomerUpdated to Anypoint MQ
3. Return 200
\`\`\`

Observed issues in production:
- Occasionally the DB update succeeds but publishing fails (MQ timeout, app restart between steps) → downstream systems never learn about the change.
- After a retry was added around the whole flow, some events were published twice and one consumer double-counted loyalty points.
- A developer proposed an XA transaction spanning the DB and the broker; the broker in use does not participate in XA.

Numbers to design for:
- Customer updates peak at **80 a second**. A database write takes about 15 ms. The broker has had outages of **five minutes**, and updates must keep working through one.
- The relay publishes up to **20 events a second**. The loyalty platform answers in about 300 ms. It has been down for a few minutes at a time, and a bad release once made it reject every update for **ten minutes**. No event may be lost, even if the broker restarts.

**Questions:**
- What is the "dual write" problem here?
- Describe the transactional outbox pattern and how to implement it with Mule 4.
- Which delivery guarantee do you get, and what must consumers do?
- How do you keep event order per customer, and how do you clean up and monitor the outbox?
`,
  answerTemplate: `## The dual-write problem

## Outbox design

## Mule 4 implementation

## Delivery guarantees and consumers

## Ordering, cleanup and monitoring
`,
  keyPoints: [
    'Writing to a database and a broker are two separate operations without a shared transaction; any failure between them leaves the systems inconsistent (dual write).',
    'With an outbox, the business change and an outbox row describing the event are written in the same local database transaction; a separate relay publishes outbox rows to the broker.',
    'In Mule 4, the write uses a Database connector transaction (Try scope with a local transaction); the relay is a Scheduler or DB polling flow, or a CDC tool reading the outbox table.',
    'The relay gives at-least-once delivery: an event may be published twice if the relay fails after publishing but before marking the row, so consumers must be idempotent using the event ID.',
    'Per-entity ordering is kept by publishing in outbox sequence per aggregate and using FIFO/partitioned delivery keyed by customer ID.',
    'Published outbox rows are purged or archived, and outbox age/backlog is monitored and alerted on.',
    'Settings: the Process API runs 2 replicas of 0.2 vCore for 80 updates a second. The loyalty queue is persistent and allows 5 deliveries before the DLQ, so short outages are retried and a long run of failures is parked, not lost.',
  ],
  solution: `
**Dual write.** The DB commit and the MQ publish are independent. Crash after step 1 → change without event. Publish then fail to commit → event about a change that never happened. Wrapping both in a retry duplicates events. XA would need both resources to support it and adds coupling and latency; here it is not even available.

**Outbox design.**
\`\`\`
outbox(id UUID, aggregate_type, aggregate_id, event_type, payload JSON,
       created_at, published_at NULL, sequence BIGSERIAL)
\`\`\`
1. In **one local transaction**: update \`customer\` + insert outbox row (\`CustomerUpdated\`, payload, eventId).
2. A **relay** reads unpublished rows in order, publishes to MQ, marks \`published_at\`.

**Mule 4 implementation.**
- API flow: a **Try scope** with \`transactionalAction="ALWAYS_BEGIN"\` containing both Database operations (update + insert) on the same DB config → commit or roll back together. Return 200 after commit — no broker dependency in the request path.
- Relay flow: **Scheduler** (e.g. every 1–2 s) → \`SELECT ... WHERE published_at IS NULL ORDER BY sequence LIMIT 100\` (with row locking such as \`FOR UPDATE SKIP LOCKED\` if multiple replicas run the relay, or run it on one replica) → for each row publish to Anypoint MQ with \`eventId\` as message ID/property → update \`published_at\`.
- Alternative relay: a **CDC** tool reads the outbox table from the DB log and streams rows to the broker — lower latency, no polling, more infrastructure.

**Delivery guarantees.** **At-least-once.** If the relay publishes and crashes before updating \`published_at\`, the row is published again. Consumers must be **idempotent**: store processed \`eventId\`s (DB table or Object Store with TTL) or make the operation naturally idempotent (set loyalty tier rather than add points). The loyalty double-count was a consumer idempotency bug, not only a producer bug.

**Ordering.** Publish rows in \`sequence\` order; for strict per-customer order use a **FIFO** queue or partition key = customerId, and have consumers ignore events with a version lower than what they have already applied.

**Cleanup and monitoring.** Purge or archive published rows older than N days (scheduled job). Metrics: count of unpublished rows, age of the oldest unpublished row — alert if it exceeds e.g. 5 minutes (relay stuck or broker down).

**Settings that matter.**
- \`prc-customer-api\` runs **2 replicas of 0.2 vCore**: 80 updates a second use under half of it. Because the request only writes to its own database, a broker outage does not touch it. A Process API that also published to the broker would fail every update while the broker is down.
- The loyalty queue is **persistent** and allows **5 deliveries before the DLQ**. A loyalty outage of a few minutes is retried until it succeeds, and a broker restart keeps the waiting events. When loyalty rejects everything for ten minutes, the events that fail five times move to the dead-letter queue to be replayed later. A redelivery cap without a DLQ would drop them.
`,
  followUps: [
    { q: 'How is this different from the inbox pattern?', a: 'The inbox is the consumer-side counterpart: the consumer records received event IDs in its own database in the same transaction as its state change, which gives effectively-once processing on top of at-least-once delivery.' },
    { q: 'What if the source is a SaaS system where you cannot add an outbox table?', a: 'Use the SaaS platform\'s own change events or CDC feature (for example platform events or change data capture where offered), or poll with a watermark; the outbox requires control over the database transaction.' },
  ],
}

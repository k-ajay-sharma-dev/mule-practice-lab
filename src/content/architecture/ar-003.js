import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-003',
  category: 'architecture',
  title: 'Event-Driven Design with Anypoint MQ',
  level: 'INTERMEDIATE',
  tags: ['anypoint-mq', 'fifo', 'dlq', 'pub-sub'],
  estMinutes: 25,
  diagram: {
    task: 'draw the Anypoint MQ messaging layer: the scan API, the exchange and its bound queues, the three consumers with their stores, and where poison messages end up.',
    checks: [
      { label: 'Depot scanners send events to an Experience API', rule: { type: 'each', of: 'device', edgeTo: 'experience-api' } },
      { label: 'The Experience API publishes each scan asynchronously to an exchange', rule: { type: 'edge', from: 'experience-api', to: 'topic', kind: 'async' } },
      { label: 'At least three queues (one per consumer) are bound to the exchange', rule: { type: 'edge', from: 'topic', to: 'queue', min: 3 } },
      { label: 'Every queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Every consumer reads from its own queue', rule: { type: 'each', of: 'process-api', edgeFrom: 'queue' } },
      { label: 'Billing deduplicates with a persistent store (Object Store or unique DB key)', rule: { type: 'edge', from: { type: ['process-api', 'system-api'], label: ['bill'] }, to: ['cache', 'database'] } },
      { label: 'Analytics events reach the data lake', rule: { type: 'path', from: 'topic', to: 'data-warehouse' } },
      { label: 'The Experience API never writes to consumer stores directly', rule: { type: 'no-edge', from: 'experience-api', to: ['database', 'data-warehouse', 'cache'] } },
    ],
    reference: diagram(
      {
        dev: ['device', 'Depot scanners'],
        exp: ['experience-api', 'exp-scan-events-api'],
        ex: ['topic', 'parcel-scan-events'],
        tq: ['queue', 'tracking-q'],
        bq: ['queue', 'billing-q'],
        aq: ['queue', 'analytics-q'],
        dlq: ['dlq', 'Dead-letter queues (max delivery 5)'],
        trk: ['process-api', 'prc-tracking-consumer'],
        bil: ['process-api', 'prc-billing-consumer'],
        ana: ['process-api', 'prc-analytics-loader'],
        tdb: ['database', 'Tracking DB (status rank)'],
        os: ['cache', 'Idempotency store (persistent)'],
        bdb: ['database', 'Billing DB (unique parcelId + event)'],
        lake: ['data-warehouse', 'Data lake'],
      },
      [
        'dev -> exp', 'exp ~> ex', 'ex ~> tq', 'ex ~> bq', 'ex ~> aq',
        'tq ~> dlq', 'bq ~> dlq', 'aq ~> dlq',
        'tq ~> trk', 'bq ~> bil', 'aq ~> ana',
        'trk -> tdb', 'bil -> os', 'bil -> bdb', 'ana -> lake',
      ],
    ),
  },
  description: `
A logistics company tracks parcels. Scanners in 40 depots send **scan events** (\`RECEIVED\`, \`SORTED\`, \`LOADED\`, \`DELIVERED\`) to a Mule Experience API at peaks of **~1,500 events/second**.

Consumers:
- **Tracking service** — updates the customer-facing parcel status. Status must never go backwards (a late \`SORTED\` must not overwrite \`DELIVERED\`).
- **Billing** — charges per delivered parcel; must not charge twice.
- **Analytics** — loads everything into the data lake; order does not matter.

Constraints: some events are malformed (bad parcel IDs); the tracking DB occasionally has 5-minute maintenance windows.

**Design the messaging layer with Anypoint MQ:**
- Queues vs exchanges — what do you create and how are they bound?
- Standard or FIFO queues for each consumer? Justify with the throughput and ordering needs.
- How do you handle poison messages and outages (acknowledgement mode, redelivery, DLQ)?
- How do you meet "status never goes backwards" and "never charge twice"?
`,
  answerTemplate: `## Topology (exchanges, queues, bindings)

## Standard vs FIFO

## Acknowledgement, redelivery and DLQ

## Ordering and duplicates
`,
  keyPoints: [
    'One exchange (e.g. parcel-scan-events) with a separate queue per consumer bound to it, so each consumer gets its own copy and backlog.',
    'Standard queues chosen for the throughput; FIFO is not used for the 1,500 msg/s fan-out (FIFO has lower throughput and cannot be bound to an exchange).',
    'Ordering for tracking enforced in the consumer: compare event timestamp/status rank with the stored state and ignore older/lower events.',
    'Billing deduplicates on a business key (parcelId + DELIVERED) e.g. idempotent message validator with persistent Object Store or a unique DB constraint.',
    'MANUAL acknowledgement: ack after successful processing, nack (or let lock expire) on transient errors so the message is redelivered.',
    'Each queue has a dead letter queue with a max delivery count; malformed messages go to the DLQ, which is monitored and can be replayed.',
  ],
  solution: `
**Topology.** The Experience API validates the payload shape and publishes each scan to an **exchange** \`parcel-scan-events\`. Three queues are bound to it: \`tracking-q\`, \`billing-q\`, \`analytics-q\`. Each consumer app subscribes to its own queue, so a slow consumer (analytics) builds its own backlog without affecting the others. A fourth consumer later = one more bound queue.

**Standard vs FIFO.** Use **standard queues**. FIFO queues give strict ordering but have much lower throughput and **cannot be bound to an exchange**, so they do not fit a 1,500 msg/s fan-out. Global ordering is not really needed anyway — only per-parcel ordering for tracking, which the consumer can enforce itself. Analytics doesn't care about order at all.

**Ack, redelivery, DLQ.**
- Subscriber with **MANUAL acknowledgement**: ack only after the DB write succeeds; on a transient error (tracking DB maintenance) nack or let the lock time out so the message comes back. Add reconnection / backoff so the app does not spin during a 5-minute outage — messages simply wait in the queue.
- Configure each queue with a **dead letter queue** and a **max delivery count** (e.g. 5). Validation failures (bad parcel ID) should be routed to the DLQ quickly, not retried forever.
- Alert on DLQ depth; provide a replay process (move messages back after a fix).

**Ordering and duplicates.**
- *Tracking:* store the current status with a rank (\`RECEIVED\`=1 … \`DELIVERED\`=4) and the event timestamp. Update only if the incoming event is newer/higher — a conditional update (\`UPDATE … WHERE rank < :newRank\`). Out-of-order and duplicate events then become no-ops.
- *Billing:* delivery is at-least-once, so dedupe on \`parcelId\` + event type using an **Idempotent Message Validator** backed by a **persistent Object Store** (with a TTL longer than the redelivery window) and/or a unique constraint on the billing table. The DB constraint is the strongest guarantee.
`,
}

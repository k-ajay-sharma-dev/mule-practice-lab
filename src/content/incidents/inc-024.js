export default {
  id: 'inc-024',
  category: 'incidents',
  title: 'Order Status Goes Backwards After Scaling the Event Consumer',
  level: 'EXPERT',
  tags: ['ordering', 'anypoint-mq', 'concurrency', 'event-driven', 'scaling'],
  estMinutes: 45,
  investigation: {
    logs: [
      { text: 'Thu 09:12:00.000 INFO  [runtime] order-status-consumer scaled replicas 1 -> 3, subscriber concurrency 1 -> 8', relevant: true, why: '24 parallel consumers: two events for one order can now be processed at the same time.' },
      { text: '10:15:02.900 INFO  [consumer-r3] orderId=O-55118 status=DELIVERED occurredAt=10:14:59.002 -> PUT 200', relevant: false },
      { text: '10:15:03.402 INFO  [consumer-r2] orderId=O-55120 status=SHIPPED occurredAt=10:15:02.118 -> PUT 200', relevant: true, why: 'The newer event is applied first...' },
      { text: '10:15:03.517 INFO  [consumer-r1] orderId=O-55120 status=PACKED  occurredAt=10:15:00.904 -> PUT 200', relevant: true, why: '...then the older event overwrites it 115 ms later: last write wins, not latest event.' },
      { text: '10:15:03.520 INFO  [web-orders-sapi] UPDATE orders SET status=PACKED WHERE id=O-55120 (1 row)', relevant: true, why: 'The SAPI blindly overwrites with no version or state check, so the backwards transition is accepted.' },
      { text: '10:15:04.000 INFO  [health] GET /health 200 (2 ms)', relevant: false },
      { text: '10:15:05.120 INFO  [mq] queue order-status depth=312 inflight=24', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why does the status go backwards?',
        options: [
          'Events for the same order are processed in parallel and the SAPI overwrites blindly, so an older event can be applied last',
          'The warehouse publishes events in the wrong order',
          'Anypoint MQ corrupts messages under load',
          'The web store caches old statuses',
        ],
        answer: 0,
        explain: 'The log shows PACKED (occurred earlier) applied after SHIPPED. Scaling to 24 consumers made it frequent; a standard queue never guaranteed strict order anyway.',
      },
      {
        type: 'single',
        prompt: 'Which option keeps throughput **and** fixes correctness quickly?',
        options: [
          'A stale-update guard in the SAPI: only apply an update newer than the stored version or timestamp',
          'Scale back to 1 replica with concurrency 1',
          'Add a 2-second delay before each PUT',
          'Retry every failed PUT three times',
        ],
        answer: 0,
        explain: 'Scaling back is correct but slow and brings the backlog back. A delay only makes the race rarer.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix**?',
        options: [
          'Conditional update: UPDATE ... WHERE id=:id AND version < :v, ideally with a producer sequence number',
          'A state machine that rejects backwards transitions such as SHIPPED -> PACKED',
          'Partition by orderId so each order goes to one sequential consumer (or a FIFO queue if throughput allows)',
          'A nightly reconciliation of web store vs warehouse status',
          'Rely on Anypoint MQ standard queues to deliver in order',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Make the target order-tolerant as a safety net, preserve order per key for efficiency, and reconcile. Standard queues do not guarantee order.',
      },
      {
        type: 'order',
        prompt: 'Put the incident response in order.',
        items: [
          'Compare occurredAt with processing time for affected orders',
          'Re-read status from the warehouse and correct affected orders',
          'Deploy the stale-update guard (or scale back to 1 consumer meanwhile)',
          'Add sequence numbers and per-order partitioning',
          'Add out-of-order tests and daily reconciliation',
        ],
        explain: 'Diagnose, repair data from the source of truth, stop new corruption, then fix properly and test.',
      },
    ],
  },
  description: `
## Symptoms
- Customers see orders on the website flip **from "Shipped" back to "Packed"**, and some orders stay "Packed" even after delivery.
- About **0.5%** of orders affected since Thursday; the warehouse system shows the correct latest status.
- No errors in the logs; every message is acknowledged successfully.

## Change / Context
- The warehouse publishes \`OrderStatusChanged\` events (\`PICKED → PACKED → SHIPPED → DELIVERED\`) to an **Anypoint MQ standard queue** \`order-status\`. Events for one order are often published **within 1–2 seconds** of each other.
- \`order-status-consumer\` subscribes and calls \`PUT /orders/{id}/status\` on \`web-orders-sapi\`, which simply overwrites the status.
- On Thursday, to clear a growing backlog, the team scaled the consumer from **1 replica to 3**, and raised the subscriber's concurrency from 1 to 8 per replica.
- Event payload: \`{ "orderId": "...", "status": "...", "occurredAt": "2026-11-02T10:15:02.118Z" }\` — no sequence number.

## Logs (two replicas, same order)
\`\`\`
10:15:03.402 INFO  [consumer-r2] orderId=O-55120 status=SHIPPED occurredAt=10:15:02.118 -> PUT 200
10:15:03.517 INFO  [consumer-r1] orderId=O-55120 status=PACKED  occurredAt=10:15:00.904 -> PUT 200
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do **right now** (without losing the throughput gain)?
3. What is the permanent fix? Compare at least two design options.
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Explains that 3 replicas × 8 concurrent consumers process events for the same order in parallel, so a later event (SHIPPED) can be applied before an earlier one (PACKED), and the blind overwrite makes the older status win.',
    'Notes that a standard queue does not guarantee strict ordering anyway; single-consumer processing only hid the problem.',
    'Immediate: repair affected orders by re-syncing status from the warehouse (source of truth), and either temporarily reduce to one sequential consumer or deploy a stale-update check quickly.',
    'Permanent fix option A: make updates order-tolerant — the SAPI ignores an event older than the stored one (compare occurredAt or, better, a per-order sequence/version number; or reject backwards state transitions).',
    'Permanent fix option B: partition by orderId so all events of one order are handled by one sequential consumer (e.g. hash orderId to N queues, or a broker with key-based partitions), or a FIFO queue if throughput allows; discusses trade-offs (throughput, hot keys, complexity).',
    'Prevention: design rule that every event consumer states its ordering assumption; tests with concurrent out-of-order events; reconciliation monitoring against the source of truth.',
  ],
  solution: `
**Diagnosis.** With **24 concurrent consumers** (3 replicas × 8), two events for the same order published 1–2 s apart are frequently processed **in parallel** on different threads/replicas. The logs show it: \`SHIPPED\` (occurred 10:15:02.118) was applied at 10:15:03.402, then \`PACKED\` (occurred **earlier**, 10:15:00.904) was applied 115 ms later. The SAPI **blindly overwrites**, so the last *write* wins rather than the latest *event*. No errors, because every step "succeeds". It also explains orders stuck on an old status: no newer event arrives to correct them.

Even before scaling, a **standard queue gives no strict ordering guarantee** (redeliveries, retries); the single sequential consumer just made violations rare.

**Immediate mitigation.**
1. **Repair data**: for orders updated since Thursday, re-read status from the warehouse system (source of truth) and correct the web store.
2. Choose a short-term trade-off: either scale back to **1 replica with concurrency 1** (correct but slow; the backlog returns), or — better if it can be shipped quickly — deploy a **stale-update guard** in the SAPI (below), which keeps the throughput.

**Root cause.** The consumer implicitly relied on **in-order, one-at-a-time processing**, which was never guaranteed by the transport and was broken completely by scaling. The update operation was not **order-tolerant**.

**Permanent fix — two main options (often combined):**
- **A. Make the consumer/target order-tolerant (recommended baseline).**
  - The SAPI stores the \`occurredAt\` (or better a **per-order sequence/version** set by the warehouse) and only applies an update if it is **newer** than what it has: \`UPDATE ... SET status=:s, version=:v WHERE id=:id AND version < :v\`.
  - Or enforce a **state machine**: reject transitions backwards (\`SHIPPED → PACKED\`).
  - Pros: works with any concurrency, retries, replays and DLQ re-drives. Cons: needs a reliable ordering field from the producer (timestamps across producers can be skewed — a sequence number is safer).
- **B. Preserve order per key (partitioning).**
  - Route all events of one order to the same **sequential** consumer: hash \`orderId\` to N queues each with one consumer, or use a broker with key-based partitions (e.g. Kafka partition key = orderId), or an ordered/**FIFO** queue if its throughput is enough.
  - Pros: no need to change the target logic. Cons: throughput limited per partition, hot keys, rebalancing complexity, and retries/DLQs can still break order.

Most robust: **B for efficiency + A as the safety net**, because you can never fully rule out redelivery or replay.

**Prevention.** Every event-driven integration documents its ordering and duplication assumptions; scaling changes are reviewed against them; tests that inject out-of-order and duplicate events concurrently; a nightly reconciliation (web store vs warehouse status) with alerts on mismatches.
`,
  followUps: [
    { q: 'Why are timestamps weaker than sequence numbers for ordering?', a: 'Timestamps from different producers or hosts can have clock skew, and two events can share the same millisecond. A per-entity sequence number set by the single owner of that entity gives an unambiguous order.' },
    { q: 'If you used a FIFO queue, would the problem be fully solved?', a: 'Only if processing stays sequential for related messages; FIFO queues typically limit throughput and in-flight messages, and failure handling (retries, DLQ re-drive) can still reorder. You still want idempotent, version-aware updates.' },
    { q: 'How would you have detected this earlier?', a: 'A reconciliation between the source of truth and the web store, or logging/alerting when an incoming event is older than the stored state — that metric would have spiked right after scaling.' },
    { q: 'What would you put in the post-mortem?', a: 'The hidden ordering assumption, why scaling exposed it, customer impact, data repair done, detection gap (no errors), and actions: version guard, partitioning decision, reconciliation, scaling checklist.' },
  ],
}

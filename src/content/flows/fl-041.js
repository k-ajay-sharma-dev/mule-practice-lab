import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'
import { handlerStatus } from '../../flow/rules.js'

export default {
  id: 'fl-041',
  category: 'flows',
  title: 'Event Archive and On-Demand Replay for a Downstream Consumer',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'anypoint-mq', 'replay', 'event-driven', 'archive', 'operations'],
  estMinutes: 30,
  flowChecks: [
    { label: 'An archiver subscribes to its own copy of the event stream', rule: { type: 'source', component: 'mq-subscriber' } },
    {
      label: 'Every event is stored durably before the message is acknowledged',
      rule: { type: 'before', first: ['db-insert', 'db-bulk-insert', 's3-put'], then: 'mq-ack' },
    },
    {
      label: 'A failed archive write is never acknowledged, so the event is redelivered',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'mq-ack' },
          { type: 'absent', component: 'mq-ack', within: ['on-error-continue', 'on-error-propagate'] },
        ],
      },
    },
    {
      label: 'A failed archive write returns the event to the queue (Nack) from an error handler',
      rule: { type: 'inside', component: 'mq-nack', within: ['on-error-continue', 'on-error-propagate'] },
    },
    { label: 'An admin endpoint triggers the replay', rule: { type: 'source', component: 'http-listener' } },
    {
      label: 'Replay requests are validated (time window, allowed target queue) before the replay starts',
      rule: { type: 'before', first: 'validation', then: ['async', 'vm-publish', 'batch-job', 'foreach', 'mq-publish'] },
    },
    {
      label: 'A request that fails validation is answered with 400',
      rule: handlerStatus('VALIDATION', '400'),
    },
    {
      label: 'The replay runs in the background so the admin call returns immediately',
      rule: {
        type: 'any',
        rules: [
          { type: 'inside', component: 'mq-publish', within: ['async', 'batch-job'] },
          { type: 'before', first: 'vm-listener', then: 'mq-publish' },
        ],
      },
    },
    {
      label: 'Archived events are re-published one by one to the target queue',
      rule: { type: 'inside', component: 'mq-publish', within: ['foreach', 'batch-job', 'parallel-foreach'] },
    },
    {
      label: 'Replayed events go to the one chosen consumer queue, never to the order-events exchange that feeds them all',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'mq-publish', within: ['foreach', 'batch-job', 'parallel-foreach'] },
          { type: 'absent', component: 'mq-publish', where: { destination: { is: 'order-events' } } },
          { type: 'absent', component: 'mq-publish', where: { destination: { is: '#["order-events"]' } } },
          { type: 'absent', component: 'mq-publish', where: { destination: { is: "#['order-events']" } } },
        ],
      },
    },
    {
      label: 'Replayed events carry a replay marker so consumers can recognise them',
      rule: {
        type: 'any',
        rules: [
          { type: 'inside', component: 'transform', where: { script: 'replay' }, within: ['foreach', 'batch-job', 'parallel-foreach'] },
          { type: 'inside', component: 'set-payload', where: { value: 'replay' }, within: ['foreach', 'batch-job', 'parallel-foreach'] },
        ],
      },
    },
    {
      label: 'Each replay is recorded for audit by the replay API',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: ['db-insert', 'db-update'], min: 2 },
          { type: 'before', first: 'http-listener', then: ['db-insert', 'db-update'] },
        ],
      },
    },
  ],
  simulation: {
    systems: {
      db: {
        tables: {
          event_archive: {
            key: 'event_id',
            rows: [
              { event_id: 'EV-9001', event_type: 'OrderCreated', occurred_at: '2026-11-10T08:15:00Z', body: '{"eventId":"EV-9001","eventType":"OrderCreated","orderId":"SO-51001","total":129.5}' },
              { event_id: 'EV-9002', event_type: 'OrderPaid', occurred_at: '2026-11-10T09:02:00Z', body: '{"eventId":"EV-9002","eventType":"OrderPaid","orderId":"SO-51001","amount":129.5}' },
              { event_id: 'EV-9003', event_type: 'OrderCreated', occurred_at: '2026-11-10T11:40:00Z', body: '{"eventId":"EV-9003","eventType":"OrderCreated","orderId":"SO-51002","total":48}' },
              { event_id: 'EV-9004', event_type: 'OrderCreated', occurred_at: '2026-11-11T07:30:00Z', body: '{"eventId":"EV-9004","eventType":"OrderCreated","orderId":"SO-51003","total":310}' },
            ],
          },
          replay_job: { key: 'replay_id', columns: ['replay_id', 'target_queue', 'from_ts', 'to_ts', 'requested_by', 'status', 'events', 'finished_at'], rows: [] },
        },
      },
    },
    tests: [
      {
        name: 'An event is archived',
        about: 'The event is stored, then the message is acknowledged.',
        trigger: { message: { kind: 'mq', destination: 'order-events.archive', payload: { eventId: 'EV-9105', eventType: 'OrderShipped', occurredAt: '2026-11-13T09:55:00Z', orderId: 'SO-51001', carrier: 'DHL' } } },
        expect: { db: { event_archive: { count: 5, has: { event_id: 'EV-9105', event_type: 'OrderShipped' } } }, ack: 'acked' },
      },
      {
        name: 'The archive database is down',
        about: 'The write fails, so the event goes back to the queue instead of being lost.',
        trigger: { message: { kind: 'mq', destination: 'order-events.archive', payload: { eventId: 'EV-9106', eventType: 'OrderShipped', occurredAt: '2026-11-13T09:56:00Z', orderId: 'SO-51002', carrier: 'UPS' } } },
        overrides: { systems: { db: { fault: 'CONNECTIVITY' } } },
        expect: { ack: 'returned' },
      },
      {
        name: 'Anypoint MQ redelivers an event',
        about: 'The same event arrives a second time. It is stored once and the redelivery does not fail.',
        triggers: [
          { message: { kind: 'mq', destination: 'order-events.archive', payload: { eventId: 'EV-9107', eventType: 'OrderPaid', occurredAt: '2026-11-13T09:57:00Z', orderId: 'SO-51004', amount: 75 } } },
          { afterMs: 30000, message: { kind: 'mq', destination: 'order-events.archive', deliveryCount: 2, payload: { eventId: 'EV-9107', eventType: 'OrderPaid', occurredAt: '2026-11-13T09:57:00Z', orderId: 'SO-51004', amount: 75 } } },
        ],
        expect: { noError: true, db: { event_archive: { count: 5, has: { event_id: 'EV-9107' } } } },
      },
      {
        name: 'A billing replay is started',
        about: 'The admin gets an answer at once, and the matching events go to the billing queue only.',
        trigger: {
          http: {
            method: 'POST',
            path: '/admin/v1/replays',
            headers: { 'x-requested-by': 'ops.lead@example.com' },
            body: { from: '2026-11-10T06:00:00Z', to: '2026-11-10T12:00:00Z', eventTypes: ['OrderCreated'], targetQueue: 'order-events.billing' },
          },
        },
        expect: {
          noError: true,
          maxMs: 2000,
          sent: [
            { destination: 'order-events.billing', count: 2 },
            { destination: 'order-events.billing', count: 1, has: { orderId: 'SO-51002' } },
          ],
          notSent: ['order-events', 'order-events.warehouse', 'order-events.crm'],
          db: { replay_job: { count: 1, has: { target_queue: 'order-events.billing' } } },
        },
      },
      {
        name: 'A replay to the exchange is refused',
        about: 'Sending to order-events would reach every consumer, so the request gets 400 and nothing is sent.',
        trigger: {
          http: {
            method: 'POST',
            path: '/admin/v1/replays',
            headers: { 'x-requested-by': 'ops.lead@example.com' },
            body: { from: '2026-11-10T06:00:00Z', to: '2026-11-10T12:00:00Z', eventTypes: ['OrderCreated'], targetQueue: 'order-events' },
          },
        },
        expect: { status: 400, notSent: ['order-events', 'order-events.billing'] },
      },
      {
        name: 'The window ends before it starts',
        about: 'A replay window with to before from is rejected with 400.',
        trigger: {
          http: {
            method: 'POST',
            path: '/admin/v1/replays',
            headers: { 'x-requested-by': 'ops.lead@example.com' },
            body: { from: '2026-11-10T12:00:00Z', to: '2026-11-10T06:00:00Z', eventTypes: ['OrderCreated'], targetQueue: 'order-events.billing' },
          },
        },
        expect: { status: 400, notSent: ['order-events.billing'] },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'order-events-archiver',
      source('mq-subscriber', { destination: 'order-events.archive', acknowledgementMode: 'MANUAL' }),
      [
        step('set-variable', { variableName: 'ackToken', value: '#[attributes.ackToken]' }),
        step('set-variable', { variableName: 'body', value: '#[write(payload, "application/json")]' }),
        step('db-insert', {
          sql: 'INSERT INTO event_archive (event_id, event_type, occurred_at, body) VALUES (:eventId, :eventType, :occurredAt, :body) ON CONFLICT (event_id) DO NOTHING',
        }),
        step('mq-ack', { ackToken: '#[vars.ackToken]' }),
      ],
      [handler('on-error-continue', { type: 'ANY' }, [step('mq-nack', { ackToken: '#[vars.ackToken]' })])],
    ),
    flow(
      'replay-api',
      source('http-listener', { path: '/admin/v1/replays', allowedMethods: 'POST' }),
      [
        step('validation', {
          check: 'is-true',
          expression: '#[(payload.to as DateTime) > (payload.from as DateTime) and (payload.to as DateTime) <= (payload.from as DateTime) + |P2D|]',
          message: 'Replay window must be positive and at most 2 days',
        }),
        step('validation', {
          check: 'is-true',
          expression: '#[["order-events.billing", "order-events.warehouse", "order-events.crm"] contains payload.targetQueue]',
          message: 'Target queue is not allowed for replay',
        }),
        step('set-variable', { variableName: 'replayId', value: '#[uuid()]' }),
        step('set-variable', { variableName: 'request', value: '#[payload]' }),
        step('set-variable', { variableName: 'user', value: '#[attributes.headers."x-requested-by" default "unknown"]' }),
        step('set-variable', { variableName: 'eventTypesCsv', value: '#[(payload.eventTypes default []) joinBy ","]' }),
        step('db-insert', {
          sql: "INSERT INTO replay_job (replay_id, target_queue, from_ts, to_ts, requested_by, status) VALUES (:replayId, :targetQueue, :from, :to, :user, 'RUNNING')",
          // The insert result goes to a variable, so the payload is still the replay request the Async scope reads.
          target: 'jobInsert',
        }),
        scope('async', { maxConcurrency: 1 }, [
          step('db-select', {
            sql: 'SELECT event_id, event_type, body FROM event_archive WHERE occurred_at >= :from AND occurred_at < :to AND event_type = ANY(string_to_array(:eventTypesCsv, \',\')) ORDER BY occurred_at',
          }),
          step('set-variable', { variableName: 'count', value: '#[sizeOf(payload)]' }),
          scope('foreach', { collection: '#[payload]', batchSize: 1 }, [
            step('transform', {
              script:
                '%dw 2.0\noutput application/json\n---\nread(payload.body, "application/json") ++ {\n  replay: { replayId: vars.replayId, originalEventId: payload.event_id }\n}',
            }),
            step('mq-publish', { destination: '#[vars.request.targetQueue]' }),
          ]),
          step('db-update', { sql: "UPDATE replay_job SET status = 'COMPLETED', events = :count, finished_at = CURRENT_TIMESTAMP WHERE replay_id = :replayId" }),
        ]),
        step('set-variable', { variableName: 'httpStatus', value: '202' }),
        step('set-payload', { value: '#[output application/json --- { replayId: vars.replayId, status: "RUNNING" }]' }),
      ],
      [
        handler('on-error-propagate', { type: 'VALIDATION:INVALID_BOOLEAN' }, [
          step('set-variable', { variableName: 'httpStatus', value: '400' }),
          step('set-payload', { value: '#[output application/json --- { message: error.description }]' }),
        ]),
      ],
    ),
  ),
  description: `
Order events (≈400k/day) are published to the Anypoint MQ exchange \`order-events\`, which feeds one queue per consumer (billing, warehouse, CRM). Anypoint MQ keeps messages for at most 14 days and a consumed message is gone.

Last month the **billing** team deployed a bug and silently mis-processed six hours of events. Fixing it took days because nobody could re-send those events. Operations now wants:

- A **durable archive** of every order event for 90 days (a new queue \`order-events.archive\` is already bound to the exchange).
- An **admin-only API** to replay events of chosen types between two timestamps to **one** consumer's queue, never to all consumers. An invalid request is rejected with **400**.
- Replays of up to ~200k events; the admin call must answer within seconds with a replay ID.
- Replayed events must be recognisable so consumers can dedupe and audit them; every replay must be recorded (who, what, when, how many).

**Design the flow(s):** archiving, the replay API, how the replay runs, safety checks and auditability.
`,
  answerTemplate: `## Archiving

## Replay API contract

## Validation and safety

## Running the replay

## Marking replayed events

## Audit
`,
  keyPoints: [
    'A dedicated archive queue bound to the exchange feeds an archiver flow that stores each event (DB/S3) and acks only after the write — no event is lost.',
    'Archive writes are idempotent on eventId so MQ redeliveries do not create duplicates.',
    'The replay endpoint validates the window size and restricts the target to an allow-list of single consumer queues (never the exchange).',
    'The replay runs asynchronously (Async scope, VM queue or batch) and returns 202 with a replay ID; progress is stored in a replay_job table.',
    'Replayed messages carry a replay marker and the original eventId so consumers can dedupe idempotently and audits can tell them apart.',
  ],
  solution: `
**Archiver flow** — Anypoint MQ Subscriber on \`order-events.archive\` (MANUAL ack) → Database Insert into \`event_archive\` (\`ON CONFLICT DO NOTHING\` on \`event_id\`) → **Ack**. On error → **Nack** so MQ redelivers (and eventually DLQs). A Scheduler can purge rows older than 90 days.

**Replay API** — \`POST /admin/v1/replays { from, to, eventTypes, targetQueue }\`, protected by an API Manager policy (client ID + admin role).
1. **Validate** the window (positive, max 2 days per request) and that \`targetQueue\` is in an **allow-list** of single consumer queues. Publishing to the exchange would re-send to *every* consumer.
2. Insert a \`replay_job\` row (who, window, target, status RUNNING). Give the insert a **Target** variable: a Database Insert otherwise replaces the payload with its row count, and the replay still needs the request.
3. **Async** scope (max concurrency 1, so replays do not compete): Database Select (streaming, ordered by time) → **For Each** → DataWeave adds \`replay: { replayId, originalEventId }\` → **Anypoint MQ Publish** to the target queue. Update the job row with count and COMPLETED.
4. Respond **202** \`{ replayId }\`; a \`GET /admin/v1/replays/{id}\` can read the job row.

**Consumers** treat \`originalEventId\` as the idempotency key, so replaying events they already processed correctly is harmless.

**Scale note:** for 200k events, a VM queue or Batch Job instead of Async gives persistence across restarts; Async is simplest but a crash mid-replay leaves a RUNNING job that must be re-requested. Variables do not cross a VM queue, so a VM worker needs the request and the replay ID inside the message it receives.
`,
  followUps: [
    {
      q: 'Why not simply replay by moving messages from a DLQ or re-reading the consumer queue?',
      a: 'Successfully consumed messages are deleted from Anypoint MQ, and the queue TTL is limited. Only an independent archive lets you replay events that were "successfully" but wrongly processed.',
    },
    {
      q: 'How do you avoid a replay overwhelming the billing consumer?',
      a: 'Throttle the publish loop (small batches with pauses, or a rate-limited worker), keep replay concurrency at 1, and optionally publish to a separate replay queue that the consumer drains with lower prefetch.',
    },
    {
      q: 'Where else could the archive live?',
      a: 'S3 (cheap, partitioned by date/type, queried with Athena) or a data lake. A relational table is simplest when you need indexed time-window selects for replay.',
    },
  ],
}

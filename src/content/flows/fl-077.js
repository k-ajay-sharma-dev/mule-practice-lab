import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-077',
  category: 'flows',
  title: 'Kafka Order Events into PostgreSQL, Idempotent and Ordered, Re-Published per Customer',
  level: 'EXPERT',
  tags: ['kafka', 'postgresql', 'event-streaming', 'idempotency', 'ordering', 'upsert', 'dead-letter', 'json'],
  estMinutes: 50,
  flowChecks: [
    {
      label: 'Order events are consumed from orders.v1 with a Kafka Message Listener in a consumer group',
      rule: { type: 'source', component: 'kafka-listener', where: { topic: 'orders.v1', groupId: { set: true } } },
    },
    {
      label: 'The order is written to PostgreSQL',
      rule: { type: 'exists', component: ['db-insert', 'db-update'], where: { database: 'PostgreSQL' } },
    },
    {
      label: 'The write is an idempotent upsert (INSERT ... ON CONFLICT)',
      rule: { type: 'exists', component: ['db-insert', 'db-update'], where: { sql: 'ON CONFLICT' } },
    },
    {
      label: 'An older version arriving late does not overwrite a newer one (the upsert compares versions)',
      rule: {
        type: 'exists',
        component: ['db-insert', 'db-update'],
        where: { sql: { oneOf: ['version <', 'version >', 'version<', 'version>'] } },
      },
    },
    {
      label: 'The enriched event is published only after the database write',
      rule: { type: 'before', first: ['db-insert', 'db-update'], then: 'kafka-publish', thenWhere: { topic: 'orders.enriched' }, outside: true },
    },
    {
      label: 'The enriched event goes to orders.enriched.v1, keyed by customer ID so one customer stays in order',
      rule: { type: 'exists', component: 'kafka-publish', where: { topic: 'orders.enriched', key: 'customerId' } },
    },
    {
      label: 'Stale (older version) events are not re-published',
      rule: { type: 'inside', component: 'kafka-publish', within: 'choice' },
    },
    {
      label: 'Poison events are parked on a dead-letter topic and the stream moves on',
      rule: { type: 'inside', component: 'kafka-publish', within: 'on-error-continue', where: { topic: 'dlt' } },
    },
    {
      label: 'Transient database outages are propagated so the offset is not committed',
      rule: { type: 'handler', component: 'on-error-propagate', errorType: 'DB:CONNECTIVITY' },
    },
    {
      label: 'The database outage handler comes before the catch-all that parks events, so an outage is not parked',
      rule: {
        type: 'any',
        rules: [
          { type: 'before', first: 'on-error-propagate', firstWhere: { type: 'DB:CONNECTIVITY' }, then: 'on-error-continue', every: true },
          {
            type: 'all',
            rules: [
              { type: 'handler', component: 'on-error-propagate', where: { type: 'DB:CONNECTIVITY' } },
              { type: 'absent', component: 'on-error-continue', where: { type: 'ANY' } },
            ],
          },
        ],
      },
    },
  ],
  referenceFlow: design(
    flow(
      'order-events-projection',
      // Consumer config: topic orders.v1, group order-projection; AUTO commit only after the flow succeeds.
      source('kafka-listener', { topic: 'orders.v1', groupId: 'order-projection', ackMode: 'AUTO' }),
      [
        step('transform', {
          target: 'variable',
          variableName: 'evt',
          script:
            '%dw 2.0\noutput application/java\nvar doc = read(payload, "application/json")\n---\n{\n  orderId: doc.orderId,\n  customerId: doc.customerId,\n  status: doc.status,\n  totalAmount: doc.total.amount as Number,\n  currency: doc.total.currency,\n  eventVersion: doc.version as Number,\n  occurredAt: doc.occurredAt as DateTime,\n  raw: write(doc, "application/json")\n}',
        }),
        step('validation', { check: 'is-true', expression: '#[vars.evt.orderId != null and vars.evt.customerId != null]', message: 'Order event without orderId/customerId' }),
        // Same version is re-applied (affects 1 row) so a redelivery after a failed publish publishes again;
        // only strictly older versions are ignored (0 rows).
        step('db-insert', {
          database: 'PostgreSQL',
          sql: 'INSERT INTO orders (order_id, customer_id, status, total_amount, currency, event_version, occurred_at, raw_event)\nVALUES (:orderId, :customerId, :status, :totalAmount, :currency, :eventVersion, :occurredAt, CAST(:raw AS jsonb))\nON CONFLICT (order_id) DO UPDATE SET\n  status = EXCLUDED.status, total_amount = EXCLUDED.total_amount, currency = EXCLUDED.currency,\n  event_version = EXCLUDED.event_version, occurred_at = EXCLUDED.occurred_at, raw_event = EXCLUDED.raw_event\nWHERE orders.event_version <= EXCLUDED.event_version',
        }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[payload.affectedRows > 0]' }, [
              step('db-select', {
                database: 'PostgreSQL',
                sql: 'SELECT segment, region, lifetime_value FROM customers WHERE customer_id = :customerId',
              }),
              step('transform', {
                script:
                  '%dw 2.0\noutput application/json\nvar c = payload[0] default {}\n---\n{\n  orderId: vars.evt.orderId,\n  customerId: vars.evt.customerId,\n  status: vars.evt.status,\n  total: { amount: vars.evt.totalAmount, currency: vars.evt.currency },\n  version: vars.evt.eventVersion,\n  customer: { segment: c.segment default "UNKNOWN", region: c.region, lifetimeValue: c.lifetime_value }\n}',
              }),
              step('kafka-publish', { topic: 'orders.enriched.v1', key: '#[vars.evt.customerId]' }),
            ]),
          ],
          {
            otherwise: [step('logger', { level: 'DEBUG', message: '#["Stale event v" ++ (vars.evt.eventVersion as String) ++ " for order " ++ vars.evt.orderId ++ " ignored"]' })],
          },
        ),
      ],
      [
        // Broker / DB down: fail the flow, so AUTO does not commit the offset. Test how the listener re-reads the record.
        handler('on-error-propagate', { type: 'DB:CONNECTIVITY, KAFKA:CONNECTIVITY' }, [
          step('logger', { level: 'WARN', message: '#["Transient failure, record will be re-consumed: " ++ error.description]' }),
        ]),
        // Bad data never succeeds on retry: park it with the original key and move on.
        handler('on-error-continue', { type: 'ANY' }, [
          step('transform', {
            script:
              '%dw 2.0\noutput application/json\n---\n{ error: error.description, errorType: error.errorType.namespace ++ ":" ++ error.errorType.identifier, original: vars.evt.raw default null, correlationId: correlationId }',
          }),
          step('kafka-publish', { topic: 'orders.v1.dlt', key: '#[vars.evt.orderId default "unknown"]' }),
        ]),
      ],
    ),
  ),
  description: `
An e-commerce platform publishes **order lifecycle events** (\`OrderCreated\`, \`OrderPaid\`, \`OrderShipped\`, \`OrderCancelled\`) to the Kafka topic \`orders.v1\` (12 partitions, keyed by \`orderId\`, ~1.5 million events/day, peaks of 400/s). Each event carries the full order state and a monotonically increasing \`version\` per order.

The **customer-insights** team needs:
1. A current-state \`orders\` table in **PostgreSQL** for reporting.
2. A new topic \`orders.enriched.v1\` with each order event enriched with the customer's segment and region (from the \`customers\` table in the same database), consumed by a recommendation engine that requires all events of **one customer in order**.

**Facts and constraints**
- Kafka delivers **at least once**: after a rebalance or a crash, events are delivered again.
- Producers occasionally publish an older version after a newer one (retries on the producer side).
- Some events are malformed (missing \`customerId\`), roughly 1 in 50,000.
- PostgreSQL has a planned 10-minute maintenance window every month; no events may be lost.

**Design the flow(s).**
`,
  answerTemplate: `## Consuming (group, partitions, commits)

## Idempotent upsert in PostgreSQL

## Out-of-order and duplicate events

## Enrichment and re-publishing (key choice)

## Poison events

## Database outages
`,
  keyPoints: [
    'Kafka Message Listener in a consumer group; records of one partition are processed in order and the offset is committed (AUTO) only when the flow completes successfully, giving at-least-once processing.',
    'INSERT ... ON CONFLICT (order_id) DO UPDATE ... WHERE orders.event_version <= EXCLUDED.event_version makes the write idempotent and ignores older versions.',
    'Allow the same version to be re-applied (<=, not <): a redelivery after a failed publish then publishes again instead of losing the enriched event.',
    'Publish the enriched event keyed by customerId so all events of one customer land on the same partition and stay ordered for the recommendation engine.',
    'Poison events (validation/data errors) go to a dead-letter topic via On Error Continue, so the partition is not blocked.',
    'Transient errors (DB:CONNECTIVITY) use On Error Propagate: AUTO commits only when the flow succeeds, so the offset is not committed. The docs do not describe how the record is delivered again, so test that during an outage; reconnection settings stop a tight failure loop.',
  ],
  solution: `
**Flow \`order-events-projection\`**
1. **Kafka Message Listener** — consumer config with topic \`orders.v1\` and group \`order-projection\`; AUTO acknowledgement so offsets are committed after successful processing. Up to 12 consumers in total (one per partition) across replicas.
2. **Transform** the event into typed values, parsing it with \`read(payload, "application/json")\` because the listener's output is Binary; **Validate** \`orderId\` and \`customerId\` are present.
3. **Database Insert** (PostgreSQL via generic JDBC connection) with \`ON CONFLICT (order_id) DO UPDATE ... WHERE orders.event_version <= EXCLUDED.event_version\`, all values as \`:named\` parameters (the raw event stored as \`jsonb\`).
   - Newer or equal version → 1 row affected.
   - Older version → 0 rows: the event is stale.
4. **Choice** \`affectedRows > 0\` → **Select** the customer → **Transform** the enriched event → **Kafka Publish** \`orders.enriched.v1\` **key = customerId**. Otherwise log and skip.
5. **Error handling**
   - \`DB:CONNECTIVITY\` / \`KAFKA:CONNECTIVITY\` → **On Error Propagate**: the offset is not committed. The docs do not say how the listener then re-reads the record, so test it, because no event may be lost during the maintenance window. Configure reconnection with back-off and alert on consumer lag.
   - Anything else (validation, bad data, \`DB:QUERY_EXECUTION\` from a constraint) → **On Error Continue**: publish \`{ error, original }\` to \`orders.v1.dlt\` and commit, so one bad record does not stop the partition.

**Ordering:** input is keyed by \`orderId\` (order of one order preserved); output is re-keyed by \`customerId\`. Because one customer's orders can come from different input partitions, two of that customer's orders are only ordered as they are processed — acceptable since each event carries its own order version.

**Dual write:** database commit and Kafka publish are not atomic. With the \`<=\` rule a crash between them leads to a redelivery that re-publishes (at least once downstream). If even that is not acceptable, use a transactional outbox table drained by a separate flow.
`,
  followUps: [
    {
      q: 'Why not use the Idempotent Message Validator with an object store instead of ON CONFLICT?',
      a: 'The database is the system of record here; ON CONFLICT with a version check handles duplicates and out-of-order events in one atomic statement. An object store would add a second state that can disagree with the table and does not understand versions.',
    },
    {
      q: 'What happens to consumer lag during the 10-minute PostgreSQL maintenance?',
      a: 'If the consumers stop progressing while the failing record is retried (confirm this in a test), lag grows to ~240,000 events at peak, and they catch up after the window. Size the consumers so catch-up time is acceptable and alert on lag only beyond the maintenance window.',
    },
    {
      q: 'How do you scale beyond 400 events/s?',
      a: 'Parallelism is capped by the number of partitions: add partitions (keeping the key) and consumers, batch database writes per poll if latency allows, and make sure the database connection pool matches the number of concurrent consumers.',
    },
    {
      q: 'The recommendation engine wants exactly once. Can Mule give it that?',
      a: 'Not end to end across PostgreSQL and Kafka without an outbox. The practical answer is at-least-once with an idempotent consumer: the enriched event carries orderId + version, so the engine can drop what it has already seen.',
    },
  ],
}

import { design, flow, handler, route, router, scope, source, step, subFlow } from '../../flow/dsl.js'

// A forward saga step: idempotent call + saga row update in a Try; any failure becomes SAGA:STEP_FAILED.
const sagaStep = (name, method, path, column, status) =>
  flow(name, null, [
    scope('try', { transactionalAction: 'INDIFFERENT' }, [
      step('http-request', { method, path, responseTimeout: 5000 }),
      step('db-update', { sql: `UPDATE saga SET ${column} = :resultId, status = '${status}' WHERE saga_id = :sagaId` }),
    ], {
      errorHandlers: [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('raise-error', { type: 'SAGA:STEP_FAILED', description: `${name} failed` }),
        ]),
      ],
    }),
  ])

// An idempotent compensation; if it fails, it is queued for retry instead of being lost.
const undoStep = (name, method, path, stepName) =>
  subFlow(name, [
    scope('try', { transactionalAction: 'INDIFFERENT' }, [step('http-request', { method, path, responseTimeout: 5000 })], {
      errorHandlers: [
        handler('on-error-continue', { type: 'ANY' }, [
          step('db-update', { sql: "UPDATE saga SET status = 'COMPENSATION_PENDING' WHERE saga_id = :sagaId" }),
          step('transform', {
            script: `%dw 2.0\noutput application/json\n---\n{\n  sagaId: vars.sagaId,\n  step: "${stepName}"\n}`,
          }),
          step('mq-publish', { destination: 'saga-compensation-retry' }),
        ]),
      ],
    }),
  ])

export default {
  id: 'fl-024',
  category: 'flows',
  title: 'Saga with Compensation Across Payment, Inventory and Shipping',
  level: 'EXPERT',
  tags: ['saga', 'compensation', 'orchestration', 'consistency', 'error-handling'],
  estMinutes: 60,
  flowChecks: [
    { label: 'Checkout is exposed through an HTTP Listener (the orchestrator)', rule: { type: 'source', component: 'http-listener' } },
    {
      label: 'Saga state is persisted before the first remote step',
      rule: { type: 'before', first: ['db-insert', 'os-store'], then: ['http-request', 'flow-ref'] },
    },
    { label: 'Steps and compensations are separate flows reached via Flow Reference', rule: { type: 'refs' } },
    { label: 'Each remote step call is wrapped in a Try scope', rule: { type: 'inside', component: 'http-request', within: 'try' } },
    { label: 'A failed step raises a custom saga error', rule: { type: 'exists', component: 'raise-error' } },
    {
      label: 'An error handler triggers compensation via Flow Reference',
      rule: { type: 'inside', component: 'flow-ref', within: ['on-error-propagate', 'on-error-continue'] },
    },
    {
      label: 'A failed compensation is queued for retry instead of being lost',
      rule: { type: 'inside', component: ['mq-publish', 'vm-publish', 'jms-publish'], within: ['on-error-continue', 'on-error-propagate'] },
    },
    { label: 'A Scheduler recovers sagas stuck after a crash', rule: { type: 'source', component: 'scheduler' } },
  ],
  referenceFlow: design(
    flow(
      'checkout-orchestrator',
      source('http-listener', { path: '/checkout', allowedMethods: 'POST' }),
      [
        step('set-variable', { variableName: 'sagaId', value: '#[uuid()]' }),
        step('db-insert', { sql: "INSERT INTO saga (saga_id, status, created_at) VALUES (:sagaId, 'STARTED', CURRENT_TIMESTAMP)" }),
        step('flow-ref', { name: 'step-inventory' }),
        step('flow-ref', { name: 'step-payment' }),
        step('flow-ref', { name: 'step-shipping' }),
        step('db-update', { sql: "UPDATE saga SET status = 'COMPLETED' WHERE saga_id = :sagaId" }),
        step('transform', {
          script: '%dw 2.0\noutput application/json\n---\n{\n  sagaId: vars.sagaId,\n  status: "COMPLETED"\n}',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'SAGA:STEP_FAILED' }, [
          step('flow-ref', { name: 'compensate' }),
          step('set-variable', { variableName: 'httpStatus', value: '409' }),
          step('transform', {
            script: '%dw 2.0\noutput application/json\n---\n{\n  sagaId: vars.sagaId,\n  status: "FAILED"\n}',
          }),
        ]),
      ],
    ),
    sagaStep('step-inventory', 'POST', '/reservations', 'reservation_id', 'INVENTORY_DONE'),
    sagaStep('step-payment', 'POST', '/authorisations', 'authorisation_id', 'PAYMENT_DONE'),
    sagaStep('step-shipping', 'POST', '/bookings', 'booking_id', 'SHIPPING_DONE'),
    flow('compensate', null, [
      step('db-select', { sql: 'SELECT * FROM saga WHERE saga_id = :sagaId' }),
      step('transform', {
        script:
          '%dw 2.0\noutput application/java\nvar row = payload[0]\n---\n[\n  { step: "INVENTORY", id: row.reservation_id },\n  { step: "PAYMENT", id: row.authorisation_id }\n] filter ((s) -> s.id != null) then ((done) -> if (isEmpty(done)) [] else done[-1 to 0])',
      }),
      scope('foreach', { collection: '#[payload]', batchSize: 1 }, [
        router(
          'choice',
          {},
          [
            route({ expression: '#[payload.step == "PAYMENT"]' }, [step('flow-ref', { name: 'undo-payment' })]),
            route({ expression: '#[payload.step == "INVENTORY"]' }, [step('flow-ref', { name: 'undo-inventory' })]),
          ],
          { otherwise: [step('logger', { level: 'WARN', message: '#["Nothing to compensate for " ++ payload.step]' })] },
        ),
      ]),
      step('db-update', { sql: "UPDATE saga SET status = 'COMPENSATED' WHERE saga_id = :sagaId AND status <> 'COMPENSATION_PENDING'" }),
    ]),
    undoStep('undo-payment', 'POST', '/authorisations/{id}/void', 'PAYMENT'),
    undoStep('undo-inventory', 'DELETE', '/reservations/{id}', 'INVENTORY'),
    flow(
      'compensation-retry-worker',
      source('mq-subscriber', { destination: 'saga-compensation-retry', acknowledgementMode: 'MANUAL' }),
      [
        step('set-variable', { variableName: 'ackToken', value: '#[attributes.ackToken]' }),
        step('set-variable', { variableName: 'sagaId', value: '#[payload.sagaId]' }),
        step('flow-ref', { name: 'compensate' }),
        step('mq-ack', { ackToken: '#[vars.ackToken]' }),
      ],
      [handler('on-error-continue', { type: 'ANY' }, [step('mq-nack', { ackToken: '#[vars.ackToken]' })])],
    ),
    flow('saga-recovery', source('scheduler', { strategy: 'fixed-frequency', frequency: 1, timeUnit: 'MINUTES' }), [
      step('db-select', {
        sql: "SELECT saga_id FROM saga WHERE status NOT IN ('COMPLETED', 'COMPENSATED', 'FAILED') AND created_at < CURRENT_TIMESTAMP - INTERVAL '2' MINUTE",
      }),
      scope('foreach', { collection: '#[payload]', batchSize: 1 }, [
        step('set-variable', { variableName: 'sagaId', value: '#[payload.saga_id]' }),
        step('flow-ref', { name: 'compensate' }),
      ]),
    ]),
  ),
  description: `
A **Checkout Process API** must complete three steps in three independent systems, each with its own database and REST API:

1. **Payment service:** authorise card (\`POST /authorisations\`, reversible via \`POST /authorisations/{id}/void\`).
2. **Inventory service:** reserve stock (\`POST /reservations\`, reversible via \`DELETE /reservations/{id}\`).
3. **Shipping service:** book a courier slot (\`POST /bookings\`, cancellable only within 30 min).

No distributed transaction (XA) is possible across these HTTP APIs.

**Requirements**
- No customer is charged without stock and a booking.
- A failure in step 3 must undo steps 1–2.
- Compensations themselves can fail.
- The process must survive a Mule replica crash mid-saga.
- Ops must see stuck sagas.

**Design the flow(s):**
- Orchestration vs choreography
- Step order
- Compensation logic
- Saga state persistence
- Recovery after crash
- Idempotency
`,
  answerTemplate: `## Orchestration or choreography

## Step order

## Saga state

## Forward flow

## Compensation flow

## Crash recovery

## Idempotency and observability
`,
  keyPoints: [
    'Explains why XA/2PC is not available over HTTP and a saga (sequence of local transactions with compensating actions) is used instead.',
    'Saga state (sagaId, completed steps, their resource IDs, status) is persisted after each step in a durable store (DB or persistent Object Store).',
    'On failure, compensations run in reverse order for completed steps only (void authorisation, release reservation).',
    'Every forward and compensating call carries an idempotency key (sagaId + step) so retries and recovery replays are safe.',
    'Failed compensations are retried asynchronously and, if still failing, parked for manual action with alerts.',
    'A recovery job resumes or compensates sagas stuck in an intermediate state after a crash.',
  ],
  solution: `
**Choice: orchestration.** One Process API owns the workflow — easier to reason about, monitor and change than choreography (each service reacting to events) for a 3-step checkout.

**Step order:** do the cheapest-to-undo / most-likely-to-fail steps first: reserve inventory → authorise payment → book shipping. (Authorisation is reversible; a capture would not be, so capture happens later, after shipping.)

**Forward flow**
1. HTTP Listener \`POST /checkout\` → generate \`sagaId\` → **insert saga row** \`{ sagaId, status: STARTED, steps: [] }\` (Database).
2. Flow-ref \`step-inventory\`: HTTP Request with header \`Idempotency-Key: sagaId-inventory\` → on success update saga row with \`reservationId\`, \`status: INVENTORY_DONE\`.
3. \`step-payment\` → store \`authorisationId\`, \`PAYMENT_DONE\`.
4. \`step-shipping\` → store \`bookingId\`, \`COMPLETED\` → 201 response.
Each step is a private flow with a **Try scope**; errors raise \`SAGA:STEP_FAILED\` carrying which step failed.

**Compensation flow**
5. Flow error handler (On Error Propagate for \`SAGA:STEP_FAILED\`) → flow-ref \`compensate\`: read saga row, DataWeave builds the list of completed steps **in reverse**, For Each → Choice per step → void authorisation / delete reservation (each idempotent, inside its own Try).
6. If a compensation fails: mark saga \`COMPENSATION_PENDING\` and publish \`{ sagaId, step }\` to an **Anypoint MQ** retry queue with DLQ; a worker keeps retrying with backoff. After max retries, the DLQ + alert means manual intervention.
7. Respond to the client 409/502 with \`{ sagaId, status: "FAILED" }\`.

**Crash recovery:** a **Scheduler** flow every minute selects sagas not in a terminal state and older than N seconds. Policy: compensate them (simplest and safe because every call is idempotent), or resume forward if the step's outcome can be queried. Use a lock/primary-node scheduling so only one replica recovers.

**Observability:** saga table doubles as an audit log; dashboards for counts by status; correlation ID = sagaId in all logs and downstream headers.
`,
  followUps: [
    { q: 'Why not use a Mule XA transaction?', a: 'XA only works with transactional resources like JMS, VM and JDBC that support it; HTTP APIs cannot enlist in a two-phase commit. Sagas give eventual consistency through compensations instead.' },
    { q: 'What if the void authorisation call times out — did it happen or not?', a: 'Treat it as unknown and retry with the same idempotency key; the payment service returns the original result if it already processed it.' },
    { q: 'When would you prefer choreography?', a: 'When many independently owned services react to business events and no single team should own the workflow; it reduces coupling but makes end-to-end tracking harder.' },
    { q: 'How do you handle the shipping booking that is only cancellable within 30 minutes?', a: 'Do it last so it rarely needs undoing, and if compensation happens after the window, raise a manual task or business-level compensation (e.g. absorb the cost) rather than a technical rollback.' },
  ],
}

import { design, flow, handler, route, router, scope, source, step, subFlow } from '../../flow/dsl.js'

// A forward saga step: idempotent call + saga row update in a Try; any failure becomes SAGA:STEP_FAILED.
const sagaStep = (name, method, path, column, status) =>
  flow(name, null, [
    scope('try', { transactionalAction: 'INDIFFERENT' }, [
      step('http-request', { method, path, responseTimeout: 5000 }),
      // Each service answers { id }; keep it for the saga row.
      step('set-variable', { variableName: 'resultId', value: '#[payload.id]' }),
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

const CHECKOUT = { orderId: 'ORD-55120', customerId: 'C-881', items: [{ sku: 'SKU-100', qty: 2 }], amount: 59.9, cardToken: 'tok_4f9a' }

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
    {
      label: 'Stock is reserved before the card is authorised',
      rule: {
        type: 'any',
        rules: [
          {
            type: 'before',
            first: 'flow-ref',
            firstWhere: { name: { oneOf: ['inventory', 'reserv', 'stock'] } },
            then: 'flow-ref',
            thenWhere: { name: { oneOf: ['payment', 'authori'] } },
            outside: true,
          },
          {
            type: 'before',
            first: 'http-request',
            firstWhere: { path: 'reservations' },
            then: 'http-request',
            thenWhere: { path: 'authorisations' },
            outside: true,
          },
        ],
      },
    },
    { label: 'Each remote step call is wrapped in a Try scope', rule: { type: 'inside', component: 'http-request', within: 'try' } },
    {
      label: 'The reservation id and the authorisation id are saved to the saga store after their steps',
      rule: {
        type: 'all',
        rules: [
          {
            type: 'before',
            first: 'http-request',
            firstWhere: { method: 'POST', path: 'reservations' },
            then: ['db-update', 'db-insert', 'os-store'],
            thenWhere: { sql: { not: 'COMPENSAT' } },
          },
          {
            type: 'before',
            first: 'http-request',
            firstWhere: { method: 'POST', path: { all: ['authorisations'], not: 'void' } },
            then: ['db-update', 'db-insert', 'os-store'],
            thenWhere: { sql: { not: 'COMPENSAT' } },
          },
        ],
      },
    },
    {
      label: 'The saga is marked COMPLETED after the last step',
      rule: {
        type: 'any',
        rules: [
          { type: 'before', first: ['flow-ref', 'http-request'], then: 'db-update', thenWhere: { sql: 'COMPLETED' }, outside: true },
          { type: 'before', first: ['flow-ref', 'http-request'], then: 'os-store', thenWhere: { value: 'COMPLETED' }, outside: true },
        ],
      },
    },
    {
      label: 'Every failed step leads to compensation: each step raises the saga error, or the orchestrator catches any error',
      rule: {
        type: 'any',
        rules: [
          { type: 'inside', component: 'raise-error', within: ['on-error-propagate', 'on-error-continue'], min: 3 },
          { type: 'inside', component: 'flow-ref', within: ['on-error-propagate', 'on-error-continue'], withinWhere: { type: 'ANY' } },
        ],
      },
    },
    {
      label: 'An error handler triggers compensation via Flow Reference',
      rule: { type: 'inside', component: 'flow-ref', within: ['on-error-propagate', 'on-error-continue'] },
    },
    {
      label: 'The payment is undone with POST /authorisations/{id}/void',
      rule: { type: 'exists', component: 'http-request', where: { method: 'POST', path: 'void' } },
    },
    {
      label: 'The reservation is undone with DELETE /reservations/{id}',
      rule: { type: 'exists', component: 'http-request', where: { method: 'DELETE', path: 'reservations' } },
    },
    {
      label: 'A failed compensation is queued for retry instead of being lost',
      rule: { type: 'inside', component: ['mq-publish', 'vm-publish', 'jms-publish'], within: ['on-error-continue', 'on-error-propagate'] },
    },
    {
      label: 'A failed compensation marks the saga COMPENSATION_PENDING so ops can see it',
      rule: {
        type: 'any',
        rules: [
          { type: 'inside', component: 'db-update', where: { sql: 'PENDING' }, within: ['on-error-continue', 'on-error-propagate'] },
          { type: 'inside', component: 'os-store', where: { value: 'PENDING' }, within: ['on-error-continue', 'on-error-propagate'] },
        ],
      },
    },
    {
      label: 'The retry worker acks a message after the compensation runs and nacks it when it fails',
      rule: {
        type: 'any',
        rules: [
          {
            type: 'all',
            rules: [
              { type: 'before', first: ['flow-ref', 'http-request'], then: 'mq-ack', outside: true },
              { type: 'inside', component: 'mq-nack', within: ['on-error-continue', 'on-error-propagate'] },
            ],
          },
          {
            type: 'all',
            rules: [
              { type: 'before', first: ['flow-ref', 'http-request'], then: 'jms-ack', outside: true },
              { type: 'inside', component: 'jms-recover-session', within: ['on-error-continue', 'on-error-propagate'] },
            ],
          },
          { type: 'source', component: 'vm-listener' },
        ],
      },
    },
    {
      label: 'A Scheduler recovers sagas stuck after a crash, read from the saga store',
      rule: { type: 'before', first: 'scheduler', then: ['db-select', 'os-retrieve'] },
    },
  ],
  simulation: {
    systems: {
      http: [
        { method: 'POST', path: '/reservations', latencyMs: 120, respond: { status: 201, body: { id: 'RSV-301' } } },
        { method: 'POST', path: '/authorisations', latencyMs: 300, respond: { status: 201, body: { id: 'AUTH-7701' } } },
        { method: 'POST', path: '/bookings', latencyMs: 250, respond: { status: 201, body: { id: 'BK-9001' } } },
        { method: 'POST', path: '/authorisations/{id}/void', respond: { status: 200, body: { voided: true } } },
        { method: 'DELETE', path: '/reservations/{id}', respond: { status: 204, body: null } },
      ],
      db: {
        tables: {
          saga: { columns: ['saga_id', 'status', 'reservation_id', 'authorisation_id', 'booking_id', 'created_at'], key: 'saga_id', rows: [] },
        },
      },
    },
    tests: [
      {
        name: 'A checkout goes through',
        about: 'Stock, payment and shipping all succeed, and the saga ends COMPLETED.',
        trigger: { http: { method: 'POST', path: '/checkout', body: CHECKOUT } },
        expect: {
          bodyHas: { status: 'COMPLETED' },
          calls: [
            { method: 'POST', path: '/reservations', count: 1 },
            { method: 'POST', path: '/authorisations', count: 1 },
            { method: 'POST', path: '/bookings', count: 1 },
          ],
          db: { saga: { count: 1, has: [{ status: 'COMPLETED', reservation_id: 'RSV-301', authorisation_id: 'AUTH-7701' }] } },
        },
      },
      {
        name: 'Shipping fails',
        about: 'No courier slot is free, so the payment is voided and the stock released.',
        trigger: { http: { method: 'POST', path: '/checkout', body: CHECKOUT } },
        overrides: { systems: { http: [{ method: 'POST', path: '/bookings', respond: { status: 503, body: { message: 'No slots' } } }] } },
        expect: {
          bodyLacks: { status: 'COMPLETED' },
          calls: [
            { method: 'POST', path: '/authorisations/AUTH-7701/void', count: 1 },
            { method: 'DELETE', path: '/reservations/RSV-301', count: 1 },
          ],
          db: { saga: { has: [{ status: 'COMPENSATED' }] } },
        },
      },
      {
        name: 'The card is declined',
        about: 'Payment fails after the stock was reserved. Only the reservation is undone, and shipping is never booked.',
        trigger: { http: { method: 'POST', path: '/checkout', body: CHECKOUT } },
        overrides: { systems: { http: [{ method: 'POST', path: '/authorisations', respond: { status: 402, body: { message: 'Card declined' } } }] } },
        expect: {
          bodyLacks: { status: 'COMPLETED' },
          calls: [
            { method: 'DELETE', path: '/reservations/RSV-301', count: 1 },
            { method: 'POST', path: '/authorisations/{id}/void', count: 0 },
            { method: 'POST', path: '/bookings', count: 0 },
          ],
          db: { saga: { has: [{ status: 'COMPENSATED' }] } },
        },
      },
      {
        name: 'The void fails once',
        about: 'Shipping fails and the first void call cannot reach the payment service. The retry voids the payment and the saga ends COMPENSATED.',
        trigger: { http: { method: 'POST', path: '/checkout', body: CHECKOUT } },
        overrides: {
          systems: {
            http: [
              { method: 'POST', path: '/bookings', respond: { status: 503, body: { message: 'No slots' } } },
              { method: 'POST', path: '/authorisations/{id}/void', responses: [{ fault: 'CONNECTIVITY' }, { status: 200, body: { voided: true } }] },
            ],
          },
        },
        expect: {
          bodyLacks: { status: 'COMPLETED' },
          calls: [{ method: 'POST', path: '/authorisations/AUTH-7701/void', count: 2 }],
          db: { saga: { has: [{ status: 'COMPENSATED' }] } },
        },
      },
      {
        name: 'The payment service stays down',
        about: 'Every void call fails. The saga must be left COMPENSATION_PENDING so ops can see it.',
        trigger: { http: { method: 'POST', path: '/checkout', body: CHECKOUT } },
        overrides: {
          systems: {
            http: [
              { method: 'POST', path: '/bookings', respond: { status: 503, body: { message: 'No slots' } } },
              { method: 'POST', path: '/authorisations/{id}/void', respond: { fault: 'CONNECTIVITY' } },
            ],
          },
        },
        expect: { bodyLacks: { status: 'COMPLETED' }, db: { saga: { has: [{ status: 'COMPENSATION_PENDING' }] } } },
      },
    ],
  },
  optionalSteps: [
    {
      type: 'on-error-continue',
      flow: 'undo-inventory',
      why: 'Queueing a failed compensation for retry is checked once. One Try per compensation is a good habit, but a single Try around each loop pass also works.',
    },
    {
      type: 'mq-publish',
      why: 'Queueing a failed compensation for retry is checked once. Each compensation can have its own copy, or one shared handler can do it.',
    },
    {
      type: 'db-update',
      flow: 'undo-inventory',
      why: 'Marking the saga COMPENSATION_PENDING is checked once. Each compensation can have its own copy, or one shared handler can do it.',
    },
    {
      type: 'db-update',
      flow: 'step-shipping',
      why: 'Shipping is the last step and is never compensated, so its booking id is not needed to undo anything. The saga is marked COMPLETED right after it.',
    },
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
      // A retry starts from COMPENSATING, so a compensation that now succeeds can end the saga as COMPENSATED.
      step('db-update', { sql: "UPDATE saga SET status = 'COMPENSATING' WHERE saga_id = :sagaId" }),
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

- **Inventory service:** reserve stock (\`POST /reservations\`, reversible via \`DELETE /reservations/{id}\`).
- **Payment service:** authorise card (\`POST /authorisations\`, reversible via \`POST /authorisations/{id}/void\`).
- **Shipping service:** book a courier slot (\`POST /bookings\`, cancellable only within 30 min).

Each service answers with the new resource's \`id\`. No distributed transaction (XA) is possible across these HTTP APIs.

**Requirements**
- The checkout starts with \`POST /checkout\` and answers \`{ sagaId, status }\`, with \`status: "COMPLETED"\` on success.
- No customer is charged without stock and a booking. The payment team only wants a card authorised once the stock is held.
- A failure in a later step must undo the earlier steps that succeeded, and nothing else.
- Compensations themselves can fail. A failed one must be retried, not lost.
- The process must survive a Mule replica crash mid-saga.
- Ops must see stuck sagas. Keep the saga in the table \`saga\` (\`saga_id\`, \`status\`, \`reservation_id\`, \`authorisation_id\`, \`booking_id\`, \`created_at\`). A saga row ends as \`COMPLETED\` or \`COMPENSATED\`, and one whose compensation failed is marked \`COMPENSATION_PENDING\`.

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
**Choice: orchestration.** One Process API owns the workflow. That is clearer to reason about, monitor and change than choreography (each service reacting to events) for a 3-step checkout.

**Step order:** do the cheapest-to-undo / most-likely-to-fail steps first: reserve inventory → authorise payment → book shipping. (Authorisation is reversible; a capture would not be, so capture happens later, after shipping.)

**Forward flow**
1. HTTP Listener \`POST /checkout\` → generate \`sagaId\` → **insert saga row** \`{ sagaId, status: STARTED, steps: [] }\` (Database).
2. Flow-ref \`step-inventory\`: HTTP Request with header \`Idempotency-Key: sagaId-inventory\` → on success update saga row with \`reservationId\`, \`status: INVENTORY_DONE\`.
3. \`step-payment\` → store \`authorisationId\`, \`PAYMENT_DONE\`.
4. \`step-shipping\` → store \`bookingId\`, \`COMPLETED\` → 201 response.
Each step is a private flow with a **Try scope**; errors raise \`SAGA:STEP_FAILED\` carrying which step failed.

**Compensation flow**
5. Flow error handler (On Error Propagate for \`SAGA:STEP_FAILED\`) → flow-ref \`compensate\`: mark the saga \`COMPENSATING\`, read saga row, DataWeave builds the list of completed steps **in reverse**, For Each → Choice per step → void authorisation / delete reservation (each idempotent, inside its own Try).
6. If a compensation fails: mark saga \`COMPENSATION_PENDING\` and publish \`{ sagaId, step }\` to an **Anypoint MQ** retry queue with DLQ; a worker keeps retrying with backoff by running \`compensate\` again. Because \`compensate\` starts by setting \`COMPENSATING\`, a retry that now works ends the saga \`COMPENSATED\`; without that reset the saga would stay \`COMPENSATION_PENDING\` for ever. After max retries, the DLQ + alert means manual intervention.
7. Respond to the client 409/502 with \`{ sagaId, status: "FAILED" }\`.

**Crash recovery:** a **Scheduler** flow every minute selects sagas not in a terminal state and older than N seconds. Policy: compensate them (the least work, and safe because every call is idempotent), or resume forward if the step's outcome can be queried. Use a lock/primary-node scheduling so only one replica recovers.

**Observability:** saga table doubles as an audit log; dashboards for counts by status; correlation ID = sagaId in all logs and downstream headers.
`,
  followUps: [
    { q: 'Why not use a Mule XA transaction?', a: 'XA only works with transactional resources like JMS, VM and JDBC that support it; HTTP APIs cannot enlist in a two-phase commit. Sagas give eventual consistency through compensations instead.' },
    { q: 'What if the void authorisation call times out? Did it happen or not?', a: 'Treat it as unknown and retry with the same idempotency key; the payment service returns the original result if it already processed it.' },
    { q: 'When would you prefer choreography?', a: 'When many independently owned services react to business events and no single team should own the workflow; it reduces coupling but makes end-to-end tracking harder.' },
    { q: 'How do you handle the shipping booking that is only cancellable within 30 minutes?', a: 'Do it last so it rarely needs undoing, and if compensation happens after the window, raise a manual task or business-level compensation (e.g. absorb the cost) rather than a technical rollback.' },
  ],
}

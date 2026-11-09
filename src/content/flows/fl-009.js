import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-009',
  category: 'flows',
  title: 'Fire-and-Forget Auditing: Async Scope vs VM Queue',
  level: 'INTERMEDIATE',
  tags: ['async', 'vm', 'fire-and-forget', 'reliability'],
  estMinutes: 20,
  flowChecks: [
    { label: 'The Payments API is an HTTP Listener', rule: { type: 'source', component: 'http-listener' } },
    {
      label: 'Variant A: the audit insert runs inside an Async scope, off the response path',
      rule: { type: 'inside', component: 'db-insert', within: 'async' },
    },
    {
      label: 'Variant A: audit errors are caught inside the Async scope (Try + On Error Continue)',
      rule: { type: 'handler', component: 'on-error-continue', within: 'async' },
    },
    {
      label: 'Variant B: the audit record is published to a VM queue only after the payment succeeds',
      rule: { type: 'before', first: 'http-request', then: 'vm-publish', outside: true },
    },
    {
      label: 'Variant B: the VM publish is not inside an Async scope, so the hand-off is not lost in memory',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'vm-publish' },
          { type: 'absent', component: 'vm-publish', within: 'async' },
        ],
      },
    },
    {
      label: 'Variant B: a VM Listener flow consumes the audit queue',
      rule: { type: 'source', component: 'vm-listener' },
    },
    {
      label: 'Variant B: the compliance insert runs in the VM Listener flow',
      rule: { type: 'before', first: 'vm-listener', then: 'db-insert' },
    },
    {
      label: 'Variant B: the VM Listener begins a transaction so failures return the message to the queue',
      rule: { type: 'source', component: 'vm-listener', where: { transactionalAction: 'ALWAYS_BEGIN' } },
    },
    {
      label: 'Variant B: a failed insert is not swallowed by On Error Continue, so the message is not lost',
      rule: {
        type: 'all',
        rules: [
          { type: 'source', component: 'vm-listener' },
          {
            type: 'absent',
            component: 'on-error-continue',
            where: { type: { oneOf: ['ANY', 'DB:'] } },
            inFlowWith: { component: 'vm-listener' },
          },
        ],
      },
    },
  ],
  referenceFlow: design(
    flow(
      'payments-api',
      source('http-listener', { path: '/payments', allowedMethods: 'POST' }),
      [
        step('validation', { check: 'json-schema', expression: '#[payload]', message: 'Invalid payment request' }),
        step('http-request', { method: 'POST', path: '/processor/payments', responseTimeout: 150 }),
        step('transform', {
          target: 'variable',
          variableName: 'auditRecord',
          script:
            '%dw 2.0\noutput application/json\n---\n{ paymentId: payload.id, amount: payload.amount, status: payload.status, correlationId: correlationId, at: now() }',
        }),
        // Variant A (analytics): fire-and-forget on a separate thread, losing records on a crash is acceptable
        scope('async', { maxConcurrency: 8 }, [
          scope('try', {}, [
            step('db-insert', {
              sql: 'INSERT INTO analytics_audit (payment_id, amount, status, correlation_id) VALUES (:paymentId, :amount, :status, :correlationId)',
            }),
          ], {
            errorHandlers: [
              handler('on-error-continue', { type: 'ANY' }, [
                step('logger', { level: 'WARN', message: '#["Analytics audit insert failed: " ++ error.description]' }),
              ]),
            ],
          }),
        ]),
        // Variant B (compliance): hand the record to a persistent VM queue, consumed below
        step('set-variable', { variableName: 'paymentResult', value: '#[payload]' }),
        step('set-payload', { value: '#[vars.auditRecord]' }),
        step('vm-publish', { queueName: 'auditQueue' }),
        step('set-payload', { value: '#[output application/json --- { paymentId: vars.paymentResult.id, status: vars.paymentResult.status }]' }),
      ],
    ),
    // The transaction starts on the listener: a Try scope transaction would not cover the consumed VM message.
    flow('audit-consumer', source('vm-listener', { queueName: 'auditQueue', transactionalAction: 'ALWAYS_BEGIN', transactionType: 'LOCAL' }), [
      step('db-insert', {
        sql: 'INSERT INTO compliance_audit (payment_id, amount, status, correlation_id) VALUES (:paymentId, :amount, :status, :correlationId)',
      }),
    ], [
      handler('on-error-propagate', { type: 'DB:CONNECTIVITY, DB:QUERY_EXECUTION' }, [
        step('logger', { level: 'ERROR', message: '#["Audit insert failed, rolling back to queue: " ++ error.description]' }),
      ]),
    ]),
  ),
  description: `
A **Payments API** (\`POST /payments\`, p95 must stay under **200 ms**) has to write an audit record for every request to a slow **Audit DB** (inserts take 150–400 ms).

Two variants of the requirement exist:
- **Variant A (marketing analytics):** losing a few audit records during a crash is acceptable.
- **Variant B (compliance audit):** every accepted payment **must** eventually have an audit record, even if the app restarts mid-way.

**Design the flow(s):**
- How do you take the audit insert out of the response path?
- Which approach fits Variant A and which fits Variant B, and why?
- What happens to errors in the audit path in each design?
`,
  answerTemplate: `## Taking audit out of the request path

## Variant A design

## Variant B design

## Error behaviour

## Limits of each approach
`,
  keyPoints: [
    'Async scope runs its processors on a separate thread and the main flow continues immediately without waiting for a result.',
    'Errors inside an Async scope do not propagate to the main flow; they must be handled inside the scope.',
    'Async scope work is in memory only and is lost if the app crashes or redeploys — acceptable for Variant A only.',
    'Variant B publishes to a persistent VM queue (or an external broker) and a separate VM Listener flow performs the insert.',
    'The VM consumer flow can use a transaction/redelivery so a failed insert is retried instead of lost.',
  ],
  solution: `
**Variant A – Async scope**
1. HTTP Listener \`POST /payments\` → validate → call payment processor → build response.
2. Inside the flow, an **Async** scope containing a Transform Message (build audit record in DataWeave) + Database Insert.
3. The main flow returns immediately; the Async scope uses its own thread. Optionally set \`maxConcurrency\` on the scope so a slow DB cannot exhaust threads.
4. Put a **Try / On Error Continue** inside the Async scope to log failed inserts — errors there never reach the caller.

**Variant B – VM queue**
1. Define a **VM config** with a queue \`auditQueue\`, \`queueType="PERSISTENT"\`.
2. Main flow: after the payment succeeds, **VM Publish** the audit record to \`auditQueue\` (fast, local) → respond.
3. Consumer flow: **VM Listener** on \`auditQueue\` → Database Insert. Use a transactional listener (\`transactionalAction="ALWAYS_BEGIN"\`) so that if the insert fails the message goes back to the queue; limit retries and route poison messages to an error table/log. A local transaction covers one connector, so the insert is not part of the VM transaction: make it idempotent, because a redelivery can repeat it.
4. Persistent VM queues survive a restart of that app; on CloudHub 1.0 enable persistent queues for the app (CloudHub 2.0 and Runtime Fabric do not support persistent queues — use Anypoint MQ there). In a Mule runtime cluster VM queues are shared across nodes.
5. If the audit must survive the *whole deployment* being lost, or be consumed by another app, use **Anypoint MQ/JMS** instead of VM.
`,
  followUps: [
    { q: 'Does the Async scope copy the variables of the main flow?', a: 'It receives a copy of the event at the moment it starts; changes made inside the Async scope are not visible to the main flow afterwards.' },
    { q: 'What happens if the audit DB is down for an hour in Variant B?', a: 'Messages accumulate in the persistent VM queue and are redelivered when the DB returns; you should size queue storage, cap redeliveries and alert on backlog.' },
    { q: 'Could you use VM Publish-Consume here?', a: 'No — Publish-Consume waits for a reply, which puts the slow insert back in the response path. Plain Publish is the fire-and-forget operation.' },
  ],
}

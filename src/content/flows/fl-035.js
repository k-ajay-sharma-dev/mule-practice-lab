import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-035',
  category: 'flows',
  title: 'Order Status Pipeline over Persistent VM Queues',
  level: 'ADVANCED',
  tags: ['vm', 'transactions', 'state-machine', 'decoupling', 'webhook', 'cloudhub'],
  estMinutes: 35,
  flowChecks: [
    { label: 'Status updates are received through an HTTP Listener', rule: { type: 'source', component: 'http-listener' } },
    {
      label: 'Intake, status processing and notification are separate flows',
      rule: { type: 'flows', kind: 'flow', min: 3 },
    },
    {
      label: 'Stages are connected through VM queues',
      rule: { type: 'source', component: 'vm-listener' },
    },
    {
      label: 'The intake flow publishes to a VM queue and answers without waiting for processing',
      rule: { type: 'before', first: 'vm-publish', then: ['set-variable', 'set-payload', 'transform'] },
    },
    {
      label: 'The status-processing consumer runs in a transaction so a failure redelivers the message',
      rule: { type: 'exists', component: 'vm-listener', where: { transactionalAction: 'ALWAYS_BEGIN' } },
    },
    {
      label: 'The current status is read before it is updated',
      rule: { type: 'before', first: 'db-select', then: 'db-update' },
    },
    {
      label: 'The update only happens for a valid status transition (inside a Choice)',
      rule: { type: 'inside', component: 'db-update', within: 'choice' },
    },
    {
      label: 'Customer notification and CRM update happen in a downstream stage',
      rule: { type: 'exists', component: ['email-send', 'sf-upsert', 'http-request'] },
    },
  ],
  referenceFlow: design(
    flow(
      'order-status-intake',
      source('http-listener', { path: '/api/orders/{orderId}/status', allowedMethods: 'POST' }),
      [
        step('validation', {
          check: 'is-true',
          expression: '#[["PICKED", "PACKED", "SHIPPED", "DELIVERED"] contains payload.status]',
          message: 'Unknown status',
        }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{ orderId: attributes.uriParams.orderId, status: payload.status, occurredAt: payload.occurredAt, trackingNo: payload.trackingNo }',
        }),
        step('vm-publish', { queueName: 'order-status-in' }),
        step('set-variable', { variableName: 'httpStatus', value: '#[202]' }),
        step('set-payload', { value: '#[{ accepted: true, correlationId: correlationId }]' }),
      ],
      [
        handler('on-error-propagate', { type: 'VALIDATION:INVALID_BOOLEAN' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[400]' }),
          step('set-payload', { value: '#[{ code: "INVALID_STATUS", message: error.description }]' }),
        ]),
      ],
    ),
    flow(
      'order-status-apply',
      source('vm-listener', { queueName: 'order-status-in', transactionalAction: 'ALWAYS_BEGIN', transactionType: 'LOCAL' }),
      [
        step('set-variable', { variableName: 'update', value: '#[payload]' }),
        step('db-select', { sql: 'SELECT status, status_changed_at FROM orders WHERE order_id = :orderId FOR UPDATE' }),
        step('set-variable', {
          variableName: 'allowed',
          value:
            '#[do { var order = ["NEW", "PICKED", "PACKED", "SHIPPED", "DELIVERED"] --- (order indexOf vars.update.status) > (order indexOf payload[0].STATUS) }]',
        }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[vars.allowed]' }, [
              step('db-update', {
                sql: 'UPDATE orders SET status = :status, status_changed_at = :occurredAt, tracking_no = :trackingNo WHERE order_id = :orderId',
              }),
              step('set-payload', { value: '#[vars.update]' }),
              step('vm-publish', { queueName: 'order-status-changed' }),
            ]),
          ],
          {
            otherwise: [
              step('logger', {
                level: 'WARN',
                message: '#["Ignoring out-of-order status " ++ vars.update.status ++ " for order " ++ vars.update.orderId]',
              }),
            ],
          },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Status update rolled back, VM will redeliver: " ++ error.description]' }),
        ]),
      ],
    ),
    flow(
      'order-status-notify',
      // Transacted too: without it a failed Salesforce call would lose the message instead of delaying it.
      source('vm-listener', { queueName: 'order-status-changed', transactionalAction: 'ALWAYS_BEGIN', transactionType: 'LOCAL' }),
      [
        step('set-variable', { variableName: 'update', value: '#[payload]' }),
        step('sf-upsert', { objectType: 'Order', externalIdField: 'Order_Number__c' }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[vars.update.status == "SHIPPED"]' }, [
              step('parse-template', { location: 'templates/order-shipped.html' }),
              step('email-send', { toAddresses: '#[vars.customerEmail]', subject: 'Your order is on its way' }),
            ]),
          ],
          { otherwise: [step('logger', { level: 'DEBUG', message: '#["No customer notification for status " ++ vars.update.status]' })] },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Notification failed for order " ++ (vars.update.orderId default "") ++ ": " ++ error.description]' }),
        ]),
      ],
    ),
  ),
  description: `
The warehouse management system calls a webhook for every order status change: **PICKED → PACKED → SHIPPED → DELIVERED**.

- ~**50 updates/s** at peak. The warehouse times out after **500 ms** and then retries, so the same update can arrive twice.
- Updates for one order can arrive **out of order** (e.g. PACKED after SHIPPED).
- Each accepted change must: update \`orders.status\` in the Order DB, upsert the Order in **Salesforce**, and email the customer when the order is **SHIPPED**. Salesforce sometimes takes 3–4 s.
- The app runs on **CloudHub 2.0 with 2 replicas**. No update may be lost if a replica restarts.
- The team does not want an external broker for this internal hand-off.

**Design the flow(s):**
- How do you answer the warehouse within 500 ms when Salesforce alone can take 4 s?
- How do you split the work into stages, and how are they connected?
- How do you guarantee that an accepted update is not lost if a replica crashes mid-processing?
- How do you deal with duplicates and out-of-order updates?
`,
  answerTemplate: `## Stages and flows

## Fast acknowledgement to the warehouse

## Durability and transactions

## Out-of-order and duplicate updates

## Notifications
`,
  keyPoints: [
    'The intake flow only validates, publishes to a VM queue and returns 202, so the warehouse gets its answer in milliseconds.',
    'VM queues decouple the stages without an external broker. CloudHub 2.0 has no disk-backed persistent VM queues, so enable clustering for the app: the replicas then share the VM queues in the cluster memory grid. That grid survives one replica restarting. It does not survive a stop of all replicas, which would need Anypoint MQ or a DB hand-off.',
    'The status-processing VM Listener uses a transaction (ALWAYS_BEGIN), so an error rolls back and the message is redelivered instead of lost.',
    'The current status is read (SELECT ... FOR UPDATE) and the update is applied only if the new status is later in the lifecycle, which makes duplicates and out-of-order updates harmless.',
    'Slow Salesforce and email work happens in a separate notification stage fed by a second VM queue, so it cannot slow down or roll back the status update.',
  ],
  solution: `
**1. \`order-status-intake\`**: HTTP Listener \`POST /api/orders/{orderId}/status\`:
- Validate the status value (400 on failure), normalise to \`{ orderId, status, occurredAt, trackingNo }\`.
- **VM Publish** \`order-status-in\` (a **persistent** queue) → \`202 Accepted\`. Typical latency is under 50 ms.
  (On CloudHub 2.0, enable **clustering** for the app: persistent queues are not available there as a disk store, but in cluster mode VM queues are kept in the shared memory grid, so a single replica restart loses nothing.)

**2. \`order-status-apply\`**: **VM Listener** \`order-status-in\`, \`transactionalAction=ALWAYS_BEGIN\` (LOCAL):
- **Database Select** current status \`FOR UPDATE\`.
- **Choice**: only if the new status is *later* in \`NEW < PICKED < PACKED < SHIPPED < DELIVERED\` → **Database Update** and **VM Publish** \`order-status-changed\`. A duplicate or older status → log WARN and drop it (still a successful commit).
- Any error → On Error Propagate → the VM transaction rolls back, and the message is redelivered.
  (A VM transaction and a DB connection are different resources. For strict atomicity you would need XA. In practice the idempotent "only move forward" check makes a redelivery safe. \`FOR UPDATE\` only holds its lock inside a database transaction, so without one treat it as a hint, not a guarantee.)

**3. \`order-status-notify\`**: **VM Listener** \`order-status-changed\`, also \`transactionalAction=ALWAYS_BEGIN\` so a failure redelivers instead of losing the update:
- Keep the update in \`vars.update\`, because the upsert replaces the payload.
- **Salesforce Upsert** Order on \`Order_Number__c\` (idempotent).
- **Choice**: SHIPPED → Parse Template → **Email Send**.

Using separate queues means a Salesforce outage only delays notifications. It never blocks status updates or the warehouse webhook.
`,
  followUps: [
    {
      q: 'Why not use an Async scope instead of VM queues?',
      a: 'Async keeps the work in memory on one replica. If that replica restarts, the work is lost, and there is no redelivery on failure. VM queues in a clustered app (or CloudHub 1.0 persistent queues) are shared between replicas/workers, survive a single node restarting and can be transactional. CloudHub 2.0 has no disk-backed persistent queues, so without clustering — or to survive a full stop — use Anypoint MQ.',
    },
    {
      q: 'When would you switch from VM to Anypoint MQ?',
      a: 'When other applications need to consume the events, when you need a DLQ, delayed delivery or replay, or when message volume/size exceeds what the VM store is meant for. VM queues are for communication inside one application.',
    },
    {
      q: 'How do you avoid redelivering a poison message forever?',
      a: 'Track the redelivery count (maxRedeliveryCount / a counter in Object Store) and after N attempts commit and park the message in a failed table or a "status-failed" queue for manual handling.',
    },
  ],
}

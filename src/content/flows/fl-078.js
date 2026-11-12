import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-078',
  category: 'flows',
  title: 'SQL Server Outbox to an Amazon SQS FIFO Queue and an Ordered Consumer with a DLQ',
  level: 'ADVANCED',
  tags: ['sqs', 'fifo', 'aws', 'sql-server', 'outbox', 'dead-letter', 'ordering', 'http'],
  estMinutes: 45,
  flowChecks: [
    { label: 'A scheduled relay drains the outbox', rule: { type: 'source', component: 'scheduler' } },
    {
      label: 'Pending outbox rows are read from SQL Server',
      rule: { type: 'exists', component: 'db-select', where: { database: 'SQL Server' } },
    },
    { label: 'Rows are sent one by one, in order, to the queue', rule: { type: 'inside', component: 'sqs-send', within: 'foreach' } },
    {
      label: 'A failed send stops the loop, so later events of the same order are not sent ahead of it',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'sqs-send', within: 'foreach' },
          { type: 'absent', component: 'on-error-continue', within: 'foreach' },
        ],
      },
    },
    { label: 'The target is a FIFO queue', rule: { type: 'exists', component: 'sqs-send', where: { queueUrl: '.fifo' } } },
    {
      label: 'Each message uses the order as its FIFO group and carries a deduplication ID',
      rule: { type: 'exists', component: 'sqs-send', where: { groupId: 'ORDER', deduplicationId: { set: true } } },
    },
    {
      label: 'An outbox row is marked as sent only after SQS accepted the message',
      rule: { type: 'before', first: 'sqs-send', then: 'db-update', thenWhere: { sql: 'SENT' }, every: true, outside: true },
    },
    {
      label: 'The consumer receives from SQS with Preserve Messages on, so a failed call does not lose the message',
      rule: { type: 'source', component: 'sqs-receive', where: { preserveMessages: 'true' } },
    },
    {
      label: 'The consumer takes one message per poll, so events of one order are not processed side by side',
      rule: { type: 'source', component: 'sqs-receive', where: { numberOfMessages: 1 } },
    },
    {
      label: 'The message is deleted from the queue only after the carrier accepted it',
      rule: { type: 'before', first: 'http-request', then: 'sqs-delete', outside: true },
    },
    {
      label: 'Permanent rejections from the carrier API (400) are recorded and the message is consumed',
      rule: {
        type: 'all',
        rules: [
          { type: 'handler', component: 'on-error-continue', errorType: 'HTTP:BAD_REQUEST' },
          { type: 'inside', component: 'sqs-delete', within: 'on-error-continue', withinWhere: { type: 'BAD_REQUEST' } },
        ],
      },
    },
    {
      label: 'Transient failures propagate so SQS redelivers the message (and finally moves it to the DLQ)',
      rule: {
        type: 'all',
        rules: [
          { type: 'handler', component: 'on-error-propagate' },
          { type: 'absent', component: 'on-error-continue', where: { type: 'ANY' }, inFlowWith: { component: 'sqs-receive' } },
        ],
      },
    },
    {
      label: 'The 400 handler comes before the catch-all, so a rejection does not block the order group',
      rule: {
        type: 'any',
        rules: [
          { type: 'before', first: 'on-error-continue', firstWhere: { type: 'BAD_REQUEST' }, then: 'on-error-propagate', thenWhere: { type: 'ANY' }, every: true },
          {
            type: 'all',
            rules: [
              { type: 'handler', component: 'on-error-continue', where: { type: 'BAD_REQUEST' } },
              { type: 'absent', component: 'on-error-propagate', where: { type: 'ANY' }, inFlowWith: { component: 'sqs-receive' } },
            ],
          },
        ],
      },
    },
  ],
  optionalSteps: [
    {
      type: 'on-error-propagate',
      why: 'These handlers only log and rethrow. Mule propagates errors by default, so the relay still stops and the consumer still leaves the message in SQS for redelivery.',
    },
  ],
  referenceFlow: design(
    flow(
      'shipment-outbox-relay',
      // One active relay (primary node / single replica) keeps the per-order sequence.
      source('scheduler', { strategy: 'fixed-frequency', frequency: 10, timeUnit: 'SECONDS' }),
      [
        step('db-select', {
          database: 'SQL Server',
          sql: "SELECT TOP (200) OUTBOX_ID, ORDER_ID, EVENT_TYPE, PAYLOAD\nFROM dbo.SHIPMENT_OUTBOX\nWHERE STATUS = 'PENDING'\nORDER BY OUTBOX_ID",
        }),
        // No Try: the first failure stops the loop, so later events of the same order are never sent ahead of it.
        scope('foreach', { collection: '#[payload]' }, [
          step('set-variable', { variableName: 'row', value: '#[payload]' }),
          step('sqs-send', { queueUrl: 'https://sqs.eu-west-1.amazonaws.com/123456789012/shipment-status.fifo', body: '#[payload.PAYLOAD]', groupId: '#[payload.ORDER_ID]', deduplicationId: '#[payload.OUTBOX_ID as String]' }),
          step('db-update', {
            database: 'SQL Server',
            sql: "UPDATE dbo.SHIPMENT_OUTBOX SET STATUS = 'SENT', SENT_AT = SYSUTCDATETIME() WHERE OUTBOX_ID = :outboxId",
          }),
        ]),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'WARN', message: '#["Outbox relay stopped at " ++ ((vars.row.OUTBOX_ID default "-") as String) ++ ": " ++ error.description]' }),
        ]),
      ],
    ),
    flow(
      'shipment-status-to-carrier',
      // Preserve Messages defaults to false, which deletes each message as soon as it is read.
      // One message per call: a FIFO batch can hold several messages of one group, which could then be processed out of order.
      source('sqs-receive', { queueUrl: 'https://sqs.eu-west-1.amazonaws.com/123456789012/shipment-status.fifo', numberOfMessages: 1, preserveMessages: 'true' }),
      [
        // The reference does not define the attributes of a received message: confirm this field name in a test.
        step('set-variable', { variableName: 'receipt', value: '#[attributes.receiptHandle]' }),
        step('transform', {
          target: 'variable',
          variableName: 'evt',
          script: '%dw 2.0\noutput application/java\n---\nread(payload, "application/json")',
        }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{\n  shipmentRef: vars.evt.orderId,\n  event: vars.evt.eventType,\n  occurredAt: vars.evt.occurredAt,\n  location: vars.evt.warehouse\n}',
        }),
        step('http-request', { method: 'POST', path: '/carrier/v2/shipment-events', responseTimeout: 10000 }),
        step('sqs-delete', { queueUrl: 'https://sqs.eu-west-1.amazonaws.com/123456789012/shipment-status.fifo', receiptHandle: '#[vars.receipt]' }),
      ],
      [
        // Never succeeds on retry: record for the support team, consume the message so the group is not blocked.
        handler('on-error-continue', { type: 'HTTP:BAD_REQUEST' }, [
          step('db-insert', {
            database: 'SQL Server',
            sql: 'INSERT INTO dbo.CARRIER_REJECTION (ORDER_ID, EVENT_TYPE, REASON, REJECTED_AT) VALUES (:orderId, :eventType, :reason, SYSUTCDATETIME())',
          }),
          step('sqs-delete', { queueUrl: 'https://sqs.eu-west-1.amazonaws.com/123456789012/shipment-status.fifo', receiptHandle: '#[vars.receipt]' }),
        ]),
        // 5xx, timeouts, connectivity: no delete, so the message stays in the queue, becomes visible again after the visibility
        // timeout and goes to shipment-status-dlq.fifo after maxReceiveCount (redrive policy).
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'WARN', message: '#["Carrier call failed for order " ++ (vars.evt.orderId default "?") ++ ", will be redelivered: " ++ error.description]' }),
        ]),
      ],
    ),
  ),
  description: `
A logistics company's warehouse system runs on **SQL Server**. When a shipment changes state (\`PICKED\`, \`PACKED\`, \`DISPATCHED\`, \`DELIVERED\`) the application writes a row to \`dbo.SHIPMENT_OUTBOX\` in the **same transaction** as the business change (~60,000 events/day). The events must reach a **parcel carrier's REST API**, which is hosted on AWS and has rate limits and occasional outages.

The architects decided on an **Amazon SQS FIFO queue** \`shipment-status.fifo\` between the two, with a dead-letter queue.

**Requirements**
- Events of **one order** must reach the carrier in the order they happened (\`DELIVERED\` before \`PACKED\` makes the carrier reject the shipment).
- No event may be lost or sent twice to the carrier when Mule restarts during sending.
- A carrier outage must not lose events: a message stays in SQS until the carrier has accepted it. Events that keep failing end up somewhere visible.
- Events the carrier rejects as invalid (400) must not block other orders.

**Design both flows** (outbox → SQS, SQS → carrier) and explain the FIFO-specific settings.
`,
  answerTemplate: `## Outbox relay (SQL Server → SQS)

## FIFO settings: group ID and deduplication

## Consumer flow (SQS → carrier)

## Retries, visibility timeout and DLQ

## Ordering pitfalls
`,
  keyPoints: [
    'The outbox (written in the same SQL Server transaction as the business change) avoids a dual write in the warehouse application.',
    'The relay reads PENDING rows ordered by OUTBOX_ID, sends each to the FIFO queue and marks it SENT only after SQS accepted it; a failure stops the loop so later events are not sent ahead.',
    'MessageGroupId = order ID keeps per-order ordering while different orders are processed in parallel; MessageDeduplicationId = outbox ID makes a resend after a crash a no-op within the 5-minute deduplication window.',
    'The Receive Messages source deletes a message as soon as it is read unless Preserve Messages is on. Turn it on and call Delete Message after success; a failed message is then left in the queue, reappears after the visibility timeout and moves to the FIFO DLQ after maxReceiveCount.',
    'Permanent 400 rejections are handled with On Error Continue: record them in a table and delete the message so its group is not blocked.',
    'A failing message blocks the rest of its message group until it succeeds or moves to the DLQ — this is the price of ordering; size the visibility timeout above the processing time and keep maxReceiveCount moderate.',
  ],
  solution: `
**Flow 1 — \`shipment-outbox-relay\`** (Scheduler, 10 s; a single active instance)
1. **Select** \`TOP (200)\` PENDING rows \`ORDER BY OUTBOX_ID\` from SQL Server.
2. **For Each** (sequential) → **SQS Send Message** to \`shipment-status.fifo\` with body = payload, **message group ID = ORDER_ID**, **deduplication ID = OUTBOX_ID** → **Update** the row to SENT.
3. No per-row Try: the first failure stops the loop; the remaining rows stay PENDING and are retried in order on the next run.
4. Crash after send but before the update → the row is sent again next run; SQS drops it because the deduplication ID was seen within 5 minutes. (After a longer outage the carrier side must tolerate a rare duplicate — include the outbox ID as event ID.)

**Flow 2 — \`shipment-status-to-carrier\`** (SQS Receive Messages)
1. **Preserve Messages = true** on the source. The default (false) deletes each message as soon as it is read, so a carrier failure would lose the event and the DLQ would never see it.
2. Keep the receipt handle (the reference does not define the attributes of a received message, so confirm the field name in a test). Parse the body, map to the carrier format, and **HTTP POST** with a response timeout.
3. Success → **SQS Delete Message** with the receipt handle.
4. **On Error Continue** \`HTTP:BAD_REQUEST\` → insert into \`dbo.CARRIER_REJECTION\` for support, then **Delete Message** so the order's group moves on.
5. **On Error Propagate** (ANY else: 429, 5xx, timeouts) → the message is not deleted, becomes visible again after the **visibility timeout** (set above the worst-case processing time) and after **maxReceiveCount** (e.g. 5) the redrive policy moves it to \`shipment-status-dlq.fifo\` (a FIFO queue needs a FIFO DLQ). Alert on DLQ depth.

**FIFO behaviour:** while a message of group \`ORDER-123\` is in flight or being retried, later requests do not get more messages of that group; other orders flow normally. One receive call can still return several messages of the same group. So the source reads one message per call (Number Of Messages 1, the default) to keep them from being processed side by side. FIFO queues also have lower throughput limits than standard queues (high-throughput mode raises them).
`,
  followUps: [
    {
      q: 'Why not let the warehouse application send to SQS directly?',
      a: 'Then the database commit and the SQS send are a dual write: a crash between them loses or invents an event. The outbox row commits with the business change, and the relay delivers it at least once.',
    },
    {
      q: 'What happens to an order whose message ended up in the DLQ?',
      a: 'Its later events can now be delivered ahead of the failed one, so the carrier may reject them. Either park the whole group (the consumer checks a "blocked orders" table) or have support replay the DLQ message first, then the rest.',
    },
    {
      q: 'How do you respect the carrier\'s rate limit?',
      a: 'Limit consumer concurrency (number of messages per poll and flow concurrency) and treat 429 as transient so the message is retried after the visibility timeout; an API-side rate limit is safer than trying to time calls exactly.',
    },
    {
      q: 'Would MessageGroupId = warehouse be a good choice?',
      a: 'It would keep ordering but serialise all events of a warehouse, so one stuck message blocks thousands of unrelated orders. Use the narrowest key that needs ordering: the order (or shipment) ID.',
    },
  ],
}

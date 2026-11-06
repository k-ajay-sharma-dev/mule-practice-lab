import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-065',
  category: 'flows',
  title: 'WMS Shipment Confirmations: ActiveMQ Redelivery, Parking and DLQ Replay',
  level: 'ADVANCED',
  tags: ['supply-chain', 'wms', 'shipping', 'activemq', 'jms', 'dlq', 'redelivery', 'oracle'],
  estMinutes: 40,
  flowChecks: [
    {
      label: 'Confirmations are consumed in a JMS transaction so a failure rolls the message back to the broker',
      rule: { type: 'source', component: 'jms-listener', where: { destination: 'SHIP.CONFIRM', transactionalAction: 'ALWAYS_BEGIN' } },
    },
    {
      label: 'Oracle is updated before the shipment event is published',
      rule: {
        type: 'before',
        first: ['db-update', 'db-bulk-update', 'db-insert'],
        then: 'jms-publish',
        thenWhere: { destination: 'SHIPMENT.EVENTS' },
        every: true,
      },
    },
    {
      label: 'Transient failures propagate (rollback → broker redelivery)',
      rule: { type: 'handler', component: 'on-error-propagate', where: { type: { oneOf: ['ANY', 'DB:'] } } },
    },
    {
      label: 'Non-retryable data errors are parked at once instead of burning redeliveries',
      rule: {
        type: 'inside',
        component: 'jms-publish',
        within: 'on-error-continue',
        withinWhere: { type: { oneOf: ['VALIDATION', 'EXPRESSION', 'APP:'] } },
      },
    },
    {
      label: 'A re-sent shipment is not applied twice',
      rule: {
        type: 'any',
        rules: [
          { type: 'exists', component: 'on-error-continue', where: { type: 'QUERY_EXECUTION' } },
          { type: 'exists', component: 'idempotent' },
          { type: 'exists', component: ['db-update', 'db-insert', 'db-bulk-update'], where: { sql: 'MERGE' } },
        ],
      },
    },
    {
      label: 'A separate replay flow exists',
      rule: { type: 'flows', kind: 'flow', min: 2 },
    },
    {
      label: 'The replay flow reads the dead-letter queue with JMS Consume',
      rule: { type: 'exists', component: 'jms-consume', where: { destination: 'DLQ' } },
    },
    {
      label: 'Replayed messages are republished to the original queue',
      rule: { type: 'before', first: 'jms-consume', then: 'jms-publish', thenWhere: { destination: 'SHIP.CONFIRM' } },
    },
    {
      label: 'Replay is bounded (a loop with a maximum count)',
      rule: { type: 'inside', component: 'jms-consume', within: ['foreach', 'until-successful'] },
    },
  ],
  referenceFlow: design(
    flow(
      'ship-confirm-intake',
      // ActiveMQ Classic redelivery policy: maximumRedeliveries 5, initialRedeliveryDelay 10 s, backOffMultiplier 3.
      // individualDeadLetterStrategy → DLQ.WMS.SHIP.CONFIRM (instead of the shared ActiveMQ.DLQ).
      source('jms-listener', { destination: 'WMS.SHIP.CONFIRM', ackMode: 'IMMEDIATE', transactionalAction: 'ALWAYS_BEGIN', transactionType: 'LOCAL' }),
      [
        // Saved now: the database operations below replace the attributes.
        step('set-variable', { variableName: 'deliveryCount', value: '#[attributes.properties.jmsxProperties.jmsxDeliveryCount default 1]' }),
        step('validation', { check: 'is-not-blank-string', expression: '#[payload.shipmentId]', message: 'shipmentId missing' }),
        step('transform', {
          target: 'variable',
          variableName: 'ship',
          script:
            '%dw 2.0\noutput application/java\n---\n{\n  shipmentId: payload.shipmentId,\n  orderId: payload.orderId,\n  carrier: payload.carrier.scac,\n  trackingNo: payload.carrier.trackingNumber,\n  shippedAt: payload.shippedAt as DateTime,\n  lines: payload.cartons flatMap ((c) -> c.items map ((i) -> {\n    orderId: payload.orderId,\n    lineNo: i.orderLine as Number,\n    shippedQty: i.qty as Number,\n    cartonId: c.sscc\n  }))\n}',
        }),
        // Unique SHIPMENT_ID → a re-sent confirmation fails and is treated as a duplicate.
        step('db-insert', {
          sql: 'INSERT INTO SHIPMENT (SHIPMENT_ID, ORDER_ID, CARRIER_SCAC, TRACKING_NO, SHIPPED_AT)\nVALUES (:shipmentId, :orderId, :carrier, :trackingNo, :shippedAt)',
        }),
        // Bulk Update reads its rows from #[payload] by default.
        step('set-payload', { value: '#[vars.ship.lines]' }),
        step('db-bulk-update', {
          sql: 'UPDATE ORDER_LINE SET SHIPPED_QTY = SHIPPED_QTY + :shippedQty, LAST_CARTON = :cartonId\nWHERE ORDER_ID = :orderId AND LINE_NO = :lineNo',
        }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{\n  eventType: "ORDER_SHIPPED",\n  orderId: vars.ship.orderId,\n  shipmentId: vars.ship.shipmentId,\n  carrier: vars.ship.carrier,\n  trackingNo: vars.ship.trackingNo,\n  shippedAt: vars.ship.shippedAt\n}',
        }),
        step('jms-publish', { destination: 'OMS.SHIPMENT.EVENTS' }),
      ],
      [
        // Duplicate shipment: already processed → commit.
        handler('on-error-continue', { type: 'DB:QUERY_EXECUTION', when: '#[error.description contains "ORA-00001"]' }, [
          step('logger', { level: 'WARN', message: '#["Duplicate shipment " ++ (vars.ship.shipmentId default "?") ++ " ignored"]' }),
        ]),
        // Bad data will never succeed: park it with the reason (publish joins the tx, commit removes the original).
        handler('on-error-continue', { type: 'VALIDATION:BLANK_STRING, MULE:EXPRESSION' }, [
          step('jms-publish', { destination: 'WMS.SHIP.CONFIRM.PARKED' }),
          step('logger', { level: 'ERROR', message: '#["Parked ship confirm: " ++ error.description]' }),
        ]),
        // Oracle down, lock timeouts, broker hiccups: roll back and let the broker redeliver → DLQ after 5.
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'WARN', message: '#["Rolling back ship confirm, delivery " ++ (vars.deliveryCount as String) ++ ": " ++ error.description]' }),
        ]),
      ],
    ),
    flow(
      'ship-confirm-dlq-replay',
      source('http-listener', { path: '/admin/ship-confirm/dlq/replay', allowedMethods: 'POST' }),
      [
        step('set-variable', { variableName: 'max', value: '#[(attributes.queryParams.max default "100") as Number]' }),
        step('set-variable', { variableName: 'replayed', value: '#[0]' }),
        scope('foreach', { collection: '#[1 to vars.max]' }, [
          scope(
            'try',
            { transactionalAction: 'ALWAYS_BEGIN' },
            [
              // maximumWait 1000 ms; consume + publish commit together (same broker, local tx).
              step('jms-consume', { destination: 'DLQ.WMS.SHIP.CONFIRM', ackMode: 'IMMEDIATE' }),
              step('jms-publish', { destination: 'WMS.SHIP.CONFIRM' }),
              step('set-variable', { variableName: 'replayed', value: '#[vars.replayed + 1]' }),
            ],
            {
              errorHandlers: [
                // Queue empty: nothing more to replay.
                handler('on-error-continue', { type: 'JMS:TIMEOUT' }, [step('logger', { level: 'DEBUG', message: 'DLQ empty' })]),
              ],
            },
          ),
        ]),
        step('set-payload', { value: '#[output application/json --- { replayed: vars.replayed }]' }),
      ],
    ),
  ),
  description: `
A 3PL's **WMS** sends a **shipment confirmation** (the JSON equivalent of an EDI 945) to **ActiveMQ Classic** queue \`WMS.SHIP.CONFIRM\` whenever a truck is loaded: shipment ID, order ID, carrier SCAC and tracking number, and cartons (SSCC) with order lines and quantities. About **25,000 confirmations/day**, peaking at 15/s at the evening cut-off.

For each confirmation the integration must:
1. Record the shipment and update shipped quantities on the order lines in **Oracle** (\`SHIPMENT\`, \`ORDER_LINE\`).
2. Publish an \`ORDER_SHIPPED\` event to \`OMS.SHIPMENT.EVENTS\` (customer emails, invoicing).

**Known problems today**
- Oracle has occasional lock timeouts and a weekly patch window → messages fail temporarily.
- The WMS sometimes sends malformed messages (missing shipment ID, bad dates) → they currently bounce 5 times and end up in \`ActiveMQ.DLQ\` mixed with every other queue's poison messages.
- The WMS sometimes **re-sends** the same shipment.
- Ops wants to **replay** dead-lettered confirmations after a fix, without a broker console.

**Design the flow(s).**
`,
  answerTemplate: `## Main flow and transaction

## Redelivery policy and DLQ

## Retryable vs non-retryable errors

## Duplicates

## Replay flow
`,
  keyPoints: [
    'JMS listener with a LOCAL transaction: the consumed message and the outgoing event commit together; a propagated error rolls back and the broker redelivers.',
    'ActiveMQ redelivery policy (maximumRedeliveries, back-off) bounds retries; an individualDeadLetterStrategy gives this queue its own DLQ instead of the shared ActiveMQ.DLQ.',
    'Non-retryable errors (validation, mapping) are published to a parking queue inside On Error Continue — retrying them only wastes time and delays the DLQ signal.',
    'A unique key on SHIPMENT_ID turns WMS re-sends into a duplicate-key error handled as "already processed".',
    'A replay flow consumes from the DLQ and republishes to the original queue in a local transaction, bounded by a maximum count, with JMS:TIMEOUT treated as an empty DLQ.',
    'JMSXDeliveryCount in the message properties shows how many times a message has been delivered — useful for logging and alerting.',
  ],
  solution: `
**Main flow \`ship-confirm-intake\`**
1. **JMS On New Message** \`WMS.SHIP.CONFIRM\`, **ALWAYS_BEGIN / LOCAL**, **Inbound Content-Type** \`application/json\` if the WMS does not state the message type (the config default is \`*/*\`).
2. **Validate** required fields; **Transform** to \`vars.ship\` (shipment + flattened carton lines).
3. **Database Insert** \`SHIPMENT\` (unique \`SHIPMENT_ID\`) and **Database Bulk Update** \`ORDER_LINE\` shipped quantities, then **JMS Publish** \`ORDER_SHIPPED\` (joins the JMS transaction). The DB statements are not in the JMS transaction. The unique key stops a double insert. But it also means a redelivery after a partial failure (shipment row committed, lines or event not done) lands on the duplicate path with the work unfinished. So record completion (e.g. an \`EVENT_SENT\` flag checked on that path) or use an outbox.

**Error handling — classify errors**
| Error | Handler | Effect |
|---|---|---|
| \`DB:QUERY_EXECUTION\` with ORA-00001 | On Error Continue | duplicate → commit, message gone |
| \`VALIDATION:*\`, \`MULE:EXPRESSION\` | On Error Continue + JMS Publish to \`WMS.SHIP.CONFIRM.PARKED\` | parked immediately with the reason as a property |
| anything else (\`DB:CONNECTIVITY\`, lock timeout) | On Error Propagate | rollback → redelivery with back-off |

**Broker configuration** — redelivery policy on the connection factory / broker: \`maximumRedeliveries=5\`, \`initialRedeliveryDelay=10000\`, \`useExponentialBackOff=true\`; dead-letter strategy \`individualDeadLetterStrategy\` with prefix \`DLQ.\` so this queue's poison messages land in \`DLQ.WMS.SHIP.CONFIRM\`. (With the Mule JMS connector, set the limit as \`maxRedelivery\` on the ActiveMQ factory configuration — the connector default is 0, no redelivery. A \`redelivery-policy\` \`maxRedeliveryCount\` on the JMS listener is documented as having no effect.)

**Replay flow \`ship-confirm-dlq-replay\`** — \`POST /admin/ship-confirm/dlq/replay?max=100\` → For Each \`1 to max\` → Try (ALWAYS_BEGIN): **JMS Consume** from \`DLQ.WMS.SHIP.CONFIRM\` (maximumWait 1 s) → **JMS Publish** to \`WMS.SHIP.CONFIRM\` → commit. \`JMS:TIMEOUT\` means the DLQ is empty. Secure the endpoint and log every replayed message ID.
`,
  followUps: [
    {
      q: 'Why not just set maximumRedeliveries to 0 for malformed messages?',
      a: 'The broker cannot tell a malformed message from one that failed because Oracle was down. Classifying errors in the flow lets transient errors retry and permanent ones park immediately.',
    },
    {
      q: 'A replayed message fails again — what happens?',
      a: 'It goes through the normal redelivery cycle and ends back in the DLQ after the maximum attempts. Keep a replay counter property on the message so ops can see repeat offenders and stop replaying them.',
    },
    {
      q: 'How would the design change on ActiveMQ Artemis?',
      a: 'Redelivery and dead-lettering are address settings: max-delivery-attempts, redelivery-delay and multiplier, and a dead-letter-address (DLA), optionally with auto-create-dead-letter-resources to get a per-queue DLQ.',
    },
  ],
}

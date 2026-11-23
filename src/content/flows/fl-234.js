import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const release = (orderId, deliveryCount = 1) => ({
  message: { kind: 'jms', destination: 'ORDER.RELEASE', deliveryCount, payload: { orderId, dc: 'DC-SOUTH', lines: [{ sku: 'RUG-WOOL-160', qty: 1 }, { sku: 'VASE-GLS-30', qty: 2 }] } },
})
const tables = (rows = []) => ({ wms_orders: { key: 'order_id', columns: ['order_id', 'dc', 'line_count', 'status'], rows } })

export default {
  id: 'fl-234',
  category: 'flows',
  title: 'Order Release to the WMS: One XA Transaction Over the JMS Receive, the Oracle Insert and the JMS Publish, a Repeat That Changes Nothing, and a Poison Message Parked After Five Tries',
  level: 'EXPERT',
  tags: ['myproject', 'oracle', 'jms', 'xa', 'transaction', 'redelivery', 'dlq', 'idempotency'],
  estMinutes: 55,
  flowChecks: [
    {
      label: 'ORDER.RELEASE is read in an XA transaction',
      rule: { type: 'source', component: 'jms-listener', where: { destination: 'ORDER.RELEASE', transactionalAction: 'ALWAYS_BEGIN', transactionType: 'XA' } },
    },
    { label: 'The order is checked in wms_orders before it is inserted', rule: { type: 'before', first: 'db-select', firstWhere: { sql: 'wms_orders' }, then: 'db-insert', thenWhere: { sql: 'wms_orders' } } },
    { label: 'The order is published to WMS.ORDERS after the insert', rule: { type: 'before', first: 'db-insert', then: 'jms-publish', thenWhere: { destination: 'WMS.ORDERS' } } },
    {
      label: 'After five deliveries the message is parked on ORDER.RELEASE.DLQ',
      rule: { type: 'inside', component: 'jms-publish', within: 'choice', where: { destination: 'ORDER.RELEASE.DLQ' }, routeWhere: { expression: 'JMSXDeliveryCount' } },
    },
    { label: 'No Try starts a transaction of its own inside the flow', rule: { type: 'all', rules: [{ type: 'exists', component: 'db-insert' }, { type: 'absent', component: 'try', where: { transactionalAction: 'ALWAYS_BEGIN' } }] } },
  ],
  simulation: {
    systems: { db: { tables: tables() } },
    tests: [
      {
        name: 'A new order',
        about: 'The order row is inserted and the order is published to the WMS. The receive commits with them.',
        trigger: release('SO-91001'),
        expect: { noError: true, ack: 'acked', db: { wms_orders: { count: 1, has: [{ order_id: 'SO-91001', line_count: 2, status: 'RELEASED' }] } }, sent: [{ destination: 'WMS.ORDERS', count: 1, has: { orderId: 'SO-91001' } }] },
      },
      {
        name: 'The WMS queue refuses the publish',
        about: 'The insert worked, then the publish failed. The XA rollback removes the row too, and the release message goes back for another try.',
        trigger: release('SO-91002'),
        overrides: { systems: { queues: { 'WMS.ORDERS': { fault: true } } } },
        expect: { ack: 'returned', db: { wms_orders: { count: 0 } }, notSent: ['WMS.ORDERS'] },
      },
      {
        name: 'Oracle refuses the insert',
        about: 'Nothing is published, and the message goes back.',
        trigger: release('SO-91003'),
        overrides: { systems: { db: { failWhen: [{ match: 'INSERT INTO wms_orders', fault: 'QUERY_EXECUTION', description: 'ORA-12899: value too large for column' }] } } },
        expect: { ack: 'returned', notSent: ['WMS.ORDERS'] },
      },
      {
        name: 'The sixth delivery',
        about: 'The message has failed five times. It is published to ORDER.RELEASE.DLQ and the receive commits, so it stops going round.',
        trigger: release('SO-91003', 6),
        expect: { ack: 'acked', sent: [{ destination: 'ORDER.RELEASE.DLQ', count: 1, has: { orderId: 'SO-91003' } }], notSent: ['WMS.ORDERS'], db: { wms_orders: { count: 0 } } },
      },
      {
        name: 'The order system releases the same order again',
        about: 'SO-91001 is already in wms_orders. Nothing is inserted or published, and the message is acknowledged.',
        trigger: release('SO-91001'),
        overrides: { systems: { db: { tables: tables([{ order_id: 'SO-91001', dc: 'DC-SOUTH', line_count: 2, status: 'RELEASED' }]) } } },
        expect: { ack: 'acked', notSent: ['WMS.ORDERS'], db: { wms_orders: { count: 1 } } },
      },
    ],
  },
  referenceFlow: design(
    flow('order-release-to-wms', source('jms-listener', { destination: 'ORDER.RELEASE', ackMode: 'AUTO', transactionalAction: 'ALWAYS_BEGIN', transactionType: 'XA' }), [
      step('set-variable', { variableName: 'order', value: '#[payload]' }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[(attributes.properties.jmsxProperties.JMSXDeliveryCount default 1) > 5]' }, [
            step('logger', { level: 'WARN', message: '#["Order " ++ vars.order.orderId ++ " failed five times, parked"]' }),
            step('jms-publish', { destination: 'ORDER.RELEASE.DLQ', persistentDelivery: 'true' }),
          ]),
        ],
        {
          otherwise: [
            step('db-select', { database: 'Oracle', sql: 'SELECT order_id FROM wms_orders WHERE order_id = :orderId', inputParameters: '#[{ orderId: vars.order.orderId }]', target: 'known' }),
            router(
              'choice',
              {},
              [route({ expression: '#[not isEmpty(vars.known)]' }, [step('logger', { level: 'INFO', message: '#["Order " ++ vars.order.orderId ++ " already released"]' })])],
              {
                otherwise: [
                  step('db-insert', {
                    database: 'Oracle',
                    sql: "INSERT INTO wms_orders (order_id, dc, line_count, status) VALUES (:orderId, :dc, :lineCount, 'RELEASED')",
                    inputParameters: '#[{ orderId: vars.order.orderId, dc: vars.order.dc, lineCount: sizeOf(vars.order.lines) }]',
                    target: 'inserted',
                  }),
                  step('set-payload', { value: '#[output application/json --- vars.order]' }),
                  step('jms-publish', { destination: 'WMS.ORDERS', persistentDelivery: 'true' }),
                ],
              },
            ),
          ],
        },
      ),
    ]),
  ),
  description: `
Marrow & Pine Home, a fictional homewares retailer, releases customer orders to its warehouse. The order system puts each order on the JMS queue \`ORDER.RELEASE\`:

\`\`\`json
{ "orderId": "SO-91001", "dc": "DC-SOUTH", "lines": [ { "sku": "RUG-WOOL-160", "qty": 1 } ] }
\`\`\`

For each order Mule must do two things: insert a row in the Oracle table \`wms_orders\` (\`order_id\` key, \`dc\`, \`line_count\`, \`status\` = \`RELEASED\`), which customer service reads, and publish the order to \`WMS.ORDERS\`, which the WMS reads. Both are on the same ActiveMQ broker and Oracle database the team already uses.

What went wrong before:
- The publish failed after the insert. Customer service saw the order as released, but the warehouse never got it.
- Once the insert failed after the publish, and the warehouse picked an order that Oracle did not know.
- An order with a bad DC code failed on every delivery and blocked the queue for a day.

**Requirements**
- The receive, the insert and the publish succeed or fail together. A failure sends the message back for another try.
- An order already in \`wms_orders\` changes nothing, and its message is acknowledged.
- A message delivered more than five times is published to \`ORDER.RELEASE.DLQ\` and acknowledged, with a WARN.

**Facts**
- The broker's delivery count is in \`attributes.properties.jmsxProperties.JMSXDeliveryCount\` (1 on the first delivery).
- \`line_count\` is the number of lines. Publish the order to \`WMS.ORDERS\` and to the DLQ as it arrived.
- Do not catch errors: the failure must reach the listener so the transaction rolls back.

**What each system sends back**
- **Database Select** on \`wms_orders\`: a list of rows such as \`[ { "ORDER_ID": "SO-91001" } ]\` for a known order, or an empty list. Oracle returns unquoted column names in upper case.

**What failures look like**
- Oracle refuses the insert: \`DB:QUERY_EXECUTION\` (\`ORA-12899: value too large for column\`).
- The broker refuses the publish to \`WMS.ORDERS\`: the JMS Publish raises a \`JMS\` error such as \`JMS:PUBLISHING\`.
- In both cases the error reaches the listener, the XA transaction rolls back, and the message goes back to \`ORDER.RELEASE\`.

**Design the flow.**
`,
  answerTemplate: `## Why two resources need XA

## The listener and the transaction

## A repeat

## A poison message
`,
  keyPoints: [
    'A local JMS transaction covers the receive and the publish, but not Oracle. A local database transaction covers Oracle, but not JMS. XA lets one transaction manager commit or roll back both.',
    'Start the transaction on the listener with ALWAYS_BEGIN and type XA. The database and JMS operations inside join it; both connections must be set up for XA.',
    'Do not open another Try with ALWAYS_BEGIN inside. That would be a separate transaction, and its commit would not wait for the publish.',
    'XA does not stop the order system from sending an order twice. The lookup in wms_orders turns a repeat into a quiet success.',
    'JMSXDeliveryCount tells how often the broker has tried. Parking the message after five tries keeps one bad order from blocking the rest. The DLQ publish joins the transaction, so the park and the acknowledgement happen together.',
    'XA costs time and needs a transaction log that survives a restart. Where that is not possible, an outbox table in Oracle with a relay is the usual alternative.',
  ],
  solution: `
1. **JMS On New Message** on \`ORDER.RELEASE\`, Transactional action **ALWAYS_BEGIN**, type **XA**. **Set Variable** \`order\`.
2. **Choice**:
   - \`attributes.properties.jmsxProperties.JMSXDeliveryCount > 5\`: WARN, **JMS Publish** to \`ORDER.RELEASE.DLQ\`.
   - Otherwise **Database Select** the order. **Choice**: known, INFO log. Otherwise **Database Insert** \`RELEASED\`, payload = the order, **JMS Publish** to \`WMS.ORDERS\`.
3. No error handler: an error rolls back the whole XA transaction and the broker delivers the message again.

**Config notes.** The Oracle connection must use an XA data source, and the JMS connection an XA connection factory. Bitronix (or the runtime's transaction manager) keeps the transaction log; on CloudHub check that it is supported before you promise XA.

**Broker redelivery limits.** ActiveMQ can also move a message to its own DLQ after a set number of redeliveries. Use one mechanism, and agree which.
`,
  followUps: [
    {
      q: 'What does XA do if Mule crashes after Oracle prepared but before JMS committed?',
      a: 'On restart the transaction manager reads its log and finishes the commit or the rollback on both. That is why the log must be on storage that survives the restart.',
    },
    {
      q: 'How would you do this without XA?',
      a: 'Insert the order and an outbox row in one Oracle transaction, acknowledge the receive after the commit, and let a relay publish outbox rows to WMS.ORDERS and mark them sent. The WMS must then cope with an occasional repeat.',
    },
  ],
}

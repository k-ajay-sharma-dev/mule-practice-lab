import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const scan = (orderId, parcelId, parcelCount, at) => ({ message: { kind: 'mq', destination: 'parcel-delivered', payload: { orderId, parcelId, parcelCount, scannedAt: `2026-11-18T${at}Z` } } })
const tables = {
  delivered_parcels: { key: ['order_id', 'parcel_id'], rows: [{ order_id: 'ORD-4410', parcel_id: 'PCL-1', scanned_at: '2026-11-17T15:02:00Z' }] },
  order_notices: { key: 'order_id', rows: [] },
}

export default {
  id: 'fl-139',
  category: 'flows',
  title: 'An Order Shipped in Three Parcels: Tell the Customer Once, When the Last Parcel Is Delivered, Whatever Order the Scans Come In',
  level: 'ADVANCED',
  tags: ['myproject', 'aggregator', 'anypoint-mq', 'database', 'idempotency', 'transactions', 'logistics'],
  estMinutes: 40,
  flowChecks: [
    { label: 'Delivery scans are read from the parcel-delivered queue', rule: { type: 'source', component: 'mq-subscriber', where: { destination: 'parcel-delivered' } } },
    { label: 'A scan seen before does not fail the flow', rule: { type: 'handler', component: 'on-error-continue', errorType: 'DB:QUERY_EXECUTION', within: 'try' } },
    {
      label: 'The delivered parcels are counted after the scan is saved',
      rule: { type: 'before', first: 'db-insert', firstWhere: { sql: 'delivered_parcels' }, then: 'db-select', thenWhere: { sql: { all: ['count', 'delivered_parcels'] } } },
    },
    { label: 'The order-delivered event is published inside the Choice', rule: { type: 'inside', component: 'mq-publish', within: 'choice', where: { destination: 'order-delivered' } } },
    {
      label: 'The notice row and the publish sit in one transaction, the row first',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'mq-publish', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' } },
          { type: 'before', first: 'db-insert', firstWhere: { sql: 'order_notices' }, then: 'mq-publish' },
        ],
      },
    },
  ],
  simulation: {
    systems: { db: { tables } },
    tests: [
      {
        name: 'The last two parcels arrive',
        about: 'Parcel 1 of order ORD-4410 was delivered yesterday. Parcels 3 and 2 arrive today. One order-delivered event goes out, after the last one.',
        triggers: [scan('ORD-4410', 'PCL-3', 3, '09:14:00'), scan('ORD-4410', 'PCL-2', 3, '10:41:00')],
        expect: {
          sent: [{ destination: 'order-delivered', count: 1, has: { orderId: 'ORD-4410' } }],
          db: { delivered_parcels: { count: 3 }, order_notices: { count: 1, has: [{ order_id: 'ORD-4410' }] } },
          ack: ['acked', 'acked'],
        },
      },
      {
        name: 'Two of three so far',
        about: 'Only parcel 3 arrives today. Two of three are delivered, so nothing is published yet.',
        trigger: scan('ORD-4410', 'PCL-3', 3, '09:14:00'),
        expect: { notSent: ['order-delivered'], db: { delivered_parcels: { count: 2 }, order_notices: { count: 0 } }, ack: 'acked' },
      },
      {
        name: 'The same parcel is scanned twice',
        about: 'The driver scans parcel 2 twice. The second scan is not counted as a third parcel, and nothing is published.',
        triggers: [scan('ORD-4410', 'PCL-2', 3, '10:41:00'), scan('ORD-4410', 'PCL-2', 3, '10:41:30')],
        expect: { notSent: ['order-delivered'], db: { delivered_parcels: { count: 2 } }, ack: ['acked', 'acked'] },
      },
      {
        name: 'The last scan is delivered again',
        about: 'The broker delivers the last scan a second time after the event went out. The customer is not told twice.',
        triggers: [scan('ORD-4410', 'PCL-2', 3, '10:41:00'), scan('ORD-4410', 'PCL-3', 3, '11:05:00'), scan('ORD-4410', 'PCL-3', 3, '11:05:00')],
        expect: { sent: [{ destination: 'order-delivered', count: 1 }], db: { order_notices: { count: 1 } }, ack: ['acked', 'acked', 'acked'] },
      },
      {
        name: 'An order of one parcel',
        about: 'Order ORD-4502 has one parcel. Its only scan completes it at once.',
        trigger: scan('ORD-4502', 'PCL-1', 1, '12:30:00'),
        expect: { sent: [{ destination: 'order-delivered', count: 1, has: { orderId: 'ORD-4502' } }], db: { order_notices: { has: [{ order_id: 'ORD-4502' }] } } },
      },
      {
        name: 'The event queue is down',
        about: 'The last scan completes an order, but the publish fails. No notice row is left behind, and the scan goes back to the queue, so a later delivery of it publishes the event.',
        trigger: scan('ORD-4502', 'PCL-1', 1, '12:30:00'),
        overrides: { systems: { queues: { 'order-delivered': { fault: true } } } },
        expect: { notSent: ['order-delivered'], db: { order_notices: { count: 0 } }, ack: 'returned' },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'collect-parcel-scans',
      source('mq-subscriber', { destination: 'parcel-delivered' }),
      [
        step('set-variable', { variableName: 'scan', value: '#[payload]' }),
        scope('try', {}, [
          step('db-insert', {
            database: 'PostgreSQL',
            sql: 'INSERT INTO delivered_parcels (order_id, parcel_id, scanned_at) VALUES (:orderId, :parcelId, :scannedAt)',
            inputParameters: '#[{ orderId: vars.scan.orderId, parcelId: vars.scan.parcelId, scannedAt: vars.scan.scannedAt }]',
          }),
        ], {
          errorHandlers: [handler('on-error-continue', { type: 'DB:QUERY_EXECUTION' }, [step('logger', { level: 'INFO', message: '#["Repeat scan of " ++ vars.scan.parcelId ++ ", already counted"]' })])],
        }),
        step('db-select', {
          database: 'PostgreSQL',
          sql: 'SELECT COUNT(*) AS delivered FROM delivered_parcels WHERE order_id = :orderId',
          inputParameters: '#[{ orderId: vars.scan.orderId }]',
          target: 'progress',
        }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[vars.progress[0].delivered >= vars.scan.parcelCount]' }, [
              scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
                step('db-insert', {
                  database: 'PostgreSQL',
                  sql: 'INSERT INTO order_notices (order_id, completed_at) VALUES (:orderId, :completedAt)',
                  inputParameters: '#[{ orderId: vars.scan.orderId, completedAt: vars.scan.scannedAt }]',
                }),
                step('set-payload', { value: '#[output application/json --- { orderId: vars.scan.orderId, parcels: vars.scan.parcelCount, deliveredAt: vars.scan.scannedAt }]' }),
                step('mq-publish', { destination: 'order-delivered' }),
              ], {
                errorHandlers: [handler('on-error-continue', { type: 'DB:QUERY_EXECUTION' }, [step('logger', { level: 'INFO', message: '#["Order " ++ vars.scan.orderId ++ " was already announced"]' })])],
              }),
            ]),
          ],
          { otherwise: [step('logger', { level: 'DEBUG', message: '#["Order " ++ vars.scan.orderId ++ ": " ++ vars.progress[0].delivered ++ " of " ++ vars.scan.parcelCount ++ " delivered"]' })] },
        ),
      ],
    ),
  ),
  description: `
A parcel carrier delivers orders for an online electronics shop. Large orders go out as **several parcels**, and each parcel is scanned at the door. Every scan becomes a message on the Anypoint MQ queue **\`parcel-delivered\`**:

\`{ "orderId": "ORD-4410", "parcelId": "PCL-3", "parcelCount": 3, "scannedAt": "2026-11-18T09:14:00Z" }\`

The shop's customer service platform reads the queue **\`order-delivered\`** and sends the customer one "your order has arrived" message for each event.

Today Mule publishes an event for every scan, so a customer with three parcels gets three messages, the first while two parcels are still on the van.

**Requirements**
- Publish **one** \`order-delivered\` event per order, when the **last** parcel of that order is delivered: \`{ "orderId", "parcels", "deliveredAt" }\`.
- Parcels arrive in any order, over hours or days.
- The broker can deliver a scan more than once, and drivers sometimes scan a parcel twice.
- The app runs on **two replicas**, so the last two scans of an order can be processed at the same moment.
- If the publish fails, the customer must still be told later.

PostgreSQL tables you can use:
- \`delivered_parcels\` (\`order_id\`, \`parcel_id\`, \`scanned_at\`), primary key \`(order_id, parcel_id)\`
- \`order_notices\` (\`order_id\`, \`completed_at\`), primary key \`order_id\`

**Design the flow.**
`,
  answerTemplate: `## Keeping each parcel once

## Knowing when an order is complete

## Publishing exactly one event

## When the publish fails
`,
  keyPoints: [
    'This is the Aggregator pattern: keep each part as it arrives, and act when the group is complete. The state lives in the database, not in the app, because scans come days apart and on two replicas.',
    'Insert each scan with the primary key (order_id, parcel_id). A repeat raises DB:QUERY_EXECUTION, which a Try with On Error Continue turns into "already counted".',
    'Count after the insert, so the scan that completes the order sees the full count.',
    'Two replicas can both see 3 of 3 at once. The primary key on order_notices lets only one of them insert the notice row, and only that one publishes.',
    'Put the notice insert and the publish in a transactional Try. If the publish fails, the insert is rolled back and the scan goes back to the queue, so a redelivery can try again.',
    'Use >= rather than ==, so a scan of a parcel the count did not expect still completes the order.',
  ],
  solution: `
1. **Anypoint MQ Subscriber** on \`parcel-delivered\`. **Set Variable** \`scan\` = \`#[payload]\`.
2. **Try** with **Database Insert** into \`delivered_parcels\`. **On Error Continue** for \`DB:QUERY_EXECUTION\`: log "repeat scan".
3. **Database Select**, Target \`progress\`:
   \`\`\`sql
   SELECT COUNT(*) AS delivered FROM delivered_parcels WHERE order_id = :orderId
   \`\`\`
4. **Choice**, route \`#[vars.progress[0].delivered >= vars.scan.parcelCount]\`:
   - **Try**, Transactional action \`ALWAYS_BEGIN\`:
     - **Database Insert** into \`order_notices\`.
     - **Set Payload** \`{ orderId, parcels, deliveredAt }\`.
     - **Anypoint MQ Publish** to \`order-delivered\`.
     - **On Error Continue** for \`DB:QUERY_EXECUTION\`: the order was already announced, log it.
   - Otherwise: log the progress at DEBUG.

**Why the notice row decides, not the count.** The count tells you the order is complete. It does not tell you whether someone already said so: a redelivered last scan, or the other replica, sees the same count. The insert into \`order_notices\` works once per order, ever.

**When the publish fails.** The error is not \`DB:QUERY_EXECUTION\`, so it leaves the Try. The transaction is rolled back, so no notice row is left. The error then fails the flow, the subscriber does not acknowledge the message, and the broker delivers the scan again later.
`,
  followUps: [
    {
      q: 'Can the customer still get two messages?',
      a: 'In a narrow case: the publish succeeds, then the commit of the notice row fails. The redelivered scan publishes again. That is at least once, so the customer service platform should also ignore a second event for the same orderId.',
    },
    {
      q: 'Why not keep the parcels in an Object Store instead of a table?',
      a: 'It can work, but the Object Store has no primary key that two replicas can race on safely, and no transaction with the publish. The database gives both.',
    },
    {
      q: 'A parcel is lost and never scanned. What then?',
      a: 'The order never completes. A daily job can find orders with some parcels delivered and none for several days, and hand them to customer service.',
    },
  ],
}

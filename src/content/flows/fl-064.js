import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-064',
  category: 'flows',
  title: 'Routing Click-and-Collect Orders by Store Stock with a Choice Router',
  level: 'INTERMEDIATE',
  tags: ['retail', 'bopis', 'omnichannel', 'activemq', 'jms', 'oracle', 'choice', 'transactions'],
  estMinutes: 30,
  flowChecks: [
    { label: 'BOPIS orders are consumed from an ActiveMQ queue', rule: { type: 'source', component: 'jms-listener', where: { destination: 'BOPIS' } } },
    {
      label: 'Consume and publish share a local JMS transaction',
      rule: { type: 'source', component: 'jms-listener', where: { transactionalAction: 'ALWAYS_BEGIN', transactionType: 'LOCAL' } },
    },
    { label: 'Stock at the chosen and nearby stores is read from Oracle before routing', rule: { type: 'before', first: 'db-select', then: 'choice' } },
    { label: 'A Choice routes to chosen store, alternate store (and ship-to-home by default)', rule: { type: 'routes', component: 'choice', min: 2 } },
    {
      label: 'Stock is reserved through INV_PKG.RESERVE_ORDER',
      rule: { type: 'exists', component: 'db-stored-procedure', where: { sql: 'RESERVE_ORDER' } },
    },
    {
      label: 'Stock is reserved before a store is told to pick, on each route',
      rule: {
        type: 'before',
        first: 'db-stored-procedure',
        firstWhere: { sql: 'RESERVE_ORDER' },
        then: 'jms-publish',
        thenWhere: { destination: 'PICKS' },
        every: true,
        samePath: true,
      },
    },
    {
      label: 'Pick requests go to the store pick queue STORE.<id>.PICKS from inside the routes',
      rule: { type: 'inside', component: 'jms-publish', where: { destination: 'PICKS' }, within: 'choice' },
    },
    {
      label: 'Orders no store can fulfil go to OMS.SHIPTOHOME.ORDERS from inside the Choice',
      rule: { type: 'inside', component: 'jms-publish', where: { destination: 'SHIPTOHOME' }, within: 'choice' },
    },
    {
      label: 'Failures roll back so the order is redelivered, and no catch-all On Error Continue loses it',
      rule: {
        type: 'all',
        rules: [
          { type: 'handler', component: 'on-error-propagate' },
          { type: 'absent', component: 'on-error-continue', where: { type: 'ANY' } },
        ],
      },
    },
  ],
  referenceFlow: design(
    flow(
      'route-bopis-order',
      source('jms-listener', { destination: 'OMS.BOPIS.ORDERS', ackMode: 'IMMEDIATE', transactionalAction: 'ALWAYS_BEGIN', transactionType: 'LOCAL' }),
      [
        step('set-variable', { variableName: 'order', value: '#[payload]' }),
        // Stock for the chosen store and the 5 nearest stores within 15 km (STORE_DISTANCE is precomputed).
        // STORE_DISTANCE contains a 0 km row from each store to itself. skuCsv = vars.order.lines.sku joinBy ","
        step('db-select', {
          sql: "SELECT s.STORE_ID, s.SKU, s.AVAILABLE_QTY, d.DISTANCE_KM\nFROM STORE_STOCK s\nJOIN STORE_DISTANCE d ON d.TO_STORE_ID = s.STORE_ID\nWHERE d.FROM_STORE_ID = :storeId AND d.DISTANCE_KM <= 15\n  AND s.SKU IN (SELECT REGEXP_SUBSTR(:skuCsv, '[^,]+', 1, LEVEL) FROM DUAL\n                CONNECT BY REGEXP_SUBSTR(:skuCsv, '[^,]+', 1, LEVEL) IS NOT NULL)",
        }),
        step('transform', {
          target: 'variable',
          variableName: 'decision',
          script:
            '%dw 2.0\nimport every, some from dw::core::Arrays\noutput application/java\nvar lines = vars.order.lines\nvar byStore = payload groupBy ((r) -> r.STORE_ID)\nfun canFulfil(rows) = lines every ((l) -> (rows filter ((r) -> r.SKU == l.sku and r.AVAILABLE_QTY >= l.qty)) != [])\nvar candidates = (keysOf(byStore) map ((k) -> { storeId: k as String, rows: byStore[k] }))\n  filter ((c) -> canFulfil(c.rows))\n  orderBy ((c) -> c.rows[0].DISTANCE_KM)\n---\n{\n  chosenOk: candidates some ((c) -> c.storeId == vars.order.storeId),\n  altStore: (candidates filter ((c) -> c.storeId != vars.order.storeId))[0].storeId default null\n}',
        }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[vars.decision.chosenOk]' }, [
              step('set-variable', { variableName: 'fulfilStore', value: '#[vars.order.storeId]' }),
              step('db-stored-procedure', { sql: '{ call INV_PKG.RESERVE_ORDER(:orderId, :fulfilStore, :status) }' }),
              // The procedure replaced the payload: put the order back before publishing it.
              step('set-payload', { value: '#[vars.order]' }),
              step('jms-publish', { destination: '#["STORE." ++ vars.fulfilStore ++ ".PICKS"]' }),
            ]),
            route({ expression: '#[vars.decision.altStore != null]' }, [
              step('set-variable', { variableName: 'fulfilStore', value: '#[vars.decision.altStore]' }),
              step('db-stored-procedure', { sql: '{ call INV_PKG.RESERVE_ORDER(:orderId, :fulfilStore, :status) }' }),
              step('set-payload', { value: '#[vars.order]' }),
              step('jms-publish', { destination: '#["STORE." ++ vars.fulfilStore ++ ".PICKS"]' }),
              step('jms-publish', { destination: 'CUSTOMER.NOTIFICATIONS' }),
            ]),
          ],
          {
            otherwise: [
              step('logger', { level: 'INFO', message: '#["No store can fulfil " ++ vars.order.orderId ++ ", converting to ship-to-home"]' }),
              step('set-payload', { value: '#[vars.order]' }),
              step('jms-publish', { destination: 'OMS.SHIPTOHOME.ORDERS' }),
              step('jms-publish', { destination: 'CUSTOMER.NOTIFICATIONS' }),
            ],
          },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Routing failed for " ++ (vars.order.orderId default "?") ++ ": " ++ error.description]' }),
        ]),
      ],
    ),
  ),
  description: `
A sporting-goods retailer offers **buy online, pick up in store** (BOPIS) from **420 stores**. The order management system puts each BOPIS order on the **ActiveMQ Artemis** queue \`OMS.BOPIS.ORDERS\` (\`orderId, storeId, customer, lines[{ sku, qty }]\`). About **15,000 orders/day**, peaking at 20/s on Black Friday.

Store stock lives in **Oracle** (\`STORE_STOCK\`), and \`STORE_DISTANCE\` lists the distance between every pair of stores. Reservations must go through the procedure \`INV_PKG.RESERVE_ORDER(order_id, store_id, status OUT)\`.

Routing rules:
1. If the **chosen store** has all lines → reserve there and send the order to that store's pick queue \`STORE.<id>.PICKS\`.
2. Else if another store **within 15 km** has everything → reserve there, send it to that store, and notify the customer of the new pickup store.
3. Otherwise → convert to **ship-to-home** (\`OMS.SHIPTOHOME.ORDERS\`) and notify the customer.

An order must never be both picked in a store and shipped from the DC, and none may be lost.

**Design the flow(s).**
`,
  answerTemplate: `## Consuming the order

## Stock lookup

## Routing decision (Choice)

## Reservation and hand-off

## Transactions and failures
`,
  keyPoints: [
    'JMS listener with a LOCAL transaction: the consumed order and every JMS Publish to the same broker commit or roll back together.',
    'One Database Select fetches stock for the chosen store and its neighbours; DataWeave computes which stores can fulfil all lines and sorts them by distance.',
    'Choice router: chosen store → alternate store → otherwise ship-to-home; each route ends with JMS Publish to the right destination (dynamic STORE.<id>.PICKS).',
    'Reserve through the Oracle procedure before publishing the pick request, so a store never picks unreserved stock.',
    'The Oracle call is not part of the JMS local transaction; make RESERVE_ORDER idempotent on orderId so a redelivered order does not reserve twice.',
  ],
  solution: `
1. **JMS On New Message** \`OMS.BOPIS.ORDERS\`, **transactionalAction ALWAYS_BEGIN, LOCAL**. Every JMS Publish in the flow joins this transaction, so "consume order + publish pick request + publish notification" is atomic on the broker. If the OMS does not state the message type, set **Inbound Content-Type** \`application/json\` (the config default is \`*/*\`) so \`vars.order\` can be read with selectors.
2. **Database Select** — stock rows for the chosen store and stores within 15 km for the order's SKUs.
3. **Transform Message** → \`vars.decision\`: \`chosenOk\` (the chosen store has every line) and \`altStore\` (nearest other store that has every line).
4. **Choice**
   - \`chosenOk\` → **Stored Procedure** \`RESERVE_ORDER\` → set the payload back to \`vars.order\` (the procedure replaced it) → **JMS Publish** \`#["STORE." ++ storeId ++ ".PICKS"]\`.
   - \`altStore != null\` → reserve at alternate → publish pick request → publish customer notification.
   - **Otherwise** → publish to \`OMS.SHIPTOHOME.ORDERS\` + notification.
5. Success → commit: the order leaves the queue and the outbound messages become visible together.

**Failure semantics.** Any error → On Error Propagate → JMS rollback → nothing published, order redelivered (Artemis \`max-delivery-attempts\` then DLA). The Oracle reservation is outside the JMS transaction: if it committed before the failure, the redelivery calls \`RESERVE_ORDER\` again, so the procedure must return the existing reservation for the same orderId. Using XA would make Oracle part of the transaction too, at the cost of 2PC.

**Race:** stock can change between the select and the reservation; if \`RESERVE_ORDER\` returns a failure status, re-evaluate (raise an error to redeliver, or fall through to the next option).
`,
  followUps: [
    {
      q: 'Why does a local JMS transaction help even though Oracle is not in it?',
      a: 'It makes the broker side atomic: the order is removed from the queue only if all outbound messages are committed. Without it, a crash between two publishes could send the pick request but not the customer notification, or consume the order without routing it.',
    },
    {
      q: 'How do you publish to a destination whose name depends on the message?',
      a: 'The destination attribute of JMS Publish accepts an expression, e.g. #["STORE." ++ vars.fulfilStore ++ ".PICKS"]; Artemis can auto-create the address if allowed, or the queues are pre-created per store.',
    },
    {
      q: 'What would you change if stores had to accept or reject the order within 10 minutes?',
      a: 'Track the order state in Oracle with a deadline, have stores reply on a response queue, and run a scheduled flow that re-routes orders whose store has not accepted in time.',
    },
  ],
}

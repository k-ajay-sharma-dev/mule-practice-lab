import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const priceAt = (version, price) => ({ item_id: 'TAP-MIXER-CHR', price, version })
const tablesWith = (rows) => ({
  item_price: { key: 'item_id', columns: ['item_id', 'price', 'version'], rows },
  price_skipped: { columns: ['item_id', 'version', 'reason'], rows: [] },
})
const event = (version, price) => ({ message: { kind: 'jms', destination: 'item.price.events', payload: { itemId: 'TAP-MIXER-CHR', price, version } } })

export default {
  id: 'fl-272',
  category: 'flows',
  title: 'Price Events That Arrive Out of Order: Apply a Price Only When Its Version Is Newer, Record a Late One Instead of Applying It, and Pass On Only What Was Applied',
  level: 'ADVANCED',
  tags: ['myproject', 'queues', 'jms', 'ordering', 'versioning', 'oracle', 'idempotency'],
  estMinutes: 40,
  flowChecks: [
    { label: 'Price events arrive on the JMS queue item.price.events', rule: { type: 'source', component: 'jms-listener', where: { destination: 'item.price.events' } } },
    { label: 'The update of item_price looks at the version', rule: { type: 'exists', component: 'db-update', where: { sql: { all: ['item_price', 'version'] } } } },
    { label: 'A late or repeated event is recorded in price_skipped', rule: { type: 'exists', component: 'db-insert', where: { sql: 'price_skipped' } } },
    { label: 'Applied prices are published to store.price.changes', rule: { type: 'exists', component: 'jms-publish', where: { destination: 'store.price.changes' } } },
  ],
  simulation: {
    systems: { db: { tables: tablesWith([priceAt(3, 54.0)]) } },
    tests: [
      {
        name: 'A newer price',
        about: 'Oracle holds version 3. Version 4 replaces it and goes on to the stores.',
        trigger: event(4, 49.5),
        expect: { noError: true, db: { item_price: { has: [{ item_id: 'TAP-MIXER-CHR', price: 49.5, version: 4 }] }, price_skipped: { count: 0 } }, sent: [{ destination: 'store.price.changes', count: 1, has: { version: 4 } }], ack: 'acked' },
      },
      {
        name: 'An older price arrives late',
        about: 'Oracle already holds version 5. Version 4 is recorded as STALE, the price stays at version 5, and the stores hear nothing.',
        trigger: event(4, 49.5),
        overrides: { systems: { db: { tables: tablesWith([priceAt(5, 47.0)]) } } },
        expect: { noError: true, db: { item_price: { has: [{ price: 47.0, version: 5 }] }, price_skipped: { count: 1, has: [{ item_id: 'TAP-MIXER-CHR', version: 4 }] } }, notSent: ['store.price.changes'], ack: 'acked' },
      },
      {
        name: 'The same version twice',
        about: 'Version 5 is redelivered after a crash. It is not applied again and the stores do not get it twice.',
        trigger: event(5, 47.0),
        overrides: { systems: { db: { tables: tablesWith([priceAt(5, 47.0)]) } } },
        expect: { noError: true, db: { price_skipped: { count: 1 } }, notSent: ['store.price.changes'], ack: 'acked' },
      },
      {
        name: 'A new item',
        about: 'Oracle has no row for the item yet. The price is inserted and published.',
        trigger: event(1, 52.0),
        overrides: { systems: { db: { tables: tablesWith([]) } } },
        expect: { noError: true, db: { item_price: { count: 1, has: [{ item_id: 'TAP-MIXER-CHR', version: 1 }] } }, sent: [{ destination: 'store.price.changes', count: 1 }] },
      },
      {
        name: 'Oracle is down',
        about: 'The update cannot run. The event goes back to the broker for redelivery, and nothing is published or recorded as skipped.',
        trigger: event(4, 49.5),
        overrides: { systems: { db: { failWhen: [{ match: 'item_price', fault: 'CONNECTIVITY' }] } } },
        expect: { ack: 'returned', notSent: ['store.price.changes'], db: { price_skipped: { count: 0 } } },
      },
    ],
  },
  referenceFlow: design(
    flow('price-events-in', source('jms-listener', { destination: 'item.price.events', ackMode: 'AUTO', numberOfConsumers: 4 }), [
      step('db-update', {
        database: 'Oracle',
        sql: 'UPDATE item_price SET price = :price, version = :version WHERE item_id = :itemId AND version < :version',
        inputParameters: '#[{ itemId: payload.itemId, price: payload.price, version: payload.version }]',
        target: 'updated',
      }),
      router(
        'choice',
        {},
        [route({ expression: '#[vars.updated.affectedRows == 1]' }, [step('jms-publish', { destination: 'store.price.changes', destinationType: 'QUEUE', persistentDelivery: 'true' })])],
        {
          otherwise: [
            scope(
              'try',
              { transactionalAction: 'INDIFFERENT' },
              [
                step('db-insert', {
                  database: 'Oracle',
                  sql: 'INSERT INTO item_price (item_id, price, version) VALUES (:itemId, :price, :version)',
                  inputParameters: '#[{ itemId: payload.itemId, price: payload.price, version: payload.version }]',
                  target: 'inserted',
                }),
                step('jms-publish', { destination: 'store.price.changes', destinationType: 'QUEUE', persistentDelivery: 'true' }),
              ],
              {
                errorHandlers: [
                  handler('on-error-continue', { type: 'DB:QUERY_EXECUTION' }, [
                    step('logger', { level: 'WARN', message: '#["Price for " ++ payload.itemId ++ " version " ++ (payload.version as String) ++ " is not newer, skipped"]' }),
                    step('db-insert', {
                      database: 'Oracle',
                      sql: "INSERT INTO price_skipped (item_id, version, reason) VALUES (:itemId, :version, 'STALE')",
                      inputParameters: '#[{ itemId: payload.itemId, version: payload.version }]',
                      target: 'skipped',
                    }),
                  ]),
                ],
              },
            ),
          ],
        },
      ),
    ]),
  ),
  description: `
Fenwick Supply, a fictional builders' merchant, sends price changes from its pricing system to the stores. Each change arrives on the **JMS** queue \`item.price.events\`:

\`\`\`json
{ "itemId": "TAP-MIXER-CHR", "price": 49.5, "version": 4 }
\`\`\`

The pricing system numbers the changes of one item: a higher \`version\` is always newer. The adapter runs **four consumers**, and the broker redelivers after a failure, so events of one item can arrive out of order or twice.

Oracle holds the current price in \`item_price\` (key \`item_id\`, \`price\`, \`version\`). A price that is applied is passed on to the stores on \`store.price.changes\`. Last month a delayed event put an old promotion price back on the shelves for a day.

**Requirements**
- Apply an event only when its version is newer than the one Oracle holds. An item Oracle does not know yet is inserted.
- Record an event that is older or the same as the stored one in \`price_skipped\` (\`item_id\`, \`version\`, \`reason\` = \`STALE\`), with a WARN, and do not publish it.
- Publish to \`store.price.changes\` only what was applied.
- If Oracle is down, the event must be redelivered later.

**Facts**
- The listener uses ack mode \`AUTO\`.
- A Database Update returns \`affectedRows\`.
- An insert that breaks the key on \`item_id\` raises \`DB:QUERY_EXECUTION\`. A lost connection raises \`DB:CONNECTIVITY\`.
- Publish the event as it arrived.

**Design the flow.**
`,
  answerTemplate: `## Why the order breaks

## The guarded update

## A new item and a late event

## Publishing
`,
  keyPoints: [
    'Several consumers and redelivery mean a queue gives no order you can rely on. The version in the event is what decides.',
    'Put the guard in the UPDATE itself: WHERE version < :version. Oracle compares and writes in one statement, so two consumers cannot both win.',
    'An update that changes no row means either no row exists or the stored version is newer. Inserting tells them apart: the key on item_id refuses the insert when the row exists.',
    'Catch only DB:QUERY_EXECUTION around that insert. A lost connection must still fail the flow, so the event is redelivered.',
    'Publish after the write that applied the price. A skipped event publishes nothing, so a store never sees an old price.',
  ],
  solution: `
1. **JMS On New Message** on \`item.price.events\`.
2. **Database Update** \`UPDATE item_price SET price = :price, version = :version WHERE item_id = :itemId AND version < :version\` (target \`updated\`).
3. **Choice**:
   - \`vars.updated.affectedRows == 1\`: **JMS Publish** to \`store.price.changes\`.
   - otherwise, a **Try**:
     - **Database Insert** into \`item_price\` (target \`inserted\`), **JMS Publish** to \`store.price.changes\`.
     - **On Error Continue** (\`DB:QUERY_EXECUTION\`): **Logger** WARN, **Insert** into \`price_skipped\` with \`STALE\`.

**A sharper handler.** DB:QUERY_EXECUTION also covers other SQL errors. Check that error.description holds ORA-00001 before you treat the event as stale, and raise any other error again.
`,
  followUps: [
    {
      q: 'Why not keep the last version in an Object Store instead of Oracle?',
      a: 'The check and the write would be two systems with no transaction between them. A crash between them leaves them apart. With the guard in the UPDATE, the version and the price are always written together.',
    },
    {
      q: 'Could you keep order by using one consumer instead?',
      a: 'One consumer keeps the order the broker hands out, but a redelivery after a failure still comes later than the next event. It also caps the throughput at one event at a time. The version guard works with any number of consumers.',
    },
  ],
}

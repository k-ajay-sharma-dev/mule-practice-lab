import { design, flow, handler, source, step } from '../../flow/dsl.js'

const TRADE = {
  tradeId: 'TR-20261113-0042',
  isin: 'DE0001102580',
  quantity: '500',
  price: '99.85',
  legs: [
    { account: 'ACC-PRIME-01', amount: '49925.00' },
    { account: 'ACC-CLIENT-77', amount: '-49925.00' },
  ],
}

export default {
  id: 'fl-025',
  category: 'flows',
  title: 'Transactional JMS to Database Processing (XA vs Local)',
  level: 'EXPERT',
  tags: ['myproject', 'transactions', 'xa', 'jms', 'database', 'exactly-once'],
  estMinutes: 40,
  flowChecks: [
    {
      label: 'Trades are consumed by a JMS listener on TRADES.IN',
      rule: { type: 'source', component: 'jms-listener', where: { destination: 'TRADES.IN' } },
    },
    {
      label: 'The JMS listener itself begins an XA transaction, so the consumed message is part of it',
      rule: { type: 'source', component: 'jms-listener', where: { transactionalAction: 'ALWAYS_BEGIN', transactionType: 'XA' } },
    },
    {
      label: 'All trade and leg inserts happen before the risk message is published',
      rule: { type: 'before', first: ['db-insert', 'db-bulk-insert'], then: 'jms-publish', every: true },
    },
    {
      label: 'The risk message goes to TRADES.RISK in the same flow as the listener',
      rule: { type: 'before', first: 'jms-listener', then: 'jms-publish', thenWhere: { destination: 'TRADES.RISK' } },
    },
    {
      label: 'The trade is enriched with DataWeave before publishing to risk',
      rule: { type: 'before', first: 'transform', then: 'jms-publish' },
    },
    {
      label: 'Real failures use On Error Propagate, and no catch-all commits them by mistake',
      rule: {
        type: 'all',
        rules: [
          { type: 'handler', component: 'on-error-propagate', where: { type: { oneOf: ['ANY', 'DB:', 'JMS:'] } } },
          { type: 'absent', component: 'on-error-continue', where: { type: 'ANY' } },
        ],
      },
    },
    {
      label: 'Only a duplicate-key error is treated as already processed, not every query error',
      rule: {
        type: 'any',
        rules: [
          { type: 'exists', component: 'on-error-continue', where: { type: 'QUERY_EXECUTION', when: { set: true } } },
          { type: 'inside', component: 'choice', within: 'on-error-continue', withinWhere: { type: 'QUERY_EXECUTION' } },
        ],
      },
    },
  ],
  simulation: {
    systems: {
      db: {
        tables: {
          TRADES: { columns: ['TRADE_ID', 'ISIN', 'QUANTITY', 'PRICE'], key: 'TRADE_ID', rows: [] },
          TRADE_LEGS: {
            columns: ['TRADE_ID', 'LEG_NO', { name: 'ACCOUNT', notNull: true }, 'AMOUNT'],
            key: ['TRADE_ID', 'LEG_NO'],
            rows: [],
          },
        },
      },
    },
    tests: [
      {
        name: 'A trade is confirmed',
        about: 'The trade and both legs are saved, and one risk message goes out.',
        trigger: { message: { kind: 'jms', destination: 'TRADES.IN', payload: TRADE } },
        expect: {
          db: { TRADES: { count: 1, has: [{ TRADE_ID: 'TR-20261113-0042', ISIN: 'DE0001102580' }] }, TRADE_LEGS: { count: 2 } },
          sent: [{ destination: 'TRADES.RISK', count: 1, has: { tradeId: 'TR-20261113-0042' } }],
          ack: 'acked',
        },
      },
      {
        name: 'Oracle is down',
        about: 'Nothing can be saved, so no risk message goes out and the trade goes back to TRADES.IN.',
        trigger: { message: { kind: 'jms', destination: 'TRADES.IN', payload: TRADE } },
        overrides: { systems: { db: { fault: 'CONNECTIVITY' } } },
        expect: { notSent: ['TRADES.RISK'], db: { TRADES: { count: 0 } }, ack: 'returned' },
      },
      {
        name: 'The risk queue is down',
        about: 'The trade is saved but the risk message cannot be sent, so the whole unit rolls back and the trade goes back to TRADES.IN.',
        trigger: { message: { kind: 'jms', destination: 'TRADES.IN', payload: TRADE } },
        overrides: { systems: { queues: { 'TRADES.RISK': { fault: true } } } },
        expect: { notSent: ['TRADES.RISK'], db: { TRADES: { count: 0 }, TRADE_LEGS: { count: 0 } }, ack: 'returned' },
      },
      {
        name: 'A leg has no account',
        about: 'Oracle rejects the second leg. That is not a duplicate, so the trade row rolls back too and the message goes back.',
        trigger: {
          message: { kind: 'jms', destination: 'TRADES.IN', payload: { ...TRADE, legs: [TRADE.legs[0], { account: null, amount: '-49925.00' }] } },
        },
        expect: { notSent: ['TRADES.RISK'], db: { TRADES: { count: 0 }, TRADE_LEGS: { count: 0 } }, ack: 'returned' },
      },
      {
        name: 'The same trade arrives twice',
        about: 'The second copy hits the unique key on TRADE_ID. It is treated as already done: committed, with no second risk message.',
        triggers: [
          { message: { kind: 'jms', destination: 'TRADES.IN', payload: TRADE } },
          { message: { kind: 'jms', destination: 'TRADES.IN', payload: TRADE }, afterMs: 2000 },
        ],
        expect: { db: { TRADES: { count: 1 }, TRADE_LEGS: { count: 2 } }, sent: [{ destination: 'TRADES.RISK', count: 1 }], ack: ['acked', 'acked'] },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'trade-confirmations',
      // The listener begins the XA transaction (Bitronix transaction manager, XA connection factory and
      // XA data source); every operation below joins it. Broker max delivery attempts 5 → TRADES.DLQ.
      // No ack mode is set: in a transaction the commit or rollback decides what happens to the message.
      source('jms-listener', { destination: 'TRADES.IN', transactionalAction: 'ALWAYS_BEGIN', transactionType: 'XA' }),
      [
        step('transform', {
          target: 'variable',
          variableName: 'trade',
          script:
            '%dw 2.0\noutput application/java\n---\n{\n  tradeId: payload.tradeId,\n  isin: payload.isin,\n  quantity: payload.quantity as Number,\n  price: payload.price as Number,\n  legs: payload.legs map ((leg, i) -> {\n    tradeId: payload.tradeId,\n    legNo: i + 1,\n    account: leg.account,\n    amount: leg.amount as Number\n  })\n}',
        }),
        step('db-insert', {
          database: 'Oracle',
          sql: 'INSERT INTO TRADES (TRADE_ID, ISIN, QUANTITY, PRICE) VALUES (:tradeId, :isin, :quantity, :price)',
        }),
        // Bulk Insert takes its records from the payload, which the Insert above replaced with its result.
        step('set-payload', { value: '#[vars.trade.legs]' }),
        step('db-bulk-insert', {
          database: 'Oracle',
          sql: 'INSERT INTO TRADE_LEGS (TRADE_ID, LEG_NO, ACCOUNT, AMOUNT) VALUES (:tradeId, :legNo, :account, :amount)',
        }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{\n  tradeId: vars.trade.tradeId,\n  isin: vars.trade.isin,\n  notional: vars.trade.quantity * vars.trade.price,\n  legs: sizeOf(vars.trade.legs)\n}',
        }),
        step('jms-publish', { destination: 'TRADES.RISK' }),
      ],
      [
        // Continue = commit: the duplicate was already processed, so consume the message.
        handler('on-error-continue', { type: 'DB:QUERY_EXECUTION', when: '#[error.description contains "ORA-00001"]' }, [
          step('logger', { level: 'WARN', message: '#["Trade " ++ vars.trade.tradeId ++ " already processed, committing"]' }),
        ]),
        // Propagate = rollback: DB and JMS work is undone and the message is redelivered.
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Rolling back, message will be redelivered: " ++ error.description]' }),
        ]),
      ],
    ),
  ),
  description: `
A trading back-office receives **trade confirmations** on an **ActiveMQ Artemis** queue \`TRADES.IN\` (~500 msgs/s at market close). For each message the integration must:

1. Insert the trade into an **Oracle** \`TRADES\` table (and its legs into \`TRADE_LEGS\`).
2. Publish an enriched message to a second JMS queue \`TRADES.RISK\` for the risk engine.

**Requirements**
- A trade must **never** be in the DB without the risk message, or vice versa.
- A message must not be lost if Oracle is down; poison messages must not block the queue forever.
- Duplicate trades in the DB are unacceptable (regulatory reporting).

**Design the flow(s):** transaction boundaries, XA vs local transactions, configuration, redelivery and poison handling, and the alternatives if XA is not allowed by the platform team.
`,
  answerTemplate: `## Transaction boundaries

## XA design

## Configuration

## Redelivery and poison messages

## Duplicates

## Alternative without XA
`,
  keyPoints: [
    'A local transaction cannot span JMS and the database; atomicity across both requires an XA transaction (or a compensating/idempotent design).',
    'JMS listener starts the XA transaction (transactionalAction ALWAYS_BEGIN, type XA); DB inserts and JMS publish join it; commit happens when the flow completes successfully.',
    'Requires XA-capable connection factory/data source and a transaction manager (Bitronix) configured in the app.',
    'On error the transaction rolls back, the message returns to TRADES.IN and is redelivered; a max redelivery count routes poison messages to a DLQ.',
    'DB inserts of trade + legs happen in the same transaction (all-or-nothing) and a unique constraint on tradeId prevents duplicates.',
    'Without XA: JMS listener with AUTO ack + idempotent DB insert (unique key) in a local DB transaction + outbox pattern for the outgoing message gives effectively-once results.',
  ],
  solution: `
**Why XA:** a local JMS transaction covers consume + publish on the same broker; a local DB transaction covers the inserts. Neither covers both, so a crash between DB commit and JMS commit causes duplicates or lost risk messages.

**XA design**
1. Configure the **Bitronix transaction manager** (\`bti:transaction-manager\`) and an XA-capable **JMS connection factory** (Artemis XA factory) and **Oracle XA data source** (\`bti:xa-data-source-pool\` referenced by the Database config).
2. **JMS On New Message** listener on \`TRADES.IN\` with \`transactionalAction="ALWAYS_BEGIN"\` and \`transactionType="XA"\`.
3. Transform Message (DataWeave) → trade row and legs list.
4. **Database Insert** (trade) and **Bulk Insert** (legs) — both join the transaction by default (\`JOIN_IF_POSSIBLE\`). The Insert replaces the payload with its result and Bulk Insert reads its records from the payload, so set the payload to the legs list (or point the Bulk Insert's input at \`vars.trade.legs\`) before it.
5. DataWeave enriches the message → **JMS Publish** to \`TRADES.RISK\` (joins the transaction).
6. Flow completes → transaction manager runs two-phase commit across Artemis and Oracle.
7. Avoid async boundaries inside the transaction (Async scope, Parallel For Each, VM to another flow) — the transaction is bound to the thread/flow.

**Redelivery & poison**
- Any error → **On Error Propagate** → rollback → broker redelivers.
- Set the broker-side \`max-delivery-attempts\` with a DLA/DLQ so a bad message ends up on \`TRADES.DLQ\` after N attempts (the JMS connector docs say Max Redelivery on the listener has no effect). Don't use On Error Continue for real failures — it commits.

**Duplicates:** unique constraint on \`TRADES.TRADE_ID\`; a redelivered, already-committed message (rare XA recovery cases or upstream duplicates) fails the insert → treat that specific constraint error as "already processed" and commit.

**Without XA (platform says no):**
- JMS listener without a transaction, \`ackMode="AUTO"\` (acknowledged only if the flow completes, otherwise redelivered); DB inserts in a local transaction (Try scope ALWAYS_BEGIN) with idempotent insert on \`TRADE_ID\`. Do not start that Try inside a local JMS transaction: local transactions cannot be nested, and ALWAYS_BEGIN then raises an error.
- Write the risk message into an **outbox table** in the same DB transaction; a separate poller flow publishes outbox rows to \`TRADES.RISK\` and marks them sent. Redelivered input → duplicate key → skip. Result: at-least-once delivery with idempotent effects.
`,
  followUps: [
    { q: 'What does XA cost you?', a: 'Two-phase commit adds round trips and log writes, reducing throughput, and in-doubt transactions need recovery. At 500 msgs/s you must load-test it and size concurrency carefully.' },
    { q: 'Can Anypoint MQ join an XA transaction?', a: 'No. Anypoint MQ uses acknowledgements, not transactions, so with it you rely on manual ack plus idempotency/outbox patterns.' },
    { q: 'Why is On Error Continue dangerous inside a transactional flow?', a: 'It treats the error as handled, so the transaction commits — the input message is consumed even though the DB insert or publish failed.' },
  ],
}

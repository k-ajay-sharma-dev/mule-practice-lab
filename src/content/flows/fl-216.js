import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

const msg = { adjustment_id: 'ADJ-99120', store: '0412', sku: '4410021', delta: -6 }
const tables = {
  stock: { key: ['store', 'sku'], rows: [{ store: '0412', sku: '4410021', on_hand: 96 }] },
  stock_adjustment_rejects: { columns: ['adjustment_id', 'reason'], rows: [] },
}
const procedures = {
  // applies one adjustment to dbo.stock
  'dbo.usp_apply_stock_adjustment': (args, db) => {
    const row = db.tables.stock.rows.find((r) => r.store === args.store && r.sku === args.sku)
    if (row) row.on_hand += Number(args.delta)
    return { applied: row ? 1 : 0 }
  },
}
const deadlock = 'Transaction (Process ID 61) was deadlocked on lock resources with another process and has been chosen as the deadlock victim. Rerun the transaction.'
const foreignKey = 'The INSERT statement conflicted with the FOREIGN KEY constraint "FK_stock_store". The conflict occurred in database "retail", table "dbo.stores".'
const trigger = { message: { kind: 'jms', destination: 'stock.adjustments', payload: msg } }

export default {
  id: 'fl-216',
  category: 'flows',
  title: 'Stock Adjustments From a Queue Into SQL Server: Retry a Deadlock a Few Times, Reject a Real Data Error at Once',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'sql-server', 'deadlock', 'retry', 'until-successful', 'jms', 'reject-table'],
  estMinutes: 30,
  flowChecks: [
    { label: 'Adjustments are received from the stock.adjustments queue', rule: { type: 'source', component: 'jms-listener', where: { destination: 'stock.adjustments' } } },
    { label: 'The procedure call is retried by Until Successful, a few seconds apart', rule: { type: 'inside', component: 'db-stored-procedure', within: 'until-successful', withinWhere: { maxRetries: { gte: 2 }, millisBetweenRetries: { gte: 1000, lte: 30000 } } } },
    { label: 'Only an error that is not a deadlock writes a reject row and stops retrying', rule: { type: 'inside', component: 'db-insert', within: 'on-error-continue', withinWhere: { when: 'deadlock' }, where: { sql: 'stock_adjustment_rejects' } } },
  ],
  simulation: {
    systems: { db: { tables, procedures } },
    tests: [
      {
        name: 'A normal adjustment',
        about: 'Six units leave store 0412. The message is acknowledged.',
        trigger,
        expect: { noError: true, db: { stock: { has: [{ store: '0412', sku: '4410021', on_hand: 90 }] } }, ack: 'acked' },
      },
      {
        name: 'A deadlock on every try',
        about: 'SQL Server picks this session as the deadlock victim each time. After the retries the message goes back to the broker for a later redelivery. Nothing is rejected, because the data is fine.',
        trigger,
        overrides: { systems: { db: { failWhen: [{ match: 'usp_apply_stock_adjustment', fault: 'QUERY_EXECUTION', description: deadlock }] } } },
        expect: { error: 'MULE:RETRY_EXHAUSTED', db: { stock_adjustment_rejects: { count: 0 } }, ack: 'returned' },
      },
      {
        name: 'A store the database does not know',
        about: 'A foreign key error will fail every time. It is rejected at once, with no retries and no waiting, and the message is acknowledged.',
        trigger,
        overrides: { systems: { db: { failWhen: [{ match: 'usp_apply_stock_adjustment', fault: 'QUERY_EXECUTION', description: foreignKey }] } } },
        expect: { noError: true, db: { stock_adjustment_rejects: { count: 1, has: [{ adjustment_id: 'ADJ-99120' }] } }, ack: 'acked', maxMs: 1500 },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'stock-adjustments-in',
      source('jms-listener', { destination: 'stock.adjustments', ackMode: 'AUTO', numberOfConsumers: 4 }),
      [
        scope('until-successful', { maxRetries: 3, millisBetweenRetries: 2000 }, [
          scope('try', {}, [step('db-stored-procedure', { database: 'SQL Server', sql: '{ call dbo.usp_apply_stock_adjustment(:adjustmentId, :store, :sku, :delta) }', inputParameters: '#[{ adjustmentId: payload.adjustment_id, store: payload.store, sku: payload.sku, delta: payload.delta }]', target: 'applied' })], {
            errorHandlers: [
              handler('on-error-continue', { type: 'DB:QUERY_EXECUTION', when: '#[not (lower(error.description) contains "deadlock")]' }, [
                step('db-insert', {
                  database: 'SQL Server',
                  sql: 'INSERT INTO dbo.stock_adjustment_rejects (adjustment_id, reason) VALUES (:adjustmentId, :reason)',
                  inputParameters: '#[{ adjustmentId: payload.adjustment_id, reason: error.description }]',
                }),
              ]),
            ],
          }),
        ]),
      ],
      [handler('on-error-propagate', { type: 'MULE:RETRY_EXHAUSTED' }, [step('logger', { level: 'WARN', message: '#["Adjustment " ++ payload.adjustment_id ++ " still deadlocked, back to the queue"]' })])],
    ),
  ),
  optionalSteps: [{ type: 'on-error-propagate', flow: 'stock-adjustments-in', why: 'It only logs a WARN. Without it the error still ends the flow and the message still goes back to the broker.' }],
  description: `
Larkfield Grocers, a fictional grocery chain, records stock adjustments (breakage, theft, recounts) from the stores. Each one arrives as a JMS message on the queue \`stock.adjustments\`:

\`\`\`json
{ "adjustment_id": "ADJ-99120", "store": "0412", "sku": "4410021", "delta": -6 }
\`\`\`

A procedure applies it: \`dbo.usp_apply_stock_adjustment(@adjustmentId, @store, @sku, @delta)\`. Four consumers run in parallel, and at the end of the day the replenishment job reads the same rows.

Two errors show up in the logs:
- **Deadlocks** (SQL Server error 1205): "...chosen as the deadlock victim. Rerun the transaction." The same message works a second later.
- **Data errors**, such as a foreign key error for a store the database does not know. These fail every time.

Rejected adjustments go to \`dbo.stock_adjustment_rejects\` (\`adjustment_id\`, \`reason\`).

**Requirements**
- Retry a deadlock a few times, a couple of seconds apart. If it still fails, give the message back to the broker for a later redelivery.
- Do not retry a data error. Reject it at once and acknowledge the message.

**Design the flow.**
`,
  answerTemplate: `## Two kinds of error

## Retrying the deadlock

## Rejecting the rest

## After the retries
`,
  keyPoints: [
    'A deadlock victim is rolled back by SQL Server and can run again. Retrying it is the documented answer.',
    'Retrying a data error only wastes time. Tell them apart by the error text or number, here with the handler\'s When condition.',
    'The Try inside Until Successful decides: On Error Continue for a data error ends the retries as a success; a deadlock is not caught and goes up to be retried.',
    'Short retries in Mule, then the broker\'s redelivery for longer waits. Holding a consumer for minutes blocks the queue.',
    'The procedure must be safe to run twice, keyed by adjustment_id, because a redelivered message can arrive after a commit whose acknowledgement was lost.',
  ],
  solution: `
1. **JMS On New Message** on \`stock.adjustments\`, 4 consumers.
2. **Until Successful** (3 retries, 2000 ms):
   - **Try** with the **Stored Procedure** call (target variable).
     - **On Error Continue**, type \`DB:QUERY_EXECUTION\`, When \`not (lower(error.description) contains "deadlock")\`: **Insert** into \`dbo.stock_adjustment_rejects\`.
3. Flow **On Error Propagate** for \`MULE:RETRY_EXHAUSTED\`: WARN log. The message goes back to the broker.

**Fewer deadlocks.** Update rows in the same order in every procedure, keep transactions short, and look at READ COMMITTED SNAPSHOT for the readers. Retries handle what is left.

**The broker's limit.** Give the queue a redelivery limit and a dead letter queue, so a message that deadlocks for hours does not circle for ever.
`,
  followUps: [
    {
      q: 'Why not catch the deadlock by its error number instead of the text?',
      a: 'The number (1205) is steadier than the message. If the error object exposes the SQL error code, use it. The text check is a fallback that depends on the server language.',
    },
    {
      q: 'Could the retry be inside the procedure instead?',
      a: 'Yes, a TRY CATCH loop in T-SQL can retry on 1205. Then Mule sees fewer errors. Keep a small limit there too.',
    },
  ],
}

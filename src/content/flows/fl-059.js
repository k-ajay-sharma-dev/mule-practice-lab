import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-059',
  category: 'flows',
  title: 'Releasing Expired Cart Reservations in Oracle on a Schedule',
  level: 'INTERMEDIATE',
  tags: ['retail', 'e-commerce', 'inventory', 'reservations', 'oracle', 'scheduler', 'transactions'],
  estMinutes: 20,
  flowChecks: [
    { label: 'The clean-up runs on a Scheduler', rule: { type: 'source', component: 'scheduler' } },
    { label: 'Expired reservation rows are removed with a Database Delete', rule: { type: 'exists', component: 'db-delete' } },
    {
      label: 'Reserved quantity is given back to stock before the reservation rows are deleted',
      rule: { type: 'before', first: ['db-update', 'db-stored-procedure'], then: 'db-delete' },
    },
    { label: 'Release and delete are inside a Try scope', rule: { type: 'inside', component: 'db-delete', within: 'try' } },
    {
      label: 'The Try begins a transaction (ALWAYS_BEGIN) so both statements commit or roll back together',
      rule: { type: 'exists', component: 'try', where: { transactionalAction: 'ALWAYS_BEGIN' } },
    },
    { label: 'One cutoff timestamp is fixed in a variable before the SQL runs', rule: { type: 'before', first: 'set-variable', then: 'db-update' } },
    { label: 'A failed run is logged and left for the next tick (error handler)', rule: { type: 'handler', component: ['on-error-propagate', 'on-error-continue'] } },
  ],
  referenceFlow: design(
    flow(
      'release-expired-reservations',
      // Quartz cron: every 5 minutes. In a cluster (or CloudHub 2.0 with clustering enabled) the scheduler fires on the primary node only.
      source('scheduler', { strategy: 'cron', expression: '0 0/5 * * * ?' }),
      [
        step('set-variable', { variableName: 'cutoff', value: '#[now()]' }),
        scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
          step('db-update', {
            sql: "UPDATE STOCK_AVAILABILITY a\nSET a.RESERVED_QTY = a.RESERVED_QTY - (\n  SELECT SUM(r.QTY) FROM STOCK_RESERVATION r\n  WHERE r.SKU = a.SKU AND r.LOCATION_ID = a.LOCATION_ID\n    AND r.STATUS = 'HELD' AND r.EXPIRES_AT < :cutoff)\nWHERE EXISTS (\n  SELECT 1 FROM STOCK_RESERVATION r\n  WHERE r.SKU = a.SKU AND r.LOCATION_ID = a.LOCATION_ID\n    AND r.STATUS = 'HELD' AND r.EXPIRES_AT < :cutoff)",
          }),
          step('set-variable', { variableName: 'skusReleased', value: '#[payload.affectedRows]' }),
          step('db-delete', {
            sql: "DELETE FROM STOCK_RESERVATION\nWHERE STATUS = 'HELD' AND EXPIRES_AT < :cutoff",
          }),
        ]),
        step('logger', {
          level: 'INFO',
          message: '#["Released " ++ (payload.affectedRows as String) ++ " expired reservations across " ++ (vars.skusReleased as String) ++ " SKU/locations"]',
        }),
      ],
      [
        handler('on-error-continue', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Reservation release failed, rolled back, will retry next run: " ++ error.description]' }),
        ]),
      ],
    ),
  ),
  description: `
An online grocer **holds stock** when a customer adds an item to the basket. A hold does two things:
- It adds a row to the **Oracle** table \`STOCK_RESERVATION\` (\`SKU, LOCATION_ID, QTY, STATUS='HELD', EXPIRES_AT\`).
- It adds the same quantity to \`STOCK_AVAILABILITY.RESERVED_QTY\`.

**Facts**
- Holds last 20 minutes.
- Around **40,000** are created a day.
- Roughly a third expire without checkout.

Expired holds must be given back to available stock **within 5 minutes** of expiry. Otherwise the site shows items as sold out that are actually on the shelf.

**Requirements**
- Stock released and reservations deleted must always match, never one without the other.
- A reservation converted to an order at the same moment (status changes to \`CONFIRMED\`) must not be released.
- The job runs on a 2-replica deployment and must not double-release.

**Design the flow(s).**
`,
  answerTemplate: `## Schedule

## Which rows are expired

## Release and delete (transaction)

## Concurrency and clustering

## Errors
`,
  keyPoints: [
    'Scheduler with a cron expression (every 5 minutes); in a Mule runtime cluster (or CloudHub 2.0 with clustering enabled) it fires on the primary node only, so there is no double run. Without clustering, CloudHub 2.0 runs the schedule on every replica, so the SQL must also be safe to run twice.',
    'Capture one cutoff timestamp in a variable and use it in both statements, so they act on exactly the same set of rows.',
    'Update STOCK_AVAILABILITY first (subtract the expired quantities), then Database Delete the reservations, both inside a Try with ALWAYS_BEGIN.',
    "Filter on STATUS = 'HELD' so reservations already confirmed by checkout are never touched.",
    'Any failure rolls back both statements; the next run picks the same rows up again.',
  ],
  solution: `
1. **Scheduler** — cron \`0 0/5 * * * ?\`.
2. **Set Variable** \`cutoff = now()\` — both statements use the same moment.
3. **Try** with transactional action **ALWAYS_BEGIN** (local Oracle transaction):
   - **Database Update** — subtract the summed expired quantities from \`STOCK_AVAILABILITY.RESERVED_QTY\` for every affected SKU/location (correlated subquery, \`STATUS = 'HELD' AND EXPIRES_AT < :cutoff\`).
   - **Database Delete** — \`DELETE FROM STOCK_RESERVATION WHERE STATUS = 'HELD' AND EXPIRES_AT < :cutoff\`.
   Commit happens when the Try ends.
4. **Logger** — number of deleted rows (\`payload.affectedRows\`).

**Race with checkout:** checkout updates the reservation to \`CONFIRMED\` in its own transaction. The Delete locks the rows it touches, so it skips anything confirmed by then, but the Update only reads \`STOCK_RESERVATION\`: a checkout that commits between the two statements would have its quantity released without its row being deleted. To close that window, lock the expired rows first with \`SELECT ... FOR UPDATE\` inside the same Try; whichever side gets the lock first then wins.

**Errors:** On Error Continue logs the failure; the transaction is already rolled back, and the next tick retries. (Propagate would also be fine — a scheduler has no caller to answer.)

**Volume:** a few thousand rows per run is fine for two statements. If backlogs ever reach hundreds of thousands, delete in chunks (\`AND ROWNUM <= 10000\`) in a loop to keep undo small.
`,
  followUps: [
    {
      q: 'Why fix the cutoff in a variable instead of using SYSTIMESTAMP in each statement?',
      a: 'The two statements run a few milliseconds apart; a reservation that expires in between would be deleted without its quantity being released. One shared cutoff keeps them consistent.',
    },
    {
      q: 'Could you do this in one stored procedure instead?',
      a: 'Yes — a PL/SQL procedure called with Database Stored Procedure could do both steps (even with RETURNING BULK COLLECT) in one round trip. It moves logic into the database, which some teams prefer and others avoid.',
    },
    {
      q: 'What if the flow takes longer than 5 minutes?',
      a: 'By default the next tick can start while the previous run is still going; set disallowConcurrentExecution="true" on the Scheduler so runs never overlap, then fix the slowness (index on STATUS/EXPIRES_AT, chunked deletes).',
    },
  ],
}

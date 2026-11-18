import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

const tables = {
  job_lock: { key: 'job_name', columns: ['job_name', 'locked', 'locked_at'], rows: [{ job_name: 'WEB_ORDERS_MOVE', locked: 0, locked_at: '2026-11-13T09:50:00Z' }] },
  web_order_inbox: {
    key: 'order_id',
    rows: [
      { order_id: 'W-7001', store: '0101', total: 129.0, status: 'NEW' },
      { order_id: 'W-7002', store: '0102', total: 58.5, status: 'NEW' },
      { order_id: 'W-6990', store: '0101', total: 12.0, status: 'MOVED' },
    ],
  },
  erp_order_staging: { key: 'order_id', columns: ['order_id', 'store', 'total'], rows: [] },
}
const held = { ...tables, job_lock: { ...tables.job_lock, rows: [{ job_name: 'WEB_ORDERS_MOVE', locked: 1, locked_at: '2026-11-13T09:52:00Z' }] } }
const nothingNew = { ...tables, web_order_inbox: { key: 'order_id', rows: [{ order_id: 'W-6990', store: '0101', total: 12.0, status: 'MOVED' }] } }

export default {
  id: 'fl-250',
  category: 'flows',
  title: 'A Scheduled Batch Job That Must Never Overlap Itself: Take a Lock Row With a Conditional Update, Skip the Run When It Is Held, and Release It From On Complete and From the Error Handler',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'batch', 'sql-server', 'run-lock', 'scheduler', 'overlap'],
  estMinutes: 35,
  flowChecks: [
    { label: 'The lock is taken with an update that only works when the lock is free', rule: { type: 'exists', component: 'db-update', where: { sql: { all: ['job_lock', 'SET locked = 1', 'AND locked = 0'] } } } },
    { label: 'The Batch Job runs only on the route where the lock update changed a row', rule: { type: 'inside', component: 'batch-job', within: 'choice', routeWhere: { expression: 'affectedRows' } } },
    { label: 'On Complete releases the lock', rule: { type: 'inside', component: 'db-update', within: 'batch-job', inSlot: 'onComplete', where: { sql: { all: ['job_lock', 'SET locked = 0'] } } } },
    { label: 'The error handler releases the lock too', rule: { type: 'inside', component: 'db-update', within: 'on-error-propagate', where: { sql: { all: ['job_lock', 'SET locked = 0'] } } } },
  ],
  simulation: {
    systems: { db: { tables } },
    tests: [
      {
        name: 'A normal run',
        about: 'The lock is free. Two new orders reach staging, both are marked MOVED, and the lock is free again at the end.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          db: {
            erp_order_staging: { count: 2, has: [{ order_id: 'W-7001' }, { order_id: 'W-7002' }] },
            web_order_inbox: { has: [{ order_id: 'W-7001', status: 'MOVED' }], lacks: [{ status: 'NEW' }] },
            job_lock: { has: [{ job_name: 'WEB_ORDERS_MOVE', locked: 0 }] },
          },
          logs: [{ level: 'INFO', has: 'moved=2 failed=0' }],
        },
      },
      {
        name: 'The last run is still going',
        about: 'A Black Friday run is still moving orders, so the lock is held. This run logs a WARN and does nothing: no order is staged twice, and the lock stays with the other run.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { tables: held } } },
        expect: {
          noError: true,
          db: { erp_order_staging: { count: 0 }, web_order_inbox: { has: [{ order_id: 'W-7001', status: 'NEW' }] }, job_lock: { has: [{ locked: 1 }] } },
          logs: [{ level: 'WARN', has: 'lock' }],
        },
      },
      {
        name: 'Nothing new',
        about: 'There are no new orders. The run gives the lock back at once, or the next run would be skipped for nothing.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { tables: nothingNew } } },
        expect: { noError: true, db: { erp_order_staging: { count: 0 }, job_lock: { has: [{ locked: 0 }] } } },
      },
      {
        name: 'The inbox read fails',
        about: 'The select on the inbox fails after the lock was taken. The error handler frees the lock, so the next run can try again.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { failWhen: [{ match: 'FROM dbo.web_order_inbox', fault: 'QUERY_EXECUTION' }] } } },
        expect: { error: 'DB:QUERY_EXECUTION', db: { job_lock: { has: [{ locked: 0 }] } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'web-orders-to-erp',
      source('scheduler', { strategy: 'fixed-frequency', frequency: 10, timeUnit: 'MINUTES' }),
      [
        step('db-update', {
          database: 'SQL Server',
          sql: 'UPDATE dbo.job_lock SET locked = 1, locked_at = :lockedAt WHERE job_name = :jobName AND locked = 0',
          inputParameters: '#[{ jobName: "WEB_ORDERS_MOVE", lockedAt: now() as String }]',
          target: 'lock',
        }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[vars.lock.affectedRows == 1]' }, [
              step('db-select', { database: 'SQL Server', sql: "SELECT order_id, store, total FROM dbo.web_order_inbox WHERE status = 'NEW' ORDER BY order_id" }),
              router(
                'choice',
                {},
                [
                  route({ expression: '#[isEmpty(payload)]' }, [
                    step('db-update', { database: 'SQL Server', sql: 'UPDATE dbo.job_lock SET locked = 0 WHERE job_name = :jobName', inputParameters: '#[{ jobName: "WEB_ORDERS_MOVE" }]', target: 'released' }),
                  ]),
                ],
                {
                  otherwise: [
                    router(
                      'batch-job',
                      { jobName: 'web-orders-to-erp', blockSize: 100, maxFailedRecords: -1 },
                      [
                        route({ name: 'move-order', acceptPolicy: 'NO_FAILURES' }, [
                          step('db-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.erp_order_staging (order_id, store, total) VALUES (:order_id, :store, :total)', inputParameters: '#[payload]', target: 'staged' }),
                          step('db-update', { database: 'SQL Server', sql: "UPDATE dbo.web_order_inbox SET status = 'MOVED' WHERE order_id = :orderId", inputParameters: '#[{ orderId: payload.order_id }]', target: 'marked' }),
                        ]),
                      ],
                      {
                        onComplete: [
                          step('db-update', { database: 'SQL Server', sql: 'UPDATE dbo.job_lock SET locked = 0 WHERE job_name = :jobName', inputParameters: '#[{ jobName: "WEB_ORDERS_MOVE" }]', target: 'released' }),
                          step('logger', { level: 'INFO', message: '#["Web orders moved=" ++ (payload.successfulRecords as String) ++ " failed=" ++ (payload.failedRecords as String)]' }),
                        ],
                      },
                    ),
                  ],
                },
              ),
            ]),
          ],
          { otherwise: [step('logger', { level: 'WARN', message: 'The previous run still holds the lock, so this run is skipped' })] },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('db-update', { database: 'SQL Server', sql: 'UPDATE dbo.job_lock SET locked = 0 WHERE job_name = :jobName', inputParameters: '#[{ jobName: "WEB_ORDERS_MOVE" }]' }),
        ]),
      ],
    ),
  ),
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, moves new web orders to its ERP. Every **10 minutes** a scheduled flow reads the orders with status \`NEW\` from \`dbo.web_order_inbox\` in SQL Server and, through a Batch Job, inserts each one into \`dbo.erp_order_staging\` and marks it \`MOVED\`.

On a normal day a run takes two minutes. On Black Friday one run took 25 minutes. The scheduler started two more runs while it was going, and they read the same \`NEW\` orders. The ERP got 900 orders twice.

The flow runs on two replicas, so an in-memory flag would not help. The DBA has added a lock table:

\`\`\`
dbo.job_lock (job_name, locked, locked_at)
WEB_ORDERS_MOVE, 0, 2026-11-13T09:50:00Z
\`\`\`

**Requirements**
- Take the lock at the start of a run. Only one run may get it, even when two start in the same second.
- If the lock is held, log a WARN and do nothing.
- If there are no new orders, give the lock back at once.
- Release the lock when the job ends, and also when the run fails before the job starts.

**Design the flow.**
`,
  answerTemplate: `## Taking the lock

## Skipping a run

## Releasing the lock

## When the run fails
`,
  keyPoints: [
    'UPDATE ... SET locked = 1 WHERE locked = 0 is atomic in the database. Two runs can try at once, and only one changes a row.',
    'affectedRows tells the flow whether it got the lock: 1 means yes, 0 means another run holds it.',
    'The Batch Job returns at once and runs on its own, so the lock is released in On Complete, not after the Batch Job step.',
    'A failure between taking the lock and starting the job needs its own release in the error handler.',
    'Scheduler overlap is not only a Black Friday problem: two replicas may each run the scheduler unless it runs on the primary node only. Check what your deployment supports.',
  ],
  solution: `
1. **Scheduler**, every 10 minutes.
2. **Database Update** \`SET locked = 1, locked_at = now WHERE job_name = 'WEB_ORDERS_MOVE' AND locked = 0\`, target \`lock\`.
3. **Choice**:
   - \`vars.lock.affectedRows == 1\`: **Database Select** the \`NEW\` orders, then a second **Choice**:
     - empty: **Database Update** to release the lock.
     - otherwise: **Batch Job**, step \`move-order\`: **Insert** into staging, **Update** the inbox row to \`MOVED\`. **On Complete**: release the lock, log the counts.
   - otherwise: **Logger** WARN.
4. Flow **On Error Propagate** (ANY): release the lock.

**A lock that is never released.** If the app dies mid job, the lock stays. Keep \`locked_at\` and let a run take a lock older than, say, two hours, with an alert, because that means a run was lost.
`,
  followUps: [
    {
      q: 'The app runs on two replicas. Is the lock still needed if the scheduler runs on the primary node only?',
      a: 'It still helps: the primary node setting stops two replicas starting the same tick, but a slow run can still overlap the next tick on the same node. The lock covers both.',
    },
    {
      q: 'Why not mark the orders IN_PROGRESS in the select instead of a lock?',
      a: 'That also works and allows runs in parallel: claim rows with an update first, then read only your claimed rows. A lock has fewer moving parts when one run at a time is fast enough.',
    },
  ],
}

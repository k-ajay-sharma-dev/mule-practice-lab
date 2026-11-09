import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-066',
  category: 'flows',
  title: 'Nightly Price Distribution to 500 Store Queues with a Batch Job',
  level: 'ADVANCED',
  tags: ['retail', 'pricing', 'stores', 'batch', 'activemq', 'jms', 'oracle', 'bulk-update'],
  estMinutes: 40,
  flowChecks: [
    {
      label: 'The distribution starts on a Scheduler at 01:30',
      rule: { type: 'source', component: 'scheduler', where: { expression: { oneOf: ['30 1 ', '30 01 '] } } },
    },
    { label: 'Pending price rows are read from Oracle and fed into a Batch Job', rule: { type: 'before', first: 'db-select', then: 'batch-job' } },
    {
      label: 'The source query filters on the distribution status, so a re-run does not re-send prices already sent',
      rule: { type: 'exists', component: 'db-select', where: { sql: { oneOf: ['PENDING', 'SENT'] } } },
    },
    {
      label: 'Prices go to stores in chunks of many prices that stay under about 1 MB (Batch Aggregator of 100 to 5,000 rows)',
      rule: { type: 'inside', component: 'jms-publish', within: 'batch-aggregator', withinWhere: { size: { gte: 100, lte: 5000 } } },
    },
    {
      label: 'Each store has its own destination (STORE.<id>.PRICES)',
      rule: { type: 'exists', component: 'jms-publish', where: { destination: 'STORE' } },
    },
    {
      label: 'Sent rows are flagged SENT in Oracle with a Bulk Update inside the job',
      rule: { type: 'inside', component: 'db-bulk-update', where: { sql: 'SENT' }, within: 'batch-job' },
    },
    {
      label: 'Rows are flagged SENT only after they were published',
      rule: { type: 'before', first: 'jms-publish', then: 'db-bulk-update', thenWhere: { sql: 'SENT' }, every: true },
    },
    {
      label: 'One unreachable store does not stop the whole run (max failed records -1)',
      rule: { type: 'exists', component: 'batch-job', where: { maxFailedRecords: { lte: -1 } } },
    },
    {
      label: 'Failed rows are recorded as failed for a re-send (ONLY_FAILURES step)',
      rule: {
        type: 'inside',
        component: ['db-insert', 'db-bulk-insert', 'db-update', 'db-bulk-update'],
        within: 'batch-job',
        routeWhere: { acceptPolicy: { is: 'ONLY_FAILURES' } },
      },
    },
    {
      label: 'A completion summary is emailed from On Complete',
      rule: { type: 'inside', component: 'email-send', within: 'batch-job', inSlot: 'onComplete' },
    },
  ],
  referenceFlow: design(
    flow(
      'distribute-store-prices',
      source('scheduler', { strategy: 'cron', expression: '0 30 1 * * ?' }),
      [
        step('set-variable', { variableName: 'runDate', value: '#[now() as Date]' }),
        // Streaming select, fetchSize 5000, ordered by store so aggregated chunks are mostly single-store.
        step('db-select', {
          sql: "SELECT spc.CHANGE_ID, spc.STORE_ID, pc.SKU, pc.NEW_PRICE, pc.PROMO_ID, pc.EFFECTIVE_FROM\nFROM STORE_PRICE_CHANGE spc\nJOIN PRICE_CHANGE pc ON pc.CHANGE_ID = spc.CHANGE_ID\nWHERE spc.DIST_STATUS IN ('PENDING', 'FAILED')\n  AND pc.EFFECTIVE_FROM < TRUNC(SYSDATE) + 2\nORDER BY spc.STORE_ID, pc.SKU",
        }),
        router(
          'batch-job',
          { jobName: 'store-price-distribution', blockSize: 500, maxFailedRecords: -1 },
          [
            route({ name: 'publish-to-stores', acceptPolicy: 'NO_FAILURES' }, [
              scope('batch-aggregator', { size: 1000 }, [
                step('transform', {
                  script:
                    '%dw 2.0\noutput application/java\n---\n(payload groupBy ((r) -> r.STORE_ID as String)) pluck ((rows, store) -> {\n  storeId: store as String,\n  body: write({\n    storeId: store as String,\n    prices: rows map ((r) -> {\n      changeId: r.CHANGE_ID,\n      sku: r.SKU,\n      price: r.NEW_PRICE,\n      promoId: r.PROMO_ID,\n      effectiveFrom: r.EFFECTIVE_FROM\n    })\n  }, "application/json")\n})',
                }),
                scope('foreach', { collection: '#[payload]' }, [
                  step('set-variable', { variableName: 'storeId', value: '#[payload.storeId]' }),
                  // Publish the JSON body, not the { storeId, body } wrapper.
                  step('set-payload', { value: '#[payload.body]' }),
                  // Persistent delivery, timeToLive 20 h so stale prices never apply the day after.
                  step('jms-publish', { destination: '#["STORE." ++ vars.storeId ++ ".PRICES"]', persistentDelivery: 'true', timeToLive: 72000000 }),
                ]),
              ]),
            ]),
            route({ name: 'mark-sent', acceptPolicy: 'NO_FAILURES' }, [
              scope('batch-aggregator', { size: 2000 }, [
                step('db-bulk-update', {
                  sql: "UPDATE STORE_PRICE_CHANGE\nSET DIST_STATUS = 'SENT', SENT_AT = SYSTIMESTAMP, ERROR_TEXT = NULL\nWHERE CHANGE_ID = :CHANGE_ID AND STORE_ID = :STORE_ID",
                }),
              ]),
            ]),
            route({ name: 'record-failures', acceptPolicy: 'ONLY_FAILURES' }, [
              step('db-update', {
                sql: "UPDATE STORE_PRICE_CHANGE\nSET DIST_STATUS = 'FAILED', ERROR_TEXT = :errorText\nWHERE CHANGE_ID = :CHANGE_ID AND STORE_ID = :STORE_ID",
              }),
            ]),
          ],
          {
            onComplete: [
              step('transform', {
                script:
                  '%dw 2.0\noutput text/plain\n---\n"Store price distribution " ++ (vars.runDate as String) ++ "\\nRows: " ++ (payload.totalRecords as String) ++ "\\nSent: " ++ (payload.successfulRecords as String) ++ "\\nFailed: " ++ (payload.failedRecords as String) ++ "\\nElapsed min: " ++ ((payload.elapsedTimeInMillis / 60000) as String {format: "0.0"})',
              }),
              step('email-send', { toAddresses: 'store-systems@example.com', subject: 'Nightly price distribution' }),
            ],
          },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Price distribution could not start: " ++ error.description]' }),
        ]),
      ],
    ),
  ),
  description: `
A home-improvement chain changes prices and promotions every night.

**Price data**
- The **Oracle** pricing database holds \`PRICE_CHANGE\` (change ID, price zone, SKU, new price, promo ID, effective date).
- The pricing engine expands it per store into \`STORE_PRICE_CHANGE\` (change ID, store ID, \`DIST_STATUS\` PENDING/SENT/FAILED).
- There are **500 stores** in 12 price zones.
- A typical night produces **~1.5 million store × SKU rows** (much more before seasonal markdowns).

**Stores**
- Each store runs a POS/price server that consumes its own **ActiveMQ** queue \`STORE.<storeId>.PRICES\` over a store-to-DC network of brokers.
- The store applies prices at opening time.

**Requirements**
- Everything must be on the store queues by **05:00**; the job starts at 01:30.
- Messages should carry many prices each (store servers are slow with millions of small messages), but stay under ~1 MB.
- A store whose queue/broker link is broken must not stop the other 499.
- Ops need a per-store record of what was sent so they can re-send a single store, and a summary email every morning.
- Re-running the job must not re-send prices already delivered.

**Design the flow(s).**
`,
  answerTemplate: `## Trigger and source query

## Batch job structure

## Message size and per-store destinations

## Tracking what was sent

## Failures and re-runs

## Summary
`,
  keyPoints: [
    'Scheduler (cron) → streaming Database Select ordered by store → Batch Job with max failed records -1 so bad records/stores do not abort the run.',
    'Batch Aggregator (e.g. 1,000 records) + DataWeave groupBy store → one JMS message per store chunk, published to a dynamic destination STORE.<id>.PRICES.',
    'A second step flags rows SENT with a Database Bulk Update; the source query only picks PENDING/FAILED rows, so re-runs do not re-send.',
    'An ONLY_FAILURES step marks rows FAILED with the error text so one store can be re-sent later.',
    'On Complete uses totalRecords / successfulRecords / failedRecords to email a summary.',
    'Set a JMS time-to-live and persistent delivery so prices that miss their day expire instead of applying late.',
  ],
  solution: `
1. **Scheduler** \`0 30 1 * * ?\`.
2. **Database Select** (streaming, fetch size ~5,000) — store × SKU rows with \`DIST_STATUS\` PENDING or FAILED, **ordered by store**.
3. **Batch Job** \`store-price-distribution\`, block size 500, **max failed records -1**.
   - **publish-to-stores** (NO_FAILURES): **Batch Aggregator size 1,000** → DataWeave groups the chunk by store → **For Each** store group → keep \`storeId\` in a variable, set the payload to the JSON body → **JMS Publish** to \`#["STORE." ++ vars.storeId ++ ".PRICES"]\` (persistent, TTL ~20 h). 1,000 prices × ~150 bytes ≈ 150 KB per message.
   - **mark-sent** (NO_FAILURES): Batch Aggregator 2,000 → **Database Bulk Update** \`SET DIST_STATUS = 'SENT'\` by change ID + store ID.
   - **record-failures** (ONLY_FAILURES): **Database Update** \`DIST_STATUS = 'FAILED'\` with the error text.
   - **On Complete**: summary text from the BatchJobResult → **Email Send**.

**Why per-store queues?** One topic with 500 subscribers filtering by selector would push all 1.5 M rows through every store link; per-store queues send each store only its data and let a store that is offline catch up later.

**Failure granularity:** if a JMS Publish fails inside the aggregator, expect all records in that aggregated chunk to be marked failed (the docs do not spell this out, so confirm it in a test). Chunks ordered by store keep that blast radius to one or two stores. A re-run (or an ops endpoint for one store) re-selects only rows not SENT.

**Throughput:** ~1,500 messages of 1,000 prices; the bottleneck is usually Oracle read speed and the broker network, not Mule. Tune batch concurrency and broker producer flow control.
`,
  followUps: [
    {
      q: 'Why does the aggregator chunk need to be grouped by store in DataWeave?',
      a: 'An aggregator collects records in arrival order, so a chunk can span two stores at a boundary. Grouping inside the aggregator keeps each JMS message single-store.',
    },
    {
      q: 'How would a store that was offline for two days catch up?',
      a: 'Its queue keeps persistent messages until TTL; anything expired or FAILED is visible in STORE_PRICE_CHANGE, so ops trigger a store-specific re-send of the current price set instead of replaying old changes.',
    },
    {
      q: 'What is the risk of marking SENT in a later batch step?',
      a: 'If the worker dies after publishing but before mark-sent runs, a re-run sends those prices again. Stores must treat price messages idempotently (change ID), which is cheap for a price set.',
    },
  ],
}

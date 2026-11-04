export default {
  id: 'inc-055',
  category: 'incidents',
  title: 'Store Sales Queue Backlog Grows While the Consumer Looks Healthy',
  level: 'BEGINNER',
  tags: ['retail', 'activemq', 'jms', 'oracle', 'performance', 'indexes'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '06:00:01.002 INFO  [deploy] store-sales-consumer v1.8.0 started (JMS listener on queue STORE.SALES.IN)', relevant: true, why: 'The backlog starts after this release, which added the stock-on-hand update by SKU code.' },
      { text: '06:30:00.118 INFO  [health] GET /health 200 (3 ms)', relevant: false },
      { text: '06:30:12.441 INFO  [sales] Received sale txn=S0412-88120 store=0412 lines=6', relevant: false },
      { text: '06:30:16.950 INFO  [sales] UPDATE STORE_STOCK by sku_code took 4480 ms txn=S0412-88120', relevant: true, why: 'Each line update now takes seconds instead of milliseconds, so every message takes ~25 s.' },
      { text: '06:31:00.000 INFO  [metrics] cpu=6% heap=35% threads.active=4 (maxConcurrency=4)', relevant: true, why: 'The app is idle on CPU and all 4 consumers are busy: they are waiting on the database, not crashing.' },
      { text: '06:31:02.300 INFO  [amq-console] STORE.SALES.IN pending=48210 enqueued=+1900/min dequeued=+10/min consumers=4', relevant: true, why: 'Messages arrive far faster than they are consumed; the consumers are connected but slow.' },
      { text: '06:31:05.774 INFO  [oracle-awr] Top SQL: UPDATE STORE_STOCK SET qty_on_hand = ... WHERE sku_code = :1 AND store_id = :2 (TABLE ACCESS FULL)', relevant: true, why: 'The new statement does a full scan of a 40-million-row table because there is no index on (store_id, sku_code).' },
      { text: '06:31:10.010 INFO  [sales] Price lookup cache hit ratio 0.98', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the most likely root cause of the growing backlog?',
        options: [
          'The new UPDATE filters on sku_code, which has no index, so every line does a full table scan and the consumers crawl',
          'The ActiveMQ broker is out of memory and is not delivering messages',
          'The JMS listener disconnected after the release',
          'The stores are sending duplicate sales messages',
        ],
        answer: 0,
        explain: 'Consumers are connected (consumers=4) and busy, CPU is low, and the slow statement shows TABLE ACCESS FULL. The bottleneck is the Oracle update, not the broker or the connection.',
      },
      {
        type: 'single',
        prompt: 'What is the best **immediate** action?',
        options: [
          'Purge the STORE.SALES.IN queue so the stores can start fresh',
          'Have the DBA create an index on STORE_STOCK (store_id, sku_code), then watch the dequeue rate',
          'Raise numberOfConsumers and maxConcurrency to 64',
          'Restart the broker',
        ],
        answer: 1,
        explain: 'An index fixes the slow statement directly (creating it ONLINE avoids blocking). Purging loses sales; 64 concurrent full scans would hammer the database even harder.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and prevention**?',
        options: [
          'Review execution plans of new SQL against production-sized data before release',
          'Alert on queue depth and on the age of the oldest pending message',
          'Track DB operation duration per statement in the app metrics',
          'Switch the listener to ackMode DUPS_OK to make it faster',
        ],
        answer: [0, 1, 2],
        explain: 'The fix is the index; prevention is plan review and alerts on backlog and DB time. Changing the ack mode does not make a full table scan faster.',
      },
      {
        type: 'order',
        prompt: 'Put the response in order.',
        items: [
          'Confirm consumers are connected and see enqueue rate far above dequeue rate',
          'Find the slow statement in the app logs and the database top SQL',
          'Create the missing index online',
          'Watch the backlog drain and the end-of-day reports catch up',
          'Add queue-depth alerts and SQL plan review to the release checklist',
        ],
        explain: 'Locate the bottleneck, fix it, verify the drain, then prevent it.',
      },
    ],
  },
  description: `
## Symptoms
- Store POS systems publish every sale to the ActiveMQ queue \`STORE.SALES.IN\`. The Mule app \`store-sales-consumer\` updates stock on hand in Oracle.
- Since this morning the queue depth has grown from ~0 to **48,000** and store stock figures are hours behind. Replenishment orders are being calculated on stale stock.
- The app is running, there are no errors in the logs, and CPU is ~6%.

## Change / Context
- Release **v1.8.0** (06:00) changed the stock update from \`WHERE item_id = :id\` (primary key) to \`WHERE store_id = :store AND sku_code = :sku\`, because the new POS sends SKU codes instead of internal item IDs.
- \`STORE_STOCK\` has about **40 million** rows. The flow has \`maxConcurrency="4"\` and the JMS listener keeps its default of 4 consumers.

## Logs
\`\`\`
06:30:12.441 INFO  [sales] Received sale txn=S0412-88120 store=0412 lines=6
06:30:16.950 INFO  [sales] UPDATE STORE_STOCK by sku_code took 4480 ms txn=S0412-88120
06:31:00.000 INFO  [metrics] cpu=6% heap=35% threads.active=4 (maxConcurrency=4)
06:31:02.300 INFO  [amq-console] STORE.SALES.IN pending=48210 enqueued=+1900/min dequeued=+10/min consumers=4
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do **right now**?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Consumers are connected and busy but slow: enqueue rate >> dequeue rate, CPU low.',
    'The new UPDATE filters on (store_id, sku_code) without an index, so each line does a full scan of a 40M-row table.',
    'Immediate: create the index (online) and watch the backlog drain; do not purge sales messages.',
    'Adding more consumers would multiply full table scans and make the database worse.',
    'Prevention: review execution plans on production-sized data, alert on queue depth and oldest message age, measure DB time per statement.',
  ],
  solution: `
**Diagnosis.** The consumers are alive (\`consumers=4\`) and busy, but each sale takes ~25 s because every line runs an UPDATE with **TABLE ACCESS FULL** on a 40-million-row table. Four threads at that speed dequeue ~10 messages a minute while stores publish ~1,900. CPU in Mule is low because the threads are waiting on Oracle.

**Immediate mitigation.** Ask the DBA to create \`CREATE INDEX store_stock_store_sku_ix ON store_stock (store_id, sku_code) ONLINE\` and gather statistics. Watch the dequeue rate jump and the backlog drain. Tell the replenishment team their figures are stale until the queue is back to near zero. Do **not** purge the queue: those are real sales.

**Root cause.** A query change moved the lookup from the primary key to an unindexed column pair. It was tested on a small dataset where a full scan is fast.

**Permanent fix.** Keep the index as part of the release's database change script. Consider mapping SKU code to item ID once (cached lookup) so the hot update stays on the primary key.

**Prevention.** Include execution plans for new or changed SQL in code review and test against production-sized data; alert on queue depth **and** the age of the oldest message; log or export DB operation durations so a 100x slowdown is visible on day one.
`,
  followUps: [
    { q: 'Why not just add consumers to drain faster?', a: 'Each extra consumer runs another full table scan, so the database gets slower for everyone. Fix the per-message cost first, then tune concurrency.' },
    { q: 'Which ActiveMQ metrics show a slow consumer rather than a missing one?', a: 'Consumer count is normal while enqueue count grows much faster than dequeue count; with no consumers the dequeue count would stop completely.' },
    { q: 'Is it safe to create an index on a busy production table?', a: 'Oracle can build it ONLINE so DML continues, but it still uses I/O and CPU; do it with the DBA and monitor. It is far less risky than leaving the backlog growing.' },
  ],
}

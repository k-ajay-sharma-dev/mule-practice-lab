import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-029',
  category: 'flows',
  title: 'Scheduled Purge of Expired Records with Archive and Batch Delete',
  level: 'INTERMEDIATE',
  tags: ['scheduler', 'cron', 'batch', 'batch-aggregator', 'data-retention', 's3'],
  estMinutes: 25,
  flowChecks: [
    {
      label: 'The purge runs on a cron schedule in the nightly window',
      rule: { type: 'source', component: 'scheduler', where: { strategy: 'cron' } },
    },
    {
      label: 'The cron fires inside the 02:00 to 05:00 window',
      rule: { type: 'source', component: 'scheduler', where: { expression: { oneOf: [' 2 ', ' 3 ', ' 4 ', ' 02 ', ' 03 ', ' 04 '] } } },
    },
    {
      label: 'Only expired rows are selected before processing starts',
      rule: { type: 'before', first: 'db-select', firstWhere: { sql: 'WHERE' }, then: ['batch-job', 'foreach'] },
    },
    {
      // The PostgreSQL driver reads the whole result into memory unless a fetch size is set.
      label: 'The select does not load every expired row into memory at once (fetch size set)',
      rule: { type: 'exists', component: 'db-select', where: { fetchSize: { gte: 1 } } },
    },
    { label: 'The millions of rows are processed with a Batch Job', rule: { type: 'exists', component: 'batch-job' } },
    {
      label: 'A failed record does not stop the job (Max failed records is not 0)',
      rule: {
        type: 'any',
        rules: [
          { type: 'exists', component: 'batch-job', where: { maxFailedRecords: -1 } },
          { type: 'exists', component: 'batch-job', where: { maxFailedRecords: { gte: 1 } } },
        ],
      },
    },
    {
      label: 'Rows are archived to S3 before they are deleted',
      rule: { type: 'before', first: ['s3-put', 'file-write', 'sftp-write'], then: ['db-update', 'db-delete'], outside: true },
    },
    {
      label: 'No delete runs from an error handler, where the archive may have failed',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: ['db-delete', 'db-update'] },
          { type: 'absent', component: ['db-delete', 'db-update'], within: ['on-error-continue', 'on-error-propagate'] },
        ],
      },
    },
    {
      label: 'Deletes run in bulk chunks (inside a Batch Aggregator), not row by row',
      rule: { type: 'inside', component: ['db-update', 'db-delete'], within: 'batch-aggregator', where: { sql: 'delete' } },
    },
    {
      label: 'The archive is also written in aggregated chunks',
      rule: { type: 'inside', component: ['s3-put', 'file-write', 'sftp-write'], within: 'batch-aggregator' },
    },
    {
      label: 'The job sends its totals to the DBA team once, from On Complete',
      rule: { type: 'inside', component: ['email-send', 'mq-publish', 'http-request'], within: 'batch-job', inSlot: 'onComplete' },
    },
  ],
  referenceFlow: design(
    flow(
      'purge-expired-audit-events',
      source('scheduler', { strategy: 'cron', expression: '0 0 2 * * ?' }),
      [
        step('set-variable', { variableName: 'cutoff', value: '#[(now() - |P400D|) as Date]' }),
        step('set-variable', { variableName: 'runId', value: '#[now() as String { format: "yyyyMMdd" }]' }),
        step('db-select', {
          sql: 'SELECT id, account_id, event_type, payload, created_at FROM audit_events WHERE created_at < :cutoff',
          // Rows are read 5000 per trip and streamed into the batch queue.
          fetchSize: 5000,
        }),
        router(
          'batch-job',
          { jobName: 'purge-audit-events', blockSize: 500, maxFailedRecords: 1000 },
          [
            route({ name: 'archive-and-delete', acceptPolicy: 'NO_FAILURES' }, [
              scope('batch-aggregator', { size: 5000 }, [
                step('set-variable', { variableName: 'chunk', value: '#[payload]' }),
                step('transform', {
                  script: '%dw 2.0\noutput application/json\n---\npayload',
                }),
                step('s3-put', {
                  bucket: 'audit-archive',
                  key: '#["audit_events/" ++ vars.runId ++ "/" ++ uuid() ++ ".json"]',
                }),
                // Reached only if the put succeeded: processors in the aggregator run in order.
                step('set-payload', { value: '#[vars.chunk]' }),
                step('db-delete', { sql: 'DELETE FROM audit_events WHERE id = :id' }),
              ]),
            ]),
          ],
          {
            onComplete: [
              step('logger', {
                level: 'INFO',
                message:
                  '#["Purge " ++ vars.runId ++ " done: total=" ++ (payload.totalRecords as String) ++ " ok=" ++ (payload.successfulRecords as String) ++ " failed=" ++ (payload.failedRecords as String)]',
              }),
              step('email-send', { toAddresses: 'dba-team@example.com', subject: 'Nightly audit purge report' }),
            ],
          },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Purge could not start: " ++ error.description]' }),
        ]),
      ],
    ),
  ),
  description: `
Compliance says **audit events older than 400 days** must be removed from the \`audit_events\` table (PostgreSQL), but only **after they are archived** to the S3 bucket \`audit-archive\`.

- The table gets ~1.5 million new rows per day. The first run will find ~**60 million** expired rows; after that ~1.5 million per night.
- The purge may only run between **02:00 and 05:00**, because the table is used by reporting during the day.
- A row must **never be deleted unless its archive write succeeded**.
- The DBA team wants a summary (processed / failed) every morning.

**Design the flow(s):**
- How do you trigger the job and select only expired rows without loading 60 million rows into memory?
- How do you guarantee "archive first, then delete" for each row?
- How do you avoid 60 million single-row DELETE statements?
- What happens to failed records, and how is the team informed?
`,
  answerTemplate: `## Trigger and selection

## Batch job structure

## Archive before delete

## Bulk deletes

## Failures and reporting
`,
  keyPoints: [
    'A cron Scheduler (e.g. 0 0 2 * * ?) triggers the job in the maintenance window; the cutoff date is computed once in a variable.',
    'A streaming Database Select feeds a Batch Job, so records are queued to disk instead of being held in memory.',
    'One Batch Aggregator archives a chunk to S3 and then deletes that same chunk: its processors run in order, so a failed S3 put stops the delete for the chunk.',
    'Deletes run inside a Batch Aggregator as a bulk statement (db:bulk-delete / batched DELETE ... WHERE id = :id) instead of one round trip per row.',
    'On Complete logs totalRecords / successfulRecords / failedRecords and notifies the team; maxFailedRecords stops the job if far too many records fail.',
  ],
  solution: `
**Flow \`purge-expired-audit-events\`**
1. **Scheduler** with cron \`0 0 2 * * ?\` (02:00 daily). Use a cluster-aware/primary-node-only schedule so only one replica runs it.
2. \`vars.cutoff = now() - |P400D|\`, then a **Database Select** \`... WHERE created_at < :cutoff\` with streaming (\`fetchSize\`) so rows flow straight into the batch queue.
3. **Batch Job** \`purge-audit-events\` (blockSize 500, maxFailedRecords 1000):
   - **Step \`archive-and-delete\`**: **Batch Aggregator** size 5000 → keep the chunk in a variable → Transform to JSON (or NDJSON/Parquet) → **S3 Put Object** \`audit_events/<runId>/<uuid>.json\` → restore the chunk → bulk **DELETE FROM audit_events WHERE id = :id** (in Mule this is \`db:bulk-delete\`; modelled here as Database Delete). If the put fails, the processors after it do not run, so those rows stay in the table and the next run selects them again. If the delete fails, the chunk is archived twice on the next run, which is harmless.
   - **Why one step:** the docs say the next Batch Step starts on records as soon as they return to the stepping queue. They do not say how a fixed-size aggregator failure marks its records. A separate delete step would rest on that undocumented behaviour.
   - **On Complete**: log totals from the batch job report and email the DBA team.
4. **Time window:** the first catch-up run (60M rows) is split by adding \`FETCH FIRST 5000000 ROWS ONLY\` to the select. Each night removes a slice until the backlog is gone.

A pure SQL alternative (\`DELETE ... WHERE created_at < :cutoff\` in a loop) is faster, but it cannot guarantee archive-before-delete per row. That is why Batch is used here.
`,
  followUps: [
    {
      q: 'Why archive and delete in one aggregator rather than in two batch steps?',
      a: 'Inside one aggregator the order is guaranteed by plain sequential processing: no successful put, no delete. With two steps the guarantee would depend on when a record reaches the next step and on how an aggregator failure marks records, which the docs do not state. If you do use two steps, the delete step must at least be NO_FAILURES, because ALL would also process failed records.',
    },
    {
      q: 'What if the job is still running at 05:00?',
      a: 'Bound each run (row limit or a stop flag checked in a step), size blocks and aggregators so throughput is known, and schedule catch-up runs. Rows that were not processed stay in the table, so the next night\'s select picks them up again.',
    },
    {
      q: 'How do you stop two replicas from running the same purge?',
      a: 'In a Mule cluster (or CloudHub 2.0 with clustering enabled) the Scheduler runs on the primary node only; without clustering CloudHub 2.0 runs it on every replica, so on independent replicas add a distributed lock (Object Store key with TTL) at the start of the flow.',
    },
  ],
}

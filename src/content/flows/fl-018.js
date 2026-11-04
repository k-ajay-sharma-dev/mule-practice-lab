import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-018',
  category: 'flows',
  title: 'Streaming a 4 GB CSV into a Database in Chunks',
  level: 'ADVANCED',
  tags: ['streaming', 'csv', 'database', 'bulk-insert', 'memory'],
  estMinutes: 30,
  flowChecks: [
    { label: 'The load is started by a nightly Scheduler', rule: { type: 'source', component: 'scheduler' } },
    {
      label: 'The CSV is parsed as a stream (streaming=true), never loaded whole',
      rule: { type: 'exists', component: 'transform', where: { script: 'streaming=true' } },
    },
    { label: 'Rows are written with Database Bulk Insert, not row by row', rule: { type: 'exists', component: 'db-bulk-insert' } },
    {
      label: 'Bulk inserts run per chunk (For Each batch size or Batch Aggregator)',
      rule: { type: 'inside', component: 'db-bulk-insert', within: ['foreach', 'batch-aggregator'] },
    },
    {
      label: 'Staged data is swapped into the reporting table inside a Try scope',
      rule: { type: 'inside', component: ['db-update', 'db-insert', 'db-delete'], within: 'try' },
    },
    {
      label: 'The swap Try scope begins a transaction',
      rule: { type: 'exists', component: 'try', where: { transactionalAction: 'BEGIN' } },
    },
    { label: 'The swap happens only after the chunked load', rule: { type: 'before', first: ['foreach', 'batch-job'], then: 'try' } },
    {
      label: 'A flow-level error handler alerts when the load fails',
      rule: { type: 'handler', component: ['on-error-propagate', 'on-error-continue'] },
    },
  ],
  referenceFlow: design(
    flow(
      'nightly-stock-load',
      source('scheduler', { strategy: 'cron', expression: '0 15 1 * * ?' }),
      [
        step('db-update', { sql: 'TRUNCATE TABLE stock_staging' }),
        step('http-request', { method: 'GET', path: '/stock-exports/stock-positions.csv', responseTimeout: 60000 }),
        step('transform', {
          script:
            '%dw 2.0\ninput payload application/csv streaming=true\noutput application/java deferred=true\n---\npayload\n  filter ((row) -> (row.quantity as Number default -1) >= 0)\n  map ((row) -> {\n    storeId: row.store_id,\n    sku: row.sku,\n    quantity: row.quantity as Number\n  })',
        }),
        scope('foreach', { collection: '#[payload]', batchSize: 2000 }, [
          step('db-bulk-insert', {
            sql: 'INSERT INTO stock_staging (store_id, sku, quantity) VALUES (:storeId, :sku, :quantity)',
          }),
        ]),
        scope(
          'try',
          { transactionalAction: 'ALWAYS_BEGIN' },
          [
            step('db-delete', { sql: 'DELETE FROM stock_positions' }),
            step('db-insert', { sql: 'INSERT INTO stock_positions SELECT * FROM stock_staging' }),
          ],
          {
            errorHandlers: [
              handler('on-error-propagate', { type: 'DB:QUERY_EXECUTION' }, [
                step('logger', { level: 'ERROR', message: '#["Swap rolled back: " ++ error.description]' }),
              ]),
            ],
          },
        ),
        step('logger', { level: 'INFO', message: '#["Nightly stock load finished"]' }),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#[error.description]' }),
          step('email-send', { toAddresses: 'reporting-ops@example.com', subject: 'Nightly stock load FAILED' }),
        ]),
      ],
    ),
  ),
  description: `
A retailer sends a nightly **4 GB CSV** (~25 million rows of store-level stock positions) to an S3 bucket. It must be loaded into a **PostgreSQL** reporting table before **06:00** (the file arrives ~01:00).

**Constraints**
- The Mule app runs on a **1 vCore / ~1.5 GB heap** worker.
- Rows with a bad quantity must be skipped and counted, not fail the load.
- If the load fails half-way, reporting must not see a partially loaded table.
- Throughput target: finish in under 2 hours (≈ 3,500 rows/s).

**Design the flow(s):** reading, parsing, chunking, writing, transactional consistency, and the things that would accidentally break streaming.
`,
  answerTemplate: `## Reading the file

## Streaming parse

## Chunking and DB writes

## Bad rows

## Consistency (staging and swap)

## Streaming pitfalls
`,
  keyPoints: [
    'The file is read as a stream (S3 Get Object / File Read with a repeatable file-store or non-repeatable stream), never fully loaded into memory.',
    'DataWeave reads CSV with streaming=true and the script accesses records sequentially (no sizeOf, groupBy, sort, or multiple passes over the payload).',
    'Rows are written in chunks (For Each batchSize ~1000–5000 or Batch Job) using Database Bulk Insert.',
    'Data is loaded into a staging table, then swapped/merged into the reporting table in one DB transaction after the full load succeeds.',
    'Invalid rows are filtered and counted (or written to a reject stream) without stopping the load.',
  ],
  solution: `
1. **Trigger:** Scheduler at 01:15 (or an S3 event notification via SQS) → **Amazon S3 Get Object** returns a stream. For local/SFTP sources, use the connector's read with streaming enabled.
2. **Parse:** Transform Message with \`input payload application/csv streaming=true\` and \`output application/java deferred=true\` that maps each row (\`payload map ...\`) to a DB-ready object and filters invalid rows. The aim is a lazy result that For Each pulls from. The docs show \`deferred=true\` on outputs such as \`application/json\`, but the Java format page does not list it, so test this on your runtime with a large file and watch the heap.
3. **Chunk:** **For Each** with \`batchSize="2000"\` — each iteration receives a list of 2000 records → **Database Bulk Insert** into \`stock_staging\` with parameterised SQL. Alternatively a **Batch Job** (block size tuned, Batch Aggregator size 2000) which adds per-record failure tracking and parallel blocks at the cost of disk I/O for its persistent queues.
4. **Bad rows:** filter them out in DataWeave and increment a counter. CSV values are Strings, so \`is Number\` is always false here: coerce first, as in \`(row.quantity as Number default -1) >= 0\`. Alternatively route them to a reject file written as a separate stream. Don't throw an error per row — exceptions are expensive at 25M rows.
5. **Consistency:** before the load, \`TRUNCATE stock_staging\`. After the loop, in a single **Try scope with a transaction** (Database), run the swap: \`DELETE\`/\`INSERT ... SELECT\` or a table rename (\`ALTER TABLE ... RENAME\`). Reporting sees either the old or the new full data set.
6. **Throughput tuning:** larger bulk sizes, DB connection pool, disable indexes on staging during load, and run multiple For Each chunks concurrently only if row order doesn't matter (Batch Job or Parallel For Each over chunk lists with bounded concurrency).
7. **Pitfalls that break streaming:** logging \`#[payload]\`, \`sizeOf(payload)\`, \`groupBy\`/\`orderBy\` on the whole file, reading the payload twice with a non-repeatable stream, or a DataWeave script that references \`payload\` in two places.
`,
  followUps: [
    { q: 'For Each with batchSize or Batch Job — which would you pick?', a: 'For Each + Bulk Insert is lighter and fastest for simple loads; Batch Job gives per-record error tracking, on-complete stats and parallel step execution, at the cost of persisting records to its queues.' },
    { q: 'How would you restart from row 15 million after a crash?', a: 'Load in committed chunks while recording the last committed line number in a control table, then skip that many rows on restart; staging plus swap keeps reporting unaffected meanwhile.' },
    { q: 'What is the difference between repeatable and non-repeatable streams?', a: 'Repeatable streams buffer content (in memory up to a limit, then a temp file) so it can be read several times; non-repeatable streams can only be consumed once but use the least memory.' },
  ],
}

import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-009',
  category: 'use-cases',
  title: 'Daily Sales Export to the Data Warehouse',
  level: 'BEGINNER',
  tags: ['batch', 'data-lake', 'snowflake', 's3', 'scheduler'],
  estMinutes: 15,
  diagram: {
    task: 'draw the daily export as a data flow: the job, the POS database and master-data API it reads, the S3 raw zone it writes, the Snowflake bulk load from S3, and the control-total alerting.',
    checks: [
      { label: 'A scheduled batch job runs the export', rule: { type: 'node', match: 'batch-job' } },
      { label: 'The job streams POS transactions from the database', rule: { type: 'path', from: 'batch-job', to: ['database', 'erp'] } },
      { label: 'Raw files are written to S3, partitioned by date', rule: { type: 'path', from: 'batch-job', to: 'file-store' } },
      { label: 'Snowflake bulk-loads from the staged S3 files (COPY INTO)', rule: { type: 'edge', from: 'file-store', to: 'data-warehouse' } },
      { label: 'The job triggers the warehouse load', rule: { type: 'path', from: 'batch-job', to: 'data-warehouse' } },
      { label: 'Menu and store master data come from the REST API', rule: { type: 'path', from: 'batch-job', to: ['external-api', 'saas'] } },
      { label: 'Control totals and late runs raise alerts', rule: { type: 'edge', from: 'batch-job', to: ['monitoring', 'notification'] } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'Daily sales export (03:00)'],
        pos: ['database', 'POS transactions (PostgreSQL)'],
        smenu: ['system-api', 'sys-menu-store-api'],
        menu: ['external-api', 'Menu & store master API'],
        s3: ['file-store', 'S3 raw zone (business_date partitions)'],
        dw: ['data-warehouse', 'Snowflake'],
        mon: ['monitoring', 'Control totals & 05:30 alert'],
      },
      ['job -> pos', 'job -> smenu', 'smenu -> menu', 'job -> s3', 's3 -> dw', 'job -> dw', 'job -> mon'],
    ),
  },
  description: `
A restaurant chain with 300 locations wants a daily copy of operational data in **Snowflake** for BI dashboards.

Sources:
- **POS transactions** in a central PostgreSQL database: ~1.5 million rows/day.
- **Menu and store master data** from a REST API (small, changes rarely).

Requirements:
- Data for "yesterday" (store local time, stores span 3 time zones) must be available in Snowflake by **06:00**.
- The data team wants raw files kept in **Amazon S3** as well (for replay and other tools), partitioned by date.
- If the job runs twice for the same day, the warehouse must **not double-count** sales.

**Describe your solution:**
- How do you extract and move 1.5M rows efficiently in Mule?
- How do you load into Snowflake?
- How do you make a re-run safe?
- How do you know the load was complete?
`,
  answerTemplate: `## Extract

## Stage and load

## Re-runs

## Completeness checks
`,
  keyPoints: [
    'Scheduler triggers after the last time zone closes the business day; date window defined per store local time.',
    'Streaming DB query (fetch size, repeatable file store or non-repeatable stream) written in chunks to compressed files in S3 under a date partition, not held in memory.',
    'Snowflake loads the staged files in bulk (COPY INTO from an external stage) rather than row-by-row inserts.',
    'Re-run safe: delete/replace the partition for that business date (or MERGE on transaction ID) before or during load.',
    'Control totals (row count, sum of amounts) compared between source and target; alert if they differ or if the job has not finished by 06:00.',
  ],
  solution: `
**Extract.** A Scheduler starts at 03:00 (after the western-most stores close their day). The query selects transactions whose **store-local business date** is yesterday, with the DB connector's **streaming** enabled and a sensible fetch size. Do not \`collect\` 1.5M rows into one payload: stream them through DataWeave into **CSV (gzip) or JSON lines files** of e.g. 250k rows each.

**Stage and load.**
1. Write the files to **S3** with the Amazon S3 connector under a partition path such as \`pos/business_date=2026-11-02/part-0001.csv.gz\`. This is the raw, replayable copy the data team asked for.
2. Load into Snowflake from that location with a bulk **COPY INTO** from an external stage pointing at the bucket — executed by the Snowflake connector (or the DB connector with the Snowflake JDBC driver). Snowflake bulk loading is far faster than row inserts from Mule.
3. Master data (menus, stores) is small: fetch from the API and MERGE into dimension tables.

**Re-runs.** Make the load for a business date **replace** the previous one: load into a staging table, then in one transaction \`DELETE FROM sales WHERE business_date = :d\` and insert from staging — or \`MERGE\` on transaction ID. In S3, overwrite the same partition path. Running twice gives the same result.

**Completeness checks.** Before loading, compute **control totals** at the source (row count, sum of net amount per store). After loading, run the same query in Snowflake and compare. Mismatch → fail the job and alert. Also alert if the job has not finished by 05:30, so someone can react before 06:00. Log run ID, business date, row counts and duration.
`,
  followUps: [
    { q: 'Why not let Snowflake pull directly from Postgres with a separate ELT tool?', a: 'That is a fair option and often better for pure replication; Mule fits when you also need API sources, transformation, business rules or a single integration platform with monitoring. Mention the trade-off rather than forcing Mule.' },
    { q: 'Late transactions arrive two days later. How do you handle them?', a: 'Reload a rolling window (e.g. the last 3 business dates) each night using the same replace-by-partition logic, so late rows are picked up without duplicates.' },
    { q: 'How do you keep memory under control?', a: 'Streaming query, chunked file writes, no full-payload operations like sorting all rows in DataWeave, and a file-backed repeatable stream if the payload must be read more than once.' },
  ],
}

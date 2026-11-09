import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-102',
  category: 'use-cases',
  title: 'Oracle EBS Finance Feed to Snowflake with Change Data Capture',
  level: 'ADVANCED',
  tags: ['cdc', 'kafka', 'oracle-ebs', 'oracle', 'snowflake', 's3', 'data-warehouse', 'finance'],
  estMinutes: 40,
  diagram: {
    task: 'draw the change data capture feed from the Oracle EBS database to Snowflake: the capture onto Kafka, the Mule loader, the staging bucket, the dead-letter destination, and the hourly check that compares counts and raises alerts.',
    checks: [
      { label: 'Changes are captured from the EBS database onto Kafka', rule: { type: 'edge', from: 'oracle-db', to: 'event-stream', kind: 'async' } },
      { label: 'A loader consumes the change stream', rule: { type: 'edge', from: 'event-stream', to: 'process-api', kind: 'async' } },
      { label: 'No API or job queries the EBS database', rule: { type: 'no-path', from: ['batch-job', 'process-api', 'system-api', 'experience-api'], to: 'oracle-db' } },
      { label: 'Data lands in the warehouse through a staging bucket', rule: { type: 'path', from: 'process-api', via: ['s3-bucket', 'azure-blob', 'file-store'], to: 'data-warehouse' } },
      { label: 'The loader stages files instead of inserting row by row into the warehouse', rule: { type: 'no-edge', from: 'process-api', to: 'data-warehouse' } },
      { label: 'Records that cannot be mapped go to a dead-letter destination', rule: { type: 'edge', from: 'process-api', to: 'dlq' } },
      { label: 'A scheduled check compares row counts in the warehouse', rule: { type: 'path', from: 'batch-job', to: 'data-warehouse' } },
      { label: 'Lag and count mismatches raise alerts', rule: { type: 'edge', from: ['batch-job', 'process-api'], to: 'notification' } },
    ],
    reference: diagram(
      {
        ebs: ['oracle-db', 'Oracle EBS database (19c)'],
        k: ['event-stream', 'ebs.finance.cdc (Kafka)'],
        prc: ['process-api', 'prc-finance-dw-loader'],
        s3: ['s3-bucket', 'Staging files (Parquet)'],
        dw: ['data-warehouse', 'Snowflake finance mart'],
        dlq: ['dlq', 'ebs.finance.cdc.dlq'],
        rep: ['batch-job', 'Hourly count check'],
        mail: ['notification', 'Lag and count alerts'],
      },
      ['ebs ~> k', 'k ~> prc', 'prc ~> dlq', 'prc -> s3', 's3 ~> dw', 'rep -> dw', 'rep -> mail'],
    ),
  },
  description: `
A wholesale distributor reports finance from a **Snowflake** warehouse. Today a nightly Mule job runs full extracts of GL balances, AP invoices, AR transactions and payments from **Oracle E-Business Suite 12.2**. It takes **5 hours**, often runs into the business day, slows down EBS for users in Asia, and the data is up to 30 hours old.

Target:
- Data in Snowflake no more than **1 hour** old.
- **No queries against EBS tables** during the day. The DBA team has approved **Oracle GoldenGate** reading the redo logs and publishing changes to **Kafka** (Confluent Cloud).
- About **3 million changes a day** across 14 tables, peaks of 400,000 an hour during the AP payment run.
- Deletes must reach Snowflake (EBS purges some interface rows), and changes to one row must be applied in order.
- Snowflake should be loaded in micro-batches through an external stage on **Amazon S3**; the data team uses Snowpipe.
- Finance must be able to trust it: any gap between EBS and Snowflake must be found within an hour.

**Questions:**
1. How does the change stream flow from EBS to Snowflake?
2. How do you keep ordering, handle deletes and avoid duplicates?
3. How do you replay after a bug in the mapping?
4. How do you prove nothing is missing?
`,
  answerTemplate: `## Flow

## Ordering, deletes and duplicates

## Replay

## Completeness checks
`,
  keyPoints: [
    'GoldenGate captures changes from redo logs into Kafka topics keyed by primary key, so changes to one row stay in one partition and in order.',
    'A Mule Kafka consumer maps each change to the warehouse model, writes micro-batch Parquet files to S3, and commits offsets only after the file is written.',
    'Snowpipe loads the files into a raw table; a MERGE on primary key with the source change number applies inserts, updates and deletes once.',
    'Kafka retention allows replay: reset the consumer group offset and the idempotent MERGE absorbs the repeats.',
    'An hourly job compares counts and amounts per table and period with a GoldenGate heartbeat and alerts on lag or gaps; poison records go to a DLQ topic.',
  ],
  solution: `
\`\`\`
Oracle EBS DB --GoldenGate (redo)--> Kafka ebs.finance.cdc --> prc-finance-dw-loader --> S3 staging --Snowpipe--> Snowflake
                                                                    \\--> DLQ topic         hourly count check --> alerts
\`\`\`

**Capture.** GoldenGate reads the redo logs, so EBS sees no extra queries. It publishes one topic per table with the **primary key as the Kafka key**, and each message carries the operation (insert, update, delete), before and after images and the commit SCN.

**Loading.** **prc-finance-dw-loader** is a Mule app with the Kafka connector, running a consumer group with one consumer per partition. It maps each change to the warehouse column names and types, and collects changes per table into a file every 5 minutes or 50,000 records. The file is written to S3 as Parquet. Only after the S3 write succeeds does the app commit the offsets, so a crash replays the last batch instead of losing it.

**Applying.** Snowpipe loads each file into a raw change table. A Snowflake task merges the raw changes into the target tables by primary key, keeping only the change with the highest SCN per key. Deletes remove the row. Because the merge compares SCNs, a change loaded twice or out of order does no harm.

**Bad records.** A message that cannot be mapped (unexpected column type after an EBS patch) goes to the DLQ topic with the error, and the partition carries on.

**Replay.** Kafka keeps 7 days. After a mapping fix, the consumer group offsets are reset to the time of the bug, and the merge absorbs the repeated changes.

**Completeness.** Every hour a job compares Snowflake with control data published by GoldenGate: row counts and amount totals per table and accounting period, plus a heartbeat table that shows the end-to-end lag. A difference or a lag over 60 minutes alerts the data team.
`,
  followUps: [
    { q: 'Why not insert each change straight into Snowflake from Mule?', a: 'Single-row inserts are slow and costly in Snowflake. Files through a stage load in bulk and cost far less compute.' },
    { q: 'What happens to ordering if you add partitions to the topic?', a: 'Keys can move to a new partition, so changes for one row may be split. The SCN compare in the merge still applies them in the right order.' },
    { q: 'How do you load history before CDC starts?', a: 'Take one initial snapshot at a known SCN during a quiet window, load it, then start the CDC stream from that SCN so nothing is missed or doubled.' },
  ],
}

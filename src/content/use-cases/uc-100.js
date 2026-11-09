import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-100',
  category: 'use-cases',
  title: 'Nightly Usage Billing Batch with Checkpoint and Restart',
  level: 'ADVANCED',
  tags: ['batch', 'sftp', 'oracle', 'restart', 'idempotency', 'reconciliation', 'cloudhub-2', 'telecom'],
  estMinutes: 40,
  diagram: {
    task: 'draw the nightly billing load: the Mule batch job, the mediation SFTP server and the billing database behind their System APIs, the run lock, the checkpoint and control-total table, where failed records are parked and how ops gets the totals.',
    checks: [
      { label: 'A batch job runs the nightly load', rule: { type: 'node', match: 'batch-job' } },
      { label: 'Usage files are read only through a System API', rule: { type: 'only-via', target: 'sftp-server', from: 'system-api' } },
      { label: 'The billing database is written only through a System API', rule: { type: 'only-via', target: 'oracle-db', from: 'system-api' } },
      { label: 'The job loads usage into the billing database', rule: { type: 'path', from: 'batch-job', to: 'oracle-db' } },
      { label: 'Progress is checkpointed in a database so a restart resumes', rule: { type: 'edge', from: ['batch-job', 'process-api'], to: 'database' } },
      { label: 'A lock stops two replicas running the job together', rule: { type: 'edge', from: ['batch-job', 'process-api'], to: 'cache' } },
      { label: 'Records that fail are parked, not retried forever', rule: { type: 'edge', from: ['batch-job', 'process-api'], to: 'dlq' } },
      { label: 'Ops receives the control totals for every run', rule: { type: 'edge', from: ['batch-job', 'process-api'], to: 'notification' } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'Nightly usage load (Mule batch, 23:00)'],
        sfile: ['system-api', 'sys-mediation-sftp-api'],
        sftp: ['sftp-server', 'Mediation usage files'],
        lock: ['cache', 'Run lock (Object Store)'],
        ck: ['database', 'Checkpoint and control-total table'],
        sbill: ['system-api', 'sys-billing-db-api'],
        bill: ['oracle-db', 'Billing database (Oracle 19c)'],
        err: ['dlq', 'Failed usage records'],
        mail: ['notification', 'Ops report with control totals'],
      },
      ['job -> lock', 'job -> sfile', 'sfile -> sftp', 'job -> ck', 'job -> sbill', 'sbill -> bill', 'job ~> err', 'job -> mail'],
    ),
  },
  description: `
A mobile operator with 3 million subscribers rates usage every night. The **mediation platform** drops call, SMS and data records as compressed CSV files on an **SFTP** server. A Mule 4 application loads them into the **billing database** (Oracle 19c), where a stored procedure rates them before the bill run.

Facts:
- **1.8 million records** a night in 40 to 60 files, 50 to 200 MB each. Each file has a trailer with the record count and the total of the duration and volume columns.
- The window is **23:00 to 05:00**. The bill run starts at 05:30 and must not see half-loaded data.
- Every record has a unique **usage id** from mediation.
- Last quarter the job died at record 1.2 million after a database failover. It was restarted from the beginning, ran past 05:30 and **charged 9,000 customers twice** for the same calls.
- The app runs on **CloudHub 2.0 with 2 replicas** for availability.
- About 0.2% of records are invalid (unknown subscriber, negative duration).

**Questions:**
1. How do you structure the job so it can restart without loading anything twice?
2. How do you keep the second replica from starting the same run?
3. What happens to invalid records?
4. How do you prove the run is complete before the bill run starts?
`,
  answerTemplate: `## Batch structure

## Checkpoint and restart

## Single run across replicas

## Invalid records

## Control totals
`,
  keyPoints: [
    'A Mule batch job per file with blocks of 500 to 2,000 records and a bulk insert per block into a staging table, inside the System API.',
    'The insert is idempotent: a unique key on usage id with MERGE or insert-ignore, so a block loaded twice changes nothing.',
    'A checkpoint table holds each file status and last committed block; a restart skips DONE files and resumes the open one.',
    'A lock in a shared Object Store (or the scheduler primary-node setting) makes sure only one replica runs the job.',
    'Failed records go to an error store with the reason; per file the loaded plus rejected count must equal the trailer count before the file is marked DONE and the bill run is released.',
  ],
  solution: `
**Structure.** At 23:00 the job takes a **lock** in a persistent Object Store with a time-to-live longer than the window. The second replica fails to get it and does nothing. The job lists the files through **sys-mediation-sftp-api** and writes one row per file to the **checkpoint table** (status NEW). Each file runs through a Mule **batch job**: records are streamed from the CSV, validated in one step, and aggregated in blocks of 1,000 for the load step.

**Loading.** **sys-billing-db-api** bulk inserts each block into a staging table with a \`MERGE\` on \`usage_id\`. If a block is sent twice after a crash, the rows already there are not inserted again. After each block commits, the job updates the checkpoint row with the number of records loaded.

**Restart.** On restart the job reads the checkpoint table. Files marked DONE are skipped. The file in progress is read again from the start, but blocks already loaded are skipped fast by count, and the MERGE covers any block that was half way. No customer is charged twice, because the usage id is unique in staging.

**Invalid records.** The validation step sends failing records with the reason to the **failed records** store. They are not retried; billing operations fixes the subscriber data and replays them the next night.

**Control totals.** At the end of each file the job compares loaded plus rejected records, and the sum of duration and volume, with the trailer. Only a matching file is marked DONE. When all files are DONE, the job calls the procedure that moves staging into the rating tables and sets the flag that releases the 05:30 bill run. Ops gets a report with the totals per file. Any mismatch holds the bill run and pages the on-call engineer.
`,
  followUps: [
    { q: 'Why not rely on the batch job\'s own persistent queue to resume after a crash?', a: 'The batch queue lives with the app runtime and is lost when a CloudHub replica is replaced. A checkpoint table in the database survives any restart and can be read by people.' },
    { q: 'How do you choose the block size?', a: 'Large enough to make bulk inserts efficient and small enough to keep memory and redo per commit low. Test with real files and tune between 500 and 2,000.' },
    { q: 'What if the lock owner crashes and the lock never expires?', a: 'Give the lock a time-to-live and have the owner renew it while it runs. A dead owner stops renewing, the lock expires and the other replica can take over.' },
  ],
}

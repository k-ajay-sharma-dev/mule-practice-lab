import { diagram } from '../../arch/dsl.js'

const loads = { name: 'sales groups', from: { type: 'batch-job', label: 'load' }, rps: 1, to: ['sftp-server', 'sql-server'], kind: 'write' }
const report = { name: 'job report', from: { type: 'batch-job', label: 'report' }, rps: 1, to: ['sql-server', 'notification'], kind: 'read' }

export default {
  id: 'uc-204',
  category: 'use-cases',
  title: 'The Whole Nightly Sales Batch Around SQL Server: a Load Job on Two Replicas, Groups on a Queue, a Loader Through a System API, a Morning Report by Email, Sized for Slow Files, Deadlocks, Patching, Poison Groups and a Zone Outage',
  level: 'EXPERT',
  tags: ['myproject', 'batch', 'sql-server', 'sftp', 'queues', 'dlq', 'timeout', 'retry', 'availability', 'job-log'],
  estMinutes: 60,
  diagram: {
    task: 'draw a sales load job that reads files from the SFTP server and puts each group of rows on a queue with a dead-letter queue. A sales loader Process API reads the queue and writes through a sales data System API to SQL Server. A report job reads the job log through the same System API and sends the morning report by email. Only the System API talks to SQL Server.',
    checks: [
      { label: 'The load job reads the SFTP server', rule: { type: 'edge', from: { type: 'batch-job', label: 'load' }, to: 'sftp-server' } },
      { label: 'Groups wait on a queue before they reach SQL Server', rule: { type: 'path', from: { type: 'batch-job', label: 'load' }, via: 'queue', to: 'sql-server' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'SQL Server is reached only through a System API', rule: { type: 'only-via', target: 'sql-server', from: 'system-api' } },
      { label: 'The report job sends the email', rule: { type: 'edge', from: { type: 'batch-job', label: 'report' }, to: 'notification' } },
      { label: 'The load job never waits on SQL Server', rule: { type: 'no-path', from: { type: 'batch-job', label: 'load' }, to: 'sql-server', kind: 'sync' } },
    ],
    reference: diagram(
      {
        sftp: ['sftp-server', 'Store sales SFTP'],
        load: ['batch-job', 'sales-load', { replicas: 2, timeoutMs: 60000 }],
        q: ['queue', 'sales.groups', { maxRedelivery: 60 }],
        dlq: ['dlq', 'sales.groups.dlq'],
        prc: ['process-api', 'prc-sales-loader'],
        sys: ['system-api', 'sys-sales-data', { replicas: 2, retries: 2 }],
        sql: ['sql-server', 'Sales SQL Server'],
        rep: ['batch-job', 'sales-report', { replicas: 2 }],
        mail: ['notification', 'Mail server'],
      },
      ['load -> sftp', 'load ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sys', 'sys -> sql', 'rep -> sys', 'rep -> mail'],
    ),
    simulation: {
      systems: [
        { match: 'sftp-server', latencyMs: 400 },
        { match: 'sql-server', latencyMs: 100 },
        { match: 'notification', latencyMs: 300 },
      ],
      tests: [
        {
          name: 'A normal night',
          about: 'Groups go out to the queue and load, and the report job reads and sends. Every group reaches SQL Server and every report goes out.',
          traffic: [loads, report],
          durationMin: 30,
          expect: {
            answers: [{ flow: 'sales groups', minSuccess: 0.99 }, { flow: 'job report', minSuccess: 0.99 }],
            delivered: [{ flow: 'sales groups', to: 'sql-server', min: 0.99 }],
            lost: { max: 0 },
          },
        },
        {
          name: 'Slow reads on the SFTP server',
          about: 'Christmas files are large. For half an hour each read takes about 25 seconds, and every group still goes out.',
          traffic: [loads],
          incidents: [{ slow: 'sftp-server', latencyMs: 25000, at: 0, forMin: 30 }],
          durationMin: 30,
          expect: { answers: [{ flow: 'sales groups', minSuccess: 0.99 }] },
        },
        {
          name: 'Deadlocks with the stock job',
          about: 'For 20 minutes one SQL Server call in ten is a deadlock victim and works when tried again. The report still reads its rows.',
          traffic: [loads, report],
          incidents: [{ errors: 'sql-server', rate: 0.1, at: 0, forMin: 20 }],
          durationMin: 20,
          expect: { answers: [{ flow: 'job report', minSuccess: 0.99 }] },
        },
        {
          name: 'SQL Server patching',
          about: 'SQL Server is down for 40 minutes. The load job finishes anyway; groups wait on the queue and all load afterwards.',
          traffic: [loads],
          incidents: [{ down: 'sql-server', at: 5, forMin: 40 }],
          durationMin: 100,
          expect: { answers: [{ flow: 'sales groups', minSuccess: 0.99 }], delivered: [{ flow: 'sales groups', to: 'sql-server', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'A zone fails during the night',
          about: 'An availability zone is down for 20 minutes. The load job, the report job and the sales data API each keep a replica in the other zone.',
          traffic: [loads, report],
          incidents: [{ zone: true, at: 5, forMin: 20 }],
          durationMin: 40,
          expect: { answers: [{ flow: 'sales groups', minSuccess: 0.99 }, { flow: 'job report', minSuccess: 0.99 }] },
        },
        {
          name: 'A group that never loads',
          about: 'One group in a hundred holds a store code SQL Server refuses every time. Those groups end on the dead-letter queue, and the queue does not keep growing.',
          traffic: [{ ...loads, poison: 0.01 }],
          durationMin: 150,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 100 }] },
        },
      ],
    },
  },
  description: `
Larkfield Grocers, a fictional grocery chain, is rebuilding its nightly sales batch on CloudHub 2.0:
- A **sales load job** (a Mule batch job) reads \`STORE_SALES_<date>.csv\` files from the **SFTP server** and puts each group of 1,000 rows on a queue.
- A **sales loader** reads the queue and writes each group through a **sales data System API** into **SQL Server**, with a job log row per file.
- A **report job** reads the job log through the same System API at 06:00 and sends the morning report to support by **email**.

**Numbers**
- About **1 group a second** for half an hour; the report job makes about 1 call a second while it runs.
- An SFTP read takes about 400 ms; Christmas files take about **25 seconds** per read.
- A SQL Server call takes about 100 ms. The stock job causes **deadlocks** on about **1 call in 10** for up to 20 minutes. Each try is a victim or not on its own, and the report job may lose fewer than 1 call in 100 to them.
- SQL Server patching takes up to **40 minutes** once a month.
- About **1 group in 100** holds a store code that is refused every time, until the store is set up.
- Last year an availability zone failed for 20 minutes.
- In this model calls time out after 10 seconds unless set otherwise, and a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- Go through each number and say which setting answers it, on which box.
- Why does the report job read through the System API and not SQL Server directly?
- How does support know in the morning that the night is complete?
`,
  answerTemplate: `## Design

## Settings, number by number

## The report path

## A complete night
`,
  keyPoints: [
    'Slow SFTP reads are the load job\'s calls: its timeout goes above 25 seconds.',
    'Deadlocks clear in a moment: retries in the System API cover both the loader and the report job.',
    'Patching is a long outage: only a queue rides it out. 60 deliveries covers 40 minutes and still parks a poison group within the hour.',
    'A zone outage needs a second replica on every box that answers: the load job, the report job and the System API.',
    'A complete night means: every file\'s job row is COMPLETED, the groups queued equal the groups loaded, and the DLQ is empty.',
  ],
  solution: `
**Design**
\`\`\`
sales-load ─► Store sales SFTP
sales-load ~► sales.groups ~► prc-sales-loader ─► sys-sales-data ─► Sales SQL Server
              sales.groups ~► sales.groups.dlq
sales-report ─► sys-sales-data
sales-report ─► Mail server
\`\`\`

**Settings.**
- \`sales-load\`: 2 replicas, timeout 60 seconds.
- \`sales.groups\`: 60 deliveries before the DLQ.
- \`sys-sales-data\`: 2 replicas, 2 retries for deadlocks and lock timeouts.
- \`sales-report\`: 2 replicas.

**Two replicas of each job.** Each job takes a run lock row before it starts, so the second replica skips the run instead of doubling it.
`,
  followUps: [
    {
      q: 'The report is late because the loader is still working through the patching backlog. What should the report say?',
      a: 'What is true at 06:00: files whose job row is still STARTED, and the queue depth. A second report at 08:00, or an alert when the backlog clears, closes the loop.',
    },
    {
      q: 'Could the load job write SQL Server itself on a normal night and use the queue only when SQL Server is down?',
      a: 'That needs failure detection and two code paths, and the switch happens at the worst moment. One path through the queue every night is clearer to run and to test.',
    },
  ],
}

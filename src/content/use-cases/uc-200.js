import { diagram } from '../../arch/dsl.js'

const groups = { name: 'sales groups', from: 'batch-job', rps: 1, to: ['sftp-server', 'sql-server'], kind: 'write' }

export default {
  id: 'uc-200',
  category: 'use-cases',
  title: 'A Batch Job That Finishes on Time While SQL Server Is Patched: Hand Each Group to a Queue, Let a Loader Write It Later, and Park Groups That Never Load',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'batch', 'sql-server', 'queues', 'dlq', 'maintenance-window', 'sftp'],
  estMinutes: 35,
  diagram: {
    task: 'draw a batch job that reads the sales file from the SFTP server and puts each group of rows on a queue with a dead-letter queue. A sales loader Process API reads the queue and writes each group through a sales data System API to SQL Server. The job never waits on SQL Server.',
    checks: [
      { label: 'The batch job reads the SFTP server', rule: { type: 'edge', from: 'batch-job', to: 'sftp-server' } },
      { label: 'Groups wait on a queue before they reach SQL Server', rule: { type: 'path', from: 'batch-job', via: 'queue', to: 'sql-server' } },
      { label: 'The job never waits on SQL Server', rule: { type: 'no-path', from: 'batch-job', to: 'sql-server', kind: 'sync' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'SQL Server is reached only through a System API', rule: { type: 'only-via', target: 'sql-server', from: 'system-api' } },
    ],
    reference: diagram(
      {
        sftp: ['sftp-server', 'Store sales SFTP'],
        job: ['batch-job', 'store-sales-load'],
        q: ['queue', 'sales.groups', { maxRedelivery: 60 }],
        dlq: ['dlq', 'sales.groups.dlq'],
        prc: ['process-api', 'prc-sales-loader'],
        sys: ['system-api', 'sys-sales-data'],
        sql: ['sql-server', 'Sales SQL Server'],
      },
      ['job -> sftp', 'job ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sys', 'sys -> sql'],
    ),
    simulation: {
      systems: [
        { match: 'sftp-server', latencyMs: 400 },
        { match: 'sql-server', latencyMs: 100 },
      ],
      tests: [
        {
          name: 'A normal night',
          about: 'About one group of 1,000 rows a second for half an hour. Every group reaches SQL Server.',
          traffic: [groups],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'sql-server', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'SQL Server patching',
          about: 'SQL Server is down for 40 minutes of monthly patching. The job still finishes on time: groups wait on the queue and all load afterwards.',
          traffic: [groups],
          incidents: [{ down: 'sql-server', at: 5, forMin: 40 }],
          durationMin: 100,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'sql-server', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'A group that never loads',
          about: 'One group in a hundred holds a store code SQL Server refuses every time. Those groups end on the dead-letter queue, and the queue does not keep growing.',
          traffic: [{ ...groups, poison: 0.01 }],
          durationMin: 150,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 100 }] },
        },
      ],
    },
  },
  description: `
Larkfield Grocers, a fictional grocery chain, loads store sales every night with a Mule **batch job**: it reads \`STORE_SALES_<date>.csv\` from the **SFTP server** and writes groups of 1,000 rows to **SQL Server**.

Once a month SQL Server is patched during the load window, for up to **40 minutes**. The job failed every group in that time. The batch counts said so, but reloading the gaps took a morning.

The team plans to split the job: the batch job only reads and hands each group to a queue; a loader writes the groups to SQL Server.

**Numbers**
- About **1 group a second** for half an hour each night.
- Patching takes up to **40 minutes**.
- About **1 group in 100** holds a store code that SQL Server refuses every time, until the store is set up.
- In this model a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- What does the queue give you that the batch job's own retry would not?
- Set the queue's redelivery limit, and explain why 10 and "no limit" are both wrong here.
- Who looks at the dead-letter queue, and what do they do with a group there?
`,
  answerTemplate: `## Design

## Why a queue

## The redelivery limit

## The dead-letter queue
`,
  keyPoints: [
    'The job finishes when every group is on the queue. SQL Server can be down then; the groups wait.',
    'A group is one message of 1,000 rows, so the broker carries 1 message a second, not 1,000.',
    'With a retry about once a minute, 40 minutes of patching needs more than 40 deliveries. 60 leaves room.',
    'No limit lets a group that can never load circle for ever and hide in the queue depth. A limit sends it to the DLQ where someone sees it.',
    'The loader writes each group idempotently, for example a MERGE on file and line, because a redelivered group may have been half written.',
  ],
  solution: `
**Design**
\`\`\`
store-sales-load ─► Store sales SFTP
store-sales-load ~► sales.groups ~► prc-sales-loader ─► sys-sales-data ─► Sales SQL Server
                    sales.groups ~► sales.groups.dlq
\`\`\`

**Settings.** \`sales.groups\`: 60 deliveries before the DLQ.

**The DLQ.** The store data team gets a daily list of groups there. Once the store is set up, support moves the groups back to \`sales.groups\`.
`,
  followUps: [
    {
      q: 'A group is 1,000 rows of about 200 bytes. Is that too big for a queue message?',
      a: 'About 200 KB. Most brokers take it, but check the limit of yours. For groups of 10 MB or more, store the group as a file and send its name (a claim check).',
    },
    {
      q: 'How does the morning check know the night is complete now?',
      a: 'The job log gets the number of groups queued; the loader counts groups loaded per file. When the two agree and the DLQ is empty, the night is done.',
    },
  ],
}

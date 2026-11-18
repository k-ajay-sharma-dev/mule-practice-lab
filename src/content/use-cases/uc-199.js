import { diagram } from '../../arch/dsl.js'

const groups = { name: 'sales groups', from: 'batch-job', rps: 2, to: ['sftp-server', 'sql-server'], kind: 'write' }

export default {
  id: 'uc-199',
  category: 'use-cases',
  title: 'A Nightly Batch Load From SFTP Into SQL Server Through a System API: Retries for Deadlock Victims and Timeouts That Outlast the Weekly Index Rebuild',
  level: 'BEGINNER',
  tags: ['myproject', 'batch', 'sql-server', 'sftp', 'timeout', 'retry', 'deadlock'],
  estMinutes: 25,
  diagram: {
    task: 'draw one batch job that reads the store sales file from the SFTP server and writes each group of rows through a sales data System API to SQL Server. The job never writes SQL Server directly.',
    checks: [
      { label: 'The batch job reads the SFTP server', rule: { type: 'edge', from: 'batch-job', to: 'sftp-server' } },
      { label: 'The batch job writes through a System API', rule: { type: 'edge', from: 'batch-job', to: 'system-api' } },
      { label: 'SQL Server is reached only through a System API', rule: { type: 'only-via', target: 'sql-server', from: 'system-api' } },
      { label: 'The job waits for each of its calls', rule: { type: 'lines', from: 'batch-job', kind: 'sync' } },
    ],
    reference: diagram(
      {
        sftp: ['sftp-server', 'Store sales SFTP'],
        job: ['batch-job', 'store-sales-load', { timeoutMs: 60000 }],
        sys: ['system-api', 'sys-sales-data', { timeoutMs: 60000, retries: 2 }],
        sql: ['sql-server', 'Sales SQL Server'],
      },
      ['job -> sftp', 'job -> sys', 'sys -> sql'],
    ),
    simulation: {
      systems: [
        { match: 'sftp-server', latencyMs: 400 },
        { match: 'sql-server', latencyMs: 150 },
      ],
      tests: [
        {
          name: 'A normal night',
          about: 'About two groups of 500 rows a second for half an hour. Every group reaches SQL Server.',
          traffic: [groups],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'sql-server', min: 0.99 }] },
        },
        {
          name: 'Deadlocks with the stock job',
          about: 'The stock job runs at the same time. For 20 minutes one insert in ten is picked as a deadlock victim and works when tried again a moment later.',
          traffic: [groups],
          incidents: [{ errors: 'sql-server', rate: 0.1, at: 0, forMin: 20 }],
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
        {
          name: 'The weekly index rebuild',
          about: 'On Sunday the rebuild holds locks, and each insert waits about 25 seconds for half an hour. Sunday files are smaller, about one group a second. Every group still loads.',
          traffic: [{ ...groups, rps: 1 }],
          incidents: [{ slow: 'sql-server', latencyMs: 25000, at: 0, forMin: 30 }],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'sql-server', min: 0.99 }] },
        },
      ],
    },
  },
  description: `
Larkfield Grocers, a fictional grocery chain, loads the day's store sales every night. A Mule batch job reads \`STORE_SALES_<date>.csv\` from the **SFTP server** and writes groups of 500 rows through a **sales data System API** into **SQL Server**.

Two problems in the first month:
- A stock job runs at the same time. SQL Server picks some inserts as **deadlock victims** (error 1205). Each one failed its group of 500, and the morning check found holes.
- On Sundays the DBA rebuilds indexes. Inserts waited about **25 seconds**, the calls gave up after the default 10, and nothing loaded.

**Numbers**
- About **2 groups a second** for half an hour; about 1 a second on Sundays.
- A normal insert takes about 150 ms.
- While the stock job runs, about **1 insert in 10** is a deadlock victim, for up to 20 minutes.
- In this model calls time out after 10 seconds unless set otherwise.

**Questions:**
- Draw the design.
- Where do you retry a deadlock, and how many times?
- Which boxes need a longer timeout for the rebuild, and why both?
`,
  answerTemplate: `## Design

## Deadlocks

## The rebuild
`,
  keyPoints: [
    'A deadlock victim works when tried again a moment later. A couple of retries in the System API, close to the database, hide it from the job.',
    'Retry only deadlocks and lock timeouts. A constraint error fails every time, so retrying it wastes the window.',
    'A 25 second insert needs a timeout above it on the System API, and a timeout above that on the job that calls it.',
    'The job still waits for each call, so the job\'s timeout must cover the System API\'s retries too.',
    'Ask the DBA whether the rebuild can run online or outside the load window. Timeouts handle it; moving it removes it.',
  ],
  solution: `
**Design**
\`\`\`
store-sales-load ─► Store sales SFTP
store-sales-load ─► sys-sales-data ─► Sales SQL Server
\`\`\`

**Settings.** \`sys-sales-data\`: timeout 60 seconds, 2 retries. \`store-sales-load\`: timeout 60 seconds.

**Which errors to retry.** In the System API, retry when the SQL error number is 1205 (deadlock victim) or 1222 (lock timeout). Every other error goes back to the job at once.
`,
  followUps: [
    {
      q: 'Why not let the batch job retry the whole group instead?',
      a: 'The job would resend 500 rows and could insert the first ones twice. A retry inside the System API repeats one statement in its own transaction, which is safe.',
    },
    {
      q: 'What makes deadlocks less likely in the first place?',
      a: 'Smaller groups hold locks for less time, both jobs touching tables in the same order helps, and a staging table no other job writes avoids the clash altogether.',
    },
  ],
}

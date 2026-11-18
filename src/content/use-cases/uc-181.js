import { diagram } from '../../arch/dsl.js'

const extract = { name: 'sales extract', from: 'batch-job', rps: 1, to: [{ type: 'sql-server', label: 'replica' }, 'sftp-server'], kind: 'write' }

export default {
  id: 'uc-181',
  category: 'use-cases',
  title: 'A Heavy Nightly Sales Extract From a SQL Server Read Replica: Keep the Tills\' Primary Free, Give the Long Queries a Timeout, and Retry a Busy Replica',
  level: 'BEGINNER',
  tags: ['myproject', 'sql-server', 'read-replica', 'always-on', 'timeout', 'retry', 'outbound', 'planning'],
  estMinutes: 25,
  diagram: {
    task: 'draw the store tills writing to the primary SQL Server, and a nightly extract job that reads sales from the read replica and writes files to the planning platform\'s FTP server. The extract job never reads the primary.',
    checks: [
      { label: 'The tills write to the primary', rule: { type: 'edge', from: 'pos', to: { type: 'sql-server', label: 'primary' } } },
      { label: 'The extract job reads the read replica', rule: { type: 'edge', from: 'batch-job', to: { type: 'sql-server', label: 'replica' } } },
      { label: 'The extract job never reads the primary', rule: { type: 'no-edge', from: 'batch-job', to: { type: 'sql-server', label: 'primary' } } },
      { label: 'The extract job writes to the planning platform\'s FTP server', rule: { type: 'edge', from: 'batch-job', to: 'sftp-server' } },
    ],
    reference: diagram(
      {
        pos: ['pos', 'Store tills'],
        prim: ['sql-server', 'Retail SQL Server primary'],
        rep: ['sql-server', 'Retail SQL Server read replica'],
        job: ['batch-job', 'sales-extract', { timeoutMs: 30000, retries: 2 }],
        ftp: ['sftp-server', 'Planning platform FTP'],
      },
      ['pos -> prim', 'job -> rep', 'job -> ftp'],
    ),
    simulation: {
      systems: [
        { match: { type: 'sql-server', label: 'replica' }, latencyMs: 12000 },
        { match: 'sftp-server', latencyMs: 1500 },
      ],
      tests: [
        {
          name: 'The nightly extract',
          about: 'About one store file a second for half an hour. Each store\'s query takes about 12 seconds on the replica, and every file arrives.',
          traffic: [extract],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'sftp-server', min: 0.99 }], notReached: [{ node: { type: 'sql-server', label: 'primary' } }] },
        },
        {
          name: 'The replica is catching up',
          about: 'After a big load on the primary the replica is busy redoing it. For 20 minutes one query in ten fails with a timeout of its own. A couple of retries get every file through.',
          traffic: [extract],
          incidents: [{ errors: { type: 'sql-server', label: 'replica' }, rate: 0.1, at: 0, forMin: 20 }],
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
Fenwick Sports, a fictional sports retailer, sends each store's sales to the planning platform every night, one file per store, to the **platform's FTP server**. The sales are in the retail **SQL Server**, which also serves the store tills.

The database runs in an **Always On availability group** with a readable secondary (a read replica). The first version of the extract read the primary. Its heavy queries slowed the tills in the stores that trade late.

**Numbers**
- About **1 store file a second** for half an hour.
- Each store's sales query takes about **12 seconds** on the replica.
- After a big load on the primary, the replica can be busy catching up: for up to 20 minutes about **1 query in 10** fails.
- In this model calls time out after 10 seconds unless set otherwise.

**Questions:**
- Draw the design.
- How does the extract job reach the replica and not the primary?
- What timeout and retries does the job need?
- What does the replica's lag mean for the planning platform?
`,
  answerTemplate: `## Design

## Reaching the replica

## Timeout and retries

## Lag
`,
  keyPoints: [
    'Connect through the availability group listener with ApplicationIntent=ReadOnly. Read only routing sends the connection to a readable secondary.',
    'The tills keep the primary to themselves. The heavy reads move to the replica.',
    'A 12 second query needs a timeout above it: 30 seconds leaves room.',
    'A replica that is busy fails some queries for a short while. A couple of retries help; they do not help if the replica is down.',
    'A replica can lag the primary. For a nightly extract a few minutes rarely matter, but sales from the last minutes before the run may be missing, so run it after the stores close.',
  ],
  solution: `
**Design**
\`\`\`
Store tills ─► Retail SQL Server primary
sales-extract ─► Retail SQL Server read replica
sales-extract ─► Planning platform FTP
\`\`\`

**Settings.** Timeout 30 seconds, 2 retries on the job.

**Connection.** The Database config uses the listener name, \`ApplicationIntent=ReadOnly\`, and \`MultiSubnetFailover=True\` when the nodes span subnets. If no readable secondary is up, read only routing falls back to the primary, so ask the DBA what happens in that case.
`,
  followUps: [
    {
      q: 'The replica is down for patching tonight. What happens?',
      a: 'With read only routing, the connection may go to the primary instead, and the tills slow down again. Schedule patching outside the extract window, or let the job skip and alert rather than read the primary.',
    },
    {
      q: 'Can the extract write a job log row on the replica?',
      a: 'No, a readable secondary is read only. Write the job log through a separate connection to the primary, or to another database.',
    },
  ],
}

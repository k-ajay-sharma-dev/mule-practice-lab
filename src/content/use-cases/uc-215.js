import { diagram } from '../../arch/dsl.js'

const exporter = { type: 'batch-job', label: 'exporter' }
const poller = { type: 'batch-job', label: 'poller' }
const exports = { name: 'sales files', from: exporter, rps: 2, to: ['sql-server', 'sftp-server'], kind: 'write' }
const acks = { name: 'load acks', from: poller, rps: 1, to: ['sftp-server', 'erp'], kind: 'write' }

export default {
  id: 'uc-215',
  category: 'use-cases',
  title: 'Sales Out to the Planning Platform\'s FTP Server and Load ACKs Back to the ERP: an Exporter and an ACK Poller That Never Wait on Each Other, Timeouts for Month End, Retries for ERP Lock Timeouts and a Queue for Its Maintenance',
  level: 'ADVANCED',
  tags: ['myproject', 'ftp', 'ack-file', 'queues', 'dlq', 'timeout', 'retry', 'sql-server', 'erp', 'planning'],
  estMinutes: 45,
  diagram: {
    task: 'draw a sales exporter job that reads sales through a sales System API from SQL Server and writes files to the planning platform\'s FTP server. Draw an ACK poller job that reads the platform\'s load ACK files from the same FTP server and puts each ACK on a queue with a dead-letter queue. An ACK loader Process API reads the queue and records each ACK in the ERP through an ERP System API.',
    checks: [
      { label: 'The exporter writes to the FTP server', rule: { type: 'edge', from: exporter, to: 'sftp-server' } },
      { label: 'The exporter reads SQL Server through a System API', rule: { type: 'only-via', target: 'sql-server', from: 'system-api' } },
      { label: 'The poller reads the FTP server', rule: { type: 'edge', from: poller, to: 'sftp-server' } },
      { label: 'ACKs wait on a queue before they reach the ERP', rule: { type: 'path', from: poller, via: 'queue', to: 'erp' } },
      { label: 'The ERP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
    ],
    reference: diagram(
      {
        exp: ['batch-job', 'sales-exporter', { timeoutMs: 60000 }],
        ssql: ['system-api', 'sys-sales'],
        sql: ['sql-server', 'Retail SQL Server'],
        ftp: ['sftp-server', 'Planning platform FTP'],
        poll: ['batch-job', 'ack-poller', { timeoutMs: 60000 }],
        q: ['queue', 'plan.load.acks', { maxRedelivery: 90 }],
        dlq: ['dlq', 'plan.load.acks.dlq'],
        prc: ['process-api', 'prc-ack-loader'],
        serp: ['system-api', 'sys-erp', { retries: 2 }],
        erp: ['erp', 'ERP'],
      },
      ['exp -> ssql', 'ssql -> sql', 'exp -> ftp', 'poll -> ftp', 'poll ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> serp', 'serp -> erp'],
    ),
    simulation: {
      systems: [
        { match: 'sftp-server', latencyMs: 2000 },
        { match: 'sql-server', latencyMs: 300 },
        { match: 'erp', latencyMs: 500 },
      ],
      tests: [
        {
          name: 'A normal night',
          about: 'Sales files go out and load ACKs come back. Every file reaches the FTP server and every ACK the ERP.',
          traffic: [exports, acks],
          durationMin: 30,
          expect: { delivered: [{ flow: 'sales files', to: 'sftp-server', min: 0.99 }, { flow: 'load acks', to: 'erp', min: 0.99 }] },
        },
        {
          name: 'Month end on the FTP server',
          about: 'The platform\'s FTP server is busy and each read or write takes about 30 seconds for half an hour. Both jobs still get through.',
          traffic: [exports, acks],
          incidents: [{ slow: 'sftp-server', latencyMs: 30000, at: 0, forMin: 30 }],
          durationMin: 40,
          expect: { answers: [{ flow: 'sales files', minSuccess: 0.99 }, { flow: 'load acks', minSuccess: 0.99 }], delivered: [{ flow: 'sales files', to: 'sftp-server', min: 0.99 }, { flow: 'load acks', to: 'erp', min: 0.99 }] },
        },
        {
          name: 'ERP maintenance',
          about: 'The ERP is down for an hour. Sales files keep going out, ACKs wait on the queue, and every ACK is recorded afterwards.',
          traffic: [exports, acks],
          incidents: [{ down: 'erp', at: 5, forMin: 60 }],
          durationMin: 120,
          expect: { delivered: [{ flow: 'sales files', to: 'sftp-server', min: 0.99 }, { flow: 'load acks', to: 'erp', min: 0.99 }], dlq: { max: 0 } },
        },
        {
          name: 'Lock timeouts in the ERP',
          about: 'An ERP batch holds locks, and one write in ten times out and works a moment later. Quick retries keep ACKs from waiting a minute on the queue.',
          traffic: [acks],
          incidents: [{ errors: 'erp', rate: 0.1, at: 0, forMin: 20 }],
          durationMin: 20,
          expect: { delivered: [{ to: 'system-api', min: 0.99 }], backlog: [{ queue: 'queue', maxPeak: 3 }], dlq: { max: 0 } },
        },
        {
          name: 'An ACK for a file the ERP never sent',
          about: 'For an hour, one ACK in a hundred names a file from a test run. The ERP refuses it every time; it ends on the dead-letter queue and the queue empties.',
          traffic: [{ ...acks, poison: 0.01, forMin: 60 }],
          durationMin: 180,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 5 }] },
        },
      ],
    },
  },
  description: `
Larkfield Grocers, a fictional grocery chain, sends daily sales to the planning platform as files on the platform's **FTP server**. For each file, the platform later writes a **load ACK file**: loaded, rows, rejects. Finance wants each ACK recorded in the **ERP**, against the export it belongs to.

Today one job does both: it writes tonight's files, then reads the ACKs and calls the ERP. When the ERP was down for maintenance the whole job failed, and that night's sales never reached the platform.

The new design splits it:
- A **sales exporter** reads sales from SQL Server through a sales System API and writes the files.
- An **ACK poller** reads ACK files and puts one message per ACK on a queue. An **ACK loader** records each one in the ERP through an ERP System API.

**Numbers**
- About **2 sales files a second** for half an hour; about **1 ACK a second**.
- An FTP read or write takes about 2 seconds; at month end, about **30 seconds**, for up to half an hour.
- The ERP is down for maintenance for up to **an hour**. An ERP batch holds locks and **1 write in 10** times out for up to 20 minutes, and works when tried again. Each try times out or not on its own. Lock timeouts should cost an ACK seconds, not a minute back on the queue.
- About **1 ACK in 100** names a file from a test run that the ERP never sent; it is refused every time.
- In this model calls time out after 10 seconds unless set otherwise, and a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- Why two jobs, and why a queue only on the ACK side?
- Set the timeouts, the retries and the redelivery limit, and say on which box each goes.
`,
  answerTemplate: `## Design

## Two jobs

## Settings
`,
  keyPoints: [
    'The two directions fail for different reasons. Split, an ERP outage stops only the ACKs, and the sales files still leave on time.',
    'The ACK side needs a queue because its target, the ERP, has long outages. The export side writes to FTP; if FTP is down, rerunning the export later is the fix.',
    'A 30 second FTP call needs a timeout above it on both jobs, since both talk to the FTP server.',
    'Lock timeouts clear in a moment, so retry them in the ERP System API. An hour of maintenance needs more than 60 deliveries; 90 leaves room.',
    'The ACK loader must accept the same ACK twice: the poller can read a file again after a crash. Key the ERP record on the file name.',
  ],
  solution: `
**Design**
\`\`\`
sales-exporter ─► sys-sales ─► Retail SQL Server
sales-exporter ─► Planning platform FTP
ack-poller ─► Planning platform FTP
ack-poller ~► plan.load.acks ~► prc-ack-loader ─► sys-erp ─► ERP
              plan.load.acks ~► plan.load.acks.dlq
\`\`\`

**Settings.** \`sales-exporter\` and \`ack-poller\`: timeout 60 seconds. \`sys-erp\`: 2 retries for lock timeouts. \`plan.load.acks\`: 90 deliveries.

**The poller and the files.** After an ACK is on the queue, the poller moves its file to a done folder, so the next poll does not read it again.
`,
  followUps: [
    {
      q: 'Why not let the platform call an API to deliver the ACKs?',
      a: 'If the platform offers it, an API removes the polling. Many platforms speak files only, so a poller is the usual bridge. Keep the queue behind either one.',
    },
    {
      q: 'An ACK says a file was refused. Who acts?',
      a: 'The ERP record shows it, but someone must look. The loader can also publish refused ACKs to an alert, so the planning team resends the file the same morning.',
    },
  ],
}

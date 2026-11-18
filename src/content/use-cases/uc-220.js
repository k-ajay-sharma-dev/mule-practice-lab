import { diagram } from '../../arch/dsl.js'

const parts = { name: 'history parts', from: 'batch-job', rps: 0.5, forMin: 20, to: ['sql-server', 'file-store', 'sftp-server'], kind: 'write' }

export default {
  id: 'uc-220',
  category: 'use-cases',
  title: 'A 30 GB Weekly Sales History to the Planning Platform\'s SFTP Server in 600 Parts: a Splitter That Lands Each Part and Queues a Notice, Uploaders on Two Replicas With a Timeout Measured for a Busy Link, Retries for Dropped Sessions and a Limit That Outlasts the Platform\'s Maintenance',
  level: 'EXPERT',
  tags: ['myproject', 'large-files', 'split-files', 'sftp', 'queues', 'claim-check', 'timeout', 'retry', 'replicas', 'dlq', 'planning'],
  estMinutes: 55,
  diagram: {
    task: 'draw a history splitter job that reads sales through a sales System API from SQL Server, lands each part in an internal file store and puts one notice per part on a queue with a dead-letter queue. A part uploader Process API reads the queue, reads its part from the file store and uploads it to the planning platform\'s SFTP server.',
    checks: [
      { label: 'The splitter lands the parts in the file store', rule: { type: 'edge', from: 'batch-job', to: 'file-store' } },
      { label: 'SQL Server is reached only through a System API', rule: { type: 'only-via', target: 'sql-server', from: 'system-api' } },
      { label: 'Part notices wait on a queue before parts reach the SFTP server', rule: { type: 'path', from: 'batch-job', via: 'queue', to: 'sftp-server' } },
      { label: 'The splitter never uploads to the SFTP server itself', rule: { type: 'no-path', from: 'batch-job', to: 'sftp-server', kind: 'sync' } },
      { label: 'The uploader reads its part from the file store', rule: { type: 'edge', from: 'process-api', to: 'file-store' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'history-splitter', { replicas: 2, timeoutMs: 60000 }],
        sys: ['system-api', 'sys-sales-history', { replicas: 2, timeoutMs: 60000 }],
        sql: ['sql-server', 'Retail SQL Server'],
        store: ['file-store', 'Landed history parts'],
        q: ['queue', 'history.parts', { maxRedelivery: 150 }],
        dlq: ['dlq', 'history.parts.dlq'],
        prc: ['process-api', 'prc-part-uploader', { replicas: 2, timeoutMs: 180000, retries: 2 }],
        sftp: ['sftp-server', 'Planning platform SFTP'],
      },
      ['job -> sys', 'sys -> sql', 'job -> store', 'job ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> store', 'prc -> sftp'],
    ),
    simulation: {
      systems: [
        { match: 'sql-server', latencyMs: 8000 },
        { match: 'file-store', latencyMs: 2000 },
        { match: 'sftp-server', latencyMs: 5000 },
      ],
      tests: [
        {
          name: 'The weekly history',
          about: 'The splitter lands a part every two seconds for 20 minutes. Every part reaches the platform.',
          traffic: [parts],
          durationMin: 60,
          expect: { delivered: [{ to: 'sftp-server', min: 0.99 }], lost: { max: 0 }, dlq: { max: 0 } },
        },
        {
          name: 'Uploads on a busy link',
          about: 'The link to the platform is shared with a backup, and each upload takes about 90 seconds for an hour. Every part still arrives.',
          traffic: [parts],
          incidents: [{ slow: 'sftp-server', latencyMs: 90000, at: 0, forMin: 60 }],
          durationMin: 120,
          expect: { delivered: [{ to: 'sftp-server', min: 0.99 }], backlog: [{ queue: 'queue', maxPeak: 100 }], dlq: { max: 0 } },
        },
        {
          name: 'A busy sales database',
          about: 'An index rebuild makes each SQL read take about 20 seconds for the whole run. The splitter still lands every part.',
          traffic: [parts],
          incidents: [{ slow: 'sql-server', latencyMs: 20000, at: 0, forMin: 20 }],
          durationMin: 60,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'sftp-server', min: 0.99 }] },
        },
        {
          name: 'Dropped sessions',
          about: 'The platform\'s firewall drops one session in five for half an hour. A new session a moment later works, so the parts still arrive without waiting a minute on the queue.',
          traffic: [parts],
          incidents: [{ errors: 'sftp-server', rate: 0.2, at: 0, forMin: 30 }],
          durationMin: 40,
          expect: { delivered: [{ to: 'process-api', min: 0.99 }], backlog: [{ queue: 'queue', maxPeak: 3 }], dlq: { max: 0 } },
        },
        {
          name: 'A zone fails mid transfer',
          about: 'An availability zone goes down for 15 minutes. The splitter, the sales API and the uploader each have a replica in the other zone, so the transfer carries on.',
          traffic: [parts],
          incidents: [{ zone: true, at: 5, forMin: 15 }],
          durationMin: 60,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'sftp-server', min: 0.99 }], backlog: [{ queue: 'queue', maxPeak: 100 }], dlq: { max: 0 } },
        },
        {
          name: 'The platform\'s maintenance window',
          about: 'The platform\'s SFTP server is down for two hours on the Sunday. Notices wait on the queue and every part is uploaded afterwards.',
          traffic: [parts],
          incidents: [{ down: 'sftp-server', at: 2, forMin: 120 }],
          durationMin: 180,
          expect: { delivered: [{ to: 'sftp-server', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'A part that never uploads',
          about: 'One part in twenty was garbled when it was landed, and the platform refuses it every time. Those parts end on the dead-letter queue and the queue empties.',
          traffic: [{ ...parts, poison: 0.05 }],
          durationMin: 200,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 0 }] },
        },
      ],
    },
  },
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, sends the planning platform a **weekly sales history** every Sunday: about **30 GB**, from SQL Server, to the platform's **SFTP server**. The platform wants it in parts of about **50 MB**, roughly 600 of them, and loads the set when a control file arrives.

Today one job reads, writes and uploads each part in turn. Last month a session dropped at part 412, the job failed, and the rerun started from part 1. The history arrived on Tuesday.

The new design:
- A **history splitter** reads the rows through a sales System API, lands each part in an internal **file store**, and puts a notice per part on a queue: part name, size, checksum.
- A **part uploader** reads a notice, reads that part from the file store and uploads it. A separate step, not drawn here, writes the control file when every part is confirmed.

**Numbers**
- The splitter lands about **one part every two seconds** for 20 minutes. Each SQL read for a part takes about 8 seconds, and about **20 seconds** while the weekly index rebuild runs. Each landing takes about 2 seconds.
- An upload takes about 5 seconds; when a backup shares the link, about **90 seconds**, for up to an hour.
- The platform's firewall drops **1 session in 5** on a bad day, and a new session a moment later works.
- The platform's maintenance window takes up to **two hours** on a Sunday.
- About **1 part in 20** on a bad day is garbled when landed and refused every time.
- An availability zone can fail. In this model calls time out after 10 seconds unless set otherwise, and a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- What does the queue give you that the old job did not?
- Set the timeouts, retries, replicas and the redelivery limit, and say on which box each goes.
- How is a garbled part found and fixed?
`,
  answerTemplate: `## Design

## Why parts on a queue

## Settings

## Garbled parts
`,
  keyPoints: [
    'Each part is its own unit of work. A dropped session costs one part\'s upload, not a rerun of 600 parts.',
    'The notice carries the part name and checksum, not the 50 MB. The file store holds the data: a claim check.',
    'The splitter\'s calls are slow too: an 8 second read is close to the 10 second default, so its timeouts are raised with room to spare.',
    'A 90 second upload needs the uploader\'s timeout well above it; 3 minutes. Dropped sessions are retried at once by the uploader, so they do not wait a minute on the queue.',
    'Two hours of maintenance with a retry about once a minute needs more than 120 deliveries; 150 rides it out. Two replicas of the splitter, the sales API and the uploader carry on through a zone outage.',
  ],
  solution: `
**Design**
\`\`\`
history-splitter ─► sys-sales-history ─► Retail SQL Server
history-splitter ─► Landed history parts
history-splitter ~► history.parts ~► prc-part-uploader ─► Landed history parts
                                     prc-part-uploader ─► Planning platform SFTP
                    history.parts ~► history.parts.dlq
\`\`\`

**Settings.** \`history-splitter\` and \`sys-sales-history\`: 2 replicas, timeout 60 seconds. \`prc-part-uploader\`: 2 replicas, timeout 180 seconds, 2 retries. \`history.parts\`: 150 deliveries.

**Garbled parts.** The uploader checks the landed part against the checksum in the notice before it uploads. A mismatch is parked on the DLQ, and support asks the splitter to land that one part again; the rest of the set is not touched.
`,
  followUps: [
    {
      q: 'Two uploaders work at once. Can the platform get parts out of order?',
      a: 'Yes, and it should not care: it loads the set when the control file says every part is there. The control file is written only after every part is confirmed.',
    },
    {
      q: 'Why land the parts instead of uploading from the splitter\'s memory?',
      a: 'A part held only in memory is gone if the uploader fails. Landed, it can be uploaded again any number of times, by any replica, without reading SQL Server again.',
    },
  ],
}

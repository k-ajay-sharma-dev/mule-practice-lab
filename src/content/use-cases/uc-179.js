import { diagram } from '../../arch/dsl.js'

const out = { name: 'sales files out', from: 'batch-job', rps: 1, to: ['file-store', 'sftp-server'], kind: 'write' }

export default {
  id: 'uc-179',
  category: 'use-cases',
  title: 'Sales Files to the Planning Platform\'s FTP Server Through a Queue: the Export Never Waits on FTP, a Sender Rides Out the Nightly Maintenance Window, and Bad Files Go to a Dead Letter Queue',
  level: 'ADVANCED',
  tags: ['myproject', 'ftp', 'maintenance-window', 'queues', 'dlq', 'outbound', 'timeout', 'planning'],
  estMinutes: 45,
  diagram: {
    task: 'draw a sales export job that writes each file to an outbound file store and puts a notice on a queue with a dead-letter queue. A file sender Process API reads the queue, reads the file from the store and writes it to the planning platform\'s FTP server. The export job never talks to the FTP server.',
    checks: [
      { label: 'The export job writes files to the outbound file store', rule: { type: 'edge', from: 'batch-job', to: 'file-store' } },
      { label: 'Files reach the FTP server only through the queue', rule: { type: 'path', from: 'batch-job', via: 'queue', to: 'sftp-server' } },
      { label: 'The export job never talks to the FTP server', rule: { type: 'no-edge', from: 'batch-job', to: 'sftp-server', ifDrawn: true } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Only the sender writes to the FTP server', rule: { type: 'only-via', target: 'sftp-server', from: 'process-api' } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'sales-export'],
        store: ['file-store', 'Outbound file store'],
        q: ['queue', 'files.to-planning', { maxRedelivery: 60 }],
        dlq: ['dlq', 'files.to-planning.dlq'],
        snd: ['process-api', 'prc-file-sender', { timeoutMs: 60000 }],
        ftp: ['sftp-server', 'Planning platform FTP'],
      },
      ['job -> store', 'job ~> q', 'q ~> snd', 'q ~> dlq', 'snd -> store', 'snd -> ftp'],
    ),
    simulation: {
      systems: [
        { match: 'file-store', latencyMs: 200 },
        { match: 'sftp-server', latencyMs: 3000 },
      ],
      tests: [
        {
          name: 'A normal night',
          about: 'About one file a second for half an hour. Every file reaches the FTP server.',
          traffic: [out],
          durationMin: 30,
          expect: { delivered: [{ to: 'sftp-server', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'Year end files',
          about: 'At year end the files are large and each upload takes about 30 seconds for half an hour. Every one still goes through as it comes, and notices do not pile up on the queue.',
          traffic: [out],
          incidents: [{ slow: 'sftp-server', latencyMs: 30000, at: 0, forMin: 30 }],
          durationMin: 60,
          expect: { delivered: [{ to: 'sftp-server', min: 0.99 }], backlog: [{ queue: 'queue', maxPeak: 100 }], dlq: { max: 0 } },
        },
        {
          name: 'The nightly maintenance window',
          about: 'The FTP server is down for 40 minutes. The export finishes on time anyway. Notices wait on the queue, and every file goes out afterwards.',
          traffic: [out],
          incidents: [{ down: 'sftp-server', at: 5, forMin: 40 }],
          durationMin: 100,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'sftp-server', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'A file the server refuses',
          about: 'One file in a hundred has a name the platform\'s server refuses. Those go to the dead-letter queue, and the queue does not keep growing.',
          traffic: [{ ...out, poison: 0.01 }],
          durationMin: 150,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 100 }] },
        },
      ],
    },
  },
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, exports sales and stock files every night for the planning platform, which reads them from **its FTP server**. The platform's server has a **maintenance window** most nights, of up to 40 minutes, and the exact time moves.

The old export wrote straight to the FTP server. When the window hit, the export failed partway and was rerun by hand in the morning, after the planning run had started.

**Numbers**
- About **1 file a second** for half an hour each night.
- A normal upload takes about 3 seconds. At year end the files are large and an upload takes about **30 seconds**.
- The maintenance window lasts up to **40 minutes**.
- About **1 file in 100** has a name the platform's server refuses (a store code with a character it does not allow). It will never go.
- In this model calls time out after 10 seconds unless set otherwise, and a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- Why split the export from the sending?
- Set the sender's timeout and the queue's redelivery limit, and explain each.
- Who handles the dead-letter queue?
`,
  answerTemplate: `## Design

## Export and send apart

## Settings

## The dead-letter queue
`,
  keyPoints: [
    'The export writes to a store it controls and publishes a notice, so the FTP window cannot fail it.',
    'The notice is small: the file\'s name in the store. Large files do not travel through the broker.',
    'A 30 second upload needs a sender timeout above it. 60 seconds leaves room.',
    'With a retry about once a minute, 40 minutes of maintenance needs more than 40 deliveries. 60 leaves room; no limit lets a refused file circle for ever.',
    'The sender writes a .tmp name and renames, so a window that starts mid upload leaves no half file under the final name.',
  ],
  solution: `
**Design**
\`\`\`
sales-export ─► Outbound file store ◄─ prc-file-sender ─► Planning platform FTP
      ~► files.to-planning ~► prc-file-sender
      files.to-planning ~► files.to-planning.dlq
\`\`\`

**Settings.** Sender timeout 60 seconds. \`files.to-planning\`: 60 deliveries before the DLQ.

**Order.** If the platform needs files in order, give the queue one consumer, or put the sequence in the file name and let the platform sort.

**DLQ.** The export team gets a daily list. They fix the store code and resend; the platform team is told why the file is late.
`,
  followUps: [
    {
      q: 'The planning run starts at 05:00. How do you know the files will be there?',
      a: 'Alert at 04:30 if the queue still holds messages or the DLQ has new ones. The window is known, so a late alert is a real problem.',
    },
    {
      q: 'Could the sender use the FTP connector\'s reconnection instead of the queue?',
      a: 'Reconnection retries the connection for a short time within one call. A 40 minute window needs the message to wait somewhere safe, which is what the queue is for.',
    },
  ],
}

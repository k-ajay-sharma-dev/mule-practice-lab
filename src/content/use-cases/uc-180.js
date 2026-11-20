import { diagram } from '../../arch/dsl.js'

const outbound = { name: 'master data and sales out', from: { type: 'batch-job', label: 'outbound' }, rps: 2, to: ['sql-server', 'sftp-server'], kind: 'write' }
const plans = { name: 'plans back', from: { type: 'batch-job', label: 'collector' }, rps: 3, to: ['sftp-server', 'wms', 'sql-server'], kind: 'write' }

export default {
  id: 'uc-180',
  category: 'use-cases',
  title: 'The Whole Planning Integration Around the Platform\'s FTP Server: Master Data and Sales Out, Plans Back to SQL Server and the WMS, Sized for Busy Logins, Big Files, Maintenance and a Zone Outage',
  level: 'EXPERT',
  tags: ['myproject', 'ftp', 'planning', 'queues', 'dlq', 'timeout', 'retry', 'availability'],
  estMinutes: 60,
  diagram: {
    task: 'draw the planning platform reading and writing its FTP server. An outbound job reads items, stores and sales through a retail data System API in front of SQL Server and writes files to the FTP server. A plans collector job reads plan files from the FTP server and publishes each plan line to a queue with a dead-letter queue. A plans Process API reads the queue and writes through the retail data System API and a WMS System API.',
    checks: [
      { label: 'The planning platform exchanges files with its FTP server', rule: { type: 'link', from: 'saas', to: 'sftp-server' } },
      { label: 'Jobs write and read the FTP server', rule: { type: 'edge', from: 'batch-job', to: 'sftp-server', min: 2 } },
      { label: 'SQL Server is reached only through a System API', rule: { type: 'only-via', target: 'sql-server', from: 'system-api' } },
      { label: 'Plan lines wait on a queue before they reach the WMS', rule: { type: 'path', from: 'batch-job', via: 'queue', to: 'wms' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'The WMS is reached only through a System API', rule: { type: 'only-via', target: 'wms', from: 'system-api' } },
    ],
    reference: diagram(
      {
        plat: ['saas', 'Planning platform'],
        ftp: ['sftp-server', 'Planning platform FTP'],
        out: ['batch-job', 'planning-outbound', { replicas: 2, timeoutMs: 60000, retries: 2 }],
        col: ['batch-job', 'plans-collector', { timeoutMs: 60000, retries: 2 }],
        q: ['queue', 'plan.lines', { maxRedelivery: 90 }],
        dlq: ['dlq', 'plan.lines.dlq'],
        prc: ['process-api', 'prc-plans'],
        sysD: ['system-api', 'sys-retail-data', { replicas: 2 }],
        sql: ['sql-server', 'Retail SQL Server'],
        sysW: ['system-api', 'sys-wms'],
        wms: ['wms', 'Warehouse WMS'],
      },
      ['plat -> ftp', 'out -> sysD', 'sysD -> sql', 'out -> ftp', 'col -> ftp', 'col ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sysD', 'prc -> sysW', 'sysW -> wms'],
    ),
    simulation: {
      systems: [
        { match: 'sftp-server', latencyMs: 2000 },
        { match: 'sql-server', latencyMs: 60 },
        { match: 'wms', latencyMs: 200 },
      ],
      tests: [
        {
          name: 'A normal night',
          about: 'Master data and sales go out, and plans come back. Every file is written, and every plan line reaches SQL Server and the WMS.',
          traffic: [outbound, plans],
          durationMin: 30,
          expect: {
            answers: [{ flow: 'master data and sales out', minSuccess: 0.99 }],
            delivered: [{ flow: 'plans back', to: 'wms', min: 0.99 }, { flow: 'plans back', to: 'sql-server', min: 0.99 }],
            lost: { max: 0 },
          },
        },
        {
          name: 'Busy logins on the FTP server',
          about: 'Other customers crowd the platform\'s server. For 20 minutes one FTP call in ten is refused. Quick retries get every file out and every plan file read.',
          traffic: [outbound, plans],
          incidents: [{ errors: 'sftp-server', rate: 0.1, at: 0, forMin: 20 }],
          durationMin: 20,
          expect: { answers: [{ flow: 'master data and sales out', minSuccess: 0.99 }, { flow: 'plans back', minSuccess: 0.99 }] },
        },
        {
          name: 'Month end files',
          about: 'Full files at month end. Every FTP read and write takes about 25 seconds for half an hour, and every file still goes through.',
          traffic: [{ ...outbound, rps: 1 }, { ...plans, rps: 1 }],
          incidents: [{ slow: 'sftp-server', latencyMs: 25000, at: 0, forMin: 30 }],
          durationMin: 30,
          expect: { answers: [{ flow: 'master data and sales out', minSuccess: 0.99 }, { flow: 'plans back', minSuccess: 0.99 }] },
        },
        {
          name: 'WMS maintenance',
          about: 'The WMS is down for an hour. Plan lines wait on the queue and all arrive afterwards. None lands on the dead-letter queue.',
          traffic: [outbound, plans],
          incidents: [{ down: 'wms', at: 5, forMin: 60 }],
          durationMin: 120,
          expect: { delivered: [{ flow: 'plans back', to: 'wms', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'A zone fails during the night run',
          about: 'An availability zone is down for 20 minutes. The outbound job and the retail data API keep a replica in the other zone, so files still go out.',
          traffic: [outbound, plans],
          incidents: [{ zone: true, at: 5, forMin: 20 }],
          durationMin: 40,
          expect: { answers: [{ flow: 'master data and sales out', minSuccess: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'A plan line for a store that is not open yet',
          about: 'One line in a hundred names a store the WMS does not know. Those end on the dead-letter queue, and the queue does not keep growing.',
          traffic: [{ ...plans, poison: 0.01 }],
          durationMin: 180,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 200 }] },
        },
      ],
    },
  },
  description: `
Quarry Hill Hardware, a fictional chain of hardware stores, is wiring in the planning platform. Every exchange goes through the **platform's FTP server**:

- **Out**: items, stores and suppliers each night, and daily sales and stock. An outbound job reads them from **SQL Server** through a retail data System API and writes files to the FTP server.
- **Back**: replenishment plans. A collector job reads each plan file and puts each line on a queue. A plans Process API writes the line to SQL Server, through the same System API, and to the **WMS**, through a WMS System API.

**Numbers**
- About **2 outbound files a second** and **3 plan lines a second** at night. The platform loads the outbound files at a set time and will not wait for them.
- Normal FTP calls take about 2 seconds. At month end the files are full and each FTP call takes about **25 seconds**.
- The platform's server limits logins. At busy times about **1 FTP call in 10** is refused for up to 20 minutes.
- The WMS is down for maintenance for up to **an hour** a month.
- Last year an availability zone failed for 20 minutes during the night run.
- About **1 plan line in 100** names a store that is not open yet.
- In this model calls time out after 10 seconds unless set otherwise, a failed delivery is tried again about once a minute, and an app with one replica stops when its zone fails.

**Questions:**
- Draw the design.
- Set the timeouts, retries, replicas and redelivery limit, and give the reason for each number.
- What FTP settings and file habits does each job need?
- What does support check each morning?
`,
  answerTemplate: `## Design

## Settings

## FTP habits

## Morning checks
`,
  keyPoints: [
    'Out is files the platform loads at a set time; back is lines that must reach two systems. Out is a job, back has a queue.',
    'A 25 second FTP call needs timeouts above it on both jobs: 60 seconds.',
    'Refused logins are short and partial: 2 retries on both jobs. Retries do not help when the server is down.',
    'Two replicas of the outbound job and the retail data API, spread over zones, keep the night run going when a zone fails.',
    'With a retry about once a minute, an hour of WMS maintenance needs more than 60 deliveries; 90 leaves room. No limit lets a line for an unknown store circle for ever.',
  ],
  solution: `
**Design**
\`\`\`
Planning platform ─► Planning platform FTP ◄─ planning-outbound ─► sys-retail-data ─► Retail SQL Server
                                          ◄─ plans-collector ~► plan.lines ~► prc-plans ─► sys-retail-data
                                                             ~► plan.lines.dlq          └─► sys-wms ─► WMS
\`\`\`

**Settings.** Outbound: 2 replicas, 60 second timeout, 2 retries. Collector: 60 second timeout, 2 retries. Retail data API: 2 replicas. \`plan.lines\`: 90 deliveries.

**FTP habits.** Passive mode and binary transfer on every config. Outbound files written as \`.tmp\` and renamed, with a control file last. The collector runs on the primary node only, waits for a stable size or a marker, and archives a plan file only when every line is on the queue.

**Morning checks.** The job log for each outbound file, the queue depth and DLQ, and plan files older than an hour still in the FTP folder.
`,
  followUps: [
    {
      q: 'The platform moves to SFTP next year. What changes in this design?',
      a: 'The boxes stay. The connector and its config change: keys instead of passwords, no passive ports. The habits (temporary names, markers, archive folders) carry over unchanged.',
    },
    {
      q: 'Why does the Process API write SQL Server through the same System API as the outbound job?',
      a: 'One API owns the retail tables and their rules. Two writers with their own SQL would drift apart and fight over locks.',
    },
  ],
}

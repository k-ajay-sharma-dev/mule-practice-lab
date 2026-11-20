import { diagram } from '../../arch/dsl.js'

const outbound = { name: 'master data and sales out', from: { type: 'batch-job', label: 'outbound' }, rps: 2, to: ['sql-server', 'file-store'], kind: 'write' }
const plans = { name: 'plans back', from: { type: 'batch-job', label: 'collector' }, rps: 3, to: ['file-store', 'wms', 'sql-server'], kind: 'write' }

export default {
  id: 'uc-168',
  category: 'use-cases',
  title: 'The Whole Planning Integration Around One Azure File Share: Master Data and Sales Out, Plans Back to SQL Server and the WMS, Sized to Survive Maintenance, Big Files and a Zone Outage',
  level: 'EXPERT',
  tags: ['myproject', 'azure-file-share', 'planning', 'queues', 'dlq', 'timeout', 'availability', 'retail'],
  estMinutes: 60,
  diagram: {
    task: 'draw the planning platform reading and writing the Azure File Share. An outbound job reads items, stores and sales through a retail data System API in front of SQL Server and writes files to the share. A plans collector job reads plan files from the share and publishes a notification to a queue with a dead-letter queue. A plans Process API reads the queue and writes through the retail data System API and a WMS System API.',
    checks: [
      { label: 'The planning platform exchanges files with the share', rule: { type: 'link', from: 'saas', to: 'file-store' } },
      { label: 'Jobs write and read the share', rule: { type: 'edge', from: 'batch-job', to: 'file-store', min: 2 } },
      { label: 'SQL Server is reached only through a System API', rule: { type: 'only-via', target: 'sql-server', from: 'system-api' } },
      { label: 'Plans wait on a queue before they reach the WMS', rule: { type: 'path', from: 'batch-job', via: 'queue', to: 'wms' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'The WMS is reached only through a System API', rule: { type: 'only-via', target: 'wms', from: 'system-api' } },
    ],
    reference: diagram(
      {
        plat: ['saas', 'Planning platform'],
        share: ['file-store', 'Azure File Share plan-share'],
        out: ['batch-job', 'planning-outbound', { replicas: 2, timeoutMs: 60000 }],
        col: ['batch-job', 'plans-collector', { timeoutMs: 60000 }],
        q: ['queue', 'plans.ready', { maxRedelivery: 90 }],
        dlq: ['dlq', 'plans.ready.dlq'],
        prc: ['process-api', 'prc-plans'],
        sysD: ['system-api', 'sys-retail-data', { replicas: 2 }],
        sql: ['sql-server', 'Retail SQL Server'],
        sysW: ['system-api', 'sys-wms'],
        wms: ['wms', 'Warehouse WMS'],
      },
      ['plat -> share', 'out -> sysD', 'sysD -> sql', 'out -> share', 'col -> share', 'col ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sysD', 'prc -> sysW', 'sysW -> wms'],
    ),
    simulation: {
      systems: [
        { match: 'file-store', latencyMs: 400 },
        { match: 'sql-server', latencyMs: 60 },
        { match: 'wms', latencyMs: 200 },
      ],
      tests: [
        {
          name: 'A normal night',
          about: 'Master data and sales files go out, and plans come back. Every file is written, and every plan reaches SQL Server and the WMS.',
          traffic: [outbound, plans],
          durationMin: 30,
          expect: {
            answers: [{ flow: 'master data and sales out', minSuccess: 0.99 }],
            delivered: [{ flow: 'plans back', to: 'wms', min: 0.99 }, { flow: 'plans back', to: 'sql-server', min: 0.99 }],
            lost: { max: 0 },
          },
        },
        {
          name: 'WMS maintenance',
          about: 'The WMS is down for an hour. Plans wait on the queue and all arrive afterwards. None lands on the dead-letter queue.',
          traffic: [outbound, plans],
          incidents: [{ down: 'wms', at: 5, forMin: 60 }],
          durationMin: 120,
          expect: { delivered: [{ flow: 'plans back', to: 'wms', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'Month end files',
          about: 'Full item files and month end plans are large. Every read and write on the share takes about 20 seconds for half an hour. Every file still goes through.',
          traffic: [{ ...outbound, rps: 1 }, { ...plans, rps: 1 }],
          incidents: [{ slow: 'file-store', latencyMs: 20000, at: 0, forMin: 30 }],
          durationMin: 30,
          expect: { answers: [{ flow: 'master data and sales out', minSuccess: 0.99 }, { flow: 'plans back', minSuccess: 0.99 }], delivered: [{ flow: 'plans back', to: 'wms', min: 0.99 }] },
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
          name: 'A plan for a store the WMS does not know',
          about: 'One plan in a hundred names a store that is not open yet. Those end on the dead-letter queue, and the queue does not keep growing.',
          traffic: [{ ...plans, poison: 0.01 }],
          durationMin: 180,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 200 }] },
        },
      ],
    },
  },
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, is wiring its planning platform in. Every exchange goes through one **Azure File Share**, \`plan-share\`, which the platform reads and writes:

- **Out**: items, stores and suppliers each night, and daily sales and stock. An outbound job reads them from **SQL Server** through a retail data System API and writes files to the share.
- **Back**: replenishment plans. A collector job reads each plan file and puts a notification on a queue. A plans Process API writes the plan to SQL Server, through the same System API, and to the **WMS**, through a WMS System API.

**Numbers**
- About **2 outbound files a second** and **3 plans a second** during the night run. The platform loads the outbound files at a fixed time and will not wait for them.
- The WMS has up to **an hour** of maintenance a month.
- At month end, files are large: reads and writes on the share take about **20 seconds** for half an hour.
- APIs run on CloudHub 2.0 across availability zones; a zone can fail for 20 minutes.
- In this model calls time out after 10 seconds unless set otherwise, a failed delivery is tried again about once a minute, and an app with one replica stops when its zone fails.

**Questions:**
- Draw the design.
- Which flows are allowed to wait, and which must not?
- Set the redelivery limit, the timeouts and the replicas. Justify each.
- What would you watch each morning?
`,
  answerTemplate: `## Design

## What may wait

## Settings

## The morning check
`,
  keyPoints: [
    'The share is the meeting point, but each direction has its own shape: out is a job writing files, back is a job turning files into queued messages.',
    'Plans may wait: the queue holds them through a WMS outage. A limit of 90 deliveries covers an hour of maintenance with room.',
    'The outbound job may not wait for ever: the platform loads at a fixed time. Two replicas of the job and of the retail data API keep it going when a zone fails.',
    'Big files are slow on the share for both jobs. 60 second timeouts on both cover a 20 second read or write.',
    'The retail data System API serves both directions. Size and replicate it for both, or one direction\'s peak slows the other.',
  ],
  solution: `
**Design**
\`\`\`
Planning platform ─► Azure File Share plan-share ◄─ planning-outbound ─► sys-retail-data ─► Retail SQL Server
                                                 ◄─ plans-collector ~► plans.ready ~► prc-plans ─► sys-retail-data
                                                                     ~► plans.ready.dlq     └─► sys-wms ─► WMS
\`\`\`

**Settings**
- \`plans.ready\`: 90 deliveries before the DLQ.
- Both jobs: 60 second timeouts.
- \`planning-outbound\` and \`sys-retail-data\`: 2 replicas each.

**Writing files the platform reads.** Write under a temporary name and rename, and send a control file with counts, so the platform never loads a half file.

**The morning check.** One page: files written per feed with row counts, plans received and applied, messages on the DLQ, and anything older than its deadline still on the share.
`,
  followUps: [
    {
      q: 'Why not put the outbound files on a queue too?',
      a: 'The platform reads files from the share, so the end of the outbound path is a file. A queue would only help if several steps had to happen in Mule before the file is written.',
    },
    {
      q: 'The platform team asks to move to SFTP next year. What changes?',
      a: 'Only the jobs\' file endpoints: the share becomes an SFTP server. The queue, the Process API and the System APIs do not change. That is the value of keeping file access at the edges.',
    },
  ],
}

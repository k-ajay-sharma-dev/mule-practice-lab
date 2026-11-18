import { diagram } from '../../arch/dsl.js'

const plans = { name: 'plans back', from: 'batch-job', rps: 2, to: ['sftp-server', 'wms'], kind: 'write' }

export default {
  id: 'uc-176',
  category: 'use-cases',
  title: 'Allocation Plans From the Planning Platform\'s FTP Server to the WMS: a Collector With a Long Enough Timeout, a Queue That Outlasts WMS Maintenance, and a Dead Letter Queue',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'ftp', 'plans', 'queues', 'dlq', 'timeout', 'wms', 'planning'],
  estMinutes: 40,
  diagram: {
    task: 'draw the planning platform writing plan files to its FTP server. A plan collector job reads each file and puts each allocation on a queue with a dead-letter queue. An allocations Process API reads the queue and calls a WMS System API, which calls the WMS.',
    checks: [
      { label: 'The planning platform writes to its FTP server', rule: { type: 'edge', from: 'saas', to: 'sftp-server' } },
      { label: 'A collector job reads the FTP server', rule: { type: 'edge', from: 'batch-job', to: 'sftp-server' } },
      { label: 'Allocations wait on a queue before they reach the WMS', rule: { type: 'path', from: 'batch-job', via: 'queue', to: 'wms' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'The WMS is reached only through a System API', rule: { type: 'only-via', target: 'wms', from: 'system-api' } },
    ],
    reference: diagram(
      {
        plat: ['saas', 'Planning platform'],
        ftp: ['sftp-server', 'Planning platform FTP'],
        job: ['batch-job', 'alloc-collector', { timeoutMs: 60000 }],
        q: ['queue', 'alloc.ready', { maxRedelivery: 75 }],
        dlq: ['dlq', 'alloc.ready.dlq'],
        prc: ['process-api', 'prc-allocations'],
        sys: ['system-api', 'sys-wms'],
        wms: ['wms', 'Warehouse WMS'],
      },
      ['plat -> ftp', 'job -> ftp', 'job ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sys', 'sys -> wms'],
    ),
    simulation: {
      systems: [
        { match: 'sftp-server', latencyMs: 1500 },
        { match: 'wms', latencyMs: 200 },
      ],
      tests: [
        {
          name: 'A normal planning run',
          about: 'About two allocations a second for half an hour. Every one reaches the WMS.',
          traffic: [plans],
          durationMin: 30,
          expect: { delivered: [{ to: 'wms', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'The monthly full plan',
          about: 'At month end the plan files are large, and each download from the FTP server takes about 25 seconds. The collector still reads every one.',
          traffic: [plans],
          incidents: [{ slow: 'sftp-server', latencyMs: 25000, at: 0, forMin: 30 }],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'wms', min: 0.99 }] },
        },
        {
          name: 'WMS maintenance',
          about: 'The WMS is down for 50 minutes. Allocations wait on the queue and are all delivered afterwards. None lands on the dead-letter queue.',
          traffic: [plans],
          incidents: [{ down: 'wms', at: 5, forMin: 50 }],
          durationMin: 120,
          expect: { delivered: [{ to: 'wms', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'An allocation for a closed store',
          about: 'One allocation in a hundred names a store the WMS has closed. Those go to the dead-letter queue after their tries, and the queue does not keep growing.',
          traffic: [{ ...plans, poison: 0.01 }],
          durationMin: 180,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 150 }] },
        },
      ],
    },
  },
  description: `
Larkfield Grocers, a fictional grocery chain, gets store allocations from the planning platform after each planning run. The platform writes allocation files to **its FTP server**. Each allocation must reach the **WMS**, which reserves the stock and builds the picks.

The old job downloaded a file and called the WMS line by line. During the WMS's monthly maintenance it failed halfway, and nobody could tell which lines had arrived.

**Numbers**
- About **2 allocations a second** for half an hour after each run.
- A normal download takes about 1.5 seconds. At month end the files are large and a download takes about **25 seconds**.
- The WMS is down for maintenance for up to **50 minutes** a month.
- About **1 allocation in 100** names a store the WMS has closed. It will never load.
- In this model calls time out after 10 seconds unless set otherwise, and a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- What timeout does the collector need, and why?
- Choose a redelivery limit for the queue, and say what goes wrong with 10 and with no limit.
- What does the collector do with a file once every allocation is on the queue?
`,
  answerTemplate: `## Design

## The collector

## The queue and its limit

## The file afterwards
`,
  keyPoints: [
    'The collector only downloads and publishes. It never waits on the WMS, so WMS maintenance cannot stop it.',
    'A 25 second download needs a timeout above it. 60 seconds leaves room.',
    'With a retry about once a minute, 50 minutes of maintenance needs more than 50 deliveries. 75 leaves room; 10 sends good allocations to the DLQ.',
    'No limit lets an allocation for a closed store circle for ever.',
    'Move the file to an archive folder on the FTP server once every allocation is on the queue, never before.',
  ],
  solution: `
**Design**
\`\`\`
Planning platform ─► Planning platform FTP ◄─ alloc-collector ~► alloc.ready ~► prc-allocations ─► sys-wms ─► WMS
                                                              ~► alloc.ready.dlq
\`\`\`

**Settings.** Collector timeout 60 seconds. \`alloc.ready\`: 75 deliveries before the DLQ.

**Safe repeats.** Each message carries the plan run and line number. The WMS System API ignores a line it already has, so a redelivery after a half success does no harm.

**DLQ.** The planners review it each morning. They fix the store in the plan, and support moves the message back.
`,
  followUps: [
    {
      q: 'The collector runs on two nodes. What stops both reading the same file?',
      a: 'Run the FTP listener on the primary node only, or claim each file by renaming it into a processing folder first. Only one rename can win.',
    },
    {
      q: 'Why a message per allocation and not per file?',
      a: 'A file can hold thousands of lines. Per line, one bad store fails one message, not the whole file, and the WMS gets small calls it can retry.',
    },
  ],
}

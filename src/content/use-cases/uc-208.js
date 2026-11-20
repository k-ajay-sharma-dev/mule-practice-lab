import { diagram } from '../../arch/dsl.js'

const chunks = { name: 'plan chunks', from: 'batch-job', rps: 2, to: ['sftp-server', 'file-store', 'sql-server'], kind: 'write' }

export default {
  id: 'uc-208',
  category: 'use-cases',
  title: 'Purchase Plans Back From the Planning Platform in Large Parts: a Collector That Lands Them, Chunks on a Queue, a Loader That MERGEs Through a System API, and Settings for the Index Rebuild, Deadlocks and a Garbled Part',
  level: 'ADVANCED',
  tags: ['myproject', 'large-files', 'split-files', 'merge', 'sql-server', 'queues', 'dlq', 'timeout', 'retry', 'planning'],
  estMinutes: 45,
  diagram: {
    task: 'draw a plans collector job that reads plan parts from the planning platform\'s SFTP server, lands them in an internal file store and puts a notice per chunk on a queue with a dead-letter queue. A plans loader Process API reads the queue, reads its chunk from the file store and MERGEs it through a purchasing System API into SQL Server.',
    checks: [
      { label: 'The collector reads the planning platform\'s SFTP server', rule: { type: 'edge', from: 'batch-job', to: 'sftp-server' } },
      { label: 'The collector lands the parts in the file store', rule: { type: 'edge', from: 'batch-job', to: 'file-store' } },
      { label: 'Chunks wait on a queue before they reach SQL Server', rule: { type: 'path', from: 'batch-job', via: 'queue', to: 'sql-server' } },
      { label: 'The loader reads its chunk from the file store', rule: { type: 'edge', from: 'process-api', to: 'file-store' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'SQL Server is reached only through a System API', rule: { type: 'only-via', target: 'sql-server', from: 'system-api' } },
    ],
    reference: diagram(
      {
        sftp: ['sftp-server', 'Planning platform SFTP'],
        job: ['batch-job', 'plans-collector'],
        store: ['file-store', 'Landed plan parts'],
        q: ['queue', 'plan.chunks', { maxRedelivery: 10 }],
        dlq: ['dlq', 'plan.chunks.dlq'],
        prc: ['process-api', 'prc-plans-loader', { timeoutMs: 60000 }],
        sys: ['system-api', 'sys-purchasing', { timeoutMs: 60000, retries: 2 }],
        sql: ['sql-server', 'Purchasing SQL Server'],
      },
      ['job -> sftp', 'job -> store', 'job ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> store', 'prc -> sys', 'sys -> sql'],
    ),
    simulation: {
      systems: [
        { match: 'sftp-server', latencyMs: 1500 },
        { match: 'file-store', latencyMs: 300 },
        { match: 'sql-server', latencyMs: 400 },
      ],
      tests: [
        {
          name: 'A weekly plan',
          about: 'About two chunks a second for half an hour. Every chunk is merged into SQL Server.',
          traffic: [chunks],
          durationMin: 30,
          expect: { delivered: [{ to: 'sql-server', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'Deadlocks with the buying screens',
          about: 'Buyers edit orders while the plan loads. For 20 minutes one MERGE in ten is a deadlock victim and works a moment later. Quick retries keep chunks from waiting on the queue.',
          traffic: [chunks],
          incidents: [{ errors: 'sql-server', rate: 0.1, at: 0, forMin: 20 }],
          durationMin: 20,
          expect: { delivered: [{ to: 'system-api', min: 0.99 }], backlog: [{ queue: 'queue', maxPeak: 5 }], dlq: { max: 0 } },
        },
        {
          name: 'The weekly index rebuild',
          about: 'The rebuild holds locks, and each MERGE waits about 25 seconds for half an hour. Every chunk still loads.',
          traffic: [chunks],
          incidents: [{ slow: 'sql-server', latencyMs: 25000, at: 0, forMin: 30 }],
          durationMin: 60,
          expect: { delivered: [{ to: 'sql-server', min: 0.99 }], dlq: { max: 0 } },
        },
        {
          name: 'A garbled chunk',
          about: 'One chunk in a hundred comes from a part that was garbled in transit and fails its checks every time. Those chunks reach the dead-letter queue after a few tries, and the queue does not keep growing.',
          traffic: [{ ...chunks, poison: 0.01 }],
          durationMin: 150,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 100 }] },
        },
      ],
    },
  },
  description: `
Marrow & Pine Home, a fictional home furnishings retailer, gets weekly purchase plans back from the planning platform: about **14 parts of 300 MB** on the platform's **SFTP server**, with a control file.

The new design:
- A **plans collector** job checks the control file, copies the parts into an internal **file store**, and puts one notice per **chunk of 10,000 lines** on a queue: part name, first line, last line.
- A **plans loader** reads a notice, reads that chunk from the file store and MERGEs it through a **purchasing System API** into **SQL Server**.

**Numbers**
- About **2 chunks a second** for half an hour.
- A MERGE of a chunk takes about 400 ms.
- Buyers edit orders while the plan loads: about **1 MERGE in 10** is a deadlock victim for up to 20 minutes, and works when tried again. Each try is a victim or not on its own. Deadlocks should cost a chunk seconds, not a minute back on the queue.
- The weekly index rebuild makes each MERGE wait about **25 seconds**, for up to half an hour.
- About **1 chunk in 100** comes from a part garbled in transit; it fails its checks every time.
- In this model calls time out after 10 seconds unless set otherwise, and a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- Why chunks on the queue instead of whole parts or single lines?
- Set the timeouts, the retries and the redelivery limit, and say on which box each goes.
- Why does a MERGE make redelivery safe here?
`,
  answerTemplate: `## Design

## Chunks

## Settings

## Redelivery and MERGE
`,
  keyPoints: [
    'A chunk is small enough to MERGE in one short transaction and large enough that the queue carries a few thousand messages, not millions.',
    'The notice carries the part name and a line range, not the lines: the file store holds the data (a claim check).',
    'Deadlock victims are retried in the System API, close to the database. A constraint error is not retried.',
    'A 25 second MERGE needs a timeout above it on the System API and on the loader that calls it: 60 seconds on both.',
    'MERGE on plan, supplier and SKU writes the same values when a chunk is delivered again, so a redelivery after a timeout does no harm.',
  ],
  solution: `
**Design**
\`\`\`
plans-collector ─► Planning platform SFTP
plans-collector ─► Landed plan parts
plans-collector ~► plan.chunks ~► prc-plans-loader ─► Landed plan parts
                                  prc-plans-loader ─► sys-purchasing ─► Purchasing SQL Server
                   plan.chunks ~► plan.chunks.dlq
\`\`\`

**Settings.** \`prc-plans-loader\`: timeout 60 seconds. \`sys-purchasing\`: timeout 60 seconds, 2 retries for deadlocks and lock timeouts. \`plan.chunks\`: 10 deliveries.

**Why 10 is enough.** Nothing here needs a chunk to wait out a long outage. A few deliveries cover a busy moment, and a garbled chunk reaches the DLQ within about ten minutes.
`,
  followUps: [
    {
      q: 'A part fails its MD5 check in the collector. Should its chunks be queued at all?',
      a: 'No. The collector should hold back the whole set and ask the platform to resend. The DLQ path is for faults the collector cannot see, such as a bad value inside a good file.',
    },
    {
      q: 'Buyers must not see half a plan. How does this design keep that promise?',
      a: 'It does not on its own: chunks apply one by one. Load into a staging table instead and MERGE the whole plan once every chunk is in, or flag the plan visible only when the last chunk lands.',
    },
  ],
}

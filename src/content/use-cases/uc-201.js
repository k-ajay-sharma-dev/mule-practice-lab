import { diagram } from '../../arch/dsl.js'

const loads = { name: 'order blob loads', from: 'batch-job', rps: 2, to: ['azure-blob', 'sql-server'], kind: 'write' }

export default {
  id: 'uc-201',
  category: 'use-cases',
  title: 'A Batch Loader for Order Blobs on Two Replicas: Survive a Zone Outage, Wait Long Enough for Month End Blobs, and Never Load the Same Blob Twice',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'batch', 'azure-blob', 'sql-server', 'availability', 'timeout', 'run-lock'],
  estMinutes: 35,
  diagram: {
    task: 'draw a batch loader job that reads order blobs from Azure Blob Storage and writes the orders through an orders data System API to SQL Server. Only the System API talks to SQL Server.',
    checks: [
      { label: 'The loader reads Azure Blob Storage', rule: { type: 'edge', from: 'batch-job', to: 'azure-blob' } },
      { label: 'The loader writes through a System API', rule: { type: 'edge', from: 'batch-job', to: 'system-api' } },
      { label: 'SQL Server is reached only through a System API', rule: { type: 'only-via', target: 'sql-server', from: 'system-api' } },
      { label: 'The loader waits for each of its calls', rule: { type: 'lines', from: 'batch-job', kind: 'sync' } },
    ],
    reference: diagram(
      {
        blob: ['azure-blob', 'Order blob store'],
        job: ['batch-job', 'order-blob-loader', { replicas: 2, timeoutMs: 45000 }],
        sys: ['system-api', 'sys-orders-data', { replicas: 2 }],
        sql: ['sql-server', 'Orders SQL Server'],
      },
      ['job -> blob', 'job -> sys', 'sys -> sql'],
    ),
    simulation: {
      systems: [
        { match: 'azure-blob', latencyMs: 500 },
        { match: 'sql-server', latencyMs: 80 },
      ],
      tests: [
        {
          name: 'A normal night',
          about: 'About two blob reads a second, each followed by its writes. Every order reaches SQL Server.',
          traffic: [loads],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'sql-server', min: 0.99 }] },
        },
        {
          name: 'Month end blobs',
          about: 'At month end the blobs are large and each read takes about 20 seconds for half an hour. Every blob still loads.',
          traffic: [loads],
          incidents: [{ slow: 'azure-blob', latencyMs: 20000, at: 0, forMin: 30 }],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
        {
          name: 'A zone fails during the night',
          about: 'An availability zone is down for 20 minutes. The loader and the orders API each keep a replica in the other zone.',
          traffic: [loads],
          incidents: [{ zone: true, at: 5, forMin: 20 }],
          durationMin: 40,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
Thornbury Freight, a fictional freight carrier, receives customer orders as JSON files in **Azure Blob Storage**, one blob per customer upload. A Mule **batch job** on CloudHub 2.0 lists new blobs every few minutes, reads each one and writes the orders through an **orders data System API** into **SQL Server**.

Last quarter:
- An availability zone failed for 20 minutes. The loader and the API had one replica each, both in that zone.
- At month end the blobs are large. Reads took about 20 seconds and gave up after the default 10.

The team wants two replicas. Their worry: both replicas list the same new blobs and load them twice.

**Numbers**
- About **2 blobs a second** at the peak, for half an hour.
- A normal blob read takes about 500 ms; at month end about **20 seconds**.
- In this model calls time out after 10 seconds unless set otherwise.

**Questions:**
- Draw the design.
- How many replicas, and on which boxes?
- What timeout does the loader need?
- How do you stop two replicas loading the same blob?
`,
  answerTemplate: `## Design

## Replicas

## Timeout

## One loader per blob
`,
  keyPoints: [
    'CloudHub 2.0 spreads replicas over zones. Two replicas on each box in the path keep it running when one zone fails.',
    'Both the loader and the System API need the second replica: a path is only as available as its weakest box.',
    'A 20 second read needs a timeout above it. 45 seconds leaves room.',
    'Two replicas of a scheduled job can both run. Claim each blob before loading it: a lease on the blob, a row in a claim table with a unique key, or a lock row.',
    'Write orders idempotently, with a MERGE on the order ID, so a blob loaded twice by accident does no harm.',
  ],
  solution: `
**Design**
\`\`\`
order-blob-loader ─► Order blob store
order-blob-loader ─► sys-orders-data ─► Orders SQL Server
\`\`\`

**Settings.** \`order-blob-loader\`: 2 replicas, timeout 45 seconds. \`sys-orders-data\`: 2 replicas.

**One loader per blob.** Before the batch job starts on a blob, insert its name into a claim table with a unique key. The replica whose insert fails skips that blob. Delete or mark the claim when the job's On Complete runs.
`,
  followUps: [
    {
      q: 'Could the scheduler run on one replica only?',
      a: 'Some deployments can run a scheduler on the primary node only. It removes the double run but brings back a gap while a new primary is chosen. The claim table works either way.',
    },
    {
      q: 'Why not move each blob to a "done" container after loading?',
      a: 'That helps the next listing, but two replicas can still list the blob before either moves it. Use the move as tidying, and the claim as the guard.',
    },
  ],
}

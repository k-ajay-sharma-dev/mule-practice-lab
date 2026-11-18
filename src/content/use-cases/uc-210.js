import { diagram } from '../../arch/dsl.js'

const relayJob = { type: 'batch-job', label: 'relay' }
const exportJob = { type: 'batch-job', label: 'export' }
const relay = { name: 'store files', from: relayJob, rps: 1, to: ['sftp-server', 'azure-blob', 'sql-server'], kind: 'write' }
const exportParts = { name: 'plan exports', from: exportJob, rps: 0.5, to: ['sql-server', 'external-api'], kind: 'write' }

export default {
  id: 'uc-210',
  category: 'use-cases',
  title: 'Large Store Files In and Plan Exports Out Around SQL Server: a Relay to Azure Blob Storage, a Claim Check Queue, a Loader Through a System API and an Export Job, Sized for Slow Uploads, Deadlocks, Patching, Garbled Files and a Zone Outage',
  level: 'EXPERT',
  tags: ['myproject', 'large-files', 'claim-check', 'azure-blob', 'sftp', 'sql-server', 'queues', 'dlq', 'timeout', 'retry', 'availability', 'planning'],
  estMinutes: 60,
  diagram: {
    task: 'draw a relay job that reads store files from the SFTP hub, uploads each one to Azure Blob Storage and puts a notice on a queue with a dead-letter queue. A store loader Process API reads the queue, downloads the file and writes through a store data System API to SQL Server. An export job reads plan data through the same System API and sends each part to the planning platform\'s upload API. Only the System API talks to SQL Server.',
    checks: [
      { label: 'The relay job reads the SFTP hub', rule: { type: 'edge', from: relayJob, to: 'sftp-server' } },
      { label: 'The relay job uploads to Azure Blob Storage', rule: { type: 'edge', from: relayJob, to: 'azure-blob' } },
      { label: 'Store files wait on a queue before they reach SQL Server', rule: { type: 'path', from: relayJob, via: 'queue', to: 'sql-server' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'The loader downloads the file from Blob Storage', rule: { type: 'edge', from: 'process-api', to: 'azure-blob' } },
      { label: 'SQL Server is reached only through a System API', rule: { type: 'only-via', target: 'sql-server', from: 'system-api' } },
      { label: 'The export job sends parts to the planning platform', rule: { type: 'edge', from: exportJob, to: 'external-api' } },
      { label: 'The relay job never waits on SQL Server', rule: { type: 'no-path', from: relayJob, to: 'sql-server', kind: 'sync' } },
    ],
    reference: diagram(
      {
        hub: ['sftp-server', 'Store SFTP hub'],
        relay: ['batch-job', 'store-files-relay', { replicas: 2, timeoutMs: 60000 }],
        blob: ['azure-blob', 'Store files container'],
        q: ['queue', 'store.files', { maxRedelivery: 60 }],
        dlq: ['dlq', 'store.files.dlq'],
        prc: ['process-api', 'prc-store-loader', { timeoutMs: 60000 }],
        sys: ['system-api', 'sys-store-data', { replicas: 2, retries: 2 }],
        sql: ['sql-server', 'Store SQL Server'],
        exp: ['batch-job', 'plan-export', { replicas: 2 }],
        plan: ['external-api', 'Planning platform upload API'],
      },
      ['relay -> hub', 'relay -> blob', 'relay ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> blob', 'prc -> sys', 'sys -> sql', 'exp -> sys', 'exp -> plan'],
    ),
    simulation: {
      systems: [
        { match: 'sftp-server', latencyMs: 500 },
        { match: 'azure-blob', latencyMs: 3000 },
        { match: 'sql-server', latencyMs: 150 },
        { match: 'external-api', latencyMs: 800 },
      ],
      tests: [
        {
          name: 'A normal night',
          about: 'Store files flow in through the queue and plan parts flow out. Every file reaches SQL Server and every part reaches the planning platform.',
          traffic: [relay, exportParts],
          durationMin: 30,
          expect: {
            answers: [{ flow: 'store files', minSuccess: 0.99 }, { flow: 'plan exports', minSuccess: 0.99 }],
            delivered: [{ flow: 'store files', to: 'sql-server', min: 0.99 }],
            lost: { max: 0 },
          },
        },
        {
          name: 'Slow uploads after a store refit',
          about: 'Refitted stores send their full history. For half an hour each upload and download takes about 25 seconds. The relay still gets every file out, and every file loads as it comes without the queue building up.',
          traffic: [relay],
          incidents: [{ slow: 'azure-blob', latencyMs: 25000, at: 0, forMin: 30 }],
          durationMin: 60,
          expect: {
            answers: [{ flow: 'store files', minSuccess: 0.99 }],
            delivered: [{ flow: 'store files', to: 'sql-server', min: 0.99 }],
            backlog: [{ queue: 'queue', maxPeak: 100 }],
            dlq: { max: 0 },
          },
        },
        {
          name: 'Deadlocks with the replenishment job',
          about: 'For 20 minutes one SQL Server call in ten is a deadlock victim and works when tried again. The export still reads its plan rows.',
          traffic: [relay, exportParts],
          incidents: [{ errors: 'sql-server', rate: 0.1, at: 0, forMin: 20 }],
          durationMin: 20,
          expect: { answers: [{ flow: 'plan exports', minSuccess: 0.99 }] },
        },
        {
          name: 'SQL Server patching',
          about: 'SQL Server is down for 40 minutes. The relay carries on; notices wait on the queue and every file loads afterwards.',
          traffic: [relay],
          incidents: [{ down: 'sql-server', at: 5, forMin: 40 }],
          durationMin: 100,
          expect: { answers: [{ flow: 'store files', minSuccess: 0.99 }], delivered: [{ flow: 'store files', to: 'sql-server', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'A zone fails during the night',
          about: 'An availability zone is down for 20 minutes. The relay, the export job and the store data API each keep a replica in the other zone.',
          traffic: [relay, exportParts],
          incidents: [{ zone: true, at: 5, forMin: 20 }],
          durationMin: 40,
          expect: { answers: [{ flow: 'store files', minSuccess: 0.99 }, { flow: 'plan exports', minSuccess: 0.99 }] },
        },
        {
          name: 'A garbled store file',
          about: 'One file in a hundred was cut short on the way from the store and fails its checks every time. Those notices end on the dead-letter queue, and the queue does not keep growing.',
          traffic: [{ ...relay, poison: 0.01 }],
          durationMin: 150,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 100 }] },
        },
      ],
    },
  },
  description: `
Larkfield Grocers, a fictional grocery chain, moves large files both ways around its store SQL Server:
- **In:** each store drops a nightly file of up to **400 MB** on the **SFTP hub**. A **relay job** uploads it to **Azure Blob Storage** and puts a notice on a queue. A **store loader** downloads the file and writes it through a **store data System API** into **SQL Server**.
- **Out:** an **export job** reads the new plan through the same System API and sends it in parts to the **planning platform's upload API**.

**Numbers**
- About **1 store file a second** for half an hour; the export sends about **1 part every 2 seconds**.
- An upload or download takes about 3 seconds; after a store refit about **25 seconds**, for up to half an hour.
- A SQL Server call takes about 150 ms. The replenishment job causes **deadlocks** on about **1 call in 10** for up to 20 minutes.
- SQL Server patching takes up to **40 minutes** once a month.
- About **1 file in 100** is cut short on the way from the store. It fails its checks every time.
- Last year an availability zone failed for 20 minutes.
- In this model calls time out after 10 seconds unless set otherwise, and a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- Go through each number and say which setting answers it, on which box.
- Why does the relay upload to Blob Storage instead of putting the file on the queue?
- How does the loader know a file is complete before it writes a row?
`,
  answerTemplate: `## Design

## Settings, number by number

## Why Blob Storage

## A complete file
`,
  keyPoints: [
    'A queue message has a size limit far below 400 MB. The file goes to Blob Storage; the queue carries its name, size and MD5 (a claim check).',
    'A 25 second upload is the relay\'s call and a 25 second download is the loader\'s: both timeouts go above it.',
    'Deadlocks clear in a moment: retries in the System API cover both the loader and the export job.',
    'Patching is a long outage: the queue rides it out. 60 deliveries cover 40 minutes and still park a garbled file within the hour.',
    'A zone outage needs a second replica on every box that answers: the relay, the export job and the System API.',
    'The loader compares the downloaded size and MD5 with the notice before it writes. A file cut short fails there, not halfway through the load.',
  ],
  solution: `
**Design**
\`\`\`
store-files-relay ─► Store SFTP hub
store-files-relay ─► Store files container
store-files-relay ~► store.files ~► prc-store-loader ─► Store files container
                                    prc-store-loader ─► sys-store-data ─► Store SQL Server
                     store.files ~► store.files.dlq
plan-export ─► sys-store-data
plan-export ─► Planning platform upload API
\`\`\`

**Settings.**
- \`store-files-relay\`: 2 replicas, timeout 60 seconds.
- \`store.files\`: 60 deliveries before the DLQ.
- \`prc-store-loader\`: timeout 60 seconds.
- \`sys-store-data\`: 2 replicas, 2 retries for deadlocks and lock timeouts.
- \`plan-export\`: 2 replicas.

**Two replicas of each job.** Each job takes a run lock row before it starts, so the second replica skips the run instead of doubling it. The relay can also claim files by moving them to a working folder on the hub.
`,
  followUps: [
    {
      q: 'The planning platform refuses parts for an hour during its own release. What changes?',
      a: 'The export job cannot wait an hour in a call. Put the parts on a queue in front of a sender, with a redelivery limit that covers the hour, or let the export job end and rerun the unsent parts from its job log.',
    },
    {
      q: 'Who deletes the files in Blob Storage, and when?',
      a: 'A lifecycle rule on the container, a few days after upload. The loader should not delete: a redelivery or a replay from the DLQ still needs the file.',
    },
  ],
}

import { diagram } from '../../arch/dsl.js'

const drops = { name: 'SFTP documents', from: 'batch-job', rps: 5, to: ['sftp-server', 'azure-blob', 'oracle-db'], kind: 'write' }

export default {
  id: 'uc-158',
  category: 'use-cases',
  title: 'Product Data Hub for Suppliers Without APIs: Collect SFTP Drops Into Azure Blob Storage, Notify the Same Queue, and Allow for 80 MB Files',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'azure-blob', 'claim-check', 'sftp', 'queues', 'oracle', 'timeout', 'gs1'],
  estMinutes: 35,
  diagram: {
    task: 'draw small suppliers putting files on the hub\'s SFTP server. A scheduled collector job reads each file, stores it in Azure Blob Storage through the blob System API, and puts a notification on the hub\'s inbound queue with its dead-letter queue. The hub inbound Process API reads the queue, fetches the document through the blob System API and loads it into Oracle through the Oracle System API.',
    checks: [
      { label: 'Suppliers put files on the SFTP server', rule: { type: 'edge', from: 'partner', to: 'sftp-server' } },
      { label: 'A scheduled job collects the files', rule: { type: 'edge', from: 'batch-job', to: 'sftp-server' } },
      { label: 'Documents are stored in Azure Blob Storage only through a System API', rule: { type: 'only-via', target: 'azure-blob', from: 'system-api' } },
      { label: 'Notifications wait on a queue before anything reaches Oracle', rule: { type: 'path', from: 'batch-job', via: 'queue', to: 'oracle-db' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Oracle is reached only through a System API', rule: { type: 'only-via', target: 'oracle-db', from: 'system-api' } },
    ],
    reference: diagram(
      {
        sup: ['partner', 'Small suppliers'],
        sftp: ['sftp-server', 'Hub SFTP drop'],
        job: ['batch-job', 'pdh-sftp-collector', { timeoutMs: 60000 }],
        sysB: ['system-api', 'sys-pdh-blob', { timeoutMs: 60000 }],
        blob: ['azure-blob', 'pdh-inbound container'],
        q: ['queue', 'PDH.INBOUND.NOTIFY', { maxRedelivery: 60 }],
        dlq: ['dlq', 'PDH.INBOUND.FAILED'],
        prc: ['process-api', 'prc-pdh-inbound', { timeoutMs: 60000 }],
        sysO: ['system-api', 'sys-pdh-oracle'],
        ora: ['oracle-db', 'Product data hub Oracle'],
      },
      ['sup -> sftp', 'job -> sftp', 'job -> sysB', 'sysB -> blob', 'job ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sysB', 'prc -> sysO', 'sysO -> ora'],
    ),
    simulation: {
      systems: [
        { match: 'sftp-server', latencyMs: 400 },
        { match: 'azure-blob', latencyMs: 300 },
        { match: 'oracle-db', latencyMs: 60, maxRps: 100 },
      ],
      tests: [
        {
          name: 'A normal night',
          about: 'The collector picks up about 5 files a second. Every one is stored and loaded into Oracle.',
          traffic: [drops],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'azure-blob', min: 0.99 }, { to: 'oracle-db', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'Oracle patching',
          about: 'Oracle is down for 40 minutes. Files are still collected and stored, notifications wait, and every document is loaded afterwards.',
          traffic: [drops],
          incidents: [{ down: 'oracle-db', at: 5, forMin: 40 }],
          durationMin: 90,
          expect: { delivered: [{ to: 'oracle-db', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'The month end SupplierItem files',
          about: 'Each supplier sends its full catalogue: 80 MB files that take about 18 seconds to store or fetch. Every one gets through.',
          traffic: [{ ...drops, rps: 1 }],
          incidents: [{ slow: 'azure-blob', latencyMs: 18000, at: 0, forMin: 30 }],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'azure-blob', min: 0.99 }, { to: 'oracle-db', min: 0.99 }] },
        },
      ],
    },
  },
  description: `
Copperline Home Supply' product data hub (fictional) takes documents by claim check: the document in **Azure Blob Storage**, a notification on the inbound queue, and a Process API that loads it into the hub's **Oracle database**.

About 300 **small suppliers** cannot call an API. They can only put files on an SFTP server. The team wants them in the same pipeline, so that validation, duplicate checks, routing by message type, job logs and ACKs are written once.

**Numbers**
- About **5 files a second** at night, most under 1 MB.
- At month end, suppliers send full catalogues of up to **80 MB**. Storing or fetching one takes about **18 seconds**.
- Oracle is patched once a month for up to **40 minutes**.
- In this model calls time out after 10 seconds unless set otherwise, and a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- How do SFTP files join the same pipeline as API documents?
- Which timeouts must change for 80 MB files, and why more than one?
- Choose a redelivery limit for the inbound queue.
`,
  answerTemplate: `## Design

## Joining the pipeline

## Large files

## The redelivery limit
`,
  keyPoints: [
    'The collector job is a second front door. It turns each file into the same two things an API upload makes: a blob and a notification.',
    'Everything after the queue is shared, so an SFTP document is validated, deduplicated, routed and loaded exactly like an API one.',
    'A large file is slow at every hop that touches it: the collector storing it, the blob System API, and the Process API fetching it. Each caller needs a timeout above the slowest healthy call.',
    'The notification stays small whatever the file size. That is the point of the claim check.',
    'A limit of 60 tries covers 40 minutes of Oracle patching with room.',
  ],
  solution: `
**Design**
\`\`\`
Small suppliers ─► Hub SFTP drop ◄─ pdh-sftp-collector ─► sys-pdh-blob ─► pdh-inbound container
                                           ~► PDH.INBOUND.NOTIFY ~► prc-pdh-inbound ─► sys-pdh-blob
                                                 ~► PDH.INBOUND.FAILED           ─► sys-pdh-oracle ─► Hub Oracle
\`\`\`

**The collector.** Every minute it lists the drop folders, and for each file: stores it as \`inbound/{supplier}/{messageId}.json\`, publishes the notification with the supplier from the folder name, then moves the file to an archive folder on SFTP. A file is moved only after both worked.

**Timeouts.** 60 seconds on the collector, the blob System API and the inbound Process API: each waits on an 18 second transfer.

**Patching.** 60 deliveries covers 40 minutes. Oracle then takes 100 loads a second and the backlog clears quickly.

**Partial files.** Suppliers must upload under a temporary name and rename when done, or the collector must wait until a file's size stops changing, so it never takes a half written file.
`,
  followUps: [
    {
      q: 'Why not let the collector load Oracle itself?',
      a: 'Then validation, duplicate checks and routing would exist twice and drift apart. One pipeline after the queue keeps them in one place.',
    },
    {
      q: 'Who sends the ACK to an SFTP supplier?',
      a: 'The same ACK flow writes a small result file back to the supplier\'s folder on SFTP, instead of a message on the ACK queue.',
    },
  ],
}

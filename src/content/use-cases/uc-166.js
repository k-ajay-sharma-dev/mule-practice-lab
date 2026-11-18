import { diagram } from '../../arch/dsl.js'

const issued = { name: 'issued drawings', from: 'batch-job', rps: 3, to: ['file-store', 'saas'], kind: 'write' }

export default {
  id: 'uc-166',
  category: 'use-cases',
  title: 'Issued Drawings From an Azure File Share to a Client Portal: an On Premises Watcher, a Queue Into CloudHub, Timeouts Sized for 200 MB Files, and a Runtime That Restarts',
  level: 'ADVANCED',
  tags: ['myproject', 'azure-file-share', 'hybrid', 'queues', 'dlq', 'timeout', 'large-files', 'architecture'],
  estMinutes: 45,
  diagram: {
    task: 'draw a watcher job next to the Azure File Share that publishes a notification for each issued drawing to a queue with a dead-letter queue. A drawings Process API on CloudHub reads the queue, fetches the file through a share System API that runs where the share is mounted, and uploads it to the client portal through a portal System API.',
    checks: [
      { label: 'The watcher job reads the share', rule: { type: 'edge', from: 'batch-job', to: 'file-store' } },
      { label: 'Notifications go through a queue to the Process API', rule: { type: 'path', from: 'batch-job', via: 'queue', to: 'process-api' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'The Process API reaches the share only through a System API', rule: { type: 'path', from: 'process-api', via: 'system-api', to: 'file-store' } },
      { label: 'The portal is reached only through a System API', rule: { type: 'only-via', target: 'saas', from: 'system-api' } },
      { label: 'Nothing on CloudHub reads the share directly', rule: { type: 'no-edge', from: 'process-api', to: 'file-store', ifDrawn: true } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'issued-drawings-watcher'],
        share: ['file-store', 'Azure File Share projects'],
        q: ['queue', 'drawings.issued', { maxRedelivery: 60 }],
        dlq: ['dlq', 'drawings.issued.dlq'],
        prc: ['process-api', 'prc-issue-drawings', { timeoutMs: 90000 }],
        sysF: ['system-api', 'sys-projects-share', { timeoutMs: 60000 }],
        sysP: ['system-api', 'sys-client-portal', { timeoutMs: 60000 }],
        portal: ['saas', 'Client document portal'],
      },
      ['job -> share', 'job ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sysF', 'sysF -> share', 'prc -> sysP', 'sysP -> portal'],
    ),
    simulation: {
      systems: [
        { match: 'file-store', latencyMs: 400 },
        { match: 'saas', latencyMs: 600 },
      ],
      tests: [
        {
          name: 'A normal afternoon',
          about: 'About 3 drawings a second are issued. Every one reaches the client portal.',
          traffic: [issued],
          durationMin: 30,
          expect: { delivered: [{ to: 'saas', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'A batch of 200 MB models',
          about: 'A project issues its 3D models. Each takes about 20 seconds to read from the share and 25 to upload. Every one still arrives.',
          traffic: [{ ...issued, rps: 1 }],
          incidents: [
            { slow: 'file-store', latencyMs: 20000, at: 0, forMin: 30 },
            { slow: 'saas', latencyMs: 25000, at: 0, forMin: 30 },
          ],
          durationMin: 30,
          expect: { delivered: [{ to: 'saas', min: 0.99 }] },
        },
        {
          name: 'The share System API restarts',
          about: 'The runtime next to the share is patched and is down for 40 minutes. Notifications wait, and every drawing reaches the portal afterwards. None lands on the dead-letter queue.',
          traffic: [issued],
          incidents: [{ down: { type: 'system-api', label: 'share' }, at: 5, forMin: 40 }],
          durationMin: 90,
          expect: { delivered: [{ to: 'saas', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
Quillon Architects, a fictional practice, keeps project files on an **Azure File Share**, \`projects\`, mounted as a drive in every office. When an architect moves a drawing into a project's \`issued\` folder, the client must get it on the **client document portal**, a SaaS product with an upload API.

The integration team runs most of its APIs on **CloudHub**. CloudHub cannot mount SMB, so the team runs a small Mule runtime on a VM in Azure with the share mounted. It hosts two things: a **watcher job** that notices new issued files, and a **share System API** that reads them.

**Numbers**
- About **3 drawings a second** at busy times.
- 3D models can be **200 MB**. Reading one from the share takes about 20 seconds, and uploading it to the portal about 25.
- The VM is patched monthly and the runtime is down for up to **40 minutes**.
- In this model calls time out after 10 seconds unless set otherwise, and a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- Why does the watcher publish to a queue instead of calling the portal itself?
- Which timeouts must change for 200 MB files? Say why more than one.
- Choose a redelivery limit for the patching window.
`,
  answerTemplate: `## Design

## The watcher and the queue

## Large files

## The patching window
`,
  keyPoints: [
    'The watcher stays small: notice a file, publish its path. All the slow work happens behind the queue.',
    'The queue absorbs the patching window. Notifications wait, then flow again when the share System API is back.',
    'A 200 MB file is slow at every hop: the share System API reading it, the portal System API uploading it, and the Process API waiting on both. Each needs a timeout above its slowest normal call.',
    'The Process API waits for the read and the upload one after the other, so its timeout covers the sum: 90 seconds over 20 and 25.',
    '40 minutes of downtime is about 40 deliveries. A limit of 60 covers it and still stops a drawing that can never upload.',
  ],
  solution: `
**Design**
\`\`\`
issued-drawings-watcher ─► Azure File Share projects ◄─ sys-projects-share ◄─ prc-issue-drawings ─► sys-client-portal ─► Client portal
        ~► drawings.issued ~► prc-issue-drawings
        drawings.issued ~► drawings.issued.dlq
\`\`\`

**Timeouts.** 60 seconds on each System API, 90 seconds on the Process API.

**Limit.** 60 deliveries.

**Streaming.** Stream the file from the share System API through the Process API to the portal. Holding 200 MB in memory per message would sink a small worker.

**Repeats.** The portal upload uses the drawing's path and revision as its key, so a redelivery replaces rather than duplicates.
`,
  followUps: [
    {
      q: 'Why not read the file through the File Share REST API from CloudHub, and drop the VM?',
      a: 'That works for reading files by name, and removes a server. The watcher still needs to notice new files: polling the REST API for listings is possible, but slower and more calls. The team kept the VM because it already ran there.',
    },
    {
      q: 'The watcher notices a file that the architect is still copying. What happens?',
      a: 'The portal gets a half file. The watcher must wait until the size and modified time stop changing, or architects copy into a staging folder and move into issued.',
    },
  ],
}

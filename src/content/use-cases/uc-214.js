import { diagram } from '../../arch/dsl.js'

const release = { name: 'planogram files', from: 'batch-job', rps: 1, to: 'sftp-server', kind: 'write', spikes: [{ at: 5, forMin: 2, rps: 20 }] }

export default {
  id: 'uc-214',
  category: 'use-cases',
  title: 'Planogram Files to 600 Stores Through One Store Hub SFTP Server That Takes Five Uploads a Second: a Queue to Absorb the 05:00 Release, a Sender Paced by the Server, and Settings for Its Slow Mornings and Restarts',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'sftp', 'queues', 'throttling', 'dlq', 'timeout', 'stores'],
  estMinutes: 35,
  diagram: {
    task: 'draw the planogram release job putting one message per store file on a queue with a dead-letter queue. A planogram sender Process API reads the queue and uploads each file to the store hub SFTP server. The release job never waits on the SFTP server.',
    checks: [
      { label: 'Store files wait on a queue before they reach the SFTP server', rule: { type: 'path', from: 'batch-job', via: 'queue', to: 'sftp-server' } },
      { label: 'The release job never waits on the SFTP server', rule: { type: 'no-path', from: 'batch-job', to: 'sftp-server', kind: 'sync' } },
      { label: 'The sender uploads to the SFTP server', rule: { type: 'edge', from: 'process-api', to: 'sftp-server' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'planogram-release'],
        q: ['queue', 'planogram.files', { maxRedelivery: 40 }],
        dlq: ['dlq', 'planogram.files.dlq'],
        prc: ['process-api', 'prc-planogram-sender', { timeoutMs: 30000 }],
        hub: ['sftp-server', 'Store hub SFTP'],
      },
      ['job ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> hub'],
    ),
    simulation: {
      systems: [{ match: 'sftp-server', latencyMs: 600, maxRps: 5 }],
      tests: [
        {
          name: 'The 05:00 release',
          about: 'The job puts about 20 files a second on the queue for two minutes. The sender never pushes the hub past 5 uploads a second, and every store has its file within the hour.',
          traffic: [release],
          durationMin: 60,
          expect: { delivered: [{ to: 'sftp-server', min: 0.99 }], peakRps: [{ node: 'sftp-server', max: 5 }], backlog: [{ queue: 'queue', maxEnd: 5 }], dlq: { max: 0 } },
        },
        {
          name: 'A slow hub',
          about: 'The hub\'s disks are busy with backups and each upload takes about 20 seconds for half an hour. The files still go through, and the queue holds no more than the release itself.',
          traffic: [release],
          incidents: [{ slow: 'sftp-server', latencyMs: 20000, at: 0, forMin: 30 }],
          durationMin: 90,
          expect: { delivered: [{ to: 'sftp-server', min: 0.99 }], backlog: [{ queue: 'queue', maxPeak: 2500 }], dlq: { max: 0 } },
        },
        {
          name: 'The hub restarts',
          about: 'The hub is down for 25 minutes after a failed update. Files wait on the queue and every store gets its file afterwards.',
          traffic: [release],
          incidents: [{ down: 'sftp-server', at: 3, forMin: 25 }],
          durationMin: 90,
          expect: { delivered: [{ to: 'sftp-server', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'A store folder that is gone',
          about: 'One file in a hundred is for a store that closed, whose folder was removed. It fails every time, ends on the dead-letter queue, and the queue empties.',
          traffic: [{ ...release, poison: 0.01, forMin: 60 }],
          durationMin: 120,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 5 }] },
        },
      ],
    },
  },
  description: `
Fenwick Supply, a fictional builders' merchant, sends each of its **600 stores** four planogram files before it opens, one per department: where each product goes on the shelf. The files go to the **store hub SFTP server**, one folder per store; each store's back office system picks up its own.

At 05:00 the planogram release job writes all 2,400 files. It used to upload them itself. The hub allows only a few uploads at once, refused the rest, and 140 stores opened with last week's layout.

The new design: the job puts one message per file on a queue, and a **planogram sender** uploads them at the pace the hub allows.

**Numbers**
- The release job queues about **20 files a second** for two minutes, then about 1 a second for late changes.
- The hub takes about **5 uploads a second**. An upload takes about 600 ms; during backups, about **20 seconds**, for up to half an hour.
- The hub sometimes restarts after an update and is down for up to **25 minutes**.
- About **1 file in 100** is for a store that closed; its folder is gone and the upload fails every time.
- In this model a queue consumer takes only what the boxes behind it can take, calls time out after 10 seconds unless set otherwise, and a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- How does the queue keep the hub at 5 uploads a second?
- Set the sender's timeout and the queue's redelivery limit. Explain each number.
- What should happen to files on the dead-letter queue?
`,
  answerTemplate: `## Design

## Pacing the hub

## Settings

## The dead-letter queue
`,
  keyPoints: [
    'The queue turns a burst of 2,400 files into a steady stream. The sender takes the next file only when the hub has room, so the hub never sees more than it can take.',
    'At 5 a second the burst drains in about 8 minutes, well before stores open.',
    'A 20 second upload needs a timeout above it, or every upload during backups fails and waits a minute. 30 seconds leaves room.',
    'A 25 minute restart needs more than 25 deliveries. 40 covers it and parks a file for a closed store within the hour.',
    'Files for closed stores are a data problem. The store list in the release job should drop them; until then support clears the dead-letter queue each morning.',
  ],
  solution: `
**Design**
\`\`\`
planogram-release ~► planogram.files ~► prc-planogram-sender ─► Store hub SFTP
                     planogram.files ~► planogram.files.dlq
\`\`\`

**Settings.** \`prc-planogram-sender\`: timeout 30 seconds. \`planogram.files\`: 40 deliveries.

**In Mule.** The sender's listener takes a fixed number of messages at once (its consumer count, or a max concurrency), so set that to what the hub allows rather than to the default.
`,
  followUps: [
    {
      q: 'The message carries the whole planogram file. Is that wise?',
      a: 'A planogram is a few hundred KB, which a broker handles. For larger files, write them to a store first and send only the name, as a claim check.',
    },
    {
      q: 'A store opens and its file is still on the queue. What can it do?',
      a: 'Its back office keeps yesterday\'s layout. A small API that sends one store\'s file on demand lets the store manager ask for it again.',
    },
  ],
}

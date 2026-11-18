import { diagram } from '../../arch/dsl.js'

const share = { type: 'file-store', label: 'file share' }
const counts = { name: 'count files', from: 'device', rps: 2, to: share, kind: 'write' }

export default {
  id: 'uc-213',
  category: 'use-cases',
  title: 'Stock Count Files From Store Handhelds to an Azure File Share: Accept Each Upload at Once, Queue It for the On Premises Share Writer, and Ride Out Its Nightly Patching',
  level: 'BEGINNER',
  tags: ['myproject', 'azure-file-share', 'queues', 'dlq', 'on-premises', 'planning'],
  estMinutes: 25,
  diagram: {
    task: 'draw the store handhelds calling a store counts Experience API on CloudHub. The API puts each count file on a queue with a dead-letter queue. A share writer System API, running on premises where it can mount the Azure File Share, reads the queue and writes each file to the share.',
    checks: [
      { label: 'Count files wait on a queue before they reach the file share', rule: { type: 'path', from: 'device', via: 'queue', to: share } },
      { label: 'The handhelds never wait on the share writer', rule: { type: 'no-path', from: 'device', to: 'system-api', kind: 'sync' } },
      { label: 'Only the share writer writes to the file share', rule: { type: 'only-via', target: share, from: 'system-api' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
    ],
    reference: diagram(
      {
        hh: ['device', 'Store handhelds'],
        exp: ['experience-api', 'exp-store-counts'],
        q: ['queue', 'store.counts', { maxRedelivery: 60 }],
        dlq: ['dlq', 'store.counts.dlq'],
        sys: ['system-api', 'sys-share-writer (on premises)'],
        afs: ['file-store', 'Azure file share (planning)'],
      },
      ['hh -> exp', 'exp ~> q', 'q ~> sys', 'q ~> dlq', 'sys -> afs'],
    ),
    simulation: {
      systems: [{ match: share, latencyMs: 300 }],
      tests: [
        {
          name: 'Count night',
          about: 'About two count files a second for half an hour. Every handheld gets its answer at once and every file reaches the share.',
          traffic: [counts],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 500 }], delivered: [{ to: share, min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'The share writer is patched',
          about: 'The on premises server is down for 40 minutes of patching. The handhelds notice nothing, and every file reaches the share afterwards.',
          traffic: [counts],
          incidents: [{ down: 'system-api', at: 5, forMin: 40 }],
          durationMin: 100,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: share, min: 0.99 }], dlq: { max: 0 } },
        },
        {
          name: 'A file the share refuses',
          about: 'For an hour, one file in a hundred has a name the share will not take. Each fails every time and ends on the dead-letter queue, so the queue empties again.',
          traffic: [{ ...counts, poison: 0.01, forMin: 60 }],
          durationMin: 150,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 10 }] },
        },
      ],
    },
  },
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, counts stock in its stores twice a year. Staff scan shelves with **handhelds**, and each handheld uploads a count file per aisle. The planning platform picks the files up from an **Azure File Share**.

Brindle's runtime on CloudHub cannot mount the share over SMB. A small **share writer** API runs on an on premises server that mounts it. Today the handhelds call that API directly. Its server is patched at night, which is exactly when stores count, and the handhelds show "upload failed" and staff scan the aisle again.

**Numbers**
- About **2 count files a second** on a count night.
- Writing a file to the share takes about 300 ms.
- The share writer's server is down for up to **40 minutes** of patching.
- Now and then a file has a name the share refuses (a character SMB does not allow). It fails every time.
- In this model a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- Why must the API the handhelds call run on CloudHub, and the writer on premises?
- Set the queue's redelivery limit and explain the number.
`,
  answerTemplate: `## Design

## Where each part runs

## The redelivery limit
`,
  keyPoints: [
    'The handhelds talk to an API that is always up. It only puts the file on the queue, so a patched server behind it does not show as a failed upload.',
    'The writer runs where SMB can be mounted. The queue is what joins the cloud side and the on premises side.',
    '40 minutes down with a retry about once a minute needs more than 40 deliveries. 60 rides it out and still parks a bad file within the hour.',
    'Count files are small, so the queue can carry them. Large files would go to Blob Storage first, with only a notice on the queue.',
    'A parked file is a naming problem. Support renames it and puts it back, or the handheld app learns to avoid the character.',
  ],
  solution: `
**Design**
\`\`\`
Store handhelds ─► exp-store-counts ~► store.counts ~► sys-share-writer (on premises) ─► Azure file share
                                       store.counts ~► store.counts.dlq
\`\`\`

**Settings.** \`store.counts\`: 60 deliveries.

**Patching.** Agree a window with the server team, and keep the limit above it with room to spare.
`,
  followUps: [
    {
      q: 'Could the share writer use the File Share REST API and run on CloudHub instead?',
      a: 'Yes. Then the on premises server is not needed, and the queue protects against the share\'s own outages instead. Keep the queue either way.',
    },
    {
      q: 'A handheld uploads the same aisle twice. What does the share get?',
      a: 'The same file name twice, so the second write replaces the first. Name files by store, aisle and count number, so a resend replaces and a new count does not.',
    },
  ],
}

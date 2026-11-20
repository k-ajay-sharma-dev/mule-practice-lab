import { diagram } from '../../arch/dsl.js'

const notices = { name: 'item notices', from: 'partner', rps: 1, to: ['azure-blob', 'oracle-db'], kind: 'write' }

export default {
  id: 'uc-202',
  category: 'use-cases',
  title: 'An Item Adapter Behind a Claim Check: Small Notices on a Queue, Large Bodies in Azure Blob, a Loader That Waits for Month End Blobs, Retries Oracle Lock Timeouts and Parks Notices That Point Nowhere',
  level: 'ADVANCED',
  tags: ['myproject', 'batch', 'claim-check', 'azure-blob', 'oracle', 'queues', 'dlq', 'timeout', 'retry'],
  estMinutes: 45,
  diagram: {
    task: 'draw the supplier portal putting small item notices on a queue with a dead-letter queue. An items adapter Process API reads the queue, downloads each body from Azure Blob Storage and writes the items through a merchandising System API to Oracle. The portal never waits on Oracle.',
    checks: [
      { label: 'Notices wait on a queue before they reach Oracle', rule: { type: 'path', from: 'partner', via: 'queue', to: 'oracle-db' } },
      { label: 'The portal never waits on Oracle', rule: { type: 'no-path', from: 'partner', to: 'oracle-db', kind: 'sync' } },
      { label: 'The adapter downloads the body from Azure Blob Storage', rule: { type: 'edge', from: 'process-api', to: 'azure-blob' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Oracle is reached only through a System API', rule: { type: 'only-via', target: 'oracle-db', from: 'system-api' } },
    ],
    reference: diagram(
      {
        portal: ['partner', 'Supplier portal'],
        q: ['queue', 'items.notify', { maxRedelivery: 60 }],
        dlq: ['dlq', 'items.notify.dlq'],
        prc: ['process-api', 'prc-items-adapter', { timeoutMs: 60000 }],
        blob: ['azure-blob', 'Item blob store'],
        sys: ['system-api', 'sys-merch-oracle', { retries: 2 }],
        ora: ['oracle-db', 'Merchandising Oracle'],
      },
      ['portal ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> blob', 'prc -> sys', 'sys -> ora'],
    ),
    simulation: {
      systems: [
        { match: 'azure-blob', latencyMs: 400 },
        { match: 'oracle-db', latencyMs: 120 },
      ],
      tests: [
        {
          name: 'A normal day',
          about: 'About one notice a second for half an hour. Every item set reaches Oracle.',
          traffic: [notices],
          durationMin: 30,
          expect: { delivered: [{ to: 'oracle-db', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'Month end bodies',
          about: 'Suppliers send full catalogues at month end. Each download takes about 25 seconds for half an hour. Every notice goes through as it comes, and notices do not pile up.',
          traffic: [notices],
          incidents: [{ slow: 'azure-blob', latencyMs: 25000, at: 0, forMin: 30 }],
          durationMin: 60,
          expect: { delivered: [{ to: 'oracle-db', min: 0.99 }], backlog: [{ queue: 'queue', maxPeak: 100 }], dlq: { max: 0 } },
        },
        {
          name: 'Lock timeouts in Oracle',
          about: 'A price job holds locks for 20 minutes, and one write in ten times out on a lock and works a moment later. Quick retries in the System API keep notices from waiting on the queue.',
          traffic: [{ ...notices, rps: 15 }],
          incidents: [{ errors: 'oracle-db', rate: 0.1, at: 0, forMin: 20 }],
          durationMin: 20,
          expect: { delivered: [{ to: 'system-api', min: 0.99 }], backlog: [{ queue: 'queue', maxPeak: 20 }], dlq: { max: 0 } },
        },
        {
          name: 'Oracle maintenance',
          about: 'Oracle is down for 40 minutes. Notices wait on the queue, and every item set loads afterwards.',
          traffic: [notices],
          incidents: [{ down: 'oracle-db', at: 5, forMin: 40 }],
          durationMin: 100,
          expect: { delivered: [{ to: 'oracle-db', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'A notice that points nowhere',
          about: 'One notice in a hundred names a blob the portal never finished writing. It fails every time, ends on the dead-letter queue, and the queue does not keep growing.',
          traffic: [{ ...notices, poison: 0.01 }],
          durationMin: 150,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 100 }] },
        },
      ],
    },
  },
  description: `
Pell & Rook Hardware, a fictional hardware chain, receives item data from a **supplier portal**. For each upload the portal writes the items as a JSON body to **Azure Blob Storage** and puts a small notice on the queue \`items.notify\`: the message ID and the blob name. An **items adapter** reads the notice, downloads the body and loads the items through a **merchandising System API** into **Oracle**.

**Numbers**
- About **1 notice a second** most of the day; up to **15 a second** when a big supplier resends.
- A download takes about 400 ms; at month end, full catalogues take about **25 seconds**.
- A price job holds locks in Oracle for up to 20 minutes a day; then about **1 write in 10** times out on a lock and works when tried again. Each try times out or not on its own. This can happen while a big supplier resends, and lock timeouts should cost a notice seconds, not a minute back on the queue.
- Oracle maintenance takes up to **40 minutes**.
- About **1 notice in 100** names a blob the portal never finished writing. It will never load.
- In this model calls time out after 10 seconds unless set otherwise, and a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- Why a claim check here, and what goes in the notice?
- Set the adapter's timeout, the System API's retries and the queue's redelivery limit. Explain each number.
- What does support do with a notice on the dead-letter queue?
`,
  answerTemplate: `## Design

## The claim check

## Settings

## The dead-letter queue
`,
  keyPoints: [
    'The notice is tiny; the body can be hundreds of MB. Brokers handle many small messages well and large ones badly.',
    'A 25 second download needs an adapter timeout above it, or every month end notice fails and waits a minute.',
    'Lock timeouts clear in a moment, so retry them in the System API. Do not retry a constraint error.',
    'With a retry about once a minute, 40 minutes of maintenance needs more than 40 deliveries. 60 leaves room and still parks a dead notice within the hour.',
    'The adapter must accept the same notice twice: check the message ID before loading, because a notice redelivered after a timeout may already be loaded.',
  ],
  solution: `
**Design**
\`\`\`
Supplier portal ~► items.notify ~► prc-items-adapter ─► Item blob store
                                    prc-items-adapter ─► sys-merch-oracle ─► Merchandising Oracle
                   items.notify ~► items.notify.dlq
\`\`\`

**Settings.** \`prc-items-adapter\`: timeout 60 seconds. \`sys-merch-oracle\`: 2 retries, only for lock timeouts and deadlocks. \`items.notify\`: 60 deliveries.

**The DLQ.** A daily list to the supplier team. They ask the supplier to upload again; the new upload sends a new notice, so the parked one is deleted, not replayed.
`,
  followUps: [
    {
      q: 'The adapter times out at 60 seconds, but the download carries on in the background. Can that hurt?',
      a: 'The redelivered notice starts a second download while the first may still finish and write. The message ID check and idempotent writes make the second one harmless.',
    },
    {
      q: 'Could the portal write directly to Oracle staging instead?',
      a: 'It would tie the portal to Oracle\'s schema and to its maintenance windows. The queue and the API keep both sides free to change and to be down.',
    },
  ],
}

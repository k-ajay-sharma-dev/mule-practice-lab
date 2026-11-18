import { diagram } from '../../arch/dsl.js'

const notices = { name: 'new notices', from: 'partner', rps: 3, to: 'oracle-db', kind: 'write' }
const replays = { name: 'replays', from: 'batch-job', rps: 10, to: 'oracle-db', kind: 'write' }

export default {
  id: 'uc-203',
  category: 'use-cases',
  title: 'A Restart Job That Replays 60,000 Failed Messages Into the Adapter\'s Queue: Share the Queue With New Traffic, Ride Out an Oracle Restart Mid Replay, and Stop a Poison Message Circling for Ever',
  level: 'ADVANCED',
  tags: ['myproject', 'batch', 'restart', 'replay', 'queues', 'dlq', 'oracle', 'retry'],
  estMinutes: 45,
  diagram: {
    task: 'draw the warehouse partner putting messages on the adapter\'s queue, and a restart job that republishes parked failures to the same queue. The queue has a dead-letter queue. An adapter Process API reads the queue and writes through a merchandising System API to Oracle. The restart job never writes Oracle itself.',
    checks: [
      { label: 'New messages go through the queue', rule: { type: 'path', from: 'partner', via: 'queue', to: 'oracle-db' } },
      { label: 'Replays go through the same queue', rule: { type: 'path', from: 'batch-job', via: 'queue', to: 'oracle-db' } },
      { label: 'The restart job never writes Oracle or its API itself', rule: { type: 'no-path', from: 'batch-job', to: 'oracle-db', kind: 'sync' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Oracle is reached only through a System API', rule: { type: 'only-via', target: 'oracle-db', from: 'system-api' } },
    ],
    reference: diagram(
      {
        partner: ['partner', 'Warehouse partner'],
        restart: ['batch-job', 'restart-receipts'],
        q: ['queue', 'receipts.in', { maxRedelivery: 60 }],
        dlq: ['dlq', 'receipts.failed'],
        prc: ['process-api', 'prc-receipts-adapter'],
        sys: ['system-api', 'sys-merch-oracle', { retries: 2 }],
        ora: ['oracle-db', 'Merchandising Oracle'],
      },
      ['partner ~> q', 'restart ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sys', 'sys -> ora'],
    ),
    simulation: {
      systems: [{ match: 'oracle-db', latencyMs: 120 }],
      tests: [
        {
          name: 'A replay beside the day\'s traffic',
          about: 'The restart job replays ten messages a second while three new ones a second arrive. Every message of both reaches Oracle.',
          traffic: [notices, replays],
          durationMin: 30,
          expect: { delivered: [{ flow: 'new notices', to: 'oracle-db', min: 0.99 }, { flow: 'replays', to: 'oracle-db', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'Lock timeouts during the replay',
          about: 'The replay fights the nightly price job for locks: for 20 minutes one write in ten times out and works a moment later. Quick retries in the System API keep the queue short.',
          traffic: [notices, replays],
          incidents: [{ errors: 'oracle-db', rate: 0.1, at: 0, forMin: 20 }],
          durationMin: 20,
          expect: { delivered: [{ flow: 'replays', to: 'system-api', min: 0.99 }], backlog: [{ queue: 'queue', maxPeak: 30 }], dlq: { max: 0 } },
        },
        {
          name: 'Oracle restarts mid replay',
          about: 'The DBA restarts Oracle for 40 minutes in the middle of the replay. Messages wait on the queue; none is parked again, and all load afterwards.',
          traffic: [{ ...notices, rps: 1 }, { ...replays, rps: 1 }],
          incidents: [{ down: 'oracle-db', at: 5, forMin: 40 }],
          durationMin: 100,
          expect: { delivered: [{ flow: 'replays', to: 'oracle-db', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'A message that can never load',
          about: 'One replayed message in a hundred still names an item that does not exist. It returns to the dead-letter queue after its deliveries, and the main queue does not keep growing.',
          traffic: [{ ...replays, rps: 1, poison: 0.01 }],
          durationMin: 150,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 100 }] },
        },
      ],
    },
  },
  description: `
Ashgrove Pharmacy, a fictional pharmacy chain, receives goods receipts from its warehouse partner as messages on the queue \`receipts.in\`. An **adapter** reads each message and writes the receipt through a **merchandising System API** into **Oracle**. A message that fails all its deliveries goes to \`receipts.failed\`.

After a bad release, **60,000** receipts ended on \`receipts.failed\`. The fix is out, and a **restart job** will republish them to \`receipts.in\`, at a pace of about 10 a second, while the partner keeps sending new receipts.

**Numbers**
- New receipts: about **3 a second**. The replay: about **10 a second**, for an hour and a half.
- A write takes about 120 ms.
- The nightly price job holds locks for 20 minutes: about **1 write in 10** times out and works when tried again.
- The DBA has planned an Oracle restart of up to **40 minutes** in the same night.
- About **1 replayed message in 100** still names an item that does not exist. It will never load.
- In this model a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- Why does the restart job publish to the queue instead of calling the adapter or Oracle?
- Set the System API's retries and the queue's redelivery limit.
- A message fails again after replay. Where does it end, and how do you stop it going round for ever?
`,
  answerTemplate: `## Design

## Why through the queue

## Settings

## Messages that fail again
`,
  keyPoints: [
    'The replay goes through the same queue and the same adapter as new traffic, so it gets the same checks, retries and DLQ.',
    'The restart job needs no Oracle access and no knowledge of the adapter. It moves messages from one queue to another.',
    'Retries in the System API absorb lock timeouts. Without them each one waits a minute on the queue.',
    'A redelivery limit of 60 rides out a 40 minute restart. A message that still fails returns to the DLQ, so the restart job must not replay automatically in a loop.',
    'Check Oracle and the API before a replay starts. Replaying into a system that is down only refills the DLQ.',
  ],
  solution: `
**Design**
\`\`\`
Warehouse partner ~► receipts.in ~► prc-receipts-adapter ─► sys-merch-oracle ─► Merchandising Oracle
restart-receipts  ~► receipts.in ~► receipts.failed
\`\`\`

**Settings.** \`sys-merch-oracle\`: 2 retries for lock timeouts. \`receipts.in\`: 60 deliveries before \`receipts.failed\`.

**Running the replay.** Support starts it by hand after a fix, it checks Oracle first, it republishes at a set pace and stops at the count it found at the start, so messages that come back to \`receipts.failed\` during the run wait for a person.
`,
  followUps: [
    {
      q: 'The partner\'s new receipts are delayed by the replay. How can they go first?',
      a: 'Use message priority if the broker supports it, or a separate replay queue read by the same adapter with fewer consumers. Pacing the replay at 10 a second also leaves room.',
    },
    {
      q: 'How do you avoid applying a receipt twice if it was half applied before it failed?',
      a: 'The adapter checks the message ID in a message log and writes with MERGE. A replayed receipt then either skips or writes the same values again.',
    },
  ],
}

import { diagram } from '../../arch/dsl.js'

const liveQ = { type: 'queue', label: 'notify' }
const replayQ = { type: 'queue', label: 'replay' }
const live = { name: 'live notices', from: 'partner', rps: 20, to: ['azure-blob', 'oracle-db'], kind: 'write' }
const replay = { name: 'replayed notices', from: 'batch-job', rps: 60, forMin: 30, to: ['azure-blob', 'oracle-db'], kind: 'write' }

export default {
  id: 'uc-217',
  category: 'use-cases',
  title: 'A Month End Replay of 100,000 Failed Item Messages Must Not Delay Today\'s: a Replay Lane of Its Own Into the Same Oracle, a Rate Limit That Keeps Room for Live Notices, and Settings for Maintenance, Lock Timeouts, a Zone Outage and Dead Blobs',
  level: 'EXPERT',
  tags: ['myproject', 'oracle', 'queues', 'restart', 'replay', 'rate-limit', 'claim-check', 'azure-blob', 'dlq', 'replicas'],
  estMinutes: 60,
  diagram: {
    task: 'draw the supplier portal putting item notices on a live notify queue, read by the items adapter Process API. Draw the restart job putting replayed notices on a separate replay queue, read by an items replayer Process API. Both Process APIs download each body from Azure Blob Storage and write through one merchandising System API to Oracle. Each queue has its own dead-letter queue.',
    checks: [
      { label: 'Live notices wait on their own queue before they reach Oracle', rule: { type: 'path', from: 'partner', via: liveQ, to: 'oracle-db' } },
      { label: 'Replays wait on the replay queue before they reach Oracle', rule: { type: 'path', from: 'batch-job', via: replayQ, to: 'oracle-db' } },
      { label: 'Replays never go through the live queue', rule: { type: 'no-path', from: 'batch-job', to: liveQ } },
      { label: 'The restart job never writes Oracle or its API itself', rule: { type: 'no-path', from: 'batch-job', to: 'oracle-db', kind: 'sync' } },
      { label: 'Every queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Oracle is reached only through a System API', rule: { type: 'only-via', target: 'oracle-db', from: 'system-api' } },
    ],
    reference: diagram(
      {
        portal: ['partner', 'Supplier portal'],
        qL: ['queue', 'pdh.items.notify', { maxRedelivery: 60 }],
        dL: ['dlq', 'pdh.items.notify.dlq'],
        prcL: ['process-api', 'prc-items-adapter', { replicas: 2, timeoutMs: 60000 }],
        restart: ['batch-job', 'pdh-restart', { vCores: '0.5' }],
        qR: ['queue', 'pdh.items.replay', { maxRedelivery: 60 }],
        dR: ['dlq', 'pdh.items.replay.dlq'],
        prcR: ['process-api', 'prc-items-replayer', { rateLimit: 25, timeoutMs: 60000 }],
        blob: ['azure-blob', 'Item blob store'],
        sys: ['system-api', 'sys-merch-oracle', { replicas: 2, retries: 2 }],
        ora: ['oracle-db', 'Merchandising Oracle'],
      },
      ['portal ~> qL', 'qL ~> prcL', 'qL ~> dL', 'prcL -> blob', 'prcL -> sys', 'restart ~> qR', 'qR ~> prcR', 'qR ~> dR', 'prcR -> blob', 'prcR -> sys', 'sys -> ora'],
    ),
    simulation: {
      systems: [
        { match: 'azure-blob', latencyMs: 400 },
        { match: 'oracle-db', latencyMs: 120, maxRps: 60 },
      ],
      tests: [
        {
          name: 'A normal hour',
          about: 'About 20 live notices a second. Every one reaches Oracle.',
          traffic: [live],
          durationMin: 30,
          expect: { delivered: [{ to: 'oracle-db', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'A replay while notices keep coming',
          about: 'The restart job queues 60 replays a second for half an hour. Live notices still go through as they come, and Oracle stays at 50 writes a second or less, leaving room for retries and other work.',
          traffic: [live, replay],
          durationMin: 60,
          expect: { delivered: [{ flow: 'live notices', to: 'oracle-db', min: 0.99 }], backlog: [{ queue: liveQ, maxPeak: 100 }], peakRps: [{ node: 'oracle-db', max: 50 }] },
        },
        {
          name: 'The whole replay goes through',
          about: 'Given time, every replayed notice is loaded, with none on a dead-letter queue.',
          traffic: [live, replay],
          durationMin: 240,
          expect: { delivered: [{ flow: 'replayed notices', to: 'oracle-db', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'Oracle maintenance',
          about: 'Oracle is down for 40 minutes. Notices wait on the queue and every one loads afterwards.',
          traffic: [live],
          incidents: [{ down: 'oracle-db', at: 5, forMin: 40 }],
          durationMin: 120,
          expect: { delivered: [{ to: 'oracle-db', min: 0.99 }], dlq: { max: 0 } },
        },
        {
          name: 'Lock timeouts in Oracle',
          about: 'A price job holds locks for 20 minutes, and one write in ten times out and works a moment later. Quick retries keep notices from waiting a minute on the queue.',
          traffic: [live],
          incidents: [{ errors: 'oracle-db', rate: 0.1, at: 0, forMin: 20 }],
          durationMin: 20,
          expect: { delivered: [{ to: 'system-api', min: 0.99 }], backlog: [{ queue: liveQ, maxPeak: 40 }], dlq: { max: 0 } },
        },
        {
          name: 'Month end bodies',
          about: 'Full catalogues take about 25 seconds to download for half an hour. Live notices still load.',
          traffic: [live],
          incidents: [{ slow: 'azure-blob', latencyMs: 25000, at: 0, forMin: 30 }],
          durationMin: 60,
          expect: { delivered: [{ to: 'oracle-db', min: 0.99 }], backlog: [{ queue: liveQ, maxPeak: 1000 }], dlq: { max: 0 } },
        },
        {
          name: 'A zone fails during the replay',
          about: 'An availability zone goes down for 15 minutes while live notices arrive. The replicas in the other zone keep loading them.',
          traffic: [live],
          incidents: [{ zone: true, at: 5, forMin: 15 }],
          durationMin: 60,
          expect: { delivered: [{ to: 'oracle-db', min: 0.99 }], backlog: [{ queue: liveQ, maxPeak: 1000 }], dlq: { max: 0 } },
        },
        {
          name: 'Replays that point nowhere',
          about: 'One replay in a hundred names a blob that was purged. It fails every time, ends on the replay dead-letter queue, and the replay queue empties.',
          traffic: [{ ...replay, rps: 5, poison: 0.01 }],
          durationMin: 150,
          expect: { dlq: { min: 1 }, backlog: [{ queue: replayQ, maxEnd: 10 }] },
        },
      ],
    },
  },
  description: `
Larkfield Grocers, a fictional grocery chain, runs a product data hub. Suppliers send item notices on a queue; the **items adapter** downloads each body from **Azure Blob Storage** and writes the items through a **merchandising System API** into **Oracle**. Messages that failed go to a failure table, and a **restart job** replays them after a fix.

At the last month end a bad code map failed **100,000** messages. The restart job put them all back on the adapter's queue at once. Live notices waited behind them for three hours, and stores opened with missing prices.

**Numbers**
- Live notices: about **20 a second**.
- The restart job can queue about **60 replays a second** for half an hour.
- Oracle takes about **60 writes a second** before lock waits pile up. The DBA team asks for **50 or less** from Mule, to leave room for retries and other work.
- A download takes about 400 ms; full catalogues at month end take about **25 seconds**, for up to half an hour.
- Oracle maintenance takes up to **40 minutes**. A price job holds locks for up to 20 minutes a day; then **1 write in 10** times out, each try on its own, and works when tried again. Fewer than **1 notice in 1,000** may go back to the queue for a lock timeout.
- Some replays name blobs that were purged after 30 days; they fail every time. They should reach a dead-letter queue within about two hours, and the replay queue should then empty.
- An availability zone can fail for 15 minutes, and live notices must keep loading while it is down.
- In this model one vCore serves about 500 requests a second, and an app with one replica stops when its zone fails. A queue consumer takes only what the boxes behind it have spare, nothing decides which of two consumers goes first, and a rate limit on a consumer caps what it takes. Calls time out after 10 seconds unless set otherwise, and a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- Why does a separate queue alone not protect the live notices? What setting does?
- How long does the replay take with your settings, and is that acceptable?
- Set the timeouts, retries, replicas, rate limit, redelivery limits and the restart job's size, and say on which box each goes.
`,
  answerTemplate: `## Design

## Protecting the live notices

## How long the replay takes

## Settings
`,
  keyPoints: [
    'Two queues stop replays from sitting in front of live notices, but both consumers still compete for Oracle. A rate limit on the replayer leaves Oracle room for the live lane.',
    'With the replayer held to 25 a second and live notices at 20, Oracle sees about 45 writes a second, under the 50 the DBA team asks for.',
    '100,000 replays at 25 a second take a little over an hour. That is fine at night; the restart job can be run with a higher limit when the shops are closed.',
    'A 25 second download needs a 60 second timeout on both consumers. Lock timeouts are retried in the System API: with 2 retries only 1 write in 1,000 fails all three tries. 40 minutes of maintenance needs more than 40 deliveries.',
    'The restart job queues 60 replays a second; a tenth of a vCore serves about 50, so it needs more. Two replicas of the adapter and the System API keep live notices loading through a zone outage.',
    'A replay of a purged blob can never load. It belongs on the replay DLQ, and the restart job should skip messages older than the blob retention.',
  ],
  solution: `
**Design**
\`\`\`
Supplier portal ~► pdh.items.notify ~► prc-items-adapter ─► Item blob store
                                       prc-items-adapter ─► sys-merch-oracle ─► Merchandising Oracle
pdh-restart ~► pdh.items.replay ~► prc-items-replayer ─► Item blob store
                                   prc-items-replayer ─► sys-merch-oracle
(each queue ~► its own DLQ)
\`\`\`

**Settings.** \`prc-items-adapter\`: 2 replicas, timeout 60 seconds. \`prc-items-replayer\`: rate limit 25 a second, timeout 60 seconds. \`sys-merch-oracle\`: 2 replicas, 2 retries for lock timeouts. Both queues: 60 deliveries. \`pdh-restart\`: 0.5 vCore, since one tenth of a vCore cannot queue 60 replays a second in this model.

**The same code.** The replayer can be the adapter's code deployed a second time with another queue name and its own limit, so a fix reaches both.
`,
  followUps: [
    {
      q: 'Could the restart job pace itself instead of a rate limit on the replayer?',
      a: 'It could put replays on the queue slowly, but then the queue no longer shows how much is left, and a restart of the job loses its place. Queue everything at once and let the consumer set the pace.',
    },
    {
      q: 'The replay and a live notice carry two versions of the same item. Which wins?',
      a: 'Whichever is written last, unless the write checks a version. Replays are older by nature, so the merchandising API should keep the item with the newer source time stamp.',
    },
  ],
}

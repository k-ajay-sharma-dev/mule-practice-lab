import { diagram } from '../../arch/dsl.js'

const transfers = { name: 'transfer requests', from: 'internal-app', rps: 20, to: 'sql-server', kind: 'write' }

export default {
  id: 'uc-182',
  category: 'use-cases',
  title: 'Store Transfer Requests Into a SQL Server Availability Group: a Queue That Rides Out a Failover, Retries for Lock Timeouts After It, and a Dead Letter Queue for Bad Requests',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'sql-server', 'always-on', 'failover', 'queues', 'dlq', 'retry'],
  estMinutes: 40,
  diagram: {
    task: 'draw the store app calling a store Experience API, which puts each transfer request on a queue with a dead-letter queue. A transfers Process API reads the queue and writes through a retail data System API to SQL Server. Every line into or out of the queue is async.',
    checks: [
      { label: 'Requests go from the store app through a queue to SQL Server', rule: { type: 'path', from: 'internal-app', via: 'queue', to: 'sql-server' } },
      { label: 'SQL Server is reached only through a System API', rule: { type: 'only-via', target: 'sql-server', from: 'system-api' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Every line into or out of the queue is async', rule: { type: 'lines', touching: 'queue', kind: 'async' } },
    ],
    reference: diagram(
      {
        app: ['internal-app', 'Store app'],
        exp: ['experience-api', 'exp-store-app'],
        q: ['queue', 'transfers.requested', { maxRedelivery: 15 }],
        dlq: ['dlq', 'transfers.requested.dlq'],
        prc: ['process-api', 'prc-transfers'],
        sys: ['system-api', 'sys-retail-data', { retries: 2 }],
        sql: ['sql-server', 'Retail SQL Server (AG listener)'],
      },
      ['app -> exp', 'exp ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sys', 'sys -> sql'],
    ),
    simulation: {
      systems: [{ match: 'sql-server', latencyMs: 40 }],
      tests: [
        {
          name: 'A normal day',
          about: 'About 20 requests a second. The store app gets its answer at once, and every request reaches SQL Server.',
          traffic: [transfers],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'sql-server', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'A failover',
          about: 'The primary fails and the availability group moves to the other node. For two minutes SQL Server does not answer. Requests wait on the queue and all arrive afterwards. The store app never sees an error.',
          traffic: [transfers],
          incidents: [{ down: 'sql-server', at: 5, forMin: 2 }],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'sql-server', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'Lock timeouts after the failover',
          about: 'For ten minutes after a failover one write in ten hits a lock timeout and works a moment later. Quick retries in the System API keep requests from piling up on the queue.',
          traffic: [transfers],
          incidents: [{ errors: 'sql-server', rate: 0.1, at: 0, forMin: 10 }],
          durationMin: 15,
          expect: { delivered: [{ to: 'system-api', min: 0.99 }], backlog: [{ queue: 'queue', maxPeak: 20 }], dlq: { max: 0 } },
        },
        {
          name: 'A transfer for a closed store',
          about: 'One request in two hundred names a store that has closed. Those go to the dead-letter queue, and the queue does not keep growing.',
          traffic: [{ ...transfers, poison: 0.005 }],
          durationMin: 120,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 150 }] },
        },
      ],
    },
  },
  description: `
Fenwick Sports, a fictional sports retailer, lets store staff request stock from other stores in the **store app**. Requests are stored in the retail **SQL Server**, which runs in an **Always On availability group** of two nodes. The app reaches it through the group's **listener**.

The first design wrote each request to SQL Server while the store app waited. During a failover the app showed errors for two minutes, and staff sent the same request again and again.

**Numbers**
- About **20 requests a second** in the day.
- A failover takes up to **2 minutes**. Afterwards, for about 10 minutes, **1 write in 10** can hit a lock timeout that works a moment later.
- About **1 request in 200** names a store that has closed. It will never load.
- In this model a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- How does the queue hide a failover from the store app?
- Where do you retry a lock timeout, and why there?
- Set the queue's redelivery limit. What does the System API's database config need for the listener?
`,
  answerTemplate: `## Design

## Failover

## Retries

## Settings and the listener
`,
  keyPoints: [
    'The Experience API only publishes and answers "received". SQL Server can be away for two minutes and the app does not know.',
    'Retry a lock timeout in the System API: it is short and works a moment later. A trip back to the queue costs a minute each time.',
    'With a retry about once a minute, a two minute failover needs a few deliveries. 15 leaves room; no limit lets a request for a closed store circle for ever.',
    'Connect to the listener name, not a node, with MultiSubnetFailover=True when the nodes are in different subnets, so the driver finds the new primary quickly.',
    'Give each request an ID from the app, so a request written right before the failover and delivered again is not stored twice.',
  ],
  solution: `
**Design**
\`\`\`
Store app ─► exp-store-app ~► transfers.requested ~► prc-transfers ─► sys-retail-data ─► Retail SQL Server (AG listener)
                                                ~► transfers.requested.dlq
\`\`\`

**Settings.** \`sys-retail-data\`: 2 retries. \`transfers.requested\`: 15 deliveries.

**The connection pool.** After a failover the pool holds connections to the old primary. A reconnection strategy on the Database config and a validation query (or the driver's own check) replace them.

**Answer to the app.** The app gets 202 with the request ID, and shows "requested". A status screen reads the request later.
`,
  followUps: [
    {
      q: 'Why not let the store app retry instead of using a queue?',
      a: 'Staff would see errors, and many apps retrying at once after a failover is a storm on a database that has only now come back. The queue lets requests in at the pace the database takes.',
    },
    {
      q: 'Could the transaction log be lost in a failover?',
      a: 'With synchronous commit on both nodes, a committed write is on both before the app is told. With asynchronous commit, the last few writes can be lost. Ask the DBA which mode the group uses.',
    },
  ],
}

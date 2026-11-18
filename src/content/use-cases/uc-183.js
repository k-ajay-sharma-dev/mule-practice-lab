import { diagram } from '../../arch/dsl.js'

const allocations = { name: 'allocations', from: 'batch-job', rps: 10, to: ['queue', 'wms'], kind: 'write' }

export default {
  id: 'uc-183',
  category: 'use-cases',
  title: 'Allocations Saved in SQL Server and Sent to the WMS: an Outbox Table So a Message Is Never Sent for a Rolled Back Save, a Relay Job, and a Queue That Waits Out WMS Maintenance',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'sql-server', 'outbox', 'queues', 'dlq', 'wms', 'maintenance-window'],
  estMinutes: 40,
  diagram: {
    task: 'draw an allocations Process API that saves each allocation, with an outbox row in the same transaction, through a retail data System API in front of SQL Server. A relay job reads new outbox rows through the same System API and publishes them to a queue with a dead-letter queue. A WMS Process API reads the queue and sends each allocation through a WMS System API to the WMS. The allocations Process API never publishes to the queue itself.',
    checks: [
      { label: 'SQL Server is reached only through a System API', rule: { type: 'only-via', target: 'sql-server', from: 'system-api' } },
      { label: 'A relay job reads the outbox and publishes to the queue', rule: { type: 'edge', from: 'batch-job', to: 'queue' } },
      { label: 'Allocations go from the relay through the queue to the WMS', rule: { type: 'path', from: 'batch-job', via: 'queue', to: 'wms' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'The WMS is reached only through a System API', rule: { type: 'only-via', target: 'wms', from: 'system-api' } },
      { label: 'Every line into or out of the queue is async', rule: { type: 'lines', touching: 'queue', kind: 'async' } },
    ],
    reference: diagram(
      {
        alloc: ['process-api', 'prc-allocations'],
        sysD: ['system-api', 'sys-retail-data'],
        sql: ['sql-server', 'Retail SQL Server (allocations + outbox)'],
        relay: ['batch-job', 'outbox-relay'],
        q: ['queue', 'wms.allocations', { maxRedelivery: 120 }],
        dlq: ['dlq', 'wms.allocations.dlq'],
        prc: ['process-api', 'prc-wms-allocations'],
        sysW: ['system-api', 'sys-wms'],
        wms: ['wms', 'Warehouse WMS'],
      },
      ['alloc -> sysD', 'sysD -> sql', 'relay -> sysD', 'relay ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sysW', 'sysW -> wms'],
    ),
    simulation: {
      systems: [
        { match: 'sql-server', latencyMs: 50 },
        { match: 'wms', latencyMs: 250 },
      ],
      tests: [
        {
          name: 'A normal day',
          about: 'About 10 allocations a second leave the outbox. Every one reaches the WMS.',
          traffic: [allocations],
          durationMin: 30,
          expect: { delivered: [{ to: 'wms', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'WMS maintenance',
          about: 'The WMS is down for an hour and a half on a Sunday. Allocations wait on the queue and all arrive afterwards. None lands on the dead-letter queue.',
          traffic: [allocations],
          incidents: [{ down: 'wms', at: 5, forMin: 90 }],
          durationMin: 180,
          expect: { delivered: [{ to: 'wms', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'An allocation for an unknown location',
          about: 'One allocation in two hundred names a pick location the WMS does not have. Those go to the dead-letter queue, and the queue does not keep growing.',
          traffic: [{ ...allocations, poison: 0.005 }],
          durationMin: 240,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 450 }] },
        },
      ],
    },
  },
  description: `
Marrow & Pine Home, a fictional homewares retailer, saves store allocations in the retail **SQL Server** and sends each one to the **WMS**.

The first design saved the allocation, then published a message. Twice the save rolled back after the message had gone, and the warehouse picked stock for an allocation that did not exist. Once the save worked and the publish failed, and the allocation was never picked.

**Numbers**
- About **10 allocations a second** in the day.
- The WMS is down for maintenance for up to **90 minutes** on a Sunday.
- About **1 allocation in 200** names a pick location the WMS does not have. It will never load.
- In this model a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- How does an outbox table fix both problems?
- How does the relay job pick up rows, and what happens if it runs twice at once?
- Set the queue's redelivery limit.
`,
  answerTemplate: `## Design

## The outbox

## The relay

## The redelivery limit
`,
  keyPoints: [
    'Save the allocation and its outbox row in one transaction. Both are saved, or neither is.',
    'The relay publishes rows that are committed, so a rolled back save never sends a message.',
    'Mark a row sent only after the publish works. A crash between the two sends it again, so the WMS side refuses a repeat by allocation ID.',
    'Run the relay on one node, or claim rows with UPDATE ... OUTPUT and READPAST, so two runs do not send the same rows.',
    'With a retry about once a minute, 90 minutes of maintenance needs more than 90 deliveries. 120 leaves room.',
  ],
  solution: `
**Design**
\`\`\`
prc-allocations ─► sys-retail-data ─► Retail SQL Server (allocations + outbox)
outbox-relay ─► sys-retail-data
outbox-relay ~► wms.allocations ~► prc-wms-allocations ─► sys-wms ─► WMS
                               ~► wms.allocations.dlq
\`\`\`

**The outbox.** A table with an ID, the allocation ID, the message, a status and a created time. The insert sits in the same transaction as the allocation.

**The relay.** Every few seconds it claims up to a few hundred NEW rows in created order, publishes them, and marks them SENT. Old SENT rows are purged weekly.

**Settings.** \`wms.allocations\`: 120 deliveries before the DLQ.
`,
  followUps: [
    {
      q: 'Why not use a distributed transaction across SQL Server and the broker?',
      a: 'Many brokers do not join one, and where they can it is slow and fragile. The outbox needs only a local transaction.',
    },
    {
      q: 'Could SQL Server change data capture replace the relay\'s polling?',
      a: 'It could feed changes to a reader, but it adds setup on the database. Ask the DBA. Polling a small indexed outbox is often enough at 10 a second.',
    },
  ],
}

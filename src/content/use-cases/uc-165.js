import { diagram } from '../../arch/dsl.js'

const plans = { name: 'plan files', from: 'batch-job', rps: 2, to: ['sql-server', 'wms'], kind: 'write' }

export default {
  id: 'uc-165',
  category: 'use-cases',
  title: 'Replenishment Plans From an Azure File Share to SQL Server and the WMS: a Collector, a Queue With a Dead Letter Queue, and a Limit That Outlasts WMS Maintenance',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'azure-file-share', 'queues', 'dlq', 'plans', 'sql-server', 'wms', 'planning'],
  estMinutes: 40,
  diagram: {
    task: 'draw the planning platform writing plan files to the Azure File Share. A plan collector job reads each file and puts a notification on a queue with a dead-letter queue. A plans Process API reads the queue and writes through two System APIs: one for SQL Server, one for the WMS.',
    checks: [
      { label: 'The planning platform writes plans to the Azure File Share', rule: { type: 'edge', from: 'saas', to: 'file-store' } },
      { label: 'A collector job reads the share', rule: { type: 'edge', from: 'batch-job', to: 'file-store' } },
      { label: 'Plans wait on a queue before they reach the WMS', rule: { type: 'path', from: 'batch-job', via: 'queue', to: 'wms' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'SQL Server is reached only through a System API', rule: { type: 'only-via', target: 'sql-server', from: 'system-api' } },
      { label: 'The WMS is reached only through a System API', rule: { type: 'only-via', target: 'wms', from: 'system-api' } },
    ],
    reference: diagram(
      {
        plat: ['saas', 'Planning platform'],
        share: ['file-store', 'Azure File Share plan-share'],
        job: ['batch-job', 'plan-collector'],
        q: ['queue', 'plans.ready', { maxRedelivery: 90 }],
        dlq: ['dlq', 'plans.ready.dlq'],
        prc: ['process-api', 'prc-plans'],
        sysS: ['system-api', 'sys-plans-sqlserver'],
        sql: ['sql-server', 'Ordering SQL Server'],
        sysW: ['system-api', 'sys-wms'],
        wms: ['wms', 'Warehouse WMS'],
      },
      ['plat -> share', 'job -> share', 'job ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sysS', 'sysS -> sql', 'prc -> sysW', 'sysW -> wms'],
    ),
    simulation: {
      systems: [
        { match: 'file-store', latencyMs: 300 },
        { match: 'sql-server', latencyMs: 80 },
        { match: 'wms', latencyMs: 200 },
      ],
      tests: [
        {
          name: 'A normal planning run',
          about: 'About two plan files a second for half an hour. Every plan reaches SQL Server and the WMS.',
          traffic: [plans],
          durationMin: 30,
          expect: { delivered: [{ to: 'sql-server', min: 0.99 }, { to: 'wms', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'WMS maintenance',
          about: 'The WMS is down for an hour. Plans wait on the queue and are all delivered afterwards. None lands on the dead-letter queue.',
          traffic: [plans],
          incidents: [{ down: 'wms', at: 5, forMin: 60 }],
          durationMin: 120,
          expect: { delivered: [{ to: 'wms', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'A plan file that can never load',
          about: 'One plan in a hundred names a location the WMS does not know. Those go to the dead-letter queue after their tries, so the queue does not keep growing.',
          traffic: [{ ...plans, poison: 0.01 }],
          durationMin: 180,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 150 }] },
        },
      ],
    },
  },
  description: `
Marrow & Pine Home, a fictional homewares retailer, gets replenishment plans back from the planning platform. The platform writes plan files to an **Azure File Share**. Each plan must reach two places: the ordering tables in **SQL Server**, and the **WMS**, which reserves stock for the orders.

The old job read a file and called both systems in one go. When the WMS was down for its monthly maintenance, the job failed, and plans were half applied: in SQL Server but not in the WMS.

**Numbers**
- About **2 plan files a second** for half an hour after each planning run.
- The WMS is down for maintenance for up to **an hour** a month.
- About **1 plan in 100** names a location the WMS does not know. It will never load.
- In this model a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- How does a queue keep a WMS outage from losing or half applying plans?
- Choose a redelivery limit, and say what goes wrong with 5 and with no limit.
- Who looks at the dead-letter queue, and what do they do?
`,
  answerTemplate: `## Design

## The queue

## The redelivery limit

## The dead-letter queue
`,
  keyPoints: [
    'The collector only reads files and publishes notifications. It no longer waits on the WMS, so an outage cannot stop it.',
    'The Process API writes SQL Server and the WMS for each plan. If the WMS fails, the message goes back to the queue and the whole plan is tried again later.',
    'With a retry about once a minute, an hour of maintenance needs more than 60 deliveries. 90 leaves room.',
    'A limit of 5 sends good plans to the DLQ during maintenance. No limit lets a plan that can never load circle for ever.',
    'Make both writes safe to repeat, keyed by plan and line, because a retry runs the SQL Server write again.',
  ],
  solution: `
**Design**
\`\`\`
Planning platform ─► Azure File Share plan-share ◄─ plan-collector ~► plans.ready ~► prc-plans ─► sys-plans-sqlserver ─► SQL Server
                                                                    ~► plans.ready.dlq      └─► sys-wms ─► WMS
\`\`\`

**Collector.** Reads each finished plan file from the share (mounted, or through REST), stores it where the Process API can read it, and publishes a small notification. Moves the file to processed after the publish.

**Limit.** 90 deliveries. An hour of maintenance uses about 60.

**Repeats.** The SQL Server write is an upsert by plan line, and the WMS call carries the plan line ID, so a redelivery after a half success does no harm.

**DLQ.** Support reviews it daily with the planners. A fixed location is added, and the message is moved back to \`plans.ready\`.
`,
  followUps: [
    {
      q: 'Why not two queues, one per target?',
      a: 'That also works and lets SQL Server move on while the WMS is down. It needs a way to see that both halves of a plan arrived. One consumer that writes both is clearer to follow; two queues are the next step if outages are long.',
    },
    {
      q: 'What goes in the notification?',
      a: 'The file name or a stored copy\'s name and a plan ID, not the plan itself. Files can be large, and the share or a blob keeps the content.',
    },
  ],
}

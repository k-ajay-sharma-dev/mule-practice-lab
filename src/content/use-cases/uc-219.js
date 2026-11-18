import { diagram } from '../../arch/dsl.js'

const changes = { name: 'item changes', from: 'batch-job', rps: 100, forMin: 15, to: ['wms', 'saas', 'data-warehouse'], kind: 'write' }

export default {
  id: 'uc-219',
  category: 'use-cases',
  title: 'A Nightly Item Batch With Three Consumers at Three Paces: Publish Each Change Once to a Topic, Let the Online Shop Drain at 25 a Second, Let the Warehouse System Be Slow and the Data Warehouse Be Down, and Lose Nothing',
  level: 'ADVANCED',
  tags: ['myproject', 'batch', 'topic', 'fan-out', 'dlq', 'timeout', 'sizing', 'wms'],
  estMinutes: 45,
  diagram: {
    task: 'draw the item batch job publishing each item change once to a topic with a dead-letter queue. Three Process APIs subscribe: one updates the WMS through a WMS System API, one updates the online shop platform, and one loads the data warehouse. The batch job never waits on any of them.',
    checks: [
      { label: 'The batch job publishes to a topic', rule: { type: 'edge', from: 'batch-job', to: 'topic', kind: 'async' } },
      { label: 'Each change reaches the WMS, the shop and the data warehouse through the topic', rule: { type: 'path', from: 'topic', to: ['wms', 'saas', 'data-warehouse'], min: 3 } },
      { label: 'The batch job never waits on the three systems', rule: { type: 'no-path', from: 'batch-job', to: ['wms', 'saas', 'data-warehouse'], kind: 'sync' } },
      { label: 'The WMS is reached only through a System API', rule: { type: 'only-via', target: 'wms', from: 'system-api' } },
      { label: 'The topic has a dead-letter queue', rule: { type: 'each', of: 'topic', edgeTo: 'dlq' } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'item-changes-batch', { vCores: '0.5' }],
        t: ['topic', 'item.changes', { maxRedelivery: 90 }],
        dlq: ['dlq', 'item.changes.dlq'],
        pW: ['process-api', 'prc-item-to-wms', { timeoutMs: 30000 }],
        sW: ['system-api', 'sys-wms', { timeoutMs: 30000 }],
        wms: ['wms', 'Warehouse system'],
        pE: ['process-api', 'prc-item-to-shop'],
        shop: ['saas', 'Online shop platform'],
        pD: ['process-api', 'prc-item-to-dw'],
        dw: ['data-warehouse', 'Data warehouse'],
      },
      ['job ~> t', 't ~> dlq', 't ~> pW', 't ~> pE', 't ~> pD', 'pW -> sW', 'sW -> wms', 'pE -> shop', 'pD -> dw'],
    ),
    simulation: {
      systems: [
        { match: 'wms', latencyMs: 200 },
        { match: 'saas', latencyMs: 300, maxRps: 25 },
        { match: 'data-warehouse', latencyMs: 100 },
      ],
      tests: [
        {
          name: 'The nightly item batch',
          about: 'The job publishes 100 changes a second for 15 minutes. The WMS and the warehouse keep up; the shop takes them at its own 25 a second. All three get every change.',
          traffic: [changes],
          durationMin: 120,
          expect: { delivered: [{ to: 'wms', min: 0.99 }, { to: 'saas', min: 0.99 }, { to: 'data-warehouse', min: 0.99 }], peakRps: [{ node: 'saas', max: 25 }], lost: { max: 0 } },
        },
        {
          name: 'The data warehouse is down for an hour',
          about: 'The warehouse is upgraded during the batch. The WMS and the shop carry on, the warehouse\'s copies wait, and all are loaded afterwards.',
          traffic: [changes],
          incidents: [{ down: 'data-warehouse', at: 5, forMin: 60 }],
          durationMin: 150,
          expect: { delivered: [{ to: 'wms', min: 0.99 }, { to: 'data-warehouse', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'A slow warehouse system',
          about: 'The WMS runs its own night jobs and each update takes about 15 seconds for 20 minutes. The updates still go through, and the WMS has every change within half an hour.',
          traffic: [changes],
          incidents: [{ slow: 'wms', latencyMs: 15000, at: 0, forMin: 20 }],
          durationMin: 30,
          expect: { delivered: [{ to: 'wms', min: 0.99 }], dlq: { max: 0 } },
        },
        {
          name: 'The broker restarts mid batch',
          about: 'The broker restarts while the shop\'s copies are still waiting. Not one change is lost.',
          traffic: [changes],
          incidents: [{ restart: 'topic', at: 20 }],
          durationMin: 120,
          expect: { lost: { max: 0 }, delivered: [{ to: 'saas', min: 0.99 }] },
        },
        {
          name: 'An item nobody can take',
          about: 'One change in a thousand has a broken unit of measure and every subscriber refuses it. Those copies end on the dead-letter queue.',
          traffic: [{ ...changes, poison: 0.001 }],
          durationMin: 180,
          expect: { dlq: { min: 10 }, lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
Fenwick Supply, a fictional builders' merchant, runs a nightly **item batch** that works out every changed item: about **90,000 changes** at 100 a second for 15 minutes. Three systems need each change:
- the **warehouse system (WMS)**, through a WMS System API;
- the **online shop platform**, which takes at most **25 updates a second**;
- the **data warehouse**.

Today the batch job calls all three for each item, one after another. The shop makes the whole job four times slower, and when the data warehouse is upgraded the job fails and nobody gets anything.

**Numbers**
- The job publishes about **100 changes a second** for 15 minutes.
- The shop takes **25 a second**. The WMS answers in 200 ms, but about **15 seconds** while its own night jobs run, for up to 20 minutes.
- The data warehouse is down for upgrades for up to **an hour**.
- The broker restarts now and then for patches.
- About **1 change in 1,000** has a broken unit of measure that every system refuses.
- In this model one vCore serves about 500 requests a second, calls time out after 10 seconds unless set otherwise, and a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- Why a topic and not three queues the job publishes to?
- How long does the shop take to get the whole batch, and is that a problem?
- Set the timeouts, the redelivery limit and the job's size, and say on which box each goes.
`,
  answerTemplate: `## Design

## A topic

## The slowest consumer

## Settings
`,
  keyPoints: [
    'The job publishes each change once. The topic gives each subscriber its own copy, and each takes it at its own pace.',
    'Three queues would work too, but the job would publish three times and need changing for a fourth system. With a topic, a new subscriber is a new subscription.',
    'At 25 a second the shop needs about an hour for 90,000 changes. That is fine overnight; the WMS and the warehouse are done long before.',
    'A 15 second WMS call needs timeouts above it on the WMS Process API and System API. An hour of warehouse upgrade needs more than 60 deliveries; 90 covers it.',
    'Publishing 100 a second needs more than the smallest job size; in this model a tenth of a vCore serves about 50.',
  ],
  solution: `
**Design**
\`\`\`
item-changes-batch ~► item.changes ~► prc-item-to-wms ─► sys-wms ─► Warehouse system
                      item.changes ~► prc-item-to-shop ─► Online shop platform
                      item.changes ~► prc-item-to-dw ─► Data warehouse
                      item.changes ~► item.changes.dlq
\`\`\`

**Settings.** \`item-changes-batch\`: 0.5 vCore. \`item.changes\`: 90 deliveries. \`prc-item-to-wms\` and \`sys-wms\`: timeout 30 seconds.

**Durable subscriptions.** Each subscriber needs a durable subscription (or a queue bound to the topic), so copies wait for it while it is down. A plain subscription would miss everything published while it was away.
`,
  followUps: [
    {
      q: 'The shop must have tonight\'s prices before 06:00. The batch ends at 02:00. Is there a risk?',
      a: 'At 25 a second it is done by about 03:00. If the batch grows to 400,000 changes, that becomes 07:00. Watch the shop subscription\'s backlog, and agree a higher limit or a bulk interface with the shop team before it does.',
    },
    {
      q: 'A parked change was refused by the WMS only. What should support do?',
      a: 'Fix the item and republish it to that subscriber\'s queue, not to the topic, or the shop and the warehouse get it twice.',
    },
  ],
}

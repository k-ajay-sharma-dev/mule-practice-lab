import { diagram } from '../../arch/dsl.js'

const online = { name: 'store orders', from: 'pos', rps: 150, to: 'oracle-db', kind: 'write' }
const bulk = { name: 'plan rows', from: 'batch-job', rps: 250, to: 'oracle-db', kind: 'write', forMin: 30 }

export default {
  id: 'uc-190',
  category: 'use-cases',
  title: 'A Nightly Plan Load Into the Same Oracle the Stores Order From: a Queue and a Sized Loader So 450,000 Rows Never Push the Store Orders Out',
  level: 'ADVANCED',
  tags: ['myproject', 'oracle', 'bulk-load', 'queues', 'sizing', 'capacity', 'planning'],
  estMinutes: 45,
  diagram: {
    task: 'draw the store tills calling an orders System API that writes to Oracle. Draw the plan load job reading the planning platform\'s file and putting row groups on a queue with a dead-letter queue. A loader Process API reads the queue and writes through its own Oracle System API. The plan load job never calls Oracle\'s System APIs directly.',
    checks: [
      { label: 'The tills write orders through a System API', rule: { type: 'path', from: 'pos', via: 'system-api', to: 'oracle-db' } },
      { label: 'Plan rows wait on a queue before they reach Oracle', rule: { type: 'path', from: 'batch-job', via: 'queue', to: 'oracle-db' } },
      { label: 'The plan load job never writes to Oracle without the queue', rule: { type: 'no-path', from: 'batch-job', to: 'oracle-db', kind: 'sync' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Oracle is reached only through System APIs', rule: { type: 'only-via', target: 'oracle-db', from: 'system-api' } },
    ],
    reference: diagram(
      {
        pos: ['pos', 'Store tills'],
        sysO: ['system-api', 'sys-store-orders', { vCores: '0.5' }],
        job: ['batch-job', 'plan-load-job', { vCores: '1' }],
        q: ['queue', 'plan.rows', { maxRedelivery: 30 }],
        dlq: ['dlq', 'plan.rows.dlq'],
        prc: ['process-api', 'prc-plan-loader', { vCores: '0.5' }],
        sysP: ['system-api', 'sys-plan-oracle', { vCores: '0.5' }],
        ora: ['oracle-db', 'Merchandising Oracle'],
      },
      ['pos -> sysO', 'sysO -> ora', 'job ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sysP', 'sysP -> ora'],
    ),
    simulation: {
      systems: [{ match: 'oracle-db', latencyMs: 20, maxRps: 400 }],
      tests: [
        {
          name: 'The plan load during late trading',
          about: 'The job reads 250 row groups a second for 30 minutes while the tills write 150 orders a second. Every order is answered, and every plan row is loaded within two hours.',
          traffic: [online, bulk],
          durationMin: 120,
          expect: {
            answers: [{ flow: 'store orders', minSuccess: 0.99 }],
            delivered: [{ flow: 'plan rows', to: 'oracle-db', min: 0.99 }],
            backlog: [{ queue: 'queue', maxEnd: 0 }],
            peakRps: [{ node: 'oracle-db', max: 400 }],
          },
        },
        {
          name: 'Oracle restarts mid load',
          about: 'Oracle is down for 15 minutes. Plan rows wait on the queue and are all loaded afterwards, with none on the dead-letter queue.',
          traffic: [{ ...online, rps: 50 }, bulk],
          incidents: [{ down: 'oracle-db', at: 10, forMin: 15 }],
          durationMin: 150,
          expect: { delivered: [{ flow: 'plan rows', to: 'oracle-db', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
Fenwick Supply, a fictional builders' merchant, loads the planning platform's replenishment plan into its merchandising **Oracle** database every evening: about **450,000 rows**, read from a file by a plan load job. The same Oracle takes **store orders** from the tills until 22:00.

Last month the job wrote straight to Oracle as fast as it could. Oracle reached its limit, and for half an hour store orders failed at the tills.

**Numbers**
- The job reads about **250 row groups a second** for 30 minutes (each group is one bulk insert).
- The tills write about **150 orders a second** in late trading.
- Oracle takes about **400 writes a second** in total before it slows.
- The plan must be loaded within **two hours**.
- In this model one vCore serves about 500 simple requests a second, the smallest API (0.1 vCore) about 50, and a failed delivery is tried again about once a minute. A queue consumer only takes what its own capacity and the boxes behind it have spare.

**Questions:**
- Draw the design.
- How does the queue protect the store orders?
- Size the loader so the plan is in within two hours, without taking Oracle from the tills.
- What happens to the load if Oracle restarts?
`,
  answerTemplate: `## Design

## Protecting the tills

## Sizing the loader

## Oracle restarts
`,
  keyPoints: [
    'Writing straight from the job puts 250 plus 150 writes a second on an Oracle that takes 400, with nothing to say who goes first.',
    'Through a queue, the loader only takes what Oracle has spare after the tills. The backlog waits on the queue, not in front of the tills.',
    'The loader must still be big enough to finish in time: 450,000 groups in two hours is about 63 a second on average, and it should catch up faster than that. The smallest API moves about 50.',
    'The job itself reads 250 groups a second, so it needs more than the smallest size too.',
    'A queue with a redelivery limit above the restart time rides out an Oracle restart. The loads must be safe to repeat (MERGE or a batch key) because a redelivery can follow a slow success.',
  ],
  solution: `
**Design**
\`\`\`
Store tills ─► sys-store-orders ─► Oracle
plan-load-job ~► plan.rows ~► prc-plan-loader ─► sys-plan-oracle ─► Oracle
                          ~► plan.rows.dlq
\`\`\`

**Settings.** \`plan-load-job\`: 1 vCore. \`prc-plan-loader\` and \`sys-plan-oracle\`: 0.5 vCore each, so the loader can use what Oracle has spare. \`sys-store-orders\`: 0.5 vCore for 150 orders a second. \`plan.rows\`: 30 deliveries.

**In the database.** Ask the DBA team for a resource plan too: Oracle Resource Manager can give the till sessions priority over the loader's sessions, which backs up the design inside Oracle.
`,
  followUps: [
    {
      q: 'Why not run the load after 22:00 instead?',
      a: 'If the plan file arrives in time, do. The queue still helps: the load cannot hurt the tills even when it runs late, and it rides out restarts.',
    },
    {
      q: 'How big should a row group be?',
      a: 'Big enough to make bulk inserts pay (a few hundred rows), small enough that a failed group is cheap to retry. Measure: 500 rows is a common start.',
    },
  ],
}

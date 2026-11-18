import { diagram } from '../../arch/dsl.js'

const lines = { name: 'plan lines', from: 'batch-job', rps: 15, to: ['file-store', 'sql-server'], kind: 'write' }

export default {
  id: 'uc-184',
  category: 'use-cases',
  title: 'Replenishment Plans Loaded Into SQL Server Through a Queue: Retries for Deadlocks, a Timeout That Outlasts the Weekly Index Rebuild, and a Redelivery Limit for Rows That Never Load',
  level: 'ADVANCED',
  tags: ['myproject', 'sql-server', 'plans', 'queues', 'dlq', 'deadlock', 'timeout', 'retry'],
  estMinutes: 45,
  diagram: {
    task: 'draw a plans collector job that reads plan files from the inbound file store and puts each plan line on a queue with a dead-letter queue. A plans loader Process API reads the queue and writes each line through a retail data System API to SQL Server.',
    checks: [
      { label: 'The collector reads the inbound file store', rule: { type: 'edge', from: 'batch-job', to: 'file-store' } },
      { label: 'Plan lines wait on a queue before they reach SQL Server', rule: { type: 'path', from: 'batch-job', via: 'queue', to: 'sql-server' } },
      { label: 'The collector never writes SQL Server and waits for it', rule: { type: 'no-path', from: 'batch-job', to: 'sql-server', kind: 'sync' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'SQL Server is reached only through a System API', rule: { type: 'only-via', target: 'sql-server', from: 'system-api' } },
    ],
    reference: diagram(
      {
        files: ['file-store', 'Inbound plan files'],
        job: ['batch-job', 'plans-collector'],
        q: ['queue', 'plan.lines', { maxRedelivery: 10 }],
        dlq: ['dlq', 'plan.lines.dlq'],
        prc: ['process-api', 'prc-plans-loader', { timeoutMs: 60000 }],
        sys: ['system-api', 'sys-retail-data', { timeoutMs: 60000, retries: 2 }],
        sql: ['sql-server', 'Retail SQL Server'],
      },
      ['job -> files', 'job ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sys', 'sys -> sql'],
    ),
    simulation: {
      systems: [
        { match: 'file-store', latencyMs: 200 },
        { match: 'sql-server', latencyMs: 80 },
      ],
      tests: [
        {
          name: 'A normal load',
          about: 'About 15 plan lines a second for half an hour. Every line reaches SQL Server.',
          traffic: [lines],
          durationMin: 30,
          expect: { delivered: [{ to: 'sql-server', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'Deadlocks with the stock update',
          about: 'The nightly stock update runs at the same time. For 20 minutes one write in ten is picked as a deadlock victim and works a moment later. Quick retries in the System API keep lines from waiting on the queue.',
          traffic: [lines],
          incidents: [{ errors: 'sql-server', rate: 0.1, at: 0, forMin: 20 }],
          durationMin: 20,
          expect: { delivered: [{ to: 'system-api', min: 0.99 }], backlog: [{ queue: 'queue', maxPeak: 20 }], dlq: { max: 0 } },
        },
        {
          name: 'The weekly index rebuild',
          about: 'On Sunday the index rebuild holds locks, and each write waits about 25 seconds for half an hour. Every line still loads.',
          traffic: [{ ...lines, rps: 2 }],
          incidents: [{ slow: 'sql-server', latencyMs: 25000, at: 0, forMin: 30 }],
          durationMin: 60,
          expect: { delivered: [{ to: 'sql-server', min: 0.99 }], dlq: { max: 0 } },
        },
        {
          name: 'A line for an item that is not set up',
          about: 'One line in a hundred names an item SQL Server does not have yet. A foreign key refuses it every time. Those go to the dead-letter queue after a few tries, and the queue does not keep growing.',
          traffic: [{ ...lines, poison: 0.01 }],
          durationMin: 120,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 150 }] },
        },
      ],
    },
  },
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, gets replenishment plans back from the planning platform as files. A collector reads them and each plan line must be written to the retail **SQL Server**.

The first loader wrote lines straight from the file, in one long transaction per file. Deadlocks with the nightly stock update failed whole files, and on Sundays the index rebuild made every write time out.

**Numbers**
- About **15 plan lines a second** for half an hour.
- While the stock update runs, about **1 write in 10** is picked as a **deadlock victim** (error 1205) and works when tried again.
- The weekly index rebuild makes each write wait about **25 seconds**, for up to half an hour. Plan files are smaller on Sunday, about 2 lines a second.
- About **1 line in 100** names an item that is not set up yet. It will not load until someone sets the item up.
- In this model calls time out after 10 seconds unless set otherwise, and a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- Where do you retry a deadlock, and which errors must you not retry?
- What timeouts does the rebuild need, and on which boxes?
- Set the queue's redelivery limit. Why can it be low here?
`,
  answerTemplate: `## Design

## Deadlocks

## The rebuild

## The redelivery limit
`,
  keyPoints: [
    'One line per transaction keeps each lock short, so deadlocks are rarer and a failure costs one line, not a file.',
    'Retry a deadlock victim (1205) and a lock timeout in the System API, a moment later. Do not retry a foreign key or constraint error: it fails every time.',
    'A 25 second write needs a timeout above it on the System API and on the Process API that calls it: 60 seconds on both.',
    'Nothing here waits for a long outage. A few deliveries cover a busy moment, so 10 is enough, and a line for a missing item reaches the DLQ in about ten minutes.',
    'Write each line with MERGE on plan run and line number, so a line delivered again is not stored twice.',
  ],
  solution: `
**Design**
\`\`\`
plans-collector ─► Inbound plan files
plans-collector ~► plan.lines ~► prc-plans-loader ─► sys-retail-data ─► Retail SQL Server
                             ~► plan.lines.dlq
\`\`\`

**Settings.** \`sys-retail-data\`: 60 second timeout, 2 retries. \`prc-plans-loader\`: 60 second timeout. \`plan.lines\`: 10 deliveries.

**Which errors to retry.** In the System API, an Until Successful or a retry loop around the write that only repeats when the SQL error number is 1205 (deadlock) or 1222 (lock timeout). Other errors go straight back to the caller.

**The DLQ.** A daily list goes to the item team. Once the item is set up, the lines are replayed.
`,
  followUps: [
    {
      q: 'Could you avoid the rebuild instead of waiting it out?',
      a: 'Ask the DBA. An online rebuild, where the edition allows it, holds fewer locks. Moving the rebuild away from the plan load window also helps.',
    },
    {
      q: 'Why not batch 1,000 lines per insert for speed?',
      a: 'It is faster, but one bad line fails the batch. A bulk insert with a row by row fallback gets most of the speed and still rejects only the bad line.',
    },
  ],
}

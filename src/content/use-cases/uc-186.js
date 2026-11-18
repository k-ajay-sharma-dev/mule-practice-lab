import { diagram } from '../../arch/dsl.js'

const primary = { type: 'sql-server', label: 'primary' }
const replica = { type: 'sql-server', label: 'replica' }
const outbound = { name: 'sales and stock out', from: { type: 'batch-job', label: 'outbound' }, rps: 1, to: [replica, 'sftp-server'], kind: 'write' }
const plans = { name: 'plans back', from: { type: 'batch-job', label: 'collector' }, rps: 5, to: ['sftp-server', primary], kind: 'write' }

export default {
  id: 'uc-186',
  category: 'use-cases',
  title: 'The Retail SQL Server Behind the Planning Integration: Heavy Reads on the Replica, Plans Written to the Primary Through a Queue, and Settings for Slow Queries, a Busy Replica, Deadlocks and Patching',
  level: 'EXPERT',
  tags: ['myproject', 'sql-server', 'always-on', 'read-replica', 'planning', 'queues', 'dlq', 'deadlock', 'timeout', 'retry'],
  estMinutes: 60,
  diagram: {
    task: 'draw the store tills writing to the primary SQL Server. An outbound job reads sales and stock through a retail read System API in front of the read replica, and writes files to the planning platform\'s FTP server. A plans collector job reads plan files from the FTP server and puts each line on a queue with a dead-letter queue. A plans Process API reads the queue and writes each line through a retail data System API to the primary. The jobs never call SQL Server themselves.',
    checks: [
      { label: 'The tills write to the primary', rule: { type: 'edge', from: 'pos', to: primary } },
      { label: 'SQL Server is reached by the integration only through System APIs', rule: { type: 'only-via', target: 'sql-server', from: ['system-api', 'pos'] } },
      { label: 'The outbound job reads the replica', rule: { type: 'path', from: { type: 'batch-job', label: 'outbound' }, to: replica } },
      { label: 'The outbound job never reads the primary', rule: { type: 'no-path', from: { type: 'batch-job', label: 'outbound' }, to: primary } },
      { label: 'Plan lines wait on a queue before they reach the primary', rule: { type: 'path', from: { type: 'batch-job', label: 'collector' }, via: 'queue', to: primary } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Both jobs use the planning platform\'s FTP server', rule: { type: 'edge', from: 'batch-job', to: 'sftp-server', min: 2 } },
    ],
    reference: diagram(
      {
        pos: ['pos', 'Store tills'],
        prim: ['sql-server', 'Retail SQL Server primary'],
        rep: ['sql-server', 'Retail SQL Server read replica'],
        out: ['batch-job', 'planning-outbound', { timeoutMs: 60000 }],
        sysR: ['system-api', 'sys-retail-read', { timeoutMs: 30000, retries: 2 }],
        ftp: ['sftp-server', 'Planning platform FTP'],
        col: ['batch-job', 'plans-collector'],
        q: ['queue', 'plan.lines', { maxRedelivery: 70 }],
        dlq: ['dlq', 'plan.lines.dlq'],
        prc: ['process-api', 'prc-plans'],
        sysD: ['system-api', 'sys-retail-data', { retries: 2 }],
      },
      ['pos -> prim', 'out -> sysR', 'sysR -> rep', 'out -> ftp', 'col -> ftp', 'col ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sysD', 'sysD -> prim'],
    ),
    simulation: {
      systems: [
        { match: replica, latencyMs: 12000 },
        { match: primary, latencyMs: 60 },
        { match: 'sftp-server', latencyMs: 1500 },
      ],
      tests: [
        {
          name: 'A normal night',
          about: 'Each store\'s sales query takes about 12 seconds on the replica. Every file goes out, and every plan line reaches the primary.',
          traffic: [outbound, plans],
          durationMin: 30,
          expect: {
            answers: [{ flow: 'sales and stock out', minSuccess: 0.99 }],
            delivered: [{ flow: 'plans back', to: primary, min: 0.99 }],
            lost: { max: 0 },
          },
        },
        {
          name: 'The replica is catching up',
          about: 'After a big load the replica is busy redoing it. For 20 minutes one query in ten fails and works when tried again. Every file still goes out.',
          traffic: [outbound],
          incidents: [{ errors: replica, rate: 0.1, at: 0, forMin: 20 }],
          durationMin: 20,
          expect: { answers: [{ flow: 'sales and stock out', minSuccess: 0.99 }] },
        },
        {
          name: 'Deadlocks on the primary',
          about: 'The nightly stock update runs at the same time as the plan load. For 20 minutes one write in ten is a deadlock victim. Quick retries keep plan lines from waiting on the queue.',
          traffic: [plans],
          incidents: [{ errors: primary, rate: 0.1, at: 0, forMin: 20 }],
          durationMin: 20,
          expect: { delivered: [{ flow: 'plans back', to: { type: 'system-api', label: 'retail-data' }, min: 0.99 }], backlog: [{ queue: 'queue', maxPeak: 20 }], dlq: { max: 0 } },
        },
        {
          name: 'Patching the primary',
          about: 'The primary is patched and fails over twice, and writes are refused for 50 minutes in all. Plan lines wait on the queue and all arrive afterwards. None lands on the dead-letter queue.',
          traffic: [plans],
          incidents: [{ down: primary, at: 5, forMin: 50 }],
          durationMin: 120,
          expect: { delivered: [{ flow: 'plans back', to: primary, min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'A plan line for an item that is not set up',
          about: 'One line in a hundred names an item the database does not have. Those end on the dead-letter queue, and the queue does not keep growing.',
          traffic: [{ ...plans, poison: 0.01 }],
          durationMin: 180,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 300 }] },
        },
      ],
    },
  },
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, keeps sales, stock and plans in one retail **SQL Server**, in an **Always On availability group** with a readable secondary. The store tills write to the primary all night, because some stores trade late.

Each night the integration sends sales and stock to the planning platform as files on **its FTP server**, and loads the replenishment plans that come back. You are asked to design the SQL Server side of it.

**Numbers**
- About **1 outbound file a second** for half an hour. Each store's sales query takes about **12 seconds** on the replica.
- About **5 plan lines a second** come back.
- After a big load the replica can be busy: about **1 query in 10** fails for up to 20 minutes.
- The nightly stock update and the plan load overlap. About **1 write in 10** is a deadlock victim for up to 20 minutes.
- Monthly patching fails the primary over twice. Writes are refused for up to **50 minutes** in all.
- About **1 plan line in 100** names an item that is not set up yet.
- In this model calls time out after 10 seconds unless set otherwise, and a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- Which reads go to the replica, which writes go to the primary, and how does each connection get there?
- Set every timeout, retry and redelivery limit, and give the reason for each number.
- How do you make the plan load safe to run twice?
- What does support check each morning?
`,
  answerTemplate: `## Design

## Replica and primary

## Settings

## Safe to run twice

## Morning checks
`,
  keyPoints: [
    'Heavy reads go to the replica through the listener with ApplicationIntent=ReadOnly. Writes go to the primary through the listener. The tills keep the primary to themselves.',
    'A 12 second query needs timeouts above it: 30 seconds on the read API, and more on the job that waits for it, 60 seconds.',
    'A busy replica and a deadlock are short and partial: 2 retries in each System API. Retry only deadlock and lock timeout errors, not data errors.',
    'With a retry about once a minute, 50 minutes of patching needs more than 50 deliveries. 70 leaves room; no limit lets a line for a missing item circle for ever.',
    'Write plan lines with MERGE on plan run and line number, so a repeat changes nothing. Keep a job log row for each file and each plan run.',
  ],
  solution: `
**Design**
\`\`\`
Store tills ─► Retail SQL Server primary
planning-outbound ─► sys-retail-read ─► Retail SQL Server read replica
planning-outbound ─► Planning platform FTP ◄─ plans-collector
plans-collector ~► plan.lines ~► prc-plans ─► sys-retail-data ─► Retail SQL Server primary
                             ~► plan.lines.dlq
\`\`\`

**Settings.** \`sys-retail-read\`: 30 second timeout, 2 retries. \`planning-outbound\`: 60 second timeout. \`sys-retail-data\`: 2 retries. \`plan.lines\`: 70 deliveries.

**Connections.** Both System APIs use the listener name and \`MultiSubnetFailover=True\` when the nodes span subnets. The read API adds \`ApplicationIntent=ReadOnly\`. Each config has a reconnection strategy, so the pool drops connections to the old primary after a failover.

**Morning checks.** The job log for every outbound file and every plan run, the queue depth and DLQ, and the reject table for lines that loaded with warnings.
`,
  followUps: [
    {
      q: 'The replica is down for patching on the same night. What happens to the outbound job?',
      a: 'With read only routing, the connection may fall back to the primary, and the tills slow down. Ask the DBA how routing is set. The job can check which node it reached and stop with an alert instead.',
    },
    {
      q: 'The planning team wants plans in SQL Server within five minutes of the file landing. Does this design allow it?',
      a: 'On a normal night, yes: 5 lines a second clears as they come. During patching, no: lines wait until the primary is back. Tell them that, and show the queue depth on their dashboard.',
    },
  ],
}

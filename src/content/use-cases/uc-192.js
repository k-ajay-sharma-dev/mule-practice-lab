import { diagram } from '../../arch/dsl.js'

const inbound = { name: 'inbound documents', from: 'saas', rps: 10, to: ['azure-blob', 'oracle-db'], kind: 'write' }
const outbound = { name: 'outbound files', from: { type: 'batch-job', label: 'outbound' }, rps: 2, to: ['oracle-db', 'azure-blob'], kind: 'write' }
const reports = { name: 'email reports', from: { type: 'batch-job', label: 'report' }, rps: 0.2, to: ['oracle-db', 'notification'] }

export default {
  id: 'uc-192',
  category: 'use-cases',
  title: 'The Whole Planning Integration on Oracle: Inbound by Claim Check, Outbound Jobs, a Report Job That Emails, and Settings for Patching, Slow Blob Storage, a Zone Outage and Poison Documents',
  level: 'EXPERT',
  tags: ['myproject', 'oracle', 'claim-check', 'azure-blob', 'jms', 'email', 'outbound', 'reports', 'dlq', 'replicas', 'timeout'],
  estMinutes: 60,
  diagram: {
    task: 'draw the planning platform storing documents in Azure Blob Storage and putting notifications on an inbound queue with a dead-letter queue. An inbound adapter (a Process API) reads the queue, reads the blob through a blob System API, and loads Oracle through an Oracle System API. Draw an outbound job that has Oracle generate messages through the Oracle System API and writes them to blob storage through the blob System API. Draw a report job that reads the Oracle System API and sends email through the mail relay.',
    checks: [
      { label: 'The platform stores documents in blob storage', rule: { type: 'edge', from: 'saas', to: 'azure-blob' } },
      { label: 'The platform notifies a queue', rule: { type: 'edge', from: 'saas', to: 'queue' } },
      { label: 'Inbound documents wait on a queue before they reach Oracle', rule: { type: 'path', from: 'saas', via: 'queue', to: 'oracle-db' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Oracle is reached only through a System API', rule: { type: 'only-via', target: 'oracle-db', from: 'system-api' } },
      { label: 'The outbound job writes files through the blob System API', rule: { type: 'path', from: { type: 'batch-job', label: 'outbound' }, via: 'system-api', to: 'azure-blob' } },
      { label: 'Only the report job sends email', rule: { type: 'only-via', target: 'notification', from: { type: 'batch-job', label: 'report' } } },
    ],
    reference: diagram(
      {
        plat: ['saas', 'Planning platform'],
        blob: ['azure-blob', 'Integration blob container'],
        q: ['queue', 'INBOUND.NOTIFY', { maxRedelivery: 90 }],
        dlq: ['dlq', 'INBOUND.FAILED'],
        inb: ['process-api', 'inbound-adapter', { replicas: 2 }],
        sysB: ['system-api', 'sys-blob', { replicas: 2, timeoutMs: 20000 }],
        sysO: ['system-api', 'sys-oracle', { replicas: 2 }],
        ora: ['oracle-db', 'Merchandising Oracle'],
        out: ['batch-job', 'outbound job', { replicas: 2, timeoutMs: 30000 }],
        rep: ['batch-job', 'report job'],
        mail: ['notification', 'Mail relay'],
      },
      ['plat -> blob', 'plat ~> q', 'q ~> inb', 'q ~> dlq', 'inb -> sysB', 'sysB -> blob', 'inb -> sysO', 'sysO -> ora', 'out -> sysO', 'out -> sysB', 'rep -> sysO', 'rep -> mail'],
    ),
    simulation: {
      systems: [
        { match: 'azure-blob', latencyMs: 150 },
        { match: 'oracle-db', latencyMs: 80, maxRps: 200 },
        { match: 'notification', latencyMs: 300 },
      ],
      tests: [
        {
          name: 'A normal day',
          about: 'Documents come in, outbound files go out, and reports are emailed. Everything arrives and nothing is lost.',
          traffic: [inbound, outbound, reports],
          durationMin: 30,
          expect: {
            delivered: [{ flow: 'inbound documents', to: 'oracle-db', min: 0.99 }],
            answers: [{ flow: 'outbound files', minSuccess: 0.99 }, { flow: 'email reports', minSuccess: 0.99 }],
            lost: { max: 0 },
          },
        },
        {
          name: 'Oracle patching',
          about: 'Oracle is down for an hour. Inbound notifications wait and are all loaded afterwards, with none on the dead-letter queue.',
          traffic: [{ ...inbound, rps: 3 }],
          incidents: [{ down: 'oracle-db', at: 5, forMin: 60 }],
          durationMin: 120,
          expect: { delivered: [{ flow: 'inbound documents', to: 'oracle-db', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'Blob storage is slow',
          about: 'For 20 minutes each blob call takes about 12 seconds. Outbound files still finish, because the timeouts allow for it.',
          traffic: [outbound],
          incidents: [{ slow: 'azure-blob', latencyMs: 12000, at: 0, forMin: 20 }],
          durationMin: 20,
          expect: { answers: [{ flow: 'outbound files', minSuccess: 0.99 }] },
        },
        {
          name: 'A zone goes down',
          about: 'One availability zone fails for 20 minutes during the outbound run. The jobs and APIs keep a replica in the other zone, so the outbound files carry on.',
          traffic: [outbound, inbound],
          incidents: [{ zone: true, at: 5, forMin: 20 }],
          durationMin: 40,
          expect: { answers: [{ flow: 'outbound files', minSuccess: 0.99 }], delivered: [{ flow: 'inbound documents', to: 'oracle-db', min: 0.99 }] },
        },
        {
          name: 'Documents that can never load',
          about: 'One document in 200 is broken. Those reach the dead-letter queue for the restart app, and the queue does not keep growing.',
          traffic: [{ ...inbound, poison: 0.005 }],
          durationMin: 180,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 400 }] },
        },
      ],
    },
  },
  description: `
Fenwick Supply, a fictional builders' merchant, is replacing its planning integration. You are asked to present the whole design.

- **Inbound.** The planning platform sends master data and plans. It stores each document in **Azure Blob Storage** and puts a small notification on a **JMS queue** (a claim check). An inbound adapter loads each document into the merchandising **Oracle** database, with a failure queue that a restart app replays from.
- **Outbound.** A scheduled outbound job asks Oracle to generate messages (a PL/SQL procedure) and writes them as files to blob storage for the platform.
- **Reports.** A report job reads Oracle's job log tables each morning and emails each team through the company **mail relay**.

**Numbers and events**
- About **10 inbound documents a second**; the outbound job writes about **2 files a second**; reports are a handful a minute.
- Oracle answers in about 80 ms and takes about 200 calls a second. It is patched for up to **an hour** a month.
- Blob storage sometimes slows to about **12 seconds** a call for 20 minutes.
- One availability zone failed for 20 minutes last year.
- About **1 document in 200** is broken and can never load.
- In this model calls time out after 10 seconds unless set otherwise, one zone going down takes away the replicas in it, and a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- Walk through what happens to an inbound document, from the platform to Oracle, and where it waits when something is down.
- Set the redelivery limit, the timeouts and the replicas, and explain each.
- Why does only the report job talk to the mail relay, and what happens to the loads when the relay is down?
- What does the restart app do with the failure queue?
`,
  answerTemplate: `## Design

## An inbound document, end to end

## Settings

## Email

## The failure queue
`,
  keyPoints: [
    'The claim check keeps large documents out of the broker; the queue carries a pointer, and a replay only needs that pointer.',
    'Inbound waits on the queue when Oracle is away. 90 deliveries outlast an hour of patching at about one try a minute.',
    'Timeouts nest along a call chain: the blob System API waits longer than blob storage takes, and the outbound job longer than the System API.',
    'Two replicas of the jobs and APIs, spread over zones, keep the outbound run and the loads going when a zone fails.',
    'Reports read the job log tables and email; loads never wait on the relay. A relay outage delays reports only.',
    'The failure queue holds what could not load after its tries. The restart app checks Oracle and blob storage are healthy, then republishes those notifications to the inbound queue.',
  ],
  solution: `
**Design**
\`\`\`
Planning platform ─► Integration blob container ◄─ sys-blob ◄─ inbound-adapter ─► sys-oracle ─► Oracle
                 ~► INBOUND.NOTIFY ~► inbound-adapter                ▲         ▲
                                  ~► INBOUND.FAILED     outbound job ─┴─────────┘
report job ─► sys-oracle,  report job ─► Mail relay
\`\`\`

**Settings.** \`INBOUND.NOTIFY\`: 90 deliveries. \`sys-blob\`: timeout 20 s, 2 replicas. \`outbound job\`: timeout 30 s, 2 replicas. \`inbound-adapter\` and \`sys-oracle\`: 2 replicas.

**Inside the inbound adapter** (from the flow problems): duplicate check on the message ID, RECEIVED ACK, code maps, rejects table, staging with MERGE, job log rows, final ACK. The architecture keeps each of those safe to repeat, because redelivery is how the design survives outages.
`,
  followUps: [
    {
      q: 'Where would you add a queue in front of the report emails?',
      a: 'When reports become many, or must not be lost: the report job puts each report on a queue and a mailer sends it with retries. For a few morning emails, a direct send with a retry is enough.',
    },
    {
      q: 'How do you know the outbound job did not run?',
      a: 'It writes a job log row at the start and the end. The report job, or monitoring, alerts on a missing COMPLETED row by a set time.',
    },
  ],
}

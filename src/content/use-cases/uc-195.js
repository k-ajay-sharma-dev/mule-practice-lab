import { diagram } from '../../arch/dsl.js'

const loads = { name: 'inbound loads', from: 'saas', rps: 8, to: 'oracle-db', kind: 'write' }
const reports = { name: 'job reports', from: 'saas', rps: 8, to: 'notification', kind: 'write' }

export default {
  id: 'uc-195',
  category: 'use-cases',
  title: 'Job Reports by Email From the Inbound Adapter: Publish an Event per Job, Let a Report Service Email It, and Keep Loads Running Through a Mail Relay Outage',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'email', 'smtp', 'oracle', 'job-log', 'queues', 'dlq', 'reports'],
  estMinutes: 35,
  diagram: {
    task: 'draw the planning platform putting notifications on an inbound queue with a dead-letter queue. The inbound adapter (a Process API) reads it and loads Oracle through an Oracle System API. When a job ends, the adapter publishes a job event to a reports queue with its own dead-letter queue. A report service (a Process API) reads that queue and sends the email through the mail relay.',
    checks: [
      { label: 'Loads wait on a queue before Oracle', rule: { type: 'path', from: 'saas', via: 'queue', to: 'oracle-db' } },
      { label: 'Oracle is reached only through a System API', rule: { type: 'only-via', target: 'oracle-db', from: 'system-api' } },
      { label: 'The inbound adapter never waits on the mail relay', rule: { type: 'no-path', from: { type: 'process-api', label: 'inbound' }, to: 'notification', kind: 'sync' } },
      { label: 'Only the report service sends email', rule: { type: 'only-via', target: 'notification', from: { type: 'process-api', label: 'report' } } },
      { label: 'Every queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
    ],
    reference: diagram(
      {
        plat: ['saas', 'Planning platform'],
        qIn: ['queue', 'INBOUND.NOTIFY', { maxRedelivery: 60 }],
        dIn: ['dlq', 'INBOUND.FAILED'],
        inb: ['process-api', 'inbound-adapter'],
        sys: ['system-api', 'sys-oracle'],
        ora: ['oracle-db', 'Merchandising Oracle'],
        qRep: ['queue', 'JOB.REPORTS', { maxRedelivery: 90 }],
        dRep: ['dlq', 'JOB.REPORTS.DLQ'],
        rep: ['process-api', 'report-service'],
        mail: ['notification', 'Mail relay'],
      },
      ['plat ~> qIn', 'qIn ~> inb', 'qIn ~> dIn', 'inb -> sys', 'sys -> ora', 'inb ~> qRep', 'qRep ~> rep', 'qRep ~> dRep', 'rep -> mail'],
    ),
    simulation: {
      systems: [
        { match: 'oracle-db', latencyMs: 80 },
        { match: 'notification', latencyMs: 400 },
      ],
      tests: [
        {
          name: 'A normal day',
          about: 'Every document is loaded and every job report is emailed.',
          traffic: [loads, reports],
          durationMin: 30,
          expect: { delivered: [{ flow: 'inbound loads', to: 'oracle-db', min: 0.99 }, { flow: 'job reports', to: 'notification', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'The mail relay is down for an hour',
          about: 'Loads carry on as normal. Reports wait on their queue and all go out afterwards, with none on a dead-letter queue.',
          traffic: [loads, reports],
          incidents: [{ down: 'notification', at: 5, forMin: 60 }],
          durationMin: 120,
          expect: { delivered: [{ flow: 'inbound loads', to: 'oracle-db', min: 0.99 }, { flow: 'job reports', to: 'notification', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'Documents that can never load',
          about: 'One document in 200 is broken. It ends on INBOUND.FAILED for the restart app, and the inbound queue does not keep growing.',
          traffic: [{ ...loads, poison: 0.005 }],
          durationMin: 180,
          expect: { dlq: { min: 1 }, backlog: [{ queue: { type: 'queue', label: 'INBOUND' }, maxEnd: 300 }] },
        },
      ],
    },
  },
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, runs an inbound adapter that loads documents from the planning platform into the merchandising **Oracle** database. After each job the business wants an email: how many lines loaded, how many were rejected.

The first version sent the email at the end of each job, in the adapter. When the **mail relay** was down for an hour of maintenance, every job failed at its last step, the notifications went round the queue, and documents were loaded again and again.

**Numbers**
- About **8 documents a second**, each one job with one report.
- The mail relay is down for maintenance for up to **an hour**.
- About **1 document in 200** is broken and can never load.
- In this model a failed delivery is tried again about once a minute, and a limit of 0 means no limit.

**Questions:**
- Draw the design.
- Why should a report never be able to fail a load?
- Set the redelivery limits of both queues, and explain why they differ.
- What goes in a job event?
`,
  answerTemplate: `## Design

## Loads and reports apart

## Redelivery limits

## The job event
`,
  keyPoints: [
    'The load is the job; the email is a report about it. Publishing a job event and ending the job means a relay outage can delay reports but never fail or repeat a load.',
    'A report service owns templates, recipients and the relay settings, for every adapter.',
    'The reports queue must outlast an hour of relay maintenance: 90 deliveries. The inbound queue limit is about Oracle and broken documents, and is set on its own.',
    'The job event carries the job ID, the message type and the counts. The report service reads anything else from the job log tables, so the event stays small and holds no row data.',
    'An Async scope in the adapter would also stop the failure, but a restart during the outage would lose the report. The queue keeps it.',
  ],
  solution: `
**Design**
\`\`\`
Planning platform ~► INBOUND.NOTIFY ~► inbound-adapter ─► sys-oracle ─► Oracle
                                 ~► INBOUND.FAILED        ~► JOB.REPORTS ~► report-service ─► Mail relay
                                                                         ~► JOB.REPORTS.DLQ
\`\`\`

**Settings.** \`INBOUND.NOTIFY\`: 60 deliveries. \`JOB.REPORTS\`: 90 deliveries.
`,
  followUps: [
    {
      q: 'The business asks for one daily summary instead of an email per job. What changes?',
      a: 'The report service stops sending per event and a morning job reads the job log tables and sends one summary per team. The events can still feed a live dashboard.',
    },
    {
      q: 'How would you notice that reports are stuck?',
      a: 'Alert on the age of the oldest message on JOB.REPORTS. Ten minutes old in working hours means the relay or the service needs a look.',
    },
  ],
}

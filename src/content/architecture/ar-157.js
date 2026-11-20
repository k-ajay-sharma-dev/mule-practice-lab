import { diagram } from '../../arch/dsl.js'

const sales = { name: 'sales team', from: 'internal-app', rps: 60, to: 'crm' }
const importRun = { name: 'contact import', from: 'batch-job', rps: 150, to: 'crm', kind: 'write', forMin: 15 }

export default {
  id: 'ar-157',
  category: 'architecture',
  title: 'A Marketing Import and the Sales Team Share One CRM Limit: a Queue and a Consumer That Only Use the Room Left',
  level: 'ADVANCED',
  tags: ['myproject', 'load-levelling', 'queue', 'crm', 'rate-limits', 'batch', 'dlq', 'b2b'],
  estMinutes: 40,
  diagram: {
    task: 'draw the sales app calling the CRM through an Experience API and the CRM System API. Draw the marketing import job putting contacts on a queue with a dead-letter queue, and an import Process API taking them from the queue and writing them through the same CRM System API.',
    checks: [
      { label: 'The sales app calls its own Experience API', rule: { type: 'edge', from: 'internal-app', to: 'experience-api' } },
      { label: 'Imported contacts wait on a queue before they reach the CRM', rule: { type: 'path', from: 'batch-job', via: 'queue', to: 'crm' } },
      { label: 'The import job never calls the CRM while it reads the file', rule: { type: 'no-path', from: 'batch-job', to: 'crm', kind: 'sync' } },
      { label: 'The CRM is reached only through a System API', rule: { type: 'only-via', target: 'crm', from: 'system-api' } },
      { label: 'One CRM System API serves both the sales path and the import', rule: { type: 'each', of: 'system-api', edgeFrom: ['experience-api', 'process-api'], count: 2, some: true } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Every line to or from a queue is an async message', rule: { type: 'lines', touching: ['queue', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        app: ['internal-app', 'Sales app'],
        exp: ['experience-api', 'exp-sales-app', { vCores: '0.2' }],
        job: ['batch-job', 'Marketing contact import', { vCores: '0.5' }],
        q: ['queue', 'contact-imports', { maxRedelivery: 30 }],
        dlq: ['dlq', 'contact-imports DLQ'],
        prc: ['process-api', 'prc-contact-import', { vCores: '0.5' }],
        sys: ['system-api', 'sys-crm', { vCores: '0.5' }],
        crm: ['crm', 'CRM'],
      },
      ['app -> exp', 'exp -> sys', 'job ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sys', 'sys -> crm'],
    ),
    simulation: {
      systems: [{ match: 'crm', latencyMs: 120, maxRps: 120 }],
      tests: [
        {
          name: 'An import at 10:00',
          about: 'Marketing loads a list of 135,000 contacts while the sales team works. Sales calls stay fast, the CRM never gets more than it takes, and every contact is in by the end.',
          traffic: [sales, importRun],
          durationMin: 75,
          expect: {
            answers: [{ flow: 'sales team', minSuccess: 0.99, maxMs: 400 }],
            delivered: [{ flow: 'contact import', to: 'crm', min: 0.99 }],
            peakRps: [{ node: 'crm', max: 120 }],
            backlog: [{ queue: 'queue', maxEnd: 0 }],
          },
        },
        {
          name: 'The CRM has a 10 minute outage',
          about: 'The CRM is down during the import. Sales calls fail while it is down, but the contacts wait on the queue and all of them are written after.',
          traffic: [sales, importRun],
          incidents: [{ down: 'crm', at: 5, forMin: 10 }],
          durationMin: 90,
          expect: { delivered: [{ flow: 'contact import', to: 'crm', min: 0.99 }], lost: { max: 0 }, dlq: { max: 0 } },
        },
        {
          name: 'Rows the CRM refuses',
          about: 'One row in 200 has an email address the CRM refuses every time. Those rows move to the dead-letter queue and the rest of the list loads.',
          traffic: [{ ...importRun, rps: 50, poison: 0.005 }],
          durationMin: 60,
          expect: { delivered: [{ to: 'crm', min: 0.99 }], dlq: { min: 100 }, lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
A business software reseller keeps its customers and leads in a **CRM**. The sales team works in a **sales app** that calls the CRM through Mule all day.

Marketing buys and cleans **contact lists** and loads them with a **marketing contact import** job. Last month the job wrote 150 contacts a second straight into the CRM at 10:00. The CRM's API limit for the company is about **120 calls a second**, so it started refusing calls, and for half an hour the sales team could not open an account.

Marketing will not move the import to the night, because campaigns start the same morning.

**Numbers**
- The sales team makes about **60 calls a second** in office hours.
- The import reads **150 contacts a second** from its file, for about 15 minutes.
- The CRM takes about 120 calls a second in all, and about 120 ms a call.
- About 1 row in 200 has an email address the CRM refuses. Marketing wants those rows back within the hour to fix them.
- CRM outages last up to about 10 minutes. The broker tries a failed message again about **once a minute**.

**Questions:**
- Draw the design.
- How does the import avoid taking the sales team's share of the CRM?
- How long does the import take now, and why is that fine?
- What happens to rows the CRM refuses, and to the import during a CRM outage?
`,
  answerTemplate: `## Design

## Who gets the CRM's capacity

## How long the import takes

## Refused rows and outages
`,
  keyPoints: [
    'The import does not need an answer from the CRM while it reads the file. Put the contacts on a queue and let a consumer write them.',
    'Pace the consumer to the room the sales team leaves on the CRM. The sales team\'s calls come first, and the import uses what is left.',
    'Share one CRM System API, so one place sees every call to the CRM and holds its credentials and limits.',
    'The import now takes longer than the 15 minutes it takes to read the file. That is the price of not hurting the sales team, and the queue holds the rest safely.',
    'A redelivery limit and a dead-letter queue keep a refused row from blocking or repeating, and leave it for marketing to fix.',
    'Size the import Process API and the System API for what they carry together. The sales Experience API carries only 60 calls a second.',
  ],
  solution: `
**Design**
\`\`\`
Sales app ─► exp-sales-app ─────────────────────────────┐
                                                        ├─► sys-crm ─► CRM
Marketing contact import ~► contact-imports ~► prc-contact-import ─┘
                                 ~► DLQ
\`\`\`

**Who gets the CRM's capacity.** The sales path calls the System API directly and gets an answer at once. The import consumer takes contacts from the queue at a steady pace. In Mule you set that pace with the consumer's number of concurrent messages and a short pause between batches, or with a rate limit on the import's calls in the System API. Aim it at the room the sales team leaves: about 60 calls a second here.

**How long the import takes.** 135,000 contacts at about 60 a second is about 40 minutes instead of 15. The campaign starts a little later, and the sales team never notices.

**Refused rows and outages.** A refused row fails at every delivery. After 30 it moves to the DLQ, and marketing gets a list of rows to fix. During a CRM outage, deliveries fail and the contacts wait on the queue. A redelivery limit of 30 covers an outage of about half an hour in this model, and each contact still goes in once the CRM is back.

**Sizing.** The import job publishes 150 contacts a second, the consumer writes up to 60, and the System API carries both paths, so each gets half a vCore. The sales Experience API gets 0.2 vCores.
`,
  followUps: [
    {
      q: 'What if the CRM offers a bulk API?',
      a: 'Use it for the import. A few hundred contacts per call cuts the number of calls a lot. The queue and the separate consumer still keep the import off the sales team\'s path.',
    },
    {
      q: 'The sales team is busier at 10:00 on Mondays. Does a fixed pace still work?',
      a: 'Set the pace for the busiest hour, or watch the CRM\'s answers: when it starts returning 429, the consumer slows down. A fixed, low pace is a safe place to start.',
    },
  ],
}

import { diagram } from '../../arch/dsl.js'

const tickets = { name: 'collection tickets', from: 'batch-job', rps: 5, to: ['sftp-server', 'erp'], kind: 'write' }

export default {
  id: 'uc-169',
  category: 'use-cases',
  title: 'Milk Collection Tickets From a Haulier\'s SFTP Server Into the ERP: One Collector Job, One ERP System API, and Retries Where the ERP Is Called',
  level: 'BEGINNER',
  tags: ['myproject', 'sftp', 'batch', 'system-api', 'retry', 'erp', 'agriculture'],
  estMinutes: 25,
  diagram: {
    task: 'draw a scheduled collector job that reads ticket files from the haulier\'s SFTP server and posts each ticket to the ERP through an ERP System API.',
    checks: [
      { label: 'The collector job reads the haulier\'s SFTP server', rule: { type: 'edge', from: 'batch-job', to: 'sftp-server' } },
      { label: 'The ERP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'The job posts tickets through the System API', rule: { type: 'path', from: 'batch-job', via: 'system-api', to: 'erp' } },
      { label: 'The SFTP server is read only by the job', rule: { type: 'only-via', target: 'sftp-server', from: 'batch-job' } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'collection-tickets-collector'],
        sftp: ['sftp-server', 'Haulier SFTP server'],
        sys: ['system-api', 'sys-erp-milk', { retries: 2 }],
        erp: ['erp', 'Dairy ERP'],
      },
      ['job -> sftp', 'job -> sys', 'sys -> erp'],
    ),
    simulation: {
      systems: [
        { match: 'sftp-server', latencyMs: 300 },
        { match: 'erp', latencyMs: 150 },
      ],
      tests: [
        {
          name: 'The morning round',
          about: 'About 5 tickets a second for half an hour. Every ticket reaches the ERP.',
          traffic: [tickets],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'erp', min: 0.99 }] },
        },
        {
          name: 'The ERP is busy',
          about: 'Month end jobs run in the ERP and one call in ten is refused for 20 minutes. Retries in the ERP System API get the tickets through.',
          traffic: [tickets],
          incidents: [{ errors: 'erp', rate: 0.1, at: 0, forMin: 20 }],
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
Kittering Farms, a fictional dairy cooperative, pays its farmers for the milk a haulier collects. The haulier's tanker system writes a ticket file per farm visit to the haulier's **SFTP server**. Kittering may read and move files there.

A scheduled Mule job collects the files and posts each ticket (farm, litres, quality readings) to the cooperative's **ERP**, through an ERP System API that other apps also use.

**Numbers**
- About **5 tickets a second** for half an hour after each collection round.
- At month end the ERP runs heavy jobs, and about **1 call in 10** is refused for up to 20 minutes.

**Questions:**
- Draw the design.
- Why does the job call a System API instead of the ERP directly?
- Where should retries go, and why there?
- What does the job do with a file once its tickets are posted?
`,
  answerTemplate: `## Design

## The System API

## Retries

## After posting
`,
  keyPoints: [
    'The job owns the SFTP side: polling, skipping half written files, moving files when done.',
    'The System API owns the ERP side: the ERP\'s format, its login, and its retries. Other apps that post to the ERP get the same behaviour.',
    'Retries go where the failing call is made. Two retries in the System API turn a 10% refusal rate into almost none.',
    'Retries need the call to be safe to repeat. Send a ticket ID the ERP checks, so a retry after a lost answer does not pay a farmer twice.',
    'Move a file to an archive folder only when all its tickets are posted, so a failed run picks it up again.',
  ],
  solution: `
**Design**
\`\`\`
collection-tickets-collector ─► Haulier SFTP server
             └─► sys-erp-milk (2 retries) ─► Dairy ERP
\`\`\`

**The job.** Every few minutes: list the ticket folder, skip files still changing, read each file, post its tickets, then move it to \`archive\`. A file whose tickets fail goes to \`error\` after a few runs.

**Retries.** 2 retries with a short pause in \`sys-erp-milk\`.

**SFTP access.** Key authentication with the key in secure properties, and the haulier's host key pinned, so the job only talks to the real server.
`,
  followUps: [
    {
      q: 'The haulier deletes files after a day. Is the archive on their server enough?',
      a: 'No. Copy each file to your own storage as you read it, so you can prove what was received when a farmer queries a payment.',
    },
    {
      q: 'Why not retry in the job as well?',
      a: 'Retries at two levels multiply: 3 tries in the job times 3 in the API is 9 calls for one ticket. Retry in one place, close to the failure.',
    },
  ],
}

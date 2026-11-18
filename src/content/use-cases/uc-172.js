import { diagram } from '../../arch/dsl.js'

const sends = { name: 'contribution files', from: 'internal-app', rps: 2, to: 'sftp-server', kind: 'write' }

export default {
  id: 'uc-172',
  category: 'use-cases',
  title: 'Contribution Files to Pension Providers Over SFTP: Queue Each Send, Ride Out a 90 Minute Maintenance Window, and Give Slow Uploads Time',
  level: 'ADVANCED',
  tags: ['myproject', 'sftp', 'outbound', 'queues', 'dlq', 'maintenance-window', 'timeout', 'pensions'],
  estMinutes: 45,
  diagram: {
    task: 'draw the payroll app asking a contributions Process API to send a file. The Process API puts a send request on a queue with a dead-letter queue. A sender job reads the queue and uploads each file to the provider\'s SFTP server.',
    checks: [
      { label: 'The payroll app calls the Process API', rule: { type: 'edge', from: 'internal-app', to: 'process-api' } },
      { label: 'Send requests wait on a queue before the SFTP upload', rule: { type: 'path', from: 'process-api', via: 'queue', to: 'sftp-server' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Payroll never waits on a provider\'s SFTP server', rule: { type: 'no-path', from: 'internal-app', to: 'sftp-server', kind: 'sync' } },
      { label: 'Only the sender job talks to the SFTP server', rule: { type: 'only-via', target: 'sftp-server', from: 'batch-job' } },
    ],
    reference: diagram(
      {
        app: ['internal-app', 'Payroll app'],
        prc: ['process-api', 'prc-contributions'],
        q: ['queue', 'contribution.sends', { maxRedelivery: 150 }],
        dlq: ['dlq', 'contribution.sends.dlq'],
        job: ['batch-job', 'contribution-sender', { timeoutMs: 90000 }],
        sftp: ['sftp-server', 'Pension provider SFTP'],
      },
      ['app -> prc', 'prc ~> q', 'q ~> job', 'q ~> dlq', 'job -> sftp'],
    ),
    simulation: {
      systems: [{ match: 'sftp-server', latencyMs: 2000 }],
      tests: [
        {
          name: 'Pay day',
          about: 'About 2 files a second are sent. Payroll is answered at once and every file reaches the provider.',
          traffic: [sends],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 1000 }], delivered: [{ to: 'sftp-server', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'The provider\'s Sunday maintenance',
          about: 'The provider\'s SFTP server is down for 90 minutes. Send requests wait, and every file is uploaded afterwards. None lands on the dead-letter queue.',
          traffic: [sends],
          incidents: [{ down: 'sftp-server', at: 5, forMin: 90 }],
          durationMin: 150,
          expect: { delivered: [{ to: 'sftp-server', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'Year end files',
          about: 'Year end files are large, and each upload takes about 45 seconds. Every one still arrives.',
          traffic: [{ ...sends, rps: 0.5 }],
          incidents: [{ slow: 'sftp-server', latencyMs: 45000, at: 0, forMin: 30 }],
          durationMin: 30,
          expect: { delivered: [{ to: 'sftp-server', min: 0.99 }] },
        },
        {
          name: 'A provider closes a scheme',
          about: 'Two sends in a hundred go to a folder the provider has removed. They can never succeed, so they end on the dead-letter queue.',
          traffic: [{ ...sends, poison: 0.02 }],
          durationMin: 240,
          expect: { dlq: { min: 1 } },
        },
      ],
    },
  },
  description: `
Brightwater Payroll, a fictional payroll bureau, sends pension contribution files for its clients to pension providers. Each provider takes files only on **its own SFTP server**. The payroll app asks for a send when a pay run is approved.

Providers have **Sunday maintenance windows of up to 90 minutes**, and some upload slowly. Today the payroll app waits while Mule uploads. On a Sunday in October, sends failed during a window, and the payroll team had to resend 300 files by hand on Monday.

**Numbers**
- About **2 sends a second** on pay days.
- An upload normally takes about 2 seconds. Year end files take about **45 seconds**.
- A provider's maintenance window lasts up to **90 minutes**.
- About **2 sends in 100** go to a scheme folder the provider has closed. They can never succeed.
- In this model calls time out after 10 seconds unless set otherwise, and a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- How does payroll stop waiting on the providers?
- Choose the redelivery limit and the sender's timeout. Show the sums.
- What happens to a send that can never succeed?
`,
  answerTemplate: `## Design

## Payroll stops waiting

## The limit and the timeout

## Sends that can never succeed
`,
  keyPoints: [
    'The Process API answers "accepted" once the send request is on a persistent queue. Payroll never waits on a provider.',
    'A queue rides out a maintenance window: 90 minutes is about 90 deliveries, so a limit of 150 leaves room for a long window.',
    'The sender holds a call for as long as an upload takes. 45 second uploads need a timeout above 45 seconds: 90 leaves room.',
    'A send to a closed scheme fails every time. After the limit it goes to the DLQ, where the payroll team sees it with the error.',
    'Uploads must be safe to repeat: write a temporary name and rename, and use a file name the provider treats as one submission.',
  ],
  solution: `
**Design**
\`\`\`
Payroll app ─► prc-contributions ~► contribution.sends ~► contribution-sender ─► Pension provider SFTP
                                                     ~► contribution.sends.dlq
\`\`\`

**Settings.** 150 deliveries before the DLQ. 90 second timeout on the sender.

**What the message holds.** The client, the provider, the file's stored location and the final file name, not the file. The sender reads the file from storage when it sends.

**Upload steps.** Write \`<name>.tmp\`, rename to \`<name>\`, then record the send. A redelivery after the rename finds the file there and records the send without writing again.

**Per provider pacing.** If one provider is slow for hours, its sends fill the sender's capacity. A queue per provider, or a limit on concurrent sends per provider, keeps others moving.
`,
  followUps: [
    {
      q: 'Why not let the sender retry inside one delivery for 90 minutes?',
      a: 'It would hold a thread and a message for 90 minutes, and a restart would lose track of it. A queue redelivery keeps the wait outside the app.',
    },
    {
      q: 'How does payroll learn that a file finally arrived?',
      a: 'The sender records each upload, and the payroll app reads that status, or the sender publishes a "sent" event the payroll app listens to.',
    },
  ],
}

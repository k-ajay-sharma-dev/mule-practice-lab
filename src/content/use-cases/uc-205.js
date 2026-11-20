import { diagram } from '../../arch/dsl.js'

const landing = { type: 'sftp-server', label: 'landing' }
const planning = { type: 'sftp-server', label: 'planning' }
const parts = { name: 'history parts', from: 'batch-job', rps: 0.2, to: [landing, planning], kind: 'write' }

export default {
  id: 'uc-205',
  category: 'use-cases',
  title: 'Two Gigabyte History Parts to the Planning Platform\'s SFTP Server: a Relay Job With a Timeout Measured in Minutes, Not Seconds, and Retries When Logins Are Refused',
  level: 'BEGINNER',
  tags: ['myproject', 'large-files', 'sftp', 'timeout', 'retry', 'planning'],
  estMinutes: 25,
  diagram: {
    task: 'draw one relay job that reads each history part from Brindle\'s landing SFTP server and writes it to the planning platform\'s SFTP server. Nothing else talks to the planning platform\'s server.',
    checks: [
      { label: 'The relay job reads the landing server', rule: { type: 'edge', from: 'batch-job', to: landing } },
      { label: 'The relay job writes the planning platform\'s server', rule: { type: 'edge', from: 'batch-job', to: planning } },
      { label: 'Only the relay job talks to the planning platform\'s server', rule: { type: 'only-via', target: planning, from: 'batch-job' } },
      { label: 'The relay waits for both of its calls', rule: { type: 'lines', from: 'batch-job', kind: 'sync' } },
    ],
    reference: diagram(
      {
        land: ['sftp-server', 'Brindle landing SFTP'],
        job: ['batch-job', 'history-parts-relay', { timeoutMs: 300000, retries: 2 }],
        plan: ['sftp-server', 'Planning platform SFTP'],
      },
      ['job -> land', 'job -> plan'],
    ),
    simulation: {
      systems: [
        { match: landing, latencyMs: 500 },
        { match: planning, latencyMs: 120000 },
      ],
      tests: [
        {
          name: 'A weekly history',
          about: 'A part every five seconds for half an hour, each upload about two minutes. Every part reaches the planning platform.',
          traffic: [parts],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: planning, min: 0.99 }] },
        },
        {
          name: 'Refused logins',
          about: 'The platform\'s server limits logins. For 20 minutes one upload in ten is refused at login, and a quick retry gets it through.',
          traffic: [parts],
          incidents: [{ errors: planning, rate: 0.1, at: 0, forMin: 20 }],
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, sends the planning platform a weekly sales history in **parts of about 2 GB**. The export writes the parts to Brindle's **landing SFTP server**. A Mule **relay job** reads each part and writes it to the **planning platform's SFTP server**.

The first run failed every part. The relay's calls gave up after the default 10 seconds, but an upload of 2 GB over the link to the platform takes about **two minutes**. Then the platform's server refused some logins when other customers uploaded at the same time.

**Numbers**
- About **one part every five seconds** while the export runs, for half an hour.
- Reading a part from the landing server starts in about 500 ms. An upload takes about **2 minutes**, and up to 4 at year end.
- At busy times about **1 upload in 10** is refused at login, for up to 20 minutes. Each try is refused or not on its own.
- Fewer than **1 part in 100** may fail, even at busy times.
- In this model calls time out after 10 seconds unless set otherwise.

**Questions:**
- Draw the design.
- What timeout does the relay need? Why is a bigger number not always better?
- How do retries help with refused logins, and what must be true of the upload for a retry to be safe?
`,
  answerTemplate: `## Design

## Timeout

## Retries
`,
  keyPoints: [
    'A timeout must cover the slowest normal call. Two minutes, four at year end: 5 minutes leaves room.',
    'A very long timeout holds a thread for a dead connection that long. Pick the size from the slowest real upload, not from fear.',
    'A refused login fails at once, so a retry costs little and usually works.',
    'A retry is safe when the upload writes a .tmp name and renames at the end: a half upload is never seen under the real name, and the retry overwrites it.',
    'Stream each part from one server to the other. A relay that reads 2 GB into memory needs a worker it cannot have.',
  ],
  solution: `
**Design**
\`\`\`
history-parts-relay ─► Brindle landing SFTP
history-parts-relay ─► Planning platform SFTP
\`\`\`

**Settings.** \`history-parts-relay\`: timeout 300 seconds (5 minutes), 2 retries. One retry still loses 1 part in 100; two lose about 1 in 1,000.

**On the SFTP connector.** Check the connection and response timeouts of the SFTP config too: a socket timeout shorter than the upload fails it the same way.
`,
  followUps: [
    {
      q: 'The link to the platform is the bottleneck. Would two relay jobs halve the time?',
      a: 'Only if the link and the platform\'s server have room. Two uploads at once may each take twice as long. Measure one, then two, before deciding.',
    },
    {
      q: 'Could the export write straight to the platform\'s server and skip the relay?',
      a: 'It could, but then a platform outage fails the export itself. The landing server decouples the two, and the relay can catch up later.',
    },
  ],
}

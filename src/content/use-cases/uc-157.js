import { diagram } from '../../arch/dsl.js'

const files = { name: 'claim files', from: 'batch-job', rps: 2, to: ['sftp-server', 'azure-blob'], kind: 'write' }

export default {
  id: 'uc-157',
  category: 'use-cases',
  title: 'Nightly Claim Files From a Partner\'s SFTP Server to Azure Blob Storage: Big Files Need a Longer Timeout, and a Busy Storage Account Needs a Retry',
  level: 'BEGINNER',
  tags: ['myproject', 'azure-blob', 'sftp', 'batch', 'timeout', 'retry', 'insurance'],
  estMinutes: 25,
  diagram: {
    task: 'draw one scheduled job that reads each new file from the partner\'s SFTP server and writes it to Azure Blob Storage.',
    checks: [
      { label: 'A scheduled job does the transfer', rule: { type: 'node', match: 'batch-job', min: 1 } },
      { label: 'The job reads from the partner\'s SFTP server', rule: { type: 'edge', from: 'batch-job', to: 'sftp-server' } },
      { label: 'The job writes to Azure Blob Storage', rule: { type: 'edge', from: 'batch-job', to: 'azure-blob' } },
      { label: 'Both calls are made by the job while it waits for them', rule: { type: 'lines', from: 'batch-job', kind: 'sync' } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'claim-files-transfer', { timeoutMs: 60000, retries: 2 }],
        sftp: ['sftp-server', 'Partner SFTP server'],
        blob: ['azure-blob', 'claim-files container'],
      },
      ['job -> sftp', 'job -> blob'],
    ),
    simulation: {
      systems: [
        { match: 'sftp-server', latencyMs: 3000 },
        { match: 'azure-blob', latencyMs: 25000 },
      ],
      tests: [
        {
          name: 'The nightly transfer',
          about: 'The job copies about 2 files a second. Some are 200 MB scans, and an upload takes about 25 seconds. Every file arrives.',
          traffic: [files],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'azure-blob', min: 0.99 }] },
        },
        {
          name: 'A busy storage account',
          about: 'For half an hour the storage account answers one write in five with "server busy". A few quick retries get every file through.',
          traffic: [files],
          incidents: [{ errors: 'azure-blob', rate: 0.2, at: 0, forMin: 30 }],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
Harbourline Insurance, a fictional insurer, gets claim files from a loss adjusting partner every night. The partner drops them on its **SFTP server**. A scheduled Mule job copies each new file to the **Azure Blob Storage** container \`claim-files\`, where the claims system reads them in the morning.

Two problems in the last month:
- Large scanned files (up to 200 MB) failed every night. The job's calls give up after the default **10 seconds**, and an upload that size takes about 25.
- On some nights storage answered some writes with "server busy" (HTTP 503). Those files were skipped until the next night.

**Numbers**
- About **2 files a second** for half an hour.
- Reading a file from SFTP takes about 3 seconds. Uploading the largest takes about **25 seconds**.
- On a busy night, about **1 write in 5** is refused for a short time.

**Questions:**
- Draw the design.
- What timeout should the job use for its calls, and why?
- How should it handle "server busy"?
- Why not raise the timeout to an hour to be safe?
`,
  answerTemplate: `## Design

## The timeout

## Server busy

## Not too long
`,
  keyPoints: [
    'A timeout must be longer than the slowest call that is still healthy. 25 second uploads need something like 60 seconds, not the default 10.',
    'A 503 "server busy" from storage is a short, partial failure. A couple of retries with a pause get the file through.',
    'Retries help with partial failures, not with a storage account that is down: then the job should stop and alert.',
    'A very long timeout holds a thread for as long as a hung call lasts, and hides real failures until morning.',
    'Stream the file from SFTP to storage, so a 200 MB file is not held in memory.',
  ],
  solution: `
**Design**
\`\`\`
claim-files-transfer (scheduled job) ─► Partner SFTP server
                                     └─► claim-files container (Azure Blob Storage)
\`\`\`

**Timeout.** 60 seconds for the upload: more than twice the slowest healthy upload. A hung upload fails within a minute and the file is tried again.

**Server busy.** Two retries with a pause of a few seconds, as Until Successful around the upload. In this model that turns 1 failure in 5 into about 1 in 125.

**What else.** Copy first and delete or move the file on SFTP only after the upload worked, and log the file name and size of each transfer for the morning check.
`,
  followUps: [
    {
      q: 'Files are now 2 GB. What changes?',
      a: 'The upload time grows, so the timeout grows with it. Stream the file, and check whether your connector uploads large blobs in blocks, which can be retried one block at a time.',
    },
    {
      q: 'How does the claims team know the night\'s transfer is complete?',
      a: 'Write a small manifest blob last, listing the files of the night. The claims system reads the files only once the manifest is there.',
    },
  ],
}

import { diagram } from '../../arch/dsl.js'

const nightly = { name: 'store sales files', from: 'batch-job', rps: 1, to: ['file-store', 'sftp-server'], kind: 'write' }

export default {
  id: 'uc-163',
  category: 'use-cases',
  title: 'Store Sales From an Azure File Share to the Planning Platform\'s SFTP Server: One Scheduled Job, a Timeout Long Enough for Big Stores, and Retries for a Busy Share',
  level: 'BEGINNER',
  tags: ['myproject', 'azure-file-share', 'sftp', 'batch', 'timeout', 'retry', 'retail', 'planning'],
  estMinutes: 25,
  diagram: {
    task: 'draw the store till servers writing their sales files to the Azure File Share, and one scheduled job that reads each file from the share and writes it to the planning platform\'s SFTP server.',
    checks: [
      { label: 'The tills write to the Azure File Share', rule: { type: 'edge', from: 'pos', to: 'file-store' } },
      { label: 'A scheduled job reads the share', rule: { type: 'edge', from: 'batch-job', to: 'file-store' } },
      { label: 'The job writes to the planning platform\'s SFTP server', rule: { type: 'edge', from: 'batch-job', to: 'sftp-server' } },
      { label: 'The tills never talk to the planning platform directly', rule: { type: 'no-path', from: 'pos', to: 'sftp-server' } },
      { label: 'The job waits for both of its calls', rule: { type: 'lines', from: 'batch-job', kind: 'sync' } },
    ],
    reference: diagram(
      {
        pos: ['pos', 'Store till servers'],
        share: ['file-store', 'Azure File Share scm-share'],
        job: ['batch-job', 'store-sales-to-planning', { timeoutMs: 60000, retries: 2 }],
        sftp: ['sftp-server', 'Planning platform SFTP'],
      },
      ['pos -> share', 'job -> share', 'job -> sftp'],
    ),
    simulation: {
      systems: [
        { match: 'file-store', latencyMs: 400 },
        { match: 'sftp-server', latencyMs: 20000 },
      ],
      tests: [
        {
          name: 'A normal night',
          about: 'About one file a second for half an hour. The biggest stores\' files take about 20 seconds to upload, and every file arrives.',
          traffic: [nightly],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'sftp-server', min: 0.99 }] },
        },
        {
          name: 'The share is busy',
          about: 'A backup runs on the storage account, and for 20 minutes one read in ten fails with "server busy". A couple of quick retries get every file through.',
          traffic: [nightly],
          incidents: [{ errors: 'file-store', rate: 0.1, at: 0, forMin: 20 }],
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
Larkfield Grocers, a fictional grocery chain, sends each store's daily sales to the planning platform. The till server in every store copies a CSV to an **Azure File Share** overnight. The planning platform takes files only from its own **SFTP server**.

A scheduled Mule job on an integration host, with the share mounted over SMB, copies each file to the platform and archives it on the share.

Two problems in the old job:
- Big stores' files took about 20 seconds to upload, and the job's calls gave up after the default **10 seconds**. Those stores were planned with no sales.
- When a backup ran on the storage account, some reads failed with "server busy", and those files waited a whole day.

**Numbers**
- About **1 file a second** for half an hour each night.
- Reading a file from the share takes well under a second. Uploading the biggest takes about **20 seconds**.
- During a backup, about **1 read in 10** fails for up to 20 minutes.

**Questions:**
- Draw the design.
- What timeout should the job use, and why that number?
- How should it deal with "server busy"?
- Why should the tills not send to the platform themselves?
`,
  answerTemplate: `## Design

## The timeout

## Server busy

## Why one job in the middle
`,
  keyPoints: [
    'One scheduled job is the only thing that talks to both sides. The tills write where they always have, and the platform reads where it always has.',
    'A timeout must sit above the slowest normal call, not the average. 60 seconds covers a 20 second upload with room.',
    'Retries suit short failures such as "server busy". Two or three, with a pause, get almost every read through.',
    'A timeout of an hour would hold a thread for an hour when the SFTP server hangs. Pick a number that covers normal and fails fast after that.',
    'The job archives a file only after the upload worked, so a failed night leaves the files ready for the next run.',
  ],
  solution: `
**Design**
\`\`\`
Store till servers ─► Azure File Share scm-share ◄─ store-sales-to-planning ─► Planning platform SFTP
\`\`\`

**Timeout.** 60 seconds on the job's calls: three times the slowest normal upload. A hung server is noticed within a minute.

**Retries.** 2 retries on the job's calls. A failed read from the share is tried again after a short pause; the backup's errors pass.

**The mount.** The share is mounted over SMB on the integration host. If the app moved to CloudHub, it would read through the File Share REST API instead, because CloudHub workers cannot mount SMB.

**Half copied files.** The job skips a file whose size or modified time is still changing, or the tills write a temporary name and rename it.
`,
  followUps: [
    {
      q: 'Why not let the planning platform read the share directly?',
      a: 'It could, if it supported Azure Files and the network allowed it. Here the platform only reads its own SFTP server, so the job bridges the two.',
    },
    {
      q: 'The upload still fails after its retries. What then?',
      a: 'The file stays on the share and the next run tries again. Alert when a file is older than the platform\'s load time, so a store is not planned without its sales.',
    },
  ],
}

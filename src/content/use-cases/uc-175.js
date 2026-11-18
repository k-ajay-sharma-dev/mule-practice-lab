import { diagram } from '../../arch/dsl.js'

const nightly = { name: 'master data files', from: 'batch-job', rps: 1, to: ['sql-server', 'sftp-server'], kind: 'write' }

export default {
  id: 'uc-175',
  category: 'use-cases',
  title: 'Item and Location Files From SQL Server to the Planning Platform\'s FTP Server: One Nightly Job, a Timeout for Slow Uploads, and Retries When the Server Turns Connections Away',
  level: 'BEGINNER',
  tags: ['myproject', 'ftp', 'sql-server', 'batch', 'timeout', 'retry', 'master-data', 'planning'],
  estMinutes: 25,
  diagram: {
    task: 'draw one scheduled job that reads items and locations from the merchandising SQL Server and writes files to the planning platform\'s FTP server. Nothing else talks to the FTP server.',
    checks: [
      { label: 'A scheduled job reads SQL Server', rule: { type: 'edge', from: 'batch-job', to: 'sql-server' } },
      { label: 'The job writes to the planning platform\'s FTP server', rule: { type: 'edge', from: 'batch-job', to: 'sftp-server' } },
      { label: 'Only the job talks to the FTP server', rule: { type: 'only-via', target: 'sftp-server', from: 'batch-job' } },
      { label: 'The job waits for both of its calls', rule: { type: 'lines', from: 'batch-job', kind: 'sync' } },
    ],
    reference: diagram(
      {
        sql: ['sql-server', 'Merchandising SQL Server'],
        job: ['batch-job', 'master-data-to-planning', { timeoutMs: 60000, retries: 2 }],
        ftp: ['sftp-server', 'Planning platform FTP'],
      },
      ['job -> sql', 'job -> ftp'],
    ),
    simulation: {
      systems: [
        { match: 'sql-server', latencyMs: 300 },
        { match: 'sftp-server', latencyMs: 18000 },
      ],
      tests: [
        {
          name: 'A normal night',
          about: 'About one file a second for half an hour. The full item file takes about 18 seconds to upload, and every file arrives.',
          traffic: [nightly],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'sftp-server', min: 0.99 }] },
        },
        {
          name: 'The FTP server turns connections away',
          about: 'The platform\'s server allows few logins at once. For 20 minutes one upload in ten is refused with "421 too many connections". A couple of quick retries get every file through.',
          traffic: [nightly],
          incidents: [{ errors: 'sftp-server', rate: 0.1, at: 0, forMin: 20 }],
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
Quarry Hill Hardware, a fictional chain of hardware stores, sends its item and location master data to the planning platform every night. The data lives in the **merchandising SQL Server**. The platform collects files only from **its own FTP server**.

A scheduled Mule job reads the tables and writes one file per store group and data type.

Two problems in the first weeks:
- The full item file takes about 18 seconds to upload. The job's calls gave up after the default **10 seconds**, and the platform planned with last week's items.
- The platform's FTP server allows only a few logins at once. When other customers upload at the same time, some uploads are refused with \`421\`, and those files waited a day.

**Numbers**
- About **1 file a second** for half an hour each night.
- Reading from SQL Server takes well under a second. The biggest upload takes about **18 seconds**.
- At busy times about **1 upload in 10** is refused, for up to 20 minutes.

**Questions:**
- Draw the design.
- What timeout should the job use, and why that number?
- How do retries help with the refused logins, and when would they not help?
- What FTP settings would you check first?
`,
  answerTemplate: `## Design

## Timeout

## Retries

## FTP settings
`,
  keyPoints: [
    'The timeout must sit above the slowest normal upload. 60 seconds covers 18 with room.',
    'A refused login is short and partial: a retry a few seconds later usually gets in. Retries do not help when the server is down.',
    'Keep retries few and spaced, or the retries themselves add to the crowd of logins.',
    'Passive mode for the firewall, binary transfer so the bytes are unchanged, and a temporary name renamed at the end.',
  ],
  solution: `
**Design**
\`\`\`
Merchandising SQL Server ◄─ master-data-to-planning ─► Planning platform FTP
\`\`\`

**Settings.** Timeout 60 seconds, 2 retries on the job.

**Connections.** Reuse one FTP connection per file group where the connector allows it, so the job logs in less often.

**Files.** Write each file under a \`.tmp\` name and rename it when complete, so the platform never loads half a file.
`,
  followUps: [
    {
      q: 'Why not run the job with more threads to finish sooner?',
      a: 'The platform\'s server limits logins. More threads mean more refused logins. Ask the platform team for the limit and stay below it.',
    },
    {
      q: 'What if the upload takes longer every month as the range grows?',
      a: 'Log the upload time per file and alert when it nears the timeout. Raise the timeout or split the file before it fails.',
    },
  ],
}

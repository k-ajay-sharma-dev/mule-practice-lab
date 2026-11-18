import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-135',
  category: 'architecture',
  title: 'A Partner File Drop Picked Up by a Scheduled Job',
  level: 'BEGINNER',
  tags: ['myproject', 'sftp', 'file', 'scheduler', 'polling', 'wms'],
  estMinutes: 20,
  diagram: {
    task: 'draw a partner file reaching the warehouse system. Use five boxes: a Partner, an SFTP / FTP server, a Batch / scheduled job, a System API, and a Warehouse mgmt (WMS) box. Draw a line from the Partner to the SFTP server. Draw a line from the job to the SFTP server, because the job starts that connection. Then draw a line from the job to the System API, and from the System API to the WMS.',
    checks: [
      { label: 'The partner drops the file on the SFTP server', rule: { type: 'edge', from: 'partner', to: 'sftp-server' } },
      { label: 'The scheduled job collects the file from the SFTP server', rule: { type: 'edge', from: 'batch-job', to: 'sftp-server' } },
      { label: 'The partner never talks to the job directly', rule: { type: 'no-edge', from: 'partner', to: 'batch-job' } },
      { label: 'The job hands the data to the System API', rule: { type: 'edge', from: 'batch-job', to: 'system-api' } },
      { label: 'The WMS is reached only through the System API', rule: { type: 'only-via', target: 'wms', from: 'system-api' } },
      { label: 'The job starts its own connections, so its lines are sync calls', rule: { type: 'lines', from: 'batch-job', kind: 'sync' } },
      { label: 'The System API writes to the WMS with a sync call', rule: { type: 'edge', from: 'system-api', to: 'wms', kind: 'sync' } },
    ],
    reference: diagram(
      {
        ptr: ['partner', 'Supplier'],
        sftp: ['sftp-server', 'SFTP server: inbound folder'],
        job: ['batch-job', 'Hourly file job', { vCores: '0.5' }],
        sys: ['system-api', 'Stock System API', { vCores: '0.5', retries: 2 }],
        wms: ['wms', 'WMS'],
      },
      ['ptr -> sftp', 'job -> sftp', 'job -> sys', 'sys -> wms'],
    ),
    simulation: {
      systems: [
        { match: 'wms', latencyMs: 150, maxRps: 150 },
        { match: 'sftp-server', latencyMs: 100 },
      ],
      tests: [
        {
          name: 'A stock count file',
          about: 'After a stock count the file is large, and the job sends 120 rows a second for twenty minutes. Every row reaches the WMS, and the APIs stay inside 1.5 vCores.',
          traffic: [{ name: 'rows', from: 'batch-job', rps: 120, to: ['sftp-server', 'wms'], kind: 'write' }],
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.99 }], peakRps: [{ node: 'wms', max: 150 }], vCores: { max: 1.5 } },
        },
        {
          name: 'The WMS has lock errors',
          about: 'The job sends 40 rows a second, and the WMS rejects about one write in twenty with a short lock error. A second try works, so almost every row must still arrive.',
          traffic: [{ name: 'rows', from: 'batch-job', rps: 40, to: ['sftp-server', 'wms'], kind: 'write' }],
          incidents: [{ errors: 'wms', rate: 0.05 }],
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
A supplier cannot call APIs, but it can send a stock file. It puts the file in a folder on an **SFTP server**, a server for moving files securely.

A **scheduled job** checks the folder every hour. This regular checking is called **polling**. The job sends the stock data to the **WMS**, the warehouse management system.

A normal file is sent at about **40** rows a second. After a stock count the file is large, and the job sends **120** rows a second for twenty minutes. The WMS takes at most **150** writes a second and answers in about **150 ms**. It rejects about **one write in twenty** with a short lock error that goes away on a second try. The budget for the APIs is **1.5 vCores**.

**Questions:**
- Draw the design.
- How do you stop the job reading a file twice?
`,
  answerTemplate: `## Design

## Reading each file once
`,
  keyPoints: [
    'The SFTP server is the meeting point, so the partner and the job never need to be running at the same time.',
    'The job pulls the file. The partner does not push it to the job.',
    'The job reaches the WMS through a System API.',
    'Moving a file to an archive folder after reading stops the job reading it twice.',
    'Size the job and the System API for the largest file, and retry short WMS lock errors on the System API.',
  ],
  solution: `
**Design.**
\`\`\`
 Supplier ─► SFTP server ◄─ Hourly file job ─► Stock System API ─► WMS
\`\`\`
Both lines point at the SFTP server, because both sides start their own connection to it.

**Reading each file once.** After a file is processed, the job moves it to an archive folder. The next run sees only new files, and the archive keeps a copy for support. In Mule, the SFTP connector's \`On New or Updated File\` source can poll the folder on a schedule.

**Sizing and failure handling.** The stock count file runs at 120 rows a second. The job and the System API get 0.5 vCore each, 1 vCore in all, because 0.2 vCore handles only about 100. The WMS rejects about one write in twenty with a lock error. Two retries on the System API turn that into about one in eight thousand, so the rows are not lost.
`,
  followUps: [
    {
      q: 'What if the job runs while the partner is still writing the file?',
      a: 'It could read half a file. A common fix is for the partner to upload under a temporary name and rename the file when it is complete. The job reads only the final name.',
    },
    {
      q: 'What if a file has a bad row?',
      a: 'Agree the rule in advance. For example, move the file to an error folder and alert support, or load the good rows and report the bad ones.',
    },
  ],
}

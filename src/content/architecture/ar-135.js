import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-135',
  category: 'architecture',
  title: 'A Partner File Drop Picked Up by a Scheduled Job',
  level: 'BEGINNER',
  tags: ['sftp', 'file', 'scheduler', 'polling', 'wms'],
  estMinutes: 10,
  diagram: {
    task: 'draw a partner file reaching the warehouse system. Use five boxes: a Partner, an SFTP / FTP server, a Batch / scheduled job, a System API, and a Warehouse mgmt (WMS) box. Draw a line from the Partner to the SFTP server. Draw a line from the job to the SFTP server, because the job starts that connection. Then draw a line from the job to the System API, and from the System API to the WMS.',
    checks: [
      { label: 'The partner drops the file on the SFTP server', rule: { type: 'edge', from: 'partner', to: 'sftp-server' } },
      { label: 'The scheduled job collects the file from the SFTP server', rule: { type: 'edge', from: 'batch-job', to: 'sftp-server' } },
      { label: 'The partner never talks to the job directly', rule: { type: 'no-edge', from: 'partner', to: 'batch-job' } },
      { label: 'The job hands the data to the System API', rule: { type: 'edge', from: 'batch-job', to: 'system-api' } },
      { label: 'The WMS is reached only through the System API', rule: { type: 'only-via', target: 'wms', from: 'system-api' } },
    ],
    reference: diagram(
      {
        ptr: ['partner', 'Supplier'],
        sftp: ['sftp-server', 'SFTP server: inbound folder'],
        job: ['batch-job', 'Hourly file job'],
        sys: ['system-api', 'Stock System API'],
        wms: ['wms', 'WMS'],
      },
      ['ptr -> sftp', 'job -> sftp', 'job -> sys', 'sys -> wms'],
    ),
  },
  description: `
A supplier cannot call APIs, but it can send a stock file. It puts the file in a folder on an **SFTP server**, a server for moving files securely.

A **scheduled job** checks the folder every hour. This regular checking is called **polling**. The job sends the stock data to the **WMS**, the warehouse management system.

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
  ],
  solution: `
**Design.**
\`\`\`
 Supplier ─► SFTP server ◄─ Hourly file job ─► Stock System API ─► WMS
\`\`\`
Both lines point at the SFTP server, because both sides start their own connection to it.

**Reading each file once.** After a file is processed, the job moves it to an archive folder. The next run sees only new files, and the archive keeps a copy for support. In Mule, the SFTP connector's \`On New or Updated File\` source can poll the folder on a schedule.
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

import { diagram } from '../../arch/dsl.js'

const parts = { name: 'part uploads', from: 'batch-job', rps: 1, to: ['sql-server', 'azure-blob'], kind: 'write' }

export default {
  id: 'uc-207',
  category: 'use-cases',
  title: 'A Split Export Into Azure Blob Storage for the Planning Platform: Upload Timeouts for Year End Parts, Retries When the Storage Account Throttles, and Two Replicas for a Zone Outage',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'large-files', 'split-files', 'azure-blob', 'timeout', 'retry', 'availability', 'planning'],
  estMinutes: 35,
  diagram: {
    task: 'draw an export job that reads shipment history through a shipment data System API in front of SQL Server and uploads each part file, and the control file last, to the Azure Blob container the planning platform reads. Only the System API talks to SQL Server.',
    checks: [
      { label: 'The export job uploads to Azure Blob Storage', rule: { type: 'edge', from: 'batch-job', to: 'azure-blob' } },
      { label: 'The export job reads through a System API', rule: { type: 'edge', from: 'batch-job', to: 'system-api' } },
      { label: 'SQL Server is reached only through a System API', rule: { type: 'only-via', target: 'sql-server', from: 'system-api' } },
      { label: 'The export job waits for each of its calls', rule: { type: 'lines', from: 'batch-job', kind: 'sync' } },
    ],
    reference: diagram(
      {
        sql: ['sql-server', 'Shipments SQL Server'],
        sys: ['system-api', 'sys-shipment-data', { replicas: 2 }],
        job: ['batch-job', 'shipment-parts-export', { replicas: 2, timeoutMs: 120000, retries: 2 }],
        blob: ['azure-blob', 'Planning exchange container'],
      },
      ['job -> sys', 'sys -> sql', 'job -> blob'],
    ),
    simulation: {
      systems: [
        { match: 'sql-server', latencyMs: 200 },
        { match: 'azure-blob', latencyMs: 8000 },
      ],
      tests: [
        {
          name: 'A normal night',
          about: 'About one part a second for half an hour, each upload about 8 seconds. Every part reaches the container.',
          traffic: [parts],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'azure-blob', min: 0.99 }] },
        },
        {
          name: 'Year end parts',
          about: 'At year end each part is larger and an upload takes about a minute for half an hour. Every part still arrives.',
          traffic: [parts],
          incidents: [{ slow: 'azure-blob', latencyMs: 60000, at: 0, forMin: 30 }],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
        {
          name: 'The storage account throttles',
          about: 'Another team runs a bulk copy into the same account. For 20 minutes one upload in ten is refused with 503 Server Busy, and works when tried again.',
          traffic: [parts],
          incidents: [{ errors: 'azure-blob', rate: 0.1, at: 0, forMin: 20 }],
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
        {
          name: 'A zone fails during the export',
          about: 'An availability zone is down for 20 minutes. The export job and the shipment data API each keep a replica in the other zone.',
          traffic: [parts],
          incidents: [{ zone: true, at: 5, forMin: 20 }],
          durationMin: 40,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
Quayle Freight, a fictional freight forwarder, sends shipment history to a capacity planning platform. The platform now reads from an **Azure Blob container** instead of FTP: parts \`SHIPMENTS_<date>_<n>.csv\` of about **200 MB**, and a control file written last.

A Mule **export job** reads the rows through a **shipment data System API** in front of **SQL Server**, cuts them into parts and uploads each one.

**Numbers**
- About **1 part a second** while the export runs, for half an hour.
- An upload takes about **8 seconds**; at year end about **a minute**.
- When another team runs a bulk copy into the same storage account, about **1 upload in 10** is refused with \`503 Server Busy\` for up to 20 minutes.
- Last year an availability zone failed for 20 minutes during a night run.
- In this model calls time out after 10 seconds unless set otherwise.

**Questions:**
- Draw the design.
- Set the export job's timeout and retries, and say why the retries are safe here.
- How many replicas, and on which boxes? What stops two replicas exporting twice?
- Why is the control file uploaded last, and what does the platform do if it never comes?
`,
  answerTemplate: `## Design

## Timeout and retries

## Replicas

## The control file
`,
  keyPoints: [
    'A year end upload takes a minute; the job\'s timeout must be above it. Two minutes leaves room.',
    '503 Server Busy is the storage account asking clients to slow down. A couple of retries with a pause get through.',
    'Uploading the same part name twice overwrites it with the same bytes, so a retry is safe.',
    'Two replicas on the job and on the System API keep the export going through a zone outage. A run lock stops both replicas exporting the same night.',
    'The control file is the commit. Until it is there the platform loads nothing, so a failed export leaves no half loaded set.',
  ],
  solution: `
**Design**
\`\`\`
shipment-parts-export ─► sys-shipment-data ─► Shipments SQL Server
shipment-parts-export ─► Planning exchange container
\`\`\`

**Settings.** \`shipment-parts-export\`: 2 replicas, timeout 120 seconds, 2 retries. \`sys-shipment-data\`: 2 replicas.

**Uploading 200 MB.** Stream the part to the upload and check that your connector sends large blobs in blocks. A block upload can also resume a part instead of starting again.
`,
  followUps: [
    {
      q: 'The storage account throttles for an hour, not 20 minutes. Do more retries help?',
      a: 'Not much: the job holds a thread through each wait. Ask for the bulk copy to move, or give the planning exchange its own storage account so the two never compete.',
    },
    {
      q: 'Why read through the System API instead of a direct database connection from the job?',
      a: 'The API owns the connection pool, the queries and the read replica choice for every consumer. The job stays a client of a contract, not of a schema.',
    },
  ],
}

import { diagram } from '../../arch/dsl.js'

const exportJob = { type: 'batch-job', label: 'export' }
const resultsJob = { type: 'batch-job', label: 'results' }
const exportRun = { name: 'planning export', from: exportJob, rps: 20, to: ['oracle-db', 'azure-blob'], kind: 'write' }
const resultsRun = { name: 'results load', from: resultsJob, rps: 20, to: ['azure-blob', 'oracle-db'], kind: 'write' }

export default {
  id: 'uc-161',
  category: 'use-cases',
  title: 'Product Data Hub and the Supply Chain Planning Platform: Exchange Files Through Azure Blob Storage, Load Results Into Oracle in Bulk, and Ride Out a Slow Database',
  level: 'ADVANCED',
  tags: ['myproject', 'azure-blob', 'batch', 'bulk-insert', 'oracle', 'timeout', 'retry', 'gs1'],
  estMinutes: 45,
  diagram: {
    task: 'draw two scheduled jobs. The planning export job reads staged data from the hub\'s Oracle database through an Oracle System API and writes export files to Azure Blob Storage through a blob System API. The supply chain planning platform collects the files from storage and writes its results back there. The results loader job reads those files through the blob System API and bulk loads them into Oracle through the Oracle System API.',
    checks: [
      { label: 'The export job reads Oracle through a System API', rule: { type: 'path', from: exportJob, via: 'system-api', to: 'oracle-db' } },
      { label: 'The export job writes to blob storage through a System API', rule: { type: 'path', from: exportJob, via: 'system-api', to: 'azure-blob' } },
      { label: 'The results loader reads blob storage and loads Oracle through System APIs', rule: { type: 'path', from: resultsJob, via: 'system-api', to: 'oracle-db' } },
      { label: 'The planning platform exchanges files with blob storage', rule: { type: 'link', from: 'saas', to: 'azure-blob' } },
      { label: 'Oracle is reached only through a System API', rule: { type: 'only-via', target: 'oracle-db', from: 'system-api' } },
    ],
    reference: diagram(
      {
        exp: ['batch-job', 'pdh-planning-export', { vCores: '1', timeoutMs: 30000 }],
        res: ['batch-job', 'pdh-planning-results-loader', { vCores: '1', timeoutMs: 30000 }],
        sysO: ['system-api', 'sys-pdh-oracle', { replicas: 2, vCores: '1', timeoutMs: 30000 }],
        ora: ['oracle-db', 'Product data hub Oracle'],
        sysB: ['system-api', 'sys-pdh-blob', { replicas: 2, vCores: '0.5', retries: 2 }],
        blob: ['azure-blob', 'planning-exchange container'],
        plan: ['saas', 'Supply chain planning platform'],
      },
      ['exp -> sysO', 'exp -> sysB', 'res -> sysB', 'res -> sysO', 'sysO -> ora', 'sysB -> blob', 'plan -> blob'],
    ),
    simulation: {
      systems: [
        { match: 'oracle-db', latencyMs: 200 },
        { match: 'azure-blob', latencyMs: 300 },
      ],
      tests: [
        {
          name: 'The nightly exchange',
          about: 'The export job writes 20 file parts a second and the results loader loads 20 result groups a second. All of them get through.',
          traffic: [exportRun, resultsRun],
          durationMin: 30,
          expect: { answers: [{ flow: 'planning export', minSuccess: 0.99 }, { flow: 'results load', minSuccess: 0.99 }] },
        },
        {
          name: 'Oracle gathers statistics',
          about: 'For half an hour Oracle answers in 15 seconds while the DBAs gather statistics. Both jobs wait it out and every group still gets through.',
          traffic: [exportRun, resultsRun],
          incidents: [{ slow: 'oracle-db', latencyMs: 15000, at: 0, forMin: 30 }],
          durationMin: 30,
          expect: { answers: [{ flow: 'planning export', minSuccess: 0.99 }, { flow: 'results load', minSuccess: 0.99 }] },
        },
        {
          name: 'Blob storage is busy',
          about: 'Storage answers 1 request in 10 with "server busy". The blob System API retries, and the jobs hardly notice.',
          traffic: [exportRun, resultsRun],
          incidents: [{ errors: 'azure-blob', rate: 0.1, at: 0, forMin: 30 }],
          durationMin: 30,
          expect: { answers: [{ flow: 'planning export', minSuccess: 0.99 }, { flow: 'results load', minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
Copperline Home Supply' product data hub (fictional) feeds a **supply chain planning platform**, a SaaS product that plans store replenishment. They exchange **files** through **Azure Blob Storage**:
- Each night an export job reads the staged item, supplier item and stock data from the hub's **Oracle database** and writes export files to the container \`planning-exchange\`. The platform collects them.
- The platform writes its results (planned orders and forecasts) back to the container. A results loader job reads them and loads them into Oracle staging tables. It uses a Batch Job: an aggregator bulk inserts each group, and a group that fails is inserted again row by row so only bad rows fail.

**Numbers**
- Each job handles about **20 groups a second** for half an hour.
- Oracle answers a group in about 200 ms. While the DBAs gather statistics it takes up to **15 seconds**, for up to half an hour.
- Blob storage answers in about 300 ms, and on busy nights answers about **1 request in 10** with "server busy".
- In this model calls time out after 10 seconds unless set otherwise, a thread is held for as long as a call takes, and one vCore has about 384 threads.

**Questions:**
- Draw the design.
- Why exchange files through blob storage rather than call the platform's API for each item?
- What happens to the jobs when Oracle takes 15 seconds, and what must change?
- Where do retries belong for "server busy"?
`,
  answerTemplate: `## Design

## Files through blob storage

## A slow Oracle

## Server busy
`,
  keyPoints: [
    'A planning platform works on whole data sets. Files in a shared container suit that: each side writes and reads at its own pace, and neither waits on the other.',
    'Both jobs reach Oracle and storage through the same System APIs as the rest of the hub, so connection pools and credentials live in one place.',
    'A 15 second Oracle needs timeouts above 15 seconds on every caller that waits for it: both jobs and the Oracle System API.',
    'Slow calls hold threads. At 15 seconds each, 40 groups a second need about 600 threads, so the Oracle System API needs two replicas of 1 vCore and each job 1 vCore.',
    'Retry "server busy" where the call to storage is made, in the blob System API. Two retries turn 1 failure in 10 into 1 in 1,000.',
    'In the loader, the bulk insert per group with a row by row fallback keeps good rows when one row is bad.',
  ],
  solution: `
**Design**
\`\`\`
pdh-planning-export ─► sys-pdh-oracle ─► Hub Oracle
         └─► sys-pdh-blob ─► planning-exchange container ◄─► Planning platform
pdh-planning-results-loader ─► sys-pdh-blob
         └─► sys-pdh-oracle
\`\`\`

**Export.** The job reads Oracle in pages and writes numbered part files, then a small manifest last, so the platform never collects a half written export.

**Results.** The loader waits for the platform's manifest, then reads each part, and loads it in a Batch Job: an aggregator of a few hundred rows bulk inserts in a transaction, and a group that fails is inserted again row by row, with bad rows written to a rejects table. On Complete logs the counts in the job log.

**A slow Oracle.** Timeouts of 30 seconds on both jobs and on \`sys-pdh-oracle\`. Two replicas of 1 vCore for the System API give enough threads to wait.

**Server busy.** Two retries with a short pause in \`sys-pdh-blob\`.
`,
  followUps: [
    {
      q: 'Why not let the jobs talk to Oracle directly with the Database connector?',
      a: 'They could. Going through the System API keeps one owner for the hub\'s schema and one connection pool to size, which matters when a slow Oracle makes connections scarce.',
    },
    {
      q: 'How do the two sides avoid reading a file still being written?',
      a: 'Write the data files first and a manifest last, and read only exports whose manifest exists. Or write under a temporary prefix and move the files when done.',
    },
  ],
}

import { diagram } from '../../arch/dsl.js'

const uploads = { name: 'catalogue uploads', from: 'partner', rps: 1, to: ['azure-blob', 'sql-server'], kind: 'write' }

export default {
  id: 'uc-206',
  category: 'use-cases',
  title: 'A Catalogue Upload API That Never Carries the File: Partners Upload to Azure Blob Storage, the Experience API Takes a Small Request and Queues It, and a Loader Does the Heavy Work',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'large-files', 'claim-check', 'azure-blob', 'experience-api', 'queues', 'dlq', 'timeout'],
  estMinutes: 35,
  diagram: {
    task: 'draw partners uploading catalogue files to Azure Blob Storage, then calling a catalogue Experience API with the blob name. The Experience API puts a notice on a queue with a dead-letter queue and answers at once. A catalogue loader Process API reads the queue, downloads the blob and writes through a products System API to SQL Server.',
    checks: [
      { label: 'Partners upload the file to Azure Blob Storage', rule: { type: 'edge', from: 'partner', to: 'azure-blob' } },
      { label: 'Partners call the Experience API', rule: { type: 'edge', from: 'partner', to: 'experience-api' } },
      { label: 'The Experience API queues the work instead of waiting for it', rule: { type: 'no-path', from: 'experience-api', to: 'sql-server', kind: 'sync' } },
      { label: 'The loader downloads the blob', rule: { type: 'edge', from: 'process-api', to: 'azure-blob' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'SQL Server is reached only through a System API', rule: { type: 'only-via', target: 'sql-server', from: 'system-api' } },
    ],
    reference: diagram(
      {
        partner: ['partner', 'Marketplace partner'],
        blob: ['azure-blob', 'Catalogue uploads'],
        exp: ['experience-api', 'exp-catalogue-uploads'],
        q: ['queue', 'catalogue.uploads', { maxRedelivery: 30 }],
        dlq: ['dlq', 'catalogue.uploads.dlq'],
        prc: ['process-api', 'prc-catalogue-loader', { timeoutMs: 60000 }],
        sys: ['system-api', 'sys-products'],
        sql: ['sql-server', 'Products SQL Server'],
      },
      ['partner -> blob', 'partner -> exp', 'exp ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> blob', 'prc -> sys', 'sys -> sql'],
    ),
    simulation: {
      systems: [
        { match: 'azure-blob', latencyMs: 600 },
        { match: 'sql-server', latencyMs: 100 },
      ],
      tests: [
        {
          name: 'A normal day',
          about: 'About one upload a second. The API answers each partner in well under a second, and every catalogue reaches SQL Server.',
          traffic: [uploads],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 2000 }], delivered: [{ to: 'sql-server', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'Full catalogues at season start',
          about: 'Partners send full catalogues. Each download takes about 25 seconds for half an hour. The API still answers at once, and every catalogue loads as it comes.',
          traffic: [uploads],
          incidents: [{ slow: 'azure-blob', latencyMs: 25000, at: 0, forMin: 30 }],
          durationMin: 60,
          expect: { delivered: [{ to: 'sql-server', min: 0.99 }], backlog: [{ queue: 'queue', maxPeak: 100 }], dlq: { max: 0 } },
        },
        {
          name: 'An upload that never finished',
          about: 'One notice in a hundred names a blob the partner never finished uploading. It ends on the dead-letter queue, and the queue does not keep growing.',
          traffic: [{ ...uploads, poison: 0.01 }],
          durationMin: 120,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 100 }] },
        },
      ],
    },
  },
  description: `
Marrow & Pine Home, a fictional home furnishings retailer, takes product catalogues from marketplace partners. Today partners POST the whole file, up to **800 MB**, to a catalogue API, which loads it before answering. Uploads time out, partners retry, and the same catalogue loads three times.

The new design:
1. The partner uploads the file to **Azure Blob Storage**, with a short lived upload link the API gives it.
2. The partner calls the **catalogue Experience API** with the blob name. The API checks the request, puts a notice on a queue and answers \`202\` at once.
3. A **catalogue loader** reads the queue, downloads the blob and writes the products through a **products System API** into **SQL Server**.

**Numbers**
- About **1 upload a second** at the busiest time.
- A download takes about 600 ms; full catalogues at season start take about **25 seconds**.
- About **1 notice in 100** names a blob the partner never finished uploading. It will never load.
- In this model calls time out after 10 seconds unless set otherwise, and a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- What does the partner get back from the API, and how does it learn the result?
- Set the loader's timeout and the queue's redelivery limit.
- What stops a catalogue loading twice when a partner calls the API twice?
`,
  answerTemplate: `## Design

## The API's answer

## Settings

## Loading once
`,
  keyPoints: [
    'The API never carries the file. A request of a few hundred bytes answers in milliseconds whatever the catalogue size.',
    'The file goes straight from the partner to Blob Storage, which is built for large uploads and resumes them.',
    'The loader\'s timeout covers the slowest download, 25 seconds; 60 leaves room.',
    'A notice for a blob that is not there fails every time. A redelivery limit sends it to the DLQ instead of looping.',
    'An idempotency key, such as the blob name or a request ID, lets the API answer a repeated call with the first request\'s status instead of queueing it again.',
  ],
  solution: `
**Design**
\`\`\`
Marketplace partner ─► Catalogue uploads (blob)
Marketplace partner ─► exp-catalogue-uploads ~► catalogue.uploads ~► prc-catalogue-loader ─► Catalogue uploads
                                                                     prc-catalogue-loader ─► sys-products ─► Products SQL Server
                                                catalogue.uploads ~► catalogue.uploads.dlq
\`\`\`

**Settings.** \`prc-catalogue-loader\`: timeout 60 seconds. \`catalogue.uploads\`: 30 deliveries.

**The answer.** \`202 Accepted\` with a status link, \`GET /uploads/{id}\`, which reads the job log. A webhook to the partner is an option when they support it.
`,
  followUps: [
    {
      q: 'How does the API know the blob is complete before queueing?',
      a: 'Check the blob exists and its size matches what the partner says, or ask for an MD5 in the request and compare it with the blob\'s stored hash. Refuse with 400 otherwise.',
    },
    {
      q: 'Why 30 deliveries here and not 60?',
      a: 'Nothing in this design waits for a long outage of the blob store or SQL Server in the numbers given. 30 covers busy moments and parks a broken notice within half an hour. Raise it if SQL Server has maintenance windows.',
    },
  ],
}

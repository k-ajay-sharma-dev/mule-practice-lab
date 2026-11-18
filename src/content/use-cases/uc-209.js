import { diagram } from '../../arch/dsl.js'

const planningQ = { type: 'queue', label: 'planning' }
const financeQ = { type: 'queue', label: 'finance' }
const extract = { name: 'extract notices', from: 'batch-job', rps: 1, to: ['azure-blob', 'sftp-server', 'data-warehouse'], kind: 'write' }

export default {
  id: 'uc-209',
  category: 'use-cases',
  title: 'One Large Extract, Two Consumers: Upload It Once to Azure Blob Storage, Send a Small Notice to Each Consumer\'s Own Queue, and Let a Warehouse Outage Wait Without Holding Up the Planning Platform',
  level: 'ADVANCED',
  tags: ['myproject', 'large-files', 'claim-check', 'azure-blob', 'queues', 'dlq', 'fan-out', 'timeout', 'planning'],
  estMinutes: 45,
  diagram: {
    task: 'draw an extract job that uploads each extract part once to Azure Blob Storage and puts a small notice on two queues, one for planning and one for finance, each with its own dead-letter queue. A planning feed Process API reads its queue, downloads the part and writes it to the planning platform\'s SFTP server. A finance feed Process API reads its queue, downloads the part and loads it into the data warehouse.',
    checks: [
      { label: 'The extract job uploads to Azure Blob Storage', rule: { type: 'edge', from: 'batch-job', to: 'azure-blob' } },
      { label: 'The planning notices go through their own queue', rule: { type: 'path', from: 'batch-job', via: planningQ, to: 'sftp-server' } },
      { label: 'The finance notices go through their own queue', rule: { type: 'path', from: 'batch-job', via: financeQ, to: 'data-warehouse' } },
      { label: 'Each queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Both feeds download the part from Blob Storage', rule: { type: 'each', of: 'process-api', edgeTo: 'azure-blob' } },
      { label: 'The extract job never waits on the warehouse', rule: { type: 'no-path', from: 'batch-job', to: 'data-warehouse', kind: 'sync' } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'extract-publisher'],
        blob: ['azure-blob', 'Extract container'],
        pq: ['queue', 'extract.planning', { maxRedelivery: 30 }],
        pdlq: ['dlq', 'extract.planning.dlq'],
        fq: ['queue', 'extract.finance', { maxRedelivery: 90 }],
        fdlq: ['dlq', 'extract.finance.dlq'],
        pprc: ['process-api', 'prc-planning-feed', { timeoutMs: 60000 }],
        fprc: ['process-api', 'prc-finance-feed', { timeoutMs: 60000 }],
        sftp: ['sftp-server', 'Planning platform SFTP'],
        dw: ['data-warehouse', 'Finance warehouse'],
      },
      [
        'job -> blob', 'job ~> pq', 'job ~> fq', 'pq ~> pprc', 'pq ~> pdlq', 'fq ~> fprc', 'fq ~> fdlq',
        'pprc -> blob', 'pprc -> sftp', 'fprc -> blob', 'fprc -> dw',
      ],
    ),
    simulation: {
      systems: [
        { match: 'azure-blob', latencyMs: 2000 },
        { match: 'sftp-server', latencyMs: 1500 },
        { match: 'data-warehouse', latencyMs: 1000 },
      ],
      tests: [
        {
          name: 'A normal night',
          about: 'About one part a second for half an hour. Every part reaches the planning platform and the warehouse.',
          traffic: [extract],
          durationMin: 30,
          expect: {
            delivered: [{ to: 'sftp-server', min: 0.99 }, { to: 'data-warehouse', min: 0.99 }],
            lost: { max: 0 },
          },
        },
        {
          name: 'Slow downloads at month end',
          about: 'Month end parts are larger. For half an hour each download takes about 25 seconds. Both feeds still deliver every part as it comes, and neither queue builds up.',
          traffic: [extract],
          incidents: [{ slow: 'azure-blob', latencyMs: 25000, at: 0, forMin: 30 }],
          durationMin: 60,
          expect: {
            delivered: [{ to: 'sftp-server', min: 0.99 }, { to: 'data-warehouse', min: 0.99 }],
            backlog: [{ queue: planningQ, maxPeak: 100 }, { queue: financeQ, maxPeak: 100 }],
            dlq: { max: 0 },
          },
        },
        {
          name: 'Warehouse maintenance',
          about: 'The warehouse is down for an hour. Finance notices wait on their queue and load afterwards, and the planning platform gets every part on time.',
          traffic: [extract],
          incidents: [{ down: 'data-warehouse', at: 5, forMin: 60 }],
          durationMin: 120,
          expect: {
            delivered: [{ to: 'sftp-server', min: 0.99 }, { to: 'data-warehouse', min: 0.99 }],
            backlog: [{ queue: planningQ, maxPeak: 20 }],
            dlq: { max: 0 },
            lost: { max: 0 },
          },
        },
        {
          name: 'A part that never arrives',
          about: 'One notice in a hundred names a part whose upload failed. Those notices end on the dead-letter queues, and the queues do not keep growing.',
          traffic: [{ ...extract, poison: 0.01 }],
          durationMin: 200,
          expect: { dlq: { min: 1 }, backlog: [{ queue: planningQ, maxEnd: 100 }, { queue: financeQ, maxEnd: 100 }] },
        },
      ],
    },
  },
  description: `
Thornbury Freight, a fictional road haulage company, sends a nightly shipment extract to two consumers: the **planning platform**, through its **SFTP server**, and the finance **data warehouse**. Today one job writes the whole extract to both, one after the other. When the warehouse is down, the job fails and the planning platform gets nothing either.

The new design:
- An **extract job** uploads each part of about **500 MB** once to **Azure Blob Storage**.
- It then puts a small notice, the blob name and its MD5, on **two queues**, one per consumer, each with its own dead-letter queue.
- A **planning feed** reads its queue, downloads the part and writes it to the planning platform's SFTP server.
- A **finance feed** reads its queue, downloads the part and loads it into the warehouse.

**Numbers**
- About **1 part a second** for half an hour.
- A download takes about 2 seconds; at month end about **25 seconds**.
- The warehouse has maintenance for up to **an hour** once a month.
- About **1 notice in 100** names a part whose upload failed. It never loads.
- In this model calls time out after 10 seconds unless set otherwise, and a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- Why two queues and not one queue that both feeds read?
- Set the feeds' timeouts and each queue's redelivery limit. Why can the two limits differ?
- When can the blob be deleted?
`,
  answerTemplate: `## Design

## Two queues

## Settings

## Cleaning up the blob
`,
  keyPoints: [
    'The part is uploaded once. Each notice is a few hundred bytes, so adding a third consumer costs a queue, not another 500 MB copy.',
    'On one queue each notice goes to only one consumer. Each consumer needs its own copy of the notice: a queue each, or a topic.',
    'With a queue each, a warehouse outage fills only the finance queue. The planning feed carries on.',
    'A 25 second download needs a timeout above it on both feeds: 60 seconds.',
    'Finance must ride out an hour: 90 deliveries at about one a minute. Planning has no long outage in the numbers, so 30 parks a broken notice sooner.',
    'Delete the blob when both feeds have finished with it, for example from a lifecycle rule after a few days, not from either feed.',
  ],
  solution: `
**Design**
\`\`\`
extract-publisher ─► Extract container
extract-publisher ~► extract.planning ~► prc-planning-feed ─► Extract container
                                         prc-planning-feed ─► Planning platform SFTP
                     extract.planning ~► extract.planning.dlq
extract-publisher ~► extract.finance  ~► prc-finance-feed  ─► Extract container
                                         prc-finance-feed  ─► Finance warehouse
                     extract.finance  ~► extract.finance.dlq
\`\`\`

**Settings.** Both feeds: timeout 60 seconds. \`extract.planning\`: 30 deliveries. \`extract.finance\`: 90 deliveries.

**A topic instead.** A topic with one subscription per consumer does the same fan out, and a new consumer only adds a subscription. Each subscription still needs its own redelivery limit and DLQ.
`,
  followUps: [
    {
      q: 'The finance feed loads a part twice after a redelivery. How do you stop duplicate rows?',
      a: 'Load by blob name: delete the rows of that part, or MERGE on the business key, inside one transaction. Then a second load writes the same result.',
    },
    {
      q: 'Why does the notice carry the MD5?',
      a: 'The feed checks the download against it. A part that was overwritten or cut short is refused before any row is written.',
    },
  ],
}

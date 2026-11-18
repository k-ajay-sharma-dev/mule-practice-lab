import { diagram } from '../../arch/dsl.js'

const catalog = { type: 'saas', label: 'catalogue' }
const feeds = { name: 'new feeds', from: 'azure-blob', rps: 2, to: catalog, kind: 'write', spikes: [{ at: 5, forMin: 10, rps: 30 }] }

export default {
  id: 'uc-160',
  category: 'use-cases',
  title: 'Supplier Feeds Dropped in Azure Blob Storage: Blob Created Events Through a Cloud Queue, So Nothing Is Missed While Mule or the Catalogue Is Down',
  level: 'ADVANCED',
  tags: ['myproject', 'azure-blob', 'event-grid', 'cloud-queue', 'dlq', 'load-levelling', 'retail'],
  estMinutes: 40,
  diagram: {
    task: 'draw Azure Blob Storage sending a blob created event to a cloud queue (Event Grid delivering to an Azure queue), with a dead-letter queue. A feed import Process API reads the queue, fetches the new file through a blob System API and loads it into the catalogue platform through a catalogue System API.',
    checks: [
      { label: 'New blobs raise events on a cloud queue', rule: { type: 'edge', from: 'azure-blob', to: 'cloud-queue', kind: 'async' } },
      { label: 'The cloud queue has a dead-letter queue', rule: { type: 'each', of: 'cloud-queue', edgeTo: 'dlq' } },
      { label: 'Feeds reach the catalogue through the queue', rule: { type: 'path', from: 'azure-blob', via: 'cloud-queue', to: catalog } },
      { label: 'The file is fetched through a System API', rule: { type: 'path', from: 'process-api', via: 'system-api', to: 'azure-blob' } },
      { label: 'The catalogue is reached only through a System API', rule: { type: 'only-via', target: catalog, from: 'system-api' } },
    ],
    reference: diagram(
      {
        blob: ['azure-blob', 'supplier-drops container'],
        cq: ['cloud-queue', 'blob-created events', { maxRedelivery: 90 }],
        dlq: ['dlq', 'blob-created poison queue'],
        prc: ['process-api', 'prc-feed-import'],
        sysB: ['system-api', 'sys-supplier-drops'],
        sysC: ['system-api', 'sys-catalogue'],
        cat: ['saas', 'Product catalogue platform'],
      },
      ['blob ~> cq', 'cq ~> prc', 'cq ~> dlq', 'prc -> sysB', 'sysB -> blob', 'prc -> sysC', 'sysC -> cat'],
    ),
    simulation: {
      systems: [
        { match: 'azure-blob', latencyMs: 300 },
        { match: catalog, latencyMs: 500, maxRps: 20 },
      ],
      tests: [
        {
          name: 'Monday morning',
          about: 'Suppliers drop about 2 feeds a second, then 30 a second for ten minutes after 09:00. Every feed reaches the catalogue, which never gets more than 20 a second, and the queue is empty within the hour.',
          traffic: [feeds],
          durationMin: 60,
          expect: { delivered: [{ to: catalog, min: 0.99 }], peakRps: [{ node: catalog, max: 20 }], backlog: [{ queue: 'cloud-queue', maxEnd: 0 }], lost: { max: 0 } },
        },
        {
          name: 'The import app is redeployed',
          about: 'The Mule import app is down for 30 minutes during a deploy. Events wait on the queue and every feed is imported afterwards.',
          traffic: [{ ...feeds, spikes: undefined }],
          incidents: [{ down: 'process-api', at: 5, forMin: 30 }],
          durationMin: 60,
          expect: { delivered: [{ to: catalog, min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'The catalogue is down for an hour',
          about: 'The catalogue platform has an hour of maintenance. Imports fail and are tried again, and all of them land afterwards. None goes to the poison queue.',
          traffic: [{ ...feeds, spikes: undefined }],
          incidents: [{ down: catalog, at: 5, forMin: 60 }],
          durationMin: 120,
          expect: { delivered: [{ to: catalog, min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'A corrupt feed',
          about: 'One feed in 100 is not valid JSON and fails every time. Those end on the poison queue for the supplier team.',
          traffic: [{ ...feeds, spikes: undefined, poison: 0.01 }],
          durationMin: 120,
          expect: { dlq: { min: 30 }, lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
Copperline Home Supply (fictional) lets suppliers drop product feeds into the **Azure Blob Storage** container \`supplier-drops\`. Each feed must be imported into the **product catalogue platform**, a SaaS product.

A Mule flow listed the container every minute. It missed files twice when its watermark was wrong, and it hammered the catalogue on Monday mornings.

The platform team offers **Azure Event Grid**: on each new blob it can send a blob created event to an Azure queue (a **cloud queue** on the diagram), with a dead-letter destination. Mule then reads that queue.

**Numbers**
- About **2 feeds a second**, and **30 a second for ten minutes** after 09:00 on Mondays.
- The catalogue answers in about 500 ms and takes up to **20 imports a second**.
- The catalogue has maintenance windows of up to **an hour**. The Mule import app is redeployed now and then, which takes up to 30 minutes.
- About 1 feed in 100 is corrupt.
- In this model a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- Why deliver the events to a queue rather than to a Mule HTTP endpoint?
- What happens to Monday's burst?
- Choose a redelivery limit for the queue.
`,
  answerTemplate: `## Design

## Events, not listings

## Why a queue in between

## The Monday burst

## The redelivery limit
`,
  keyPoints: [
    'Event Grid tells Mule about each new blob, so nothing has to be listed and no watermark can skip a file.',
    'Delivered to a queue, the events wait while Mule is down or busy. Delivered to a webhook, they depend on Event Grid\'s own retries while Mule is away.',
    'The consumer takes events at the catalogue\'s pace, so the Monday burst waits on the queue instead of failing.',
    'A limit of 90 tries outlasts an hour of catalogue maintenance. A corrupt feed still reaches the poison queue.',
    'Events can arrive more than once, so the import keeps a record of event or blob IDs and skips a repeat.',
  ],
  solution: `
**Design**
\`\`\`
supplier-drops container ~► blob-created events (cloud queue) ~► prc-feed-import ─► sys-supplier-drops ─► supplier-drops container
                                  ~► poison queue                       └─► sys-catalogue ─► Catalogue platform
\`\`\`

**The event.** Each event carries the blob's URL and name. \`prc-feed-import\` reads it, fetches the feed through \`sys-supplier-drops\`, validates it and posts it through \`sys-catalogue\`.

**The burst.** 30 a second for ten minutes is 18,000 feeds. At 20 a second they are imported in about 15 minutes.

**The limit.** 90 deliveries, about an hour and a half. A corrupt feed reaches the poison queue, and the supplier team is told which file.

**A safety net.** A daily listing still runs, to find any blob with no import record.
`,
  followUps: [
    {
      q: 'Which connector reads an Azure queue from Mule?',
      a: 'It depends on the queue: Azure Service Bus has a MuleSoft connector, and Azure Storage queues can be read through their REST API. Check what your organisation has licensed.',
    },
    {
      q: 'A supplier overwrites a feed with a corrected one. Is that a new event?',
      a: 'Yes, writing a blob raises a new created event. The import should key on the blob name and its ETag or last modified time, so the corrected feed is imported and a repeat event is not.',
    },
  ],
}

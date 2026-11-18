import { diagram } from '../../arch/dsl.js'

const docs = { name: 'item documents', from: 'saas', rps: 10, to: ['azure-blob', 'oracle-db'], kind: 'write' }

export default {
  id: 'uc-188',
  category: 'use-cases',
  title: 'Item Documents From the Planning Platform Into Oracle by Claim Check: a JMS Queue, a Timeout That Outlasts the Nightly Backup, and a Limit That Outlasts Patching',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'oracle', 'claim-check', 'azure-blob', 'jms', 'queues', 'dlq', 'timeout'],
  estMinutes: 40,
  diagram: {
    task: 'draw the planning platform storing each item document in Azure Blob Storage and putting a small notification on a JMS queue with a dead-letter queue. An inbound adapter (a Process API) reads the queue, downloads the document through a blob System API, and loads Oracle through an Oracle System API.',
    checks: [
      { label: 'The platform puts notifications on a queue', rule: { type: 'edge', from: 'saas', to: 'queue' } },
      { label: 'Documents reach Oracle only after waiting on a queue', rule: { type: 'path', from: 'saas', via: 'queue', to: 'oracle-db' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Oracle is reached only through a System API', rule: { type: 'only-via', target: 'oracle-db', from: 'system-api' } },
      { label: 'The adapter reads the blob through a System API', rule: { type: 'only-via', target: 'azure-blob', from: ['system-api', 'saas'] } },
    ],
    reference: diagram(
      {
        plat: ['saas', 'Planning platform'],
        blob: ['azure-blob', 'item-documents container'],
        q: ['queue', 'ITEM.NOTIFY', { maxRedelivery: 90 }],
        dlq: ['dlq', 'ITEM.NOTIFY.DLQ'],
        prc: ['process-api', 'prc-item-inbound', { timeoutMs: 40000 }],
        sysB: ['system-api', 'sys-item-blob'],
        sysO: ['system-api', 'sys-item-oracle', { timeoutMs: 30000 }],
        ora: ['oracle-db', 'Merchandising Oracle'],
      },
      ['plat -> blob', 'plat ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sysB', 'sysB -> blob', 'prc -> sysO', 'sysO -> ora'],
    ),
    simulation: {
      systems: [
        { match: 'azure-blob', latencyMs: 150 },
        { match: 'oracle-db', latencyMs: 80, maxRps: 200 },
      ],
      tests: [
        {
          name: 'A normal day',
          about: 'About 10 documents a second. Every one is loaded into Oracle, and nothing is lost.',
          traffic: [docs],
          durationMin: 30,
          expect: { delivered: [{ to: 'oracle-db', min: 0.99 }], lost: { max: 0 }, dlq: { max: 0 } },
        },
        {
          name: 'The nightly backup',
          about: 'During the backup each Oracle load takes about 15 seconds. The loads are slow but they finish; none times out and none ends on the dead-letter queue.',
          traffic: [{ ...docs, rps: 2 }],
          incidents: [{ slow: 'oracle-db', latencyMs: 15000, at: 0, forMin: 30 }],
          durationMin: 40,
          expect: { delivered: [{ to: 'oracle-db', min: 0.99 }], dlq: { max: 0 } },
        },
        {
          name: 'Oracle patching',
          about: 'Oracle is down for an hour. Notifications wait on the queue and are all loaded afterwards, with none on the dead-letter queue.',
          traffic: [{ ...docs, rps: 2 }],
          incidents: [{ down: 'oracle-db', at: 5, forMin: 60 }],
          durationMin: 120,
          expect: { delivered: [{ to: 'oracle-db', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'A document that can never load',
          about: 'One document in 200 names an item type Oracle does not have. Those reach the dead-letter queue, and the queue does not keep growing.',
          traffic: [{ ...docs, poison: 0.005 }],
          durationMin: 180,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 400 }] },
        },
      ],
    },
  },
  description: `
Marrow & Pine Home, a fictional homewares retailer, receives item documents from the planning platform. Documents can be several megabytes, so the platform uses a **claim check**: it stores the document in **Azure Blob Storage** and puts a small notification on a **JMS queue**. An inbound adapter loads each document into the merchandising **Oracle** database.

Two Oracle habits shaped the last incident review:
- The **nightly backup** slows every load to about **15 seconds** for half an hour. The adapter's calls timed out after 10 seconds, the messages were redelivered, and the backup took even longer.
- **Patching** stops Oracle for up to **an hour** once a month.

**Numbers**
- About **10 documents a second** by day, about 2 a second at night.
- About **1 document in 200** can never load (an item type Oracle does not have).
- In this model calls time out after 10 seconds unless set otherwise, and a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- Set the timeouts so the backup does not cause failures. Which boxes need them, and why must the outer one be longer?
- Choose a redelivery limit for the queue and say what goes wrong with 10 and with no limit.
- Why a claim check, and not the document on the queue?
`,
  answerTemplate: `## Design

## Timeouts and the backup

## The redelivery limit

## The claim check
`,
  keyPoints: [
    'The notification is small and the document stays in blob storage, so the broker never carries megabytes and a replay only needs the blob name.',
    'A slow Oracle is not a down Oracle. A timeout under 15 seconds turns slow loads into failures and redeliveries, which add load at the worst time.',
    'Timeouts nest: the System API must wait longer than Oracle takes, and the Process API longer than the System API, or the outer call gives up on work that is still going to succeed.',
    'An hour of patching at a retry about once a minute needs more than 60 deliveries. 90 leaves room; 10 sends good documents to the DLQ; no limit lets a bad document circle for ever.',
    'Loads must be safe to repeat (a MERGE, or a check on the message ID), since a redelivery after a slow success loads the same document again.',
  ],
  solution: `
**Design**
\`\`\`
Planning platform ─► item-documents container ◄─ sys-item-blob ◄─ prc-item-inbound ─► sys-item-oracle ─► Oracle
                 ~► ITEM.NOTIFY ~► prc-item-inbound
                               ~► ITEM.NOTIFY.DLQ
\`\`\`

**Settings.** \`sys-item-oracle\`: timeout 30 s. \`prc-item-inbound\`: timeout 40 s. \`ITEM.NOTIFY\`: 90 deliveries before the DLQ.

**In Mule.** The Oracle System API's HTTP listener and the Process API's HTTP request both need the longer timeout, and the database query timeout must allow 15 s too.
`,
  followUps: [
    {
      q: 'Could the adapter read the blob directly instead of through a System API?',
      a: 'It could, with a SAS token or the connector. A blob System API keeps credentials and retry rules in one place, which matters once several adapters read the same container.',
    },
    {
      q: 'Who looks at ITEM.NOTIFY.DLQ?',
      a: 'Support, with a daily check, and the restart app that republishes a message once the item type exists in Oracle.',
    },
  ],
}

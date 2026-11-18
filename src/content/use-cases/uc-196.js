import { diagram } from '../../arch/dsl.js'

const docs = { name: 'supplier documents', from: 'batch-job', rps: 2, to: ['azure-blob', 'oracle-db'], kind: 'write' }

export default {
  id: 'uc-196',
  category: 'use-cases',
  title: 'Supplier Documents From a Shared Mailbox Into Oracle: a Collector That Stores Attachments in Blob Storage, a Queue to the Loader, and Settings for Big Attachments and an Oracle Outage',
  level: 'ADVANCED',
  tags: ['myproject', 'email', 'imap', 'mailbox', 'azure-blob', 'oracle', 'queues', 'claim-check', 'timeout'],
  estMinutes: 45,
  diagram: {
    task: 'draw a mailbox collector job that reads the supplier mailbox (IMAP), stores each attachment in Azure Blob Storage through a blob System API, and puts a notification on a queue with a dead-letter queue. A supplier documents Process API reads the queue, reads the blob through the blob System API, and loads Oracle through an Oracle System API.',
    checks: [
      { label: 'The collector reads the supplier mailbox', rule: { type: 'edge', from: 'batch-job', to: 'external-api' } },
      { label: 'Attachments are stored in blob storage through a System API', rule: { type: 'only-via', target: 'azure-blob', from: 'system-api' } },
      { label: 'Documents wait on a queue before they reach Oracle', rule: { type: 'path', from: 'batch-job', via: 'queue', to: 'oracle-db' } },
      { label: 'The collector never writes to Oracle', rule: { type: 'no-path', from: 'batch-job', to: 'oracle-db', kind: 'sync' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Oracle is reached only through a System API', rule: { type: 'only-via', target: 'oracle-db', from: 'system-api' } },
    ],
    reference: diagram(
      {
        box: ['external-api', 'Supplier mailbox (IMAP)'],
        col: ['batch-job', 'mailbox-collector', { timeoutMs: 45000 }],
        sysB: ['system-api', 'sys-supplier-blob', { timeoutMs: 35000 }],
        blob: ['azure-blob', 'supplier-docs container'],
        q: ['queue', 'supplier.docs', { maxRedelivery: 60 }],
        dlq: ['dlq', 'supplier.docs.dlq'],
        prc: ['process-api', 'prc-supplier-docs', { timeoutMs: 45000 }],
        sysO: ['system-api', 'sys-supplier-oracle'],
        ora: ['oracle-db', 'Purchasing Oracle'],
      },
      ['col -> box', 'col -> sysB', 'sysB -> blob', 'col ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sysB', 'prc -> sysO', 'sysO -> ora'],
    ),
    simulation: {
      systems: [
        { match: 'external-api', latencyMs: 600 },
        { match: 'azure-blob', latencyMs: 200 },
        { match: 'oracle-db', latencyMs: 80 },
      ],
      tests: [
        {
          name: 'A normal day',
          about: 'About 2 documents a second. Every attachment is stored and every document loaded.',
          traffic: [docs],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'azure-blob', min: 0.99 }, { to: 'oracle-db', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'Month end drawings',
          about: 'Suppliers send large scanned drawings; each blob upload takes about 25 seconds for half an hour. The uploads finish, because the timeouts allow for it.',
          traffic: [docs],
          incidents: [{ slow: 'azure-blob', latencyMs: 25000, at: 0, forMin: 30 }],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
        {
          name: 'Oracle is down',
          about: 'Purchasing Oracle is down for 45 minutes. The collector carries on, notifications wait on the queue, and every document is loaded afterwards with none on the dead-letter queue.',
          traffic: [docs],
          incidents: [{ down: 'oracle-db', at: 5, forMin: 45 }],
          durationMin: 100,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'oracle-db', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'Files that can never load',
          about: 'One document in 100 is a file type the loader cannot read. Those reach the dead-letter queue, and the queue does not keep growing.',
          traffic: [{ ...docs, poison: 0.01 }],
          durationMin: 180,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 120 }] },
        },
      ],
    },
  },
  description: `
Fenwick Supply, a fictional builders' merchant, receives delivery notes, invoices and drawings from small suppliers by email. A collector job reads the shared **supplier mailbox** over IMAP and the documents end up in the **Purchasing Oracle** database.

The old collector did everything in one go: read the email, parse the attachment, write to Oracle, then move the email. When Oracle was down the collector failed, emails piled up in the inbox, and the mailbox provider started throttling the account.

The team will use the claim check pattern: attachments go to **Azure Blob Storage**, and a small notification goes on a queue.

**Numbers**
- About **2 documents a second** in office hours.
- At month end, scanned drawings make each blob upload take about **25 seconds**.
- Purchasing Oracle is down for up to **45 minutes** for patching.
- About **1 document in 100** is a file type the loader cannot read.
- In this model calls time out after 10 seconds unless set otherwise, and a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- What may the collector do before it moves an email out of the inbox?
- Set the timeouts and the redelivery limit, and explain them.
- What happens to an email whose attachment can never load?
`,
  answerTemplate: `## Design

## The collector's job

## Settings

## Files that never load
`,
  keyPoints: [
    'The collector only reads mail, stores attachments and publishes. It no longer needs Oracle, so an Oracle outage does not stop it or fill the inbox.',
    'Move an email out of the inbox only after its attachments are stored and its notification is on the queue. Then nothing is lost if the collector stops half way.',
    'A 25 second upload needs a blob System API timeout above that, and a collector timeout above the System API\'s.',
    'The queue must outlast 45 minutes of Oracle patching: 60 deliveries leaves room.',
    'A file that can never load ends on the DLQ with its blob name. Support tells the supplier, and the email itself sits in an Error folder for reference.',
  ],
  solution: `
**Design**
\`\`\`
mailbox-collector ─► Supplier mailbox (IMAP)
mailbox-collector ─► sys-supplier-blob ─► supplier-docs container
mailbox-collector ~► supplier.docs ~► prc-supplier-docs ─► sys-supplier-blob
                                  ~► supplier.docs.dlq   └─► sys-supplier-oracle ─► Purchasing Oracle
\`\`\`

**Settings.** \`sys-supplier-blob\`: timeout 35 s. \`mailbox-collector\` and \`prc-supplier-docs\`: timeout 45 s. \`supplier.docs\`: 60 deliveries.

**Polling politely.** Poll every few minutes, list a page of emails at a time, and run the collector on one node, so the mailbox provider does not throttle the account.
`,
  followUps: [
    {
      q: 'Why does the loader read the blob through the same System API as the collector?',
      a: 'One place holds the storage credentials, the container names and the retry rules. A second app reading the container directly would need its own copy of all three.',
    },
    {
      q: 'How do you stop a forged supplier email from loading?',
      a: 'The collector checks the sender against the supplier list and the mail server\'s SPF and DKIM results before storing anything. Unknown senders go to a Quarantine folder, with no reply.',
    },
  ],
}

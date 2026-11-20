import { diagram } from '../../arch/dsl.js'

const docs = { name: 'supplier documents', from: 'partner', rps: 20, to: ['azure-blob', 'oracle-db'], kind: 'write' }

export default {
  id: 'uc-153',
  category: 'use-cases',
  title: 'A Product Data Hub for a Home Improvement Retailer:Documents in Blob Storage, Small Notifications on a Queue, and Oracle Allowed to Be Down for an Hour',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'queues', 'claim-check', 'azure-blob', 'oracle', 'gs1', 'client-id', 'dlq'],
  estMinutes: 40,
  diagram: {
    task: 'draw the suppliers calling an API gateway that checks client IDs, then a supplier documents Experience API. It stores each document in Azure Blob Storage through a blob System API and puts a small notification on a queue with a dead-letter queue (the failure queue). A hub inbound Process API reads the queue, fetches the document through the blob System API, and loads it into the hub\'s Oracle database through an Oracle System API.',
    checks: [
      { label: 'Suppliers come in through the API gateway', rule: { type: 'edge', from: 'partner', to: 'api-gateway' } },
      { label: 'Documents are stored in Azure Blob Storage only through a System API', rule: { type: 'only-via', target: 'azure-blob', from: 'system-api' } },
      { label: 'Notifications wait on a queue before anything reaches Oracle', rule: { type: 'path', from: 'partner', via: 'queue', to: 'oracle-db' } },
      { label: 'Suppliers never wait on Oracle', rule: { type: 'no-path', from: 'partner', to: 'oracle-db', kind: 'sync' } },
      { label: 'The queue has a failure queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Oracle is reached only through a System API', rule: { type: 'only-via', target: 'oracle-db', from: 'system-api' } },
    ],
    reference: diagram(
      {
        sup: ['partner', 'Suppliers and DCs'],
        gw: ['api-gateway', 'API gateway', { auth: 'client-id' }],
        exp: ['experience-api', 'exp-supplier-documents'],
        sysB: ['system-api', 'sys-pdh-blob'],
        blob: ['azure-blob', 'pdh-inbound container'],
        q: ['queue', 'PDH.INBOUND.NOTIFY', { maxRedelivery: 90 }],
        dlq: ['dlq', 'PDH.INBOUND.FAILED'],
        prc: ['process-api', 'prc-pdh-inbound'],
        sysO: ['system-api', 'sys-pdh-oracle'],
        ora: ['oracle-db', 'Product data hub Oracle'],
      },
      ['sup -> gw', 'gw -> exp', 'exp -> sysB', 'sysB -> blob', 'exp ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sysB', 'prc -> sysO', 'sysO -> ora'],
    ),
    simulation: {
      systems: [
        { match: 'azure-blob', latencyMs: 120 },
        { match: 'oracle-db', latencyMs: 60, maxRps: 100 },
      ],
      tests: [
        {
          name: 'A normal trading day',
          about: 'Suppliers send about 20 documents a second. Each upload is answered within a second, every document is stored, and every one is loaded into Oracle.',
          traffic: [docs],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 1000 }], delivered: [{ to: 'azure-blob', min: 0.99 }, { to: 'oracle-db', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'Oracle patching for an hour',
          about: 'The hub\'s Oracle database is down for an hour. Suppliers keep sending, notifications wait on the queue, and every document is loaded afterwards. Nothing lands on the failure queue.',
          traffic: [{ ...docs, rps: 5 }],
          incidents: [{ down: 'oracle-db', at: 5, forMin: 60 }],
          durationMin: 120,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'oracle-db', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'A supplier without a client ID',
          about: 'A supplier\'s new system posts without its client ID. The gateway refuses it: nothing is stored and nothing is queued.',
          traffic: [{ ...docs, name: 'no client ID', rps: 2, auth: 'none' }],
          durationMin: 10,
          expect: { answers: [{ flow: 'no client ID', minRefused: 0.99 }], notReached: [{ flow: 'no client ID', node: 'azure-blob' }, { flow: 'no client ID', node: 'queue' }] },
        },
      ],
    },
  },
  description: `
Copperline Home Supply, a fictional home improvement retailer, is building a **product data hub**. Suppliers and its own distribution centres (DCs) send GS1 style documents to it: Item, SupplierItem, ReceivingAdvice, InventoryTransaction and Barcode. The hub checks them and loads them into its **Oracle database**, where the ERP and the planning tools pick them up.

Documents range from a few kilobytes to 80 MB. The hub's Oracle database is patched once a month, for up to an hour, during trading hours.

The team has already decided on the claim check pattern: the document goes to **Azure Blob Storage**, and a small notification with the blob name goes on a queue. Notifications that fail for good go to a failure queue, which support replays with a restart app.

**Numbers**
- About **20 documents a second** on a normal day.
- Blob storage answers in about 120 ms. Oracle answers in about 60 ms and takes up to 100 loads a second.
- Oracle patching: up to **60 minutes**. In this model a failed delivery is tried again about once a minute, and every delivery counts toward the redelivery limit.
- A supplier must get its answer within **1 second**. No document may be lost, and no good notification may reach the failure queue during patching.

**Questions:**
- Draw the design.
- Why does the document go to blob storage and not on the queue?
- What do suppliers see while Oracle is being patched?
- How many deliveries should a notification get before it moves to the failure queue?
- How do you keep unknown callers out?
`,
  answerTemplate: `## Design

## Why a claim check

## During the Oracle patching

## The failure queue

## Who may call
`,
  keyPoints: [
    'A queue is built for many small messages. An 80 MB document on a broker uses its memory and disk and slows every other message. Blob storage keeps the document; the queue carries its name.',
    'The supplier is answered once the document is stored and the notification is queued, so Oracle is not on its path.',
    'The Process API redeems the claim check: it reads the notification, fetches the document, checks it and loads it.',
    'The redelivery limit must cover the patching window: about 60 tries at one a minute, so 90 leaves room.',
    'The failure queue is the dead-letter queue. A restart app moves messages back from it once the cause is fixed.',
    'A client ID policy at the gateway identifies each supplier, and the hub can check that a supplier only sends its own documents.',
  ],
  solution: `
**Design**
\`\`\`
Suppliers ─► API gateway (client ID) ─► exp-supplier-documents ─► sys-pdh-blob ─► pdh-inbound container
                                                  ~► PDH.INBOUND.NOTIFY ~► prc-pdh-inbound ─► sys-pdh-blob
                                                         ~► PDH.INBOUND.FAILED            ─► sys-pdh-oracle ─► Hub Oracle
\`\`\`

**Intake.** The Experience API stores the document as \`inbound/{supplier}/{messageId}.json\`, puts \`{ messageId, messageType, senderId, blobName }\` on the queue, and answers RECEIVED.

**Processing.** \`prc-pdh-inbound\` checks the notification and the message ID, downloads the document, validates it, checks the sender's document ID for a repeat, routes by message type, and loads Oracle staging tables, with a job log row for each run.

**During patching.** Loads fail and notifications wait on the queue. 90 deliveries cover an hour with room. Afterwards Oracle takes up to 100 a second, so the backlog clears in minutes.

**The failure queue.** A notification that still fails, such as one whose blob was never uploaded, moves to \`PDH.INBOUND.FAILED\`. The restart app checks Oracle and blob storage, then republishes them.
`,
  followUps: [
    {
      q: 'Why does the Process API call the blob System API and not the blob container directly?',
      a: 'One System API owns how the hub talks to storage: the account, the containers, the naming. The intake and the processing both use it, so a change of storage is made once.',
    },
    {
      q: 'How does the sender learn its document was loaded?',
      a: 'The hub sends ACKs: RECEIVED at intake, then PROCESSED or REJECTED after the load, on an ACK queue or to the supplier\'s callback.',
    },
  ],
}

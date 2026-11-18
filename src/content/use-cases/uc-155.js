import { diagram } from '../../arch/dsl.js'

const stores = { type: 'pos', label: 'store' }
const outbound = { name: 'outbound messages', from: 'batch-job', rps: 40, to: ['oracle-db', 'azure-blob', stores], kind: 'write' }

export default {
  id: 'uc-155',
  category: 'use-cases',
  title: 'The Product Data Hub Sends, Too: A Nightly Job and a Support Console Start Outbound Runs, Oracle Generates the Messages, and Store Groups Collect Them by Claim Check',
  level: 'ADVANCED',
  tags: ['myproject', 'queues', 'outbound', 'claim-check', 'azure-blob', 'oracle', 'scheduler', 'gs1', 'dlq'],
  estMinutes: 45,
  diagram: {
    task: 'draw a nightly scheduled job and the hub support console both calling a hub outbound Process API. It reads the generated messages from the hub\'s Oracle database through an Oracle System API, stores each one in Azure Blob Storage through a blob System API, and puts a notification on a queue with a dead-letter queue. A store distribution Process API reads the queue and delivers each message to the store systems through a System API.',
    checks: [
      { label: 'The nightly job starts outbound runs through the Process API', rule: { type: 'edge', from: 'batch-job', to: 'process-api' } },
      { label: 'Support can start a run for one message type from the console', rule: { type: 'edge', from: 'internal-app', to: 'process-api' } },
      { label: 'Generated messages are read from Oracle only through a System API', rule: { type: 'only-via', target: 'oracle-db', from: 'system-api' } },
      { label: 'Each message is stored in blob storage through a System API', rule: { type: 'only-via', target: 'azure-blob', from: 'system-api' } },
      { label: 'Notifications wait on a queue before they reach the stores', rule: { type: 'path', from: 'batch-job', via: 'queue', to: stores } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'pdh-outbound-nightly'],
        con: ['internal-app', 'Hub support console'],
        prc: ['process-api', 'prc-pdh-outbound', { vCores: '0.5' }],
        sysO: ['system-api', 'sys-pdh-oracle', { vCores: '0.5' }],
        ora: ['oracle-db', 'Product data hub Oracle'],
        sysB: ['system-api', 'sys-pdh-blob', { vCores: '0.5' }],
        blob: ['azure-blob', 'pdh-outbound container'],
        q: ['queue', 'PDH.OUTBOUND.NOTIFY', { maxRedelivery: 90 }],
        dlq: ['dlq', 'PDH.OUTBOUND.FAILED'],
        dst: ['process-api', 'prc-store-distribution'],
        sysP: ['system-api', 'sys-store-systems'],
        pos: ['pos', 'Store group systems'],
      },
      ['job -> prc', 'con -> prc', 'prc -> sysO', 'sysO -> ora', 'prc -> sysB', 'sysB -> blob', 'prc ~> q', 'q ~> dst', 'q ~> dlq', 'dst -> sysB', 'dst -> sysP', 'sysP -> pos'],
    ),
    simulation: {
      systems: [
        { match: 'oracle-db', latencyMs: 80 },
        { match: 'azure-blob', latencyMs: 150 },
        { match: stores, latencyMs: 300, maxRps: 60 },
      ],
      tests: [
        {
          name: 'The nightly Item run',
          about: 'The job sends 40 Item messages a second for half an hour. Each one is read, stored and announced, and every store group receives it.',
          traffic: [outbound],
          durationMin: 40,
          expect: { delivered: [{ to: 'azure-blob', min: 0.99 }, { to: stores, min: 0.99 }], lost: { max: 0 }, dlq: { max: 0 } },
        },
        {
          name: 'Store systems restart for an hour',
          about: 'The store group systems are down for an hour during the run. Notifications wait on the queue and every message is delivered afterwards. None goes to the dead-letter queue.',
          traffic: [{ ...outbound, rps: 10 }],
          incidents: [{ down: stores, at: 5, forMin: 60 }],
          durationMin: 120,
          expect: { delivered: [{ to: stores, min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'A message for a closed store group',
          about: 'One message in 500 is for a store group that was closed, and the store systems refuse it every time. Those end on PDH.OUTBOUND.FAILED for support.',
          traffic: [{ ...outbound, rps: 10, poison: 0.002 }],
          durationMin: 150,
          expect: { dlq: { min: 20 }, lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
Copperline Home Supply' product data hub (fictional) also **sends** documents: Item, Barcode and TransferOrder updates for its store groups. The documents are generated in the hub's **Oracle database** by a PL/SQL package.

Each outbound run is for one message type. A **nightly scheduled job** starts the Item run, and the **hub support console** lets support start a run for any type. Each run is recorded as a job row, and Oracle generates the messages in the background.

The store groups take outbound documents the same way the hub takes inbound ones: by claim check. The document goes to **Azure Blob Storage**, and a notification goes on a queue. A distribution app reads the queue, fetches the document and delivers it to the **store group systems**. Those systems restart for up to an hour on some nights.

**Numbers**
- A nightly Item run produces about **40 messages a second** for half an hour.
- Oracle answers in about 80 ms, blob storage in about 150 ms.
- The store group systems answer in about 300 ms, take up to **60 a second**, and are sometimes down for **an hour**.
- About 1 message in 500 is for a store group that has closed.
- In this model a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- Why do the nightly job and the console call one Process API?
- Why store the documents in blob storage, and not send them on the queue or straight to the stores?
- Choose a redelivery limit for the notification queue.
`,
  answerTemplate: `## Design

## Starting a run

## Generating and storing

## Delivering to the stores

## The redelivery limit
`,
  keyPoints: [
    'Two triggers, one Process API: the nightly job and the console only say which message type to run. Job rows, the check for a run already going and the call to Oracle live in one place.',
    'Oracle generates the messages, and the Process API answers the console at once with a job ID while the run goes on.',
    'The documents go to blob storage, and the queue carries small notifications. Large documents never sit on the broker, and support can open any document that was sent.',
    'The store systems are slow and sometimes down. The queue holds the notifications, so a store outage never stops the run.',
    'A limit of 90 tries, about an hour and a half, covers a store restart. A message for a closed store group still reaches the failure queue.',
  ],
  solution: `
**Design**
\`\`\`
pdh-outbound-nightly ─┐
Hub support console ──┴─► prc-pdh-outbound ─► sys-pdh-oracle ─► Hub Oracle
                                 ├─► sys-pdh-blob ─► pdh-outbound container
                                 ~► PDH.OUTBOUND.NOTIFY ~► prc-store-distribution ─► sys-pdh-blob
                                        ~► PDH.OUTBOUND.FAILED                    ─► sys-store-systems ─► Store systems
\`\`\`

**Starting a run.** \`prc-pdh-outbound\` refuses an unknown type (400) or a second run of a type already running (409), writes a RUNNING job row, answers 202 with the job ID, and calls the Oracle package in the background.

**Sending.** For each generated message, the Process API uploads the document to \`pdh-outbound\`, publishes \`{ messageId, messageType, recipientId, blobName }\`, and marks the message SENT. The order matters: a notification never points at a blob that is not there.

**Delivering.** \`prc-store-distribution\` reads each notification, downloads the document and delivers it. While the store systems are down, deliveries fail and wait.

**Sizing.** At 40 messages a second, the smallest size of 0.1 vCore (about 50 a second in this model) would run at about 80% busy. 0.5 vCore each for the outbound Process API and the two System APIs leaves room.
`,
  followUps: [
    {
      q: 'The console user clicks Start twice. What happens?',
      a: 'The second request finds a RUNNING job for the type and gets 409. Without that check, Oracle would generate every message twice and the stores would get each one twice.',
    },
    {
      q: 'Could the store groups read the blobs themselves, without a distribution app?',
      a: 'Yes, if they can read Azure storage: the notification then goes to them with a short lived read link. The distribution app is there because the store systems only take documents pushed to them.',
    },
  ],
}

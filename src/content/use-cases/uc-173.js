import { diagram } from '../../arch/dsl.js'

const grey = { name: 'Greystone ASNs', from: 'internal-app', rps: 30, to: { type: 'sftp-server', label: 'Greystone' }, kind: 'write' }
const pel = { name: 'Pelham ASNs', from: 'internal-app', rps: 30, to: { type: 'sftp-server', label: 'Pelham' }, kind: 'write' }

export default {
  id: 'uc-173',
  category: 'use-cases',
  title: 'Shipping Notices to Each Retailer\'s SFTP Server: a Queue and a Sender per Retailer, So One Hung Server Cannot Stall Everyone Else',
  level: 'ADVANCED',
  tags: ['myproject', 'sftp', 'outbound', 'queues', 'bulkhead', 'isolation', 'dlq', 'manufacturing'],
  estMinutes: 45,
  diagram: {
    task: 'draw the warehouse app calling an ASN Process API. The Process API puts each notice on the queue for its retailer, Greystone or Pelham, each with a dead-letter queue. Each queue has its own sender job, which uploads to that retailer\'s SFTP server.',
    checks: [
      { label: 'The warehouse app calls the ASN Process API', rule: { type: 'edge', from: 'internal-app', to: 'process-api' } },
      { label: 'Each retailer has its own queue', rule: { type: 'node', match: 'queue', min: 2 } },
      { label: 'Each queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Each sender job uploads to one retailer only', rule: { type: 'each', of: 'batch-job', edgeTo: 'sftp-server', max: 1 } },
      { label: 'Notices reach Greystone through a queue', rule: { type: 'path', from: 'process-api', via: 'queue', to: { type: 'sftp-server', label: 'Greystone' } } },
      { label: 'Notices reach Pelham through a queue', rule: { type: 'path', from: 'process-api', via: 'queue', to: { type: 'sftp-server', label: 'Pelham' } } },
    ],
    reference: diagram(
      {
        app: ['internal-app', 'Warehouse app'],
        prc: ['process-api', 'prc-asn', { vCores: '0.5' }],
        qG: ['queue', 'asn.greystone', { maxRedelivery: 60 }],
        dG: ['dlq', 'asn.greystone.dlq'],
        qP: ['queue', 'asn.pelham', { maxRedelivery: 60 }],
        dP: ['dlq', 'asn.pelham.dlq'],
        jG: ['batch-job', 'asn-sender-greystone'],
        jP: ['batch-job', 'asn-sender-pelham'],
        sG: ['sftp-server', 'Greystone SFTP'],
        sP: ['sftp-server', 'Pelham SFTP'],
      },
      ['app -> prc', 'prc ~> qG', 'prc ~> qP', 'qG ~> jG', 'qG ~> dG', 'qP ~> jP', 'qP ~> dP', 'jG -> sG', 'jP -> sP'],
    ),
    simulation: {
      systems: [{ match: 'sftp-server', latencyMs: 800 }],
      tests: [
        {
          name: 'A busy afternoon',
          about: 'About 30 notices a second to each retailer. Every notice arrives.',
          traffic: [grey, pel],
          durationMin: 30,
          expect: { delivered: [{ flow: 'Greystone ASNs', to: 'sftp-server', min: 0.99 }, { flow: 'Pelham ASNs', to: 'sftp-server', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'Greystone\'s server hangs',
          about: 'Greystone\'s SFTP server accepts connections and then hangs for 30 minutes. Pelham\'s notices keep arriving the whole time, and Greystone\'s arrive once its server recovers.',
          traffic: [grey, pel],
          incidents: [{ hang: { type: 'sftp-server', label: 'Greystone' }, at: 5, forMin: 30 }],
          durationMin: 90,
          expect: { delivered: [{ flow: 'Pelham ASNs', to: 'sftp-server', min: 0.99 }, { flow: 'Greystone ASNs', to: 'sftp-server', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'Notices for a closed store',
          about: 'One notice in a hundred is for a store Pelham has closed, and its server refuses it every time. Those end on Pelham\'s dead-letter queue.',
          traffic: [{ ...pel, poison: 0.01 }],
          durationMin: 120,
          expect: { dlq: { min: 1 } },
        },
      ],
    },
  },
  description: `
Ashdown Toys, a fictional toy maker, sends an advance shipping notice (ASN) file to each retailer for every delivery. Each retailer takes them only on **its own SFTP server**. Two retailers take most of the volume, Greystone and Pelham, so the team models those two.

Today one sender reads one queue and uploads to every retailer in turn. Last month Greystone's server accepted connections and then hung. The sender's threads waited on Greystone, and Pelham's notices stopped too. Pelham's stores could not receive deliveries for half an hour.

**Numbers**
- About **30 notices a second** to each retailer at busy times.
- An upload takes under a second normally.
- A retailer's server can hang for **half an hour**.
- About **1 notice in 100** is for a store a retailer has closed; it can never be delivered.
- In this model a failed delivery is tried again about once a minute, one vCore serves about 500 requests a second, and the smallest size is 0.1 vCore.

**Questions:**
- Draw the design.
- Why did one hung server stop the other retailer, and how does your design prevent it?
- Choose the redelivery limits, and size the Process API.
- What would you change if there were 40 retailers?
`,
  answerTemplate: `## Design

## Why one server stopped both

## Limits

## Forty retailers
`,
  keyPoints: [
    'A hung server holds every thread that calls it until the timeout. With one shared sender, those are the threads the other retailer needed.',
    'A queue and a sender per retailer is a bulkhead: a hang fills one compartment and leaves the others dry.',
    'Notices for the hung retailer wait on its queue and flow again when the server recovers. A limit of 60 covers 30 minutes with room.',
    'A notice for a closed store fails every time. After the limit it moves to that retailer\'s DLQ, so the account team for that retailer sees it.',
    'Short timeouts and a circuit breaker in each sender also help: they free threads sooner when a server stops answering.',
  ],
  solution: `
**Design**
\`\`\`
Warehouse app ─► prc-asn ~► asn.greystone ~► asn-sender-greystone ─► Greystone SFTP
                        ~► asn.pelham    ~► asn-sender-pelham    ─► Pelham SFTP
          (each queue ~► its own DLQ)
\`\`\`

**Limits.** 60 deliveries on both queues.

**Sizing.** The Process API takes 60 notices a second for both retailers: more than the 50 a second of 0.1 vCore, so give it 0.5 vCore.

**Forty retailers.** Forty apps is a lot to run. Group small retailers on a shared queue and sender, and give the few large ones their own. Or keep one sender app with a separate flow and thread limit per retailer, which gives the same isolation inside one app.

**Timeouts.** Set the sender's connection and read timeouts to a few seconds above a normal upload, so a hang is noticed quickly.
`,
  followUps: [
    {
      q: 'Could one sender with a circuit breaker per retailer do the same?',
      a: 'Mostly. The breaker opens after failures and stops calls to the hung server, freeing threads. The first minutes before it opens still hurt others, which separate senders avoid.',
    },
    {
      q: 'Where does the Process API learn which retailer a notice is for?',
      a: 'From the delivery: the customer on the order picks the queue. A table maps customers to queues, so adding a retailer is a row and a queue.',
    },
  ],
}

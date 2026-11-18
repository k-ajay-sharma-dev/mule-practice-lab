import { diagram } from '../../arch/dsl.js'

const orders = { name: 'partner orders', from: 'batch-job', rps: 6, to: ['sftp-server', 'erp'], kind: 'write' }
const invoices = { name: 'partner invoices', from: 'batch-job', rps: 2, to: ['sftp-server', 'saas'], kind: 'write' }

export default {
  id: 'uc-171',
  category: 'use-cases',
  title: 'One SFTP Server for 120 Trading Partners: a Collector That Sorts Files by Type Onto Their Own Queues, So an Invoice Outage Never Holds Up Orders',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'sftp', 'b2b', 'queues', 'dlq', 'isolation', 'distribution'],
  estMinutes: 40,
  diagram: {
    task: 'draw the trading partners putting files on the company SFTP server, and a collector job that reads them. It puts orders on an orders queue and invoices on an invoices queue, each with its own dead-letter queue. An orders Process API creates orders in the ERP through an ERP System API. An invoices Process API posts invoices to the finance system through a finance System API.',
    checks: [
      { label: 'Partners put files on the SFTP server', rule: { type: 'edge', from: 'partner', to: 'sftp-server' } },
      { label: 'The collector job reads the SFTP server', rule: { type: 'edge', from: 'batch-job', to: 'sftp-server' } },
      { label: 'Orders and invoices go to separate queues', rule: { type: 'node', match: 'queue', min: 2 } },
      { label: 'Each queue has its own dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Orders reach the ERP through a queue', rule: { type: 'path', from: 'batch-job', via: 'queue', to: 'erp' } },
      { label: 'Invoices reach the finance system through a queue', rule: { type: 'path', from: 'batch-job', via: 'queue', to: 'saas' } },
    ],
    reference: diagram(
      {
        ptn: ['partner', 'Trading partners'],
        sftp: ['sftp-server', 'B2B SFTP server'],
        job: ['batch-job', 'b2b-file-collector'],
        qO: ['queue', 'b2b.orders', { maxRedelivery: 75 }],
        dO: ['dlq', 'b2b.orders.dlq'],
        qI: ['queue', 'b2b.invoices', { maxRedelivery: 75 }],
        dI: ['dlq', 'b2b.invoices.dlq'],
        pO: ['process-api', 'prc-partner-orders'],
        sE: ['system-api', 'sys-erp'],
        erp: ['erp', 'Distribution ERP'],
        pI: ['process-api', 'prc-partner-invoices'],
        sF: ['system-api', 'sys-finance'],
        fin: ['saas', 'Finance system'],
      },
      ['ptn -> sftp', 'job -> sftp', 'job ~> qO', 'job ~> qI', 'qO ~> pO', 'qO ~> dO', 'qI ~> pI', 'qI ~> dI', 'pO -> sE', 'sE -> erp', 'pI -> sF', 'sF -> fin'],
    ),
    simulation: {
      systems: [
        { match: 'sftp-server', latencyMs: 300 },
        { match: 'erp', latencyMs: 200 },
        { match: 'saas', latencyMs: 400 },
      ],
      tests: [
        {
          name: 'A normal day',
          about: 'About 6 orders and 2 invoices a second. Every one reaches its system.',
          traffic: [orders, invoices],
          durationMin: 30,
          expect: { delivered: [{ flow: 'partner orders', to: 'erp', min: 0.99 }, { flow: 'partner invoices', to: 'saas', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'The finance system is down for an hour',
          about: 'Invoices wait on their queue and all arrive afterwards. Orders keep reaching the ERP the whole time, and nothing lands on a dead-letter queue.',
          traffic: [orders, invoices],
          incidents: [{ down: 'saas', at: 5, forMin: 60 }],
          durationMin: 120,
          expect: { delivered: [{ flow: 'partner orders', to: 'erp', min: 0.99 }, { flow: 'partner invoices', to: 'saas', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'Orders with an unknown item',
          about: 'One order in a hundred has an item code the ERP does not know. Those end on the orders dead-letter queue, and the queue does not keep growing.',
          traffic: [{ ...orders, poison: 0.01 }],
          durationMin: 180,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 400 }] },
        },
      ],
    },
  },
  description: `
Ferrand Supplies, a fictional wholesale distributor, trades with 120 partners that cannot call APIs. Each partner logs in to Ferrand's **SFTP server** and drops files in its own folder: orders, and invoices for goods Ferrand bought.

A collector job reads the files. Today it calls the ERP for orders and the finance system for invoices, one file after another. When the finance system was down for an afternoon, invoice files failed, the collector kept retrying them, and orders behind them waited too.

**Numbers**
- About **6 orders and 2 invoices a second** during the day.
- The finance system is down for up to **an hour** for its own releases.
- About **1 order in 100** has an item code the ERP does not know.
- In this model a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- How does your design keep a finance outage from holding up orders?
- Why give each queue its own dead-letter queue?
- Choose the redelivery limits.
`,
  answerTemplate: `## Design

## Keeping types apart

## Dead-letter queues

## The limits
`,
  keyPoints: [
    'The collector only sorts: it reads a file, decides its type from the folder or name, and publishes to that type\'s queue. It never waits on the ERP or finance.',
    'One queue per type means one consumer per type. A finance outage fills the invoices queue and leaves the orders queue untouched.',
    'A dead-letter queue per type sends bad orders to the people who fix orders, and bad invoices to accounts.',
    'An hour of downtime is about 60 deliveries. A limit of 75 covers it; no limit lets a bad order circle for ever.',
    'The collector archives a file once its messages are published, so a partner sees the file leave its folder quickly.',
  ],
  solution: `
**Design**
\`\`\`
Trading partners ─► B2B SFTP server ◄─ b2b-file-collector ~► b2b.orders   ~► prc-partner-orders   ─► sys-erp     ─► ERP
                                                          ~► b2b.invoices ~► prc-partner-invoices ─► sys-finance ─► Finance
          b2b.orders ~► b2b.orders.dlq        b2b.invoices ~► b2b.invoices.dlq
\`\`\`

**Limits.** 75 deliveries on both queues.

**Large files.** A partner's 10,000 line order file becomes 10,000 messages, or one message pointing at the stored file. Agree a size above which the collector stores the file and sends a claim check.

**New partners.** A row in a partner table names the folder and the types it may send, so a new partner is set up without a deployment.
`,
  followUps: [
    {
      q: 'Why not one queue with a type header and two consumers that filter?',
      a: 'Anypoint MQ and JMS queues hand each message to one consumer. Filtering would make the wrong consumer take and return messages. Separate queues are clearer and fail separately.',
    },
    {
      q: 'Where do acknowledgement files for partners come from?',
      a: 'A small flow after each Process API writes a result file to the partner\'s folder, or a daily summary per partner, as agreed in the partner\'s contract.',
    },
  ],
}

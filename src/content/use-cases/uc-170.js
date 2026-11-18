import { diagram } from '../../arch/dsl.js'

const sales = { name: 'sales out', from: { type: 'batch-job', label: 'sales' }, rps: 1, to: ['database', 'sftp-server'], kind: 'write' }
const orders = { name: 'orders back', from: { type: 'batch-job', label: 'orders' }, rps: 4, to: ['sftp-server', 'erp'], kind: 'write' }

export default {
  id: 'uc-170',
  category: 'use-cases',
  title: 'Sales Out and Purchase Orders Back Through the Planning Platform\'s SFTP Server: Two Jobs, a Queue in Front of the ERP, and Settings for Big Files and Bad Orders',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'sftp', 'planning', 'queues', 'dlq', 'timeout', 'erp', 'retail'],
  estMinutes: 40,
  diagram: {
    task: 'draw a sales export job that reads the store sales database and writes files to the planning platform\'s SFTP server. Draw an orders collector job that reads purchase order files from the same server and puts each order on a queue with a dead-letter queue. An orders Process API reads the queue and creates the orders in the ERP through an ERP System API.',
    checks: [
      { label: 'The sales export job writes to the SFTP server', rule: { type: 'edge', from: { type: 'batch-job', label: 'sales' }, to: 'sftp-server' } },
      { label: 'The orders collector reads the SFTP server', rule: { type: 'edge', from: { type: 'batch-job', label: 'orders' }, to: 'sftp-server' } },
      { label: 'Orders wait on a queue before they reach the ERP', rule: { type: 'path', from: 'batch-job', via: 'queue', to: 'erp' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'The ERP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
    ],
    reference: diagram(
      {
        db: ['database', 'Store sales database'],
        sales: ['batch-job', 'sales-export', { timeoutMs: 60000 }],
        sftp: ['sftp-server', 'Planning platform SFTP'],
        plat: ['saas', 'Planning platform'],
        col: ['batch-job', 'po-orders-collector'],
        q: ['queue', 'po.orders', { maxRedelivery: 60 }],
        dlq: ['dlq', 'po.orders.dlq'],
        prc: ['process-api', 'prc-purchase-orders'],
        sys: ['system-api', 'sys-erp-orders'],
        erp: ['erp', 'Merchandising ERP'],
      },
      ['sales -> db', 'sales -> sftp', 'plat -> sftp', 'col -> sftp', 'col ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sys', 'sys -> erp'],
    ),
    simulation: {
      systems: [
        { match: 'database', latencyMs: 50 },
        { match: 'sftp-server', latencyMs: 500 },
        { match: 'erp', latencyMs: 250 },
      ],
      tests: [
        {
          name: 'A normal night',
          about: 'Sales files go out, and about 4 orders a second come back. Every file is written and every order reaches the ERP.',
          traffic: [sales, orders],
          durationMin: 30,
          expect: { answers: [{ flow: 'sales out', minSuccess: 0.99 }], delivered: [{ flow: 'orders back', to: 'erp', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'The weekly full sales file',
          about: 'On Sundays the sales files are full histories, and each upload takes about 25 seconds. Every one is written.',
          traffic: [sales],
          incidents: [{ slow: 'sftp-server', latencyMs: 25000, at: 0, forMin: 30 }],
          durationMin: 30,
          expect: { answers: [{ flow: 'sales out', minSuccess: 0.99 }] },
        },
        {
          name: 'ERP patching',
          about: 'The ERP is down for 40 minutes. Orders wait on the queue and all arrive afterwards, with none on the dead-letter queue.',
          traffic: [orders],
          incidents: [{ down: 'erp', at: 5, forMin: 40 }],
          durationMin: 90,
          expect: { delivered: [{ flow: 'orders back', to: 'erp', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'Orders for a supplier the ERP has closed',
          about: 'One order in a hundred names a closed supplier and can never be created. Those end on the dead-letter queue, and the queue does not keep growing.',
          traffic: [{ ...orders, poison: 0.01 }],
          durationMin: 180,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 200 }] },
        },
      ],
    },
  },
  description: `
Larkfield Grocers, a fictional grocery chain, exchanges files with the planning platform through the **platform's SFTP server**:

- **Out**: each night a job reads store sales from the store sales database and writes CSV files to the server. On Sundays the files are full histories.
- **Back**: the platform writes purchase order files to the same server. A collector job reads them and creates the orders in the merchandising **ERP**, through an ERP System API.

The old design created orders straight from the collector. During ERP patching it failed, and orders were missed until someone reran it by hand.

**Numbers**
- About **1 sales file a second** and **4 orders a second** at night.
- A Sunday full history file takes about **25 seconds** to upload.
- ERP patching takes up to **40 minutes** a month.
- About **1 order in 100** names a supplier the ERP has closed.
- In this model calls time out after 10 seconds unless set otherwise, and a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- Why a queue on the way back, but not on the way out?
- Set the timeout and the redelivery limit, and explain each.
- What should happen to an order for a closed supplier?
`,
  answerTemplate: `## Design

## Out and back are different

## Settings

## Orders that can never be created
`,
  keyPoints: [
    'Out is a file the platform loads at a set time: one job, written in one go. Back is many orders the ERP must create: a queue lets each wait for the ERP on its own.',
    'A 25 second upload needs a timeout above it on the sales job. 60 seconds leaves room.',
    'A limit of 60 deliveries covers 40 minutes of patching.',
    'No limit lets a closed supplier\'s order cycle for ever; a limit sends it to the DLQ, where buyers can redirect it.',
    'The collector moves an order file to an archive folder once every order in it is on the queue, never before.',
  ],
  solution: `
**Design**
\`\`\`
Store sales database ◄─ sales-export ─► Planning platform SFTP ◄─ Planning platform
                                         ▲
                       po-orders-collector ~► po.orders ~► prc-purchase-orders ─► sys-erp-orders ─► ERP
                                                       ~► po.orders.dlq
\`\`\`

**Settings.** \`sales-export\`: 60 second timeout. \`po.orders\`: 60 deliveries before the DLQ.

**Safe repeats.** Each order carries the platform's order line ID. The ERP System API checks it, so a redelivery never creates an order twice.

**Files on the server.** The sales job writes a temporary name and renames, and the collector skips files still changing, because both sides share one server.
`,
  followUps: [
    {
      q: 'Who works the dead-letter queue?',
      a: 'The buying team, through a small screen or a daily email: they choose a new supplier or cancel the line, and support moves the message back.',
    },
    {
      q: 'Why does the collector not wait for the ERP before archiving the file?',
      a: 'Once each order is on a persistent queue it is safe. Archiving then means "every order was handed over", and the queue tracks the rest.',
    },
  ],
}

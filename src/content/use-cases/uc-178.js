import { diagram } from '../../arch/dsl.js'

const lines = { name: 'purchase order lines', from: 'batch-job', rps: 8, to: ['sftp-server', 'erp'], kind: 'write' }

export default {
  id: 'uc-178',
  category: 'use-cases',
  title: 'Purchase Order Plans From the Planning Platform\'s FTP Server Into an ERP That Takes 20 Calls a Second: a Queue to Absorb the Rush, Retries for a Busy ERP, and a Limit That Outlasts Patching',
  level: 'ADVANCED',
  tags: ['myproject', 'ftp', 'plans', 'queues', 'dlq', 'rate-limit', 'retry', 'erp'],
  estMinutes: 45,
  diagram: {
    task: 'draw the planning platform writing purchase order files to its FTP server. A collector job reads each file and puts each order line on a queue with a dead-letter queue. A purchase orders Process API reads the queue and creates the lines through an ERP System API. The collector never waits on the ERP.',
    checks: [
      { label: 'A collector job reads the planning platform\'s FTP server', rule: { type: 'edge', from: 'batch-job', to: 'sftp-server' } },
      { label: 'Order lines wait on a queue before they reach the ERP', rule: { type: 'path', from: 'batch-job', via: 'queue', to: 'erp' } },
      { label: 'The collector never calls the ERP and waits for it', rule: { type: 'no-path', from: 'batch-job', to: 'erp', kind: 'sync' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'The ERP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
    ],
    reference: diagram(
      {
        plat: ['saas', 'Planning platform'],
        ftp: ['sftp-server', 'Planning platform FTP'],
        job: ['batch-job', 'po-collector'],
        q: ['queue', 'po.lines', { maxRedelivery: 100 }],
        dlq: ['dlq', 'po.lines.dlq'],
        prc: ['process-api', 'prc-purchase-orders'],
        sys: ['system-api', 'sys-erp-po', { retries: 2 }],
        erp: ['erp', 'Merchandising ERP'],
      },
      ['plat -> ftp', 'job -> ftp', 'job ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sys', 'sys -> erp'],
    ),
    simulation: {
      systems: [
        { match: 'sftp-server', latencyMs: 800 },
        { match: 'erp', latencyMs: 300, maxRps: 20 },
      ],
      tests: [
        {
          name: 'The morning rush',
          about: 'Right after the planning run, 40 lines a second arrive for 15 minutes, twice what the ERP takes. The queue holds the rest, and every line is created within the hour.',
          traffic: [{ ...lines, rps: 40, forMin: 15 }],
          durationMin: 60,
          expect: { delivered: [{ to: 'erp', min: 0.99 }], backlog: [{ queue: 'queue', minPeak: 100, maxEnd: 0 }], lost: { max: 0 } },
        },
        {
          name: 'The ERP is busy',
          about: 'For 20 minutes one ERP call in twenty fails with a lock timeout. Quick retries in the System API get them through at once, so lines do not pile up on the queue waiting a minute for redelivery.',
          traffic: [lines],
          incidents: [{ errors: 'erp', rate: 0.05, at: 0, forMin: 20 }],
          durationMin: 20,
          expect: { delivered: [{ to: { type: 'system-api', label: 'erp' }, min: 0.99 }], backlog: [{ queue: 'queue', maxPeak: 5 }], dlq: { max: 0 } },
        },
        {
          name: 'ERP patching',
          about: 'The ERP is down for 70 minutes. Lines wait on the queue and all arrive afterwards. None lands on the dead-letter queue.',
          traffic: [lines],
          incidents: [{ down: 'erp', at: 5, forMin: 70 }],
          durationMin: 150,
          expect: { delivered: [{ to: 'erp', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'A line for a blocked supplier',
          about: 'One line in two hundred names a supplier the ERP has blocked. Those go to the dead-letter queue, and the queue does not keep growing.',
          traffic: [{ ...lines, poison: 0.005 }],
          durationMin: 200,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 300 }] },
        },
      ],
    },
  },
  description: `
Marrow & Pine Home, a fictional homewares retailer, raises purchase orders from the planning platform's plans. The platform writes PO files to **its FTP server**; each line must be created in the **merchandising ERP** through its API.

The ERP team allows **20 calls a second** and no more. The first design read a file and created the lines straight away. Right after a planning run it called the ERP far faster than that, got refused, and failed whole files.

**Numbers**
- Normally about **8 lines a second**. Right after a planning run, about **40 a second** for 15 minutes.
- The ERP takes **20 calls a second**. When it is busy, about **1 call in 20** fails with a lock timeout and works a moment later.
- ERP patching takes up to **70 minutes** a month.
- About **1 line in 200** names a supplier the ERP has blocked. It will never load.
- In this model a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- How does the queue keep the ERP at its 20 calls a second? How long does the rush take to clear?
- Where do you retry a lock timeout, and why there?
- Choose the queue's redelivery limit.
`,
  answerTemplate: `## Design

## Holding the rush

## Retries

## The redelivery limit
`,
  keyPoints: [
    'The collector only reads and publishes, at any speed. The Process API takes lines off the queue no faster than the ERP allows.',
    'The rush brings about 18,000 lines more than the ERP takes in those 15 minutes. At 20 a second the queue clears them in about 15 more minutes.',
    'Retry a lock timeout in the System API, a moment later. It is short and partial; sending it back to the queue would wait a whole minute.',
    'With a retry about once a minute, 70 minutes of patching needs more than 70 deliveries. 100 leaves room.',
    'Each line carries the plan run and line number, so the ERP System API can refuse a repeat.',
  ],
  solution: `
**Design**
\`\`\`
Planning platform ─► Planning platform FTP ◄─ po-collector ~► po.lines ~► prc-purchase-orders ─► sys-erp-po ─► ERP
                                                           ~► po.lines.dlq
\`\`\`

**Settings.** \`sys-erp-po\`: 2 retries. \`po.lines\`: 100 deliveries before the DLQ.

**Keeping to 20 a second.** Limit the consumers on the queue (prefetch and concurrency on the subscriber), or put a rate limit on the System API. The queue holds what waits.

**Files.** The collector moves a PO file to \`archive\` on the FTP server once every line is on the queue.
`,
  followUps: [
    {
      q: 'The buyers want each PO created whole, not line by line. What changes?',
      a: 'Publish one message per PO with its lines, and have the System API create the header and lines in one ERP call or one transaction. A bad line then fails the whole PO, which goes to the DLQ as a unit.',
    },
    {
      q: 'What tells you the rush is getting worse each month?',
      a: 'The queue\'s peak depth and the time to drain it. Alert when the drain time nears the next planning run.',
    },
  ],
}

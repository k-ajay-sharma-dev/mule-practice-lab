import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-132',
  category: 'architecture',
  title: 'A Nightly Batch Job from an ERP to a Data Warehouse',
  level: 'BEGINNER',
  tags: ['batch', 'scheduler', 'erp', 'database'],
  estMinutes: 10,
  diagram: {
    task: 'draw a nightly job that copies sales from the ERP to the data warehouse. Use four boxes: a Batch / scheduled job, a System API, an ERP, and a Data warehouse. Draw a line from the job to the System API, a line from the System API to the ERP, and a line from the job to the Data warehouse. Each line points from the caller to the system it calls. Draw no line from the job to the ERP, or from the ERP to the Data warehouse.',
    checks: [
      { label: 'The job calls the System API to read sales', rule: { type: 'edge', from: 'batch-job', to: 'system-api' } },
      { label: 'The System API reaches the ERP', rule: { type: 'edge', from: 'system-api', to: 'erp' } },
      { label: 'The job writes to the data warehouse', rule: { type: 'edge', from: 'batch-job', to: 'data-warehouse' } },
      { label: 'The job never calls the ERP directly', rule: { type: 'no-edge', from: 'batch-job', to: 'erp' } },
      { label: 'The ERP is not wired straight to the data warehouse', rule: { type: 'no-edge', from: 'erp', to: 'data-warehouse' } },
      { label: 'No user waits and there is no queue, so the job reads and writes with sync calls', rule: { type: 'lines', from: ['batch-job', 'system-api'], to: ['system-api', 'erp', 'data-warehouse'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'Nightly sales job', { vCores: '0.2' }],
        sys: ['system-api', 'Sales System API', { vCores: '0.2', retries: 2 }],
        erp: ['erp', 'ERP'],
        dwh: ['data-warehouse', 'Sales data warehouse'],
      },
      ['job -> sys', 'sys -> erp', 'job -> dwh'],
    ),
    simulation: {
      systems: [
        { match: 'erp', latencyMs: 200, maxRps: 100 },
        { match: 'data-warehouse', latencyMs: 100 },
      ],
      tests: [
        {
          name: 'The nightly run',
          about: 'The job copies 80 sales a second for an hour. Every sale reaches the warehouse, the ERP stays under its night limit of 100 reads a second, and the APIs stay inside 1 vCore.',
          traffic: [{ name: 'sales', from: 'batch-job', rps: 80, to: ['erp', 'data-warehouse'] }],
          durationMin: 60,
          expect: { answers: [{ minSuccess: 0.99 }], peakRps: [{ node: 'erp', max: 100 }], vCores: { max: 1 } },
        },
        {
          name: 'The ERP drops some calls',
          about: 'While the ERP backup runs, one read in ten fails with a short lock error. A second try works, so almost every sale must still be copied.',
          traffic: [{ name: 'sales', from: 'batch-job', rps: 80, to: ['erp', 'data-warehouse'] }],
          incidents: [{ errors: 'erp', rate: 0.1 }],
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
A retailer keeps sales in its **ERP**, the main business system. Managers want reports each morning, and heavy report queries must not slow the ERP by day.

So a **batch job** runs at 2 AM. A batch job is work that runs over many records with no user waiting, often on a schedule. This one copies the day's sales to a **data warehouse**, a database built for reports.

The job copies about **80** sales a second for an hour. At night the ERP allows up to **100** reads a second and answers in about **200 ms**. While its backup runs, about **one read in ten** fails with a short lock error that goes away on a second try. The budget for the APIs is **1 vCore**.

**Questions:**
- Draw the design.
- Why does this not need a queue?
`,
  answerTemplate: `## Design

## Why no queue
`,
  keyPoints: [
    'This job starts from a clock, not from a user or a message.',
    'It suits work that can wait, such as morning reports.',
    'The job reads through a System API, so it does not depend on ERP details.',
    'The warehouse takes the report load, so the ERP stays free in the day.',
    'Retries on the System API cover short ERP errors, so a lock error does not lose a sale.',
  ],
  solution: `
**Design.**
\`\`\`
 Nightly sales job ─► Sales System API ─► ERP
         │
         └─► Sales data warehouse
\`\`\`
The arrows show who calls whom. Data comes back from the ERP on the first call, then goes out to the warehouse.

**Why no queue.** Nobody is waiting, and the data is needed once a day. A timed job is the smallest design that does the work. In Mule you start the flow with a \`Scheduler\`, and a cron expression sets the time.

**Sizing and failure handling.** The job and the System API each handle 80 sales a second, so 0.2 vCore each is enough, 0.4 vCore in all. At 0.1 vCore they could handle only about 50. The ERP fails about one read in ten during its backup. Two retries on the System API turn that into about one in a thousand, so the run copies almost every sale.
`,
  followUps: [
    {
      q: 'How does the job avoid copying the same sales twice?',
      a: 'It stores a watermark, a saved marker such as the last sale time it copied. The next run reads only newer sales.',
    },
    {
      q: 'When would you move away from a nightly job?',
      a: 'When people need fresher data than once a day. Then an event driven design fits better.',
    },
  ],
}

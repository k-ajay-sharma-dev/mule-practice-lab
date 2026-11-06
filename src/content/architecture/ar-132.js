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
    ],
    reference: diagram(
      {
        job: ['batch-job', 'Nightly sales job'],
        sys: ['system-api', 'Sales System API'],
        erp: ['erp', 'ERP'],
        dwh: ['data-warehouse', 'Sales data warehouse'],
      },
      ['job -> sys', 'sys -> erp', 'job -> dwh'],
    ),
  },
  description: `
A retailer keeps sales in its **ERP**, the main business system. Managers want reports each morning, and heavy report queries must not slow the ERP by day.

So a **batch job** runs at 2 AM. A batch job is work that runs over many records with no user waiting, often on a schedule. This one copies the day's sales to a **data warehouse**, a database built for reports.

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

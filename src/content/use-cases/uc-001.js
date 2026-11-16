import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-001',
  category: 'use-cases',
  title: 'Nightly Product Sync from ERP to E-commerce',
  level: 'BEGINNER',
  tags: ['scheduler', 'sync', 'watermark'],
  estMinutes: 15,
  diagram: {
    task: 'draw the nightly sync: the scheduled job, where the watermark lives, the ERP database it reads from, the e-commerce platform it writes to, and where failures are reported.',
    checks: [
      { label: 'A scheduled batch job runs the nightly sync', rule: { type: 'node', match: 'batch-job' } },
      { label: 'The job reads changed products from the ERP database', rule: { type: 'path', from: 'batch-job', to: ['erp', 'database'] } },
      { label: 'The watermark is kept in a persistent store (Object Store)', rule: { type: 'edge', from: 'batch-job', to: { type: ['cache', 'database'], label: ['watermark', 'object store', 'state'] } } },
      { label: 'The job pushes products in chunks to the e-commerce platform', rule: { type: 'path', from: 'batch-job', to: ['saas', 'external-api'] } },
      { label: 'Failed records are reported (log/alert/email)', rule: { type: 'edge', from: 'batch-job', to: ['notification', 'monitoring'] } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'Nightly product sync (Batch Job, aggregator 500)', { timeoutMs: 30000, retries: 2 }],
        wm: ['cache', 'Watermark (persistent Object Store)'],
        erp: ['erp', 'ERP products DB'],
        shop: ['saas', 'E-commerce platform (bulk upsert)'],
        rep: ['notification', 'Failed-records report'],
      },
      ['job -> wm', 'job -> erp', 'job -> shop', 'job -> rep'],
    ),
    simulation: {
      systems: [
        { match: 'erp', latencyMs: 200 },
        { match: 'saas', latencyMs: 12000 },
      ],
      tests: [
        {
          name: 'A normal night',
          about: 'The job sends 1 bulk call of 500 products a second for 30 minutes. Each bulk upsert takes the platform about 12 seconds, so every chunk must be written.',
          traffic: [{ name: 'chunks', from: 'batch-job', rps: 1, forMin: 30, to: ['erp', 'saas'], kind: 'write' }],
          durationMin: 40,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
        {
          name: 'The platform fails some calls',
          about: 'For the whole run the e-commerce platform answers 1 bulk call in 10 with an error. Retrying a failed chunk is safe because the target is an upsert, and almost every chunk gets in.',
          traffic: [{ name: 'chunks', from: 'batch-job', rps: 1, forMin: 30, to: ['erp', 'saas'], kind: 'write' }],
          incidents: [{ errors: 'saas', rate: 0.1 }],
          durationMin: 40,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
The e-commerce site must show the latest **price and stock** for ~200k products held in an ERP database.

- The ERP has a \`last_modified\` column on the products table.
- The e-commerce platform has a bulk REST endpoint accepting up to 500 products per call.
- The sync must finish within 1 hour, nightly.
- A bulk call of 500 products takes the platform about 12 seconds, the job sends 1 a second, and about 1 call in 10 fails with an error on a bad night.

**Describe your solution:** how you detect changes, how you move the data, and how you recover if the job fails halfway.
`,
  answerTemplate: `## Detecting changes

## Moving the data

## Recovery
`,
  keyPoints: [
    'Scheduler trigger; query only rows changed since the last run (watermark on last_modified).',
    'Store the watermark in a persistent Object Store and update it only after success.',
    'Stream the query and send in chunks of 500 (batch aggregator or groupBy/chunking).',
    'Upsert semantics on the target so reruns are safe (idempotent).',
    'Failed chunks logged/retried; the job can be re-run from the last saved watermark.',
  ],
  solution: `
**Detect changes with a watermark.** A Scheduler starts the flow nightly. Read the last watermark from a **persistent Object Store**, then query \`WHERE last_modified > :watermark\` (with streaming enabled).

**Move in chunks.** Use a Batch Job with a **Batch Aggregator of 500**, mapping rows to the e-commerce format in DataWeave and calling the bulk endpoint. Because the target is an upsert, sending the same product twice is harmless.

**Recover safely.** Save the new watermark (max \`last_modified\` processed) **only after the job completes** without fatal errors. If it fails halfway, the next run re-reads from the old watermark and re-sends — safe because of idempotent upserts. Failed records are logged with IDs and reported in the On Complete phase.
`,
}

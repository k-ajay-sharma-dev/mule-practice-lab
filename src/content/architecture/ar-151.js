import { diagram } from '../../arch/dsl.js'

const raw = { type: 's3-bucket', label: 'raw' }
const extractJob = { type: 'batch-job', label: 'extract' }
const curateJob = { type: 'batch-job', label: ['curate', 'curation'] }
const extract = { name: 'extract', from: extractJob, rps: 200, to: ['erp', raw], kind: 'write' }
const curate = { name: 'curate', from: curateJob, rps: 150, to: [raw, 'data-warehouse'], kind: 'write' }
const analysts = { name: 'analysts', from: 'internal-app', rps: 30, to: 'data-warehouse' }

export default {
  id: 'ar-151',
  category: 'architecture',
  title: 'A Data Lake Landing Zone: Land the Raw Extracts First, Curate Them Into the Warehouse After, and Keep Analysts Off the Raw Files',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'data-lake', 'landing-zone', 'batch', 's3', 'data-warehouse', 'analytics'],
  estMinutes: 30,
  diagram: {
    task: 'draw two jobs: an extract job that reads the ERP and writes the files unchanged to a raw landing zone in S3, and a curation job that reads the raw zone and loads cleaned tables into the data warehouse. Analysts use the warehouse only.',
    checks: [
      { label: 'An extract job reads the ERP', rule: { type: 'edge', from: extractJob, to: 'erp' } },
      { label: 'The extract job writes to the raw landing zone', rule: { type: 'edge', from: extractJob, to: raw } },
      { label: 'The extract job never writes to the warehouse itself', rule: { type: 'no-edge', from: extractJob, to: 'data-warehouse' } },
      { label: 'A curation job reads the raw zone', rule: { type: 'edge', from: curateJob, to: raw } },
      { label: 'The curation job loads the warehouse', rule: { type: 'edge', from: curateJob, to: 'data-warehouse' } },
      { label: 'Analysts query the warehouse', rule: { type: 'edge', from: 'internal-app', to: 'data-warehouse' } },
      { label: 'Analysts never reach the raw landing zone', rule: { type: 'no-path', from: 'internal-app', to: raw } },
    ],
    reference: diagram(
      {
        erp: ['erp', 'ERP (sales, stock, finance)'],
        ext: ['batch-job', 'Nightly extract job', { vCores: '0.5' }],
        raw: ['s3-bucket', 'raw landing zone (files kept as received)'],
        cur: ['batch-job', 'curate job (clean, join, load)', { vCores: '0.5' }],
        dw: ['data-warehouse', 'Data warehouse (curated tables)'],
        bi: ['internal-app', 'Analysts and dashboards'],
      },
      ['ext -> erp', 'ext -> raw', 'cur -> raw', 'cur -> dw', 'bi -> dw'],
    ),
    simulation: {
      systems: [
        { match: 'erp', latencyMs: 40, maxRps: 400 },
        { match: 's3-bucket', latencyMs: 30 },
        { match: 'data-warehouse', latencyMs: 60, maxRps: 600 },
      ],
      tests: [
        {
          name: 'The nightly load',
          about: 'The extract job pulls 200 records a second from the ERP into the raw zone while the curation job loads 150 a second into the warehouse. Both finish without errors.',
          traffic: [extract, curate],
          durationMin: 60,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
        {
          name: 'Analysts during the load',
          about: 'Analysts run 30 queries a second while the jobs run. They are answered from the warehouse, and none of them reaches the raw zone.',
          traffic: [extract, curate, analysts],
          durationMin: 30,
          expect: { answers: [{ flow: 'analysts', minSuccess: 0.99 }], notReached: [{ flow: 'analysts', node: raw }] },
        },
        {
          name: 'The warehouse is down for maintenance',
          about: 'The warehouse is down for 40 minutes during the night. Curation fails and will run again, but the extract still lands every file in the raw zone, so nothing has to be pulled from the ERP twice.',
          traffic: [extract, curate],
          incidents: [{ down: 'data-warehouse', at: 10, forMin: 40 }],
          durationMin: 60,
          expect: { answers: [{ flow: 'extract', minSuccess: 0.99 }], delivered: [{ flow: 'extract', to: raw, min: 0.99 }] },
        },
      ],
    },
  },
  description: `
A grocery wholesaler loads sales, stock and finance data from its **ERP** into a **data warehouse** every night. Today one job reads the ERP, cleans the data and writes straight into the warehouse tables.

Three things keep going wrong:
- When the warehouse is down for maintenance, the job fails and has to read the ERP again the next night, which the ERP team dislikes.
- When a cleaning rule was wrong for two weeks, nobody could rebuild the old figures, because the ERP had moved on and the original extracts were gone.
- Some analysts read the job's temporary files directly, and their dashboards broke each time the format changed.

The data team wants a **landing zone** in Amazon S3: every extract is kept exactly as received, by date, and the warehouse is loaded from there.

**Numbers:** the extract reads about **200 records a second** from the ERP for an hour. Curation loads about **150 a second**. Analysts run about **30 queries a second** in the day.

**Questions:**
- Draw the two stages. Why keep the raw files unchanged?
- What happens when the warehouse is down during the night?
- Why should analysts never read the raw zone?
`,
  answerTemplate: `## Design

## Why keep the raw files

## When the warehouse is down

## What analysts use
`,
  keyPoints: [
    'Split the load into two stages: extract and land, then curate and load. Each can fail and run again on its own.',
    'The raw zone keeps each extract unchanged, in folders by source and date. It is the record of what the source said that night.',
    'A wrong cleaning rule can be fixed and the curated tables rebuilt from the raw files, without asking the ERP again.',
    'When the warehouse is down, the extract still lands its files. Curation runs later from the raw zone.',
    'Analysts use the curated warehouse only. The raw zone changes shape whenever a source does, so dashboards must not depend on it.',
    'Size each job for its own rate. In this model 200 records a second is more than the smallest size takes.',
  ],
  solution: `
**Design**
\`\`\`
ERP ◄─ Nightly extract job ─► raw landing zone (S3) ◄─ curate job ─► Data warehouse ◄─ Analysts
\`\`\`

**Why keep the raw files.** The raw zone is the only copy of what the ERP held on a given night. Keep the files as received, under paths such as \`raw/erp/sales/2026-11-17/\`, with a lifecycle rule that moves old ones to a cheaper storage class. When a cleaning rule turns out to be wrong, fix it and run curation again over the dates it affected.

**When the warehouse is down.** The extract job does not touch the warehouse, so it finishes on time and the ERP is read once. The curation job fails, and runs again when the warehouse is back, reading the same raw files.

**What analysts use.** The curated tables have names, types and meanings the data team keeps stable. The raw files change when the ERP changes. Give analysts no access to the raw bucket at all, so nobody builds a dashboard on it by accident.

**Sizing.** In this model one 0.1 vCore job handles about 50 records a second, so each job gets half a vCore for its 150 to 200 a second.
`,
  followUps: [
    {
      q: 'Should the raw zone hold personal data?',
      a: 'Only if the warehouse needs it. Mask or leave out fields at extract time when you can, encrypt the bucket, and give the raw zone a retention period that the data protection team agrees.',
    },
    {
      q: 'Is this a job for Mule at all?',
      a: 'Mule is a fair fit for the extract when the ERP is reached through APIs or files. Heavy joins and aggregations over months of data are often better done inside the warehouse or a data tool after landing.',
    },
  ],
}

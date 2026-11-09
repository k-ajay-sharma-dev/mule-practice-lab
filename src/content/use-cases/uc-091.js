import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-091',
  category: 'use-cases',
  title: 'Nightly Vendor Master Sync from SAP to Coupa',
  level: 'BEGINNER',
  tags: ['scheduler', 'sap', 'watermark', 'master-data', 'procurement', 'finance'],
  estMinutes: 15,
  diagram: {
    task: 'draw the nightly job that copies changed vendors from SAP S/4HANA into Coupa, including where the last-run watermark lives and how the master data team hears about rejected vendors.',
    checks: [
      { label: 'A scheduled job runs the nightly sync', rule: { type: 'node', match: 'batch-job' } },
      { label: 'The job reads changed vendors from SAP', rule: { type: 'path', from: 'batch-job', to: 'erp' } },
      { label: 'The job writes suppliers into Coupa', rule: { type: 'path', from: 'batch-job', to: 'saas' } },
      { label: 'SAP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Coupa is reached only through a System API', rule: { type: 'only-via', target: 'saas', from: 'system-api' } },
      { label: 'The last-run watermark is stored outside the job', rule: { type: 'edge', from: ['batch-job', 'process-api'], to: ['cache', 'database'] } },
      { label: 'Coupa never writes back into SAP (SAP stays the master)', rule: { type: 'no-path', from: 'saas', to: 'erp' } },
      { label: 'The master data team gets the vendors Coupa rejected', rule: { type: 'edge', from: ['batch-job', 'process-api', 'system-api'], to: 'notification' } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'Vendor sync (nightly 01:00)'],
        ssap: ['system-api', 'sys-sap-vendor-api'],
        scoupa: ['system-api', 'sys-coupa-supplier-api'],
        sap: ['erp', 'SAP S/4HANA (vendor master)'],
        coupa: ['saas', 'Coupa procurement'],
        wm: ['cache', 'Last-run watermark (Object Store)'],
        mail: ['notification', 'Rejected vendors to master data team'],
      },
      ['job -> ssap', 'ssap -> sap', 'job -> scoupa', 'scoupa -> coupa', 'job -> wm', 'job -> mail'],
    ),
  },
  description: `
A distribution company runs **SAP S/4HANA** as the master for vendors. Buyers raise requisitions and purchase orders in **Coupa**, so every active vendor must exist in Coupa as a supplier.

Facts:
- About **18,000 vendors** in SAP; on a normal day **150 to 200** are created or changed. After a yearly clean-up, up to 6,000 change in one night.
- SAP exposes the OData service \`API_BUSINESS_PARTNER\`. Each record has a \`LastChangeDateTime\`.
- Coupa has a REST API for suppliers. The supplier number in Coupa must equal the SAP vendor number.
- Vendors blocked for purchasing in SAP must become **inactive** in Coupa. They must never be deleted, because old POs refer to them.
- Bank details are **not** sent to Coupa. Payments run in SAP.
- The sync runs at 01:00 and must finish before buyers start at 07:00.

**Describe your solution:**
- How do you find only the vendors that changed?
- How do you create or update the supplier in Coupa?
- What happens when Coupa rejects a record?
- What do you do if the job fails halfway?
`,
  answerTemplate: `## Trigger and change detection

## Mapping to Coupa

## Errors and reruns
`,
  keyPoints: [
    'A Scheduler at 01:00 reads vendors changed since the stored watermark through sys-sap-vendor-api, with paging.',
    'The watermark is kept in a persistent Object Store or table and moved forward only after the run finishes.',
    'Upsert in Coupa by supplier number = SAP vendor number, so reruns do not create duplicates.',
    'Purchasing block in SAP maps to status inactive in Coupa; nothing is deleted and bank data is left out.',
    'Rejected records are collected and mailed to the master data team; the sync is one way from SAP.',
  ],
  solution: `
**Trigger.** A Scheduler at 01:00 starts the job. It reads the watermark (the \`LastChangeDateTime\` of the last successful run) from a persistent Object Store. It calls **sys-sap-vendor-api** with \`$filter=LastChangeDateTime gt <watermark>\` and pages through the results 500 at a time.

**Mapping.** DataWeave maps each business partner to a Coupa supplier: number, name, addresses, tax ID, payment terms code and status. A purchasing block becomes \`status: inactive\`. Bank details are dropped in the mapping, so they never leave SAP.

**Write to Coupa.** **sys-coupa-supplier-api** looks up the supplier by number. If it exists, the API updates it; if not, it creates it. Because the key is the SAP number, running the same batch twice gives the same result.

**Errors.** A record that Coupa rejects (missing country, invalid tax ID) is added to an error list and the job continues. At the end the list goes to the master data team by email. Connection errors are retried with reconnection; if the job still fails, the watermark is **not** moved, so the next run picks up the same vendors again.

**One direction only.** SAP is the master. Coupa users cannot edit supplier master data, and nothing flows back from Coupa to SAP. That avoids two systems fighting over the same record.
`,
  followUps: [
    { q: 'Why store the watermark at the start time of the run and not the end time?', a: 'Records changed in SAP while the job was running would be skipped otherwise. Saving the start time means the next run reads them, and the upsert makes the overlap harmless.' },
    { q: 'How do you handle the yearly clean-up with 6,000 changes?', a: 'Paging keeps memory flat. Coupa calls run with limited concurrency to stay under its rate limit, and the run still finishes inside the window.' },
    { q: 'Why not delete blocked vendors in Coupa?', a: 'Historic purchase orders and invoices point to the supplier record. Setting it inactive stops new orders while keeping history intact.' },
  ],
}

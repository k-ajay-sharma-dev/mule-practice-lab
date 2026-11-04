import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-036',
  category: 'use-cases',
  title: 'Supplier Catalog Onboarding (CSV/Excel) into the PIM',
  level: 'INTERMEDIATE',
  tags: ['excel', 'csv', 'validation', 'pim', 'batch', 'retail'],
  estMinutes: 25,
  diagram: {
    task: 'draw the supplier catalog onboarding pipeline: file intake, the import job with its mapping profiles and change-detection store, loading into the PIM, the error report back to the supplier and the separate image path.',
    checks: [
      { label: 'An import batch job reads the uploaded supplier files from file storage', rule: { type: 'edge', from: 'batch-job', to: 'file-store' } },
      { label: 'Mapping profiles and last-loaded product hashes are kept in stores the job reads (configuration, not code)', rule: { type: 'edge', from: 'batch-job', to: ['database', 'cache'], min: 2 } },
      { label: 'The PIM is reached only through a System API', rule: { type: 'only-via', target: 'saas', from: 'system-api' } },
      { label: 'Products are loaded from the job into the PIM end to end', rule: { type: 'path', from: 'batch-job', to: 'saas' } },
      { label: 'An error report goes back to the supplier', rule: { type: 'edge', from: ['batch-job', 'process-api'], to: 'notification' } },
      { label: 'Images are handed off asynchronously so they never block product data', rule: { type: 'edge', from: ['batch-job', 'process-api'], to: ['queue', 'topic'], kind: 'async' } },
      { label: 'Queued images are processed into the DAM / CDN', rule: { type: 'path', from: ['queue', 'topic'], to: 'file-store' } },
    ],
    reference: diagram(
      {
        s3: ['file-store', 'S3 supplier uploads'],
        job: ['batch-job', 'Catalog import batch job'],
        prof: ['database', 'Supplier mapping profiles'],
        hash: ['cache', 'Product hash store (per SKU)'],
        spim: ['system-api', 'sys-pim-api'],
        pim: ['saas', 'PIM (bulk import)'],
        rep: ['notification', 'Error report to supplier'],
        q: ['queue', 'image-jobs'],
        img: ['process-api', 'prc-image-processing'],
        dam: ['file-store', 'DAM / CDN'],
      },
      ['job -> s3', 'job -> prof', 'job -> hash', 'job -> spim', 'spim -> pim', 'job -> rep', 'job ~> q', 'q ~> img', 'img -> dam', 'img -> spim'],
    ),
  },
  description: `
A home-improvement retailer onboards products from **~900 suppliers** into its **Product Information Management (PIM)** system, which feeds the website and stores.

Facts:
- Suppliers send product catalogs as **CSV or Excel (.xlsx)** files, uploaded to a supplier portal (files land in S3) or emailed to a mailbox.
- Each supplier uses **their own column names and units** (e.g. "Weight (lbs)", "Gewicht kg"). Some files have 50,000 rows; most have 100–2,000.
- The PIM has a REST API with a **bulk import endpoint** (max 1,000 products per call) and requires: GTIN (valid check digit), supplier SKU, title, category, net weight in kg, dimensions in cm, and image URLs.
- Category managers want an **error report back to the supplier within 1 hour** listing exactly which rows and fields are wrong.
- A new file from the same supplier usually contains **mostly unchanged products**.

**Describe your solution:**
- How do you handle different column layouts and units per supplier?
- What validations do you apply and how do you report errors?
- How do you load into the PIM efficiently and only send changes?
- What about images?
`,
  answerTemplate: `## Intake

## Supplier mapping profiles

## Validation

## Change detection and loading

## Error reporting

## Images
`,
  keyPoints: [
    'File intake from S3 (and mailbox attachments) with the supplier identified from path/sender; raw file archived.',
    'Per-supplier mapping profile (column → canonical field, unit conversions) stored as configuration, not code; DataWeave applies it generically.',
    'Row-level validation: required fields, GTIN check digit, numeric ranges, allowed categories; errors collected per row and field instead of failing the file.',
    'Batch Job with streaming for large files; change detection via a hash per product so only new/changed rows go to the PIM in chunks of ≤ 1,000.',
    'Error report (CSV/Excel) generated and sent back to the supplier within the hour; summary to category managers.',
    'Images validated (reachable, format/size) and processed asynchronously so they do not block product data.',
  ],
  solution: `
**Intake.** S3 new-object event (or a Scheduler listing new keys) and an Email listener (IMAP) for attachments. The supplier is identified from the upload path (\`/suppliers/{supplierId}/\`) or the sender address. The raw file is archived with an upload ID.

**Supplier mapping profiles.** Each supplier has a **profile** (JSON in a database or config repo): header row number, sheet name, column → canonical field, units per field (lbs, g, inches), decimal separator. Reading: \`application/csv\` or \`application/xlsx\` with streaming for large files. A generic DataWeave transformation applies the profile — renames columns, converts units (lbs × 0.4536 → kg, inches × 2.54 → cm), trims strings. New suppliers get a profile created in an onboarding step (could be a small UI for category managers).

**Validation (per row).**
- required fields present;
- **GTIN** length (8/12/13/14) and **check digit** (mod-10) valid; duplicate GTINs inside the file;
- weight/dimensions numeric and within plausible ranges;
- category in the allowed taxonomy (lookup);
- image URLs syntactically valid.

Each failure is recorded as \`{ row, field, value, message }\`. Invalid rows are excluded; valid rows continue.

**Change detection and loading.** For each valid product compute a **hash** of the canonical fields; compare with the last hash stored per supplier SKU (database/Object Store). Only new or changed products are sent. A **Batch Job** with a Batch Aggregator of **1,000** calls the PIM bulk endpoint; per-item results from the PIM response are added to the report.

**Error reporting.** After the batch \`On Complete\`, generate a report (Excel with an "errors" sheet, or CSV) and email it to the supplier contact / post it in the supplier portal, with counts: received, valid, unchanged, loaded, rejected. Target: within 1 hour of upload — even 50,000 rows streams through in minutes.

**Images.** Image URLs go to a separate queue: download, check type/size, push to the DAM/CDN, then update the product's image reference. Failures are reported but do not block the product data.
`,
  followUps: [
    { q: 'Why not force all suppliers onto one template?', a: 'Ideal, and you should offer one, but large suppliers often refuse. Mapping profiles let you accept their format while the rest of the pipeline stays generic.' },
    { q: 'How do you handle a 200 MB Excel file?', a: 'Use streaming for xlsx reading where possible, increase worker size for that job or ask suppliers above a limit to send CSV; never load the whole file as a single in-memory structure without need.' },
    { q: 'What if the PIM bulk call partly fails?', a: 'Read per-item results, retry only failed items for technical errors, and report validation errors back; the hash is only updated for successfully loaded products.' },
  ],
}

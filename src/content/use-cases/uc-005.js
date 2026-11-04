import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-005',
  category: 'use-cases',
  title: 'Supplier Invoices (EDI and PDF) into the ERP',
  level: 'ADVANCED',
  tags: ['edi', 'x12', 'idp', 'validation', 'exceptions'],
  estMinutes: 35,
  diagram: {
    task: 'draw both ingestion channels (EDI and PDF email), the shared intake queue, validation with its duplicate store and AP exception store, the resubmit path, and throttled posting to SAP.',
    checks: [
      { label: 'EDI suppliers send through an API you own (AS2 / X12, 997 back)', rule: { type: 'edge', from: 'partner', to: ['system-api', 'experience-api', 'api-gateway'] } },
      { label: 'PDFs are sent to an extraction service (IDP / OCR)', rule: { type: 'edge', from: ['batch-job', 'process-api', 'system-api'], to: { type: ['external-api', 'saas'], label: ['idp', 'ocr', 'extract', 'document'] } } },
      { label: 'Both channels feed a shared intake queue (one canonical model)', rule: { type: 'edge', from: ['system-api', 'batch-job', 'process-api'], to: 'queue', kind: 'async', min: 2 } },
      { label: 'Duplicates are checked against a persistent store', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'cache'], label: ['dup', 'seen', 'invoice'] } } },
      { label: 'Failed invoices go to an exception store for AP', rule: { type: 'edge', from: 'process-api', to: { type: ['saas', 'database', 'internal-app', 'queue'], label: ['exception', 'case', 'review'] } } },
      { label: 'Posting to SAP is decoupled from validation by a queue', rule: { type: 'path', from: 'process-api', via: 'queue', to: 'erp' } },
      { label: 'SAP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Corrected exceptions can be resubmitted and reach SAP', rule: { type: 'path', from: { type: ['saas', 'database', 'internal-app'], label: ['exception', 'case', 'resubmit'] }, to: 'erp' } },
    ],
    reference: diagram(
      {
        sup: ['partner', 'EDI suppliers (AS2)'],
        sedi: ['system-api', 'sys-as2-x12-api (997 back)'],
        mail: ['saas', 'invoices@ mailbox (IMAP)'],
        job: ['batch-job', 'Mailbox poller'],
        idp: ['external-api', 'IDP / OCR service'],
        docs: ['file-store', 'Original documents'],
        inq: ['queue', 'invoice-intake-q'],
        pval: ['process-api', 'prc-invoice-validation'],
        dup: ['database', 'Seen invoices (unique key)'],
        exc: ['saas', 'AP exception cases (ServiceNow)'],
        postq: ['queue', 'invoice-posting-q'],
        post: ['process-api', 'prc-invoice-posting (< 10/s)'],
        ssap: ['system-api', 'sys-sap-invoice-api'],
        sap: ['erp', 'SAP S/4HANA'],
        dlq: ['dlq', 'invoice-posting-dlq'],
      },
      [
        'sup -> sedi', 'sedi ~> inq', 'job -> mail', 'job -> docs', 'job -> idp', 'job ~> inq', 'inq ~> pval', 'pval -> dup',
        'pval -> ssap', 'pval -> exc', 'exc ~> inq', 'pval ~> postq', 'postq ~> post', 'postq ~> dlq', 'post -> ssap', 'ssap -> sap',
      ],
    ),
  },
  description: `
A manufacturer receives **~12,000 supplier invoices/month** and wants them posted to **SAP S/4HANA** automatically (three-way match: PO, goods receipt, invoice).

Channels:
- **EDI X12 810** from 40 large suppliers via AS2 (≈ 70% of volume). Suppliers expect a **997 functional acknowledgement**.
- **PDF invoices by email** to \`invoices@…\` from ~600 small suppliers (≈ 30%). Layouts vary a lot; some are scans.

Rules:
- An invoice must reference a valid **open PO** for that supplier; amount tolerance ±2% or €50, whichever is lower.
- **Duplicate invoices** (same supplier + invoice number) must never be posted twice — suppliers often resend.
- Invoices failing validation go to the **AP team** for manual handling, with a clear reason; AP wants to fix and resubmit without asking the supplier again.
- Month-end peak: 40% of volume arrives in the last 3 days. SAP posting must stay below 10 invoices/second.

**Describe your solution:**
- How do you ingest each channel and convert it to one internal format?
- How do you extract data from PDFs reliably enough, and what do you do with low-confidence results?
- What validations run, where, and in what order?
- How do exceptions reach AP and get resubmitted?
- How do you handle duplicates, peaks and SAP throttling?
`,
  answerTemplate: `## Ingestion per channel

## Canonical invoice model

## PDF extraction

## Validation

## Exception handling and resubmission

## Duplicates, peaks and SAP posting
`,
  keyPoints: [
    'EDI path: AS2 receipt, X12 810 parsed with the X12 connector (or Anypoint Partner Manager), 997 returned to the supplier; PDF path: email polled, attachment sent to a document-extraction service (e.g. MuleSoft IDP or OCR).',
    'Both channels mapped in DataWeave to a single canonical invoice model, so validation and posting are written once.',
    'Extraction results below a confidence threshold (or missing mandatory fields) routed to human review instead of auto-posting.',
    'Validations: schema/mandatory fields, supplier exists, duplicate check (supplier + invoice number), PO open and belongs to supplier, amounts within tolerance — business rules against SAP data.',
    'Exceptions stored with reason code and original document in an exception queue/store visible to AP (e.g. a case in a ticketing tool), with a resubmit path back into validation.',
    'Ingestion decoupled from SAP posting with a queue; posting throttled below 10/s; duplicate check enforced by a persistent store/unique key and SAP\'s own duplicate check.',
  ],
  solution: `
**Ingestion.**
- *EDI:* Suppliers send via **AS2** (Anypoint Partner Manager or the AS2 connector). The **X12 connector** parses/validates the 810 and the flow returns a **997** (accepted/rejected at syntax level). Each 810 transaction is mapped to the canonical model.
- *PDF:* An email connector (IMAP) polls the mailbox; each attachment is stored (object storage/DMS) with an ID and passed to **MuleSoft Intelligent Document Processing (IDP)** or another OCR/extraction service. Non-PDF attachments and unreadable files go straight to exceptions.

**Canonical model.** \`SupplierInvoice\` { source, supplierId, invoiceNumber, invoiceDate, currency, poNumber, lines[], net, tax, gross, documentRef, extractionConfidence }. Both paths map to it in DataWeave; everything downstream is shared.

**PDF extraction.** Use field-level confidence scores. Below threshold (e.g. 85%) on mandatory fields (invoice number, PO, total), or totals that don't add up (sum(lines) + tax ≠ gross), → **human review** in IDP / an AP work queue; the reviewer corrects values and the invoice continues. Over time, add supplier-specific templates for frequent senders.

**Validation (in order, cheapest first).**
1. Structural: mandatory fields, formats, arithmetic checks.
2. Supplier lookup (SAP vendor master; map EDI sender ID / email domain → vendor).
3. **Duplicate check** on supplier + normalised invoice number (trim, upper-case, strip leading zeros) against a persistent store of seen invoices.
4. PO exists, is open, belongs to supplier; quantities vs goods receipt; price tolerance ±2% capped at €50.
Each failure produces a **reason code** (\`DUPLICATE\`, \`PO_NOT_FOUND\`, \`PRICE_VARIANCE\` …).

**Exceptions and resubmission.** Failed invoices are written to an **exception store** (DB table or a case in ServiceNow/Salesforce) with the canonical data, reason code and a link to the original document. AP corrects data (or overrides with approval) in that tool and clicks *Resubmit*, which calls a Mule API that puts the corrected invoice back into the validation queue. Keep an audit trail of who changed what. Rejections that need the supplier (e.g. wrong PO) trigger a templated email.

**Duplicates, peaks and SAP.**
- Ingestion publishes validated invoices to an **Anypoint MQ** queue; a posting consumer with limited concurrency posts to SAP (BAPI/OData) at **< 10/s**. Month-end peaks just grow the queue; monitor queue age against a posting SLA.
- Idempotency: the duplicate check record is written atomically (unique key) before posting, and SAP's vendor-invoice duplicate check remains a second line of defence. Posting retries reuse the same reference so a timeout + retry cannot double post.
- DLQ for technical failures (SAP down), separated from business exceptions that go to AP.
`,
}

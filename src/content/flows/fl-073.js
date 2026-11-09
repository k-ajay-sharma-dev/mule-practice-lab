import { design, flow, handler, source, step } from '../../flow/dsl.js'
import { handlerStatus } from '../../flow/rules.js'

export default {
  id: 'fl-073',
  category: 'flows',
  title: 'Supplier Invoices over HTTP into Azure Blob Storage with Date-Based Folders',
  level: 'INTERMEDIATE',
  tags: ['azure-blob', 'json', 'json-schema', 'http', 'storage', 'error-handling'],
  estMinutes: 25,
  flowChecks: [
    { label: 'Invoices are received through an HTTP Listener', rule: { type: 'source', component: 'http-listener', where: { path: 'invoice' } } },
    {
      label: 'The invoice is validated against supplier-invoice-v2.json before it is stored',
      rule: { type: 'before', first: 'json-validate', firstWhere: { schema: 'supplier-invoice-v2' }, then: 'azure-upload-blob' },
    },
    {
      label: 'The blob name (date folder + invoice key) is computed once in a variable before the upload',
      rule: { type: 'before', first: 'set-variable', then: 'azure-upload-blob' },
    },
    {
      label: 'The blob name is yyyy/MM/dd/<supplierId>-<invoiceNumber>.json, so a re-sent invoice lands on the same blob',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'set-variable', where: { value: 'yyyy/MM/dd' } },
          { type: 'exists', component: 'set-variable', where: { value: 'supplierId' } },
          { type: 'exists', component: 'set-variable', where: { value: 'invoiceNumber' } },
          { type: 'absent', component: 'set-variable', where: { value: 'uuid' } },
        ],
      },
    },
    {
      label: 'The blob is uploaded to the supplier-invoices container under the computed name',
      rule: { type: 'exists', component: 'azure-upload-blob', where: { container: 'supplier-invoices', fileName: 'vars.' } },
    },
    {
      label: 'The blob name is logged after a successful upload',
      rule: { type: 'before', first: 'azure-upload-blob', then: 'logger', thenWhere: { message: 'blob' }, outside: true },
    },
    { label: 'A schema violation (JSON:SCHEMA_NOT_HONOURED) returns 400', rule: handlerStatus('SCHEMA_NOT_HONOURED', '400') },
    {
      label: 'Storage being unreachable is mapped to a retryable 503',
      rule: handlerStatus({ oneOf: ['AZURE', 'CONNECTIVITY'] }, '503'),
    },
  ],
  referenceFlow: design(
    flow(
      'supplier-invoice-intake',
      source('http-listener', { path: '/api/v1/invoices', allowedMethods: 'POST' }),
      [
        step('json-validate', { schema: 'schemas/supplier-invoice-v2.json', content: '#[payload]' }),
        // Deterministic name: a re-sent invoice overwrites the same blob instead of creating a duplicate.
        step('set-variable', {
          variableName: 'blobName',
          value:
            '#[(now() >> "UTC") as String {format: "yyyy/MM/dd"} ++ "/" ++ payload.supplierId ++ "-" ++ (payload.invoiceNumber replace /[^A-Za-z0-9_-]/ with "_") ++ ".json"]',
        }),
        step('azure-upload-blob', { container: 'supplier-invoices', fileName: '#[vars.blobName]', fileStream: '#[payload]', contentType: 'application/json' }),
        // The connector's user manual says Upload Blob returns true on success and false on failure.
        step('validation', { check: 'is-true', expression: '#[payload]', message: 'Upload Blob returned false' }),
        step('logger', { level: 'INFO', message: '#["Invoice stored as supplier-invoices/" ++ vars.blobName]' }),
        step('set-variable', { variableName: 'httpStatus', value: '#[202]' }),
        step('transform', {
          script: '%dw 2.0\noutput application/json\n---\n{ status: "ACCEPTED", blobName: vars.blobName, correlationId: correlationId }',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'JSON:SCHEMA_NOT_HONOURED' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[400]' }),
          step('transform', {
            script: '%dw 2.0\noutput application/json\n---\n{ code: "INVALID_INVOICE", message: error.description, correlationId: correlationId }',
          }),
        ]),
        // Partner connector: its manual lists no error types, so confirm this name in Studio.
        handler('on-error-propagate', { type: 'AZURE-STORAGE:CONNECTIVITY' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[503]' }),
          step('logger', { level: 'ERROR', message: '#["Azure Storage unreachable: " ++ error.description]' }),
          step('transform', {
            script: '%dw 2.0\noutput application/json\n---\n{ code: "STORAGE_UNAVAILABLE", message: "Please retry later", correlationId: correlationId }',
          }),
        ]),
        handler('on-error-propagate', { type: 'ANY' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[500]' }),
          step('logger', { level: 'ERROR', message: '#[error.errorType.namespace ++ ":" ++ error.errorType.identifier ++ " " ++ error.description]' }),
          step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ code: "INTERNAL_ERROR", correlationId: correlationId }' }),
        ]),
      ],
    ),
  ),
  description: `
Around **400 suppliers** submit invoices as JSON to a new **Invoice Intake API** (\`POST /api/v1/invoices\`, ~15,000 invoices/day, peaks at month end). The finance team's OCR-free processing pipeline and the auditors read the raw invoices from **Azure Blob Storage**, container \`supplier-invoices\`.

**Requirements**
- Reject invoices that do not match the agreed JSON schema \`supplier-invoice-v2.json\` with a **400** and a readable reason.
- Store each valid invoice as a JSON blob in a **date-based folder**: \`yyyy/MM/dd/<supplierId>-<invoiceNumber>.json\` (UTC date of receipt).
- Suppliers sometimes re-send the same invoice; this must not create a second blob.
- Log the blob name so support can find an invoice from the API log.
- If the storage account cannot be reached, the supplier should get a response that tells it to **retry later**.

**Design the flow.** Also say how the connector authenticates to the storage account.
`,
  answerTemplate: `## Receiving and validating

## Blob naming and "folders"

## Upload and logging

## Error mapping

## Authentication to the storage account
`,
  keyPoints: [
    'JSON Validate Schema (JSON module) runs before any storage call and raises JSON:SCHEMA_NOT_HONOURED, mapped to 400 with the validation message.',
    'Blob containers have no real folders: the date folder is a prefix in the blob name (yyyy/MM/dd/...), computed once into a variable and reused for upload, log and response.',
    'A deterministic blob name (supplier + invoice number) makes a re-sent invoice target the same blob, which gives idempotent storage without a lookup if the upload overwrites. The connector manual does not state that, so test it.',
    'Upload Blob, then check its result: the manual says it returns false on failure. Log the container and blob name on success.',
    'Storage unreachable → 503 (retry later); configure a reconnection strategy on the connector for short glitches. The partner manual lists no error types, so confirm the name (AZURE-STORAGE:CONNECTIVITY here) in Studio.',
    'Authenticate with a SAS token with limited permissions and an expiry (or another managed credential) instead of the account key; an expired SAS gives 403 AuthenticationFailed.',
  ],
  solution: `
1. **HTTP Listener** \`POST /api/v1/invoices\`.
2. **JSON Validate Schema** \`schemas/supplier-invoice-v2.json\` → \`JSON:SCHEMA_NOT_HONOURED\` on mismatch.
3. **Set Variable** \`blobName\` = \`yyyy/MM/dd\` (UTC) + \`/\` + \`supplierId-invoiceNumber.json\`, with unsafe characters in the invoice number replaced. The "folder" is only a prefix in the name. The connector manual shows List Blobs In Container taking only a container name, so check your version before relying on a listing per day.
4. **Upload Blob** (Microsoft Azure Storage connector) to container \`supplier-invoices\`, blob name \`vars.blobName\`, content \`payload\`, content type \`application/json\`. A **Validation** then checks the result, because the manual says the operation returns false on failure. Re-sending the same invoice targets the same blob; the manual does not state whether an existing blob is replaced, so test it.
5. **Logger** \`supplier-invoices/<blobName>\` and respond **202** with the blob name and correlation ID.

**Errors (flow level, On Error Propagate):**
- \`JSON:SCHEMA_NOT_HONOURED\` → 400 \`INVALID_INVOICE\` with \`error.description\`.
- \`AZURE-STORAGE:CONNECTIVITY\` (confirm the name in Studio, as the partner manual lists no error types) → 503 \`STORAGE_UNAVAILABLE\` (optionally a \`Retry-After\` header). The connection config has a reconnection strategy (e.g. 3 attempts, 2 s) for brief outages.
- Anything else → 500 with the correlation ID, details only in the log.

**Authentication:** use a **SAS token** scoped to the container with create/write permission and an expiry, kept in secure properties and rotated; avoid the account key, which grants full access to the whole account.
`,
  followUps: [
    {
      q: 'Why not wrap the upload in Until Successful instead of returning 503?',
      a: 'The supplier is waiting on the HTTP call; long in-line retries hold the request and threads. A short reconnection strategy covers blips, and a 503 lets the supplier retry. Until Successful would also change the error to MULE:RETRY_EXHAUSTED, so the handler would have to match that.',
    },
    {
      q: 'What if the date folder should reflect the invoice date instead of the receipt date?',
      a: 'Use payload.invoiceDate for the prefix. The name stays deterministic, but a corrected invoice with a different date would land in another folder — receipt date is simpler for audits, invoice date for business browsing.',
    },
    {
      q: 'Auditors need invoices to be unchangeable for 10 years. What changes?',
      a: 'Overwriting would then be wrong: enable immutability (WORM) policies on the container and use a unique name per receipt, detecting duplicates with Is Blob Exists or a database key instead of overwriting.',
    },
  ],
}

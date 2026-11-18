import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

// Mailbox data for the run scenario: Microsoft Graph messages with their attachments.
const UBL_INVOICE =
  'PEludm9pY2U+PElEPklOVi01NTIxPC9JRD48QWNjb3VudGluZ1N1cHBsaWVyUGFydHk+PFBhcnR5PjxQYXJ0eU5hbWU+PE5hbWU+QWNtZSBTdXBwbGllczwvTmFtZT48L1BhcnR5TmFtZT48L1BhcnR5PjwvQWNjb3VudGluZ1N1cHBsaWVyUGFydHk+PExlZ2FsTW9uZXRhcnlUb3RhbD48UGF5YWJsZUFtb3VudD4xMjUwLjAwPC9QYXlhYmxlQW1vdW50PjwvTGVnYWxNb25ldGFyeVRvdGFsPjwvSW52b2ljZT4='
const xmlAttachment = { name: 'INV-5521.xml', contentType: 'application/xml', isInline: false, contentBytes: UBL_INVOICE }
const pdfAttachment = { name: 'INV-5522.pdf', contentType: 'application/pdf', isInline: false, contentBytes: 'JVBERi0xLjQK' }
const logo = { name: 'logo.png', contentType: 'image/png', isInline: true, contentBytes: 'iVBORw0KGgo=' }
const mail = (id, sender, attachments) => ({
  id,
  internetMessageId: `<${id}@mail.acme-supplies.example>`,
  from: { emailAddress: { address: sender } },
  subject: 'Invoices for November',
  attachments,
})
const inbox = (...messages) => ({ method: 'GET', path: '/users/invoices@company.example/mailFolders/inbox/messages', respond: { status: 200, body: { value: messages } } })

export default {
  id: 'fl-016',
  category: 'flows',
  title: 'Processing Invoice Attachments from a Mailbox',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'email', 'imap', 'attachments', 'pdf', 'ocr'],
  estMinutes: 35,
  flowChecks: [
    {
      label: 'New emails are picked up from the mailbox (IMAP listener or scheduled poll)',
      rule: { type: 'source', component: ['email-listener', 'scheduler'] },
    },
    {
      label: 'Each email is processed only once (idempotency on Message-ID)',
      rule: {
        type: 'any',
        rules: [
          { type: 'exists', component: 'idempotent', where: { idExpression: { oneOf: ['messageId', 'message-id'] } } },
          { type: 'exists', component: 'os-store', where: { key: { oneOf: ['messageId', 'message-id'] } } },
        ],
      },
    },
    {
      label: 'The duplicate check runs before any attachment is routed',
      rule: { type: 'before', first: ['idempotent', 'os-retrieve'], then: 'choice' },
    },
    {
      label: 'Attachments are routed by type inside a For Each',
      rule: { type: 'inside', component: 'choice', within: ['foreach', 'parallel-foreach'] },
    },
    { label: 'The type router has separate XML and PDF routes', rule: { type: 'routes', component: 'choice', min: 2 } },
    {
      label: 'XML e-invoices are mapped with DataWeave within the routing',
      rule: { type: 'inside', component: 'transform', within: 'choice' },
    },
    {
      label: 'The XML route posts the invoice to the AP System API',
      rule: { type: 'inside', component: 'http-request', where: { method: 'POST' }, within: 'choice', routeWhere: { expression: 'xml' } },
    },
    {
      label: 'The PDF route uploads the file to S3 and sends it to OCR',
      rule: { type: 'inside', component: ['s3-put', 'http-request'], within: 'choice', routeWhere: { expression: 'pdf' }, min: 2 },
    },
    {
      label: 'One failing attachment does not stop the others (Try with On Error Continue)',
      rule: { type: 'handler', component: 'on-error-continue', within: 'try' },
    },
    {
      label: 'A failed attachment and a failed email are both reported to the AP team, not only logged',
      rule: {
        type: 'inside',
        component: ['mq-publish', 'vm-publish', 'jms-publish', 'email-send', 'db-insert'],
        within: ['on-error-continue', 'on-error-propagate'],
        min: 2,
      },
    },
    {
      label: 'A repeated email is skipped quietly, not reported as a failure',
      rule: {
        type: 'any',
        rules: [
          { type: 'exists', component: 'on-error-continue', where: { type: 'DUPLICATE_MESSAGE' } },
          { type: 'exists', component: 'os-store', where: { key: { oneOf: ['messageId', 'message-id'] } } },
        ],
      },
    },
    { label: 'Senders of unsupported files get an auto-reply', rule: { type: 'exists', component: 'email-send' } },
    { label: 'OCR results arrive on a separate HTTP callback flow', rule: { type: 'source', component: 'http-listener' } },
  ],
  simulation: {
    systems: {
      http: [
        inbox(mail('AAMk-001', 'billing@acme-supplies.example', [xmlAttachment, pdfAttachment, logo])),
        { method: 'POST', path: '/users/invoices@company.example/messages/{id}/move', respond: { status: 201, body: { id: 'moved' } } },
        { method: 'POST', path: '/ap/invoices', latencyMs: 150, respond: { status: 201, body: { apInvoiceId: 'AP-77001' } } },
        { method: 'PUT', path: '/invoice-bucket/*', latencyMs: 300, respond: { status: 200, body: { eTag: 'e-1' } } },
        { method: 'POST', path: '/ocr/jobs', respond: { status: 202, body: { jobId: 'OCR-9001' } } },
      ],
    },
    tests: [
      {
        name: 'An XML and a PDF invoice arrive',
        about: 'The XML goes to the AP system, the PDF goes to OCR, and the inline logo is ignored.',
        trigger: { schedule: {} },
        expect: {
          calls: [
            { method: 'POST', path: '/ap/invoices', count: 1 },
            { method: 'POST', path: '/ocr/jobs', count: 1 },
          ],
          noEmails: true,
        },
      },
      {
        name: 'The same email is read twice',
        about: 'The poll runs again before the email has left the inbox. The invoice must not reach AP a second time.',
        triggers: [{ schedule: {} }, { schedule: {}, afterMs: 60000 }],
        expect: {
          calls: [
            { method: 'POST', path: '/ap/invoices', count: 1 },
            { method: 'POST', path: '/ocr/jobs', count: 1 },
          ],
          noEmails: true,
        },
      },
      {
        name: 'An unsupported file arrives',
        about: 'A Word document cannot be processed, so the sender gets an auto-reply.',
        trigger: { schedule: {} },
        overrides: {
          systems: {
            http: [inbox(mail('AAMk-002', 'ar@bolt-parts.example', [{ name: 'invoice.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', isInline: false, contentBytes: 'UEsDBA==' }]))],
          },
        },
        expect: {
          emails: [{ to: 'ar@bolt-parts.example', count: 1 }],
          calls: [
            { method: 'POST', path: '/ap/invoices', count: 0 },
            { method: 'POST', path: '/ocr/jobs', count: 0 },
          ],
        },
      },
      {
        name: 'The AP system is down',
        about: 'The XML invoice cannot be posted. The PDF in the same email must still go to OCR.',
        trigger: { schedule: {} },
        overrides: { systems: { http: [{ method: 'POST', path: '/ap/invoices', respond: { fault: 'CONNECTIVITY' } }] } },
        expect: { calls: [{ method: 'POST', path: '/ocr/jobs', count: 1 }] },
      },
      {
        name: 'OCR sends its result',
        about: 'The OCR service calls back with the fields it read, and the invoice is posted to AP.',
        trigger: {
          http: {
            method: 'POST',
            path: '/ocr/callback',
            body: { documentKey: 'invoices/2026-11-13/AAMk-001/INV-5522.pdf', fields: { invoiceNumber: 'INV-5522', supplierName: 'Acme Supplies', total: '480.00' } },
          },
        },
        expect: { status: 200, calls: [{ method: 'POST', path: '/ap/invoices', count: 1 }] },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'invoice-mailbox-poller',
      source('scheduler', { strategy: 'fixed-frequency', frequency: 1, timeUnit: 'MINUTES' }),
      [
        step('http-request', {
          method: 'GET',
          path: '/users/invoices@company.example/mailFolders/inbox/messages?$filter=isRead eq false&$expand=attachments',
          responseTimeout: 30000,
        }),
        scope('foreach', { collection: '#[payload.value]' }, [
          scope(
            'try',
            {},
            [
              step('set-variable', { variableName: 'messageId', value: '#[payload.internetMessageId]' }),
              step('set-variable', { variableName: 'sender', value: '#[payload.from.emailAddress.address]' }),
              step('set-variable', { variableName: 'rejected', value: '#[[]]' }),
              step('idempotent', { idExpression: '#[vars.messageId]', objectStore: 'processed-invoice-emails' }),
              scope('foreach', { collection: '#[payload.attachments filter (a) -> not (a.isInline default false)]' }, [
                scope(
                  'try',
                  {},
                  [
                    router(
                      'choice',
                      {},
                      [
                        // An exact match: "contains xml" would also catch Word and Excel files (application/vnd.openxmlformats-...).
                        route({ expression: '#[["application/xml", "text/xml"] contains lower(payload.contentType)]' }, [
                          step('transform', {
                            script:
                              '%dw 2.0\nimport fromBase64 from dw::core::Binaries\noutput application/json\n// The payload is a Graph attachment object: the XML is Base64 text in contentBytes\nvar invoice = read(fromBase64(payload.contentBytes), "application/xml")\n---\n{\n  invoiceNumber: invoice.Invoice.ID,\n  supplier: invoice.Invoice.AccountingSupplierParty.Party.PartyName.Name,\n  total: invoice.Invoice.LegalMonetaryTotal.PayableAmount as Number,\n  sourceMessageId: vars.messageId\n}',
                          }),
                          step('http-request', { method: 'POST', path: '/ap/invoices', responseTimeout: 10000 }),
                        ]),
                        route({ expression: '#[payload.contentType == "application/pdf"]' }, [
                          step('set-variable', {
                            variableName: 's3Key',
                            value: '#["invoices/" ++ (now() as String { format: "yyyy-MM-dd" }) ++ "/" ++ vars.messageId ++ "/" ++ payload.name]',
                          }),
                          step('http-request', { method: 'PUT', path: '/invoice-bucket/#[vars.s3Key]', responseTimeout: 30000 }),
                          step('http-request', { method: 'POST', path: '/ocr/jobs', responseTimeout: 10000 }),
                        ]),
                      ],
                      {
                        otherwise: [
                          step('set-variable', { variableName: 'rejected', value: '#[vars.rejected + payload.name]' }),
                        ],
                      },
                    ),
                  ],
                  {
                    errorHandlers: [
                      handler('on-error-continue', { type: 'ANY' }, [
                        step('mq-publish', { destination: 'ap-invoice-errors' }),
                        step('logger', { level: 'ERROR', message: '#["Attachment failed in " ++ vars.messageId ++ ": " ++ error.description]' }),
                      ]),
                    ],
                  },
                ),
              ]),
              router(
                'choice',
                {},
                [
                  route({ expression: '#[not isEmpty(vars.rejected)]' }, [
                    step('email-send', { toAddresses: '#[vars.sender]', subject: 'Unsupported invoice attachments' }),
                  ]),
                ],
                { otherwise: [] },
              ),
              step('http-request', { method: 'POST', path: '/users/invoices@company.example/messages/{id}/move', responseTimeout: 10000 }),
            ],
            {
              errorHandlers: [
                handler('on-error-continue', { type: 'MULE:DUPLICATE_MESSAGE' }, [
                  step('logger', { level: 'DEBUG', message: '#["Already processed " ++ vars.messageId]' }),
                ]),
                handler('on-error-continue', { type: 'ANY' }, [
                  step('http-request', { method: 'POST', path: '/users/invoices@company.example/messages/{id}/move', responseTimeout: 10000 }),
                  step('mq-publish', { destination: 'ap-invoice-errors' }),
                ]),
              ],
            },
          ),
        ]),
      ],
    ),
    flow(
      'ocr-callback',
      source('http-listener', { path: '/ocr/callback', allowedMethods: 'POST' }),
      [
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{\n  invoiceNumber: payload.fields.invoiceNumber,\n  supplier: payload.fields.supplierName,\n  total: payload.fields.total as Number,\n  documentKey: payload.documentKey\n}',
        }),
        step('http-request', { method: 'POST', path: '/ap/invoices', responseTimeout: 10000 }),
      ],
    ),
  ),
  description: `
Suppliers email invoices to \`invoices@company.example\` (Microsoft 365 mailbox, IMAP enabled). ~1,500 emails/day; each email has 0–5 attachments (PDF, XML e-invoices, sometimes images, signatures and logos).

**Requirements**
- **XML e-invoices** are parsed and posted straight to the **AP System API**.
- **PDF invoices** are uploaded to a document store (S3) and sent to an **OCR service** (async, callback-based).
- Ignore inline images/signatures; reject unsupported types with an auto-reply to the sender.
- Each email must be processed **once**; failures must be visible to the AP team.

**Facts**
- Every email carries a unique \`Message-ID\` header.
- The OCR service posts its result to \`POST /ocr/callback\` on your application.

**Design the flow(s):** mailbox trigger, extracting attachments, routing by type, idempotency and error handling.
`,
  answerTemplate: `## Mailbox trigger

## Extracting attachments

## Routing by type

## XML path

## PDF path

## Idempotency and failures
`,
  keyPoints: [
    'Email connector IMAP listener polls the inbox folder and marks/moves/deletes processed mails so they are not read again.',
    'Attachments are iterated with For Each over the attachment collection, filtering by MIME type / file extension and size.',
    'Choice router sends XML to DataWeave parsing + AP API, PDF to S3 upload + OCR request, other types to the reject/auto-reply path.',
    'Message-ID (plus attachment name/hash) is used as an idempotency key in a persistent Object Store.',
    'Failed emails are moved to an error folder or logged to a work queue so AP can see and retry them.',
  ],
  solution: `
1. **Trigger:** Email connector **On New Email – IMAP** listener on folder \`INBOX\`, polling every 1 min, filtering unread messages. After success, mark as read and move to \`Processed\` (or enable delete-after-retrieve). Credentials in secure properties; for Microsoft 365, check whether OAuth for IMAP is required in your tenant.
2. **Capture metadata:** \`attributes\` carry from, subject, Message-ID, received date. Store \`messageId\` and sender in variables.
3. **Idempotency:** **Idempotent Message Validator** on \`attributes.headers['Message-ID']\` with a persistent Object Store (TTL e.g. 30 days).
4. **Attachments:** **For Each** over the attachments; skip inline content (small images, \`image/*\` under N KB, content-disposition inline).
5. **Choice by MIME type/extension:**
   - \`application/xml\`: DataWeave parses the e-invoice (UBL) into the AP canonical model → HTTP Request to AP System API.
   - \`application/pdf\`: Amazon S3 **Put Object** (key \`invoices/{date}/{messageId}/{filename}\`) → HTTP Request to OCR service with the S3 key and a callback URL. A separate HTTP Listener flow receives OCR results and posts to AP.
   - otherwise: collect name/type for the auto-reply.
6. **Auto-reply:** Email **Send** to the sender listing rejected files (rate-limit replies to avoid mail loops; never reply to no-reply/bounce addresses).
7. **Errors:** a Try per attachment so one bad attachment doesn't block the rest; failures written to an AP error queue/table with messageId. If the whole email fails, move it to an \`Error\` folder instead of \`Processed\`.
`,
  followUps: [
    { q: 'Why not process attachments directly in memory for large PDFs?', a: 'A 20 MB scan × 5 attachments × concurrent emails can exhaust heap; stream to S3 and pass references, not bytes, to downstream services.' },
    { q: 'What if the OCR callback never arrives?', a: 'Track OCR requests in a status store with a timestamp and have a scheduled flow flag or resubmit those older than the SLA.' },
    { q: 'Why does the XML route match the content type exactly instead of checking that it contains "xml"?', a: 'Word and Excel attachments have types such as application/vnd.openxmlformats-officedocument.wordprocessingml.document, which contain "xml". A contains check would send them down the XML route, where parsing fails, instead of to the auto-reply.' },
    { q: 'How would you scale beyond one mailbox poller?', a: 'Keep a single poller (polling sources are not safe to run concurrently against one folder) and hand attachments off to a queue so processing can scale independently.' },
  ],
}

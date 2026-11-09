import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-079',
  category: 'flows',
  title: 'Supplier Invoice Mailbox over IMAP: Attachments to Azure Blob, Move to Processed Only on Success',
  level: 'INTERMEDIATE',
  tags: ['email', 'imap', 'attachments', 'azure-blob', 'foreach', 'error-handling'],
  estMinutes: 30,
  flowChecks: [
    {
      label: 'The mailbox is polled by the IMAP listener with a subject filter on invoice',
      rule: { type: 'source', component: 'email-listener', where: { subjectRegex: 'invoice' } },
    },
    {
      label: 'The listener does not delete emails it reads, so they can still be moved',
      rule: { type: 'source', component: 'email-listener', where: { deleteAfterRetrieve: 'false' } },
    },
    {
      label: 'Only PDF attachments are kept, so signature images and other files are ignored',
      rule: {
        type: 'any',
        rules: [
          { type: 'exists', component: 'transform', where: { script: 'pdf' } },
          { type: 'inside', component: ['azure-upload-blob', 'sftp-write'], within: 'choice', routeWhere: { expression: 'pdf' } },
        ],
      },
    },
    {
      label: 'Attachments are stored in the supplier-invoices container',
      rule: { type: 'exists', component: 'azure-upload-blob', where: { container: 'supplier-invoices' } },
    },
    {
      label: 'The email ID is kept in a variable before the attachment loop',
      rule: { type: 'before', first: 'set-variable', then: 'foreach' },
    },
    { label: 'Each attachment is saved inside a For Each', rule: { type: 'inside', component: ['azure-upload-blob', 'sftp-write'], within: 'foreach' } },
    {
      label: 'An email with no PDF attachment is routed to NeedsReview, away from the upload loop (Choice)',
      rule: { type: 'inside', component: 'email-move', where: { targetFolder: 'NeedsReview' }, within: 'choice' },
    },
    {
      label: 'Successful emails are moved to the Processed folder using the email ID saved before the loop',
      rule: { type: 'exists', component: 'email-move', where: { targetFolder: 'Processed', emailId: 'vars.' } },
    },
    {
      label: 'The move to Processed happens once, after all attachments are stored (after the loop, not inside it)',
      rule: {
        type: 'all',
        rules: [
          { type: 'before', first: ['azure-upload-blob', 'sftp-write'], then: 'email-move', thenWhere: { targetFolder: 'Processed' }, outside: true },
          { type: 'absent', component: 'email-move', within: 'foreach' },
        ],
      },
    },
    {
      label: 'A failed email is moved to a Failed folder by the error handler, not to Processed',
      rule: { type: 'inside', component: 'email-move', within: 'on-error-continue', where: { targetFolder: 'Failed' } },
    },
  ],
  referenceFlow: design(
    flow(
      'supplier-invoice-mailbox',
      // Connection: IMAPS on port 993. Scheduling strategy every 2 minutes. Primary Node Only keeps one poller in a cluster.
      source('email-listener', { folder: 'INBOX', deleteAfterRetrieve: 'false', enableWatermark: 'true', subjectRegex: '(?i).*invoice.*' }),
      [
        step('set-variable', { variableName: 'emailId', value: '#[attributes.id]' }),
        // Deterministic prefix: reprocessing the same email overwrites the same blobs.
        step('set-variable', {
          variableName: 'blobPrefix',
          value: '#[((attributes.headers["Message-ID"] default attributes.id) as String) replace /[^A-Za-z0-9._-]/ with "_"]',
        }),
        // In Mule 4 attachments are a map on the payload: name -> content.
        step('transform', {
          target: 'variable',
          variableName: 'pdfs',
          script:
            '%dw 2.0\noutput application/java\n---\n(payload.attachments default {}) pluck ((content, name) -> { name: name as String, content: content })\n  filter (a) -> lower(a.name) endsWith ".pdf"',
        }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[isEmpty(vars.pdfs)]' }, [
              step('logger', { level: 'WARN', message: '#["No PDF attachment on email " ++ vars.emailId]' }),
              step('email-move', { emailId: '#[vars.emailId]', targetFolder: 'NeedsReview', createTargetFolder: 'true' }),
            ]),
          ],
          {
            otherwise: [
              scope('foreach', { collection: '#[vars.pdfs]' }, [
                step('azure-upload-blob', {
                  container: 'supplier-invoices',
                  fileName: '#["mailbox/" ++ vars.blobPrefix ++ "/" ++ payload.name]',
                  fileStream: '#[payload.content]',
                  contentType: 'application/pdf',
                }),
              ]),
              // Only reached when every attachment was stored.
              step('email-move', { emailId: '#[vars.emailId]', targetFolder: 'Processed', createTargetFolder: 'true' }),
              step('logger', { level: 'INFO', message: '#["Stored " ++ sizeOf(vars.pdfs) ++ " attachment(s) from email " ++ vars.emailId]' }),
            ],
          },
        ),
      ],
      [
        handler('on-error-continue', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Email " ++ (vars.emailId default "?") ++ " failed: " ++ error.description]' }),
          step('email-move', { emailId: '#[vars.emailId]', targetFolder: 'Failed', createTargetFolder: 'true' }),
        ]),
      ],
    ),
  ),
  description: `
A manufacturer's accounts payable team receives about **900 supplier emails a day** in the shared mailbox \`ap-invoices@company.example\` (IMAPS). The mailbox also collects newsletters, delivery notes and out-of-office replies. Only emails with **"invoice"** in the subject are in scope. Each one carries one to four PDF attachments.

Finance's archive reads the PDFs from **Azure Blob Storage**, container \`supplier-invoices\`.

**Requirements**
- Pick up only emails whose subject mentions an invoice, without touching anything else in the mailbox.
- Save **every PDF attachment** as a blob. Signature images and other files are ignored.
- Move the email to the \`Processed\` folder **only after all of its attachments are stored**. An email in \`Processed\` is the AP team's proof that the archive is complete.
- If one upload fails, the email must not appear in \`Processed\`, and the AP team must be able to find it in the \`Failed\` folder.
- An email with no PDF goes to a \`NeedsReview\` folder for a person to look at.

**Design the flow.** Say where the attachments come from in the Mule message and how the email ID survives the loop.
`,
  answerTemplate: `## Listener and subject filter

## Reading the attachments

## Saving each attachment

## Moving the email

## Failure handling
`,
  keyPoints: [
    'The IMAP listener takes a matcher with a subject regex, so unrelated mail is left alone. Remote search is off by default, which means filtering happens on the client unless it is enabled.',
    'In Mule 4 attachments are a map on the payload, not a separate message section, so DataWeave turns them into a list (pluck) before the For Each.',
    'The email ID is stored in a variable before the loop, so later steps and the error handler do not depend on attributes.',
    'Move To Folder is a separate step after the For Each, so it runs only if every upload succeeded.',
    'A failed email is moved to Failed explicitly. The reference says read mail is filtered by default and the watermark is on by default, so do not assume a failed email will be polled again.',
    'A deterministic blob name from the Message-ID makes reprocessing overwrite the same blobs instead of creating copies.',
  ],
  solution: `
1. **On New Email (IMAP)** on \`INBOX\` over IMAPS (port 993), with a scheduling strategy of every 2 minutes and an Imap Matcher subject regex of \`(?i).*invoice.*\`. Keep \`deleteAfterRetrieve\` false, because the email has to stay available for the move. Primary Node Only keeps a single poller in a cluster.
2. **Set Variable** \`emailId\` from \`attributes.id\`, and \`blobPrefix\` from the sanitised Message-ID header, falling back to the ID.
3. **Transform** the attachment map on the payload into a list of \`{ name, content }\` with \`pluck\`, keeping only \`.pdf\` names. In Mule 4 attachments are part of the payload and are read with DataWeave.
4. **Choice**: an empty list moves the email to \`NeedsReview\`.
5. **For Each** PDF: **Upload Blob** to \`supplier-invoices\` as \`mailbox/<prefix>/<name>\`, content type \`application/pdf\`.
6. **Move To Folder** \`Processed\`, with \`emailId="#[vars.emailId]"\`, after the loop. If an upload raises an error the flow leaves the loop and this step never runs.
7. **On Error Continue** logs the cause and moves the email to \`Failed\`. The AP team (or a support engineer) fixes the cause and moves the email back to \`INBOX\`. Because the blob names are deterministic, the rerun overwrites anything stored the first time.

**Why a Failed folder rather than leaving the email in the inbox?** The reference says read emails are filtered by default, and the watermark is enabled by default. The documentation does not promise that a failed email is polled again, so the design does not depend on it. Test how a message moved back to \`INBOX\` is treated in your own mailbox before relying on that step in a runbook.

**Why not delete after retrieve?** It removes the only copy of the email and leaves nothing to move, so there is no evidence for AP and no way to retry.
`,
  followUps: [
    {
      q: 'The mailbox holds 200,000 old emails and polling is slow. What would you check first?',
      a: 'Enable Remote Search is false by default, so filters are resolved on the client side. Turning it on resolves them on the server. A receivedSince value in the matcher also narrows the search, and moving handled mail out of INBOX keeps the folder small.',
    },
    {
      q: 'Why does the flow keep the email ID in a variable when attributes.id is available?',
      a: 'Other operations can replace the attributes of the message, and the handler needs the ID whatever step failed. A variable set at the start stays valid for the whole flow.',
    },
    {
      q: 'How would the design change if the target were SFTP instead of Azure Blob?',
      a: 'Replace Upload Blob with SFTP Write to a path built from the same prefix, with mode OVERWRITE so a rerun replaces the file. The Choice, the loop and the folder moves stay the same.',
    },
    {
      q: 'What does email:delete do on IMAP that makes it riskier than a move?',
      a: 'On IMAP it also erases all messages flagged as deleted in the folder, so it can remove more than the one email. A move keeps the email and gives AP an audit trail.',
    },
  ],
}

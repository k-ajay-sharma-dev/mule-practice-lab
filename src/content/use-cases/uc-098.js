import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-098',
  category: 'use-cases',
  title: 'NetSuite Customer Invoices to the Peppol E-Invoicing Network',
  level: 'INTERMEDIATE',
  tags: ['netsuite', 'e-invoicing', 'ubl', 'webhooks', 'xml', 'compliance', 'finance'],
  estMinutes: 30,
  diagram: {
    task: 'draw how approved NetSuite invoices are turned into Peppol UBL documents and sent through the access point, how the delivery status comes back by webhook, and where the archive and the email fallback fit.',
    checks: [
      { label: 'A scheduled job picks up approved invoices from NetSuite', rule: { type: 'path', from: 'batch-job', to: 'erp' } },
      { label: 'NetSuite is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'The Peppol access point is reached only through a System API', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'Delivery status comes back through a webhook API', rule: { type: 'edge', from: 'external-api', to: 'experience-api' } },
      { label: 'Status callbacks are queued before NetSuite is updated', rule: { type: 'edge', from: 'experience-api', to: ['queue', 'topic'], kind: 'async' } },
      { label: 'The webhook never calls NetSuite synchronously', rule: { type: 'no-path', from: 'experience-api', to: 'erp', kind: 'sync' } },
      { label: 'Each UBL document sent is archived', rule: { type: 'edge', from: ['process-api', 'system-api'], to: ['file-store', 's3-bucket', 'azure-blob'] } },
      { label: 'Customers without Peppol get the invoice by email', rule: { type: 'edge', from: ['process-api', 'system-api'], to: 'notification' } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'Invoice poller (every 15 min)'],
        prc: ['process-api', 'prc-e-invoice'],
        sns: ['system-api', 'sys-netsuite-api'],
        ns: ['erp', 'NetSuite OneWorld'],
        sap: ['system-api', 'sys-peppol-access-point-api'],
        ap: ['external-api', 'Peppol access point (certified)'],
        hook: ['experience-api', 'exp-e-invoice-status-webhook'],
        q: ['queue', 'e-invoice-status'],
        arch: ['file-store', 'UBL archive (10 years)'],
        mail: ['notification', 'PDF invoice email'],
      },
      ['job -> prc', 'prc -> sns', 'sns -> ns', 'prc -> sap', 'sap -> ap', 'prc -> arch', 'prc -> mail', 'ap -> hook', 'hook ~> q', 'q ~> prc'],
    ),
  },
  description: `
A SaaS company bills from **NetSuite OneWorld** with subsidiaries in Belgium, the Netherlands and Germany. Belgium makes structured **B2B e-invoicing mandatory** from 1 January 2026 and the other countries follow. Invoices must go over the **Peppol** network in the **Peppol BIS Billing 3.0** format (UBL 2.1).

Facts:
- About **5,000 invoices a month**, 70% at month end. Invoices have 1 to 40 lines and a PDF that must travel inside the UBL as an attachment.
- The company contracts a certified **Peppol access point**. It accepts UBL by REST, checks the receiver in the Peppol directory, and later calls a **webhook** with the delivery status (delivered, rejected by receiver, receiver not on Peppol).
- Invoices must pass the official **Schematron** rules before sending; the access point charges for rejected documents.
- About 15% of customers are not on Peppol yet; they must still get a PDF by email.
- Finance must see the status on the invoice in NetSuite, and the exact XML sent must be kept for **10 years**.

**Questions:**
1. How are invoices picked up and converted?
2. How do you check them before they cost money?
3. How does the delivery status get back into NetSuite?
4. What happens when the receiver is not on Peppol or rejects the invoice?
`,
  answerTemplate: `## Pickup and mapping

## Validation

## Status webhook

## Fallback and archive
`,
  keyPoints: [
    'A poller runs a NetSuite saved search for approved invoices with e-invoice status Pending, through sys-netsuite-api.',
    'DataWeave maps to UBL 2.1 with the PDF base64-embedded; the document is checked against XSD and Schematron before sending.',
    'The access point is called through a System API; the invoice id is the document reference, so a resend is detected.',
    'The status webhook validates the caller, queues the event and returns 200; the Process API updates NetSuite from the queue.',
    'Receivers not on Peppol get the PDF by email; every UBL file sent is archived for 10 years.',
  ],
  solution: `
\`\`\`
Invoice poller --> prc-e-invoice --> sys-netsuite-api --> NetSuite
                          |--> sys-peppol-access-point-api --> Access point --> Peppol network
                          |--> UBL archive, PDF email
Access point --webhook--> exp-e-invoice-status-webhook --> [e-invoice-status] --> prc-e-invoice --> NetSuite
\`\`\`

**Pickup.** Every 15 minutes (every 5 at month end) the poller calls **prc-e-invoice**. It asks **sys-netsuite-api** for approved invoices with the custom field \`E-Invoice Status = Pending\`, including the rendered PDF. It sets each one to \`Sending\` before it starts, so two runs do not pick the same invoice.

**Mapping and validation.** DataWeave builds the UBL Invoice: seller and buyer with their Peppol participant ids, VAT breakdown per rate, lines, payment means with the IBAN, and the PDF as an embedded attachment. The document is validated with the XML module against the UBL XSD, then against the Peppol Schematron rules. A failed invoice gets status \`Invalid\` with the rule message, and is not sent.

**Sending.** **sys-peppol-access-point-api** sends the UBL with the NetSuite invoice id as the document reference. The access point returns a transmission id, which is stored on the invoice. The exact XML is written to the archive store with the invoice number and date in the name.

**Status.** The access point calls **exp-e-invoice-status-webhook**. The API checks the signature header, puts the event on \`e-invoice-status\` and returns 200 at once. The Process API consumes the queue and sets the NetSuite status to Delivered or Rejected with the reason.

**Fallback.** If the receiver lookup says "not on Peppol", the Process API emails the PDF to the billing contact and sets status \`Emailed\`. A receiver rejection creates a task for the collections team.
`,
  followUps: [
    { q: 'Why validate with Schematron when the access point validates too?', a: 'The access point charges for every rejected document and the feedback arrives late. Local validation gives finance the error at once and for free.' },
    { q: 'What if the webhook call arrives before the send response was stored?', a: 'The queue message is retried with a delay until the transmission id is found on the invoice. After a limit it goes to a dead-letter queue.' },
    { q: 'How do you secure the webhook endpoint?', a: 'Check the signature or client certificate of the access point, apply an IP allowlist policy, and reject events for unknown transmission ids.' },
  ],
}

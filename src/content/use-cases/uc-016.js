import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-016',
  category: 'use-cases',
  title: 'E-Signature Flow for Loan Contracts',
  level: 'INTERMEDIATE',
  tags: ['docusign', 'webhooks', 'documents', 'state-machine', 'banking'],
  estMinutes: 25,
  diagram: {
    task: 'draw the e-signature flow: LOS approval events, the orchestrating Process API with its tracking table, System APIs for DocuSign, SharePoint, the LOS and payout, the DocuSign Connect webhook path, and the safety-net poller.',
    checks: [
      { label: 'DocuSign Connect calls a webhook endpoint you expose', rule: { type: 'edge', from: { type: ['saas', 'external-api'], label: ['docusign', 'sign'] }, to: ['experience-api', 'system-api', 'process-api', 'api-gateway'] } },
      { label: 'Webhook events are queued before processing', rule: { type: 'edge', from: ['experience-api', 'system-api'], to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'DocuSign is reached only through a System API (envelope status re-fetched)', rule: { type: 'only-via', target: { type: ['saas', 'external-api'], label: ['docusign', 'sign'] }, from: 'system-api' } },
      { label: 'Signed documents are stored in SharePoint through a System API', rule: { type: 'only-via', target: { type: ['file-store', 'saas'], label: ['sharepoint', 'document', 'dms'] }, from: 'system-api' } },
      { label: 'The LOS status is updated only through a System API', rule: { type: 'only-via', target: { type: ['legacy', 'database', 'erp', 'saas'], label: ['los', 'loan'] }, from: 'system-api' } },
      { label: 'Payout is triggered only through a System API', rule: { type: 'only-via', target: { type: ['payment', 'erp', 'legacy', 'external-api'], label: ['payout', 'payment'] }, from: 'system-api' } },
      { label: 'Envelope/loan state is tracked for exactly-once payout', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'cache'], label: ['track', 'state', 'envelope'] } } },
      { label: 'A scheduled poller checks envelopes whose webhook never arrived', rule: { type: 'path', from: 'batch-job', to: { type: ['saas', 'external-api'], label: ['docusign', 'sign'] } } },
    ],
    reference: diagram(
      {
        los: ['legacy', 'Loan origination system (LOS)'],
        evq: ['queue', 'loan-approved-q'],
        p: ['process-api', 'prc-loan-esignature'],
        slos: ['system-api', 'sys-los-api'],
        sds: ['system-api', 'sys-docusign-api'],
        ds: ['saas', 'DocuSign'],
        wh: ['experience-api', 'exp-docusign-connect-api (HMAC)'],
        dsq: ['queue', 'docusign-events-q'],
        sshp: ['system-api', 'sys-sharepoint-api'],
        sp: ['file-store', 'SharePoint library'],
        spay: ['system-api', 'sys-payout-api'],
        pay: ['payment', 'Payout system'],
        track: ['database', 'Envelope tracking table'],
        poll: ['batch-job', 'Envelope status poller (30 min)'],
      },
      [
        'los ~> evq', 'evq ~> p', 'p -> slos', 'slos -> los', 'p -> sds', 'sds -> ds', 'ds -> wh', 'wh ~> dsq', 'dsq ~> p', 'p -> sshp',
        'sshp -> sp', 'p -> spay', 'spay -> pay', 'p -> track', 'poll -> sds',
      ],
    ),
  },
  description: `
A consumer-finance company approves personal loans in its **loan origination system (LOS)** (Java app with REST API). After approval, the customer must **sign the loan contract electronically** before money is paid out.

Requirements:
- Generate the contract PDF from a template (the LOS can render the PDF via its API).
- Send it to **DocuSign** for signing by the borrower and, for joint loans, a co-borrower (in order).
- When signing completes: store the **signed PDF and certificate of completion** in the document management system (**SharePoint** library), update the LOS status to *Signed*, and trigger payout.
- If not signed within **14 days**, void the envelope and set the loan to *Expired*.
- ~1,500 contracts/day. Payout must **never** happen twice or without a completed signature.

**Describe your solution:**
- What is the end-to-end flow and which system owns the status?
- How do you receive signing updates from DocuSign reliably?
- How do you make sure payout happens exactly once?
- How do you handle expiry, declines and failures in storing documents?
`,
  answerTemplate: `## End-to-end flow

## Receiving DocuSign events

## Exactly-once payout

## Expiry, decline and failures
`,
  keyPoints: [
    'Envelope created via DocuSign (connector or eSignature REST API) with routing order for borrower then co-borrower, and the loan ID stored as envelope custom field.',
    'DocuSign Connect webhooks verified (HMAC), acknowledged fast and queued; envelope status re-fetched from DocuSign before acting.',
    'LOS is the system of record for loan status; transitions are guarded (only Approved → SentForSignature → Signed → PaidOut).',
    'Payout triggered only after documents are stored and the status change to Signed succeeds, with the loan ID as idempotency key towards the payout system.',
    'Envelope expiration/void after 14 days and declines move the loan to Expired/Declined; scheduled reconciliation polls envelopes whose webhook never arrived.',
  ],
  solution: `
**End-to-end flow.**
1. LOS emits *LoanApproved* (event or call to a Mule endpoint).
2. Mule fetches the contract PDF from the LOS API.
3. Mule creates a **DocuSign envelope** (DocuSign connector or eSignature REST API): document, recipients with **routing order** 1 (borrower) and 2 (co-borrower), signature tabs/anchor text, an **expiration of 14 days**, and an **envelope custom field** \`loanId\`. Status in LOS → *SentForSignature* with the envelope ID.
4. On *envelope completed*: download the combined signed document and the certificate of completion, upload both to SharePoint (SharePoint connector / Microsoft Graph) with metadata (loan ID, customer ID), update LOS → *Signed*, then trigger payout.

The **LOS owns the loan status**; Mule enforces allowed transitions and never skips a step.

**Receiving DocuSign events.** Configure **DocuSign Connect** to POST envelope events to a Mule HTTPS endpoint. Verify the **HMAC signature** header, store the event on a queue and return 200 immediately. The consumer **re-reads the envelope status** from DocuSign (do not trust only the webhook body), deduplicates by envelope ID + status, and processes in order. A scheduled job (every 30 minutes) lists envelopes still *sent/delivered* in our tracking table and polls their status — a safety net for missed webhooks.

**Exactly-once payout.**
- Payout only starts when: envelope status = *completed* (confirmed via API), documents stored successfully, LOS status set to *Signed*.
- The payout call uses **loan ID as idempotency key**; the payout system (or Mule's tracking table) rejects a second request for the same loan.
- Status transition *Signed → PayoutRequested* is conditional (only if current status is *Signed*), so two consumers processing the same event cannot both trigger payout.

**Expiry, decline and failures.**
- *Declined* by a signer → LOS *Declined*, notify the loan officer.
- *Expired/voided* after 14 days (DocuSign expiration, or a scheduler that voids envelopes past the deadline) → LOS *Expired*.
- *SharePoint upload fails* → retry with backoff; the payout waits (documents are a compliance requirement). After retries, alert and park the case; the completed envelope stays retrievable in DocuSign, so nothing is lost.
- All steps logged with loan ID as correlation ID; no personal data in logs beyond IDs.
`,
  followUps: [
    { q: 'The customer wants to correct their address after the envelope is sent. What happens?', a: 'Void the envelope (reason recorded), regenerate the contract in the LOS and send a new envelope; the tracking table links both envelope IDs to the loan, and only the newest can trigger payout.' },
    { q: 'How do you test DocuSign flows?', a: 'Use a DocuSign developer (demo) account in lower environments, mock Connect events in MUnit for each status, and test the out-of-order and duplicate event cases explicitly.' },
    { q: 'Why re-fetch the envelope status instead of trusting the webhook?', a: 'Webhooks can arrive out of order or be replayed; reading the current state makes processing idempotent and order-independent.' },
  ],
}

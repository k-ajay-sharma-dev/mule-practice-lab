import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-082',
  category: 'case-studies',
  title: 'Insurer Paying Approved Claims Within Minutes Over Faster Payments',
  level: 'INTERMEDIATE',
  tags: ['insurance', 'payments', 'claims', 'idempotency', 'dlq', 'async', 'sanctions'],
  estMinutes: 45,
  diagram: {
    task: 'draw the claim payment flow: ClaimCenter hands approved payments to its System API, which queues them; a payment Process API checks for duplicates, screens the payee, sends the payment through the bank gateway System API, posts to the general ledger and reports the outcome back to ClaimCenter. Add the dead-letter queue.',
    checks: [
      { label: 'Approved payments are handed over through a queue to the payment Process API', rule: { type: 'path', from: { type: 'saas', label: ['claim'] }, via: ['queue', 'cloud-queue'], to: 'process-api' } },
      { label: 'Every line into or out of a queue is an async message', rule: { type: 'lines', touching: ['queue', 'cloud-queue', 'dlq'], kind: 'async' } },
      { label: 'Duplicate approvals are blocked with an idempotency key store', rule: { type: 'edge', from: 'process-api', to: ['cache', 'database'] } },
      { label: 'Every payee is screened against sanctions through a System API', rule: { type: 'edge', from: 'process-api', to: { type: 'system-api', label: ['sanction', 'screen'] } } },
      { label: 'The bank payment gateway is reached only through a System API', rule: { type: 'only-via', target: 'payment', from: 'system-api' } },
      { label: 'The payment is posted to the general ledger', rule: { type: 'path', from: 'process-api', via: 'system-api', to: 'erp' } },
      { label: 'ClaimCenter learns the outcome through its System API', rule: { type: 'path', from: 'process-api', via: { type: 'system-api', label: ['claim'] }, to: { type: 'saas', label: ['claim'] } } },
      { label: 'ClaimCenter is called only by its System API', rule: { type: 'only-via', target: { type: 'saas', label: ['claim'] }, from: 'system-api' } },
      { label: 'Payments that keep failing end up on a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
    ],
    reference: diagram(
      {
        cc: ['saas', 'Guidewire ClaimCenter (cloud)'],
        scc: ['system-api', 'sys-claimcenter-api'],
        q: ['queue', 'claims.payment-approved'],
        dlq: ['dlq', 'claims.payment-approved.dlq'],
        prc: ['process-api', 'prc-claim-payment'],
        os: ['cache', 'Object Store (payment idempotency keys)'],
        ssan: ['system-api', 'sys-sanctions-screening-api'],
        sbank: ['system-api', 'sys-bank-payments-api'],
        sgl: ['system-api', 'sys-finance-gl-api'],
        san: ['external-api', 'Sanctions screening service'],
        bank: ['payment', 'Bank Faster Payments gateway'],
        erp: ['erp', 'Oracle Fusion General Ledger'],
      },
      [
        'cc -> scc', 'scc ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> os', 'prc -> ssan', 'ssan -> san',
        'prc -> sbank', 'sbank -> bank', 'prc -> sgl', 'sgl -> erp', 'prc -> scc', 'scc -> cc',
      ],
    ),
  },
  description: `
**Context.** A home and motor insurer settles 22,000 claim payments a month to customers, repairers and hire car firms, worth about 60 million GBP. Claims are handled in Guidewire ClaimCenter (cloud).

**The problem today**
- ClaimCenter writes approved payments to a nightly file. Finance loads it into the bank's bulk payment portal by hand the next morning. Customers wait 2 to 3 days.
- Twice last year the same file was uploaded twice, paying 1,900 claims double. Recovering the money took months.
- Sanctions screening of payees happens in a separate weekly batch, after the money has gone.

**What is available**
- ClaimCenter can send an outbound message for each approved payment to an HTTPS endpoint and expects an acknowledgement within 5 seconds. It can receive payment status updates through its REST API.
- The bank offers a Faster Payments API (single payments up to 1 million GBP, answer within 15 seconds, idempotency header supported).
- A sanctions screening service with a REST API.
- Oracle Fusion General Ledger for finance postings.

**Goals**
- Customers are paid within 15 minutes of approval, 24 hours a day.
- A payment is never sent twice, even if ClaimCenter resends a message.
- Every payee is screened before payment; possible matches are held for compliance.
- Finance sees every payment posted to the ledger the same day.

**Your task.** Design the claim payment integration with its failure handling.
`,
  answerTemplate: `## Flow from approval to payment

## Taking the message from ClaimCenter

## Never paying twice

## Sanctions screening

## Ledger posting and status back to ClaimCenter

## Failures and operations

## Risks
`,
  keyPoints: [
    'The ClaimCenter System API acknowledges each approved payment quickly and puts it on a durable queue, so ClaimCenter never waits for the bank.',
    'The payment ID from ClaimCenter is the idempotency key: it is stored before sending and sent to the bank as its idempotency header, so a resend cannot pay twice.',
    'Every payee is screened through a sanctions System API before payment; a possible match holds the payment and alerts compliance.',
    'The bank gateway, the ledger and ClaimCenter are each reached through their own System API, and the outcome goes back to ClaimCenter.',
    'Messages that fail after retries go to a DLQ with alerting; an unknown bank result is resolved by a status inquiry, not by sending again.',
  ],
  solution: `
**Flow.** ClaimCenter → \`sys-claimcenter-api\` (acknowledge, enqueue) → \`claims.payment-approved\` → \`prc-claim-payment\` → duplicate check → sanctions screening → bank payment → ledger posting → status back to ClaimCenter.

**Taking the message.** The System API validates the payload, enqueues it with the ClaimCenter payment ID as the message ID, and returns \`200\` within a second. If the queue is unavailable it returns an error and ClaimCenter retries.

**Never paying twice.** Before calling the bank, the Process API writes the payment ID to a persistent Object Store with state \`SENDING\`. If the key already exists in \`SENT\` or \`SENDING\`, it stops. The same ID goes to the bank as the idempotency header, so even a crash between sending and saving \`SENT\` cannot cause a second payment: a retry gets the bank's earlier answer.

**Sanctions.** \`sys-sanctions-screening-api\` checks the payee name, address and bank details. Clear: continue. Possible match: hold the payment, set the status \`ON_HOLD_COMPLIANCE\` in ClaimCenter and open a compliance task. Compliance releases or rejects it through an internal API.

**Ledger and status.** After the bank accepts, the Process API posts a journal through \`sys-finance-gl-api\` and updates ClaimCenter to \`PAID\` with the bank reference. If the ledger is down, the posting is retried from its own queue; the customer payment is not held back for it.

**Failures.** Bank timeout: ask the bank for the status of that idempotency key before any resend. Bank rejects (closed account): status \`FAILED\` in ClaimCenter for the handler to fix. Unexpected errors: retry 3 times with backoff, then DLQ and alert. A daily reconciliation compares ClaimCenter approvals, bank statements and ledger postings.

**Risks.** Idempotency store loss (persistent store, 90 day TTL, plus the bank header as a second guard), sanctions service outage (hold payments, do not skip screening), and large payments above the Faster Payments limit (route to CHAPS by a rule).
`,
  followUps: [
    { q: 'The bank call timed out. Do you send the payment again?', a: 'Not blindly. Ask the bank for the status of that idempotency key first, and resend with the same key only if the bank has no record of it.' },
    { q: 'Why acknowledge ClaimCenter before paying?', a: 'ClaimCenter expects an answer within 5 seconds, while screening and the bank can take longer. The durable queue holds the work, so the acknowledgement loses nothing.' },
    { q: 'What happens if the sanctions service is down?', a: 'Payments wait on the queue or are held. Screening is a regulatory control, so it is never skipped to keep payments flowing.' },
    { q: 'Why keep a daily reconciliation if every payment is idempotent?', a: 'It catches what the design cannot see, such as a manual payment in the bank portal or a ledger posting that failed silently, and it gives finance evidence for audit.' },
  ],
}

import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-105',
  category: 'use-cases',
  title: 'Supplier Payment Factory: Five ERPs to Twelve Banks with ISO 20022',
  level: 'EXPERT',
  tags: ['payments', 'iso20022', 'sftp', 'banking', 'idempotency', 'security', 'human-in-the-loop', 'dlq', 'finance'],
  estMinutes: 50,
  diagram: {
    task: 'draw the payment factory: ERP payment files arriving on the hub SFTP, the collector, the payment factory Process API with its ledger, sanctions screening, the treasury approval app, the outbound bank queue and bank connectivity, the bank status poller and its queue back to the ERPs, alerts and the dead-letter queue.',
    checks: [
      { label: 'ERPs are updated only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'A payment ledger with unique payment ids blocks duplicates', rule: { type: 'edge', from: 'process-api', to: 'database' } },
      { label: 'Sanctions screening and SWIFT are reached only through System APIs', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'Treasury approves large payments through an Experience API', rule: { type: 'path', from: 'internal-app', via: 'experience-api', to: 'process-api' } },
      { label: 'The approval app cannot send anything to a bank around the factory', rule: { type: 'no-path', from: 'internal-app', to: 'sftp-server', unless: 'process-api' } },
      { label: 'Bank files leave through a queue', rule: { type: 'path', from: 'process-api', via: ['queue', 'cloud-queue'], to: 'sftp-server' } },
      { label: 'No synchronous call chain runs from the factory to a bank', rule: { type: 'no-path', from: 'process-api', to: 'sftp-server', kind: 'sync' } },
      { label: 'Bank status reports reach the ERPs through a queue', rule: { type: 'path', from: 'batch-job', via: ['queue', 'cloud-queue'], to: 'erp' } },
      { label: 'Bank messages that keep failing go to a dead-letter queue', rule: { type: 'edge', from: ['queue', 'cloud-queue', 'process-api', 'system-api'], to: 'dlq' } },
      { label: 'Treasury is alerted about rejected payments and missed cut-offs', rule: { type: 'edge', from: ['process-api', 'batch-job'], to: 'notification' } },
    ],
    reference: diagram(
      {
        erp1: ['erp', 'SAP S/4HANA (2 instances)'],
        erp2: ['erp', 'Oracle EBS'],
        erp3: ['erp', 'NetSuite (2 accounts)'],
        sin: ['sftp-server', 'Hub inbound SFTP (ERP payment files)'],
        sfin: ['system-api', 'sys-hub-sftp-api'],
        job: ['batch-job', 'Payment file collector (every 10 min)'],
        prc: ['process-api', 'prc-payment-factory'],
        led: ['database', 'Payment ledger'],
        ssan: ['system-api', 'sys-sanctions-screening-api'],
        san: ['external-api', 'Sanctions screening service'],
        tws: ['internal-app', 'Treasury approval app'],
        exap: ['experience-api', 'exp-treasury-approvals'],
        qb: ['queue', 'bank-outbound'],
        sbank: ['system-api', 'sys-bank-connectivity-api'],
        bank: ['sftp-server', 'Bank host-to-host SFTP'],
        swift: ['external-api', 'SWIFT service bureau'],
        poll: ['batch-job', 'Bank status poller (every 5 min)'],
        qs: ['queue', 'bank-status'],
        serp: ['system-api', 'sys-erp-payment-status-api'],
        dlq: ['dlq', 'bank-outbound-dlq'],
        mail: ['notification', 'Treasury alerts'],
      },
      [
        'erp1 ~> sin', 'erp2 ~> sin', 'erp3 ~> sin', 'job -> sfin', 'sfin -> sin', 'job -> prc', 'prc -> led', 'prc -> ssan', 'ssan -> san',
        'tws -> exap', 'exap -> prc', 'prc ~> qb', 'qb ~> sbank', 'qb ~> dlq', 'sbank -> bank', 'sbank -> swift',
        'poll -> sbank', 'poll ~> qs', 'qs ~> prc', 'prc -> serp', 'serp -> erp1', 'serp -> erp2', 'serp -> erp3', 'prc -> mail',
      ],
    ),
  },
  description: `
A pharmaceutical group pays suppliers from **five ERP instances** (two SAP S/4HANA, one Oracle EBS, two NetSuite) through **twelve banks** in 30 countries. Each ERP has its own bank formats and connections; treasury cannot see cash going out until bank statements arrive the next day. The group is building a **payment factory** on Mule 4.

Requirements:
- ERPs keep running their payment proposals and drop payment files (in their native format) on a hub SFTP server.
- The factory converts every payment to **ISO 20022 pain.001.001.09**, screens beneficiaries against **sanctions lists**, and routes each payment to the right bank: host-to-host **SFTP** for 9 banks, **SWIFT FileAct** through a service bureau for 3.
- Payments over **1 million EUR**, or to a beneficiary changed in the last 30 days, need **two approvals** in treasury before release.
- Banks return **pain.002** status reports (accepted, rejected, pending) and **camt.054** debit notifications. ERPs must get the status of each payment to clear or reopen the invoice.
- About **45,000 payments a day**, **2.3 billion EUR** a month. Each bank has a daily **cut-off time**.
- A payment must **never be sent twice**, even if an ERP drops the same file again or the factory crashes mid-send.

**Questions:**
1. Draw the flow from ERP to bank and back.
2. How do you guarantee no double payment?
3. How do approvals and sanctions screening fit without blocking all payments?
4. How do you deal with bank cut-offs, rejects and outages?
`,
  answerTemplate: `## End-to-end flow

## No double payment

## Screening and approvals

## Cut-offs, rejects and outages
`,
  keyPoints: [
    'A collector reads ERP files from the hub SFTP through a System API; the factory Process API maps every payment to a canonical model and then to pain.001.',
    'A payment ledger keyed by ERP instance, company and payment document number (plus a file hash) rejects any payment or file seen before; states move from RECEIVED to SENT to CONFIRMED.',
    'Sanctions screening runs per payment through a System API; hits and payments above the threshold wait for two approvals in the treasury app, while the rest of the file continues.',
    'Bank files go to a queue and a bank connectivity System API sends them by SFTP or SWIFT, honouring cut-offs; failures go to a DLQ, never to an automatic resend without checking the ledger.',
    'A poller collects pain.002 and camt.054, queues them, and the factory updates the ledger and each ERP through a System API; treasury is alerted on rejects and missed cut-offs.',
  ],
  solution: `
\`\`\`
ERPs --files--> Hub SFTP <-- sys-hub-sftp-api <-- collector --> prc-payment-factory --> payment ledger
                                                                  |--> sys-sanctions-screening-api --> screening service
Treasury app --> exp-treasury-approvals ------------------------->|
                                                                  \\~~> [bank-outbound] ~~> sys-bank-connectivity-api --> bank SFTP / SWIFT bureau
Bank status poller --> sys-bank-connectivity-api;  poller ~~> [bank-status] ~~> prc-payment-factory --> sys-erp-payment-status-api --> ERPs
\`\`\`

**Intake.** Every 10 minutes the collector lists new files through **sys-hub-sftp-api**. For each file it computes a hash and passes it to **prc-payment-factory**. The Process API parses the native format (SAP PAYEXT IDoc, EBS XML, NetSuite CSV) into a canonical payment.

**No double payment.** The **payment ledger** has a unique key on ERP instance, company code and payment document number, and a second unique key on file hash. A file seen before is rejected as a whole. A payment seen before is skipped and reported. Each payment moves through RECEIVED → SCREENED → APPROVED → QUEUED → SENT → ACCEPTED or REJECTED, and every move is a single update with the expected current state, so two threads cannot send the same payment.

**Screening and approval.** Each beneficiary is screened through **sys-sanctions-screening-api**. Clean payments under the threshold continue at once. Hits and large or recently changed beneficiaries are held in AWAITING_APPROVAL. Treasury sees them in the **approval app** through **exp-treasury-approvals**, which enforces two different approvers; the decision goes to the Process API, never to the bank side.

**Sending.** Released payments are grouped per bank, debtor account and value date into one pain.001 file. The file is signed and encrypted for that bank and put on the **bank-outbound** queue. **sys-bank-connectivity-api** consumes it and sends by host-to-host SFTP or through the SWIFT service bureau, and the ledger moves the payments to SENT. A bank that is down leaves the message on the queue; after the retry limit it goes to the DLQ for treasury to decide. A file is never resent before checking with the bank, because the first one may have arrived.

**Cut-offs.** A calendar of cut-off times per bank is checked before queueing. Payments that miss today's cut-off move to the next value date, and treasury is alerted.

**Status back.** The bank status poller fetches pain.002 and camt.054 through the connectivity API and queues them on **bank-status**. The Process API matches each status to the ledger by end-to-end id, updates it, and reports to the source ERP through **sys-erp-payment-status-api**, so the ERP clears the invoice or reopens it. Rejected payments alert treasury with the bank reason code.
`,
  followUps: [
    { q: 'Why is a retry after a timeout on a bank upload dangerous?', a: 'The bank may have received the file even though the upload timed out. Resending blindly can pay suppliers twice, so check the bank acknowledgement or ask the bank first.' },
    { q: 'Why keep the treasury approval outside the bank connectivity path?', a: 'A person who can approve should not be able to send. Routing approvals only into the factory keeps every payment under the ledger and screening rules.' },
    { q: 'How do you protect the pain.001 files at rest and in transit?', a: 'Encrypt and sign them with bank keys, keep keys in a hardware security module or secrets manager, and use SFTP with key authentication or SWIFT channels.' },
    { q: 'What do you do when a bank rejects one payment inside an accepted file?', a: 'The pain.002 lists the payment with a reason code. The ledger marks only that payment rejected, the ERP reopens its invoice and treasury is alerted.' },
  ],
}

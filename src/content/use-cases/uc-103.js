import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-103',
  category: 'use-cases',
  title: 'Vendor Bank Detail Changes with Fraud Controls',
  level: 'ADVANCED',
  tags: ['master-data', 'sap', 'fraud', 'human-in-the-loop', 'audit', 'security', 'state-machine', 'finance'],
  estMinutes: 40,
  diagram: {
    task: 'draw how a bank detail change from the Coupa supplier portal reaches SAP only after checks: the webhook and queue, the Process API that runs the steps, the account validation service, the AP approval app with its Experience API, the audit log and the notice to the AP team.',
    checks: [
      { label: 'Change requests from Coupa are queued for the Process API', rule: { type: 'path', from: 'saas', via: ['queue', 'topic'], to: 'process-api' } },
      { label: 'The account validation service is reached only through a System API', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'SAP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'An AP clerk approves the change after the call-back', rule: { type: 'path', from: 'internal-app', via: 'experience-api', to: 'process-api' } },
      { label: 'The AP approval app never writes to SAP around the Process API', rule: { type: 'no-path', from: 'internal-app', to: 'erp', unless: 'process-api' } },
      { label: 'Coupa cannot change SAP bank details around the Process API', rule: { type: 'no-path', from: 'saas', to: 'erp', unless: 'process-api' } },
      { label: 'Every step is written to an audit log', rule: { type: 'edge', from: 'process-api', to: 'database' } },
      { label: 'The AP team is told a call-back is needed', rule: { type: 'edge', from: 'process-api', to: 'notification' } },
    ],
    reference: diagram(
      {
        coupa: ['saas', 'Coupa supplier portal'],
        hook: ['experience-api', 'exp-coupa-supplier-webhook'],
        q: ['queue', 'bank-change-requests'],
        prc: ['process-api', 'prc-vendor-bank-change'],
        sval: ['system-api', 'sys-bank-validation-api'],
        val: ['external-api', 'Bank account validation service'],
        ssap: ['system-api', 'sys-sap-vendor-api'],
        sap: ['erp', 'SAP S/4HANA (vendor master, payment run)'],
        audit: ['database', 'Bank change audit log'],
        mail: ['notification', 'Call-back task to AP team'],
        ap: ['internal-app', 'AP approval app'],
        expa: ['experience-api', 'exp-ap-approvals'],
      },
      [
        'coupa -> hook', 'hook ~> q', 'q ~> prc', 'prc -> sval', 'sval -> val', 'prc -> ssap', 'ssap -> sap',
        'prc -> audit', 'prc -> mail', 'ap -> expa', 'expa -> prc',
      ],
    ),
  },
  description: `
A food manufacturer pays **18,000 vendors** from **SAP S/4HANA**. Vendors manage their own profile in the **Coupa supplier portal**, including bank details. Last year a fraudster took over a vendor's email, changed the bank account in Coupa, and a nightly sync copied it into SAP. **1.4 million EUR** went to the wrong account before anyone noticed.

New rules from the CFO:
- A bank change must never reach SAP without: an **account ownership check** by an external validation service (IBAN, account holder name, country), and a **call-back** by an AP clerk to a phone number already on file, not one supplied in the request.
- From the moment a change is requested, the vendor gets a **payment block** in SAP until the change is approved or rejected, so no payment goes to either account by mistake.
- Approver and requester must be different people. Changes above 50,000 EUR of open items need a second approver.
- Every step is kept in an **audit trail** for 10 years.
- About **250 bank changes a month**. The call-back should be done within 2 business days.

Coupa can call a webhook when a supplier profile changes.

**Questions:**
1. What are the steps from Coupa to SAP, and in which order?
2. How do you model a process that waits days for a person?
3. How do you stop anyone from going around the checks?
4. What does the audit trail hold?
`,
  answerTemplate: `## Steps

## Long-running state

## No way around the checks

## Audit
`,
  keyPoints: [
    'The Coupa webhook is received, verified and queued; the Process API owns a state machine per request (received, blocked, validated, awaiting call-back, approved, rejected).',
    'The first SAP action is a payment block on the vendor; bank details change only after validation and approval, and the block is lifted last.',
    'Account ownership is checked through a System API for the validation service; a mismatch rejects the request.',
    'The AP clerk approves in an internal app through an Experience API that calls only the Process API; segregation of duties and the second approver are enforced there.',
    'The audit log stores every state change with who, when, old and new account (masked) and the evidence; the old nightly sync no longer carries bank fields.',
  ],
  solution: `
\`\`\`
Coupa --webhook--> exp-coupa-supplier-webhook --> [bank-change-requests] --> prc-vendor-bank-change
                                                                              |--> sys-sap-vendor-api --> SAP (block, change, unblock)
                                                                              |--> sys-bank-validation-api --> validation service
                                                                              |--> audit log, call-back task
AP approval app --> exp-ap-approvals --> prc-vendor-bank-change
\`\`\`

**Steps in order.**
1. The webhook API checks the Coupa signature, queues the request and returns 200.
2. **prc-vendor-bank-change** stores a request in state RECEIVED and sets a **payment block** on the vendor in SAP through **sys-sap-vendor-api**.
3. It calls the validation service through **sys-bank-validation-api**. A name or country mismatch moves the request to REJECTED.
4. It creates a call-back task for the AP team with the phone number from SAP, not from the request.
5. The clerk calls the vendor and records the result in the **AP approval app**. **exp-ap-approvals** checks the clerk's role and passes the decision to the Process API. The Process API refuses an approver who is the requester, and asks for a second approver above the threshold.
6. On approval it writes the new bank details to SAP, then lifts the payment block.

**Long-running state.** The request state lives in the audit database, not in a flow variable. Each event (validation result, approval, timeout) loads the request, checks the allowed transition and saves the new state. A daily job escalates requests waiting for a call-back over 2 days.

**No way around it.** Only the Process API's client id may call the bank operations of the SAP System API (client id enforcement plus a policy on that resource). The nightly vendor sync from SAP to Coupa never writes bank fields back. The approval app only reaches the Process API.

**Audit.** Each transition is stored with time, actor, old and new IBAN (masked except the last 4 digits), the validation result and the call-back notes.
`,
  followUps: [
    { q: 'Why set the payment block before validating?', a: 'The payment run may start while the request waits. Blocking first means no money goes to either account until the change is settled.' },
    { q: 'Why must the call-back use the number already on file?', a: 'A fraudster who controls the request also controls any phone number in it. The stored number reaches the real vendor.' },
    { q: 'How do you stop a developer from calling the SAP bank operation directly?', a: 'Apply client id enforcement and an allowlist on that resource in API Manager. Only the Process API credentials are accepted.' },
  ],
}

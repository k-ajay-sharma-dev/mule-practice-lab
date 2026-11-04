export default {
  id: 'inc-085',
  category: 'incidents',
  title: 'Portal Shows SAP Order Numbers but the Sales Orders Do Not Exist in SAP',
  level: 'ADVANCED',
  tags: ['sap', 'bapi', 'transactions', 'try-scope', 'refactoring', 'order-management'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '2026-10-27 22:10:03 INFO  [deploy] sap-orders-sys 2.4.0 deployed (refactor: move BAPI call to sub-flow create-order-sap, remove unused scopes)', relevant: true, why: 'This release changed the structure around the BAPI call, and the missing orders start after it.' },
      { text: '2026-10-28 07:42:18 INFO  [sap-orders-sys] POST /orders portalRef=WEB-771204', relevant: false },
      { text: '2026-10-28 07:42:19 INFO  [sap-orders-sys] BAPI_SALESORDER_CREATEFROMDAT2 returned SALESDOCUMENT=0000418823 RETURN type=S', relevant: true, why: 'The BAPI ran and returned a number with a success message, so the call itself worked.' },
      { text: '2026-10-28 07:42:19 INFO  [sap-orders-sys] Response 201 orderNumber=418823 (612 ms)', relevant: false },
      { text: '2026-10-28 08:05:00 INFO  [health] GET /api/health 200 (4 ms)', relevant: false },
      { text: '2026-10-28 09:31:40 WARN  [sap-support] VA03: document 418823 does not exist', relevant: true, why: 'SAP has no such order, although the connector call reported success. The change did not take effect.' },
      { text: '2026-10-28 09:33:12 INFO  [flow-trace] create-order-sap: no transaction active for sap:synchronous-remote-function-call', relevant: true, why: 'The call now runs with no open transaction. The docs require one for functions that change data.' },
      { text: '2026-10-28 09:40:00 INFO  [sap-orders-sys] BAPI_MATERIAL_AVAILABILITY returned AV_QTY_PLT=240', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause?',
        options: [
          'The refactor removed the Try that opened a transaction, so the BAPI change does not impact SAP',
          'SAP is down, and the connector returns cached responses',
          'The service user lacks authorization for RFC_METADATA_GET',
          'The BAPI needs Send IDoc instead of a remote function call',
        ],
        answer: 0,
        explain: 'The connector docs say you must add `try` to the BAPI call to create a transaction, otherwise the change does not impact SAP. Reads such as the availability check are unaffected, which is why only orders are missing.',
      },
      {
        type: 'single',
        prompt: 'What is the right immediate action?',
        options: [
          'Roll back to 2.3.x or restore the Try, then re-create the orders accepted since the release from the portal data',
          'Retry the same calls with Until Successful',
          'Ask SAP support to restore the documents from a backup',
          'Tell the portal to hide order numbers until the next release',
        ],
        answer: 0,
        explain: 'First stop new orders being lost, then recover the ones already accepted. There is nothing to restore in SAP, because the orders were not saved.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the permanent fix and prevention?',
        options: [
          'Wrap each data-changing BAPI call in a Try with transactionalAction ALWAYS_BEGIN',
          'Add an integration test that creates an order and reads it back from SAP',
          'Add a reconciliation of portal orders against SAP documents',
          'Check the BAPI RETURN table and fail on error messages',
          'Treat a returned document number as proof that the order is saved',
        ],
        answer: [0, 1, 2, 3],
        explain: 'The returned number was exactly what misled everyone. Only reading the order back, or a reconciliation, proves that it exists.',
      },
      {
        type: 'order',
        prompt: 'Order the response steps.',
        items: [
          'Confirm with SAP support that sample order numbers do not exist',
          'Compare release 2.4.0 with 2.3.x around the BAPI call',
          'Roll back or restore the Try',
          'Create one test order and read it back in SAP',
          'Re-create the orders accepted since the release',
          'Reconcile the portal against SAP and inform the business',
        ],
        explain: 'Prove the symptom, find the change, stop the loss, verify the fix, and only then recover the backlog.',
      },
    ],
  },
  description: `
## Symptoms
- Wednesday 09:30: the order desk cannot find orders that customers see in the portal. For every order placed since this morning, \`VA03\` reports that the **document does not exist**.
- The portal shows a confirmation and an order number for each one.
- There are no errors in \`sap-orders-sys\`. Stock availability calls work normally.
- About **1,100 orders** have been accepted since last night's release.

## Change / Context
- \`sap-orders-sys\` calls \`BAPI_SALESORDER_CREATEFROMDAT2\` with **Synchronous Remote Function Call**, and returns \`SALESDOCUMENT\` to the portal.
- Release 2.4.0 went live on Tuesday evening. It was a **refactor** only: the BAPI call moved into a sub-flow, and scopes that "did nothing" were removed. The Try with \`transactionalAction="ALWAYS_BEGIN"\` had no error handler, and a reviewer called it redundant.
- Tests used a mocked SAP response.

## Logs
\`\`\`
22:10:03 INFO [deploy] sap-orders-sys 2.4.0 deployed
07:42:19 INFO [sap-orders-sys] BAPI_SALESORDER_CREATEFROMDAT2 returned
              SALESDOCUMENT=0000418823 RETURN type=S
07:42:19 INFO [sap-orders-sys] Response 201 orderNumber=418823
09:31:40 WARN [sap-support] VA03: document 418823 does not exist
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do right now?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'The docs: "You must add try to the BAPI call to create a transaction, otherwise the change does not impact SAP."',
    'A Try without an error handler can still matter, because of its transactional action.',
    'Reads were unaffected, because transactions are not necessary for queries to SAP.',
    'A returned document number and a success message did not prove that the order was saved.',
    'Immediate: roll back or restore the Try, verify with a read-back, then re-create the accepted orders once each.',
    'Prevention: a real SAP test that reads the order back, a reconciliation, and a comment explaining why the scope exists.',
  ],
  solution: `
**Diagnosis.** The call succeeds and returns a document number, but the document does not exist in SAP. Only data-changing calls are affected, and the problem starts with release 2.4.0, which removed the Try. Availability reads still work because they need no transaction.

**Immediate mitigation.**
- Roll back to the previous release, or restore the Try around the BAPI call.
- Create one test order and read it back in SAP.
- Export the orders accepted since the release from the portal and re-create them **once each**, at a controlled rate. They will get new numbers, so update the portal and tell the customers or the order desk.

**Root cause.** The connector needs an open transaction for a function that changes data. The Try looked redundant because it had no error handler, but its job was \`transactionalAction="ALWAYS_BEGIN"\`. Mocked tests could not detect the difference. In SAP terms, the BAPI's work was never committed, so the number it returned belongs to a document that was not saved.

**Permanent fix.**
- Restore the Try with \`ALWAYS_BEGIN\` around every data-changing BAPI call, and add a comment explaining why it is there.
- Read the \`RETURN\` table and fail on messages of type \`E\` or \`A\`.

**Prevention.**
- Add an integration test against an SAP test system that creates an order and **reads it back**.
- Add a scheduled reconciliation of portal orders against SAP documents, with an alert on any gap.
- Add a review checklist item: scopes with a transactional action are not removable clean-up.
`,
  followUps: [
    { q: 'Why did the availability check keep working?', a: 'It only reads data. The docs state that transactions are not necessary for queries to SAP.' },
    { q: 'Is a Try needed for an asynchronous call too?', a: 'Asynchronous calls use a different pattern in the docs: Start SAP Transaction, the call with that transaction ID, then Confirm Transaction.' },
    { q: 'Could you call BAPI_TRANSACTION_COMMIT yourself instead?', a: 'That is the usual SAP way to commit from outside, but it must run in the same session as the BAPI. The connector docs do not describe this, so stay with the documented Try unless the SAP team and a test prove otherwise.' },
  ],
}

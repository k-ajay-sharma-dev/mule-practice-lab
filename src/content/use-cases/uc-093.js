import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-093',
  category: 'use-cases',
  title: 'Salesforce Accounts to SAP S/4HANA Business Partners',
  level: 'INTERMEDIATE',
  tags: ['salesforce', 'sap', 'cdc', 'anypoint-mq', 'id-mapping', 'master-data', 'dlq'],
  estMinutes: 30,
  diagram: {
    task: 'draw how Salesforce account changes become SAP Business Partners: the change events, the queue, the Process API with its cross-reference table, both System APIs and the dead-letter queue.',
    checks: [
      { label: 'Account changes leave Salesforce as events', rule: { type: 'edge', from: 'crm', to: ['system-api', 'process-api', 'queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'Changes wait on a queue before SAP is called', rule: { type: 'path', from: 'crm', via: ['queue', 'topic', 'event-stream'], to: 'erp' } },
      { label: 'No synchronous call chain runs from Salesforce to SAP', rule: { type: 'no-path', from: 'crm', to: 'erp', kind: 'sync' } },
      { label: 'SAP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Salesforce is updated only through a System API', rule: { type: 'only-via', target: 'crm', from: 'system-api' } },
      { label: 'The Process API writes the SAP customer number back to Salesforce', rule: { type: 'path', from: 'process-api', to: 'crm' } },
      { label: 'Salesforce and SAP ids are kept in a cross-reference table', rule: { type: 'edge', from: 'process-api', to: ['database', 'cache'] } },
      { label: 'Messages that keep failing go to a dead-letter queue', rule: { type: 'edge', from: ['queue', 'topic', 'process-api'], to: 'dlq' } },
    ],
    reference: diagram(
      {
        sf: ['crm', 'Salesforce Sales Cloud'],
        ssf: ['system-api', 'sys-salesforce-api (CDC subscriber)'],
        q: ['queue', 'account-changes (Anypoint MQ)'],
        dlq: ['dlq', 'account-changes-dlq'],
        prc: ['process-api', 'prc-customer-sync'],
        xref: ['database', 'Account id cross-reference'],
        ssap: ['system-api', 'sys-sap-business-partner-api'],
        sap: ['erp', 'SAP S/4HANA'],
      },
      ['sf ~> ssf', 'ssf ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> xref', 'prc -> ssap', 'ssap -> sap', 'prc -> ssf', 'ssf -> sf'],
    ),
  },
  description: `
A B2B software and hardware vendor sells through **Salesforce Sales Cloud** and invoices from **SAP S/4HANA**. Today finance retypes every new customer into SAP, which takes two days and causes typos in tax IDs.

Requirements:
- When an account reaches **Customer** status (first opportunity at stage Contract), it must exist in SAP as a **Business Partner** with the customer role within **10 minutes**.
- Later changes to name, billing address, tax ID or account owner must follow.
- SAP owns **credit limit and payment terms**. They are shown read-only in Salesforce.
- The SAP customer number must be written back to the Salesforce account, because invoices and orders refer to it.
- Volumes: about **300 new customers a day** and **2,000 account updates**. A mass territory realignment can change **40,000 accounts** in one evening.
- SAP is down on Saturday nights for patching.

**Questions:**
1. How do you detect the changes in Salesforce?
2. How do you protect SAP from the 40,000-account burst and from its own downtime?
3. How do you avoid creating the same customer twice?
4. What happens to a record SAP rejects?
`,
  answerTemplate: `## Detecting changes

## Buffering and ordering

## Create or update in SAP

## Write-back and errors
`,
  keyPoints: [
    'Subscribe to Salesforce Change Data Capture on Account (with replay id stored) instead of polling.',
    'Publish each change to an Anypoint MQ queue; the Process API consumes it at a rate SAP can take, and the queue holds messages through the Saturday outage.',
    'A cross-reference table (Salesforce id ↔ SAP BP number) decides create or update and makes redelivery safe.',
    'Only the fields Salesforce owns are sent to SAP; credit limit and payment terms are never overwritten from Salesforce.',
    'The SAP number is written back through sys-salesforce-api; messages that fail after retries go to a DLQ with an alert.',
  ],
  solution: `
\`\`\`
Salesforce --CDC--> sys-salesforce-api --> [account-changes] --> prc-customer-sync --> sys-sap-business-partner-api --> SAP
                                                  |                    |  \\--> cross-reference table
                                                  \\--> DLQ             \\--> sys-salesforce-api (SAP number back)
\`\`\`

**Detecting changes.** The Salesforce connector subscribes to the \`AccountChangeEvent\` channel. The replay id of the last processed event is stored, so after a restart the app resumes without gaps. Events that are not relevant (no customer status, or only fields SAP does not need) are filtered out here.

**Buffering.** Each relevant change becomes one message on the \`account-changes\` queue with the account id as a property. The Process API listens with a small number of parallel consumers. During the realignment burst the queue grows and drains over the night, and SAP never sees more than its agreed rate. On Saturday nights the messages wait in the queue.

**Create or update.** The Process API looks up the account id in the **cross-reference table**:
- not found → create the Business Partner with the customer role, store the new BP number, then write it back to Salesforce;
- found → update only the fields Salesforce owns.

If two messages for the same account arrive close together, the cross-reference row is created with a unique key, so the second one becomes an update and not a second customer.

**Errors.** SAP business errors (invalid tax ID for the country) are not retried. The message goes to the DLQ and the account owner gets a task in Salesforce with the reason. Connection errors are retried by redelivery; after 5 attempts the message lands in the DLQ and support is alerted.

**Credit data back.** A separate small flow reads credit limit changes from SAP and updates the read-only fields in Salesforce through the same System API.
`,
  followUps: [
    { q: 'Why not let a Salesforce trigger call SAP directly with an Apex callout?', a: 'The callout would fail whenever SAP is down and Salesforce has governor limits on callouts. A queue in between absorbs outages and bursts.' },
    { q: 'How do you keep the order of updates for one account?', a: 'Use a FIFO queue or a message group per account id, or compare the event timestamp with the last applied one in the cross-reference table and skip older events.' },
    { q: 'What if the write-back to Salesforce fails after SAP created the customer?', a: 'The cross-reference row already holds the SAP number. A retry of the same message finds it, skips the create and only repeats the write-back.' },
  ],
}

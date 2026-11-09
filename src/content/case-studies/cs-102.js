import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-102',
  category: 'case-studies',
  title: 'Pharma Company Centralising Adverse Event Intake From Every Channel',
  level: 'ADVANCED',
  tags: ['pharma', 'pharmacovigilance', 'compliance', 'anypoint-mq', 'idempotency', 'dlq', 'oracle', 'salesforce', 'sftp', 'pii'],
  estMinutes: 50,
  diagram: {
    task: 'draw adverse event intake: the public web form and the medical information CRM reach an intake Experience API through the gateway; pollers read the safety mailbox and the licensing partners\' SFTP; all channels feed one intake queue; one Process API checks for duplicates and creates cases in the Oracle safety database through a System API; incomplete reports go to a triage queue for safety specialists; failed messages go to a dead-letter queue.',
    checks: [
      { label: 'The web form and the CRM reach the intake API only through the gateway', rule: { type: 'only-via', target: 'experience-api', from: 'api-gateway' } },
      { label: 'Pollers read the safety mailbox and the partner SFTP', rule: { type: 'edge', from: 'batch-job', to: ['sftp-server', 'saas'], min: 2 } },
      { label: 'The intake API and the pollers feed one shared intake queue', rule: { type: 'each', of: 'queue', edgeFrom: ['experience-api', 'batch-job'], count: 2, some: true } },
      { label: 'No channel writes to the safety database synchronously', rule: { type: 'no-path', from: ['crm', 'web-app', 'partner', 'experience-api', 'batch-job'], to: 'oracle-db', kind: 'sync' } },
      { label: 'A Process API takes reports off the queue and creates cases in the safety database', rule: { type: 'path', from: 'queue', via: 'process-api', to: 'oracle-db' } },
      { label: 'The safety database is reached only through a System API', rule: { type: 'only-via', target: 'oracle-db', from: 'system-api' } },
      { label: 'Duplicate reports are checked before a case is created', rule: { type: 'link', from: 'process-api', to: { type: ['database', 'cache'], label: ['dup'] } } },
      { label: 'Incomplete reports go to a triage queue for safety specialists', rule: { type: 'path', from: 'process-api', via: 'queue', to: 'internal-app' } },
      { label: 'Reports that fail processing are kept on a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
      { label: 'Lines to and from queues are async messages', rule: { type: 'lines', touching: 'queue', kind: 'async' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Public adverse event form'],
        crm: ['crm', 'Medical information CRM (Salesforce)'],
        gw: ['api-gateway', 'API gateway (client ID, bot protection)'],
        ef: ['experience-api', 'exp-ae-intake-api'],
        mbox: ['saas', 'Safety mailbox (Exchange Online)'],
        lic: ['partner', 'Licensing partners (12)'],
        sftp: ['sftp-server', 'Partner SFTP (case line listings)'],
        poll: ['batch-job', 'mailbox and SFTP pollers'],
        q: ['queue', 'ae-intake'],
        dlq: ['dlq', 'ae-intake-dlq'],
        p: ['process-api', 'prc-ae-case-intake'],
        dup: ['database', 'Duplicate check index'],
        ss: ['system-api', 'sys-safety-db-api'],
        sdb: ['oracle-db', 'Safety database (Oracle)'],
        tq: ['queue', 'ae-needs-triage'],
        wb: ['internal-app', 'Safety triage workbench'],
      },
      [
        'web -> gw', 'crm -> gw', 'gw -> ef', 'ef ~> q', 'lic -> sftp', 'poll -> sftp', 'poll -> mbox', 'poll ~> q',
        'q ~> p', 'q ~> dlq', 'p -> dup', 'p -> ss', 'ss -> sdb', 'p ~> tq', 'tq ~> wb',
      ],
    ),
  },
  description: `
**Context.** A pharmaceutical company markets 60 products in 35 countries. By law it must collect every report of a suspected adverse reaction, assess it and send serious cases to regulators within 15 calendar days (7 days for fatal or life-threatening unexpected reactions). The clock ("day zero") starts when anyone in the company, or a partner acting for it, first learns of the event.

**Channels today.**
- The medical information call centre logs calls in Salesforce; agents email a form to the safety team.
- A public web form on each country site sends an email.
- A shared safety mailbox receives reports from doctors, pharmacists and patients, often as PDF attachments.
- 12 licensing partners send weekly CSV line listings by SFTP.

Safety specialists re-key everything into the safety database, an on-premises Oracle-based product with a vendor API for case creation.

**The problem today.** About 4,000 reports a month, up to 3 times more after media coverage of a product. A recent inspection found 31 late cases; in 19 of them the report had sat in the mailbox for days. Some events are reported twice (by the patient and by their doctor) and were entered as two cases.

**Goals**
- Every report has a case or a triage item within 1 hour of receipt, with day zero recorded from the channel.
- Possible duplicates are flagged before a case is created.
- Nothing is lost: every received report can be traced to a case or a documented decision.

**Constraints**
| Item | Detail |
|---|---|
| Safety database | Vendor API creates and updates cases; about 5 case creations a second; nightly maintenance 01:00 to 01:30 |
| Data | Reports contain health data on identifiable people; minimum data in logs; GDPR and local laws apply |
| Validation | The safety database and its interfaces are GxP systems: validated, with audit trails |
| Partners | Contracts set the CSV layout; partners send late or corrected files |

**Your task.** Design the intake from every channel to the safety database.
`,
  answerTemplate: `## Channels and day zero

## One intake path

## Normalising reports

## Duplicate detection

## Incomplete reports and triage

## Errors, traceability and audit

## Validation and privacy
`,
  keyPoints: [
    'All channels end on one intake queue, so day zero recording, duplicate checks, error handling and audit exist once.',
    'Synchronous channels (web form, CRM) call an Experience API that records day zero and answers at once; mailbox and SFTP are polled by scheduled jobs.',
    'The intake Process API normalises to the four minimum criteria (patient, reporter, product, event) and E2B(R3) style fields, checks for duplicates and creates the case through a System API.',
    'Reports missing a minimum criterion, or flagged as possible duplicates, go to a triage queue for a safety specialist instead of being dropped.',
    'Nothing writes to the safety database except its System API, which paces calls and handles the maintenance window.',
    'Every report gets a receipt id that is traceable from channel to case or decision; failures go to a dead-letter queue that is watched.',
  ],
  solution: `
**Channels.**
- \`exp-ae-intake-api\` accepts the web form and the Salesforce call log (a Flow calls it when an agent marks a call as an adverse event). It stores the original, records day zero as the receipt time and publishes to \`ae-intake\`. The caller gets a receipt id.
- Scheduled pollers read the safety mailbox every 5 minutes (Microsoft Graph) and the partner SFTP folder every 15 minutes. Each email (with attachments) or each CSV row becomes one message. Day zero is the email received time or the date in the partner file, not the time Mule read it.

**Processing.** \`prc-ae-case-intake\` consumes \`ae-intake\`:
1. Normalise to a common report model (patient, reporter, product, event, seriousness, dates).
2. Check minimum criteria. If one is missing, put it on \`ae-needs-triage\`.
3. Check the duplicate index (patient initials, age, sex, product, event term, onset date). A strong match goes to triage as a possible duplicate with the existing case number.
4. Create the case through \`sys-safety-db-api\` with the day zero and source document attached. Store the case number against the receipt id.

**Pacing.** Consumers are limited to about 4 creations a second. During the 01:00 maintenance window the System API returns a retryable error and the queue holds the reports.

**Errors.** After three failed deliveries a report goes to \`ae-intake-dlq\`, and the safety operations team is alerted, since the regulatory clock is running.

**Traceability.** A daily reconciliation lists every receipt id and its outcome (case, triage, duplicate, dead letter). Any report without an outcome after 1 hour raises an alert.

**Validation and privacy.** The integration is validated with the safety database. Logs hold receipt ids and case numbers only. Attachments stay in encrypted storage with restricted access.
`,
  followUps: [
    { q: 'Why record day zero at the channel and not when the case is created?', a: 'The legal clock starts when the company first learns of the event. Delays in the integration must not hide time already spent.' },
    { q: 'Why send possible duplicates to a person instead of merging them automatically?', a: 'Two reports may describe different events in similar patients. A safety specialist decides, and the decision is documented.' },
    { q: 'How do you prove nothing was lost?', a: 'Give every received report a receipt id and reconcile ids against outcomes daily. Alert on any report without a case, triage item or decision after one hour.' },
    { q: 'What happens to reports during the safety database maintenance window?', a: 'They wait on the intake queue and are retried when the window ends. Day zero is already recorded, so the delay is visible but harmless.' },
  ],
}

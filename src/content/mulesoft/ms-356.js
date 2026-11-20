export default {
  id: 'ms-356',
  category: 'mulesoft',
  title: 'The Daily Job Report Email Stopped Arriving: What to Check First',
  level: 'ADVANCED',
  tags: ['myproject', 'email', 'production-support', 'async', 'smtp', 'troubleshooting'],
  estMinutes: 20,
  quiz: [
    {
      type: 'order',
      prompt: 'The daily report mail has not arrived for three days. Put the first checks in order.',
      items: [
        'Check that the report flow ran: scheduler logs and the job log rows for those days',
        'Check the send step: logged result, errors from the Email connector or the outbox table',
        'Check the mail side: message trace on the mail server, quarantine and spam folders',
        'Check the recipients: list membership, mailbox rules and size limits',
      ],
      explain: 'Follow the mail from the trigger to the inbox. Stop at the first step that did not happen.',
    },
    {
      type: 'single',
      prompt: 'The send runs inside an Async scope. The logs show nothing about it. Why might an error be invisible?',
      options: [
        'Async retries a failed send in the background until it works',
        'An error inside Async does not reach the flow that started it',
        'Async runs on another worker, whose logs are kept apart',
        'Async drops its work when the flow that started it ends first',
      ],
      answer: 1,
      explain: 'The calling flow has already moved on, so it ends with success. Without its own error handling and logging, the failure can go unnoticed. Async keeps the main job fast, but it needs its own Try and logging.',
    },
    {
      type: 'single',
      prompt: 'The connector log shows "535 Authentication unsuccessful" since Monday. What is likely?',
      options: [
        'The mail is larger than the server accepts for this account',
        'The password expired, or basic auth was turned off for the mailbox',
        'One of the recipients left, so the server refuses the whole mail',
        'The TLS certificate of the mail server expired on Monday',
      ],
      answer: 1,
      explain: '535 is a failed SMTP login. Some cloud mail services have moved away from basic SMTP authentication. Check the tenant settings and the account. A size limit gives 552, an unknown recipient 550, and a certificate problem fails before the login.',
    },
    {
      type: 'single',
      prompt: 'The mail server message trace shows the mail was delivered, but nobody sees it. Where do you look?',
      options: [
        'In the Mule logs, for the SMTP reply the connector got',
        'In quarantine, junk folders, mailbox rules and list membership',
        'In the outbox table, for the status of the send',
        'In the scheduler, for the time the report flow ran',
      ],
      answer: 1,
      explain: 'Delivered to the mailbox is not the same as seen by a person. The Mule side is already proven by the trace, so look at the recipients\' side.',
    },
    {
      type: 'multi',
      prompt: 'The report started failing when a reject attachment grew to 30 MB. What fits?',
      options: [
        'The mail server rejects messages above its size limit, often with a 552 reply',
        'Send a summary with counts and a link to the full reject list instead of attaching it',
        'Base64 encoding makes a 30 MB file smaller on the wire',
        'Raise the timeout of the Email connector so the large send can finish',
      ],
      answer: [0, 1],
      explain: 'A link keeps mails small and keeps reject data in a controlled place. Base64 makes an attachment about a third larger, not smaller. A longer timeout does not change the server limit.',
    },
    {
      type: 'single',
      prompt: 'What stops a silent failure like this from lasting three days next time?',
      options: [
        'Alert on every ERROR line the Email connector writes to the logs',
        'Record each send with its result, and alert if none is SENT by a set time',
        'Send the report twice, from two apps, so one copy gets through',
        'Make the report flow fail when the send fails, so it shows in Runtime Manager',
      ],
      answer: 1,
      explain: 'Alert on the absence of the expected result, not only on errors. An error alert misses a flow that never ran or a send that never started. Failing the report flow mixes up the data status and the mail status.',
    },
  ],
  description: `
Brindle Outdoor's product data hub has a report app that mails a daily summary of inbound and outbound runs to the integration team. The mail is sent in an Async scope at the end of the report flow. Nobody noticed for three days that it had stopped. The report flow itself shows as successful each day.

**Questions**
1. How do you trace where the mail stopped?
2. Why can a failure inside Async go unnoticed?
3. Which SMTP and mailbox causes would you look for?
4. How do you make sure it is noticed in hours next time?
`,
  answerTemplate: `## Tracing the mail

## Async and hidden failures

## SMTP and mailbox causes

## Noticing sooner
`,
  keyPoints: [
    'Follow the mail from trigger to inbox and stop at the first gap.',
    'Errors inside Async do not reach the main flow.',
    'Give the Async scope its own Try and logging.',
    'Look for expired credentials, turned off basic auth and size limits.',
    'Delivered mail can sit in quarantine or junk.',
    'Record sends in an outbox and alert when no SENT row appears.',
  ],
  solution: `
**1. Tracing.** Check the scheduler ran and the job log rows exist for each day. Then check the send step's logs or outbox rows. Then ask the mail team for a message trace. Then check the recipients' quarantine, junk folders, rules and list membership.

**2. Async.** The Async scope runs the send on its own. An error there does not fail the main flow, so the report flow looks successful. Without a Try and an error log inside the scope, the failure is only visible in a generic error line, if at all.

**3. SMTP and mailbox causes.** A 535 reply means the login failed: an expired password, a locked account, or basic authentication turned off for the mailbox. A 552 reply points at a size limit, for example a large reject attachment. Delivered mail may be in quarantine because of sender checks.

**4. Noticing sooner.** Write each send to an outbox table with its result. Alert when the daily report has no SENT row by a set time. Keep large lists out of mails and link to them instead.
`,
  followUps: [
    {
      q: 'Should the report flow fail when the mail fails?',
      a: 'Usually no, the data work succeeded. Mark the send as FAILED in the outbox and retry it, so the report and the mail have separate statuses.',
    },
    {
      q: 'How do you resend the three missed reports?',
      a: 'Rebuild them from the job log for those dates and send them with the original date in the subject, so readers know they are late copies.',
    },
    {
      q: 'Who should own the SMTP account?',
      a: 'A service account managed by the platform team, with a known expiry or a non expiring policy approved by security, and a named contact.',
    },
  ],
}

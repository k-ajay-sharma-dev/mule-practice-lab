export default {
  id: 'inc-075',
  category: 'incidents',
  title: 'Supplier Invoices Silently Skipped After Staff Open Them in the Shared Mailbox',
  level: 'INTERMEDIATE',
  tags: ['email', 'imap', 'watermark', 'polling', 'finance', 'production'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '2026-10-19 08:45:00 INFO  [invoice-intake] Poll of INBOX on ap-invoices@: 6 emails dispatched', relevant: false },
      { text: '2026-10-19 08:52:13 INFO  [mail-audit] ap-invoices@ message 48213 "INV-20771 Northline" received', relevant: true, why: 'The missing invoice arrived in the mailbox, so delivery is not the problem.' },
      { text: '2026-10-19 08:56:41 INFO  [mail-audit] ap-invoices@ message 48213 flag set \\Seen by client user=m.okafor', relevant: true, why: 'A person opened the email before the next poll, so it is now marked as read.' },
      { text: '2026-10-19 09:00:00 INFO  [invoice-intake] Poll of INBOX on ap-invoices@: 3 emails dispatched (INV-20772, INV-20774, INV-20775)', relevant: true, why: 'The poll ran normally and did not dispatch the read email, and it logged no error. This fits the reference, which says already-read emails are filtered by default.' },
      { text: '2026-10-19 09:00:03 INFO  [invoice-intake] Stored attachment INV-20772.pdf (188 KB)', relevant: false },
      { text: '2026-10-19 09:05:00 INFO  [health] GET /api/health 200 (3 ms)', relevant: false },
      { text: '2026-10-19 09:15:00 INFO  [invoice-intake] Poll of INBOX on ap-invoices@: 2 emails dispatched', relevant: true, why: 'Later polls still do not pick it up, because it was received before the last poll and the watermark only passes newer emails.' },
      { text: '2026-10-19 09:40:22 INFO  [erp] Posted 11 invoices to accounts payable', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why are some invoices never processed?',
        options: [
          'The evidence points to the read flag: staff opened these emails before the next poll, and the reference says read emails are filtered by default',
          'The mail server is rejecting emails with large attachments',
          'The watermark deletes emails that are older than the last poll',
          'The ERP refuses invoices from some suppliers',
        ],
        answer: 0,
        explain: 'The audit shows each missing email was opened before a poll, and the listener reference says already-read emails are filtered by default. The same reference lists Seen with a default of INCLUDE and does not define it, so treat this as the best-supported cause and confirm it in a test mailbox. The watermark filters by received date but deletes nothing.',
      },
      {
        type: 'single',
        prompt: 'An analyst suggests marking the 37 missed emails as unread so the listener collects them. Will this work?',
        options: [
          'No: they were received before the last poll, so the watermark still stops them. Recover them with a one-off email:list-imap flow',
          'Yes: the listener picks up any unread email on the next poll',
          'Yes, but only after an application restart',
          'No: read emails can never be accessed by the connector again',
        ],
        answer: 0,
        explain: 'With Enable Watermark on, only emails received after the last poll are dispatched. Unread status alone does not bring back an older email. `email:list-imap` has its own matcher and can reach them.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the permanent fix?',
        options: [
          'Configure the Imap Matcher so that already-read emails are also retrieved, and test it with a read and an unread email',
          'Keep the watermark on, so read emails are not dispatched on every poll',
          'Give the integration a mailbox that staff do not work in',
          'Make invoice processing idempotent on supplier and invoice number',
          'Turn off the watermark and leave the default matcher unchanged',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Fix the filter, keep the watermark, and remove the human race condition. Turning the watermark off leaves the read flag question unanswered and gives up the documented filter on older emails.',
      },
      {
        type: 'order',
        prompt: 'Put the response in order.',
        items: [
          'Compare the mail audit with invoices stored by the flow to list what was missed',
          'Confirm from the flags that each missing email was opened before a poll',
          'Run a one-off email:list-imap flow to recover the missed emails idempotently',
          'Reconcile recovered invoices with accounts payable',
          'Release the matcher change and move staff out of the integration mailbox',
        ],
        explain: 'Measure the gap, prove the cause, recover the invoices before payment terms lapse, reconcile, and then fix the design.',
      },
    ],
  },
  description: `
## Symptoms
- Suppliers are chasing late payments. Accounts payable finds **37 invoices** from the last two weeks that never reached the ERP.
- Every missing email is in \`ap-invoices@\`, and each one shows as read.
- There are no errors in the logs, and about 1,200 other invoices were processed normally.

## Change / Context
- \`invoice-intake\` uses \`email:listener-imap\` on INBOX, polling every 15 minutes. **Enable Watermark** is at its default and no Imap Matcher is configured.
- Two weeks ago the AP team was given access to the same mailbox in their mail client, to answer supplier queries faster.

## Logs
\`\`\`
08:52:13 INFO  [mail-audit] ap-invoices@ message 48213 "INV-20771 Northline" received
08:56:41 INFO  [mail-audit] ap-invoices@ message 48213 flag set \\Seen by client user=m.okafor
09:00:00 INFO  [invoice-intake] Poll of INBOX on ap-invoices@: 3 emails dispatched (INV-20772, INV-20774, INV-20775)
09:15:00 INFO  [invoice-intake] Poll of INBOX on ap-invoices@: 2 emails dispatched
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
    'The listener reference says already-read emails are filtered by default, but it also lists Seen with a default of INCLUDE and does not define it. Prove the behaviour in a test mailbox.',
    'Staff opening an email between its arrival and the next poll sets the seen flag. Here, those emails were then not dispatched, and no error was logged.',
    'The watermark works by received date, so a skipped email is not dispatched on any later poll, even if marked unread.',
    'Immediate: list the gap, recover with a one-off email:list-imap flow, process idempotently, reconcile with AP.',
    'Fix: set the Imap Matcher to retrieve read emails, keep the watermark, and keep people out of the integration mailbox.',
    'Prevention: reconcile mailbox counts against processed counts, because this failure produces no error.',
  ],
  solution: `
**Diagnosis.** Each missing email arrived normally and was opened by a person before the next poll. The listener has no matcher configured, and the reference says that by default already-read emails are filtered. The timing matches: staff got access two weeks ago, and the oldest missing invoice dates from then. The docs are not fully consistent, because the matcher's Seen field defaults to INCLUDE and that value is not defined. So the evidence here carries the diagnosis, and a test with one read and one unread email should confirm it.

**Immediate mitigation.**
- Compare the mailbox with what the flow stored to list the missed emails.
- Run a one-off flow with \`email:list-imap\`, using a matcher that includes read emails and \`receivedSince\` for the period.
- Process them idempotently on supplier and invoice number, then reconcile with AP. Tell AP which invoices are close to their payment date.

Marking the emails unread will not work, because they are older than the watermark.

**Root cause.** Two filters combined with a process change. On the evidence, the read emails were dropped by the default filtering, and the received-date watermark meant they were never tried again. The design assumed that only the integration would read the mailbox.

**Permanent fix.**
- Configure the **Imap Matcher** so read emails are retrieved. Set \`seen\` explicitly. The reference does not define REQUIRE, INCLUDE and EXCLUDE individually, so prove the setting with a read and an unread email in a test mailbox.
- Keep **Enable Watermark** on, so read emails are not dispatched again on each poll.
- Give the integration its own mailbox. Staff can work from a forwarded copy.
- After processing, file each email with \`email:move-to-folder\`, so INBOX shows what is outstanding.

**Prevention.** Reconcile daily: emails received against invoices stored, with an alert on any difference. Add this scenario to the test pack, and treat shared access to integration mailboxes as a change that needs review.
`,
  followUps: [
    { q: 'Why was there no error?', a: 'Filtering is normal listener behaviour, and the logs show no error for these emails, so only a reconciliation can reveal the gap.' },
    { q: 'Would POP3 avoid this?', a: 'It would lose more than it gains. The POP3 listener has no watermark option, and delete-after-retrieve is the only way to remove messages after retrieval. A dedicated IMAP mailbox is the better fix.' },
    { q: 'Could you filter by sender as well?', a: 'Yes. The Imap Matcher has fromRegex and subjectRegex, which help keep out noise. Test them, because too narrow a pattern is another silent way to skip invoices.' },
  ],
}

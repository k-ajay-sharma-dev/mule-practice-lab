export default {
  id: 'inc-077',
  category: 'incidents',
  title: 'One email:delete Per Message, Yet Dozens of Flagged Emails Disappear From the Shared Folder',
  level: 'INTERMEDIATE',
  tags: ['email', 'imap', 'data-loss', 'production', 'shared-mailbox'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '2026-10-27 09:30:02 INFO  [mail-audit] support@ INBOX: 64 messages flag set \\Deleted by client user=t.lindqvist', relevant: true, why: 'A person flagged 64 emails as deleted. In this mail client they stay visible, struck through, until the folder is purged.' },
      { text: '2026-10-27 10:00:00 INFO  [ticket-intake] Poll of INBOX on support@: 2 emails dispatched', relevant: false },
      { text: '2026-10-27 10:00:01 INFO  [ticket-intake] Created ticket CS-99120 from email id=7741', relevant: false },
      { text: '2026-10-27 10:00:02 INFO  [ticket-intake] email:delete emailId=7741 folder=INBOX', relevant: true, why: 'The flow deletes one id, but on IMAP this operation also erases every message flagged deleted in the folder.' },
      { text: '2026-10-27 10:00:02 INFO  [mail-audit] support@ INBOX: 65 messages removed', relevant: true, why: 'This is the 64 flagged emails plus the one the flow asked to delete.' },
      { text: '2026-10-27 10:05:00 INFO  [health] GET /api/health 200 (3 ms)', relevant: false },
      { text: '2026-10-27 11:12:40 WARN  [service-desk] t.lindqvist reports 64 flagged emails no longer visible in INBOX', relevant: true, why: 'The user meant to review these before removing them, and the flow removed them for good.' },
      { text: '2026-10-27 11:15:00 INFO  [ticket-intake] Poll of INBOX on support@: 1 email dispatched', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why did 65 emails disappear when the flow deleted one?',
        options: [
          'On IMAP, email:delete also erases all messages flagged deleted in the folder',
          'The listener Delete After Retrieve option removed them',
          'email:delete removes every email from the same sender',
          'The watermark removed older emails',
        ],
        answer: 0,
        explain: 'The count matches exactly: 64 flagged by the user plus 1. Delete After Retrieve acts on retrieved emails, and these 64 were never retrieved. The watermark deletes nothing.',
      },
      {
        type: 'single',
        prompt: 'A developer proposes replacing `email:delete` with `email:expunge-folder`. What is your response?',
        options: [
          'That has the same problem: expunge removes every message flagged deleted in the folder',
          'Good: expunge affects only the current email',
          'Good: expunge moves the messages to Trash',
          'It would work only with POP3',
        ],
        answer: 0,
        explain: 'Expunge is a folder-wide operation by definition. It is not a safer way to remove one message.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the permanent fix?',
        options: [
          'Stop deleting: file processed emails with email:move-to-folder',
          'Run the integration on a mailbox or folder that staff do not use',
          'Document for staff how flagged emails behave in the shared folder until the change is live',
          'Add a test that flags a second email and shows what a delete does to it',
          'Call email:delete twice to make the operation more precise',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Remove the folder-wide operation from the flow and separate human activity from automation. Moving also leaves an audit trail, which a delete cannot give you.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Pause the flow, or at least the email:delete step, so no more flagged emails are lost',
          'Compare the audit log with the delete calls to measure the loss',
          'Ask the mail administrators about recovery from their retention or backup',
          'Replace the delete with a move to a Processed folder and test it',
          'Resume the flow and confirm that flagged emails are untouched',
        ],
        explain: 'Stop further loss first. Recovery depends on the mail platform, so involve its owners early, because retention windows can be short.',
      },
    ],
  },
  description: `
## Symptoms
- A customer service lead reports that **64 emails** she flagged for deletion, and planned to review later, vanished from \`support@\`.
- The mail audit shows they were removed at the moment Mule processed an unrelated email.
- No errors appear in the app or the mail server logs.

## Change / Context
- \`ticket-intake\` reads \`support@\` with \`email:listener-imap\`, creates a ticket and then calls \`email:delete\` with \`emailId="#[attributes.id]"\` to keep INBOX tidy.
- The team's mail client flags a deleted message and leaves it visible until the folder is purged. Staff use that as an informal "to be reviewed" state.

## Logs
\`\`\`
09:30:02 INFO  [mail-audit] support@ INBOX: 64 messages flag set \\Deleted by client user=t.lindqvist
10:00:02 INFO  [ticket-intake] email:delete emailId=7741 folder=INBOX
10:00:02 INFO  [mail-audit] support@ INBOX: 65 messages removed
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
    'email:delete removes the given email and, on IMAP, also erases all messages flagged deleted in the folder.',
    'The audit count matches: 64 flagged emails plus the one the flow deleted.',
    'email:expunge-folder removes all flagged messages too, so it is not a safer alternative.',
    'Immediate: stop the delete step, measure the loss, and ask mail administrators about recovery.',
    'Fix: file emails with email:move-to-folder, and keep the integration out of folders staff work in.',
    'No error appears, because the operation did what it documents.',
  ],
  solution: `
**Diagnosis.** The operation did what the reference documents. \`email:delete\` removes the email with the given id and, on IMAP, also erases all messages marked deleted in the folder. The audit shows 65 removed: the 64 flagged earlier by the user, plus the id Mule passed. The 64 were never retrieved by the flow, so Delete After Retrieve is not involved.

**Immediate mitigation.**
- Pause the delete step, or the flow, so nothing more is lost.
- Use the audit log to list what was removed.
- Ask the mail administrators about recovery. What is possible depends on the mail platform's retention and backups.
- Tell the team not to flag emails in this folder until the fix is live.

**Root cause.** The flow used a folder-wide side effect in a folder shared with people. Staff relied on a state, flagged but not purged, that the operation clears.

**Permanent fix.**
- Replace the delete with \`email:move-to-folder\`, targeting a \`Processed\` folder. This keeps INBOX tidy and leaves an audit trail.
- Run the integration on a mailbox or folder that staff do not use, so no human flags can sit alongside messages being automated.
- Keep \`email:delete\` and \`email:expunge-folder\` for deliberate clean-up of folders owned by the integration.

**Prevention.** Read the full description of any operation that changes a mailbox. Add a test with a second flagged email in a test mailbox, to record what each operation does on your mail server. Review shared mailbox use before an integration goes live.
`,
  followUps: [
    { q: 'Is this a connector bug?', a: 'No. The reference states this behaviour for IMAP. The mistake was assuming the operation only touched the id that was passed.' },
    { q: 'Would POP3 behave the same way?', a: 'The note is specific to IMAP. POP3 has no folders of this kind, and delete-after-retrieve is the only way to remove messages after retrieval.' },
    { q: 'Why is moving better than deleting for tickets?', a: 'You can prove what was processed, recover from a bad release, and reprocess an email. A deleted email offers none of that.' },
  ],
}

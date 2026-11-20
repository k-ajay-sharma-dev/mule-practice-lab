export default {
  id: 'inc-289',
  category: 'incidents',
  title: "The Mailbox Poller Processes the Same Supplier Email Every Five Minutes",
  level: 'INTERMEDIATE',
  tags: ["myproject","email","imap","polling"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 09:00:00 INFO  [supplier-mail] deleteAfterRetrieve=false markAsRead=false", relevant: true, why: "Nothing marks the message." },
      { text: "2026-11-18 09:00:01 INFO  [supplier-mail] Read message subject=\"ASN 7710\" uid=4410", relevant: false },
      { text: "2026-11-18 09:05:01 INFO  [supplier-mail] Read message subject=\"ASN 7710\" uid=4410", relevant: true, why: "The same message again." },
      { text: "2026-11-18 09:05:02 WARN  [wms] Duplicate ASN 7710", relevant: true, why: "Duplicates downstream." },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why is the email read again?",
        options: [
          "The poller never marks or moves it, so each poll sees it as new",
          "The supplier resends the ASN email every five minutes",
          "The IMAP server resets the read flag on every login",
          "The mailbox clock is behind, so old mail looks new again",
        ],
        answer: 0,
        explain: "Unread stays unread.",
      },
      {
        type: 'single',
        prompt: "What should the flow do after success?",
        options: [
          "Mark the message as read or move it to a processed folder",
          "Reply to the supplier so the email thread is closed",
          "Forward the message to the warehouse team mailbox",
          "Leave it unread and let the warehouse drop duplicates",
        ],
        answer: 0,
        explain: "Change its state.",
      },
      {
        type: 'multi',
        prompt: "What else protects downstream?",
        options: [
          "Check the ASN number before posting",
          "Track message IDs already processed",
          "Move failed messages to an error folder",
          "Read every message in the inbox on each poll",
        ],
        answer: [0,1,2],
        explain: "Idempotency and clear folders.",
      },
      {
        type: 'single',
        prompt: "Why move rather than delete?",
        options: [
          "You keep an audit trail and can reprocess",
          "Moving is faster than deleting on IMAP servers",
          "IMAP does not let a client delete messages",
          "Deleted mail comes back on the next poll",
        ],
        answer: 0,
        explain: "Keep evidence.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Remove duplicate ASNs",
          "Configure move to processed",
          "Add an ASN duplicate check",
          "Add an error folder",
          "Test with one message",
        ],
        explain: "Clean, fix, harden, test.",
      },
    ],
  },
  description: `
## Symptoms
- The warehouse gets duplicate ASNs every five minutes.

## Change / Context
- Suppliers email ASNs. A Mule flow polls the mailbox over IMAP.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 09:00:00 INFO  [supplier-mail] deleteAfterRetrieve=false markAsRead=false
2026-11-18 09:00:01 INFO  [supplier-mail] Read message subject="ASN 7710" uid=4410
2026-11-18 09:05:01 INFO  [supplier-mail] Read message subject="ASN 7710" uid=4410
2026-11-18 09:05:02 WARN  [wms] Duplicate ASN 7710
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
    "Pollers must change message state.",
    "Mark read or move.",
    "Keep processed and error folders.",
    "Check business keys downstream.",
    "Track message IDs.",
    "Test with one message.",
  ],
  solution: `
**Diagnosis.** Messages are never marked or moved, so every poll reads them again.

**Immediate mitigation.**
- Remove duplicates.

**Root cause.** Poller config leaves messages unchanged.

**Permanent fix.**
- Move to processed after success.

**Prevention.** Duplicate checks on ASN numbers.
`,
  followUps: [
    { q: "IMAP or POP3?", a: "IMAP supports folders and flags." },
    { q: "What is a Message-ID?", a: "A header that identifies an email." },
    { q: "What about attachments?", a: "Read them as parts and validate them." },
    { q: "Should a mailbox be an interface?", a: "Prefer APIs or SFTP where possible." },
  ],
}

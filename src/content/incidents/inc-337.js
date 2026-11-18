export default {
  id: 'inc-337',
  category: 'incidents',
  title: "Store Reports Bounce for 40 Stores After a Reorganisation",
  level: 'ADVANCED',
  tags: ["myproject","email","bounces","distribution-lists"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 07:00:00 INFO  [store-reports] Sent=600 failed=0", relevant: true, why: "The relay accepted all." },
      { text: "2026-11-18 07:05:00 INFO  [mailbox] Bounces received=40 code=550 5.1.1 user unknown", relevant: true, why: "Bounces arrive later." },
      { text: "2026-11-18 07:05:00 INFO  [store-reports] Recipients from table store_contacts updated 2025-03-01", relevant: true, why: "The contact table is old." },
      { text: "2026-11-15 09:00:00 INFO  [hr] Store manager mailboxes replaced by shared mailboxes", relevant: true, why: "Addresses changed." },
      { text: "2026-11-18 23:59:00 INFO  [store-reports] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why did Mule log no failures?",
        options: [
          "The relay accepted the mail. Bounces arrive later as separate emails",
          "They did not bounce",
          "Mule hides errors",
          "Logs failed",
        ],
        answer: 0,
        explain: "Accepted is not delivered.",
      },
      {
        type: 'single',
        prompt: "What is the fix?",
        options: [
          "Update store contacts to the shared mailboxes",
          "Retry the same addresses",
          "Ignore bounces",
          "Use BCC",
        ],
        answer: 0,
        explain: "Fix the source of addresses.",
      },
      {
        type: 'multi',
        prompt: "What prevents silent bounces?",
        options: [
          "Read the bounce mailbox and mark bad addresses",
          "Own the contact table with the business",
          "Use role addresses that survive staff changes",
          "Send twice",
        ],
        answer: [0,1,2],
        explain: "Feedback and good addresses.",
      },
      {
        type: 'single',
        prompt: "What is a 5.1.1 bounce?",
        options: [
          "The mailbox does not exist",
          "A full mailbox",
          "Spam",
          "A delay",
        ],
        answer: 0,
        explain: "Permanent, do not retry.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Update the 40 contacts",
          "Resend reports",
          "Process the bounce mailbox",
          "Use role addresses",
          "Agree contact ownership",
        ],
        explain: "Fix, resend, feedback, harden, own.",
      },
    ],
  },
  description: `
## Symptoms
- 40 store managers say they did not get their report.

## Change / Context
- Store mailboxes were replaced last week.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 07:00:00 INFO  [store-reports] Sent=600 failed=0
2026-11-18 07:05:00 INFO  [mailbox] Bounces received=40 code=550 5.1.1 user unknown
2026-11-18 07:05:00 INFO  [store-reports] Recipients from table store_contacts updated 2025-03-01
2026-11-15 09:00:00 INFO  [hr] Store manager mailboxes replaced by shared mailboxes
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
    "Accepted by the relay is not delivered.",
    "Bounces arrive later.",
    "Read bounces and mark addresses.",
    "Use role addresses.",
    "5.1.1 means no such mailbox.",
    "Own the contact data.",
  ],
  solution: `
**Diagnosis.** Addresses are out of date and bounce after the relay accepts them.

**Immediate mitigation.**
- Update contacts and resend.

**Root cause.** No owner for contact data and no bounce handling.

**Permanent fix.**
- Role addresses and bounce processing.

**Prevention.** Contact ownership with the business.
`,
  followUps: [
    { q: "Can Mule see delivery?", a: "Not directly. Bounces and delivery reports come later." },
    { q: "What is a role address?", a: "An address tied to a role, such as store041@, not a person." },
    { q: "Should you retry 5xx bounces?", a: "No, they are permanent." },
    { q: "How often to check bounces?", a: "After each send run." },
  ],
}

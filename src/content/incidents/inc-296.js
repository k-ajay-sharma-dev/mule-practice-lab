export default {
  id: 'inc-296',
  category: 'incidents',
  title: "Customers Get Order Confirmations for Orders That Were Rolled Back",
  level: 'EXPERT',
  tags: ["myproject","email","reliability","outbox"],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: "2026-11-18 12:00:00 INFO  [order-api] Email sent order=SO-9001 to customer", relevant: true, why: "Email went first." },
      { text: "2026-11-18 12:00:01 ERROR [order-api] Commit failed ORA-02091 transaction rolled back", relevant: true, why: "The order was not saved." },
      { text: "2026-11-18 12:00:01 INFO  [order-api] Response 500 to client", relevant: false },
      { text: "2026-11-18 12:30:00 WARN  [support] Customer has confirmation but no order", relevant: true, why: "Support calls." },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why did the customer get a confirmation?",
        options: [
          "The email was sent before the transaction committed, then the commit failed",
          "Email duplicated",
          "Support sent it",
          "The order exists",
        ],
        answer: 0,
        explain: "Side effect before commit.",
      },
      {
        type: 'single',
        prompt: "Which pattern fixes it?",
        options: [
          "Write an outbox row in the same transaction, and send email from the outbox after commit",
          "Send email first",
          "Send email in the transaction",
          "Skip emails",
        ],
        answer: 0,
        explain: "The outbox commits with the order.",
      },
      {
        type: 'multi',
        prompt: "What does the outbox give you?",
        options: [
          "Emails only for committed orders",
          "Retries without losing messages",
          "A record of what was sent",
          "Exactly once delivery always",
        ],
        answer: [0,1,2],
        explain: "At least once, so the sender should avoid duplicates.",
      },
      {
        type: 'single',
        prompt: "Why might a customer still get two emails?",
        options: [
          "The sender may crash after sending but before marking the row sent",
          "Outbox duplicates",
          "SMTP repeats",
          "Never",
        ],
        answer: 0,
        explain: "Accept or guard with a sent flag and idempotent keys.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Tell affected customers",
          "Add the outbox table",
          "Move email to the outbox sender",
          "Test commit failures",
          "Watch outbox age",
        ],
        explain: "Tell, build, move, test, watch.",
      },
    ],
  },
  description: `
## Symptoms
- Some customers have confirmations for orders that do not exist.

## Change / Context
- The API sends the confirmation email, then commits the order.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 12:00:00 INFO  [order-api] Email sent order=SO-9001 to customer
2026-11-18 12:00:01 ERROR [order-api] Commit failed ORA-02091 transaction rolled back
2026-11-18 12:30:00 WARN  [support] Customer has confirmation but no order
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
    "Never send side effects before commit.",
    "Use an outbox in the same transaction.",
    "Send after commit.",
    "Outbox gives at least once.",
    "Guard against duplicates.",
    "Watch outbox age.",
  ],
  solution: `
**Diagnosis.** The email went before the commit, which then failed.

**Immediate mitigation.**
- Tell affected customers.

**Root cause.** Side effect sent inside the unit of work before commit.

**Permanent fix.**
- Transactional outbox.

**Prevention.** Commit failure tests and outbox monitoring.
`,
  followUps: [
    { q: "What is ORA-02091?", a: "The transaction was rolled back, often due to a deferred constraint." },
    { q: "Can the outbox be a queue?", a: "A queue in the same transaction works too, with XA or the outbox table." },
    { q: "How often does the sender run?", a: "Every few seconds or on a trigger." },
    { q: "How do you watch it?", a: "Alert when the oldest unsent row is old." },
  ],
}

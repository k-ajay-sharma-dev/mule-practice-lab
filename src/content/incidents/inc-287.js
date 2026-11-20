export default {
  id: 'inc-287',
  category: 'incidents',
  title: "The Reject Report Email Bounces Because the Attachment Is Too Big",
  level: 'BEGINNER',
  tags: ["myproject","email","attachments","size"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-18 05:00:00 INFO  [reject-report] Rejected rows=410000", relevant: true, why: "A very bad day for data." },
      { text: "2026-11-18 05:00:01 INFO  [reject-report] Attachment rejects_20261118.csv sizeBytes=38000000", relevant: true, why: "A 38 MB attachment." },
      { text: "2026-11-18 05:00:02 ERROR [reject-report] 552 5.3.4 Message size exceeds fixed maximum message size", relevant: true, why: "The relay refuses it." },
      { text: "2026-11-18 05:00:03 INFO  [reject-report] No fallback", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why did it bounce?",
        options: [
          "The message is larger than the relay allows",
          "The data team address was removed from the relay",
          "The relay needs STARTTLS and the job sends plain text",
          "The CSV has a bad character that the relay refuses",
        ],
        answer: 0,
        explain: "552 means too large.",
      },
      {
        type: 'single',
        prompt: "What is a better design?",
        options: [
          "Store the report and email a summary with a secure link",
          "Zip the CSV and attach it, hoping it fits under the limit",
          "Split the CSV across 40 emails of about 1 MB each",
          "Drop the attachment on days with over 100,000 rejects",
        ],
        answer: 0,
        explain: "Emails carry summaries, storage carries files.",
      },
      {
        type: 'multi',
        prompt: "What should the summary include?",
        options: [
          "Counts by reason",
          "The job ID and date",
          "Where to find the full report",
          "Every rejected row",
        ],
        answer: [0,1,2],
        explain: "Short and actionable.",
      },
      {
        type: 'single',
        prompt: "Why was 410,000 rejects itself a warning sign?",
        options: [
          "It points to a systemic problem, not a few bad rows",
          "It is more rows than one CSV file can hold",
          "It means the reject job counted each row twice",
          "It shows the relay size limit was set too low",
        ],
        answer: 0,
        explain: "Alert on reject rate too.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Investigate the 410,000 rejects",
          "Store the report",
          "Email a summary with a link",
          "Add a reject rate alert",
          "Change the report design",
        ],
        explain: "Root issue first, then deliver, then improve.",
      },
    ],
  },
  description: `
## Symptoms
- The data team did not get the reject report.

## Change / Context
- The job emails rejects as a CSV attachment.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 05:00:00 INFO  [reject-report] Rejected rows=410000
2026-11-18 05:00:01 INFO  [reject-report] Attachment rejects_20261118.csv sizeBytes=38000000
2026-11-18 05:00:02 ERROR [reject-report] 552 5.3.4 Message size exceeds fixed maximum message size
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
    "Relays limit message size.",
    "Email summaries, store files.",
    "Use secure links.",
    "Alert on reject rates.",
    "Investigate spikes.",
    "Plan for big days.",
  ],
  solution: `
**Diagnosis.** The 38 MB attachment exceeds the relay size limit.

**Immediate mitigation.**
- Store the file and email a link.

**Root cause.** Design assumed small reports.

**Permanent fix.**
- Summary email with a link.

**Prevention.** Reject rate alerts.
`,
  followUps: [
    { q: "Is zipping enough?", a: "Sometimes, but limits still apply." },
    { q: "Who can open the link?", a: "Only people with access to the storage." },
    { q: "What size limits are common?", a: "They vary by relay. Ask the mail team." },
    { q: "Should emails contain data rows?", a: "Avoid it, especially personal data." },
  ],
}

export default {
  id: 'inc-290',
  category: 'incidents',
  title: "A Failure Alert Email Contains Customer Addresses",
  level: 'INTERMEDIATE',
  tags: ["myproject","email","security","personal-data"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 11:00:00 INFO  [order-alert] Sending alert body=#[payload]", relevant: true, why: "The alert includes the whole payload." },
      { text: "2026-11-18 11:00:00 INFO  [order-alert] Recipients=integration-alerts@marrow.example.com (64 members)", relevant: true, why: "A large list receives it." },
      { text: "2026-11-18 11:30:00 WARN  [privacy] Personal data found in alert emails", relevant: true, why: "Privacy flagged it." },
      { text: "2026-11-18 11:31:00 INFO  [order-alert] Alerts sent today=212", relevant: true, why: "Many emails already went out." },
      { text: "2026-11-18 23:59:00 INFO  [order-alert] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "What is wrong?",
        options: [
          "Alerts carry the full order payload to a 64 member list",
          "The alert goes to the wrong distribution list by mistake",
          "Too many alerts were sent, so privacy reviewed them",
          "The mail relay sent the alerts in plain text without TLS",
        ],
        answer: 0,
        explain: "Payloads do not belong in alerts.",
      },
      {
        type: 'single',
        prompt: "What should an alert include?",
        options: [
          "The error, order ID, time and a link to the log or record",
          "The full payload so support can see the whole order",
          "The customer address so support can contact them",
          "The order ID only, with no error text or link",
        ],
        answer: 0,
        explain: "Enough to act, no personal data.",
      },
      {
        type: 'multi',
        prompt: "What else should happen?",
        options: [
          "Report the exposure to the privacy team",
          "Reduce the alert list to people who act",
          "Review other alerts for payloads",
          "Keep the template and mark the emails confidential",
        ],
        answer: [0,1,2],
        explain: "Contain and review.",
      },
      {
        type: 'single',
        prompt: "Where can support see the details?",
        options: [
          "In secured logs or the system of record, behind access control",
          "In the alert email, as long as it is marked confidential",
          "On a shared team drive that the whole alert list can open",
          "In a nightly export of payloads sent to the support team",
        ],
        answer: 0,
        explain: "Keep data where access is controlled.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Change the alert template",
          "Inform the privacy team",
          "Trim the recipient list",
          "Review other templates",
          "Add a test that alerts contain no payload",
        ],
        explain: "Stop, report, reduce, review, test.",
      },
    ],
  },
  description: `
## Symptoms
- Privacy found customer addresses in alert emails.

## Change / Context
- The alert template inserts the whole payload.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 11:00:00 INFO  [order-alert] Sending alert body=#[payload]
2026-11-18 11:00:00 INFO  [order-alert] Recipients=integration-alerts@marrow.example.com (64 members)
2026-11-18 11:30:00 WARN  [privacy] Personal data found in alert emails
2026-11-18 11:31:00 INFO  [order-alert] Alerts sent today=212
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
    "Alerts must not contain personal data.",
    "Include IDs and links instead.",
    "Keep lists small.",
    "Report exposures.",
    "Review all templates.",
    "Test templates.",
  ],
  solution: `
**Diagnosis.** The template sends the payload, which holds personal data, to a large list.

**Immediate mitigation.**
- Fix the template and report.

**Root cause.** Template used the payload for convenience.

**Permanent fix.**
- IDs and links only.

**Prevention.** Template tests and reviews.
`,
  followUps: [
    { q: "Is internal email safe?", a: "It is still copied, forwarded and stored widely." },
    { q: "What counts as personal data?", a: "Names, addresses, phone numbers, emails and similar." },
    { q: "Who owns the list?", a: "The support lead." },
    { q: "What about logs?", a: "The same rule: no payloads with personal data." },
  ],
}

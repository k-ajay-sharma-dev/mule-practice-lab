export default {
  id: 'inc-286',
  category: 'incidents',
  title: "Job Report Emails Stop After the Mail Server Requires TLS",
  level: 'BEGINNER',
  tags: ["myproject","email","smtp","tls"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-18 06:00:00 ERROR [job-report] SMTP send failed: 530 5.7.0 Must issue a STARTTLS command first", relevant: true, why: "The server now requires TLS." },
      { text: "2026-11-18 06:00:00 INFO  [job-report] smtp config port=25 starttls=false", relevant: true, why: "The app uses plain SMTP." },
      { text: "2026-11-17 20:00:00 INFO  [mail-team] Relay now requires STARTTLS on port 587", relevant: true, why: "A notice was sent." },
      { text: "2026-11-18 06:00:00 INFO  [job-report] Report not sent, job status COMPLETED", relevant: true, why: "The job itself worked." },
      { text: "2026-11-18 23:59:00 INFO  [job-report] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why did sending fail?",
        options: [
          "The relay requires STARTTLS and the app sends without it",
          "The recipients are wrong",
          "The report is too big",
          "The job failed",
        ],
        answer: 0,
        explain: "530 Must issue STARTTLS.",
      },
      {
        type: 'single',
        prompt: "What is the fix?",
        options: [
          "Use port 587 with STARTTLS, and the app trusts the server certificate",
          "Use port 25 with no TLS",
          "Stop sending reports",
          "Send from a laptop",
        ],
        answer: 0,
        explain: "Match the relay rules.",
      },
      {
        type: 'multi',
        prompt: "What should email failures not do?",
        options: [
          "Fail the business job that already succeeded",
          "Hide the failure from logs",
          "Lose the report forever",
          "Be logged with the recipient list in full",
        ],
        answer: [0,1,2],
        explain: "Emails are side effects. Log and retry them.",
      },
      {
        type: 'single',
        prompt: "How should report emails be sent?",
        options: [
          "Asynchronously after the job, with their own retry",
          "Inside the main transaction",
          "Before the job starts",
          "Never",
        ],
        answer: 0,
        explain: "Separate the side effect.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Update SMTP settings to 587 and STARTTLS",
          "Resend today’s report",
          "Confirm receipt",
          "Add a retry for emails",
          "Subscribe the team to mail notices",
        ],
        explain: "Fix, resend, confirm, harden, listen.",
      },
    ],
  },
  description: `
## Symptoms
- Nobody received this morning’s job report.

## Change / Context
- The mail team changed relay rules last night.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 06:00:00 ERROR [job-report] SMTP send failed: 530 5.7.0 Must issue a STARTTLS command first
2026-11-18 06:00:00 INFO  [job-report] smtp config port=25 starttls=false
2026-11-17 20:00:00 INFO  [mail-team] Relay now requires STARTTLS on port 587
2026-11-18 06:00:00 INFO  [job-report] Report not sent, job status COMPLETED
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
    "Relays may require STARTTLS.",
    "Port 587 is for submission.",
    "Email is a side effect of a job.",
    "Send it async with retry.",
    "Do not fail the job for an email.",
    "Watch platform notices.",
  ],
  solution: `
**Diagnosis.** The relay now needs STARTTLS. The app sends plain SMTP on port 25.

**Immediate mitigation.**
- Change settings and resend.

**Root cause.** Config did not follow the relay change.

**Permanent fix.**
- Port 587 with STARTTLS.

**Prevention.** Async email with retry and alerts.
`,
  followUps: [
    { q: "What is STARTTLS?", a: "A command that upgrades a plain connection to TLS." },
    { q: "Port 465?", a: "Implicit TLS from the start. 587 uses STARTTLS." },
    { q: "Who owns the relay?", a: "The mail team. Agree rules with them." },
    { q: "Where are SMTP credentials kept?", a: "In secure properties." },
  ],
}

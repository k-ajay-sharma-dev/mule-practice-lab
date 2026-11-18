export default {
  id: 'inc-336',
  category: 'incidents',
  title: "Job Report Emails Show Raw HTML Tags",
  level: 'INTERMEDIATE',
  tags: ["myproject","email","templates","html"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 06:00:00 INFO  [job-report] Email sent template=job-report", relevant: false },
      { text: "2026-11-18 06:30:00 WARN  [support] Report shows <table><tr><td> as text", relevant: true, why: "The client shows tags as text." },
      { text: "2026-11-18 06:00:00 INFO  [job-report] contentType=text/plain", relevant: true, why: "The body is sent as plain text." },
      { text: "2026-11-17 16:00:00 INFO  [deploy] Template changed to HTML table", relevant: true, why: "The template changed, the type did not." },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why do tags show?",
        options: [
          "The body is HTML but sent with content type text/plain",
          "The client is old",
          "The template is broken",
          "Email stripped styles",
        ],
        answer: 0,
        explain: "The client follows the content type.",
      },
      {
        type: 'single',
        prompt: "What is the fix?",
        options: [
          "Send with text/html and a charset, and ideally a plain text alternative",
          "Remove the table",
          "Send as an attachment",
          "Use images",
        ],
        answer: 0,
        explain: "Match type to content.",
      },
      {
        type: 'multi',
        prompt: "What else matters for HTML emails?",
        options: [
          "Escape values inserted into the HTML",
          "Keep styles inline for mail clients",
          "Test in the clients people use",
          "Load scripts",
        ],
        answer: [0,1,2],
        explain: "Mail clients are limited and values must be safe.",
      },
      {
        type: 'single',
        prompt: "Why escape values?",
        options: [
          "A value with < or & can break the layout or inject content",
          "For speed",
          "It is optional",
          "For size",
        ],
        answer: 0,
        explain: "Treat data as text.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Set text/html with charset",
          "Resend today’s report",
          "Escape inserted values",
          "Add a plain text part",
          "Test in common clients",
        ],
        explain: "Fix, resend, secure, improve, test.",
      },
    ],
  },
  description: `
## Symptoms
- The job report email shows HTML tags instead of a table.

## Change / Context
- The template was changed to an HTML table yesterday.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 06:30:00 WARN  [support] Report shows <table><tr><td> as text
2026-11-18 06:00:00 INFO  [job-report] contentType=text/plain
2026-11-17 16:00:00 INFO  [deploy] Template changed to HTML table
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
    "Content type controls rendering.",
    "Use text/html for HTML.",
    "Add a plain text alternative.",
    "Escape inserted values.",
    "Inline styles.",
    "Test in clients.",
  ],
  solution: `
**Diagnosis.** The HTML body is sent as text/plain.

**Immediate mitigation.**
- Resend with text/html.

**Root cause.** Template changed without the content type.

**Permanent fix.**
- text/html with charset and escaped values.

**Prevention.** Client tests for template changes.
`,
  followUps: [
    { q: "What is multipart/alternative?", a: "An email with plain text and HTML versions; the client picks one." },
    { q: "Why not scripts?", a: "Mail clients block them." },
    { q: "Where is content type set in Mule?", a: "On the email body in the send operation." },
    { q: "How do you escape in DataWeave?", a: "Replace special characters before building HTML." },
  ],
}

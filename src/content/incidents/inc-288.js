export default {
  id: 'inc-288',
  category: 'incidents',
  title: "An Email Failure Marks a Successful Load as Failed",
  level: 'BEGINNER',
  tags: ["myproject","email","async","error-handling"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-18 03:00:00 INFO  [stock-load] Loaded rows=260000 committed", relevant: true, why: "The load worked." },
      { text: "2026-11-18 03:00:01 ERROR [stock-load] Email send failed: connect timed out", relevant: true, why: "Only the email failed." },
      { text: "2026-11-18 03:00:01 INFO  [stock-load] Job status set to FAILED", relevant: true, why: "The job is marked failed." },
      { text: "2026-11-18 03:10:00 INFO  [restart-app] Reloading stock-load job", relevant: true, why: "The data is reloaded for no reason." },
      { text: "2026-11-18 23:59:00 INFO  [stock-load] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "What is wrong?",
        options: [
          "A mail timeout after a good load marked the job FAILED",
          "The load did not commit, so the reload repeats it",
          "The restart app reloads every job at 03:10 by schedule",
          "The load committed only part of the 260,000 rows",
        ],
        answer: 0,
        explain: "The side effect controls the outcome.",
      },
      {
        type: 'single',
        prompt: "What should change?",
        options: [
          "Set status from the load result and send email asynchronously",
          "Retry the email inside the same error handler before failing",
          "Raise the SMTP connect timeout so the send can finish",
          "Send the email before the load so a mail error fails early",
        ],
        answer: 0,
        explain: "Separate the outcome from notification.",
      },
      {
        type: 'multi',
        prompt: "How should email errors be handled?",
        options: [
          "Log them with the job ID",
          "Retry a few times",
          "Alert if all retries fail",
          "Reload the data so a new email is sent",
        ],
        answer: [0,1,2],
        explain: "Treat email as its own small job.",
      },
      {
        type: 'single',
        prompt: "Why is the reload harmful?",
        options: [
          "It wastes time and could duplicate data if not idempotent",
          "It is harmless, since a reload always gives the same result",
          "It sends a second email that confuses the stock team",
          "It locks the stock table for the rest of the morning",
        ],
        answer: 0,
        explain: "Unneeded work and risk.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Stop the reload",
          "Set the job status to COMPLETED",
          "Move email to an async step",
          "Add email retries",
          "Test with the mail server down",
        ],
        explain: "Stop, correct, fix, harden, test.",
      },
    ],
  },
  description: `
## Symptoms
- The stock load ran twice this morning during a mail outage.

## Change / Context
- The job sends a completion email in the same flow and error handler.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 03:00:00 INFO  [stock-load] Loaded rows=260000 committed
2026-11-18 03:00:01 ERROR [stock-load] Email send failed: connect timed out
2026-11-18 03:00:01 INFO  [stock-load] Job status set to FAILED
2026-11-18 03:10:00 INFO  [restart-app] Reloading stock-load job
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
    "Notifications must not decide job status.",
    "Send async.",
    "Retry emails separately.",
    "Log email failures with the job ID.",
    "Avoid needless reloads.",
    "Test with the relay down.",
  ],
  solution: `
**Diagnosis.** The email step failed and the shared error handler marked the job failed.

**Immediate mitigation.**
- Stop the reload and correct the status.

**Root cause.** Email inside the main flow error path.

**Permanent fix.**
- Async email with its own handler.

**Prevention.** Tests with the relay down.
`,
  followUps: [
    { q: "How do you send async in Mule?", a: "An async scope, a VM queue or a separate flow." },
    { q: "Which is most reliable?", a: "A persistent queue survives restarts." },
    { q: "Should the job log email status?", a: "Yes, as a separate field." },
    { q: "What about the restart app?", a: "It should only replay real failures." },
  ],
}

export default {
  id: 'inc-304',
  category: 'incidents',
  title: "The Job Log Shows Success for a Batch With 3,000 Failed Records",
  level: 'INTERMEDIATE',
  tags: ["myproject","batch","planning-platform","on-complete","job-log"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 04:00:00 INFO  [sales-batch] On Complete total=60000 successful=57000 failed=3000", relevant: true, why: "Many failures." },
      { text: "2026-11-18 04:00:00 INFO  [sales-batch] Update job_log status=COMPLETED", relevant: true, why: "The status ignores failures." },
      { text: "2026-11-18 04:00:01 INFO  [sales-batch] Upload sales file to planning platform", relevant: true, why: "Partial data was sent." },
      { text: "2026-11-18 08:00:00 WARN  [planners] Sales for 40 stores look low", relevant: true, why: "The business sees low numbers." },
      { text: "2026-11-18 23:59:00 INFO  [sales-batch] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "What is wrong?",
        options: [
          "On Complete marks COMPLETED without checking failed records, and partial data is sent",
          "The batch failed",
          "Upload failed",
          "Planners are wrong",
        ],
        answer: 0,
        explain: "Status must reflect counts.",
      },
      {
        type: 'single',
        prompt: "What should On Complete do?",
        options: [
          "Set COMPLETED, PARTIAL or FAILED from the counts and a threshold",
          "Always COMPLETED",
          "Nothing",
          "Delete the log",
        ],
        answer: 0,
        explain: "Truthful status.",
      },
      {
        type: 'multi',
        prompt: "What else should happen on PARTIAL?",
        options: [
          "Hold the upload or send with a flag, as agreed",
          "Alert support",
          "Report failures by reason",
          "Send silently",
        ],
        answer: [0,1,2],
        explain: "Agree behaviour with the business.",
      },
      {
        type: 'single',
        prompt: "Where are the counts?",
        options: [
          "In the batch job result payload in On Complete",
          "In the logs only",
          "In the scheduler",
          "Nowhere",
        ],
        answer: 0,
        explain: "Use them.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Tell planners the data is partial",
          "Fix the failed records",
          "Resend complete sales",
          "Change On Complete status logic",
          "Agree a threshold",
        ],
        explain: "Tell, fix, resend, change, agree.",
      },
    ],
  },
  description: `
## Symptoms
- Planners see low sales for 40 stores.

## Change / Context
- The batch sends sales to the planning platform after On Complete.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 04:00:00 INFO  [sales-batch] On Complete total=60000 successful=57000 failed=3000
2026-11-18 04:00:00 INFO  [sales-batch] Update job_log status=COMPLETED
2026-11-18 04:00:01 INFO  [sales-batch] Upload sales file to planning platform
2026-11-18 08:00:00 WARN  [planners] Sales for 40 stores look low
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
    "On Complete has the counts.",
    "Status must reflect failures.",
    "Use PARTIAL with a threshold.",
    "Decide whether to send partial data.",
    "Alert on PARTIAL.",
    "Report failures by reason.",
  ],
  solution: `
**Diagnosis.** 3,000 failed records were ignored and partial sales were sent.

**Immediate mitigation.**
- Tell planners and resend.

**Root cause.** Status logic ignores failed counts.

**Permanent fix.**
- Status from counts and threshold.

**Prevention.** Agreed partial data rules.
`,
  followUps: [
    { q: "What threshold?", a: "Agree with the business, for example zero for finance data." },
    { q: "Should failed rows block sending?", a: "Depends on the data. Agree it." },
    { q: "Where do you store failure reasons?", a: "In a reject table." },
    { q: "How do planners know data is partial?", a: "A flag in the control file or a message." },
  ],
}

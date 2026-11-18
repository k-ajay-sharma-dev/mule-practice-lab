export default {
  id: 'inc-293',
  category: 'incidents',
  title: "The Daily Integration Report Says All Jobs Succeeded During an Outage",
  level: 'ADVANCED',
  tags: ["myproject","email","planning-platform","job-log","reports"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 07:00:00 INFO  [daily-report] Query jobs where status=FAILED today count=0", relevant: true, why: "No failed rows." },
      { text: "2026-11-18 07:00:00 INFO  [daily-report] Email sent subject=\"All integrations OK\"", relevant: true, why: "The report says OK." },
      { text: "2026-11-18 02:00:00 ERROR [plan-in] Database unavailable, job row not written", relevant: true, why: "Jobs that never started left no rows." },
      { text: "2026-11-18 07:30:00 WARN  [stores] No new plans today", relevant: true, why: "Stores see the problem." },
      { text: "2026-11-18 23:59:00 INFO  [daily-report] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why did the report say OK?",
        options: [
          "It only counts failed rows, and jobs that could not start wrote no rows",
          "The report is cached",
          "Email changed it",
          "Jobs succeeded",
        ],
        answer: 0,
        explain: "Missing data is not success.",
      },
      {
        type: 'single',
        prompt: "What should the report check?",
        options: [
          "Expected jobs against jobs that completed, so missing runs show",
          "Only failures",
          "Only email count",
          "Nothing",
        ],
        answer: 0,
        explain: "Compare against a schedule.",
      },
      {
        type: 'multi',
        prompt: "What else improves it?",
        options: [
          "A heartbeat row at the start of each run",
          "An alert when an expected job has no row by a time",
          "Counts per job compared with yesterday",
          "A green subject line always",
        ],
        answer: [0,1,2],
        explain: "Detect absence.",
      },
      {
        type: 'single',
        prompt: "What is the lesson?",
        options: [
          "Absence of errors is not proof of success",
          "Emails are unreliable",
          "Databases fail",
          "Reports are useless",
        ],
        answer: 0,
        explain: "Check for presence of success.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Tell stores and rerun plans",
          "Fix the report query",
          "Add expected job schedule",
          "Add heartbeat rows",
          "Add missing job alerts",
        ],
        explain: "Recover, fix, expect, beat, alert.",
      },
    ],
  },
  description: `
## Symptoms
- The morning report said all integrations were fine, but stores have no plans.

## Change / Context
- The report reads the job log table and emails a summary.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 07:00:00 INFO  [daily-report] Query jobs where status=FAILED today count=0
2026-11-18 07:00:00 INFO  [daily-report] Email sent subject="All integrations OK"
2026-11-18 02:00:00 ERROR [plan-in] Database unavailable, job row not written
2026-11-18 07:30:00 WARN  [stores] No new plans today
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
    "Absence of failures is not success.",
    "Compare expected with actual.",
    "Write heartbeat rows.",
    "Alert on missing runs.",
    "Compare counts with history.",
    "Report honestly.",
  ],
  solution: `
**Diagnosis.** Jobs that never started wrote no rows, so the report saw zero failures.

**Immediate mitigation.**
- Rerun and tell stores.

**Root cause.** Report counts only failures.

**Permanent fix.**
- Expected against actual.

**Prevention.** Heartbeats and missing run alerts.
`,
  followUps: [
    { q: "Where is the schedule kept?", a: "In a table of expected jobs and times." },
    { q: "What if the report itself fails?", a: "Alert when no report is sent." },
    { q: "Should the subject say OK?", a: "Only when every expected job completed." },
    { q: "Who reads it?", a: "Support and data owners." },
  ],
}

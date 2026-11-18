export default {
  id: 'inc-298',
  category: 'incidents',
  title: "A Batch Job Stops After the First Bad Record",
  level: 'BEGINNER',
  tags: ["myproject","batch","max-failed-records","on-complete"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-18 02:00:00 INFO  [cust-sync] Batch job started records=50000", relevant: false },
      { text: "2026-11-18 02:00:04 ERROR [cust-sync] Record 212 failed: email missing", relevant: true, why: "One record fails." },
      { text: "2026-11-18 02:00:04 INFO  [cust-sync] maxFailedRecords=0, stopping job", relevant: true, why: "The default stops the job on the first failure." },
      { text: "2026-11-18 02:00:05 INFO  [cust-sync] On Complete loaded=211 failed=1 total=50000", relevant: true, why: "Most records never ran." },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why did the job stop?",
        options: [
          "maxFailedRecords is 0, so one failure stops the whole job",
          "The database is down",
          "The file is short",
          "Memory",
        ],
        answer: 0,
        explain: "The default allows no failed records.",
      },
      {
        type: 'single',
        prompt: "What setting lets the job continue?",
        options: [
          "Set maxFailedRecords to a limit or to -1 for no limit",
          "Add more workers",
          "Set block size to 1",
          "Remove On Complete",
        ],
        answer: 0,
        explain: "-1 means keep going regardless.",
      },
      {
        type: 'multi',
        prompt: "What should go with that change?",
        options: [
          "A step that collects failed records",
          "An On Complete summary with failed counts",
          "An alert when failures pass a threshold",
          "Hiding failures",
        ],
        answer: [0,1,2],
        explain: "Continue, but stay aware.",
      },
      {
        type: 'single',
        prompt: "How does a step act only on failed records?",
        options: [
          "acceptPolicy ONLY_FAILURES",
          "acceptExpression true",
          "A choice router",
          "A second job",
        ],
        answer: 0,
        explain: "Accept policies filter records per step.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Fix the failing record",
          "Set a failure limit",
          "Add a failures step",
          "Rerun the job",
          "Alert on failure rate",
        ],
        explain: "Fix, configure, collect, rerun, watch.",
      },
    ],
  },
  description: `
## Symptoms
- Only 211 of 50,000 customers synced last night.

## Change / Context
- The batch job uses default settings.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 02:00:04 ERROR [cust-sync] Record 212 failed: email missing
2026-11-18 02:00:04 INFO  [cust-sync] maxFailedRecords=0, stopping job
2026-11-18 02:00:05 INFO  [cust-sync] On Complete loaded=211 failed=1 total=50000
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
    "maxFailedRecords defaults to 0.",
    "Set a limit or -1.",
    "Collect failures with ONLY_FAILURES.",
    "Summarise in On Complete.",
    "Alert on failure rate.",
    "Fix bad data at source.",
  ],
  solution: `
**Diagnosis.** With maxFailedRecords at 0, the first bad record stopped the job.

**Immediate mitigation.**
- Rerun with a failure limit.

**Root cause.** Default setting not reviewed.

**Permanent fix.**
- Failure limit, failures step and summary.

**Prevention.** Failure rate alerts.
`,
  followUps: [
    { q: "What does -1 mean?", a: "No limit on failed records." },
    { q: "What is in the On Complete payload?", a: "A batch job result with counts such as total, successful and failed records." },
    { q: "Can you stop at 5 percent?", a: "Set a number based on expected volume, or check rates in a step." },
    { q: "Where do failures go?", a: "To a reject table or file with reasons." },
  ],
}

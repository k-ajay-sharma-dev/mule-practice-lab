export default {
  id: 'inc-270',
  category: 'incidents',
  title: "Loading Forecasts With MERGE Fails on Duplicate Keys in the Source File",
  level: 'ADVANCED',
  tags: ["myproject","sql-server","planning-platform","plans","merge"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 05:00:00 INFO  [fcst-in] Read forecast file rows=900000", relevant: true, why: "A forecast file from the planning platform." },
      { text: "2026-11-18 05:02:00 ERROR [fcst-in] The MERGE statement attempted to UPDATE or DELETE the same row more than once", relevant: true, why: "MERGE meets duplicates." },
      { text: "2026-11-18 05:02:00 INFO  [fcst-in] Duplicate keys in source store+item+week count=14", relevant: true, why: "The file has repeats." },
      { text: "2026-11-18 05:02:00 INFO  [fcst-in] Whole batch rolled back", relevant: true, why: "Nothing loaded." },
      { text: "2026-11-18 23:59:00 INFO  [fcst-in] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does MERGE fail?",
        options: [
          "The source has duplicate keys, so MERGE would update one target row twice",
          "The target is locked",
          "The server is slow",
          "The file is late",
        ],
        answer: 0,
        explain: "MERGE requires one source row per target row.",
      },
      {
        type: 'single',
        prompt: "What should the load do?",
        options: [
          "Remove duplicates in staging by a rule, report them, then MERGE",
          "Skip MERGE",
          "Load the first row randomly",
          "Stop forever",
        ],
        answer: 0,
        explain: "Clean in staging with a clear rule.",
      },
      {
        type: 'multi',
        prompt: "What rule could pick one row?",
        options: [
          "The latest version in the file",
          "The row with the highest sequence",
          "Reject all duplicates and report them",
          "Pick at random",
        ],
        answer: [0,1,2],
        explain: "Agree the rule with the planning team.",
      },
      {
        type: 'single',
        prompt: "Who should hear about the duplicates?",
        options: [
          "The planning platform team, with keys and counts",
          "Nobody",
          "Only the DBA",
          "Customers",
        ],
        answer: 0,
        explain: "They fix the source.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Load into staging",
          "Remove duplicates by the agreed rule",
          "Run the MERGE",
          "Report duplicates",
          "Add a duplicate check",
        ],
        explain: "Stage, clean, load, report, guard.",
      },
    ],
  },
  description: `
## Symptoms
- Forecasts did not load today.

## Change / Context
- The flow loads forecasts with MERGE on store, item and week.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 05:00:00 INFO  [fcst-in] Read forecast file rows=900000
2026-11-18 05:02:00 ERROR [fcst-in] The MERGE statement attempted to UPDATE or DELETE the same row more than once
2026-11-18 05:02:00 INFO  [fcst-in] Duplicate keys in source store+item+week count=14
2026-11-18 05:02:00 INFO  [fcst-in] Whole batch rolled back
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
    "MERGE needs unique source keys.",
    "Clean in staging.",
    "Agree a duplicate rule.",
    "Report duplicates.",
    "Keep loads all or nothing.",
    "Check for duplicates first.",
  ],
  solution: `
**Diagnosis.** The forecast file has 14 duplicate keys, so MERGE fails and the batch rolls back.

**Immediate mitigation.**
- Remove duplicates in staging and reload.

**Root cause.** No duplicate handling before MERGE.

**Permanent fix.**
- Deduplicate by rule in staging.

**Prevention.** Duplicate check and report.
`,
  followUps: [
    { q: "How do you find duplicates?", a: "GROUP BY the key HAVING COUNT(*) > 1." },
    { q: "Why stage first?", a: "You can clean and check before touching live data." },
    { q: "Is MERGE always best?", a: "It is common, but an update then insert also works." },
    { q: "What about very large MERGE?", a: "Load in blocks to limit locks and log growth." },
  ],
}

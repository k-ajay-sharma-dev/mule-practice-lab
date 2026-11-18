export default {
  id: 'inc-285',
  category: 'incidents',
  title: "The Staging MERGE Goes From Two Minutes to Two Hours Overnight",
  level: 'EXPERT',
  tags: ["myproject","oracle","performance","statistics"],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: "2026-11-18 03:00:00 INFO  [stage-merge] MERGE INTO item USING item_stage rows=60000 durationMs=7200000", relevant: true, why: "Very slow tonight." },
      { text: "2026-11-17 03:00:00 INFO  [stage-merge] MERGE rows=60000 durationMs=120000", relevant: true, why: "Normal last night." },
      { text: "2026-11-18 02:55:00 INFO  [stage-load] TRUNCATE item_stage then INSERT 60000 rows", relevant: true, why: "Staging is reloaded each night." },
      { text: "2026-11-18 03:00:00 INFO  [dba] item_stage statistics show 0 rows, last gathered after truncate", relevant: true, why: "Statistics say the table is empty." },
      { text: "2026-11-18 23:59:00 INFO  [stage-merge] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why is the MERGE slow?",
        options: [
          "Statistics say staging is empty, so the optimiser picks a poor plan",
          "The data doubled",
          "The network",
          "Locks",
        ],
        answer: 0,
        explain: "The optimiser trusts statistics.",
      },
      {
        type: 'single',
        prompt: "What can fix it?",
        options: [
          "Gather statistics after loading staging, or lock representative statistics",
          "Restart Oracle",
          "Remove the index",
          "Use smaller batches",
        ],
        answer: 0,
        explain: "Good statistics, good plans.",
      },
      {
        type: 'multi',
        prompt: "What else can help?",
        options: [
          "Dynamic sampling for staging tables",
          "A plan baseline for the MERGE",
          "Watching duration per run",
          "Truncating the target",
        ],
        answer: [0,1,2],
        explain: "Keep plans stable.",
      },
      {
        type: 'single',
        prompt: "Why did it start tonight?",
        options: [
          "An automatic stats job ran while staging was empty",
          "Data changed",
          "A deploy",
          "Luck",
        ],
        answer: 0,
        explain: "Timing of stats gathering matters.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Gather stats on staging",
          "Rerun the MERGE",
          "Agree a stats approach with the DBA",
          "Alert on duration",
          "Document the staging pattern",
        ],
        explain: "Fix, recover, agree, watch, document.",
      },
    ],
  },
  description: `
## Symptoms
- The item load finished two hours late.

## Change / Context
- Staging is truncated and reloaded each night.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 03:00:00 INFO  [stage-merge] MERGE INTO item USING item_stage rows=60000 durationMs=7200000
2026-11-17 03:00:00 INFO  [stage-merge] MERGE rows=60000 durationMs=120000
2026-11-18 02:55:00 INFO  [stage-load] TRUNCATE item_stage then INSERT 60000 rows
2026-11-18 03:00:00 INFO  [dba] item_stage statistics show 0 rows, last gathered after truncate
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
    "The optimiser relies on statistics.",
    "Empty table stats cause bad plans.",
    "Gather stats after loading.",
    "Or lock representative stats.",
    "Watch duration trends.",
    "Agree with the DBA.",
  ],
  solution: `
**Diagnosis.** Statistics were gathered while staging was empty, so the MERGE plan is poor.

**Immediate mitigation.**
- Gather stats and rerun.

**Root cause.** Stats timing on a truncate and load table.

**Permanent fix.**
- Gather or lock stats as agreed.

**Prevention.** Duration alerts.
`,
  followUps: [
    { q: "Can Mule gather stats?", a: "It can call DBMS_STATS through a procedure if allowed." },
    { q: "What is a plan baseline?", a: "A stored plan Oracle prefers." },
    { q: "Why truncate staging?", a: "To start clean each run." },
    { q: "Who owns stats?", a: "The DBA, with the integration team." },
  ],
}

export default {
  id: 'inc-285',
  category: 'incidents',
  title: "The Staging MERGE Goes From Two Minutes to Two Hours Overnight",
  level: 'EXPERT',
  tags: ["myproject","oracle","performance","statistics"],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: "2026-11-17 03:02:00 INFO  [stage-merge] MERGE rows=60000 durationMs=120000", relevant: true, why: "Normal last night." },
      { text: "2026-11-18 02:55:00 INFO  [stage-load] TRUNCATE item_stage", relevant: true, why: "Staging is emptied each night." },
      { text: "2026-11-18 02:56:00 INFO  [dba] Nightly stats job gathered item_stage num_rows=0", relevant: true, why: "Statistics were gathered while the table was empty." },
      { text: "2026-11-18 02:58:00 INFO  [stage-load] INSERT item_stage rows=60000", relevant: true, why: "Staging is refilled after the stats ran." },
      { text: "2026-11-18 05:00:00 INFO  [stage-merge] MERGE INTO item USING item_stage rows=60000 durationMs=7200000", relevant: true, why: "Very slow tonight." },
      { text: "2026-11-18 23:59:00 INFO  [stage-merge] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why is the MERGE slow?",
        options: [
          "Statistics say staging is empty, so the optimiser picks a poor plan",
          "Twice as many rows arrived in staging as last night",
          "Another session held row locks on item for two hours",
          "The network between Mule and Oracle slowed down tonight",
        ],
        answer: 0,
        explain: "The optimiser trusts statistics.",
      },
      {
        type: 'single',
        prompt: "What can fix it?",
        options: [
          "Gather stats after the staging load, or lock representative stats",
          "Restart the Oracle instance to clear the cached plans",
          "Drop the item index so the MERGE always does a full scan",
          "Split the MERGE into 60 batches of 1,000 rows from Mule",
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
          "Rebuilding the item indexes before each MERGE",
        ],
        answer: [0,1,2],
        explain: "Keep plans stable.",
      },
      {
        type: 'single',
        prompt: "Why did it start tonight?",
        options: [
          "The moved stats job now runs while staging is empty",
          "The staging data changed shape tonight",
          "A code deploy changed the MERGE statement",
          "The item table grew past an index size limit",
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
- The item load finished at 05:00 instead of about 03:02.

## Change / Context
- Staging is truncated and reloaded each night. The MERGE starts at 03:00.
- Yesterday the DBA team moved the nightly schema statistics job to start at 02:50.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-17 03:02:00 INFO  [stage-merge] MERGE rows=60000 durationMs=120000
2026-11-18 02:55:00 INFO  [stage-load] TRUNCATE item_stage
2026-11-18 02:56:00 INFO  [dba] Nightly stats job gathered item_stage num_rows=0
2026-11-18 02:58:00 INFO  [stage-load] INSERT item_stage rows=60000
2026-11-18 05:00:00 INFO  [stage-merge] MERGE INTO item USING item_stage rows=60000 durationMs=7200000
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

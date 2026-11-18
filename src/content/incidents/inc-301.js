export default {
  id: 'inc-301',
  category: 'incidents',
  title: "One Bad Row Fails a Whole Aggregator Group of 500",
  level: 'INTERMEDIATE',
  tags: ["myproject","batch","fallback","reject-table","oracle"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 03:00:00 ERROR [item-batch] Bulk insert failed group=7 rows=500 ORA-01400 cannot insert NULL", relevant: true, why: "One row fails the group." },
      { text: "2026-11-18 03:00:00 INFO  [item-batch] Group marked failed, 500 records failed", relevant: true, why: "All 500 count as failed." },
      { text: "2026-11-18 03:05:00 INFO  [item-batch] On Complete failed=500", relevant: false },
      { text: "2026-11-18 07:00:00 WARN  [buyers] 500 items missing", relevant: true, why: "The business sees the gap." },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why did 500 records fail?",
        options: [
          "The bulk insert is all or nothing for the group",
          "All 500 were bad",
          "The database is down",
          "Locks",
        ],
        answer: 0,
        explain: "One NULL fails the whole statement.",
      },
      {
        type: 'single',
        prompt: "What is the standard fix?",
        options: [
          "On bulk failure, insert that group row by row and send only bad rows to a reject table",
          "Smaller groups only",
          "Ignore errors",
          "Retry the group forever",
        ],
        answer: 0,
        explain: "Fallback isolates the bad row.",
      },
      {
        type: 'multi',
        prompt: "What does the fallback need?",
        options: [
          "A try scope around the bulk insert",
          "A for each over the group on error",
          "A reject table with key and reason",
          "Deleting the group",
        ],
        answer: [0,1,2],
        explain: "Catch, iterate, record.",
      },
      {
        type: 'single',
        prompt: "Why not always insert row by row?",
        options: [
          "It is much slower for the normal case",
          "It is not allowed",
          "It uses no memory",
          "No reason",
        ],
        answer: 0,
        explain: "Bulk first, row by row only on failure.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Load the 499 good items",
          "Add the fallback",
          "Report the bad item",
          "Test with one bad row",
          "Count rejects per run",
        ],
        explain: "Recover, fix, report, test, watch.",
      },
    ],
  },
  description: `
## Symptoms
- 500 items are missing after the nightly load.

## Change / Context
- Items load through a batch aggregator with bulk insert.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 03:00:00 ERROR [item-batch] Bulk insert failed group=7 rows=500 ORA-01400 cannot insert NULL
2026-11-18 03:00:00 INFO  [item-batch] Group marked failed, 500 records failed
2026-11-18 07:00:00 WARN  [buyers] 500 items missing
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
    "Bulk inserts are all or nothing.",
    "Fall back row by row on failure.",
    "Send bad rows to a reject table.",
    "Keep bulk for speed.",
    "Test with one bad row.",
    "Count rejects.",
  ],
  solution: `
**Diagnosis.** One NULL made the bulk insert fail for all 500 rows.

**Immediate mitigation.**
- Load the good rows.

**Root cause.** No fallback.

**Permanent fix.**
- Row by row on bulk failure with rejects.

**Prevention.** Tests with bad rows.
`,
  followUps: [
    { q: "How do you know which rows failed?", a: "Each row by row insert reports its own error." },
    { q: "Should the record be marked failed in batch?", a: "Only the bad one, so counts stay true." },
    { q: "Where is the reject table?", a: "In the same schema, with job ID, key, reason and time." },
    { q: "What about duplicates on rerun?", a: "Use MERGE or check keys." },
  ],
}

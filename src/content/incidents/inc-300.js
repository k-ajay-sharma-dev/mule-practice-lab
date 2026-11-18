export default {
  id: 'inc-300',
  category: 'incidents',
  title: "The Batch Aggregator Leaves the Last Records Unsaved",
  level: 'BEGINNER',
  tags: ["myproject","batch","aggregator","bulk-insert"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-18 01:00:00 INFO  [price-batch] Records=10250 aggregator size=500", relevant: true, why: "Groups of 500." },
      { text: "2026-11-18 01:01:00 INFO  [price-batch] Bulk insert rows=500 (x20)", relevant: true, why: "20 full groups." },
      { text: "2026-11-18 01:01:00 INFO  [price-batch] On Complete total=10250 successful=10250", relevant: true, why: "Batch says all good." },
      { text: "2026-11-18 07:00:00 WARN  [recon] prices table rows=10000 expected=10250", relevant: true, why: "250 missing." },
      { text: "2026-11-18 23:59:00 INFO  [price-batch] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Where are the 250 records?",
        options: [
          "The last partial group was not written because the aggregator was misconfigured or a custom grouping skipped it",
          "They were deleted",
          "The file is short",
          "The database dropped them",
        ],
        answer: 0,
        explain: "A fixed size aggregator should flush the remainder at the end. Check the config and any custom logic.",
      },
      {
        type: 'single',
        prompt: "How do you prove it?",
        options: [
          "Compare counts per run between source, batch and table",
          "Trust On Complete",
          "Look at CPU",
          "Guess",
        ],
        answer: 0,
        explain: "Reconcile with the target.",
      },
      {
        type: 'multi',
        prompt: "What protects you?",
        options: [
          "A reconciliation check after each run",
          "Using the standard aggregator size setting",
          "A test with a record count that is not a multiple of the size",
          "Assuming batch counts are target counts",
        ],
        answer: [0,1,2],
        explain: "Successful in batch is not the same as saved.",
      },
      {
        type: 'single',
        prompt: "Why did On Complete say successful?",
        options: [
          "Records passed the steps, but the write is a separate concern",
          "Batch is wrong",
          "Database lies",
          "Timing",
        ],
        answer: 0,
        explain: "Count what reached the target.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Load the missing records",
          "Fix the aggregator config",
          "Test with 10,250 records",
          "Add a count check",
          "Alert on mismatch",
        ],
        explain: "Recover, fix, test, check, alert.",
      },
    ],
  },
  description: `
## Symptoms
- The prices table is short by 250 rows.

## Change / Context
- A custom aggregator config was added last week.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 01:00:00 INFO  [price-batch] Records=10250 aggregator size=500
2026-11-18 01:01:00 INFO  [price-batch] Bulk insert rows=500 (x20)
2026-11-18 01:01:00 INFO  [price-batch] On Complete total=10250 successful=10250
2026-11-18 07:00:00 WARN  [recon] prices table rows=10000 expected=10250
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
    "Partial groups must be written.",
    "Test with odd counts.",
    "Reconcile target counts.",
    "Batch success is not target success.",
    "Prefer standard aggregator settings.",
    "Alert on mismatch.",
  ],
  solution: `
**Diagnosis.** The remainder group was never written.

**Immediate mitigation.**
- Load the missing records.

**Root cause.** Custom aggregator setup did not flush the last group.

**Permanent fix.**
- Standard size based aggregator.

**Prevention.** Reconciliation after each run.
`,
  followUps: [
    { q: "What is streaming in the aggregator?", a: "A mode that processes all records as a stream without a fixed size." },
    { q: "Can you aggregate by time?", a: "Fixed size is common. Check the options for your version." },
    { q: "How do you count target rows?", a: "A query on the run ID column." },
    { q: "Why add a run ID?", a: "To count exactly what each run wrote." },
  ],
}

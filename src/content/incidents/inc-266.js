export default {
  id: 'inc-266',
  category: 'incidents',
  title: "Loading 2 Million Sales Rows Takes Six Hours",
  level: 'INTERMEDIATE',
  tags: ["myproject","sql-server","bulk-insert","performance"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 01:00:00 INFO  [sales-load] For each row INSERT INTO sales_stage", relevant: true, why: "One insert per row." },
      { text: "2026-11-18 07:00:00 INFO  [sales-load] Inserted rows=2000000 durationMs=21600000", relevant: true, why: "Six hours." },
      { text: "2026-11-18 01:00:00 INFO  [sales-load] Autocommit=true", relevant: true, why: "Each row is its own transaction." },
      { text: "2026-11-18 07:30:00 WARN  [planning-export] Sales stage not ready by 06:00", relevant: true, why: "Downstream waits." },
      { text: "2026-11-18 23:59:00 INFO  [sales-load] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why is the load slow?",
        options: [
          "One insert and one commit per row means two million round trips",
          "The table is too big",
          "The server is old",
          "Indexes are missing",
        ],
        answer: 0,
        explain: "Round trips dominate.",
      },
      {
        type: 'single',
        prompt: "What is the main fix?",
        options: [
          "Use bulk insert in blocks, for example in a batch aggregator",
          "More workers each doing single inserts",
          "Bigger server",
          "Fewer columns",
        ],
        answer: 0,
        explain: "Bulk statements send many rows per call.",
      },
      {
        type: 'multi',
        prompt: "What else speeds it up?",
        options: [
          "Commit per block, not per row",
          "Load a heap staging table, then index or merge",
          "Use table valued parameters or bulk copy for very large loads",
          "Add triggers",
        ],
        answer: [0,1,2],
        explain: "Fewer trips and less work per row.",
      },
      {
        type: 'single',
        prompt: "What if one row in a block fails?",
        options: [
          "Fall back to row by row for that block and send bad rows to a reject table",
          "Lose the block",
          "Stop the job",
          "Ignore",
        ],
        answer: 0,
        explain: "Keep good rows, isolate bad ones.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Change to bulk insert in blocks",
          "Test with a full day",
          "Add row by row fallback",
          "Add a reject table",
          "Track load time",
        ],
        explain: "Fix, prove, harden, watch.",
      },
    ],
  },
  description: `
## Symptoms
- The sales stage table is ready at 07:00, an hour after the cut off.

## Change / Context
- The flow inserts each row separately.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 01:00:00 INFO  [sales-load] For each row INSERT INTO sales_stage
2026-11-18 07:00:00 INFO  [sales-load] Inserted rows=2000000 durationMs=21600000
2026-11-18 01:00:00 INFO  [sales-load] Autocommit=true
2026-11-18 07:30:00 WARN  [planning-export] Sales stage not ready by 06:00
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
    "Row by row inserts are slow.",
    "Bulk insert in blocks.",
    "Commit per block.",
    "Stage then merge.",
    "Fall back row by row on failure.",
    "Track load time.",
  ],
  solution: `
**Diagnosis.** Two million single row inserts with autocommit take six hours.

**Immediate mitigation.**
- Load today with bulk insert.

**Root cause.** The design ignores bulk operations.

**Permanent fix.**
- Batch aggregator with bulk insert and fallback.

**Prevention.** Load time alerts.
`,
  followUps: [
    { q: "What block size?", a: "Often hundreds to a few thousand. Measure." },
    { q: "Why a heap stage?", a: "No index maintenance during load." },
    { q: "What is bulk copy?", a: "A fast load API in SQL Server for large data." },
    { q: "What about locks?", a: "Large blocks can escalate locks. Watch for blocking." },
  ],
}

export default {
  id: 'inc-265',
  category: 'incidents',
  title: "Nightly Stock Updates Fail With Deadlocks",
  level: 'INTERMEDIATE',
  tags: ["myproject","sql-server","deadlock","batch"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 02:10:00 ERROR [stock-upd] Transaction (Process ID 88) was deadlocked on lock resources and has been chosen as the deadlock victim. errorCode=1205", relevant: true, why: "SQL Server picked a victim." },
      { text: "2026-11-18 02:10:00 INFO  [stock-upd] Parallel workers=8, rows unsorted", relevant: true, why: "Eight workers update in random order." },
      { text: "2026-11-18 02:10:00 INFO  [stock-upd] No retry on error 1205", relevant: true, why: "The victim is not retried." },
      { text: "2026-11-18 02:15:00 WARN  [stock-upd] Failed rows=3200", relevant: true, why: "Rows were lost." },
      { text: "2026-11-18 23:59:00 INFO  [stock-upd] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why do deadlocks happen?",
        options: [
          "Eight workers update overlapping rows in different orders",
          "The server is slow",
          "The table is too big",
          "The network drops",
        ],
        answer: 0,
        explain: "Different lock orders cause cycles.",
      },
      {
        type: 'single',
        prompt: "What reduces them?",
        options: [
          "Sort rows by key so every worker locks in the same order, or partition work by key",
          "Add more workers",
          "Remove indexes",
          "Use NOLOCK",
        ],
        answer: 0,
        explain: "Same order, no cycle.",
      },
      {
        type: 'multi',
        prompt: "What else helps?",
        options: [
          "Retry the victim with a short backoff",
          "Keep transactions small",
          "Make sure updates use an index",
          "Hold transactions open longer",
        ],
        answer: [0,1,2],
        explain: "Deadlocks will still happen sometimes. Retry them.",
      },
      {
        type: 'single',
        prompt: "Which error code marks a deadlock victim?",
        options: [
          "1205",
          "18456",
          "2627",
          "547",
        ],
        answer: 0,
        explain: "1205 is the deadlock victim error.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Rerun failed rows",
          "Partition work by key",
          "Add retry on 1205",
          "Check indexes",
          "Watch deadlock counts",
        ],
        explain: "Recover, fix, harden, tune, watch.",
      },
    ],
  },
  description: `
## Symptoms
- 3,200 stock updates failed last night.

## Change / Context
- The update job uses eight parallel workers.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 02:10:00 ERROR [stock-upd] Transaction (Process ID 88) was deadlocked on lock resources and has been chosen as the deadlock victim. errorCode=1205
2026-11-18 02:10:00 INFO  [stock-upd] Parallel workers=8, rows unsorted
2026-11-18 02:10:00 INFO  [stock-upd] No retry on error 1205
2026-11-18 02:15:00 WARN  [stock-upd] Failed rows=3200
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
    "Deadlocks come from lock order cycles.",
    "Lock in a consistent order.",
    "Partition parallel work.",
    "Retry victims.",
    "Keep transactions short.",
    "Index the update keys.",
  ],
  solution: `
**Diagnosis.** Parallel workers update overlapping rows in random order and deadlock.

**Immediate mitigation.**
- Rerun the failed rows.

**Root cause.** Unordered parallel updates and no retry.

**Permanent fix.**
- Partition by key and retry on 1205.

**Prevention.** Watch deadlock counts.
`,
  followUps: [
    { q: "Is NOLOCK a fix?", a: "No. It allows dirty reads and does not help updates." },
    { q: "How do you see deadlocks?", a: "The DBA can read the deadlock graph." },
    { q: "Do batch jobs help?", a: "Yes, with a consistent order and sized blocks." },
    { q: "How many retries?", a: "A few, with backoff, then report." },
  ],
}

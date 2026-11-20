export default {
  id: 'inc-317',
  category: 'incidents',
  title: "Loading a 40 Million Row File Misses the Morning Deadline",
  level: 'ADVANCED',
  tags: ["myproject","large-files","batch","database","throughput"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 00:00:00 INFO  [hist-load] File rows=40000000", relevant: true, why: "A very large file." },
      { text: "2026-11-18 00:00:00 INFO  [hist-load] Batch blockSize=100 aggregator size=100 single insert per row", relevant: true, why: "Small groups." },
      { text: "2026-11-18 06:00:00 INFO  [hist-load] Progress rows=22000000", relevant: true, why: "Only 55 percent by 06:00." },
      { text: "2026-11-18 06:00:00 INFO  [dba] Redo log switches very high", relevant: true, why: "The database is busy with commits." },
      { text: "2026-11-18 23:59:00 INFO  [hist-load] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why is it slow?",
        options: [
          "Single row inserts in small groups mean too many commits",
          "The file has malformed rows that slow the parser",
          "Mule threads are blocked waiting for the file reader",
          "The network to the database dropped half its packets",
        ],
        answer: 0,
        explain: "Commits and trips dominate.",
      },
      {
        type: 'single',
        prompt: "What gives the biggest gain?",
        options: [
          "Larger aggregator groups with bulk insert, and fewer commits",
          "More logging so the slow rows stand out",
          "Smaller blocks of 10 so each commit finishes sooner",
          "Retries on each insert that takes over a second",
        ],
        answer: 0,
        explain: "Bulk and fewer commits.",
      },
      {
        type: 'multi',
        prompt: "What else can help?",
        options: [
          "Load into a staging table without indexes, then build indexes",
          "Use the database bulk load tool for very large files",
          "Partition by date so loads touch one partition",
          "Insert one row at a time",
        ],
        answer: [0,1,2],
        explain: "Use database strengths.",
      },
      {
        type: 'single',
        prompt: "When is Mule the wrong tool?",
        options: [
          "When a native bulk loader can read the file directly, far faster",
          "Never, since Mule batch can match any database loader",
          "Always, for any file over one million rows",
          "For small files, where the batch overhead is too high",
        ],
        answer: 0,
        explain: "Pick the right tool and orchestrate it.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Finish today’s load",
          "Raise aggregator size with bulk insert",
          "Stage without indexes",
          "Measure",
          "Consider a native loader",
        ],
        explain: "Finish, tune, stage, measure, consider.",
      },
    ],
  },
  description: `
## Symptoms
- The history load finishes at 11:00 instead of 06:00.

## Change / Context
- History grew to 40 million rows.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 00:00:00 INFO  [hist-load] File rows=40000000
2026-11-18 00:00:00 INFO  [hist-load] Batch blockSize=100 aggregator size=100 single insert per row
2026-11-18 06:00:00 INFO  [hist-load] Progress rows=22000000
2026-11-18 06:00:00 INFO  [dba] Redo log switches very high
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
    "Round trips and commits limit speed.",
    "Bulk insert in larger groups.",
    "Stage without indexes.",
    "Partition by date.",
    "Native loaders can be faster.",
    "Measure changes.",
  ],
  solution: `
**Diagnosis.** Single inserts in small groups cannot load 40 million rows in time.

**Immediate mitigation.**
- Finish the load.

**Root cause.** Design sized for smaller volumes.

**Permanent fix.**
- Bulk insert, staging, partitions.

**Prevention.** Volume tests.
`,
  followUps: [
    { q: "What is redo?", a: "Oracle log of changes, written for every commit." },
    { q: "What native tools exist?", a: "SQL*Loader or external tables for Oracle, bcp for SQL Server." },
    { q: "Can Mule orchestrate them?", a: "Yes, by placing files and calling procedures." },
    { q: "How big should groups be?", a: "Measure. Often hundreds to thousands." },
  ],
}

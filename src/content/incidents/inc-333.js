export default {
  id: 'inc-333',
  category: 'incidents',
  title: "Nightly Extracts Fail When Tempdb Runs Out of Space",
  level: 'EXPERT',
  tags: ["myproject","sql-server","tempdb","performance"],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: "2026-11-18 02:30:00 ERROR [sales-extract] Could not allocate space in database tempdb", relevant: true, why: "Tempdb is full." },
      { text: "2026-11-18 02:30:00 INFO  [sales-extract] Query uses ORDER BY on 400M rows and a hash join", relevant: true, why: "Sorts and hashes spill to tempdb." },
      { text: "2026-11-18 02:30:00 INFO  [dba] Read committed snapshot on, version store 120GB", relevant: true, why: "Row versions also use tempdb." },
      { text: "2026-11-18 02:30:00 INFO  [dba] Long open transaction from report app since 2026-11-17 18:00", relevant: true, why: "An old transaction keeps versions alive." },
      { text: "2026-11-18 02:35:00 INFO  [sales-extract] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "What fills tempdb?",
        options: [
          "Big sorts and hashes plus a version store held by a long transaction",
          "The tempdb log, because the extract runs in one transaction",
          "Nightly backups that write their temporary files into tempdb",
          "The Mule database connector caching the result set in tempdb",
        ],
        answer: 0,
        explain: "Several users share tempdb.",
      },
      {
        type: 'single',
        prompt: "What should happen first?",
        options: [
          "Find and end the long open transaction, with its owner",
          "Shrink the tempdb files while the extract is running",
          "Turn off read committed snapshot on the database",
          "Add a second tempdb data file on the same full disk",
        ],
        answer: 0,
        explain: "Free the version store. Versions stay while the old transaction is open.",
      },
      {
        type: 'multi',
        prompt: "How can the extract use less tempdb?",
        options: [
          "Drop the ORDER BY if the receiver does not need it",
          "Extract by date range in pieces",
          "Index to avoid hash joins",
          "Sort the 400M rows in Mule memory instead",
        ],
        answer: [0,1,2],
        explain: "Less work, smaller pieces. Sorting 400M rows in Mule moves the problem to the heap.",
      },
      {
        type: 'single',
        prompt: "Why does a long transaction matter?",
        options: [
          "Row versions must be kept until it ends",
          "It holds a lock on tempdb that blocks other users",
          "It is harmless while it stays idle",
          "It keeps the extract’s sort pages in memory",
        ],
        answer: 0,
        explain: "Snapshot isolation keeps versions for old transactions.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "End the long transaction",
          "Rerun the extract in date ranges",
          "Remove unneeded sorts",
          "Alert on long transactions",
          "Review tempdb sizing",
        ],
        explain: "Free, recover, reduce, watch, size.",
      },
    ],
  },
  description: `
## Symptoms
- The nightly sales extract fails with a tempdb error.

## Change / Context
- Read committed snapshot is on. A reporting app also uses the database.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 02:30:00 ERROR [sales-extract] Could not allocate space in database tempdb
2026-11-18 02:30:00 INFO  [sales-extract] Query uses ORDER BY on 400M rows and a hash join
2026-11-18 02:30:00 INFO  [dba] Read committed snapshot on, version store 120GB
2026-11-18 02:30:00 INFO  [dba] Long open transaction from report app since 2026-11-17 18:00
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
    "Tempdb is shared.",
    "Sorts and hashes spill there.",
    "Version store grows with long transactions.",
    "Extract in ranges.",
    "Remove unneeded sorts.",
    "Alert on long transactions.",
  ],
  solution: `
**Diagnosis.** Big sorts plus a version store held by a long transaction filled tempdb.

**Immediate mitigation.**
- End the transaction and rerun in ranges.

**Root cause.** Heavy extract design and an idle open transaction.

**Permanent fix.**
- Smaller ranges, fewer sorts.

**Prevention.** Long transaction alerts and tempdb sizing.
`,
  followUps: [
    { q: "What is the version store?", a: "Space in tempdb that holds old row versions for snapshot readers." },
    { q: "Can Mule cause long transactions?", a: "Yes, if a flow opens a transaction and waits on slow calls." },
    { q: "Why remove ORDER BY?", a: "Sorting 400M rows is costly, and files often do not need order." },
    { q: "Who ends the transaction?", a: "The DBA, after contacting its owner." },
  ],
}

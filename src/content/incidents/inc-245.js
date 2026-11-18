export default {
  id: 'inc-245',
  category: 'incidents',
  title: "A Plan File Fails Half Way Into the Database and the Retry Doubles the Orders",
  level: 'ADVANCED',
  tags: ["myproject","sftp","blue-yonder","plans","database"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 05:00:00 INFO  [plan-in] Read /from-planning/orders_20261118.csv rows=48000", relevant: true, why: "A large plan file." },
      { text: "2026-11-18 05:03:10 ERROR [plan-in] Insert failed at row=31002 error=ORA-01400 cannot insert NULL", relevant: true, why: "One row breaks the load." },
      { text: "2026-11-18 05:03:10 INFO  [plan-in] Rows committed=31000, file left in place for retry", relevant: true, why: "The first rows are already committed." },
      { text: "2026-11-18 05:10:00 INFO  [plan-in] Read /from-planning/orders_20261118.csv rows=48000", relevant: true, why: "The retry starts from the top." },
      { text: "2026-11-18 23:59:00 INFO  [plan-in] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why do orders double?",
        options: [
          "The retry loads the whole file again on top of the rows already committed",
          "The platform sent twice",
          "The database duplicates",
          "The poll is broken",
        ],
        answer: 0,
        explain: "31,000 rows were committed, then loaded again.",
      },
      {
        type: 'single',
        prompt: "Which design avoids this?",
        options: [
          "Load into a staging table, validate, then move to the real table in one step",
          "Commit every row",
          "Skip errors silently",
          "Retry faster",
        ],
        answer: 0,
        explain: "Staging allows all or nothing.",
      },
      {
        type: 'multi',
        prompt: "What should happen to the bad row?",
        options: [
          "Send it to a reject table with the reason",
          "Report it to the planning team",
          "Load the other rows if the business agrees",
          "Drop it silently",
        ],
        answer: [0,1,2],
        explain: "Bad rows need a home and a report.",
      },
      {
        type: 'single',
        prompt: "What key makes the load safe to repeat?",
        options: [
          "A natural key such as plan date, store and item with a MERGE",
          "A random ID",
          "The file name only",
          "No key",
        ],
        answer: 0,
        explain: "MERGE updates instead of inserting twice.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Stop the retry",
          "Remove duplicate orders",
          "Load via staging with rejects",
          "Use MERGE on the natural key",
          "Report rejects to the planning team",
        ],
        explain: "Stop, clean, fix, harden, tell.",
      },
    ],
  },
  description: `
## Symptoms
- Stores see doubled replenishment orders.

## Change / Context
- Plans come back from the planning platform over SFTP and are inserted into the store database.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 05:00:00 INFO  [plan-in] Read /from-planning/orders_20261118.csv rows=48000
2026-11-18 05:03:10 ERROR [plan-in] Insert failed at row=31002 error=ORA-01400 cannot insert NULL
2026-11-18 05:03:10 INFO  [plan-in] Rows committed=31000, file left in place for retry
2026-11-18 05:10:00 INFO  [plan-in] Read /from-planning/orders_20261118.csv rows=48000
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
    "Partial commits break retries.",
    "Load to staging first.",
    "Use MERGE on natural keys.",
    "Reject bad rows with reasons.",
    "Report rejects to the sender.",
    "Make retries safe to repeat.",
  ],
  solution: `
**Diagnosis.** The load committed 31,000 rows, failed, and the retry loaded all 48,000 again.

**Immediate mitigation.**
- Stop, remove duplicates and reload cleanly.

**Root cause.** The load is neither all or nothing nor idempotent.

**Permanent fix.**
- Staging table, rejects, then MERGE into the target.

**Prevention.** Every file load must be safe to repeat.
`,
  followUps: [
    { q: "Why not one big transaction?", a: "Large transactions hold locks and undo for a long time. Staging is cleaner." },
    { q: "Who fixes the NULL?", a: "The planning team, using the reject report." },
    { q: "What is a natural key?", a: "Business fields that identify a row, such as date, store and item." },
    { q: "How do you know what loaded?", a: "A job log row with counts per file." },
  ],
}

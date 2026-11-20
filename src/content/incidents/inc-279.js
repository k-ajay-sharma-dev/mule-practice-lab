export default {
  id: 'inc-279',
  category: 'incidents',
  title: "One Bad Row Sends a Whole Product Block to the Failure Queue",
  level: 'INTERMEDIATE',
  tags: ["myproject","oracle","batch","reject-table","planning-platform"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 03:10:00 ERROR [prod-load] Bulk insert failed block=7 rows=500 ORA-12899: value too large for column DESCRIPTION", relevant: true, why: "One value is too long." },
      { text: "2026-11-18 03:10:00 INFO  [prod-load] On error: send message to failure queue", relevant: true, why: "The whole message fails." },
      { text: "2026-11-18 03:10:00 INFO  [prod-load] Blocks 1 to 6 already committed", relevant: true, why: "Some data is already loaded." },
      { text: "2026-11-18 03:20:00 INFO  [restart-app] Republished message, same error", relevant: true, why: "The retry fails the same way." },
      { text: "2026-11-18 23:59:00 INFO  [prod-load] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does the retry fail again?",
        options: [
          "The bad row is still in the data, so block 7 fails again",
          "The failure queue redelivers a stale copy of the message",
          "Blocks 1 to 6 still hold locks from the first attempt",
          "The restart app resends before the database recovers",
        ],
        answer: 0,
        explain: "Retrying cannot fix bad data.",
      },
      {
        type: 'single',
        prompt: "What should the load do?",
        options: [
          "Retry the failed block row by row and reject the bad row",
          "Roll back blocks 1 to 6 and fail the whole message",
          "Skip block 7 and log only the block number",
          "Cut every DESCRIPTION to 10 characters first",
        ],
        answer: 0,
        explain: "Isolate the bad row.",
      },
      {
        type: 'multi',
        prompt: "What else belongs in the design?",
        options: [
          "Validate lengths before insert",
          "A job log with loaded and rejected counts",
          "A reject report to the sender",
          "Retries of the message with no limit",
        ],
        answer: [0,1,2],
        explain: "Catch, record and report.",
      },
      {
        type: 'single',
        prompt: "What does ORA-12899 mean?",
        options: [
          "A value is longer than the column allows",
          "A row breaks a unique key on the table",
          "A NOT NULL column got a null value",
          "A number has too many digits for the column",
        ],
        answer: 0,
        explain: "Too large for the column.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Stop the retry loop",
          "Add row by row fallback with rejects",
          "Reload the message",
          "Report the bad row",
          "Add a length check",
        ],
        explain: "Stop, fix, reload, report, prevent.",
      },
    ],
  },
  description: `
## Symptoms
- A product message keeps failing and coming back.

## Change / Context
- Product data loads in blocks of 500 with a failure queue and a restart app.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 03:10:00 ERROR [prod-load] Bulk insert failed block=7 rows=500 ORA-12899: value too large for column DESCRIPTION
2026-11-18 03:10:00 INFO  [prod-load] On error: send message to failure queue
2026-11-18 03:10:00 INFO  [prod-load] Blocks 1 to 6 already committed
2026-11-18 03:20:00 INFO  [restart-app] Republished message, same error
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
    "Retries do not fix bad data.",
    "Fall back row by row.",
    "Send bad rows to a reject table.",
    "Validate lengths early.",
    "Keep job log counts.",
    "Report rejects.",
  ],
  solution: `
**Diagnosis.** One description is too long. The block fails, the message is retried, and fails again.

**Immediate mitigation.**
- Stop retries, reload with fallback.

**Root cause.** No row level error handling.

**Permanent fix.**
- Row by row fallback and reject table.

**Prevention.** Length validation before load.
`,
  followUps: [
    { q: "Why not truncate the value?", a: "Maybe, if the business agrees. Report it either way." },
    { q: "Is the reload safe?", a: "Only if it uses MERGE, since blocks 1 to 6 are loaded." },
    { q: "How do you stop poison messages?", a: "Count retries and park after a limit." },
    { q: "Where do lengths come from?", a: "The table definition or the interface spec." },
  ],
}

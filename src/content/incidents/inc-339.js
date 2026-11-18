export default {
  id: 'inc-339',
  category: 'incidents',
  title: "Reprocessing Rejected Rows Creates New Rejects for the Same Rows",
  level: 'ADVANCED',
  tags: ["myproject","batch","planning-platform","reprocessing"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 10:00:00 INFO  [reject-replay] Replaying rejects jobId=J-8001 rows=640", relevant: true, why: "Rejects are replayed." },
      { text: "2026-11-18 10:01:00 INFO  [reject-replay] Rejected again rows=640 reason=unknown uom", relevant: true, why: "The same reason again." },
      { text: "2026-11-18 10:01:00 INFO  [reject-replay] Code map updated at 10:05", relevant: true, why: "The fix came after the replay." },
      { text: "2026-11-18 10:01:00 INFO  [reject-table] Rows now=1280", relevant: true, why: "Rejects doubled." },
      { text: "2026-11-18 23:59:00 INFO  [reject-replay] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why did the replay fail?",
        options: [
          "It ran before the code map fix",
          "The rows are bad forever",
          "The batch is broken",
          "Locks",
        ],
        answer: 0,
        explain: "Fix first, then replay.",
      },
      {
        type: 'single',
        prompt: "Why did rejects double?",
        options: [
          "The replay wrote new reject rows instead of updating the originals",
          "They were duplicates",
          "Database error",
          "Normal",
        ],
        answer: 0,
        explain: "Replay should track the original reject.",
      },
      {
        type: 'multi',
        prompt: "What makes replay clean?",
        options: [
          "Link replays to the original reject row with a status",
          "Mark rejects RESOLVED when they load",
          "Replay only after the cause is fixed",
          "Insert a new reject each time",
        ],
        answer: [0,1,2],
        explain: "One reject row per problem, with a status.",
      },
      {
        type: 'single',
        prompt: "Who decides when to replay?",
        options: [
          "Support, once the cause is confirmed fixed",
          "A timer every minute",
          "Nobody",
          "The sender",
        ],
        answer: 0,
        explain: "Replay is deliberate.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Remove duplicate reject rows",
          "Confirm the code map fix",
          "Replay the 640 rows",
          "Mark them RESOLVED",
          "Change replay to update the original row",
        ],
        explain: "Clean, confirm, replay, mark, fix.",
      },
    ],
  },
  description: `
## Symptoms
- The reject report now shows 1,280 rejects for 640 items.

## Change / Context
- Support replays rejects after fixing data.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 10:00:00 INFO  [reject-replay] Replaying rejects jobId=J-8001 rows=640
2026-11-18 10:01:00 INFO  [reject-replay] Rejected again rows=640 reason=unknown uom
2026-11-18 10:01:00 INFO  [reject-replay] Code map updated at 10:05
2026-11-18 10:01:00 INFO  [reject-table] Rows now=1280
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
    "Fix causes before replay.",
    "Replays should update original rejects.",
    "Use statuses like OPEN and RESOLVED.",
    "Avoid duplicate reject rows.",
    "Replay is deliberate.",
    "Report open rejects only.",
  ],
  solution: `
**Diagnosis.** Replay ran before the fix and wrote new reject rows.

**Immediate mitigation.**
- Remove duplicates and replay after the fix.

**Root cause.** Replay design inserts instead of updating.

**Permanent fix.**
- Status on reject rows and update on replay.

**Prevention.** Replay only after confirmation.
`,
  followUps: [
    { q: "What columns does a reject table need?", a: "Job ID, key, reason, original data, status, attempts, times." },
    { q: "Should replay be automatic?", a: "Only for transient reasons. Data problems need a fix first." },
    { q: "How do you report rejects?", a: "Count OPEN rows by reason." },
    { q: "What about very old rejects?", a: "Agree an expiry with the business." },
  ],
}

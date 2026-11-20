export default {
  id: 'inc-222',
  category: 'incidents',
  title: "The Restart App Republishes Failed Messages, but the Duplicate Check Rejects Every One",
  level: 'ADVANCED',
  tags: ["myproject","azure-blob","restart","duplicates","reprocessing","planning-platform"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 02:00:00 INFO  [hub-restart] Health check db=ok blob=ok", relevant: true, why: "The restart app checks the database and storage first." },
      { text: "2026-11-18 02:00:01 INFO  [hub-restart] Republished 312 messages from failure queue to main queue", relevant: true, why: "Failed messages go back to the main queue." },
      { text: "2026-11-18 02:00:02 ERROR [item-hub] DUPLICATE-MESSAGE-ID messageId=N-7731", relevant: true, why: "The hub sees the ID in its log table and rejects it." },
      { text: "2026-11-18 02:00:02 DEBUG [item-hub] Duplicate check: SELECT count from msg_log where msg_id = :id", relevant: true, why: "The check counts any row, including failed ones." },
      { text: "2026-11-18 02:05:00 INFO  [item-hub] Reprocessed=0 rejectedAsDuplicate=312", relevant: true, why: "Nothing is reprocessed." },
      { text: "2026-11-18 23:59:00 INFO  [hub-restart] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why is nothing reprocessed?",
        options: [
          "The check finds the failed attempt’s row and treats it as done",
          "The restart app republished before the database was really back",
          "The restart app gave each message a new ID the hub cannot match",
          "The blobs behind the messages expired during the database outage",
        ],
        answer: 0,
        explain: "The check counts every earlier row, whatever its status.",
      },
      {
        type: 'single',
        prompt: "What should the duplicate check look for?",
        options: [
          "An earlier attempt with a completed status",
          "Any earlier row for the message ID",
          "An earlier row written in the last 24 hours",
          "An earlier row with the same blob path",
        ],
        answer: 0,
        explain: "A failed attempt must not block a retry. Only success means done.",
      },
      {
        type: 'multi',
        prompt: "What makes reprocessing safe?",
        options: [
          "Duplicate check on successful status only",
          "Loads that can run twice without double rows, such as MERGE",
          "A retry count, so a message that keeps failing stops and goes to a person",
          "Turning off the duplicate check while the restart app republishes",
        ],
        answer: [0,1,2],
        explain: "Allow retries, make them harmless, and stop endless loops.",
      },
      {
        type: 'single',
        prompt: "What should happen to rows half loaded by the failed attempt?",
        options: [
          "The retry merges or replaces them, or the failure rolls them back",
          "Leave them, and let the retry insert the full message again",
          "Truncate the staging table before every restart app run",
          "Keep them, and have the retry load only the rows still missing",
        ],
        answer: 0,
        explain: "Otherwise the retry leaves duplicates or hits unique constraint errors.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Change the duplicate check to successful attempts only",
          "Make staging loads safe to repeat",
          "Add a retry count per message",
          "Rerun the restart app",
          "Alert when a message passes its retry limit",
        ],
        explain: "Fix the check, make retries safe, limit them, recover, watch.",
      },
    ],
  },
  description: `
## Symptoms
- After a database outage, the nightly restart app republished 312 failed item messages. None were loaded.

## Change / Context
- The hub logs every message ID in a log table with a status, and rejects IDs it has seen.
- A separate restart app consumes the failure queue and republishes to the main queue after a health check.
- Messages the hub rejects go back to the failure queue.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 02:00:00 INFO  [hub-restart] Health check db=ok blob=ok
2026-11-18 02:00:01 INFO  [hub-restart] Republished 312 messages from failure queue to main queue
2026-11-18 02:00:02 ERROR [item-hub] DUPLICATE-MESSAGE-ID messageId=N-7731
2026-11-18 02:00:02 DEBUG [item-hub] Duplicate check: SELECT count from msg_log where msg_id = :id
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
    "A duplicate check must not block retries of failed work.",
    "Check for a successful earlier attempt only.",
    "Reloads must be safe to repeat, such as with MERGE.",
    "Count retries and stop endless loops.",
    "Health check before reprocessing.",
    "Alert on messages past their retry limit.",
  ],
  solution: `
**Diagnosis.** The duplicate check counts any earlier row for the message ID. Every failed message already has a row from its failed attempt, so all 312 retries are rejected.

**Immediate mitigation.**
- Change the check to look for a completed status, then rerun the restart app.

**Root cause.** The duplicate check was written for new messages and never tested with the restart path.

**Permanent fix.**
- Check status, not only existence.
- Load staging tables with MERGE or delete and insert per message, so a retry is harmless.
- Keep a retry count and send messages past the limit to a person.

**Prevention.** An end to end test of fail, restart and reload.
`,
  followUps: [
    { q: "Why have a duplicate check at all?", a: "Senders can resend a message that was already loaded, which would double the data." },
    { q: "Where should the retry count live?", a: "In the message log table or as a message property." },
    { q: "Why health check first?", a: "Reprocessing while the database is still down only fails again." },
    { q: "How do you show the result?", a: "A report of reprocessed, rejected and still failing messages." },
  ],
}

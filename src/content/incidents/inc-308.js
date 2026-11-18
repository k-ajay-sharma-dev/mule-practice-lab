export default {
  id: 'inc-308',
  category: 'incidents',
  title: "Restarting a Failed Product Batch Loads Half the Records Twice",
  level: 'EXPERT',
  tags: ["myproject","batch","blue-yonder","claim-check","reprocessing"],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: "2026-11-18 03:00:00 INFO  [prod-batch] Job J-8001 messageId=N-5510 records=12000", relevant: false },
      { text: "2026-11-18 03:04:00 ERROR [prod-batch] Database unavailable after loaded=6000", relevant: true, why: "Half was loaded." },
      { text: "2026-11-18 03:04:00 INFO  [prod-batch] Message sent to failure queue", relevant: false },
      { text: "2026-11-18 03:30:00 INFO  [restart-app] Republished N-5510, new job J-8002 loaded=12000", relevant: true, why: "All 12,000 loaded again." },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why are 6,000 records doubled?",
        options: [
          "The restart reloads the whole message and the first 6,000 were already committed with inserts",
          "The database duplicated",
          "The sender resent",
          "The batch is broken",
        ],
        answer: 0,
        explain: "Reloads must be safe to repeat.",
      },
      {
        type: 'single',
        prompt: "What is the cleanest fix?",
        options: [
          "Make the load idempotent with MERGE on the business key",
          "Delete everything first",
          "Never restart",
          "Load slower",
        ],
        answer: 0,
        explain: "Repeats then update instead of insert.",
      },
      {
        type: 'multi',
        prompt: "What else helps restart?",
        options: [
          "A staging table per message, cleared before reload",
          "A job log that links both jobs to the message",
          "A check that the earlier job rows are reversed or superseded",
          "Restarting without checks",
        ],
        answer: [0,1,2],
        explain: "Clear state, clear links.",
      },
      {
        type: 'single',
        prompt: "What should the job log show?",
        options: [
          "J-8002 is a restart of J-8001 for message N-5510",
          "Two unrelated jobs",
          "Nothing",
          "Only the last job",
        ],
        answer: 0,
        explain: "Link restarts.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Remove the duplicate rows",
          "Change the load to MERGE",
          "Link restart jobs in the log",
          "Test a restart mid load",
          "Document the restart path",
        ],
        explain: "Clean, fix, link, test, document.",
      },
    ],
  },
  description: `
## Symptoms
- 6,000 products appear twice after a restart.

## Change / Context
- Failed messages go to a failure queue and a restart app republishes them.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 03:04:00 ERROR [prod-batch] Database unavailable after loaded=6000
2026-11-18 03:30:00 INFO  [restart-app] Republished N-5510, new job J-8002 loaded=12000
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
    "Restarts reload whole messages.",
    "Loads must be idempotent.",
    "Use MERGE or staging per message.",
    "Link restart jobs.",
    "Test restarts mid load.",
    "Document the path.",
  ],
  solution: `
**Diagnosis.** The restart reloaded all records with inserts after half had committed.

**Immediate mitigation.**
- Remove duplicates.

**Root cause.** Insert only load in a restartable design.

**Permanent fix.**
- MERGE or per message staging.

**Prevention.** Restart tests.
`,
  followUps: [
    { q: "Why not commit at the end only?", a: "Large transactions hold locks and undo. Idempotency is safer." },
    { q: "How does the restart app know it is safe?", a: "Health checks first, then republish." },
    { q: "What key for MERGE?", a: "The product ID or GTIN with the location if needed." },
    { q: "How do you link jobs?", a: "A parent job ID column." },
  ],
}

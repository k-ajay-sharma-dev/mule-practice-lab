export default {
  id: 'inc-324',
  category: 'incidents',
  title: "A Cleanup Job Deletes a Day of Inbound Files Before They Are Processed",
  level: 'INTERMEDIATE',
  tags: ["myproject","azure-blob","soft-delete","recovery"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 02:00:00 INFO  [blob-cleanup] Deleted blobs prefix=inbound/ olderThan=1d count=1840", relevant: true, why: "A cleanup ran on the inbound prefix." },
      { text: "2026-11-18 02:00:00 INFO  [blob-cleanup] Rule changed yesterday from processed/ to inbound/", relevant: true, why: "The rule targets the wrong prefix." },
      { text: "2026-11-18 03:00:00 WARN  [item-hub] Notification refers to missing blob count=212", relevant: true, why: "Messages point at deleted files." },
      { text: "2026-11-18 03:05:00 INFO  [ops] Soft delete enabled retentionDays=7", relevant: true, why: "Deleted blobs can be restored." },
      { text: "2026-11-18 23:59:00 INFO  [blob-cleanup] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why are blobs missing?",
        options: [
          "The cleanup now deletes from inbound instead of processed",
          "The sender did not upload",
          "Azure lost them",
          "The hub deleted them",
        ],
        answer: 0,
        explain: "A config change pointed it at the wrong prefix.",
      },
      {
        type: 'single',
        prompt: "How do you get them back?",
        options: [
          "Undelete them with soft delete, within the retention period",
          "Ask the sender for everything",
          "Nothing can be done",
          "Restore last month’s backup",
        ],
        answer: 0,
        explain: "Soft delete keeps deleted blobs for a while.",
      },
      {
        type: 'multi',
        prompt: "What prevents this?",
        options: [
          "Review cleanup rule changes",
          "Only delete blobs marked processed",
          "Keep soft delete on",
          "Delete inbound files daily",
        ],
        answer: [0,1,2],
        explain: "Delete only what you know is done.",
      },
      {
        type: 'single',
        prompt: "After undelete, what next?",
        options: [
          "Replay the 212 notifications",
          "Nothing",
          "Delete again",
          "Restart Azure",
        ],
        answer: 0,
        explain: "The messages still need processing.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Stop the cleanup",
          "Undelete the blobs",
          "Replay notifications",
          "Fix the rule",
          "Add a review for rule changes",
        ],
        explain: "Stop, restore, recover, fix, prevent.",
      },
    ],
  },
  description: `
## Symptoms
- 212 item messages fail with blob not found.

## Change / Context
- A cleanup job deletes old blobs. Its prefix changed yesterday.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 02:00:00 INFO  [blob-cleanup] Deleted blobs prefix=inbound/ olderThan=1d count=1840
2026-11-18 02:00:00 INFO  [blob-cleanup] Rule changed yesterday from processed/ to inbound/
2026-11-18 03:00:00 WARN  [item-hub] Notification refers to missing blob count=212
2026-11-18 03:05:00 INFO  [ops] Soft delete enabled retentionDays=7
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
    "Cleanup rules can delete live data.",
    "Soft delete allows recovery.",
    "Delete only processed files.",
    "Review rule changes.",
    "Replay after restore.",
    "Know your retention period.",
  ],
  solution: `
**Diagnosis.** The cleanup rule now targets inbound, so unprocessed blobs were deleted.

**Immediate mitigation.**
- Undelete and replay.

**Root cause.** An unreviewed config change.

**Permanent fix.**
- Restore the processed prefix in the rule.

**Prevention.** Change review and delete only processed blobs.
`,
  followUps: [
    { q: "What is soft delete?", a: "A setting that keeps deleted blobs for a set number of days." },
    { q: "Does it cost money?", a: "Yes, deleted data is stored until it expires." },
    { q: "What about versioning?", a: "Versioning keeps older versions when blobs are overwritten." },
    { q: "Who should approve cleanup rules?", a: "The owner of the data and the integration team." },
  ],
}

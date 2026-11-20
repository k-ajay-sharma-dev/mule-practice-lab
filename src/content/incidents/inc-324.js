export default {
  id: 'inc-324',
  category: 'incidents',
  title: "A Cleanup Job Deletes a Day of Inbound Files Before They Are Processed",
  level: 'INTERMEDIATE',
  tags: ["myproject","azure-blob","soft-delete","recovery"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-17 16:00:00 INFO  [blob-cleanup] Rule prefix changed from processed/ to inbound/", relevant: true, why: "The rule now targets the wrong prefix." },
      { text: "2026-11-18 02:00:00 INFO  [blob-cleanup] Deleted blobs prefix=inbound/ olderThan=1d count=212", relevant: true, why: "A cleanup ran on the inbound prefix." },
      { text: "2026-11-18 03:00:00 WARN  [item-hub] Notification refers to missing blob count=212", relevant: true, why: "Messages point at the deleted files." },
      { text: "2026-11-18 03:05:00 INFO  [ops] Blob soft delete is on, retentionDays=7", relevant: true, why: "Deleted blobs can be restored for seven days." },
      { text: "2026-11-18 03:10:00 INFO  [blob-cleanup] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why are blobs missing?",
        options: [
          "The cleanup now deletes from inbound/ instead of processed/",
          "The senders stopped uploading files after Tuesday’s change",
          "The item hub deleted each blob after reading its notification",
          "Azure moved the blobs to the archive tier after one day",
        ],
        answer: 0,
        explain: "A config change pointed it at the wrong prefix.",
      },
      {
        type: 'single',
        prompt: "What is the fastest way to get them back?",
        options: [
          "Undelete them with soft delete, within the 7 day retention period",
          "Copy them from the processed/ prefix where finished files go",
          "Restore the storage account from last month’s backup",
          "Nothing, Azure cannot recover a blob after a delete",
        ],
        answer: 0,
        explain: "Soft delete keeps deleted blobs for the retention period. They never reached processed/.",
      },
      {
        type: 'multi',
        prompt: "What prevents this?",
        options: [
          "Review cleanup rule changes",
          "Only delete blobs marked processed",
          "Keep blob soft delete on",
          "Run the cleanup hourly instead",
        ],
        answer: [0,1,2],
        explain: "Delete only what you know is done.",
      },
      {
        type: 'single',
        prompt: "After undelete, what next?",
        options: [
          "Replay the 212 notifications for the restored blobs",
          "Nothing, the hub picks up restored blobs on its own",
          "Restart the item hub so it lists inbound/ again",
          "Run the cleanup again to confirm it deletes nothing",
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
- A nightly cleanup job deletes old blobs. Its prefix changed yesterday afternoon.
- The item hub was paused for an upgrade from Monday until 02:30 today, so inbound/ held files more than a day old.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-17 16:00:00 INFO  [blob-cleanup] Rule prefix changed from processed/ to inbound/
2026-11-18 02:00:00 INFO  [blob-cleanup] Deleted blobs prefix=inbound/ olderThan=1d count=212
2026-11-18 03:00:00 WARN  [item-hub] Notification refers to missing blob count=212
2026-11-18 03:05:00 INFO  [ops] Blob soft delete is on, retentionDays=7
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

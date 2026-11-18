export default {
  id: 'inc-268',
  category: 'incidents',
  title: "Item Changes Made Late at Night Never Reach the Planning Platform",
  level: 'INTERMEDIATE',
  tags: ["myproject","sql-server","planning-platform","master-data","watermark"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 00:00:00 INFO  [item-delta] Select where modified_at > lastRun=2026-11-17T00:00:00", relevant: true, why: "Watermark based extract." },
      { text: "2026-11-18 00:00:02 INFO  [item-delta] Rows=410, new lastRun=2026-11-18T00:00:02", relevant: true, why: "The watermark becomes the run time." },
      { text: "2026-11-17 23:59:59 INFO  [erp] Item ITM-7731 committed modified_at=2026-11-17T23:59:58", relevant: true, why: "A change committed shortly before the run." },
      { text: "2026-11-18 00:00:03 INFO  [erp] Item ITM-7740 committed modified_at=2026-11-17T23:59:59", relevant: true, why: "A long transaction committed after the extract read." },
      { text: "2026-11-18 23:59:00 INFO  [item-delta] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why is ITM-7740 missed?",
        options: [
          "Its modified time is before the new watermark, but it committed after the extract read the table",
          "It was deleted",
          "The platform rejected it",
          "The extract failed",
        ],
        answer: 0,
        explain: "Commit time and modified time differ.",
      },
      {
        type: 'single',
        prompt: "What is a safer watermark?",
        options: [
          "Use the highest modified_at actually read, with a small overlap",
          "Use the run start time",
          "Use the run end time",
          "Use the date only",
        ],
        answer: 0,
        explain: "Overlap catches late commits. Upserts make repeats harmless.",
      },
      {
        type: 'multi',
        prompt: "What else catches late changes?",
        options: [
          "Change tracking or rowversion columns",
          "Overlap of a few minutes with idempotent upserts downstream",
          "A weekly full snapshot",
          "Ignoring them",
        ],
        answer: [0,1,2],
        explain: "Several options, all safer than run time.",
      },
      {
        type: 'single',
        prompt: "Why must the receiver tolerate repeats?",
        options: [
          "Overlap sends some rows twice",
          "Because SQL Server says so",
          "It is faster",
          "It is not needed",
        ],
        answer: 0,
        explain: "Overlap trades repeats for no gaps.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Resend missed items",
          "Change the watermark rule",
          "Add overlap",
          "Agree upsert at the platform",
          "Schedule a weekly snapshot",
        ],
        explain: "Recover, fix, harden, agree, reset.",
      },
    ],
  },
  description: `
## Symptoms
- Some item changes made near midnight never appear in the planning platform.

## Change / Context
- A delta extract runs at midnight and keeps a watermark.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 00:00:00 INFO  [item-delta] Select where modified_at > lastRun=2026-11-17T00:00:00
2026-11-18 00:00:02 INFO  [item-delta] Rows=410, new lastRun=2026-11-18T00:00:02
2026-11-17 23:59:59 INFO  [erp] Item ITM-7731 committed modified_at=2026-11-17T23:59:58
2026-11-18 00:00:03 INFO  [erp] Item ITM-7740 committed modified_at=2026-11-17T23:59:59
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
    "Modified time is not commit time.",
    "Do not use run time as the watermark.",
    "Use the max value read with overlap.",
    "rowversion or change tracking is safer.",
    "Receivers must tolerate repeats.",
    "Snapshots correct drift.",
  ],
  solution: `
**Diagnosis.** A change committed after the extract with a modified time before the new watermark, so it was skipped.

**Immediate mitigation.**
- Resend missed items.

**Root cause.** The watermark uses run time.

**Permanent fix.**
- Max value read with overlap, or rowversion.

**Prevention.** Weekly snapshot.
`,
  followUps: [
    { q: "What is rowversion?", a: "A column that changes on every update with an increasing value." },
    { q: "What is change tracking?", a: "A SQL Server feature that records which rows changed." },
    { q: "How much overlap?", a: "Longer than the longest transaction." },
    { q: "Where is the watermark kept?", a: "In a table or object store that survives restarts." },
  ],
}

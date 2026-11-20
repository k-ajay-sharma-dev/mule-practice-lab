export default {
  id: 'inc-284',
  category: 'incidents',
  title: "The Hub Reports a Message as Completed but Some Records Never Reached the Target Tables",
  level: 'EXPERT',
  tags: ["myproject","oracle","planning-platform","claim-check","reconciliation"],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: "2026-11-18 04:00:00 INFO  [hub] Job J-7001 type=Item records=4800 staged=4800", relevant: true, why: "All records staged." },
      { text: "2026-11-18 04:02:00 INFO  [hub] Target procedure loaded=4740 rejected=0", relevant: true, why: "60 records are unaccounted for." },
      { text: "2026-11-18 04:02:00 INFO  [hub] Final ACK=COMPLETED sent", relevant: true, why: "The hub reported success." },
      { text: "2026-11-18 04:02:00 INFO  [dba] Procedure skips items with unknown category, no reject row written", relevant: true, why: "The procedure drops rows silently." },
      { text: "2026-11-18 23:59:00 INFO  [hub] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Where did the 60 records go?",
        options: [
          "The target procedure skipped them silently, without writing rejects",
          "They failed validation in the hub and were never staged",
          "The queue lost them between staging and the procedure call",
          "The claim check blob held only 4,740 of the 4,800 records",
        ],
        answer: 0,
        explain: "Staged 4,800, loaded 4,740, rejected 0.",
      },
      {
        type: 'single',
        prompt: "What check would have caught it?",
        options: [
          "staged = loaded + rejected before sending COMPLETED",
          "A procedure timeout check before sending COMPLETED",
          "A check that the blob was read before sending COMPLETED",
          "A count of queue messages before sending COMPLETED",
        ],
        answer: 0,
        explain: "Counts must add up.",
      },
      {
        type: 'multi',
        prompt: "What should change?",
        options: [
          "The procedure writes a reject row for every skipped record",
          "The hub sends a PARTIAL or FAILED ack when counts do not add up",
          "Unknown categories are reported to the sender",
          "Send COMPLETED and log a warning for the gap",
        ],
        answer: [0,1,2],
        explain: "Truthful acks and full accounting.",
      },
      {
        type: 'single',
        prompt: "Why is a false COMPLETED harmful?",
        options: [
          "The sender believes all data arrived and will not resend",
          "It makes the hub retry the job until the counts match",
          "It locks the job so the 60 items can never be loaded",
          "The sender rejects COMPLETED acks for partial loads",
        ],
        answer: 0,
        explain: "The ack is a promise.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Find the 60 skipped items",
          "Load them once categories exist",
          "Correct the ack to the sender",
          "Add the count check",
          "Make the procedure write rejects",
        ],
        explain: "Find, fix, correct, check, prevent.",
      },
    ],
  },
  description: `
## Symptoms
- A buyer cannot find 60 new items that the hub said were loaded.

## Change / Context
- The hub stages records, calls a target procedure, then sends a final ack to the sender.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 04:00:00 INFO  [hub] Job J-7001 type=Item records=4800 staged=4800
2026-11-18 04:02:00 INFO  [hub] Target procedure loaded=4740 rejected=0
2026-11-18 04:02:00 INFO  [hub] Final ACK=COMPLETED sent
2026-11-18 04:02:00 INFO  [dba] Procedure skips items with unknown category, no reject row written
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
    "Counts must add up before a final ack.",
    "Silent skips hide data loss.",
    "Every skipped record needs a reject row.",
    "Acks must tell the truth.",
    "Report reasons to the sender.",
    "Reconcile per job.",
  ],
  solution: `
**Diagnosis.** The target procedure skipped 60 items with unknown categories without rejects, and the hub still sent COMPLETED.

**Immediate mitigation.**
- Find and load the items, correct the ack.

**Root cause.** No count check and silent skips.

**Permanent fix.**
- Rejects for skips and a count check before acking.

**Prevention.** Reconciliation per job.
`,
  followUps: [
    { q: "What ack statuses help?", a: "COMPLETED, PARTIAL and FAILED, with counts." },
    { q: "Where are counts stored?", a: "In the job log tables." },
    { q: "Who fixes categories?", a: "The sender or master data team." },
    { q: "How do you find silent skips elsewhere?", a: "Compare staged with loaded plus rejected for recent jobs." },
  ],
}

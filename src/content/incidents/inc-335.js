export default {
  id: 'inc-335',
  category: 'incidents',
  title: "New Units of Measure Are Rejected Because the Code Map Was Not Updated",
  level: 'ADVANCED',
  tags: ["myproject","oracle","code-map","planning-platform"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 03:00:00 INFO  [item-hub] Message N-8820 type=Item records=3000", relevant: false },
      { text: "2026-11-18 03:01:00 WARN  [item-hub] Code map miss field=uom value=CS12 count=640", relevant: true, why: "A new unit has no mapping." },
      { text: "2026-11-18 03:01:00 INFO  [item-hub] Rows rejected=640 reason=unknown uom", relevant: true, why: "Rows go to the reject table." },
      { text: "2026-11-18 03:02:00 INFO  [item-hub] Final ACK=COMPLETED loaded=2360 rejected=640", relevant: true, why: "The ack reports the rejects." },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why were 640 rows rejected?",
        options: [
          "A new unit of measure CS12 is not in the code map table",
          "The supplier sent CS12 rows twice, so they were deduplicated",
          "The Oracle reject table hit its row limit for the night",
          "CS12 rows failed a foreign key check on the item table",
        ],
        answer: 0,
        explain: "The code map has no entry.",
      },
      {
        type: 'single',
        prompt: "What is the quick fix?",
        options: [
          "Agree CS12’s mapping with the business, add it, then reprocess",
          "Map CS12 to EA in the code map, since most units are each",
          "Delete the rejects and ask the supplier to resend all 3000",
          "Turn off the uom check so unknown codes load as they are",
        ],
        answer: 0,
        explain: "The business decides the mapping.",
      },
      {
        type: 'multi',
        prompt: "What prevents this next time?",
        options: [
          "The sender announces new codes before using them",
          "An alert on code map misses",
          "A reprocess path for rejected rows",
          "Hard code the known units in the Mule flow",
        ],
        answer: [0,1,2],
        explain: "Process and visibility.",
      },
      {
        type: 'single',
        prompt: "Was COMPLETED right with 640 rejects?",
        options: [
          "It depends on the agreement. Many use PARTIAL so the sender acts",
          "Yes, the message itself was received and read in full",
          "No, any reject must turn the whole ack into FAILED",
          "It does not matter, the sender ignores ack statuses",
        ],
        answer: 0,
        explain: "Agree ack meanings.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Agree the CS12 mapping",
          "Add it to the code map",
          "Reprocess the 640 rows",
          "Alert on map misses",
          "Agree a change process for codes",
        ],
        explain: "Agree, fix, recover, watch, prevent.",
      },
    ],
  },
  description: `
## Symptoms
- 640 items are missing from the hub after the supplier added a case size.

## Change / Context
- Codes are translated through a code map table in Oracle.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 03:01:00 WARN  [item-hub] Code map miss field=uom value=CS12 count=640
2026-11-18 03:01:00 INFO  [item-hub] Rows rejected=640 reason=unknown uom
2026-11-18 03:02:00 INFO  [item-hub] Final ACK=COMPLETED loaded=2360 rejected=640
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
    "Code maps need maintenance.",
    "Misses go to rejects.",
    "The business owns mappings.",
    "Reprocess rejects after fixing.",
    "Alert on misses.",
    "Agree a code change process.",
  ],
  solution: `
**Diagnosis.** The new unit CS12 is missing from the code map, so its rows were rejected.

**Immediate mitigation.**
- Add the mapping and reprocess.

**Root cause.** No process for new codes.

**Permanent fix.**
- Code change process with the sender.

**Prevention.** Alerts on code map misses.
`,
  followUps: [
    { q: "Why a table, not code?", a: "The business can update a table without a release." },
    { q: "How do you reprocess rejects?", a: "Read rejected rows with their original data and load them again." },
    { q: "Should unknown codes pass through?", a: "Usually no, wrong data is worse than missing data." },
    { q: "What about default mappings?", a: "Only if the business agrees one." },
  ],
}

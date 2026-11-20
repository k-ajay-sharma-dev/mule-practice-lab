export default {
  id: 'inc-274',
  category: 'incidents',
  title: "Item Loads Fail With ORA-00001 When the Same Item Is Sent Again",
  level: 'BEGINNER',
  tags: ["myproject","oracle","unique-constraint","merge"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-18 03:00:00 INFO  [item-load] Message type=Item change=UPDATE count=1200", relevant: true, why: "The sender sends updates too." },
      { text: "2026-11-18 03:00:10 INFO  [item-load] Operation INSERT INTO item", relevant: true, why: "The load only inserts." },
      { text: "2026-11-18 03:00:10 ERROR [item-load] ORA-00001: unique constraint (HUB.PK_ITEM) violated item=ITM-4410", relevant: true, why: "The item already exists." },
      { text: "2026-11-18 03:00:11 WARN  [item-load] Batch rolled back rows=1200", relevant: true, why: "One clash stops everything." },
      { text: "2026-11-18 23:59:00 INFO  [item-load] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does the load fail?",
        options: [
          "It inserts items that already exist, so the key is violated",
          "Two Mule workers insert the same new item at the same time",
          "The ITEM table’s sequence was reset and reuses old IDs",
          "The sender put ITM-4410 twice in the same message",
        ],
        answer: 0,
        explain: "ORA-00001 means a duplicate key.",
      },
      {
        type: 'single',
        prompt: "What is the fix?",
        options: [
          "Use MERGE to update existing items and insert new ones",
          "Disable PK_ITEM during the load, then enable it",
          "Delete all items from the table before each load",
          "Skip rows that raise ORA-00001 and load the rest",
        ],
        answer: 0,
        explain: "MERGE handles both cases.",
      },
      {
        type: 'multi',
        prompt: "What else is good practice?",
        options: [
          "Load into staging and MERGE into the target",
          "Report rows that fail with their key",
          "Keep the primary key",
          "Remove the table constraints for speed",
        ],
        answer: [0,1,2],
        explain: "Constraints protect data. Handle them properly.",
      },
      {
        type: 'single',
        prompt: "Why did one clash roll back 1,200 rows?",
        options: [
          "The batch ran in one transaction",
          "ORA-00001 locks the whole table",
          "Oracle undoes 1,200 rows per error",
          "The sender sent a rollback message",
        ],
        answer: 0,
        explain: "All or nothing, which is fine if you retry with the right statement.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Change INSERT to MERGE",
          "Rerun the batch",
          "Check counts",
          "Add a test with updates",
          "Review other insert only loads",
        ],
        explain: "Fix, recover, check, test, review.",
      },
    ],
  },
  description: `
## Symptoms
- Item updates stopped loading this morning.

## Change / Context
- The sender started sending updates for existing items.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 03:00:00 INFO  [item-load] Message type=Item change=UPDATE count=1200
2026-11-18 03:00:10 INFO  [item-load] Operation INSERT INTO item
2026-11-18 03:00:10 ERROR [item-load] ORA-00001: unique constraint (HUB.PK_ITEM) violated item=ITM-4410
2026-11-18 03:00:11 WARN  [item-load] Batch rolled back rows=1200
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
    "ORA-00001 is a unique key clash.",
    "MERGE handles insert and update.",
    "Keep constraints.",
    "Stage then MERGE.",
    "Report failing keys.",
    "Test with updates.",
  ],
  solution: `
**Diagnosis.** The load inserts every row. Existing items break the primary key.

**Immediate mitigation.**
- Rerun with MERGE.

**Root cause.** The load assumed only new items.

**Permanent fix.**
- MERGE on the item key.

**Prevention.** Tests with existing keys.
`,
  followUps: [
    { q: "What does MERGE need?", a: "A join condition on the key, and update and insert actions." },
    { q: "Is MERGE slower?", a: "Slightly, but correct. Index the key." },
    { q: "What about deletes?", a: "MERGE can delete too, or send a status column." },
    { q: "Should one clash stop a batch?", a: "Not if you use MERGE. Otherwise use a fallback." },
  ],
}

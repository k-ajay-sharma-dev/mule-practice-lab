export default {
  id: 'inc-326',
  category: 'incidents',
  title: "A Bad Plan File Overwrites Last Week’s Good One on the Share",
  level: 'INTERMEDIATE',
  tags: ["myproject","azure-file-share","snapshots","recovery"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 05:00:00 INFO  [plan-drop] Wrote /plans/current_plan.csv rows=0", relevant: true, why: "An empty file replaced the plan." },
      { text: "2026-11-18 05:00:00 INFO  [plan-drop] Write mode=OVERWRITE", relevant: true, why: "The old file is gone." },
      { text: "2026-11-18 06:00:00 WARN  [stores] Replenishment plan empty", relevant: true, why: "Stores have no plan." },
      { text: "2026-11-18 06:01:00 INFO  [ops] Share snapshot taken daily at 00:00", relevant: true, why: "Yesterday’s version exists in a snapshot." },
      { text: "2026-11-18 23:59:00 INFO  [plan-drop] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "How do you restore the plan fast?",
        options: [
          "Copy the file from last night’s share snapshot",
          "Ask the platform to rerun",
          "Rebuild by hand",
          "Nothing",
        ],
        answer: 0,
        explain: "Snapshots keep point in time copies.",
      },
      {
        type: 'single',
        prompt: "What should have stopped the empty file?",
        options: [
          "A check that rejects a plan with zero rows before writing",
          "More disk",
          "A faster write",
          "A different name",
        ],
        answer: 0,
        explain: "Validate before you overwrite.",
      },
      {
        type: 'multi',
        prompt: "What else protects good data?",
        options: [
          "Write to a new dated name and switch a pointer",
          "Keep the previous file as a backup",
          "Compare row counts with yesterday",
          "Always overwrite",
        ],
        answer: [0,1,2],
        explain: "Never destroy the last good copy blindly.",
      },
      {
        type: 'single',
        prompt: "Why was the file empty?",
        options: [
          "Find out upstream, the platform or the extract failed",
          "Azure emptied it",
          "The share is full",
          "Unknown forever",
        ],
        answer: 0,
        explain: "Fix the source too.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Restore from the snapshot",
          "Tell stores",
          "Add a zero row check",
          "Write dated files",
          "Find why the source was empty",
        ],
        explain: "Restore, tell, guard, redesign, root cause.",
      },
    ],
  },
  description: `
## Symptoms
- Stores have no replenishment plan this morning.

## Change / Context
- The flow overwrites one fixed file name on the share each day.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 05:00:00 INFO  [plan-drop] Wrote /plans/current_plan.csv rows=0
2026-11-18 05:00:00 INFO  [plan-drop] Write mode=OVERWRITE
2026-11-18 06:00:00 WARN  [stores] Replenishment plan empty
2026-11-18 06:01:00 INFO  [ops] Share snapshot taken daily at 00:00
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
    "Share snapshots allow fast restore.",
    "Validate before overwriting.",
    "Write dated files.",
    "Compare counts with yesterday.",
    "Keep the last good copy.",
    "Find the upstream cause.",
  ],
  solution: `
**Diagnosis.** An empty plan overwrote the good one.

**Immediate mitigation.**
- Restore from the snapshot.

**Root cause.** No validation before overwrite.

**Permanent fix.**
- Zero row check and dated files.

**Prevention.** Count comparison alerts.
`,
  followUps: [
    { q: "How are snapshots made?", a: "Through the portal, CLI, REST or a schedule." },
    { q: "Are snapshots backups?", a: "They live in the same account, so keep real backups too." },
    { q: "What is a pointer file?", a: "A small file that names the current dated file." },
    { q: "How low a count is suspicious?", a: "Agree a threshold, such as below 80 percent of yesterday." },
  ],
}

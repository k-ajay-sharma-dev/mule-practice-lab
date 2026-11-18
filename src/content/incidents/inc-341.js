export default {
  id: 'inc-341',
  category: 'incidents',
  title: "Loading Plan Parts in Parallel Makes the Total Wrong",
  level: 'EXPERT',
  tags: ["myproject","large-files","planning-platform","parallel"],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: "2026-11-18 05:00:00 INFO  [plan-load] Parts=8 loading in parallel", relevant: true, why: "Parts load together." },
      { text: "2026-11-18 05:02:00 INFO  [plan-load] Part 3 failed and retried, part 3 loaded twice", relevant: true, why: "One part loaded twice." },
      { text: "2026-11-18 05:05:00 INFO  [plan-load] Total rows loaded=5200000 expected=4800000", relevant: true, why: "The total is too high." },
      { text: "2026-11-18 05:05:00 INFO  [plan-load] Insert mode=INSERT", relevant: true, why: "Inserts, not MERGE." },
      { text: "2026-11-18 23:59:00 INFO  [plan-load] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why is the total too high?",
        options: [
          "Part 3 loaded twice with plain inserts",
          "The file is wrong",
          "Counting error",
          "The platform sent extra",
        ],
        answer: 0,
        explain: "A retry repeated a partly loaded part.",
      },
      {
        type: 'single',
        prompt: "What makes part retries safe?",
        options: [
          "Load each part into staging tagged by part, clear that part on retry, then MERGE",
          "Never retry",
          "Load slower",
          "Load in one thread",
        ],
        answer: 0,
        explain: "Retry the part, not the rows on top.",
      },
      {
        type: 'multi',
        prompt: "What else protects the set?",
        options: [
          "A part log with status per part",
          "A total check against the control file before switching",
          "Switching to the new plan only when all parts load",
          "Updating live tables part by part",
        ],
        answer: [0,1,2],
        explain: "All or nothing for the set.",
      },
      {
        type: 'single',
        prompt: "Why switch only at the end?",
        options: [
          "Stores never see a mix of old and new plans",
          "Speed",
          "Cost",
          "No reason",
        ],
        answer: 0,
        explain: "Consistency for users.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Remove the duplicate part rows",
          "Add per part staging and clear on retry",
          "Check totals against the control file",
          "Switch the plan at the end",
          "Add a part log",
        ],
        explain: "Clean, fix, check, switch, track.",
      },
    ],
  },
  description: `
## Symptoms
- Store orders are 8 percent higher than the plan.

## Change / Context
- Eight plan parts load in parallel with plain inserts.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 05:00:00 INFO  [plan-load] Parts=8 loading in parallel
2026-11-18 05:02:00 INFO  [plan-load] Part 3 failed and retried, part 3 loaded twice
2026-11-18 05:05:00 INFO  [plan-load] Total rows loaded=5200000 expected=4800000
2026-11-18 05:05:00 INFO  [plan-load] Insert mode=INSERT
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
    "Parallel parts need per part state.",
    "Clear a part before retrying it.",
    "MERGE from staging.",
    "Check totals against the control file.",
    "Switch only when complete.",
    "Keep a part log.",
  ],
  solution: `
**Diagnosis.** Part 3 was retried and loaded twice with inserts.

**Immediate mitigation.**
- Remove duplicates.

**Root cause.** No per part state or idempotent load.

**Permanent fix.**
- Per part staging, clear on retry, MERGE.

**Prevention.** Total checks and a part log.
`,
  followUps: [
    { q: "Why parallel at all?", a: "It shortens the load window." },
    { q: "How do you clear a part?", a: "Delete staging rows with that part number." },
    { q: "Where does the expected total come from?", a: "The control file." },
    { q: "What if one part never loads?", a: "Keep the old plan and alert." },
  ],
}

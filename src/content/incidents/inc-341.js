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
      { text: "2026-11-18 05:02:00 INFO  [plan-load] Part 3 failed after rows=400000, retried from the start", relevant: true, why: "The retry loads all 600,000 rows on top of the 400,000 already there." },
      { text: "2026-11-18 05:05:00 INFO  [plan-load] Total rows loaded=5200000 expected=4800000 from control file", relevant: true, why: "The total is 400,000 too high." },
      { text: "2026-11-18 05:05:00 INFO  [plan-load] Insert mode=INSERT", relevant: true, why: "Inserts, not MERGE." },
      { text: "2026-11-18 05:10:00 INFO  [plan-load] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why is the total too high?",
        options: [
          "Part 3 was retried on top of 400,000 rows it had loaded",
          "The control file total is wrong by 400,000 rows",
          "The platform sent part 3 twice in the same set",
          "The row count also counts the staging table",
        ],
        answer: 0,
        explain: "A retry repeated a partly loaded part. Eight parts of 600,000 make 4,800,000.",
      },
      {
        type: 'single',
        prompt: "What makes part retries safe?",
        options: [
          "Tag staging rows by part, clear that part on retry, then MERGE",
          "Turn off retries so a failed part is skipped for the night",
          "Add a pause before each retry so the first try finishes",
          "Load the parts one at a time instead of in parallel",
        ],
        answer: 0,
        explain: "Retry the part, not the rows on top. A serial load with plain inserts still duplicates on retry.",
      },
      {
        type: 'multi',
        prompt: "What else protects the set?",
        options: [
          "A part log with status per part",
          "A total check against the control file before switching",
          "Switching to the new plan only when all parts load",
          "Writing each part straight into the live tables",
        ],
        answer: [0,1,2],
        explain: "All or nothing for the set.",
      },
      {
        type: 'single',
        prompt: "Why switch only at the end?",
        options: [
          "Stores never see a mix of old and new plans",
          "It makes the parallel load finish sooner",
          "It lowers the cost of the database writes",
          "It lets each part retry without a lock",
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
- Store orders are about 8 percent higher than the plan.

## Change / Context
- Eight plan parts of 600,000 rows each load in parallel with plain inserts.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 05:00:00 INFO  [plan-load] Parts=8 loading in parallel
2026-11-18 05:02:00 INFO  [plan-load] Part 3 failed after rows=400000, retried from the start
2026-11-18 05:05:00 INFO  [plan-load] Total rows loaded=5200000 expected=4800000 from control file
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
**Diagnosis.** Part 3 failed after 400,000 rows and was retried from the start with plain inserts, so those rows were loaded twice.

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

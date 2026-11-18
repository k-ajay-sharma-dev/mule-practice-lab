export default {
  id: 'inc-277',
  category: 'incidents',
  title: "A Query Fails When the List of Store IDs Grows Past a Thousand",
  level: 'INTERMEDIATE',
  tags: ["myproject","oracle","in-list","batch"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 06:00:00 INFO  [stock-query] Building IN list size=1240", relevant: true, why: "The list is long." },
      { text: "2026-11-18 06:00:00 ERROR [stock-query] ORA-01795: maximum number of expressions in a list is 1000", relevant: true, why: "Oracle limits IN lists." },
      { text: "2026-11-18 06:00:00 INFO  [stock-query] Stores opened this month=40", relevant: true, why: "Growth pushed it over." },
      { text: "2026-11-18 06:00:01 WARN  [stock-query] Stock export skipped", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does it fail?",
        options: [
          "Oracle allows at most 1,000 expressions in an IN list",
          "The table is big",
          "Stores are wrong",
          "Timeouts",
        ],
        answer: 0,
        explain: "ORA-01795.",
      },
      {
        type: 'single',
        prompt: "What is a good fix?",
        options: [
          "Load IDs into a global temporary table and join, or query in chunks of under 1,000",
          "Split the database",
          "Remove stores",
          "Raise the limit",
        ],
        answer: 0,
        explain: "Join or chunk.",
      },
      {
        type: 'multi',
        prompt: "Which else works?",
        options: [
          "A table of store groups joined in SQL",
          "Binding an array as a collection",
          "Running chunks and combining results",
          "Building SQL text by string concatenation",
        ],
        answer: [0,1,2],
        explain: "Avoid string built SQL, which risks injection.",
      },
      {
        type: 'single',
        prompt: "Why avoid building SQL strings?",
        options: [
          "Injection risk and no plan reuse",
          "It is slow to type",
          "It is not allowed",
          "No reason",
        ],
        answer: 0,
        explain: "Use binds.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Run the export in chunks today",
          "Change to a join on a temp table",
          "Test with 2,000 IDs",
          "Review other IN lists",
          "Add a growth test",
        ],
        explain: "Recover, fix, test, review.",
      },
    ],
  },
  description: `
## Symptoms
- The stock export failed after new stores opened.

## Change / Context
- The flow builds an IN list of all store IDs.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 06:00:00 INFO  [stock-query] Building IN list size=1240
2026-11-18 06:00:00 ERROR [stock-query] ORA-01795: maximum number of expressions in a list is 1000
2026-11-18 06:00:00 INFO  [stock-query] Stores opened this month=40
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
    "Oracle IN lists max out at 1,000.",
    "Join a temp table instead.",
    "Or chunk the list.",
    "Use binds, not string SQL.",
    "Plan for growth.",
    "Review similar queries.",
  ],
  solution: `
**Diagnosis.** The IN list passed 1,000 entries.

**Immediate mitigation.**
- Run in chunks.

**Root cause.** Design did not allow for growth.

**Permanent fix.**
- Join a temp table of IDs.

**Prevention.** Growth tests.
`,
  followUps: [
    { q: "What is a global temporary table?", a: "A table whose rows are private to a session or transaction." },
    { q: "Can DataWeave chunk lists?", a: "Yes, with divideBy." },
    { q: "Is a join faster?", a: "Usually, and it scales." },
    { q: "Why not a subquery?", a: "If the IDs are in a table, a subquery or join is best." },
  ],
}

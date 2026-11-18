export default {
  id: 'inc-332',
  category: 'incidents',
  title: "A Join Between Staging and Target Fails After a New Database Is Added",
  level: 'INTERMEDIATE',
  tags: ["myproject","sql-server","collation","joins"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 03:00:00 ERROR [plan-merge] Cannot resolve the collation conflict between \"Latin1_General_CS_AS\" and \"SQL_Latin1_General_CP1_CI_AS\"", relevant: true, why: "The databases use different collations." },
      { text: "2026-11-18 03:00:00 INFO  [plan-merge] Staging now in database stage_db", relevant: true, why: "Staging moved to a new database." },
      { text: "2026-11-18 03:00:00 INFO  [dba] stage_db created with default collation", relevant: true, why: "The default differs from the main database." },
      { text: "2026-11-18 03:00:01 WARN  [plan-merge] Merge aborted", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does the join fail?",
        options: [
          "The two databases compare text with different collations",
          "The table is missing",
          "Locks",
          "Timeouts",
        ],
        answer: 0,
        explain: "Collations must match to compare text.",
      },
      {
        type: 'single',
        prompt: "What is the quick fix?",
        options: [
          "Use COLLATE in the join on the text columns",
          "Drop the join",
          "Restart SQL Server",
          "Use NOLOCK",
        ],
        answer: 0,
        explain: "Tell SQL Server which collation to use.",
      },
      {
        type: 'multi',
        prompt: "What is the lasting fix?",
        options: [
          "Create the staging database with the same collation",
          "Agree a standard collation",
          "Test cross database joins before go live",
          "Accept random collations",
        ],
        answer: [0,1,2],
        explain: "Consistency avoids the problem.",
      },
      {
        type: 'single',
        prompt: "Why can case sensitivity matter for keys?",
        options: [
          "ITM-1 and itm-1 may match in one collation and not the other",
          "It does not",
          "Only for numbers",
          "Only for dates",
        ],
        answer: 0,
        explain: "Collation changes matching rules.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Add COLLATE to the join",
          "Rerun the merge",
          "Recreate staging with the standard collation",
          "Agree a standard",
          "Add a cross database test",
        ],
        explain: "Patch, recover, fix, agree, test.",
      },
    ],
  },
  description: `
## Symptoms
- The plan merge fails after staging moved to a new database.

## Change / Context
- The DBA created a separate staging database last week.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 03:00:00 ERROR [plan-merge] Cannot resolve the collation conflict between "Latin1_General_CS_AS" and "SQL_Latin1_General_CP1_CI_AS"
2026-11-18 03:00:00 INFO  [plan-merge] Staging now in database stage_db
2026-11-18 03:00:00 INFO  [dba] stage_db created with default collation
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
    "Collation controls text comparison.",
    "Different collations block joins.",
    "COLLATE is a quick fix.",
    "Standardise collation.",
    "Case sensitivity changes matches.",
    "Test cross database queries.",
  ],
  solution: `
**Diagnosis.** Staging and target use different collations, so text comparison fails.

**Immediate mitigation.**
- COLLATE in the join.

**Root cause.** New database with a default collation.

**Permanent fix.**
- Standard collation for staging.

**Prevention.** Cross database tests.
`,
  followUps: [
    { q: "What is a collation?", a: "Rules for sorting and comparing text, including case and accents." },
    { q: "Can you change a database collation?", a: "Yes, but columns keep theirs until changed." },
    { q: "Does it affect performance?", a: "COLLATE in a join can stop index use." },
    { q: "Who decides the standard?", a: "The DBA team." },
  ],
}

export default {
  id: 'inc-332',
  category: 'incidents',
  title: "A Join Between Staging and Target Fails After a New Database Is Added",
  level: 'INTERMEDIATE',
  tags: ["myproject","sql-server","collation","joins"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-11 14:00:00 INFO  [dba] stage_db created with the server default collation SQL_Latin1_General_CP1_CI_AS", relevant: true, why: "The default differs from the main database." },
      { text: "2026-11-18 03:00:00 INFO  [plan-merge] Staging now in database stage_db, target in plan_db collation=Latin1_General_CS_AS", relevant: true, why: "Staging moved to a new database with another collation." },
      { text: "2026-11-18 03:00:00 ERROR [plan-merge] Cannot resolve the collation conflict between \"Latin1_General_CS_AS\" and \"SQL_Latin1_General_CP1_CI_AS\"", relevant: true, why: "The databases use different collations." },
      { text: "2026-11-18 03:00:01 WARN  [plan-merge] Merge aborted", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does the join fail?",
        options: [
          "The two databases compare text with different collations",
          "The staging table is missing from the new stage_db database",
          "The join needs a linked server between the two databases",
          "The merge user has no SELECT permission on stage_db",
        ],
        answer: 0,
        explain: "Collations must match to compare text. Databases on one instance can be joined without a linked server.",
      },
      {
        type: 'single',
        prompt: "What is the quick fix?",
        options: [
          "Use COLLATE in the join on the text columns",
          "Restart SQL Server so both databases share one setting",
          "Add WITH (NOLOCK) to both tables in the join",
          "Cast the text columns to VARCHAR(MAX) in the join",
        ],
        answer: 0,
        explain: "Tell SQL Server which collation to use. A cast keeps the column collation.",
      },
      {
        type: 'multi',
        prompt: "What is the lasting fix?",
        options: [
          "Create the staging database with the same collation",
          "Agree a standard collation",
          "Test cross database joins before go live",
          "Let each new database use the server default",
        ],
        answer: [0,1,2],
        explain: "Consistency avoids the problem.",
      },
      {
        type: 'single',
        prompt: "Why can case sensitivity matter for keys?",
        options: [
          "ITM-1 and itm-1 may match in one collation and not the other",
          "It does not, keys are compared as raw bytes in joins",
          "It only changes the sort order, never equality",
          "It only matters for Unicode NVARCHAR columns",
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
          "Agree a standard collation",
          "Recreate staging with the standard collation",
          "Add a cross database test",
        ],
        explain: "Patch, recover, agree, fix, test.",
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
2026-11-11 14:00:00 INFO  [dba] stage_db created with the server default collation SQL_Latin1_General_CP1_CI_AS
2026-11-18 03:00:00 INFO  [plan-merge] Staging now in database stage_db, target in plan_db collation=Latin1_General_CS_AS
2026-11-18 03:00:00 ERROR [plan-merge] Cannot resolve the collation conflict between "Latin1_General_CS_AS" and "SQL_Latin1_General_CP1_CI_AS"
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

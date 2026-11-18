export default {
  id: 'inc-278',
  category: 'incidents',
  title: "The Outbound Extract Procedure Returns Nothing to Mule",
  level: 'INTERMEDIATE',
  tags: ["myproject","oracle","stored-procedure","cursor"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 01:00:00 INFO  [out-extract] Call PKG_OUT.GET_ITEMS(:p_from, :o_cursor)", relevant: true, why: "The procedure returns a ref cursor." },
      { text: "2026-11-18 01:00:01 INFO  [out-extract] Output parameters o_cursor=null", relevant: true, why: "Mule sees no cursor." },
      { text: "2026-11-18 01:00:01 INFO  [out-extract] outputParameters declared none", relevant: true, why: "The output was not declared as a cursor." },
      { text: "2026-11-18 01:00:01 WARN  [out-extract] Exported rows=0", relevant: true, why: "Nothing exported." },
      { text: "2026-11-18 23:59:00 INFO  [out-extract] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does Mule get no rows?",
        options: [
          "The ref cursor output parameter was not declared, so Mule did not read it",
          "The table is empty",
          "The procedure failed",
          "Permissions",
        ],
        answer: 0,
        explain: "Declare it as an output of type CURSOR.",
      },
      {
        type: 'single',
        prompt: "What is the fix?",
        options: [
          "Declare o_cursor as an output parameter of type CURSOR and read it as a stream",
          "Call a SELECT instead",
          "Return a string",
          "Use a bigger pool",
        ],
        answer: 0,
        explain: "Then Mule iterates the result.",
      },
      {
        type: 'multi',
        prompt: "What else matters with ref cursors?",
        options: [
          "Stream the rows rather than loading all",
          "Close the cursor by consuming it fully",
          "Keep the connection until reading ends",
          "Store the cursor in a variable for later",
        ],
        answer: [0,1,2],
        explain: "Cursors live with the connection.",
      },
      {
        type: 'single',
        prompt: "Why was zero rows dangerous?",
        options: [
          "The export looked successful but sent nothing",
          "It was fast",
          "It saved money",
          "It is fine",
        ],
        answer: 0,
        explain: "Alert on zero row extracts.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Declare the cursor output",
          "Rerun the export",
          "Check counts",
          "Alert on zero rows",
          "Add a test that checks rows",
        ],
        explain: "Fix, recover, check, watch, test.",
      },
    ],
  },
  description: `
## Symptoms
- The outbound item file was empty.

## Change / Context
- The extract was changed from a SELECT to a stored procedure.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 01:00:00 INFO  [out-extract] Call PKG_OUT.GET_ITEMS(:p_from, :o_cursor)
2026-11-18 01:00:01 INFO  [out-extract] Output parameters o_cursor=null
2026-11-18 01:00:01 INFO  [out-extract] outputParameters declared none
2026-11-18 01:00:01 WARN  [out-extract] Exported rows=0
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
    "Declare ref cursor outputs.",
    "Read cursors as streams.",
    "Consume cursors fully.",
    "Keep the connection while reading.",
    "Alert on zero rows.",
    "Test row counts.",
  ],
  solution: `
**Diagnosis.** The ref cursor output was not declared, so Mule never read it.

**Immediate mitigation.**
- Declare and rerun.

**Root cause.** Change to a procedure without updating the call.

**Permanent fix.**
- Declare the CURSOR output.

**Prevention.** Zero row alerts and tests.
`,
  followUps: [
    { q: "Why a procedure?", a: "To keep extract logic in the database." },
    { q: "Can it return two cursors?", a: "Yes, declare both." },
    { q: "What happens to memory?", a: "Streaming keeps it flat." },
    { q: "How do you test?", a: "Assert a known row count in a test schema." },
  ],
}

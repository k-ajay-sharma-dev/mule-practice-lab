export default {
  id: 'inc-267',
  category: 'incidents',
  title: "The Same Stored Procedure Is Fast for Most Stores and Very Slow for One",
  level: 'INTERMEDIATE',
  tags: ["myproject","sql-server","parameter-sniffing","performance"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 09:00:00 INFO  [stock-api] exec usp_get_stock store=S001 durationMs=40", relevant: true, why: "Small store, fast." },
      { text: "2026-11-18 09:00:05 INFO  [stock-api] exec usp_get_stock store=DC01 durationMs=48000", relevant: true, why: "Distribution centre, very slow." },
      { text: "2026-11-18 09:00:05 INFO  [dba] Cached plan built for store=S001 uses nested loops", relevant: true, why: "The cached plan fits small stores." },
      { text: "2026-11-18 09:00:05 INFO  [dba] DC01 has 1,800,000 rows, S001 has 4,000", relevant: true, why: "Data is very uneven." },
      { text: "2026-11-18 23:59:00 INFO  [stock-api] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why is DC01 slow?",
        options: [
          "The cached plan was built for a small store and is poor for DC01",
          "The 06:00 patch dropped the index the procedure relies on",
          "DC01 rows are locked by a stock count running at 09:00",
          "The API sends DC01 as text, so SQL Server scans the table",
        ],
        answer: 0,
        explain: "This is parameter sniffing.",
      },
      {
        type: 'single',
        prompt: "What can the DBA try?",
        options: [
          "OPTION (RECOMPILE), or OPTIMIZE FOR a plan that suits both",
          "Restart SQL Server each morning to clear the plan cache",
          "Add WITH (NOLOCK) to the stock query in the procedure",
          "Rebuild all indexes on the stock table every night",
        ],
        answer: 0,
        explain: "Fit the plan to the parameter.",
      },
      {
        type: 'multi',
        prompt: "What can the integration do?",
        options: [
          "A separate procedure for distribution centres",
          "Page results for very large stores",
          "Raise the timeout only for DC calls",
          "Retry each DC call three times in a row",
        ],
        answer: [0,1,2],
        explain: "Treat big and small differently.",
      },
      {
        type: 'single',
        prompt: "Why did it work yesterday?",
        options: [
          "Yesterday’s cached plan suited large stores",
          "DC01 had far fewer rows yesterday",
          "Yesterday the API cached DC01 stock",
          "The patch changed the procedure code",
        ],
        answer: 0,
        explain: "The first call after a restart or recompile decides the plan. Today that was S001.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Ask the DBA to clear the plan as a stopgap",
          "Agree a lasting plan fix",
          "Page large results",
          "Test both store types",
          "Watch duration per store type",
        ],
        explain: "Stopgap, fix, adjust, test, watch.",
      },
    ],
  },
  description: `
## Symptoms
- Stock lookups for the distribution centre take 48 seconds.

## Change / Context
- All calls use the same stored procedure.
- DC01 lookups were fast yesterday. SQL Server was patched and restarted at 06:00 today, which cleared the plan cache.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 09:00:00 INFO  [stock-api] exec usp_get_stock store=S001 durationMs=40
2026-11-18 09:00:05 INFO  [stock-api] exec usp_get_stock store=DC01 durationMs=48000
2026-11-18 09:00:05 INFO  [dba] Cached plan built for store=S001 uses nested loops
2026-11-18 09:00:05 INFO  [dba] DC01 has 1,800,000 rows, S001 has 4,000
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
    "SQL Server caches a plan per procedure.",
    "The first parameter shapes the plan.",
    "Uneven data causes poor plans.",
    "RECOMPILE or OPTIMIZE FOR can help.",
    "Integration can separate large cases.",
    "Watch duration per type.",
  ],
  solution: `
**Diagnosis.** Parameter sniffing gave a plan suited to small stores.

**Immediate mitigation.**
- Clear the plan.

**Root cause.** Very uneven data with one cached plan.

**Permanent fix.**
- Plan hints or separate procedures.

**Prevention.** Test small and large parameters.
`,
  followUps: [
    { q: "What is parameter sniffing?", a: "SQL Server builds a plan using the first parameter values it sees." },
    { q: "Is RECOMPILE free?", a: "No, it costs CPU on each call." },
    { q: "How do you prove it?", a: "Compare actual plans for both stores." },
    { q: "Can Mule fix it?", a: "Mule can only call differently. The plan fix is in the database." },
  ],
}

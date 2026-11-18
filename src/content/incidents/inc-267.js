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
          "The cached plan was built for a small store and is poor for a huge one",
          "DC01 is offline",
          "The index is missing",
          "The API is broken",
        ],
        answer: 0,
        explain: "This is parameter sniffing.",
      },
      {
        type: 'single',
        prompt: "What can the DBA try?",
        options: [
          "OPTION (RECOMPILE) or a plan that suits both, such as OPTIMIZE FOR",
          "Delete DC01",
          "Restart SQL Server daily",
          "Add NOLOCK",
        ],
        answer: 0,
        explain: "Fit the plan to the parameter.",
      },
      {
        type: 'multi',
        prompt: "What can the integration do?",
        options: [
          "Use a separate procedure for distribution centres",
          "Page results for very large stores",
          "Raise the timeout only for DC calls",
          "Call it in a loop",
        ],
        answer: [0,1,2],
        explain: "Treat big and small differently.",
      },
      {
        type: 'single',
        prompt: "Why did it work yesterday?",
        options: [
          "Yesterday the plan was built for DC01 first",
          "Data changed",
          "The network was faster",
          "Luck",
        ],
        answer: 0,
        explain: "The first call after a recompile decides the plan.",
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

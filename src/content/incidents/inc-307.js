export default {
  id: 'inc-307',
  category: 'incidents',
  title: "Records Skip a Batch Step Silently Because of an Accept Expression",
  level: 'ADVANCED',
  tags: ["myproject","batch","accept-expression","filtering"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 02:00:00 INFO  [cust-batch] Step enrich acceptExpression=#[payload.country == \"UK\"]", relevant: true, why: "Only UK records enter the step." },
      { text: "2026-11-18 02:00:00 INFO  [cust-batch] Source now sends country code GB", relevant: true, why: "The source changed codes." },
      { text: "2026-11-18 02:10:00 INFO  [cust-batch] On Complete successful=40000 failed=0", relevant: true, why: "All successful." },
      { text: "2026-11-18 08:00:00 WARN  [crm] 40000 customers not enriched", relevant: true, why: "None were enriched." },
      { text: "2026-11-18 23:59:00 INFO  [cust-batch] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why were no records enriched?",
        options: [
          "The accept expression no longer matches, so every record skipped the step and still counted as successful",
          "Enrichment failed",
          "CRM failed",
          "The job did not run",
        ],
        answer: 0,
        explain: "Skipping is not failure.",
      },
      {
        type: 'single',
        prompt: "What protects against this?",
        options: [
          "Count records entering each step and alert when a step processes none",
          "Remove accept expressions",
          "Trust On Complete",
          "Add more steps",
        ],
        answer: 0,
        explain: "Watch per step.",
      },
      {
        type: 'multi',
        prompt: "What else helps?",
        options: [
          "Use a lookup of valid codes, not a hard coded value",
          "Validate the source code list",
          "Log a count per step",
          "Ignore changes",
        ],
        answer: [0,1,2],
        explain: "Make filters explicit and checked.",
      },
      {
        type: 'single',
        prompt: "What does a skipped step do to the record?",
        options: [
          "Nothing, the record continues to the next step",
          "Fails it",
          "Deletes it",
          "Retries",
        ],
        answer: 0,
        explain: "Silent by design.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Fix the expression",
          "Rerun enrichment",
          "Add per step counts",
          "Use a code lookup",
          "Talk to the source team",
        ],
        explain: "Fix, recover, watch, harden, align.",
      },
    ],
  },
  description: `
## Symptoms
- No customers were enriched last night, but the job shows success.

## Change / Context
- The source started sending ISO country codes.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 02:00:00 INFO  [cust-batch] Step enrich acceptExpression=#[payload.country == "UK"]
2026-11-18 02:00:00 INFO  [cust-batch] Source now sends country code GB
2026-11-18 02:10:00 INFO  [cust-batch] On Complete successful=40000 failed=0
2026-11-18 08:00:00 WARN  [crm] 40000 customers not enriched
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
    "Accept expressions skip records silently.",
    "Skipped records still succeed.",
    "Count records per step.",
    "Avoid hard coded values.",
    "Validate source codes.",
    "Align with source teams.",
  ],
  solution: `
**Diagnosis.** The accept expression checks UK. The source now sends GB.

**Immediate mitigation.**
- Fix and rerun.

**Root cause.** Hard coded filter.

**Permanent fix.**
- Code lookup and per step counts.

**Prevention.** Alerts when a step processes nothing.
`,
  followUps: [
    { q: "How do you count per step?", a: "Increment a counter or log in the step and summarise." },
    { q: "Is acceptPolicy different?", a: "It filters by success or failure. acceptExpression filters by content." },
    { q: "Can a step write to a variable?", a: "Record variables exist per record." },
    { q: "How do you test?", a: "Use real codes from the source." },
  ],
}

export default {
  id: 'inc-338',
  category: 'incidents',
  title: "A Value Set in One Batch Step Is Missing in the Next",
  level: 'INTERMEDIATE',
  tags: ["myproject","batch","record-variables"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 02:00:00 INFO  [price-batch] Step lookup set vars.costCenter for record", relevant: true, why: "A value is set in step 1." },
      { text: "2026-11-18 02:00:00 ERROR [price-batch] Step write failed: costCenter is null", relevant: true, why: "Step 2 cannot see it." },
      { text: "2026-11-18 02:00:00 INFO  [price-batch] Lookup step returns payload unchanged", relevant: true, why: "The value is not on the record." },
      { text: "2026-11-18 02:10:00 INFO  [price-batch] On Complete failed=48000", relevant: true, why: "Every record fails." },
      { text: "2026-11-18 23:59:00 INFO  [price-batch] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why is costCenter null?",
        options: [
          "The variable was not kept with the record between steps in this setup",
          "The lookup failed",
          "The database is down",
          "A typo in the table",
        ],
        answer: 0,
        explain: "Data a later step needs should travel with the record.",
      },
      {
        type: 'single',
        prompt: "What is a reliable fix?",
        options: [
          "Put costCenter on the record payload, or use a record variable as your runtime supports",
          "Use a global variable",
          "Run steps in one big step",
          "Disable batch",
        ],
        answer: 0,
        explain: "Keep per record data with the record.",
      },
      {
        type: 'multi',
        prompt: "What else is true of batch steps?",
        options: [
          "Records move between steps through queues",
          "Each record is processed on its own",
          "Flow variables set before the job may not behave like normal flow vars inside steps",
          "All records share one payload",
        ],
        answer: [0,1,2],
        explain: "Batch is not a normal flow.",
      },
      {
        type: 'single',
        prompt: "How do you prove the fix?",
        options: [
          "Test a few records through both steps",
          "Trust it",
          "Deploy and wait",
          "Read logs only",
        ],
        answer: 0,
        explain: "Small test first.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Move costCenter onto the record",
          "Test with a few records",
          "Rerun the job",
          "Check counts",
          "Document how data moves between steps",
        ],
        explain: "Fix, test, rerun, check, document.",
      },
    ],
  },
  description: `
## Symptoms
- All 48,000 price records fail in the second batch step.

## Change / Context
- A new lookup step was added before the write step.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 02:00:00 INFO  [price-batch] Step lookup set vars.costCenter for record
2026-11-18 02:00:00 ERROR [price-batch] Step write failed: costCenter is null
2026-11-18 02:00:00 INFO  [price-batch] Lookup step returns payload unchanged
2026-11-18 02:10:00 INFO  [price-batch] On Complete failed=48000
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
    "Batch records move through queues.",
    "Keep per record data with the record.",
    "Record variables exist for this.",
    "Test with a few records.",
    "Batch differs from normal flows.",
    "Check counts after rerun.",
  ],
  solution: `
**Diagnosis.** The lookup result was not carried with each record to the next step.

**Immediate mitigation.**
- Put the value on the record and rerun.

**Root cause.** Assumed flow variable behaviour inside batch.

**Permanent fix.**
- Record payload field or record variable.

**Prevention.** Small tests for new steps.
`,
  followUps: [
    { q: "What is a record variable?", a: "A variable tied to one batch record that follows it through steps." },
    { q: "Can On Complete see record variables?", a: "Generally no. It sees the job result." },
    { q: "Why queues between steps?", a: "So records can be processed in parallel and survive restarts." },
    { q: "Is enriching the payload fine?", a: "Yes, if downstream steps ignore the extra field." },
  ],
}

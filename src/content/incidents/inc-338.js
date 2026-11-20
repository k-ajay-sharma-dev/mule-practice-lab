export default {
  id: 'inc-338',
  category: 'incidents',
  title: "A Value Set in One Batch Step Is Missing in the Next",
  level: 'INTERMEDIATE',
  tags: ["myproject","batch","record-variables"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 02:00:00 INFO  [price-batch] Job started records=48000", relevant: false },
      { text: "2026-11-18 02:00:01 INFO  [price-batch] Step lookup: Async scope set vars.costCenter=CC-410 record=1", relevant: true, why: "The value is set inside an Async scope." },
      { text: "2026-11-18 02:00:01 INFO  [price-batch] Step lookup returns payload unchanged record=1", relevant: true, why: "The value is not on the record payload either." },
      { text: "2026-11-18 02:00:01 ERROR [price-batch] Step write failed record=1: costCenter is null", relevant: true, why: "The write step cannot see it." },
      { text: "2026-11-18 02:10:00 INFO  [price-batch] On Complete failed=48000", relevant: true, why: "Every record fails." },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why is costCenter null?",
        options: [
          "It is set inside an Async scope, so the record never gets it",
          "Batch steps never share variables, so each step starts empty",
          "The lookup query returned no row for any of the records",
          "The write step runs before the lookup step finishes a record",
        ],
        answer: 0,
        explain: "Async works on a copy of the event, so variables it sets do not come back. In Mule 4 batch, a variable set in a step stays with that record.",
      },
      {
        type: 'single',
        prompt: "What is a reliable fix?",
        options: [
          "Run the lookup without Async so the value stays with the record",
          "Set costCenter in On Complete so every step can read it",
          "Add the same Async scope around the write step as well",
          "Raise the block size so the Async scope finishes first",
        ],
        answer: 0,
        explain: "Keep per record data with the record, as a variable or a payload field.",
      },
      {
        type: 'multi',
        prompt: "What is true of Mule 4 batch steps?",
        options: [
          "Records move between steps through queues",
          "Variables set in a step stay with that record",
          "Each record is processed on its own",
          "All records in a block share one payload",
        ],
        answer: [0,1,2],
        explain: "Batch is not a normal flow.",
      },
      {
        type: 'single',
        prompt: "How do you prove the fix?",
        options: [
          "Run a few records through both steps in a test",
          "Deploy to production and watch the next night",
          "Check that the app starts without errors",
          "Read the changed code and trust the review",
        ],
        answer: 0,
        explain: "Small test first.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Remove the Async scope from the lookup",
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
- To save time, its database lookup and Set Variable run inside an Async scope.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 02:00:01 INFO  [price-batch] Step lookup: Async scope set vars.costCenter=CC-410 record=1
2026-11-18 02:00:01 INFO  [price-batch] Step lookup returns payload unchanged record=1
2026-11-18 02:00:01 ERROR [price-batch] Step write failed record=1: costCenter is null
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
    "Async scopes do not return variables.",
    "Test with a few records.",
    "Batch differs from normal flows.",
    "Check counts after rerun.",
  ],
  solution: `
**Diagnosis.** The lookup set costCenter inside an Async scope, so the value never reached the record.

**Immediate mitigation.**
- Remove the Async scope, test a few records and rerun.

**Root cause.** Async was used to save time without knowing it works on a copy of the event.

**Permanent fix.**
- Set the value in the step itself, as a record variable or a payload field.

**Prevention.** Small tests for new steps.
`,
  followUps: [
    { q: "What is a record variable?", a: "In Mule 4 batch, a variable set in a step is tied to that record and follows it through later steps." },
    { q: "Why does Async lose the variable?", a: "Async runs on a copy of the event. Changes it makes are not passed back." },
    { q: "Can On Complete see record variables?", a: "Generally no. It sees the job result." },
    { q: "Why queues between steps?", a: "So records can be processed in parallel and survive restarts." },
    { q: "Is enriching the payload fine?", a: "Yes, if downstream steps ignore the extra field." },
  ],
}

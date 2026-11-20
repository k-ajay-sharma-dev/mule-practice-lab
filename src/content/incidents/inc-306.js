export default {
  id: 'inc-306',
  category: 'incidents',
  title: "A Batch Job Reading a 3 GB Plan File Loads It All Before Starting",
  level: 'ADVANCED',
  tags: ["myproject","batch","planning-platform","large-files","streaming"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 05:00:00 INFO  [plan-batch] File read sizeBytes=3221225472", relevant: true, why: "A huge file." },
      { text: "2026-11-18 05:00:00 INFO  [plan-batch] Transform payload map to records before batch", relevant: true, why: "A transform builds the full array first." },
      { text: "2026-11-18 05:04:00 ERROR [plan-batch] OutOfMemoryError: Java heap space", relevant: true, why: "Memory runs out." },
      { text: "2026-11-18 05:04:01 INFO  [plan-batch] Batch job never started", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does the job never start?",
        options: [
          "A transform before the batch builds the whole array in memory",
          "The plan file is corrupt and the reader cannot parse it",
          "The batch engine refuses input files larger than 2 GB",
          "The worker disk is too small to hold the 3 GB file",
        ],
        answer: 0,
        explain: "The batch could stream, but the transform cannot.",
      },
      {
        type: 'single',
        prompt: "What is the fix?",
        options: [
          "Feed the stream to batch and transform each record in a step",
          "Move to a worker with twice the heap and keep the flow",
          "Ask the platform team to split the file by hand each day",
          "Run the transform twice, once per half of the payload",
        ],
        answer: 0,
        explain: "Let batch read records as a stream.",
      },
      {
        type: 'multi',
        prompt: "What supports streaming here?",
        options: [
          "A streaming reader such as CSV with streaming enabled",
          "Deferred DataWeave where possible",
          "Per record transforms",
          "sizeOf(payload) before batch",
        ],
        answer: [0,1,2],
        explain: "sizeOf forces a full read.",
      },
      {
        type: 'single',
        prompt: "Why does batch help with big files?",
        options: [
          "It queues records and works in blocks, so memory stays flat",
          "It compresses each record before it is held in memory",
          "It runs faster than a flow for every file size",
          "It skips records that do not fit in the heap",
        ],
        answer: 0,
        explain: "If fed a stream.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Move the transform into a step",
          "Enable streaming on the reader",
          "Test with the full file",
          "Process today’s plans",
          "Alert on file size",
        ],
        explain: "Fix, stream, test, recover, watch.",
      },
    ],
  },
  description: `
## Symptoms
- Plans did not load. The worker crashed.

## Change / Context
- Plan files from the planning platform grew from 300 MB to 3 GB.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 05:00:00 INFO  [plan-batch] File read sizeBytes=3221225472
2026-11-18 05:00:00 INFO  [plan-batch] Transform payload map to records before batch
2026-11-18 05:04:00 ERROR [plan-batch] OutOfMemoryError: Java heap space
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
    "A full transform before batch defeats streaming.",
    "Transform per record in steps.",
    "Use streaming readers.",
    "Avoid functions that read everything.",
    "Test with real sizes.",
    "Alert on growth.",
  ],
  solution: `
**Diagnosis.** The transform before the batch loads 3 GB into memory.

**Immediate mitigation.**
- Move the transform and rerun.

**Root cause.** Design assumed small files.

**Permanent fix.**
- Stream into batch, transform per record.

**Prevention.** Size tests and alerts.
`,
  followUps: [
    { q: "How do you enable streaming in DataWeave readers?", a: "With a streaming reader property for formats that support it." },
    { q: "Can every format stream?", a: "Not every format or every expression. Check the docs." },
    { q: "What about the target?", a: "Write in groups with an aggregator." },
    { q: "Why did it work before?", a: "The file was ten times smaller." },
  ],
}

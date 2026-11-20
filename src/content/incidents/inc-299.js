export default {
  id: 'inc-299',
  category: 'incidents',
  title: "A Batch Job With Large Records Runs Out of Memory",
  level: 'BEGINNER',
  tags: ["myproject","batch","block-size","memory"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-18 03:00:00 INFO  [doc-batch] Records=20000 averageSizeKB=900", relevant: true, why: "Big records." },
      { text: "2026-11-18 03:00:00 INFO  [doc-batch] blockSize=1000 maxConcurrency=8", relevant: true, why: "Large blocks and many threads." },
      { text: "2026-11-18 03:02:00 ERROR [doc-batch] java.lang.OutOfMemoryError: Java heap space", relevant: true, why: "Memory runs out." },
      { text: "2026-11-18 03:02:01 INFO  [runtime] Worker restarted", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does memory run out?",
        options: [
          "Block size times concurrency times record size is far above the heap",
          "The database driver leaks a connection per record",
          "The log files fill the heap with debug output",
          "The scheduler starts a second run before the first ends",
        ],
        answer: 0,
        explain: "1000 x 8 x 900 KB is several GB.",
      },
      {
        type: 'single',
        prompt: "What is the fix?",
        options: [
          "Lower block size for large records, and limit concurrency",
          "Raise block size to 5000 so fewer blocks are loaded",
          "Raise maxConcurrency to 16 to finish blocks sooner",
          "Split the job into two jobs with the same settings",
        ],
        answer: 0,
        explain: "Fit the work to the memory.",
      },
      {
        type: 'multi',
        prompt: "What else helps?",
        options: [
          "Keep only the fields you need in each record",
          "Store large documents elsewhere and pass references",
          "Test with real record sizes",
          "Raise block size so fewer blocks are queued",
        ],
        answer: [0,1,2],
        explain: "Smaller records, sized blocks.",
      },
      {
        type: 'single',
        prompt: "What is the default block size?",
        options: [
          "100",
          "1",
          "1000",
          "10000",
        ],
        answer: 0,
        explain: "The default is 100 records per block.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Lower block size and concurrency",
          "Rerun",
          "Trim record content",
          "Load test",
          "Watch heap use",
        ],
        explain: "Fix, recover, trim, test, watch.",
      },
    ],
  },
  description: `
## Symptoms
- The document batch crashes every night.

## Change / Context
- Block size was raised to 1000 for speed.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 03:00:00 INFO  [doc-batch] Records=20000 averageSizeKB=900
2026-11-18 03:00:00 INFO  [doc-batch] blockSize=1000 maxConcurrency=8
2026-11-18 03:02:00 ERROR [doc-batch] java.lang.OutOfMemoryError: Java heap space
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
    "Memory need is block size times concurrency times record size.",
    "Default block size is 100.",
    "Lower blocks for big records.",
    "Trim records.",
    "Use references for big content.",
    "Test with real sizes.",
  ],
  solution: `
**Diagnosis.** Too many large records in memory at once.

**Immediate mitigation.**
- Lower block size and rerun.

**Root cause.** Block size raised without considering record size.

**Permanent fix.**
- Size blocks and concurrency to memory.

**Prevention.** Load tests and heap alerts.
`,
  followUps: [
    { q: "Why are blocks in memory?", a: "Each thread works on a block of records at once." },
    { q: "Where are queued records kept?", a: "In persistent queues on disk, in a typical setup." },
    { q: "What is maxConcurrency?", a: "How many blocks run in parallel." },
    { q: "How do you measure record size?", a: "Sample real data." },
  ],
}

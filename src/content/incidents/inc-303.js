export default {
  id: 'inc-303',
  category: 'incidents',
  title: "Raising Batch Concurrency Makes the Job Slower",
  level: 'INTERMEDIATE',
  tags: ["myproject","batch","concurrency","deadlock"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 01:00:00 INFO  [price-batch] maxConcurrency=16 (was 4)", relevant: true, why: "More threads." },
      { text: "2026-11-18 01:30:00 WARN  [price-batch] Deadlocks=320 retries=300 failures=20", relevant: true, why: "Threads fight over rows." },
      { text: "2026-11-18 01:30:00 INFO  [dba] Database CPU 98 percent", relevant: true, why: "The database is the bottleneck." },
      { text: "2026-11-18 02:40:00 INFO  [price-batch] Finished durationMs=6000000 (was 2400000)", relevant: true, why: "Slower than before." },
      { text: "2026-11-18 23:59:00 INFO  [price-batch] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why is it slower?",
        options: [
          "The database cannot handle 16 parallel writers, so deadlocks and CPU limits slow everything",
          "Mule is slow",
          "The network",
          "The file",
        ],
        answer: 0,
        explain: "The target is the bottleneck.",
      },
      {
        type: 'single',
        prompt: "What should you do?",
        options: [
          "Go back to a concurrency the database handles, then tune with measurements",
          "Raise to 32",
          "Remove retries",
          "Use NOLOCK",
        ],
        answer: 0,
        explain: "Measure, do not guess.",
      },
      {
        type: 'multi',
        prompt: "What can improve throughput?",
        options: [
          "Bulk writes instead of single rows",
          "Ordering records by key to reduce lock conflicts",
          "Agreeing limits with the DBA",
          "More threads alone",
        ],
        answer: [0,1,2],
        explain: "Fewer, better writes.",
      },
      {
        type: 'single',
        prompt: "What is the lesson?",
        options: [
          "More parallel work helps only until the slowest system is full",
          "More is always better",
          "Concurrency does nothing",
          "Batch is broken",
        ],
        answer: 0,
        explain: "Find the bottleneck.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Set concurrency back to 4",
          "Rerun failures",
          "Use bulk writes",
          "Load test settings",
          "Agree limits with the DBA",
        ],
        explain: "Restore, recover, improve, test, agree.",
      },
    ],
  },
  description: `
## Symptoms
- The price job takes 100 minutes instead of 40.

## Change / Context
- Concurrency was raised to speed it up.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 01:00:00 INFO  [price-batch] maxConcurrency=16 (was 4)
2026-11-18 01:30:00 WARN  [price-batch] Deadlocks=320 retries=300 failures=20
2026-11-18 01:30:00 INFO  [dba] Database CPU 98 percent
2026-11-18 02:40:00 INFO  [price-batch] Finished durationMs=6000000 (was 2400000)
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
    "Throughput is limited by the slowest system.",
    "Too many writers cause deadlocks.",
    "Bulk writes help.",
    "Order by key.",
    "Measure settings.",
    "Agree limits.",
  ],
  solution: `
**Diagnosis.** The database is saturated and deadlocking with 16 writers.

**Immediate mitigation.**
- Return to 4.

**Root cause.** Concurrency raised without measuring the target.

**Permanent fix.**
- Bulk writes and ordered keys.

**Prevention.** Load tests.
`,
  followUps: [
    { q: "How do you find the bottleneck?", a: "Watch CPU, waits and locks on each system." },
    { q: "What is a good concurrency?", a: "The value that gives the best measured time." },
    { q: "Does block size matter?", a: "Yes, with aggregator size and target limits." },
    { q: "Who owns database limits?", a: "The DBA." },
  ],
}
